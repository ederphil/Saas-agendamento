import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
export interface Queryable {
  query<T extends Record<string, any> = Record<string, any>>(
    sql: string,
    params?: any[],
  ): Promise<{ rows: T[] }>;
}
export interface Database extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export async function connectDatabase(
  url?: string,
  dataDir?: string,
): Promise<Database> {
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    return {
      query: async <T extends Record<string, any>>(
        sql: string,
        params?: any[],
      ) => pool.query<T>(sql, params),
      async transaction(fn) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
          const value = await fn(client);
          await client.query("COMMIT");
          return value;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }
  if (dataDir && dataDir !== "memory://")
    await mkdir(dirname(dataDir), { recursive: true });
  const db = new PGlite(dataDir);
  await db.waitReady;
  return {
    query: (sql, params) => db.query(sql, params),
    transaction: (fn) => db.transaction((tx) => fn(tx)),
    close: () => db.close(),
  };
}
export async function migrate(db: Database) {
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  await db.transaction(async (tx) => {
    // Serializa inicialização entre instâncias PostgreSQL.
    await tx.query("LOCK TABLE schema_migrations IN EXCLUSIVE MODE");
    if (
      (
        await tx.query(
          "SELECT version FROM schema_migrations WHERE version=$1",
          ["001"],
        )
      ).rows.length
    )
      return;
    const sql = await readFile(
      new URL("./001_initial.sql", import.meta.url),
      "utf8",
    );
    // O arquivo inicial contém DDL simples, sem funções ou literais com ponto e vírgula.
    for (const statement of sql.split(";").filter((s) => s.trim()))
      await tx.query(statement);
    await tx.query("INSERT INTO schema_migrations(version) VALUES ($1)", [
      "001",
    ]);
  });
}
