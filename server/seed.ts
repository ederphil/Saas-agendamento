import { randomBytes } from "node:crypto";
import { DateTime } from "luxon";
import { connectDatabase, migrate } from "./db/index.ts";
import { buildApp } from "./app.ts";
if (process.env.NODE_ENV === "production")
  throw new Error("Demonstração não permitida em produção.");
const db = await connectDatabase(
  process.env.DATABASE_URL,
  process.env.DATA_DIR ?? ".data/pg",
);
await migrate(db);
const app = await buildApp(db);
await app.ready();
const email = "ana@demo.local",
  password = process.env.DEMO_PASSWORD ?? randomBytes(12).toString("base64url");
const origin = "http://localhost:5173";
const reg = await app.inject({
  method: "POST",
  url: "/api/petflow/auth/register",
  headers: { origin },
  payload: {
    name: "Ana Costa",
    tenantName: "Pet Feliz · Demonstração",
    email,
    password,
  },
});
if (reg.statusCode !== 201) {
  console.log(
    "A demonstração já existe. Seus dados foram preservados. Use a senha definida na primeira execução.",
  );
  await app.close();
  await db.close();
  process.exit(0);
}
const cookie = reg.headers["set-cookie"]!.toString().split(";")[0],
  csrf = reg.json().csrf;
async function request(path: string, payload?: unknown) {
  const r = await app.inject({
    url: "/api/petflow" + path,
    method: payload ? "POST" : "GET",
    headers: {
      origin,
      cookie,
      "x-csrf-token": csrf,
      "content-type": "application/json",
    },
    ...(payload ? { payload: JSON.stringify(payload) } : {}),
  });
  if (r.statusCode >= 400) throw new Error(r.body);
  return r.json();
}
const state = await request("/state");
const resource = state.resources[0].id;
const julia = (
  await request("/resources", {
    name: "Júlia Mendes",
    days: [1, 2, 3, 4, 5, 6, 7],
    opens: "08:00",
    closes: "18:00",
  })
).id;
const service = (
  await request("/services", {
    name: "Banho relaxante",
    durationMinutes: 45,
    priceCents: 6500,
  })
).id;
const corte = (
  await request("/services", {
    name: "Tosa higiênica",
    durationMinutes: 30,
    priceCents: 4000,
  })
).id;
const names = [
  ["Mariana Alves", "Luna", "Shih-tzu", "Pequeno"],
  ["Pedro Santos", "Thor", "Golden retriever", "Grande"],
  ["Camila Lima", "Mel", "Spitz alemão", "Pequeno"],
  ["Lucas Oliveira", "Bento", "Poodle", "Médio"],
  ["Fernanda Rocha", "Nina", "SRD", "Médio"],
];
const today = DateTime.now().setZone("America/Sao_Paulo").startOf("day");
// Dados demonstrativos podem representar atendimentos passados; somente o seed usa SQL para estes registros.
for (let i = 0; i < names.length; i++) {
  const [name, petName, breed, size] = names[i];
  const customer = (
    await request("/customers", {
      name,
      phone: `(51) 99900-000${i}`,
      email: "",
    })
  ).id;
  const pet = (
    await request("/pets", {
      customerId: customer,
      name: petName,
      species: "Cão",
      breed,
      size,
      notes: "",
    })
  ).id;
  const startsAt = today.plus({ hours: 8 + i * 2 });
  const result = await db.query<{ id: string }>(
    `INSERT INTO core_booking(id,tenant_id,customer_id,resource_id,service_id,starts_at,ends_at,price_cents,status,notes) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,'Atendimento fictício de demonstração') RETURNING id`,
    [
      state.account.tenant_id,
      customer,
      i % 2 ? julia : resource,
      i % 3 === 0 ? corte : service,
      startsAt.toUTC().toISO(),
      startsAt
        .plus({ minutes: i % 3 === 0 ? 30 : 45 })
        .toUTC()
        .toISO(),
      i % 3 === 0 ? 4000 : 6500,
      startsAt.plus({ hours: 1 }) < DateTime.now() ? "completed" : "confirmed",
    ],
  );
  await db.query(
    "INSERT INTO pet_booking(tenant_id,booking_id,pet_id) VALUES($1,$2,$3)",
    [state.account.tenant_id, result.rows[0].id, pet],
  );
}
console.log(
  `Demonstração criada.\nEndereço: http://localhost:5173/b/petflow\nE-mail: ${email}\nSenha temporária da demonstração: ${password}\nGuarde essa senha. Somente dados fictícios foram criados.`,
);
await app.close();
await db.close();
