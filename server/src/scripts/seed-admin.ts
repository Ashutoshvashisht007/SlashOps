/**
 * Manually (re)seed the dashboard admin from ADMIN_EMAIL / ADMIN_PASSWORD.
 * This also runs automatically on boot; the script is here for local use.
 *
 *   npm run seed
 */
import { seedAdmin } from "../auth";
import { pool } from "../db";
import { log } from "../lib/logger";

seedAdmin()
  .then(() => log.info("admin seed complete"))
  .catch((err) => {
    log.error("admin seed failed", { err: String(err) });
    process.exitCode = 1;
  })
  .finally(() => pool.end());
