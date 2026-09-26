import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { DateTime } from "luxon";
import type { Database } from "./db/index.ts";
import { brandById } from "./core/catalog.ts";
import { AppError, ensure } from "./core/errors.ts";
import {
  hashPassword,
  verifyPassword,
  createSession,
  digest,
  audit,
} from "./core/auth.ts";
import {
  bookingInput,
  createBooking,
  moveBooking,
  checkSlot,
  type Actor,
} from "./core/booking.ts";
import { petBookingExtension } from "./modules/pet/index.ts";
const name = z
  .string()
  .trim()
  .min(2, "Informe pelo menos dois caracteres.")
  .max(120);
const email = z
  .email()
  .max(200)
  .transform((v) => v.toLowerCase());
const password = z.string().min(10).max(128);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const uuid = z.uuid();
type Session = Actor & {
  brand_id: string;
  tenant_name: string;
  name: string;
  email: string;
  role: string;
  csrf_token: string;
};
type AuthRequest = FastifyRequest & { account?: Session };
export async function buildApp(
  db: Database,
  options: {
    production?: boolean;
    origin?: string;
    brandHosts?: Record<string, string>;
    logger?: boolean;
  } = {},
) {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 32_768,
    trustProxy: false,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
  });
  const production = options.production ?? false;
  const origins = new Set(
    (options.origin ?? "http://localhost:5173").split(",").map((s) => s.trim()),
  );
  const modules = { pet: petBookingExtension };
  const dummyHash = await hashPassword(randomUUID());
  const cookieOpts = {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: production,
    path: "/",
    maxAge: 7 * 86400,
  };
  app.addHook("onSend", async (_request, reply, payload) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("X-Frame-Options", "DENY")
      .header("Referrer-Policy", "same-origin");
    if (production)
      reply.header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
    return payload;
  });
  app.addHook("preHandler", async (request: AuthRequest, reply) => {
    if (!request.url.startsWith("/api/")) return;
    reply.header("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method))
      ensure(
        typeof request.headers.origin === "string" &&
          origins.has(request.headers.origin),
        403,
        "Origem da solicitação não permitida.",
      );
    const params = request.params as { brand?: string };
    if (!params.brand) return;
    const brand = brandById(params.brand);
    ensure(brand, 404, "Produto não encontrado.");
    if (options.brandHosts && Object.keys(options.brandHosts).length)
      ensure(
        options.brandHosts[request.hostname] === brand.id,
        404,
        "Produto indisponível neste domínio.",
      );
    const active = (
      await db.query("SELECT id FROM core_brand WHERE id=$1 AND enabled=true", [
        brand.id,
      ])
    ).rows.length;
    ensure(active, 404, "Produto indisponível.");
    if (
      request.routeOptions.url?.endsWith("/brand") ||
      request.routeOptions.url?.endsWith("/auth/register") ||
      request.routeOptions.url?.endsWith("/auth/login")
    )
      return;
    const token = request.cookies.session;
    ensure(token, 401, "Entre na sua conta para continuar.");
    const session = (
      await db.query<Session>(
        `SELECT s.tenant_id,s.user_id,s.csrf_token,u.name,u.email,u.role,t.name AS tenant_name,t.timezone,t.brand_id,b.vertical_id FROM core_session s JOIN core_user u ON u.id=s.user_id AND u.tenant_id=s.tenant_id JOIN core_tenant t ON t.id=s.tenant_id JOIN core_brand b ON b.id=t.brand_id WHERE s.token_hash=$1 AND s.expires_at>now() AND t.brand_id=$2`,
        [digest(token), brand.id],
      )
    ).rows[0];
    ensure(session, 401, "Sua sessão expirou. Entre novamente.");
    request.account = session;
    if (!["GET", "HEAD"].includes(request.method))
      ensure(
        request.headers["x-csrf-token"] === session.csrf_token,
        403,
        "Atualize a página e tente novamente.",
      );
    if (
      ["POST", "PATCH", "DELETE", "PUT"].includes(request.method) &&
      /\/(services|resources)/.test(request.url)
    )
      ensure(
        session.role === "admin",
        403,
        "Somente o administrador pode alterar esta configuração.",
      );
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError)
      return reply.status(400).send({
        error: "Confira os campos informados.",
        fields: error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    if (error instanceof AppError)
      return reply.status(error.statusCode).send({ error: error.message });
    if ((error as { code?: string }).code === "23505")
      return reply.status(409).send({ error: "Este cadastro já existe." });
    if ((error as { statusCode?: number }).statusCode === 429)
      return reply.status(429).send({
        error: "Muitas tentativas. Aguarde um minuto e tente novamente.",
      });
    if ((error as { statusCode?: number }).statusCode === 400)
      return reply.status(400).send({ error: "Solicitação inválida." });
    request.log.error(error);
    return reply
      .status(500)
      .send({ error: "Não foi possível concluir. Tente novamente." });
  });
  const account = (r: FastifyRequest) => (r as AuthRequest).account!;
  app.get("/api/health", async () => ({ status: "ok" }));
  app.get<{ Params: { brand: string } }>("/api/:brand/brand", async (r) =>
    brandById(r.params.brand),
  );
  app.post<{ Params: { brand: string } }>(
    "/api/:brand/auth/register",
    { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } },
    async (r, reply) => {
      const data = z
        .object({ name, email, password, tenantName: name })
        .strict()
        .parse(r.body);
      const brand = brandById(r.params.brand);
      const hash = await hashPassword(data.password);
      const result = await db.transaction(async (tx) => {
        // Mantém e-mail único dentro da marca, permitindo contas independentes em outras marcas.
        await tx.query("SELECT id FROM core_brand WHERE id=$1 FOR UPDATE", [
          brand.id,
        ]);
        const exists = await tx.query(
          "SELECT u.id FROM core_user u JOIN core_tenant t ON t.id=u.tenant_id WHERE t.brand_id=$1 AND u.email=$2",
          [brand.id, data.email],
        );
        ensure(
          !exists.rows.length,
          409,
          "Já existe uma conta com este e-mail neste produto. Entre na sua conta.",
        );
        const tenant = randomUUID(),
          user = randomUUID();
        await tx.query(
          "INSERT INTO core_tenant(id,brand_id,name) VALUES($1,$2,$3)",
          [tenant, brand.id, data.tenantName],
        );
        await tx.query(
          "INSERT INTO core_user(id,tenant_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5)",
          [user, tenant, data.email, data.name, hash],
        );
        await tx.query(
          "INSERT INTO core_subscription(tenant_id,status,trial_ends_at) VALUES($1,'trial',now()+interval '14 days')",
          [tenant],
        );
        await tx.query(
          "INSERT INTO core_service(id,tenant_id,name,duration_minutes,price_cents) VALUES($1,$2,$3,$4,$5)",
          [
            randomUUID(),
            tenant,
            brand.initialService,
            brand.duration,
            brand.price,
          ],
        );
        await tx.query(
          "INSERT INTO core_resource(id,tenant_id,name) VALUES($1,$2,$3)",
          [randomUUID(), tenant, data.name],
        );
        await audit(tx, tenant, user, tenant, "tenant.created");
        return createSession(tx, tenant, user);
      });
      reply.setCookie("session", result.token, cookieOpts);
      return reply.code(201).send({ csrf: result.csrf });
    },
  );
  app.post<{ Params: { brand: string } }>(
    "/api/:brand/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (r, reply) => {
      const data = z
        .object({ email, password: z.string().min(1).max(128) })
        .strict()
        .parse(r.body);
      const user = (
        await db.query(
          "SELECT u.* FROM core_user u JOIN core_tenant t ON t.id=u.tenant_id WHERE t.brand_id=$1 AND u.email=$2",
          [r.params.brand, data.email],
        )
      ).rows[0];
      const valid = await verifyPassword(
        data.password,
        user?.password_hash ?? dummyHash,
      );
      ensure(user && valid, 401, "E-mail ou senha incorretos.");
      const session = await createSession(db, user.tenant_id, user.id);
      reply.setCookie("session", session.token, cookieOpts);
      return { csrf: session.csrf };
    },
  );
  app.post("/api/:brand/auth/logout", async (r, reply) => {
    await db.query("DELETE FROM core_session WHERE token_hash=$1", [
      digest(r.cookies.session!),
    ]);
    reply.clearCookie("session", { path: "/" });
    return { ok: true };
  });
  app.get("/api/:brand/state", async (r) => {
    const a = account(r),
      t = a.tenant_id;
    const [
      customers,
      services,
      resources,
      bookings,
      pets,
      subscription,
      blocks,
    ] = await Promise.all([
      db.query("SELECT * FROM core_customer WHERE tenant_id=$1 ORDER BY name", [
        t,
      ]),
      db.query("SELECT * FROM core_service WHERE tenant_id=$1 ORDER BY name", [
        t,
      ]),
      db.query("SELECT * FROM core_resource WHERE tenant_id=$1 ORDER BY name", [
        t,
      ]),
      db.query(
        "SELECT * FROM core_booking WHERE tenant_id=$1 ORDER BY starts_at",
        [t],
      ),
      a.vertical_id === "pet"
        ? db.query(
            "SELECT p.*,pb.booking_id FROM pet_pet p LEFT JOIN pet_booking pb ON pb.tenant_id=p.tenant_id AND pb.pet_id=p.id WHERE p.tenant_id=$1 ORDER BY p.name",
            [t],
          )
        : Promise.resolve({ rows: [] }),
      db.query(
        "SELECT status,trial_ends_at FROM core_subscription WHERE tenant_id=$1",
        [t],
      ),
      db.query(
        "SELECT * FROM core_time_block WHERE tenant_id=$1 ORDER BY starts_at",
        [t],
      ),
    ]);
    return {
      account: { ...a, csrf_token: undefined },
      csrf: a.csrf_token,
      customers: customers.rows,
      services: services.rows,
      resources: resources.rows,
      bookings: bookings.rows,
      pets: pets.rows,
      subscription: subscription.rows[0],
      blocks: blocks.rows,
    };
  });
  app.post("/api/:brand/customers", async (r, reply) => {
    const d = z
        .object({
          name,
          phone: z.string().trim().max(25).default(""),
          email: z.union([email, z.literal("")]).default(""),
        })
        .strict()
        .parse(r.body),
      id = randomUUID();
    await db.query(
      "INSERT INTO core_customer(id,tenant_id,name,phone,email) VALUES($1,$2,$3,$4,$5)",
      [id, account(r).tenant_id, d.name, d.phone, d.email],
    );
    return reply.code(201).send({ id });
  });
  app.post("/api/:brand/services", async (r, reply) => {
    const d = z
        .object({
          name,
          durationMinutes: z.number().int().min(5).max(480),
          priceCents: z.number().int().min(0).max(10_000_000),
        })
        .strict()
        .parse(r.body),
      id = randomUUID();
    await db.query(
      "INSERT INTO core_service(id,tenant_id,name,duration_minutes,price_cents) VALUES($1,$2,$3,$4,$5)",
      [id, account(r).tenant_id, d.name, d.durationMinutes, d.priceCents],
    );
    return reply.code(201).send({ id });
  });
  app.post("/api/:brand/resources", async (r, reply) => {
    const d = z
      .object({
        name,
        days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
        opens: clock,
        closes: clock,
      })
      .strict()
      .parse(r.body);
    ensure(
      d.closes > d.opens,
      400,
      "O fim do expediente deve ser depois do início.",
    );
    const id = randomUUID();
    await db.query(
      "INSERT INTO core_resource(id,tenant_id,name,days,opens,closes) VALUES($1,$2,$3,$4,$5,$6)",
      [id, account(r).tenant_id, d.name, d.days, d.opens, d.closes],
    );
    return reply.code(201).send({ id });
  });
  app.post("/api/:brand/pets", async (r, reply) => {
    const a = account(r);
    ensure(a.vertical_id === "pet", 404, "Módulo indisponível neste produto.");
    const d = z
      .object({
        name,
        customerId: uuid,
        species: z.enum(["Cão", "Gato", "Outro"]),
        breed: z.string().trim().max(80).default(""),
        size: z.enum(["Pequeno", "Médio", "Grande"]),
        notes: z.string().trim().max(500).default(""),
      })
      .strict()
      .parse(r.body);
    ensure(
      (
        await db.query(
          "SELECT id FROM core_customer WHERE tenant_id=$1 AND id=$2",
          [a.tenant_id, d.customerId],
        )
      ).rows.length,
      404,
      "Tutor não encontrado.",
    );
    const id = randomUUID();
    await db.query(
      "INSERT INTO pet_pet(id,tenant_id,customer_id,name,species,breed,size,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        a.tenant_id,
        d.customerId,
        d.name,
        d.species,
        d.breed,
        d.size,
        d.notes,
      ],
    );
    return reply.code(201).send({ id });
  });
  app.post("/api/:brand/bookings", async (r, reply) =>
    reply
      .code(201)
      .send(
        await createBooking(
          db,
          account(r),
          bookingInput.parse(r.body),
          modules,
        ),
      ),
  );
  app.patch<{ Params: { id: string } }>(
    "/api/:brand/bookings/:id",
    async (r) => {
      const id = uuid.parse(r.params.id),
        d = z
          .object({ startsAt: z.iso.datetime({ offset: true }) })
          .strict()
          .parse(r.body);
      return moveBooking(db, account(r), id, d.startsAt);
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/:brand/bookings/:id/status",
    async (r) => {
      const a = account(r),
        id = uuid.parse(r.params.id),
        d = z
          .object({ status: z.enum(["cancelled", "completed"]) })
          .strict()
          .parse(r.body);
      return db.transaction(async (tx) => {
        const booking = (
          await tx.query(
            "SELECT * FROM core_booking WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
            [a.tenant_id, id],
          )
        ).rows[0];
        ensure(booking, 404, "Agendamento não encontrado.");
        ensure(
          booking.status === "confirmed",
          409,
          "Este agendamento já foi finalizado.",
        );
        if (d.status === "completed")
          ensure(
            +new Date(booking.starts_at) <= Date.now(),
            409,
            "O atendimento ainda não começou.",
          );
        await tx.query(
          "UPDATE core_booking SET status=$3 WHERE tenant_id=$1 AND id=$2",
          [a.tenant_id, id, d.status],
        );
        await audit(tx, a.tenant_id, a.user_id, id, `booking.${d.status}`);
        return { id };
      });
    },
  );
  app.post("/api/:brand/blocks", async (r, reply) => {
    const a = account(r),
      d = z
        .object({
          resourceId: uuid,
          startsAt: z.iso.datetime({ offset: true }),
          endsAt: z.iso.datetime({ offset: true }),
          reason: name,
        })
        .strict()
        .parse(r.body);
    const id = await db.transaction(async (tx) => {
      await checkSlot(
        tx,
        a.tenant_id,
        d.resourceId,
        d.startsAt,
        d.endsAt,
        a.timezone,
      );
      const id = randomUUID();
      await tx.query(
        "INSERT INTO core_time_block(id,tenant_id,resource_id,starts_at,ends_at,reason) VALUES($1,$2,$3,$4,$5,$6)",
        [id, a.tenant_id, d.resourceId, d.startsAt, d.endsAt, d.reason],
      );
      await audit(tx, a.tenant_id, a.user_id, id, "resource.blocked");
      return id;
    });
    return reply.code(201).send({ id });
  });
  app.delete<{ Params: { id: string } }>(
    "/api/:brand/blocks/:id",
    async (r) => {
      const a = account(r),
        id = uuid.parse(r.params.id);
      return db.transaction(async (tx) => {
        const result = await tx.query(
          "DELETE FROM core_time_block WHERE id=$1 AND tenant_id=$2 RETURNING id",
          [id, a.tenant_id],
        );
        ensure(result.rows.length, 404, "Bloqueio não encontrado.");
        await audit(tx, a.tenant_id, a.user_id, id, "resource.unblocked");
        return { id };
      });
    },
  );
  if (existsSync(resolve("dist/index.html"))) {
    app.get("/", (r, reply) => {
      const product = options.brandHosts?.[r.hostname];
      return product
        ? reply.redirect(`/b/${product}`)
        : reply.sendFile("index.html");
    });
    await app.register(fastifyStatic, { root: resolve("dist"), prefix: "/" });
    app.setNotFoundHandler((r, reply) =>
      r.url.startsWith("/api/")
        ? reply.code(404).send({ error: "Rota não encontrada." })
        : reply.sendFile("index.html"),
    );
  }
  return app;
}
