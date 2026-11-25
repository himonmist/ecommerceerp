"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";

type Item = { href: string; label: string; icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode; exact?: boolean };
const STORE: Item[] = [
  { href: "/dashboard", label: "Overview", icon: Icon.home, exact: true },
  { href: "/dashboard/orders", label: "Orders", icon: Icon.cart },
  { href: "/dashboard/products", label: "Products", icon: Icon.box },
  { href: "/dashboard/categories", label: "Categories", icon: Icon.layers },
  { href: "/dashboard/inventory", label: "Inventory", icon: Icon.chart },
  { href: "/dashboard/locations", label: "Locations", icon: Icon.store },
  { href: "/dashboard/coupons", label: "Coupons", icon: Icon.tag },
];
const POS: Item[] = [{ href: "/dashboard/pos", label: "Point of sale", icon: Icon.bolt }];
const SALES: Item[] = [
  { href: "/dashboard/erp", label: "ERP hub", icon: Icon.bolt, exact: true },
  { href: "/dashboard/erp/invoices", label: "Sales invoices", icon: Icon.cart },
  { href: "/dashboard/erp/quotations", label: "Quotations", icon: Icon.tag },
  { href: "/dashboard/erp/receipts", label: "Receive payment", icon: Icon.chart },
  { href: "/dashboard/erp/customers", label: "Customers", icon: Icon.users },
];
const PURCHASE: Item[] = [
  { href: "/dashboard/erp/purchase-orders", label: "Purchase orders", icon: Icon.truck },
  { href: "/dashboard/erp/bills", label: "Supplier bills", icon: Icon.box },
  { href: "/dashboard/erp/payments", label: "Pay suppliers", icon: Icon.chart },
  { href: "/dashboard/erp/suppliers", label: "Suppliers", icon: Icon.store },
  { href: "/dashboard/erp/reports", label: "Dues & aging", icon: Icon.layers },
];
const ACCOUNTING: Item[] = [
  { href: "/dashboard/accounting", label: "Books overview", icon: Icon.chart, exact: true },
  { href: "/dashboard/accounting/journals", label: "Entries & vouchers", icon: Icon.layers },
  { href: "/dashboard/accounting/accounts", label: "Chart of accounts", icon: Icon.box },
  { href: "/dashboard/accounting/reports", label: "Financial reports", icon: Icon.tag },
];
const SETTINGS: Item[] = [{ href: "/dashboard/settings", label: "Settings", icon: Icon.settings }];

function Group({ title, items, path }: { title?: string; items: Item[]; path: string }) {
  return (
    <div className="flex gap-1 lg:flex-col">
      {title && <p className="hidden px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-widest text-slate-500 lg:block">{title}</p>}
      {items.map(({ href, label, icon: I, exact }) => {
        const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>
            <I className="h-5 w-5" />{label}
          </Link>
        );
      })}
    </div>
  );
}

export function DashboardNav({ erp, accounting, pos }: { erp: boolean; accounting: boolean; pos: boolean }) {
  const path = usePathname();
  return (
    <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      <Group items={STORE} path={path} />
      {pos && <Group title="In-store" items={POS} path={path} />}
      {erp && <Group title="ERP · Sales" items={SALES} path={path} />}
      {erp && <Group title="ERP · Purchase" items={PURCHASE} path={path} />}
      {accounting && <Group title="Accounting" items={ACCOUNTING} path={path} />}
      <Group title="Account" items={SETTINGS} path={path} />
    </nav>
  );
}
