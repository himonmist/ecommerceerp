import { expect, test } from "@playwright/test";

test("landing page renders the Link Vision brand without console or CSP errors", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()); });
  page.on("pageerror", (e) => problems.push(e.message));
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("from one vision");
  await expect(page.getByText("By Link Vision Software Solution")).toBeVisible();
  await expect(page.locator("#pricing")).toContainText("৳1,000");
  await page.getByRole("link", { name: /start your 10-day free trial/i }).click();
  await expect(page).toHaveURL(/\/register$/);
  expect(problems).toEqual([]);
});

test("sends hardened security headers", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["strict-transport-security"]).toContain("max-age=63072000");
  expect(h["x-powered-by"]).toBeUndefined();
});
