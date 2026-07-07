import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Provider-agnostic Postgres access. Points at Aurora Serverless v2
 * (af-south-1) via a pooled connection string (RDS Proxy recommended);
 * swapping to a fixed RDS instance requires only a DATABASE_URL change.
 *
 * A small pool with short idle timeout keeps serverless invocations from
 * exhausting Aurora connections.
 */
const globalForDb = globalThis as unknown as { pgPool?: Pool };

const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl:
      !process.env.DATABASE_URL ||
      /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)
        ? undefined
        : { rejectUnauthorized: false },
  });

if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
