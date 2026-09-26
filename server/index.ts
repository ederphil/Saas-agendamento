import { connectDatabase, migrate } from "./db/index.ts";
import { buildApp } from "./app.ts";
const production = process.env.NODE_ENV === "production";
if (production && (!process.env.DATABASE_URL || !process.env.APP_ORIGIN))
  throw new Error("Produção exige DATABASE_URL e APP_ORIGIN HTTPS.");
if (production && !process.env.APP_ORIGIN?.startsWith("https://"))
  throw new Error("Produção exige HTTPS.");
const db = await connectDatabase(
  process.env.DATABASE_URL,
  process.env.DATA_DIR ?? ".data/pg",
);
await migrate(db);
const app = await buildApp(db, {
  production,
  origin: process.env.APP_ORIGINS ?? process.env.APP_ORIGIN,
  brandHosts: JSON.parse(process.env.BRAND_HOSTS ?? "{}"),
  logger: true,
});
await app.listen({
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3001),
});
let closing = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    await app.close();
    await db.close();
    process.exit(0);
  });
