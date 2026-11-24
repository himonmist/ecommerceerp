import type { SVGProps } from "react";
const base = (p: SVGProps<SVGSVGElement>) => ({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...p });
export const Icon = {
  store: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 9l1.5-5h15L21 9M3 9h18M3 9a3 3 0 0 0 6 0m0 0a3 3 0 0 0 6 0m0 0a3 3 0 0 0 6 0M5 12v8h14v-8" /></svg>,
  box: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" /></svg>,
  cart: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" /><circle cx="10" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" /></svg>,
  truck: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>,
  chart: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  shield: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></svg>,
  layers: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5" /></svg>,
  users: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" /></svg>,
  tag: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 12V3h9l9 9-9 9-9-9z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>,
  bolt: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg>,
  home: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9z" /></svg>,
  settings: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>,
  check: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M5 12l5 5L20 7" /></svg>,
  arrow: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  lock: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>,
  logout: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M15 4h4v16h-4M10 17l5-5-5-5M15 12H3" /></svg>,
  search: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>,
  plus: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>,
  external: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>,
};
