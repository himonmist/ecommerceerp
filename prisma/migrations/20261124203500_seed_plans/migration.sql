-- Reference data required for sign-up. Idempotent; prices are editable later.
INSERT INTO plans (id, code, name, price_monthly, price_yearly, max_products, max_seats, features, sort_order) VALUES
  (gen_random_uuid(), 'launch', 'Launch (10-day trial)', 0, 0, NULL, NULL,
   ARRAY['Full storefront & all templates','Unlimited products during trial','Orders, inventory & shipping zones','Coupons & customers'], 1),
  (gen_random_uuid(), 'build', 'Build', 1000, 10000, 200, 2,
   ARRAY['Up to 200 products','2 team members','Custom domain','Coupons, zones & reports'], 2),
  (gen_random_uuid(), 'dominate', 'Dominate', 2000, 20000, NULL, NULL,
   ARRAY['Unlimited products','Unlimited team members','Priority support','Early access to ERP & POS modules'], 3)
ON CONFLICT (code) DO NOTHING;
