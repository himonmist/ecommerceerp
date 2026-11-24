"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";

const ITEMS = [
  { href: "/dashboard", label: "Overview", icon: Icon.home, exact: true },
  { href: "/dashboard/orders", label: "Orders", icon: Icon.cart },
  { href: "/dashboard/products", label: "Products", icon: Icon.box },
  { href: "/dashboard/categories", label: "Categories", icon: Icon.layers },
  { href: "/dashboard/inventory", label: "Inventory", icon: Icon.chart },
  { href: "/dashboard/coupons", label: "Coupons", icon: Icon.tag },
  { href: "/dashboard/settings", label: "Settings", icon: Icon.settings },
];

export function DashboardNav() {
  const path = usePathname();
  return (
    <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto lg:flex-col">
      {ITEMS.map(({ href, label, icon: I, exact }) => {
        const active = exact ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>
            <I className="h-5 w-5" />{label}
          </Link>
        );
      })}
    </nav>
  );
}
