// Plan catalogue (no server-only import so the seed script and landing page can share it).
export const PLAN_SEED = [
  { code: "launch", name: "Launch (10-day trial)", priceMonthly: "0", priceYearly: "0", maxProducts: null, maxSeats: null, sortOrder: 1,
    features: ["Full storefront & all templates", "Unlimited products during trial", "Orders, inventory & shipping zones", "Coupons & customers"] },
  { code: "build", name: "Build", priceMonthly: "1000", priceYearly: "10000", maxProducts: 200, maxSeats: 2, sortOrder: 2,
    features: ["Up to 200 products", "2 team members", "Custom domain", "Coupons, zones & reports"] },
  { code: "dominate", name: "Dominate", priceMonthly: "2000", priceYearly: "20000", maxProducts: null, maxSeats: null, sortOrder: 3,
    features: ["Unlimited products", "Unlimited team members", "Priority support", "Early access to ERP & POS modules"] },
] as const;
