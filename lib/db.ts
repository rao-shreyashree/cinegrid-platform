import { Pool, PoolClient, QueryResultRow } from "pg";

// One pool per server process. The global avoids creating a new pool on every hot reload in dev.
const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPg.pgPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

if (!globalForPg.pgPool) {
  pool.on("error", (err) => console.error("Idle pg client error:", err.message));
}
if (process.env.NODE_ENV !== "production") globalForPg.pgPool = pool;

/** Parameterized query. ALWAYS pass user input via `params`, never string-concatenate it. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await pool.query<T>(text, params);
  return res.rows;
}

/** Run several statements in one transaction (BEGIN ... COMMIT, ROLLBACK on error). */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
