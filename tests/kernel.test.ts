import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { connectDatabase, migrate, type Database } from "../server/db/index.ts";
import { buildApp } from "../server/app.ts";
let db: Database, app: Awaited<ReturnType<typeof buildApp>>;
type Account = { cookie: string; csrf: string; state: any; brand: string };
let a: Account, b: Account, barber: Account, customer: string, pet: string;
const origin = "http://localhost:5173";
async function call(
  account: Account,
  path: string,
  body?: unknown,
  method: any = "POST",
) {
  return app.inject({
    method: body === undefined ? "GET" : method,
    url: `/api/${account.brand}${path}`,
    headers: {
      origin,
      cookie: account.cookie,
      "x-csrf-token": account.csrf,
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
}
async function signup(brand: string, email: string): Promise<Account> {
  const r = await app.inject({
    method: "POST",
    url: `/api/${brand}/auth/register`,
    headers: { origin },
    payload: {
      name: "Pessoa Teste",
      email,
      password: "TesteSeguro123",
      tenantName: "Estabelecimento teste",
    },
  });
  assert.equal(r.statusCode, 201, r.body);
  const cookie = r.headers["set-cookie"]!.toString().split(";")[0];
  const state = (
    await app.inject({ url: `/api/${brand}/state`, headers: { cookie } })
  ).json();
  return { brand, cookie, csrf: state.csrf, state };
}
const start = () =>
  DateTime.now()
    .setZone("America/Sao_Paulo")
    .plus({ days: 7 })
    .startOf("week")
    .plus({ weeks: 1 })
    .set({ hour: 9 })
    .toUTC()
    .toISO()!;
const input = (overrides = {}) => ({
  customerId: customer,
  resourceId: a.state.resources[0].id,
  serviceId: a.state.services[0].id,
  startsAt: start(),
  notes: "Teste",
  extension: { petId: pet },
  ...overrides,
});
before(async () => {
  db = await connectDatabase(process.env.TEST_DATABASE_URL);
  await migrate(db);
  await migrate(db);
  app = await buildApp(db);
  await app.ready();
  const run = randomUUID();
  a = await signup("petflow", `a-${run}@test.local`);
  b = await signup("petflow", `b-${run}@test.local`);
  barber = await signup("barberflow", `barber-${run}@test.local`);
  customer = (
    await call(a, "/customers", {
      name: "Maria",
      phone: "51999999999",
      email: "",
    })
  ).json().id;
  pet = (
    await call(a, "/pets", {
      name: "Thor",
      customerId: customer,
      species: "Cão",
      size: "Grande",
      breed: "Golden",
      notes: "",
    })
  ).json().id;
});
after(async () => {
  await app.close();
  await db.close();
});
test("cadastro atribui marca e vertical pelo servidor, cria trial e cadastros iniciais", () => {
  assert.equal(a.state.account.brand_id, "petflow");
  assert.equal(a.state.account.vertical_id, "pet");
  assert.equal(a.state.services.length, 1);
  assert.equal(a.state.subscription.status, "trial");
  assert.ok(!("password_hash" in a.state.account));
});
test("payload não pode substituir tenant, marca ou papel", async () => {
  const r = await app.inject({
    method: "POST",
    url: "/api/petflow/auth/register",
    headers: { origin },
    payload: {
      name: "Intruso",
      email: "intruso@test.local",
      password: "TesteSeguro123",
      tenantName: "Xpto",
      brand_id: "barberflow",
      role: "admin",
    },
  });
  assert.equal(r.statusCode, 400);
});
test("autenticação exige sessão; origem e CSRF são verificados", async () => {
  assert.equal(
    (await app.inject({ url: "/api/petflow/state" })).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/petflow/customers",
        headers: {
          origin: "https://evil.example",
          cookie: a.cookie,
          "x-csrf-token": a.csrf,
        },
        payload: { name: "Intruso" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/petflow/customers",
        headers: { origin, cookie: a.cookie },
        payload: { name: "Intruso" },
      })
    ).statusCode,
    403,
  );
});
test("sessão de uma marca não entra em outra", async () => {
  assert.equal(
    (
      await app.inject({
        url: "/api/barberflow/state",
        headers: { cookie: a.cookie },
      })
    ).statusCode,
    401,
  );
});
test("login não aceita senha errada; logout invalida sessão", async () => {
  const bad = await app.inject({
    method: "POST",
    url: "/api/petflow/auth/login",
    headers: { origin },
    payload: { email: a.state.account.email, password: "senhaerrada" },
  });
  assert.equal(bad.statusCode, 401);
  const ok = await app.inject({
    method: "POST",
    url: "/api/petflow/auth/login",
    headers: { origin },
    payload: { email: a.state.account.email, password: "TesteSeguro123" },
  });
  assert.equal(ok.statusCode, 200);
  const cookie = ok.headers["set-cookie"]!.toString().split(";")[0];
  await call({ ...a, cookie, csrf: ok.json().csrf }, "/auth/logout", {});
  assert.equal(
    (await app.inject({ url: "/api/petflow/state", headers: { cookie } }))
      .statusCode,
    401,
  );
});
test("consultas isolam clientes e pets; referências externas são rejeitadas", async () => {
  const state = (await call(b, "/state")).json();
  assert.equal(state.customers.length, 0);
  assert.equal(state.pets.length, 0);
  assert.equal((await call(b, "/bookings", input())).statusCode, 404);
  assert.equal(
    (
      await call(b, "/pets", {
        name: "Invasão",
        customerId: customer,
        species: "Cão",
        size: "Grande",
      })
    ).statusCode,
    404,
  );
});
test("FK composta também bloqueia vínculo entre tenants no banco", async () => {
  await assert.rejects(
    db.query(
      "INSERT INTO pet_pet(id,tenant_id,customer_id,name,species,size) VALUES($1,$2,$3,$4,$5,$6)",
      [
        randomUUID(),
        b.state.account.tenant_id,
        customer,
        "Invasão",
        "Cão",
        "Grande",
      ],
    ),
  );
});
test("pet precisa pertencer ao tutor; módulo pet não está disponível para barbearia", async () => {
  const other = (await call(a, "/customers", { name: "Outro tutor" })).json()
    .id;
  assert.equal(
    (await call(a, "/bookings", input({ customerId: other }))).statusCode,
    404,
  );
  assert.equal((await call(barber, "/pets", { name: "Pet" })).statusCode, 404);
});
test("horário respeita disponibilidade e rejeita campos inválidos", async () => {
  const early = DateTime.fromISO(start())
    .setZone("America/Sao_Paulo")
    .set({ hour: 7 })
    .toUTC()
    .toISO();
  assert.equal(
    (await call(a, "/bookings", input({ startsAt: early }))).statusCode,
    409,
  );
  assert.equal(
    (await call(a, "/bookings", input({ startsAt: "invalid" }))).statusCode,
    400,
  );
  assert.equal(
    (
      await call(a, "/services", {
        name: "Inválido",
        durationMinutes: -1,
        priceCents: 100,
      })
    ).statusCode,
    400,
  );
});
test("duas reservas concorrentes produzem exatamente um sucesso", async () => {
  const pair = await Promise.all([
    call(a, "/bookings", input()),
    call(a, "/bookings", input()),
  ]);
  assert.deepEqual(pair.map((r) => r.statusCode).sort(), [201, 409]);
  const id = pair.find((r) => r.statusCode === 201)!.json().id;
  assert.equal(
    (await call(b, `/bookings/${id}/status`, { status: "cancelled" }))
      .statusCode,
    404,
  );
  assert.equal(
    (await call(a, `/bookings/${id}/status`, { status: "completed" }))
      .statusCode,
    409,
  );
  // Horários adjacentes são permitidos; sobreposição no meio do atendimento não é.
  const adjacent = DateTime.fromISO(start()).plus({ hours: 1 }).toISO();
  const overlap = DateTime.fromISO(start()).plus({ minutes: 30 }).toISO();
  assert.equal(
    (await call(a, "/bookings", input({ startsAt: overlap }))).statusCode,
    409,
  );
  const second = await call(a, "/bookings", input({ startsAt: adjacent }));
  assert.equal(second.statusCode, 201, second.body);
  assert.equal(
    (
      await call(
        a,
        `/bookings/${second.json().id}`,
        { startsAt: start() },
        "PATCH",
      )
    ).statusCode,
    409,
  );
  assert.equal(
    (await call(a, `/bookings/${id}/status`, { status: "cancelled" }))
      .statusCode,
    200,
  );
  assert.equal((await call(a, "/bookings", input())).statusCode, 201);
});
test("bloqueio e reserva usam a mesma trava de recurso", async () => {
  const time = DateTime.fromISO(start()).plus({ hours: 3 }),
    body = {
      resourceId: a.state.resources[0].id,
      startsAt: time.toISO(),
      endsAt: time.plus({ hours: 1 }).toISO(),
      reason: "Intervalo",
    };
  const pair = await Promise.all([
    call(a, "/blocks", body),
    call(a, "/bookings", input({ startsAt: time.toISO() })),
  ]);
  assert.deepEqual(pair.map((r) => r.statusCode).sort(), [201, 409]);
  const block = await call(a, "/blocks", {
    ...body,
    startsAt: time.plus({ hours: 2 }).toISO(),
    endsAt: time.plus({ hours: 3 }).toISO(),
  });
  assert.equal(block.statusCode, 201, block.body);
  assert.equal(
    (await call(b, `/blocks/${block.json().id}`, {}, "DELETE")).statusCode,
    404,
  );
  assert.equal(
    (await call(a, `/blocks/${block.json().id}`, {}, "DELETE")).statusCode,
    200,
  );
});
test("segundo vertical agenda no mesmo kernel sem informação de pet", async () => {
  const customer = (
    await call(barber, "/customers", { name: "Cliente da barbearia" })
  ).json().id;
  const result = await call(barber, "/bookings", {
    customerId: customer,
    resourceId: barber.state.resources[0].id,
    serviceId: barber.state.services[0].id,
    startsAt: start(),
  });
  assert.equal(result.statusCode, 201, result.body);
  const petLink = await db.query(
    "SELECT * FROM pet_booking WHERE booking_id=$1",
    [result.json().id],
  );
  assert.equal(petLink.rows.length, 0);
});
test("remarcação mantém duração e registra auditoria", async () => {
  const current = (await call(barber, "/state")).json().bookings[0];
  const moved = DateTime.fromISO(start()).plus({ days: 1 }).toISO();
  assert.equal(
    (
      await call(
        barber,
        `/bookings/${current.id}`,
        { startsAt: moved },
        "PATCH",
      )
    ).statusCode,
    200,
  );
  const next = (await call(barber, "/state")).json().bookings[0];
  assert.equal(
    +new Date(next.ends_at) - +new Date(next.starts_at),
    30 * 60 * 1000,
  );
  assert.ok(
    (
      await db.query(
        "SELECT id FROM core_audit WHERE tenant_id=$1 AND action=$2",
        [barber.state.account.tenant_id, "booking.rescheduled"],
      )
    ).rows.length,
  );
});
