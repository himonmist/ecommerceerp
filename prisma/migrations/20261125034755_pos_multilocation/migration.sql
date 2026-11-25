-- AlterTable
ALTER TABLE "sales_invoices" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'erp',
ADD COLUMN     "shift_id" UUID;

-- CreateTable
CREATE TABLE "pos_registers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_shifts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "register_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "opening_float" DECIMAL(18,2) NOT NULL,
    "opened_by" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_cash" DECIMAL(18,2),
    "counted_cash" DECIMAL(18,2),
    "variance" DECIMAL(18,2),
    "closed_by" UUID,
    "closed_at" TIMESTAMPTZ(6),
    "notes" TEXT,

    CONSTRAINT "pos_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_cash_movements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "from_warehouse_id" UUID NOT NULL,
    "to_warehouse_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "carrier" TEXT,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pos_registers_tenant_id_name_key" ON "pos_registers"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "pos_shifts_register_id_status_idx" ON "pos_shifts"("register_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pos_shifts_tenant_id_number_key" ON "pos_shifts"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_tenant_id_number_key" ON "stock_transfers"("tenant_id", "number");

-- AddForeignKey
ALTER TABLE "pos_shifts" ADD CONSTRAINT "pos_shifts_register_id_fkey" FOREIGN KEY ("register_id") REFERENCES "pos_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_cash_movements" ADD CONSTRAINT "pos_cash_movements_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "pos_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Isolation, least privilege and integrity for POS & transfers ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lv_app') THEN
    CREATE ROLE lv_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pos_registers','pos_shifts','pos_cash_movements','stock_transfers','stock_transfer_items'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO lv_app', t);
  END LOOP;
END $$;

-- At most one open shift per register (concurrent "open shift" clicks can't both win).
CREATE UNIQUE INDEX pos_one_open_shift ON pos_shifts (register_id) WHERE status = 'open';

ALTER TABLE pos_shifts
  ADD CONSTRAINT shift_status_valid CHECK (status IN ('open','closed')),
  ADD CONSTRAINT shift_money_valid CHECK (opening_float >= 0 AND (counted_cash IS NULL OR counted_cash >= 0)),
  ADD CONSTRAINT shift_closed_complete CHECK (status = 'open' OR (closed_at IS NOT NULL AND counted_cash IS NOT NULL AND expected_cash IS NOT NULL));
ALTER TABLE pos_cash_movements
  ADD CONSTRAINT cash_move_type_valid CHECK (type IN ('cash_drop','pay_in','pay_out')),
  ADD CONSTRAINT cash_move_amount_pos CHECK (amount > 0);
ALTER TABLE stock_transfers ADD CONSTRAINT transfer_distinct_locations CHECK (from_warehouse_id <> to_warehouse_id);
ALTER TABLE stock_transfer_items ADD CONSTRAINT transfer_qty_pos CHECK (qty > 0);
ALTER TABLE sales_invoices ADD CONSTRAINT si_channel_valid CHECK (channel IN ('erp','pos'));

CREATE TRIGGER pos_cash_movements_append_only BEFORE UPDATE OR DELETE ON pos_cash_movements
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
