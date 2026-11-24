-- ════════════════════════════════════════════════════════════════════
-- Defence in depth: tenant isolation via FORCE ROW LEVEL SECURITY,
-- data-integrity CHECK constraints and append-only audit trails.
-- The application sets `app.tenant_id` with set_config(..., true) inside
-- every tenant transaction (src/server/db/tenant.ts). With no tenant set,
-- tenant tables return zero rows and reject writes.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'roles','subscriptions','tenant_modules','document_sequences','audit_logs',
    'categories','brands','products','product_images','product_variants',
    'warehouses','stock_levels','stock_movements','customers','shipping_zones',
    'coupons','orders','order_items','order_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())',
      t);
  END LOOP;
END $$;

-- ── Integrity constraints ──────────────────────────────────────────
ALTER TABLE stock_levels
  ADD CONSTRAINT stock_on_hand_nonneg CHECK (on_hand >= 0),
  ADD CONSTRAINT stock_reserved_nonneg CHECK (reserved >= 0),
  ADD CONSTRAINT stock_no_oversell CHECK (reserved <= on_hand);

ALTER TABLE product_variants
  ADD CONSTRAINT variant_prices_nonneg CHECK (
    online_price >= 0 AND cost_price >= 0
    AND (offline_price IS NULL OR offline_price >= 0)
    AND (compare_at_price IS NULL OR compare_at_price >= 0));

ALTER TABLE order_items
  ADD CONSTRAINT order_item_qty_pos CHECK (qty > 0),
  ADD CONSTRAINT order_item_money_nonneg CHECK (unit_price >= 0 AND line_total >= 0);

ALTER TABLE orders
  ADD CONSTRAINT order_money_nonneg CHECK (subtotal >= 0 AND discount >= 0 AND shipping_fee >= 0 AND total >= 0),
  ADD CONSTRAINT order_status_valid CHECK (status IN
    ('pending','confirmed','preparing','ready','packed','shipped','out_for_delivery','delivered','cancelled','returned')),
  ADD CONSTRAINT order_payment_status_valid CHECK (payment_status IN ('unpaid','paid','refunded'));

ALTER TABLE coupons
  ADD CONSTRAINT coupon_type_valid CHECK (discount_type IN ('percent','fixed')),
  ADD CONSTRAINT coupon_value_valid CHECK (value > 0 AND (discount_type <> 'percent' OR value <= 100)),
  ADD CONSTRAINT coupon_used_within_limit CHECK (usage_limit IS NULL OR used <= usage_limit);

ALTER TABLE tenants
  ADD CONSTRAINT tenant_slug_format CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$');

ALTER TABLE users ADD CONSTRAINT user_email_lower CHECK (email = lower(email));

-- ── Append-only trails ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER stock_movements_append_only BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER order_events_append_only BEFORE UPDATE OR DELETE ON order_events
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ── Search performance ────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX customers_phone_trgm ON customers USING gin (phone gin_trgm_ops);
