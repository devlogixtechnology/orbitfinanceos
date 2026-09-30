import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Password").fill("OrbitOS browser test 2026!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app\/overview$/u);
}

test("fails closed and redirects an unauthenticated operator", async ({ page }) => {
  await page.goto("/app/overview");

  await expect(page).toHaveURL(/\/sign-in$/u);
  await expect(page.getByRole("heading", { name: "Sign in to OrbitOS" })).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveValue("orbitos@devlogix.com.pk");
  await page.screenshot({ path: "test-results/sign-in.png", fullPage: true });
});

test.describe("authenticated tenant shell", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("renders only delivered routes with security headers", async ({ page }) => {
    const response = await page.goto("/app/overview");

    expect(response?.status()).toBe(200);
    expect(response?.headers()["x-frame-options"]).toBe("DENY");
    expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    await expect(page.locator(".tenant-name")).toHaveText("Devlogix OrbitOS Staging");
    await expect(page.getByRole("heading", { name: "Operational overview" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();
    await expect(
      page.getByRole("link", { exact: true, name: "Integrations" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Reconciliation" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Exceptions" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tenants" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Users & roles" })).toBeVisible();
  });

  test("presents the reseller control plane and role matrix", async ({ page }) => {
    await page.getByRole("link", { name: "Tenants" }).click();
    await expect(page.getByRole("heading", { name: "Tenant network" })).toBeVisible();
    await expect(page.locator(".tenant-card").getByText("Devlogix OrbitOS Staging")).toBeVisible();
    await page.screenshot({ path: "test-results/control-plane-tenants.png", fullPage: true });

    await page.getByRole("link", { name: "Users & roles" }).click();
    await expect(page.getByRole("heading", { name: "Users, roles & permissions" })).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Super Admin", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("OrbitOS Super Administrator")).toBeVisible();

    await page.getByRole("link", { name: "Billing" }).click();
    await expect(page.getByRole("heading", { name: "Billing control" })).toBeVisible();
    await expect(page.getByText("OrbitOS → Tenant")).toBeVisible();
    await expect(page.getByText("Tenant → Customer")).toBeVisible();
    await page.screenshot({ path: "test-results/control-plane-billing.png", fullPage: true });
  });

  test("persists explicit light and dark themes without hydration drift", async ({ page }) => {
    await page.goto("/app/overview");
    const selector = page.getByLabel("Theme");

    await selector.selectOption("light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.screenshot({ path: "test-results/overview-light.png", fullPage: true });

    await selector.selectOption("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(selector).toHaveValue("dark");
    await page.screenshot({ path: "test-results/overview-dark.png", fullPage: true });
  });

  test("supports the tenant-scoped integration-to-movement journey", async ({ page }) => {
    await page.goto("/app/overview");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /OrbitOS/u })).toBeFocused();

    await page.getByRole("link", { exact: true, name: "Integrations" }).click();
    await expect(page).toHaveURL(/\/app\/integrations$/u);
    await expect(page.getByText("No integrations yet")).toBeVisible();
    await page.getByLabel("Starting block").fill("1000");
    await page.getByLabel("Wallet address").fill("0x1111111111111111111111111111111111111111");
    await page.getByLabel("Token contract").fill("0x2222222222222222222222222222222222222222");
    await page.getByRole("button", { name: "Create integration" }).click();
    await expect(page.getByText("Integration created and tenant scoped.")).toBeVisible();
    await expect(page.locator(".integration-cards").getByText("BSC Testnet")).toBeVisible();
    await expect(page.getByText("From block 1000")).toBeVisible();
    const editor = page.locator("details");
    await editor.getByText("Edit source scope").click();
    await editor.getByLabel("Starting block").fill("1001");
    await editor.getByRole("button", { name: "Save source scope" }).click();
    await expect(page.getByText("Operator action saved with tenant scope.")).toBeVisible();
    await expect(page.getByText("From block 1001")).toBeVisible();
    await page.getByLabel("End block").fill("1001");
    await page.getByRole("button", { name: "Run bounded range" }).click();
    await expect(page.getByText("Bounded ingestion finished.", { exact: false })).toBeVisible();
    await expect(page.getByRole("cell", { name: "completed" })).toBeVisible();
    await page.getByRole("link", { name: "Movements" }).click();
    await expect(page).toHaveURL(/\/app\/movements$/u);
    await expect(page.getByText("340282366920938463463.374607431768211455")).toBeVisible();
    await expect(page.getByText("Normalized · unverified")).toBeVisible();
    await page.getByRole("link", { name: "1 object" }).click();
    await expect(page.getByRole("heading", { name: "Movement detail" })).toBeVisible();
    await expect(page.getByText("Pending — no decision recorded")).toBeVisible();
    await page.screenshot({ path: "test-results/integrations-configured.png", fullPage: true });
  });

  test("shows exact reconciliation and records an auditable exception workflow update", async ({ page }) => {
    await page.getByRole("link", { name: "Reconciliation" }).click();
    await expect(page.getByRole("heading", { name: "Reconciliation" })).toBeVisible();
    await expect(page.getByText("340282366920938463463374607431768211456")).toBeVisible();
    await page.getByRole("link", { name: "Exceptions" }).click();
    await expect(page.getByText("reconciliation:amount_difference")).toBeVisible();
    await page.getByRole("link", { name: "reconciliation:amount_difference" }).click();
    await page.getByLabel("State").selectOption("resolved");
    await page.getByLabel("Resolution reason code").fill("exception:confirmed_difference");
    await page.getByLabel("Investigation note").fill("Confirmed against independent evidence.");
    await page.getByLabel("Assign to me").check();
    await page.getByRole("button", { name: "Record workflow update" }).click();
    await expect(page.getByText("exception:confirmed_difference")).toBeVisible();
    await expect(page.getByText("Confirmed against independent evidence.")).toBeVisible();
  });

  test("revokes the session when the operator signs out", async ({ page }) => {
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/u);
    await page.goto("/app/overview");
    await expect(page).toHaveURL(/\/sign-in$/u);
  });
});
