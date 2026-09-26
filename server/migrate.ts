import { connectDatabase, migrate } from "./db/index.ts";
const db = await connectDatabase(
  process.env.DATABASE_URL,
  process.env.DATA_DIR ?? ".data/pg",
);
await migrate(db);
await db.close();
console.log("Migrações aplicadas.");
