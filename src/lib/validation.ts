import { z } from "zod";

const RESERVED = new Set([
  "www", "app", "api", "admin", "dashboard", "login", "register", "logout", "static", "assets",
  "mail", "support", "help", "billing", "status", "docs", "blog", "s", "store", "linkvision",
]);
export const isReservedSlug = (s: string) => RESERVED.has(s);

export function slugify(input: string): string {
  return input
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

const money = z.string().trim().regex(/^\d{1,13}(\.\d{1,2})?$/, "Enter an amount like 1250 or 1250.50");
const optionalMoney = z.preprocess((v) => (v === "" || v === null ? undefined : v), money.optional());
const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => z.preprocess((v) => (v === "" || v === null ? undefined : v), text(max).optional());

export const password = z.string().min(10, "Use at least 10 characters").max(128)
  .regex(/[a-z]/, "Add a lowercase letter").regex(/[A-Z]/, "Add an uppercase letter")
  .regex(/\d/, "Add a number");

export const slugSchema = z.string().trim().toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, "3–40 lowercase letters, numbers or hyphens")
  .refine((s) => !isReservedSlug(s), "That address is reserved");

export const registerSchema = z.object({
  name: text(100).min(2, "Enter your name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  password,
  storeName: text(100).min(2, "Enter a store name"),
  slug: slugSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

export const variantSchema = z.object({
  id: z.string().uuid().optional(),
  title: text(80).min(1).default("Default"),
  sku: optText(64),
  barcode: optText(64),
  onlinePrice: money,
  offlinePrice: optionalMoney,
  compareAtPrice: optionalMoney,
  costPrice: optionalMoney,
  stock: z.coerce.number().int().min(0).max(1_000_000).default(0),
  lowStockThreshold: z.coerce.number().int().min(0).max(100_000).default(5),
});

export const productSchema = z.object({
  name: text(160).min(2, "Enter a product name"),
  categoryId: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
  brandName: optText(80),
  channel: z.enum(["omni", "online", "offline"]).default("omni"),
  shortDescription: optText(300),
  description: optText(10_000),
  status: z.enum(["draft", "active", "archived"]).default("active"),
  isFeatured: z.coerce.boolean().default(false),
  imageUrl: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().max(500).refine((u) => u.startsWith("https://"), "Image URL must use https").optional()),
  variants: z.array(variantSchema).min(1, "Add at least one variant").max(50),
});
export type ProductInput = z.input<typeof productSchema>;

export const productUpdateSchema = productSchema.omit({ variants: true }).partial().extend({
  variants: z.array(variantSchema.omit({ stock: true })).max(50).optional(),
});
export type ProductUpdateInput = z.input<typeof productUpdateSchema>;

export const categorySchema = z.object({
  name: text(80).min(2),
  parentId: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
  description: optText(500),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
});

export const stockAdjustSchema = z.object({
  variantId: z.string().uuid(),
  change: z.coerce.number().int().refine((n) => n !== 0, "Change cannot be zero").refine((n) => Math.abs(n) <= 1_000_000),
  reason: text(200).min(3, "Give a reason"),
});

export const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/, "3–32 letters, numbers, - or _"),
  discountType: z.enum(["percent", "fixed"]),
  value: money,
  minOrder: optionalMoney,
  usageLimit: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(1).optional()),
  expiresAt: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.date().optional()),
});

export const bdPhone = z.string().trim().transform((v) => v.replace(/[\s-]/g, "").replace(/^\+?88/, ""))
  .pipe(z.string().regex(/^01[3-9]\d{8}$/, "Enter a valid Bangladeshi mobile number"));

export const checkoutSchema = z.object({
  name: text(100).min(2, "Enter your name"),
  phone: bdPhone,
  email: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().toLowerCase().email().max(254).optional()),
  address: text(400).min(8, "Enter a full delivery address"),
  zoneId: z.string().uuid("Choose a delivery area"),
  couponCode: optText(32),
  notes: optText(500),
  items: z.array(z.object({ variantId: z.string().uuid(), qty: z.coerce.number().int().min(1).max(99) })).min(1, "Your cart is empty").max(50),
});
export type CheckoutInput = z.input<typeof checkoutSchema>;
