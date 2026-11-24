export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="lv-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b63f6" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#lv-g)" />
      <path d="M13 11v13.5a4.5 4.5 0 0 0 4.5 4.5H27" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="26.5" cy="15.5" r="4.6" fill="none" stroke="#fff" strokeWidth="3" />
      <circle cx="26.5" cy="15.5" r="1.5" fill="#fff" />
    </svg>
  );
}

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className="leading-none">
        <span className={`block text-[15px] font-bold tracking-tight ${dark ? "text-white" : "text-slate-900"}`}>Link Vision</span>
        <span className={`block text-[10.5px] font-semibold uppercase tracking-[0.18em] ${dark ? "text-brand-200" : "text-brand-600"}`}>Commerce</span>
      </span>
    </span>
  );
}
