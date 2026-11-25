import { expect, test } from "@playwright/test";

const id = Date.now().toString(36);

test("POS: open shift, scan & tap to sell, cash change, receipt, close with Z-report", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/register");
  await page.getByLabel("Your name").fill("Shop Owner");
  await page.getByLabel("Store name").fill(`Counter ${id}`);
  await page.getByLabel("Store address").fill(`pos-${id}`);
  await page.getByLabel("Email").fill(`pos-${id}@example.com`);
  await page.getByLabel("Password").fill("Str0ng!Passw0rd");
  await page.getByRole("button", { name: "Create my store" }).click();
  await expect(page).toHaveURL(/\/dashboard\?welcome=1/);

  await page.goto("/dashboard/products/new");
  await page.getByLabel("Product name").fill("Coffee Mug");
  await page.getByLabel("Online price ৳").fill("300");
  await page.getByLabel("Offline / POS ৳").fill("250");
  await page.getByLabel("Cost (COGS) ৳").fill("100");
  await page.getByLabel("SKU").fill(`MUG-${id}`);
  await page.getByLabel("Opening stock").fill("10");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByRole("status")).toContainText("Product created.");

  await page.goto("/dashboard/pos");
  await page.getByLabel("Register name").fill("Counter 1");
  await page.getByRole("button", { name: "Add register" }).click();
  await expect(page.getByRole("status")).toHaveText("Register added.");
  await page.getByRole("link", { name: /Counter 1/ }).click();
  await page.getByLabel(/Opening cash/).fill("1000");
  await page.getByRole("button", { name: "Open shift" }).click();

  // Scan the SKU, then tap the tile once more → 2 × 250 = 500
  const search = page.getByLabel("Search or scan");
  await expect(search).toBeFocused();
  await search.fill(`MUG-${id}`);
  await search.press("Enter");
  await page.getByRole("button", { name: "Add Coffee Mug" }).click();
  await expect(page.getByTestId("line-qty")).toHaveText("2");
  await expect(page.getByTestId("pos-total")).toHaveText("৳500.00");
  await page.getByLabel("Cash amount").fill("1000");
  await expect(page.getByTestId("pos-change")).toHaveText("৳500.00");
  await page.getByRole("button", { name: /Complete sale/ }).click();
  await expect(page.getByRole("dialog", { name: "Sale complete" })).toBeVisible();
  await expect(page.getByTestId("receipt")).toContainText("INV-000001");
  await page.getByRole("button", { name: /New sale/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Close: float 1000 + 500 cash kept = 1500 expected
  await page.getByRole("link", { name: "Cash & close shift" }).click();
  await expect(page.getByTestId("expected-cash")).toHaveText("৳1,500.00");
  await page.getByLabel(/Counted cash/).fill("1500");
  await expect(page.getByText("Drawer matches exactly.")).toBeVisible();
  await page.getByRole("button", { name: "Close shift" }).click();
  await expect(page.getByRole("heading", { name: /Z-report SH-000001/ })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Shift closed. This is the Z-report.");
});
