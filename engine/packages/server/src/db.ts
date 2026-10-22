import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

/** Connects with the standard PG* environment variables, defaulting to the local dev database. */
export function connect(database = process.env.PGDATABASE ?? "long_boil_dev"): Db {
  return new pg.Pool({ database, max: 10 });
}

export async function withTransaction<T>(db: Db, work: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = await db.connect();
  try {
    await tx.query("BEGIN");
    const result = await work(tx);
    await tx.query("COMMIT");
    return result;
  } catch (error) {
    await tx.query("ROLLBACK");
    throw error;
  } finally {
    tx.release();
  }
}

const MIGRATIONS_DIR = join(import.meta.dirname, "../migrations");

/** Applies every migration not yet recorded, in file-name order, each in its own transaction. */
export async function migrate(db: Db): Promise<string[]> {
  await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const applied = new Set((await db.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((row) => row.name));
  const ran: string[] = [];
  for (const name of readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith(".sql")).sort()) {
    if (applied.has(name)) continue;
    await withTransaction(db, async (tx) => {
      await tx.query(readFileSync(join(MIGRATIONS_DIR, name), "utf8"));
      await tx.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    });
    ran.push(name);
  }
  return ran;
}
