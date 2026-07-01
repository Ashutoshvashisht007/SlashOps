import type { Request, Response, NextFunction } from "express";
import cookieSession from "cookie-session";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { admins } from "../db/schema";
import { env, isProd } from "../env";
import { log } from "../lib/logger";

/** Signed, http-only session cookie. Stateless — no session table needed. */
export const sessionMiddleware = cookieSession({
  name: "slashops.sid",
  keys: [env.SESSION_SECRET],
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  httpOnly: true,
  sameSite: "lax",
  secure: isProd,
});

/** Create/refresh the seeded admin from env on boot (idempotent). */
export async function seedAdmin(): Promise<void> {
  const email = env.ADMIN_EMAIL.toLowerCase();
  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 10);
  await db
    .insert(admins)
    .values({ email, passwordHash })
    .onConflictDoUpdate({ target: admins.email, set: { passwordHash } });
  log.info("admin seeded", { email });
}

export async function verifyLogin(email: string, password: string): Promise<number | null> {
  const [admin] = await db
    .select()
    .from(admins)
    .where(eq(admins.email, email.toLowerCase()))
    .limit(1);
  if (!admin) return null;
  const ok = await bcrypt.compare(password, admin.passwordHash);
  return ok ? admin.id : null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.adminId) {
    next();
    return;
  }
  res.status(401).json({ error: "unauthorized" });
}
