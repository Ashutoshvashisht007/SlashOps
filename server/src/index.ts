import path from "node:path";
import fs from "node:fs";
import express from "express";
import { env } from "./env";
import { log } from "./lib/logger";
import { bootstrapSchema } from "./db/bootstrap";
import { seedAdmin, sessionMiddleware } from "./auth";
import { interactionsHandler } from "./interactions/router";
import { ensureDefaultConfigs } from "./interactions/service";
import { COMMAND_DEFS } from "./discord/commands";
import { authRouter } from "./routes/auth";
import { apiRouter } from "./routes/api";
import { oauthRouter } from "./routes/oauth";
import { startOutboxWorker } from "./outbox/worker";

const app = express();
app.set("trust proxy", 1); // Render/Cloudflare sit in front — needed for secure cookies

// Liveness — cheap, unauthenticated, used by Render's health check.
app.get("/healthz", (_req, res) => res.json({ ok: true }));

/**
 * Discord interactions MUST be mounted with a RAW body parser and BEFORE any
 * JSON parser, so signature verification sees the exact bytes Discord signed.
 */
app.post("/interactions", express.raw({ type: "*/*", limit: "1mb" }), interactionsHandler);

// Everything below is normal JSON API territory.
app.use(express.json({ limit: "256kb" }));
app.use(sessionMiddleware);

app.use("/api/auth", authRouter);
app.use("/api/connect", oauthRouter);
app.use("/api", apiRouter);

// Serve the built SPA (production). In dev, Vite serves the client on :5173.
const clientDist = path.resolve(__dirname, "..", "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path === "/interactions") return next();
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

async function main(): Promise<void> {
  await bootstrapSchema();
  await seedAdmin();
  await ensureDefaultConfigs(COMMAND_DEFS.map((c) => c.name));
  startOutboxWorker();

  app.listen(env.PORT, () => {
    log.info("slashops up", { port: env.PORT, url: env.PUBLIC_BASE_URL });
  });
}

main().catch((err) => {
  log.error("fatal boot error", { err: String(err) });
  process.exit(1);
});
