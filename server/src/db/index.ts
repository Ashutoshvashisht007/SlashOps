import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../env";
import * as schema from "./schema";

/**
 * node-postgres does not always honour `sslmode=require` from the URL, and
 * managed Postgres (Neon/Supabase) terminates TLS with a cert chain that the
 * default verifier rejects. Enable SSL whenever the URL asks for it.
 */
const needsSsl = /sslmode=require|neon\.tech|supabase\.co/.test(env.DATABASE_URL);

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

export const db = drizzle(pool, { schema });
