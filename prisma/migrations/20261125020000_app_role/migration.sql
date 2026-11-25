-- ════════════════════════════════════════════════════════════════════
-- Least-privilege runtime role for tenant work.
-- Superusers and roles with BYPASSRLS ignore row-level security even when
-- it is FORCEd, and managed Postgres owner roles are often highly
-- privileged. withTenant() therefore runs `SET LOCAL ROLE lv_app`, so RLS
-- always applies no matter which user the connection string logs in as.
-- ════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lv_app') THEN
    CREATE ROLE lv_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO lv_app;

-- Tenant tables only (all protected by RLS); plans are read-only reference data.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  roles, subscriptions, tenant_modules, document_sequences, audit_logs,
  categories, brands, products, product_images, product_variants,
  warehouses, stock_levels, stock_movements, customers, shipping_zones,
  coupons, orders, order_items, order_events
TO lv_app;
GRANT SELECT ON plans TO lv_app;
GRANT EXECUTE ON FUNCTION app_current_tenant() TO lv_app;

-- Allow the migrating/connecting user to switch into lv_app (PostgreSQL 16+ syntax).
DO $$
BEGIN
  IF NOT pg_has_role(current_user, 'lv_app', 'SET') THEN
    EXECUTE format('GRANT lv_app TO %I WITH SET TRUE', current_user);
  END IF;
END $$;
