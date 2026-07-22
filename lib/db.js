import { Pool } from "pg";

// Shared Postgres pool for app API routes (separate from better-auth's pool).
// Reused across hot-reloads in dev via a global to avoid exhausting connections.
let pool = globalThis.__vittiPgPool;
if (!pool) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  globalThis.__vittiPgPool = pool;
}

export const db = pool;

export function query(text, params) {
  return pool.query(text, params);
}
