import { notFound } from "next/navigation";
import { getStorefront } from "@/server/services/storefront";
import { Checkout } from "./checkout";

export const metadata = { title: "Cart & checkout", robots: { index: false } };

export default async function CartPage({ params }: { params: Promise<{ slug: string }> }) {
  const sf = await getStorefront((await params).slug);
  if (!sf) notFound();
  return <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6"><Checkout slug={sf.tenant.slug} zones={sf.zones} /></div>;
}
