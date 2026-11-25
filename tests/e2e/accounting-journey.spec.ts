import { expect, test } from "@playwright/test";

const id = Date.now().toString(36);

test("accounting: sales post automatically, expense voucher, reports balance, cancel posts a reversal", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/register");
  await page.getByLabel("Your name").fill("Book Keeper");
  await page.getByLabel("Store name").fill(`Books ${id}`);
  await page.getByLabel("Store address").fill(`books-${id}`);
  await page.getByLabel("Email").fill(`books-${id}@example.com`);
  await page.getByLabel("Password").fill("Str0ng!Passw0rd");
  await page.getByRole("button", { name: "Create my store" }).click();
  await expect(page).toHaveURL(/\/dashboard\?welcome=1/);

  await page.goto("/dashboard/products/new");
  await page.getByLabel("Product name").fill("Tea Set");
  await page.getByLabel("Online price ৳").fill("1500");
  await page.getByLabel("Cost (COGS) ৳").fill("900");
  await page.getByLabel("Opening stock").fill("10");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByRole("status")).toContainText("Product created.");

  // Walk-in ERP sale of 2 × 1500 paid in cash → revenue 3000, COGS 1800
  await page.goto("/dashboard/erp/invoices/new");
  await page.getByLabel("Walk-in name").fill("Counter sale");
  const box = page.getByRole("combobox", { name: "Product" });
  await box.click(); await box.fill("Tea");
  await page.getByRole("listbox").getByRole("option").first().click();
  await page.getByLabel("Quantity").fill("2");
  await page.getByRole("button", { name: "Pay full" }).click();
  await page.getByRole("button", { name: "Save invoice" }).click();
  await expect(page).toHaveURL(/created=1/);
  await page.getByRole("link", { name: "Journal entry" }).click();
  await expect(page.getByRole("heading", { name: /Journal entry JE-/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /4000 Sales Revenue/ })).toBeVisible();

  // Expense voucher: rent 500 paid in cash
  await page.goto("/dashboard/accounting/vouchers/new?type=DV");
  await page.getByLabel("Description").fill("Showroom rent");
  await page.getByLabel("Paid from").selectOption({ label: "1010 · Cash on Hand" });
  await page.getByLabel("Line 1 account").selectOption({ label: "6000 · Rent" });
  await page.getByLabel("Line 1 amount").fill("500");
  await page.getByRole("button", { name: "Post voucher" }).click();
  await expect(page.getByRole("heading", { name: "DV voucher DV-000001" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Voucher posted to the ledger.");

  // P&L: 3000 − 1800 − 500 = 700
  await page.goto("/dashboard/accounting/reports/profit-loss");
  await expect(page.getByTestId("net-profit")).toHaveText("৳700.00");
  await page.goto("/dashboard/accounting/reports/trial-balance");
  await expect(page.getByText("Balanced", { exact: true })).toBeVisible();
  await page.goto("/dashboard/accounting/reports/balance-sheet");
  await expect(page.getByText("Balanced", { exact: true })).toBeVisible();

  // A journal voucher shows live balance, then cancel posts a reversal
  await page.goto("/dashboard/accounting/vouchers/new?type=JV");
  await page.getByLabel("Description").fill("Reclass test");
  await page.getByLabel("Line 1 account").selectOption({ label: "6000 · Rent" });
  await page.getByLabel("Line 1 debit").fill("100");
  await page.getByLabel("Line 2 account").selectOption({ label: "3000 · Owner's Capital" });
  await page.getByLabel("Line 2 credit").fill("100");
  await expect(page.getByTestId("jv-balance")).toContainText("Balanced");
  await page.getByRole("button", { name: "Post voucher" }).click();
  await expect(page.getByRole("heading", { name: "JV voucher JV-000001" })).toBeVisible();
  await page.getByLabel(/Cancellation reason/).fill("Posted by mistake");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Cancelled — a reversal entry was posted.");
  await page.goto("/dashboard/accounting/reports/profit-loss");
  await expect(page.getByTestId("net-profit")).toHaveText("৳700.00");
});
