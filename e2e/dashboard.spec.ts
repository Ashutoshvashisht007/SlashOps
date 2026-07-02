import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "supersecret";

/** The innermost container holding a command's heading AND its editor form. */
function commandCard(page: Page, name: string) {
  return page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name, exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Save rule" }) })
    .last();
}

async function login(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByPlaceholder("admin@example.com").fill(ADMIN_EMAIL);
  await page.getByPlaceholder("••••••••").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Log Out" })).toBeVisible();
}

test.describe.serial("SlashOps dashboard", () => {
  // ── Auth ──────────────────────────────────────────────────────────────────

  test("login page renders the brand chrome", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/SlashOps/);
    await expect(page.getByRole("heading", { name: /SlashOps/ })).toBeVisible();
    await expect(page.getByText("Sign in to continue")).toBeVisible();
    await expect(page.getByText(/Copyright © slashops/)).toBeVisible();
  });

  test("rejects wrong credentials with a visible error", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("admin@example.com").fill(ADMIN_EMAIL);
    await page.getByPlaceholder("••••••••").fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("invalid credentials")).toBeVisible();
    // still on the login screen
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("logs in and shows the dashboard chrome", async ({ page }) => {
    await login(page);
    // top bar
    await expect(page.getByText("Command Center")).toBeVisible();
    await expect(page.getByText(ADMIN_EMAIL)).toBeVisible();
    // tab strip
    for (const tab of ["Live", "Commands", "Servers"]) {
      await expect(page.getByRole("button", { name: tab, exact: true })).toBeVisible();
    }
    // footer
    await expect(page.getByText(/All rights reserved/)).toBeVisible();
  });

  test("session survives a page reload", async ({ page }) => {
    await login(page);
    await page.reload();
    await expect(page.getByRole("button", { name: "Log Out" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toHaveCount(0);
  });

  // ── Live tab ──────────────────────────────────────────────────────────────

  test("live tab shows stat cards, command log, and delivery health", async ({ page }) => {
    await login(page);
    for (const label of ["Interactions", "Processed", "Mirrored", "Servers", "Failures"]) {
      // scope to <main> — "Servers" also exists as a tab in the nav strip
      await expect(page.getByRole("main").getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Command log" })).toBeVisible();
    await expect(page.getByText("live", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Actions taken" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Delivery health" })).toBeVisible();
    // empty-state (no interactions in dev DB yet) — caps title + skeletons
    await expect(page.getByText("No commands recorded yet")).toBeVisible();
  });

  // ── Commands tab: the configurable rule editor ───────────────────────────

  test("commands tab lists all three commands with global scope", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "Commands", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Command rules" })).toBeVisible();
    for (const cmd of ["/report", "/status", "/echo"]) {
      await expect(page.getByRole("heading", { name: cmd })).toBeVisible();
    }
    // scope selector defaults to global
    await expect(page.locator("select")).toHaveValue("");
  });

  test("edits a command rule, persists it, and reverts", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "Commands", exact: true }).click();

    const echoCard = commandCard(page, "/echo");
    const template = echoCard.getByPlaceholder(/Recorded your/);
    const original = await template.inputValue();

    const marker = `E2E-${Date.now()}`;
    await template.fill(`${marker} {command} from {user}`);
    await echoCard.getByRole("button", { name: "Save rule" }).click();
    await expect(echoCard.getByText("Saved ✓")).toBeVisible();

    // persisted across reload?
    await page.reload();
    await page.getByRole("button", { name: "Commands", exact: true }).click();
    const echoCard2 = commandCard(page, "/echo");
    await expect(echoCard2.getByPlaceholder(/Recorded your/)).toHaveValue(
      `${marker} {command} from {user}`,
    );
    await expect(echoCard2.getByText("configured")).toBeVisible();

    // revert to the original template so the dev DB stays clean
    await echoCard2.getByPlaceholder(/Recorded your/).fill(original);
    await echoCard2.getByRole("button", { name: "Save rule" }).click();
    await expect(echoCard2.getByText("Saved ✓")).toBeVisible();
  });

  test("toggles work and flag keywords are editable", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "Commands", exact: true }).click();

    const reportCard = commandCard(page, "/report");

    // Mirror toggle flips off and back on
    const mirror = reportCard.getByRole("button", { name: "Mirror" });
    await mirror.click(); // off
    await mirror.click(); // on again — leaves state unchanged overall
    await expect(reportCard.getByRole("button", { name: "AI triage" })).toBeVisible();
    await expect(reportCard.getByRole("button", { name: "Ephemeral reply" })).toBeVisible();

    // keyword field is editable
    const keywords = reportCard.locator("input").nth(1);
    await expect(keywords).toBeEditable();
  });

  // ── Servers tab ───────────────────────────────────────────────────────────

  test("servers tab shows the connect flow and reference empty state", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "Servers", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Connected Servers" })).toBeVisible();
    await expect(
      page.getByText(/Authorize and configure SlashOps integration/),
    ).toBeVisible();

    // Connect button points at the OAuth kickoff route
    const connect = page.getByRole("link", { name: /Connect a server/ });
    await expect(connect).toHaveAttribute("href", "/api/connect/start");

    // Reference-style empty state (dev DB has no guilds yet)
    await expect(page.getByText("No servers connected")).toBeVisible();
    await expect(page.getByText("Sample Server Alpha")).toBeVisible();
  });

  // ── Security-facing behaviour visible from the FE ────────────────────────

  test("API rejects requests without a session (401)", async ({ request }) => {
    for (const path of ["/api/stats", "/api/interactions", "/api/guilds", "/api/configs"]) {
      const res = await request.get(path);
      expect(res.status(), `${path} should be gated`).toBe(401);
    }
  });

  test("interactions endpoint rejects unsigned junk (401)", async ({ request }) => {
    const res = await request.post("/interactions", { data: { type: 1 } });
    expect(res.status()).toBe(401);
  });

  test("logout returns to the login screen and drops the session", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "Log Out" }).click();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    // reload still logged out
    await page.reload();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });
});
