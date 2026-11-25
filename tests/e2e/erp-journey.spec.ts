import { expect, test, type Page } from "@playwright/test";

const id = Date.now().toString(36);
const email = `erp-${id}@example.com`;

async function pick(page: Page, text: string) {
  const input = page.getByRole("combobox", { name: "Product" }).first();
  await input.click();
  await input.fill(text);
  await page.getByRole("listbox").getByRole("option", { name: new RegExp(text) }).first().click();
}

test("ERP: credit sale → receipt, and purchase order → goods receipt → bill → payment", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/register");
  await page.getByLabel("Your name").fill("Karim Wholesale");
  await page.getByLabel("Store name").fill(`ERP Store ${id}`);
  await page.getByLabel("Store address").fill(`erp-${id}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Str0ng!Passw0rd");
  await page.getByRole("button", { name: "Create my store" }).click();
  await expect(page).toHaveURL(/\/dashboard\?welcome=1/);

  // Product with stock
  await page.goto("/dashboard/products/new");
  await page.getByLabel("Product name").fill("Akij Dinner Set");
  await page.getByLabel("Online price ৳").fill("1200");
  await page.getByLabel("Offline / POS ৳").fill("1000");
  await page.getByLabel("Cost (COGS) ৳").fill("500");
  await page.getByLabel("Opening stock").fill("10");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByRole("status")).toContainText("Product created.");

  // Customer with credit
  await page.goto("/dashboard/erp/customers");
  await page.getByLabel("Name", { exact: true }).fill("Rahim Traders");
  await page.getByLabel("Mobile").fill("01712345678");
  await page.getByLabel("Credit limit ৳").fill("50000");
  await page.getByRole("button", { name: "Add customer", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Customer added.");
  await expect(page.getByRole("link", { name: "Rahim Traders" })).toBeVisible();

  // Credit invoice: 3 × 1000 with 5% VAT = 3150, pay 1000 now
  await page.goto("/dashboard/erp/invoices/new");
  await page.getByLabel("Customer", { exact: true }).selectOption({ label: "Rahim Traders · 01712345678" });
  await pick(page, "Akij");
  await page.getByLabel("Quantity").first().fill("3");
  await page.getByLabel("VAT percent").first().fill("5");
  await expect(page.getByTestId("doc-total")).toHaveText("৳3,150.00");
  await page.getByRole("button", { name: "Add payment" }).click();
  await page.getByLabel("Payment amount").fill("1000");
  await page.getByRole("button", { name: "Save invoice" }).click();
  await expect(page).toHaveURL(/\/dashboard\/erp\/invoices\/[0-9a-f-]+\?created=1/);
  await expect(page.getByRole("heading", { name: "Invoice INV-000001" })).toBeVisible();
  await expect(page.getByText("Partial", { exact: true })).toBeVisible();

  // Receive the remaining 2150
  await page.goto("/dashboard/erp/receipts");
  await page.getByLabel("Customer", { exact: true }).selectOption({ index: 1 });
  await page.getByLabel("Amount ৳").fill("2150");
  await page.getByRole("button", { name: "Receive payment" }).click();
  await expect(page.getByRole("status")).toHaveText("Payment received.");
  await page.goto("/dashboard/erp/invoices");
  await expect(page.locator("tbody").getByText("Paid", { exact: true })).toBeVisible();

  // Supplier → PO → receive → bill → pay
  await page.goto("/dashboard/erp/suppliers");
  await page.getByLabel("Supplier name").fill("Akij Ceramics");
  await page.getByRole("button", { name: "Add supplier", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Supplier added.");

  await page.goto("/dashboard/erp/purchase-orders/new");
  await page.getByLabel("Supplier", { exact: true }).selectOption({ label: "Akij Ceramics" });
  await pick(page, "Akij");
  await page.getByLabel("Quantity").first().fill("5");
  await page.getByLabel("Unit price").first().fill("600");
  await page.getByRole("button", { name: "Issue purchase order" }).click();
  await expect(page.getByRole("heading", { name: "Purchase order PO-000001" })).toBeVisible();
  await page.getByRole("button", { name: "Receive goods (GRN)" }).click();
  await expect(page.getByRole("status")).toHaveText("Goods received — stock updated.");
  await page.getByRole("button", { name: "Create bill" }).click();
  await expect(page.getByRole("heading", { name: "Bill BILL-000001" })).toBeVisible();

  await page.goto("/dashboard/erp/payments");
  await page.getByLabel("Supplier", { exact: true }).selectOption({ index: 1 });
  await page.getByLabel("Amount ৳").fill("3000");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByRole("status")).toHaveText("Payment recorded.");

  // Nothing outstanding on either side; stock = 10 − 3 + 5 = 12
  await page.goto("/dashboard/erp/reports");
  await expect(page.getByText("Nothing outstanding.")).toHaveCount(2);
  await page.goto("/dashboard/products");
  await expect(page.getByRole("cell", { name: "12", exact: true })).toBeVisible();
});
