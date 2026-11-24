import { expect, test, type Page } from "@playwright/test";

const id = Date.now().toString(36);
const slug = `e2e-${id}`;
const email = `owner-${id}@example.com`;
const password = "Str0ng!Passw0rd";

async function register(page: Page) {
  await page.goto("/register");
  await page.getByLabel("Your name").fill("Nadia Rahman");
  await page.getByLabel("Store name").fill(`E2E Store ${id}`);
  await page.getByLabel("Store address").fill(slug);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create my store" }).click();
  await expect(page).toHaveURL(/\/dashboard\?welcome=1/);
}

test.describe.serial("merchant journey", () => {
  test("register → add product → shopper checks out → merchant delivers", async ({ page, context }) => {
    await register(page);
    await expect(page.getByRole("heading", { name: /Your store is live/ })).toBeVisible();

    // Session cookie is HttpOnly and SameSite=Lax
    const cookie = (await context.cookies()).find((c) => c.name.includes("lv_session"));
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");

    // Add a product with opening stock
    await page.getByRole("link", { name: "Add first product" }).click();
    await page.getByLabel("Product name").fill("Akij 32 Pcs Dinner Set");
    await page.getByLabel("Online price ৳").fill("5000");
    await page.getByLabel("Opening stock").fill("3");
    await page.getByRole("button", { name: "Create product" }).click();
    await expect(page.getByRole("status")).toContainText("Product created.");

    // Shopper: storefront → product → cart → checkout
    const shop = await context.newPage();
    await shop.goto(`/s/${slug}`);
    await shop.getByRole("link", { name: /Akij 32 Pcs Dinner Set/ }).first().click();
    await expect(shop.getByText("Only 3 left")).toBeVisible();
    await shop.getByRole("button", { name: "Buy now" }).click();
    await expect(shop).toHaveURL(new RegExp(`/s/${slug}/cart$`));
    await shop.getByLabel("Full name").fill("Rahim Uddin");
    await shop.getByLabel("Mobile number").fill("01712345678");
    await shop.getByLabel("Full address").fill("House 12, Road 4, Dhanmondi, Dhaka");
    await shop.getByRole("button", { name: /Place order/ }).click();
    await expect(shop.getByRole("heading", { name: "Thank you! Your order is placed." })).toBeVisible();
    await expect(shop.getByText("ORD-000001", { exact: true })).toBeVisible();
    await expect(shop.getByText("৳5,070.00")).toBeVisible(); // 5000 + Inside Dhaka 70

    // Merchant: order appears and moves through the lifecycle
    await page.goto("/dashboard/orders");
    await page.getByRole("link", { name: "ORD-000001" }).click();
    for (const step of ["confirmed", "preparing", "ready", "packed", "shipped", "delivered"]) {
      await page.getByRole("button", { name: `Mark ${step}`, exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("Order updated.");
    }
    await expect(page.getByText("Paid", { exact: true })).toBeVisible();

    // Stock ledger shows opening + sale
    await page.goto("/dashboard/inventory");
    await expect(page.getByRole("cell", { name: "Sale" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Opening stock" }).first()).toBeVisible();
  });

  test("blocks anonymous dashboard access and rejects bad logins generically", async ({ page }) => {
    await page.goto("/dashboard/orders");
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("shows validation errors instead of accepting bad checkout data", async ({ page }) => {
    await page.goto(`/s/${slug}`);
    await page.getByRole("link", { name: /Akij 32 Pcs Dinner Set/ }).first().click();
    await page.getByRole("button", { name: "Buy now" }).click();
    await page.getByLabel("Full name").fill("R");
    await page.getByLabel("Mobile number").fill("12345");
    await page.getByLabel("Full address").fill("short");
    await page.getByRole("button", { name: /Place order/ }).click();
    await expect(page.getByText("Enter a valid Bangladeshi mobile number")).toBeVisible();
    await expect(page.getByText("Enter a full delivery address")).toBeVisible();
  });

  test("returns 404 for unknown stores and other stores' orders", async ({ page }) => {
    expect((await page.goto("/s/no-such-store-here"))?.status()).toBe(404);
    expect((await page.goto(`/s/${slug}/order/0190f5b8-3c2a-7b1e-9a0d-1f2e3d4c5b6a`))?.status()).toBe(404);
  });
});
