import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge proxy: per-request CSP nonce + storefront subdomain routing.
 * {slug}.ROOT_DOMAIN → /s/{slug}/... (path-based /s/{slug} also works everywhere).
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);

  let response: NextResponse;
  const root = process.env.ROOT_DOMAIN;
  const host = (request.headers.get("host") ?? "").split(":")[0]!.toLowerCase();
  const sub = root && host.endsWith(`.${root}`) ? host.slice(0, -(root.length + 1)) : null;
  if (sub && sub !== "www" && /^[a-z0-9-]{3,40}$/.test(sub)) {
    const url = request.nextUrl.clone();
    url.pathname = `/s/${sub}${url.pathname === "/" ? "" : url.pathname}`;
    response = NextResponse.rewrite(url, { request: { headers } });
  } else {
    response = NextResponse.next({ request: { headers } });
  }
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    { source: "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|svg|webp|ico)$).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] },
  ],
};
