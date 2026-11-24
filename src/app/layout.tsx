import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: "Link Vision Commerce — Storefront, Orders & ERP for growing businesses", template: "%s · Link Vision Commerce" },
  description: "Link Vision Software Solution's all-in-one commerce platform: launch a storefront, manage products, stock and orders, ship with local couriers and grow — from one secure dashboard.",
  applicationName: "Link Vision Commerce",
  openGraph: { type: "website", siteName: "Link Vision Commerce", title: "Link Vision Commerce", description: "Sell online, manage stock and orders — one secure dashboard." },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#2a45e0", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
