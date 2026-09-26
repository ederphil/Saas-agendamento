import { z } from "zod";
import type { BookingExtension } from "../../core/vertical.ts";
import { ensure } from "../../core/errors.ts";
const extension = z.object({ petId: z.uuid() });
export const petBookingExtension: BookingExtension = {
  async validate(tx, tenant, customer, data) {
    const { petId } = extension.parse(data);
    const pet = (
      await tx.query(
        "SELECT id FROM pet_pet WHERE id=$1 AND tenant_id=$2 AND customer_id=$3",
        [petId, tenant, customer],
      )
    ).rows[0];
    ensure(pet, 404, "Pet não encontrado para este tutor.");
  },
  async save(tx, tenant, booking, data) {
    const { petId } = extension.parse(data);
    await tx.query(
      "INSERT INTO pet_booking(tenant_id,booking_id,pet_id) VALUES($1,$2,$3)",
      [tenant, booking, petId],
    );
  },
};
