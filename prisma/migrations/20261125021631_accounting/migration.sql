-- CreateTable
CREATE TABLE "ledger_settings" (
    "tenant_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_through" DATE,

    CONSTRAINT "ledger_settings_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nature" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,
    "system_key" TEXT,
    "kind" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "voucher_type" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "source_type" TEXT,
    "source_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "amount" DECIMAL(18,2) NOT NULL,
    "reverses_journal_id" UUID,
    "reversed_by_id" UUID,
    "cancel_reason" TEXT,
    "created_by" UUID,
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "party_type" TEXT,
    "party_id" UUID,
    "memo" TEXT,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_tenant_id_code_key" ON "accounts"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_tenant_id_system_key_key" ON "accounts"("tenant_id", "system_key");

-- CreateIndex
CREATE INDEX "journals_tenant_id_date_idx" ON "journals"("tenant_id", "date");

-- CreateIndex
CREATE INDEX "journals_tenant_id_source_type_source_id_idx" ON "journals"("tenant_id", "source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "journals_tenant_id_number_key" ON "journals"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "journal_lines_tenant_id_account_id_idx" ON "journal_lines"("tenant_id", "account_id");

-- CreateIndex
CREATE INDEX "journal_lines_journal_id_idx" ON "journal_lines"("journal_id");

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════
-- Double-entry guarantees enforced by the database itself.
-- ════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lv_app') THEN
    CREATE ROLE lv_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ledger_settings','accounts','journals','journal_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO lv_app', t);
  END LOOP;
END $$;

ALTER TABLE accounts
  ADD CONSTRAINT account_nature_valid CHECK (nature IN ('asset','liability','equity','income','expense')),
  ADD CONSTRAINT account_kind_valid CHECK (kind IS NULL OR kind IN ('cash','bank','wallet'));
ALTER TABLE journals
  ADD CONSTRAINT journal_status_valid CHECK (status IN ('draft','approved','verified','cancelled','void')),
  ADD CONSTRAINT journal_type_valid CHECK (voucher_type IN ('CV','DV','JV','TM','SYS')),
  ADD CONSTRAINT journal_amount_pos CHECK (amount > 0);
ALTER TABLE journal_lines
  ADD CONSTRAINT line_amounts_valid CHECK (debit >= 0 AND credit >= 0 AND ((debit > 0) <> (credit > 0)));

-- 1) Every journal balances (checked at COMMIT, so lines can be inserted one by one).
CREATE OR REPLACE FUNCTION check_journal_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE jid uuid; d numeric; c numeric; n int; amt numeric;
BEGIN
  jid := COALESCE(NEW.journal_id, OLD.journal_id);
  SELECT amount INTO amt FROM journals WHERE id = jid;
  IF NOT FOUND THEN RETURN NULL; END IF; -- journal deleted (draft) in the same transaction
  SELECT COALESCE(sum(debit),0), COALESCE(sum(credit),0), count(*) INTO d, c, n FROM journal_lines WHERE journal_id = jid;
  IF n < 2 OR d <> c OR d <> amt THEN
    RAISE EXCEPTION 'journal % is unbalanced (debit %, credit %, amount %, lines %)', jid, d, c, amt, n USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_lines_balanced AFTER INSERT OR UPDATE OR DELETE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_journal_balanced();

-- 2) Lines are immutable once their journal leaves draft; no lines can be added to an
--    existing posted journal (only in the transaction that created it).
CREATE OR REPLACE FUNCTION guard_journal_lines() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE st text; created_here boolean;
BEGIN
  SELECT status, (xmin::text::bigint = (pg_current_xact_id()::text::bigint % 4294967296)) INTO st, created_here
  FROM journals WHERE id = COALESCE(NEW.journal_id, OLD.journal_id);
  IF st IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'INSERT' THEN
    IF st <> 'draft' AND NOT created_here THEN RAISE EXCEPTION 'cannot add lines to a posted journal' USING ERRCODE = 'insufficient_privilege'; END IF;
    RETURN NEW;
  END IF;
  IF st <> 'draft' THEN RAISE EXCEPTION 'posted journal lines are immutable; post a reversal instead' USING ERRCODE = 'insufficient_privilege'; END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER journal_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION guard_journal_lines();

-- 3) Posted journals: only status transitions and reversal bookkeeping may change; drafts only may be deleted.
CREATE OR REPLACE FUNCTION guard_journals() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'posted journals cannot be deleted' USING ERRCODE = 'insufficient_privilege'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' THEN
    IF NEW.date <> OLD.date OR NEW.amount <> OLD.amount OR NEW.number <> OLD.number OR NEW.voucher_type <> OLD.voucher_type
       OR NEW.description <> OLD.description OR NEW.source_id IS DISTINCT FROM OLD.source_id THEN
      RAISE EXCEPTION 'posted journals are immutable; post a reversal instead' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT ((OLD.status = NEW.status) OR (OLD.status = 'approved' AND NEW.status IN ('verified','cancelled')) OR (OLD.status = 'verified' AND NEW.status = 'cancelled')) THEN
      RAISE EXCEPTION 'invalid journal status change % -> %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER journals_guard BEFORE UPDATE OR DELETE ON journals FOR EACH ROW EXECUTE FUNCTION guard_journals();

-- 4) Period lock: nothing may be posted on or before ledger_settings.locked_through.
CREATE OR REPLACE FUNCTION guard_period_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE lock date;
BEGIN
  IF NEW.status IN ('draft','void') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' THEN RETURN NEW; END IF; -- verify/cancel bookkeeping on existing postings
  SELECT locked_through INTO lock FROM ledger_settings WHERE tenant_id = NEW.tenant_id;
  IF lock IS NOT NULL AND NEW.date <= lock THEN
    RAISE EXCEPTION 'period closed: cannot post on or before %', lock USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER journals_period_lock BEFORE INSERT OR UPDATE ON journals FOR EACH ROW EXECUTE FUNCTION guard_period_lock();
