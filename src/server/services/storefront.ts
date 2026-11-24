import "server-only";
import { prisma } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { slugSchema } from "@/lib/validation";

const PUBLIC_CHANNELS = ["omni", "online"];

export async function getStorefront(slug: string) {
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) return null;
  const tenant = await prisma.tenant.findUnique({ where: { slug: parsed.data } });
  if (!tenant || tenant.status === "suspended") return null;
  const { zones, categories } = await withTenant(tenant.id, async (tx) => ({
    zones: await tx.shippingZone.findMany({ where: { enabled: true }, orderBy: { sortOrder: "asc" } }),
    categories: await tx.category.findMany({ where: { status: "active" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  }));
  return {
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, tagline: tenant.tagline, announcement: tenant.announcement,
      contactEmail: tenant.contactEmail, contactPhone: tenant.contactPhone },
    zones: zones.map((z) => ({ id: z.id, name: z.name, charge: z.charge.toString(), eta: z.eta })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
  };
}

function shape(p: { id: string; name: string; slug: string; shortDescription: string | null; description: string | null; isFeatured: boolean;
  category: { name: string; slug: string } | null; images: { url: string }[];
  variants: { id: string; title: string; onlinePrice: { toString(): string }; compareAtPrice: { toString(): string } | null; stockLevels: { onHand: number; reserved: number }[] }[] }) {
  return {
    id: p.id, name: p.name, slug: p.slug, shortDescription: p.shortDescription, description: p.description, isFeatured: p.isFeatured,
    category: p.category ? { name: p.category.name, slug: p.category.slug } : null,
    image: p.images[0]?.url ?? null,
    variants: p.variants.map((v) => ({
      id: v.id, title: v.title, price: v.onlinePrice.toString(), compareAt: v.compareAtPrice?.toString() ?? null,
      available: v.stockLevels.reduce((a, s) => a + (s.onHand - s.reserved), 0),
    })),
  };
}
export type StorefrontProduct = ReturnType<typeof shape>;

const include = {
  category: { select: { name: true, slug: true } },
  images: { take: 1, orderBy: { sortOrder: "asc" as const } },
  variants: { include: { stockLevels: true }, orderBy: { isDefault: "desc" as const } },
};

export async function listStorefrontProducts(tenantId: string, opts: { category?: string; q?: string; take?: number } = {}) {
  const q = opts.q?.trim().slice(0, 100);
  const rows = await withTenant(tenantId, (tx) => tx.product.findMany({
    where: {
      status: "active", channel: { in: PUBLIC_CHANNELS },
      ...(opts.category ? { category: { slug: opts.category } } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }], take: Math.min(opts.take ?? 48, 96), include,
  }));
  return rows.map(shape);
}

export async function getStorefrontProduct(tenantId: string, slug: string) {
  const p = await withTenant(tenantId, (tx) => tx.product.findFirst({ where: { slug, status: "active", channel: { in: PUBLIC_CHANNELS } }, include }));
  return p ? shape(p) : null;
}
