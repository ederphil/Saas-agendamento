import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { z } from "zod";
import type { Database, Queryable } from "../db/index.ts";
import type { VerticalRegistry } from "./vertical.ts";
import { ensure } from "./errors.ts";
import { audit } from "./auth.ts";
export const bookingInput = z
  .object({
    customerId: z.uuid(),
    resourceId: z.uuid(),
    serviceId: z.uuid(),
    startsAt: z.iso.datetime({ offset: true }),
    notes: z.string().trim().max(500).default(""),
    extension: z.unknown().optional(),
  })
  .strict();
export type BookingInput = z.infer<typeof bookingInput>;
export type Actor = {
  tenant_id: string;
  user_id: string;
  vertical_id: string;
  timezone: string;
};
export async function checkSlot(
  tx: Queryable,
  tenant: string,
  resourceId: string,
  startsAt: string,
  endsAt: string,
  zone: string,
  excludeId?: string,
) {
  const resource = (
    await tx.query(
      "SELECT * FROM core_resource WHERE id=$1 AND tenant_id=$2 FOR UPDATE",
      [resourceId, tenant],
    )
  ).rows[0];
  ensure(resource, 404, "Profissional não encontrado.");
  const start = DateTime.fromISO(startsAt).setZone(zone),
    end = DateTime.fromISO(endsAt).setZone(zone);
  ensure(
    start.isValid && end.isValid && end > start,
    400,
    "Informe um intervalo de horário válido.",
  );
  const opening = DateTime.fromISO(`${start.toISODate()}T${resource.opens}`, {
      zone,
    }),
    closing = DateTime.fromISO(`${start.toISODate()}T${resource.closes}`, {
      zone,
    });
  ensure(
    start.toISODate() === end.toISODate() &&
      resource.days.includes(start.weekday) &&
      start >= opening &&
      end <= closing,
    409,
    "Horário fora da disponibilidade do profissional.",
  );
  const collisions = await tx.query(
    `SELECT id FROM core_booking WHERE tenant_id=$1 AND resource_id=$2 AND status<>'cancelled' AND starts_at<$4 AND ends_at>$3 AND ($5::uuid IS NULL OR id<>$5)`,
    [tenant, resourceId, startsAt, endsAt, excludeId ?? null],
  );
  ensure(
    !collisions.rows.length,
    409,
    "Este horário já está ocupado. Escolha outro horário.",
  );
  const blocks = await tx.query(
    "SELECT id FROM core_time_block WHERE tenant_id=$1 AND resource_id=$2 AND starts_at<$4 AND ends_at>$3",
    [tenant, resourceId, startsAt, endsAt],
  );
  ensure(!blocks.rows.length, 409, "Este horário está bloqueado.");
}
export async function createBooking(
  db: Database,
  actor: Actor,
  input: BookingInput,
  modules: VerticalRegistry,
) {
  return db.transaction(async (tx) => {
    const service = (
      await tx.query(
        "SELECT * FROM core_service WHERE tenant_id=$1 AND id=$2",
        [actor.tenant_id, input.serviceId],
      )
    ).rows[0];
    ensure(service, 404, "Serviço não encontrado.");
    ensure(
      (
        await tx.query(
          "SELECT id FROM core_customer WHERE tenant_id=$1 AND id=$2",
          [actor.tenant_id, input.customerId],
        )
      ).rows.length,
      404,
      "Cliente não encontrado.",
    );
    const module = modules[actor.vertical_id];
    if (module)
      await module.validate(
        tx,
        actor.tenant_id,
        input.customerId,
        input.extension,
      );
    else
      ensure(
        input.extension == null,
        400,
        "Este produto não aceita dados de outro segmento.",
      );
    const start = DateTime.fromISO(input.startsAt),
      end = start.plus({ minutes: service.duration_minutes });
    ensure(
      start.toMillis() >= Date.now() - 60_000,
      400,
      "Escolha um horário futuro.",
    );
    await checkSlot(
      tx,
      actor.tenant_id,
      input.resourceId,
      start.toISO()!,
      end.toISO()!,
      actor.timezone,
    );
    const id = randomUUID();
    await tx.query(
      `INSERT INTO core_booking(id,tenant_id,customer_id,resource_id,service_id,starts_at,ends_at,price_cents,status,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'confirmed',$9)`,
      [
        id,
        actor.tenant_id,
        input.customerId,
        input.resourceId,
        input.serviceId,
        start.toISO(),
        end.toISO(),
        service.price_cents,
        input.notes,
      ],
    );
    if (module) await module.save(tx, actor.tenant_id, id, input.extension);
    await audit(tx, actor.tenant_id, actor.user_id, id, "booking.created");
    return { id };
  });
}
export async function moveBooking(
  db: Database,
  actor: Actor,
  id: string,
  startsAt: string,
) {
  return db.transaction(async (tx) => {
    const booking = (
      await tx.query(
        "SELECT * FROM core_booking WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
        [actor.tenant_id, id],
      )
    ).rows[0];
    ensure(booking, 404, "Agendamento não encontrado.");
    ensure(
      booking.status === "confirmed",
      409,
      "Somente agendamentos confirmados podem ser remarcados.",
    );
    const start = DateTime.fromISO(startsAt);
    ensure(
      start.isValid && start.toMillis() >= Date.now() - 60_000,
      400,
      "Escolha um horário futuro.",
    );
    const duration = +new Date(booking.ends_at) - +new Date(booking.starts_at);
    const end = start.plus({ milliseconds: duration });
    await checkSlot(
      tx,
      actor.tenant_id,
      booking.resource_id,
      start.toISO()!,
      end.toISO()!,
      actor.timezone,
      id,
    );
    await tx.query(
      "UPDATE core_booking SET starts_at=$3,ends_at=$4 WHERE tenant_id=$1 AND id=$2",
      [actor.tenant_id, id, start.toISO(), end.toISO()],
    );
    await audit(tx, actor.tenant_id, actor.user_id, id, "booking.rescheduled");
    return { id };
  });
}
