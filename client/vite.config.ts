import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In dev, proxy API + interactions calls to the Express server so the SPA and
// backend share an origin (cookies just work). Target is configurable via
// DEV_SERVER_URL (a machine-local client/.env) for when port 3000 is taken;
// defaults to 3000 for everyone else.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.DEV_SERVER_URL ?? "http://localhost:3000";
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        "/api": target,
        "/interactions": target,
        "/healthz": target,
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
