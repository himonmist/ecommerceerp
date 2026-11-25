-- DropIndex
DROP INDEX "customers_phone_trgm";

-- DropIndex
DROP INDEX "products_name_trgm";

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "advance_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "credit_limit" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "customer_type_id" UUID,
ADD COLUMN     "membership_id" TEXT,
ADD COLUMN     "opening_due" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "customer_types" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "credit_days" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "customer_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "valid_until" DATE,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "vat_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "additional_charge" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "terms" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "converted_invoice_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "quotation_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vat_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "customer_id" UUID,
    "customer_name" TEXT NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "quotation_id" UUID,
    "invoice_date" DATE NOT NULL,
    "due_date" DATE,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "vat_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "additional_charge" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "returned" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "payment_status" TEXT NOT NULL DEFAULT 'unpaid',
    "notes" TEXT,
    "created_by" UUID,
    "journal_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoice_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "returned_qty" INTEGER NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vat_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(18,2) NOT NULL,
    "unit_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "sales_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_receipts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "customer_id" UUID,
    "date" DATE NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "to_advance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "from_advance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "notes" TEXT,
    "created_by" UUID,
    "journal_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_allocations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "invoice_id" UUID,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "receipt_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_returns" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "invoice_id" UUID NOT NULL,
    "customer_id" UUID,
    "date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reduce_due" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "to_advance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "refund_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "restock" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_return_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "invoice_item_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "sales_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_types" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "supplier_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "supplier_type_id" UUID,
    "name" TEXT NOT NULL,
    "contact_person" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "opening_due" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "advance_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "order_date" DATE NOT NULL,
    "expected_date" DATE,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "vat_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "additional_charge" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "terms" TEXT,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "po_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "received_qty" INTEGER NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(18,2) NOT NULL,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vat_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "po_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "received_date" DATE NOT NULL,
    "bill_id" UUID,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "grn_id" UUID NOT NULL,
    "po_item_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_cost" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "goods_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_bills" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "supplier_bill_no" TEXT,
    "supplier_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "grn_id" UUID,
    "bill_date" DATE NOT NULL,
    "due_date" DATE,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "vat_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "additional_charge" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "returned" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "payment_status" TEXT NOT NULL DEFAULT 'unpaid',
    "notes" TEXT,
    "created_by" UUID,
    "journal_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_bill_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "bill_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "returned_qty" INTEGER NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(18,2) NOT NULL,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vat_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "purchase_bill_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "to_advance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "from_advance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "notes" TEXT,
    "created_by" UUID,
    "journal_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "bill_id" UUID,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_returns" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "bill_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reduce_due" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "to_advance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "refund_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_return_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "bill_item_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "purchase_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_types_tenant_id_name_key" ON "customer_types"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_tenant_id_number_key" ON "quotations"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "sales_invoices_tenant_id_customer_id_invoice_date_idx" ON "sales_invoices"("tenant_id", "customer_id", "invoice_date");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_tenant_id_number_key" ON "sales_invoices"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "customer_receipts_tenant_id_number_key" ON "customer_receipts"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_returns_tenant_id_number_key" ON "sales_returns"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_types_tenant_id_name_key" ON "supplier_types"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenant_id_name_key" ON "suppliers"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenant_id_number_key" ON "purchase_orders"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_tenant_id_number_key" ON "goods_receipts"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "purchase_bills_tenant_id_supplier_id_bill_date_idx" ON "purchase_bills"("tenant_id", "supplier_id", "bill_date");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_bills_tenant_id_number_key" ON "purchase_bills"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payments_tenant_id_number_key" ON "supplier_payments"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_returns_tenant_id_number_key" ON "purchase_returns"("tenant_id", "number");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_customer_type_id_fkey" FOREIGN KEY ("customer_type_id") REFERENCES "customer_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_items" ADD CONSTRAINT "sales_invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_items" ADD CONSTRAINT "sales_invoice_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "customer_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "sales_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_supplier_type_id_fkey" FOREIGN KEY ("supplier_type_id") REFERENCES "supplier_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_bills" ADD CONSTRAINT "purchase_bills_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_bill_items" ADD CONSTRAINT "purchase_bill_items_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "purchase_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_bill_items" ADD CONSTRAINT "purchase_bill_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "supplier_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "purchase_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "purchase_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "purchase_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Tenant isolation, least privilege and integrity for ERP tables ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customer_types','quotations','quotation_items','sales_invoices','sales_invoice_items',
    'customer_receipts','receipt_allocations','sales_returns','sales_return_items',
    'supplier_types','suppliers','purchase_orders','purchase_order_items','goods_receipts',
    'goods_receipt_items','purchase_bills','purchase_bill_items','supplier_payments',
    'payment_allocations','purchase_returns','purchase_return_items'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO lv_app', t);
  END LOOP;
END $$;

ALTER TABLE customers
  ADD CONSTRAINT customer_money_nonneg CHECK (credit_limit >= 0 AND opening_due >= 0 AND advance_balance >= 0);
ALTER TABLE suppliers
  ADD CONSTRAINT supplier_money_nonneg CHECK (opening_due >= 0 AND advance_balance >= 0);

ALTER TABLE sales_invoices
  ADD CONSTRAINT si_status_valid CHECK (status IN ('posted','void')),
  ADD CONSTRAINT si_money_valid CHECK (subtotal >= 0 AND total >= 0 AND paid >= 0 AND returned >= 0 AND paid + returned <= total);
ALTER TABLE sales_invoice_items
  ADD CONSTRAINT sii_qty_valid CHECK (qty > 0 AND returned_qty >= 0 AND returned_qty <= qty);
ALTER TABLE purchase_bills
  ADD CONSTRAINT pb_status_valid CHECK (status IN ('posted','void')),
  ADD CONSTRAINT pb_money_valid CHECK (subtotal >= 0 AND total >= 0 AND paid >= 0 AND returned >= 0 AND paid + returned <= total);
ALTER TABLE purchase_bill_items
  ADD CONSTRAINT pbi_qty_valid CHECK (qty > 0 AND returned_qty >= 0 AND returned_qty <= qty);
ALTER TABLE purchase_order_items
  ADD CONSTRAINT poi_qty_valid CHECK (qty > 0 AND received_qty >= 0 AND received_qty <= qty);
ALTER TABLE purchase_orders
  ADD CONSTRAINT po_status_valid CHECK (status IN ('issued','partially_received','received','cancelled'));
ALTER TABLE quotations
  ADD CONSTRAINT q_status_valid CHECK (status IN ('draft','sent','accepted','rejected','converted'));
ALTER TABLE customer_receipts ADD CONSTRAINT cr_amount_pos CHECK (amount > 0 AND to_advance >= 0 AND from_advance >= 0);
ALTER TABLE supplier_payments ADD CONSTRAINT sp_amount_pos CHECK (amount > 0 AND to_advance >= 0 AND from_advance >= 0);
ALTER TABLE receipt_allocations ADD CONSTRAINT ra_amount_pos CHECK (amount > 0);
ALTER TABLE payment_allocations ADD CONSTRAINT pa_amount_pos CHECK (amount > 0);
