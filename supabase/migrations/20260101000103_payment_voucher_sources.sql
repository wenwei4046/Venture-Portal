-- ============================================================================
-- 20260101000103_payment_voucher_sources.sql
-- Phase 7 Step 4 — payment_voucher_sources subtable
--
-- Each voucher can now debit up to 3 pools. The existing single-value
-- payment_vouchers.source_pool is kept for backward-compat reads; new
-- multi-source writes happen through this subtable. The app layer (Step 5+6)
-- will migrate reads to this table and stop writing source_pool in Step 16.
--
-- Triggers:
--   - pvs_max_three_trigger: BEFORE INSERT, reject >3 rows per voucher
--   - pvs_sum_matches_trigger: AFTER INSERT/UPDATE/DELETE, reject if the
--     sum != parent voucher.amount (enforced only once voucher is
--     approved/paid; drafts can have partial sums while the user builds them)
--
-- Backfill: one row per existing voucher where source_pool IS NOT NULL
--           (amount = voucher.amount, pool = voucher.source_pool).
-- ============================================================================

BEGIN;

-- ─── 1) Schema ──────────────────────────────────────────────────────────────
CREATE TABLE payment_voucher_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_id UUID NOT NULL REFERENCES payment_vouchers(id) ON DELETE CASCADE,
    pool TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pvs_amount_positive CHECK (amount > 0)
);

CREATE INDEX pvs_voucher_idx ON payment_voucher_sources(voucher_id);

COMMENT ON TABLE payment_voucher_sources IS
    'Phase 7: up to 3 pool debits per voucher. Sum matches voucher.amount on approved/paid. Replaces the single source_pool column.';

-- ─── 2) Trigger: max 3 rows per voucher ─────────────────────────────────────
CREATE OR REPLACE FUNCTION pvs_enforce_max_three()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF (SELECT COUNT(*) FROM payment_voucher_sources WHERE voucher_id = NEW.voucher_id) >= 3 THEN
        RAISE EXCEPTION
            'payment_voucher_sources: max 3 rows per voucher (voucher_id=%)',
            NEW.voucher_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER pvs_max_three_trigger
BEFORE INSERT ON payment_voucher_sources
FOR EACH ROW EXECUTE FUNCTION pvs_enforce_max_three();

-- ─── 3) Trigger: sum matches voucher.amount on approved/paid ────────────────
CREATE OR REPLACE FUNCTION pvs_enforce_sum_matches_voucher()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_voucher_id UUID;
    v_voucher_amount DECIMAL;
    v_voucher_status TEXT;
    v_sum DECIMAL;
BEGIN
    v_voucher_id := COALESCE(NEW.voucher_id, OLD.voucher_id);

    SELECT amount, status::TEXT
    INTO v_voucher_amount, v_voucher_status
    FROM payment_vouchers WHERE id = v_voucher_id;

    -- Drafts may have partial sums while Finance is editing.
    -- Only enforce once the voucher is locked in (approved or paid).
    IF v_voucher_status NOT IN ('approved', 'paid') THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_sum
    FROM payment_voucher_sources WHERE voucher_id = v_voucher_id;

    IF v_sum <> v_voucher_amount THEN
        RAISE EXCEPTION
            'payment_voucher_sources sum (%) does not match voucher.amount (%) for voucher %',
            v_sum, v_voucher_amount, v_voucher_id;
    END IF;

    RETURN NULL;
END;
$$;

CREATE TRIGGER pvs_sum_matches_trigger
AFTER INSERT OR UPDATE OR DELETE ON payment_voucher_sources
FOR EACH ROW EXECUTE FUNCTION pvs_enforce_sum_matches_voucher();

-- ─── 4) Backfill from existing single-source vouchers ──────────────────────
INSERT INTO payment_voucher_sources (voucher_id, pool, amount, created_at)
SELECT pv.id, pv.source_pool, pv.amount, pv.created_at
FROM payment_vouchers pv
WHERE pv.source_pool IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM payment_voucher_sources pvs WHERE pvs.voucher_id = pv.id
  );

-- ─── 5) RLS ────────────────────────────────────────────────────────────────
ALTER TABLE payment_voucher_sources ENABLE ROW LEVEL SECURITY;

-- Mirror payment_vouchers (mig 50): P/F read, Finance insert/update, no delete
CREATE POLICY pvs_pf_select ON payment_voucher_sources
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));

CREATE POLICY pvs_finance_insert ON payment_voucher_sources
    FOR INSERT WITH CHECK (current_user_role() IN ('principal', 'finance'));

CREATE POLICY pvs_finance_update ON payment_voucher_sources
    FOR UPDATE USING (current_user_role() IN ('principal', 'finance'));

-- DELETE allowed on draft vouchers only (for Finance recalc during build);
-- ON DELETE CASCADE on the voucher FK handles voucher-level cleanup.
CREATE POLICY pvs_finance_delete ON payment_voucher_sources
    FOR DELETE USING (
        current_user_role() IN ('principal', 'finance')
        AND EXISTS (
            SELECT 1 FROM payment_vouchers pv
            WHERE pv.id = payment_voucher_sources.voucher_id
              AND pv.status = 'draft'
        )
    );

COMMIT;
