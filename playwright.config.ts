import { defineConfig } from "@playwright/test";

/**
 * E2E tests against the local dev stack (Vite on :5173 proxying the API on
 * :3100). Serial, single worker: the tests share one admin session and the
 * real dev database, so ordering matters and parallelism would race.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
