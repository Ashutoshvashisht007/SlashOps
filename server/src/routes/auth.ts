import { Router } from "express";
import { z } from "zod";
import { verifyLogin } from "../auth";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "email and password required" });
    return;
  }
  const adminId = await verifyLogin(parsed.data.email, parsed.data.password);
  if (!adminId) {
    res.status(401).json({ error: "invalid credentials" });
    return;
  }
  req.session = { adminId, email: parsed.data.email.toLowerCase() };
  res.json({ ok: true, email: parsed.data.email.toLowerCase() });
});

authRouter.post("/logout", (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

authRouter.get("/me", (req, res) => {
  if (!req.session?.adminId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  res.json({ email: req.session.email });
});
