-- ============================================================================
-- 20260101000157_drop_billing_modes.sql
-- Stage 3b: remove hr_pool_split, finance_attribution, fixed_split
-- from the billing_mode enum. User is redesigning the HR/Finance/Fixed
-- billing flow and will wire up replacements via the new Create Invoice
-- button (Stage 4). For now the slate is wiped clean.
--
-- What this does (in order):
--   1. Break dependent FKs (NULL / delete rows pointing at invoices we drop)
--   2. DELETE invoices + service_contracts using the 3 deprecated modes
--      (user confirmed 2026-04-18 that all current data is test)
--   3. DROP generate_fixed_split_invoices — no longer needed
--   4. Rewrite generate_monthly_invoices to drop the hr_pool_split and
--      finance_attribution branches (keep marketing_project only)
--   5. Rewrite derive_invoice_routes_to_pool to drop the 2 pool-routing
--      branches (keep director_office_attribution only)
--   6. Swap the billing_mode enum for a new one without the 3 values,
--      following the rename-and-recast pattern used in migration 71.
-- ============================================================================

-- ── 1. Break FKs pointing at invoices we're about to delete ────────────────

UPDATE payment_vouchers
   SET invoice_id = NULL
 WHERE invoice_id IN (
     SELECT id FROM invoices
      WHERE billing_mode IN ('hr_pool_split', 'finance_attribution', 'fixed_split')
 );

DELETE FROM credit_notes
 WHERE invoice_id IN (
     SELECT id FROM invoices
      WHERE billing_mode IN ('hr_pool_split', 'finance_attribution', 'fixed_split')
 );

-- ── 2. Wipe the data using these modes ─────────────────────────────────────

DELETE FROM invoices
 WHERE billing_mode IN ('hr_pool_split', 'finance_attribution', 'fixed_split');

DELETE FROM service_contracts
 WHERE billing_mode IN ('hr_pool_split', 'finance_attribution', 'fixed_split');

-- ── 3. Drop the fixed-split generator (mode gone, function obsolete) ───────

DROP FUNCTION IF EXISTS generate_fixed_split_invoices(DATE, DECIMAL, DECIMAL, JSONB);

-- ── 4. Rewrite generate_monthly_invoices — drop HR + Finance branches ──────
-- Only marketing_project survives. HR / Finance / Fixed flows will come
-- back (if ever) via the Create Invoice manual form, not auto-split.

DROP FUNCTION IF EXISTS generate_monthly_invoices(DATE, TEXT[]);

CREATE OR REPLACE FUNCTION generate_monthly_invoices(
    p_period_month DATE,
    p_modes TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
    v_period DATE;
    v_caller_id UUID;
    v_generated_total INTEGER := 0;
    v_generated_mode INTEGER := 0;
    v_skipped INTEGER := 0;
    v_errors JSONB := '[]'::jsonb;
    v_mode_counts JSONB := '{}'::jsonb;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'generate_monthly_invoices: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_caller_id := auth.uid();
    v_period := date_trunc('month', p_period_month)::date;

    SELECT COUNT(*) INTO v_skipped
    FROM invoices
    WHERE period_month = v_period
      AND status <> 'draft'
      AND (p_modes IS NULL OR billing_mode::text = ANY(p_modes));

    IF p_modes IS NULL THEN
        DELETE FROM invoices WHERE period_month = v_period AND status = 'draft';
    ELSE
        DELETE FROM invoices WHERE period_month = v_period AND status = 'draft'
            AND billing_mode::text = ANY(p_modes);
    END IF;

    -- Marketing Project — the only remaining auto-generated mode
    IF p_modes IS NULL OR 'marketing_project' = ANY(p_modes) THEN
        WITH eligible_contracts AS (
            SELECT sc.id, sc.company_id, sc.amount
            FROM service_contracts sc
            WHERE sc.billing_mode = 'marketing_project'
              AND sc.status = 'active'
              AND sc.approved_by IS NOT NULL
              AND sc.company_id IS NOT NULL
              AND sc.amount IS NOT NULL AND sc.amount > 0
              AND (sc.start_date IS NULL OR sc.start_date <= (v_period + INTERVAL '1 month' - INTERVAL '1 day')::date)
              AND (sc.end_date IS NULL OR sc.end_date >= v_period)
        )
        INSERT INTO invoices (
            invoice_no, contract_id, company_id, period_month, billing_mode,
            base_amount, total_amount, status, created_by
        )
        SELECT format_invoice_no(v_period), ec.id, ec.company_id, v_period,
               'marketing_project', ec.amount, ec.amount, 'draft', v_caller_id
        FROM eligible_contracts ec;

        GET DIAGNOSTICS v_generated_mode = ROW_COUNT;
        v_generated_total := v_generated_total + v_generated_mode;
        v_mode_counts := v_mode_counts || jsonb_build_object('marketing_project', v_generated_mode);
    END IF;

    RETURN jsonb_build_object(
        'generated', v_generated_total,
        'skipped', v_skipped,
        'errors', v_errors,
        'period', v_period,
        'mode_counts', v_mode_counts
    );
END;
$$;

COMMENT ON FUNCTION generate_monthly_invoices(DATE, TEXT[]) IS
    'Auto-generates invoices for service contracts. Post-Stage-3b: only marketing_project survives — HR / Finance / Fixed Split modes removed. Pass p_modes to filter; NULL = all (effectively marketing_project only).';

GRANT EXECUTE ON FUNCTION generate_monthly_invoices(DATE, TEXT[]) TO authenticated;

-- ── 5. Rewrite derive_invoice_routes_to_pool — drop 2 branches ─────────────

CREATE OR REPLACE FUNCTION derive_invoice_routes_to_pool()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.routes_to_pool := CASE NEW.billing_mode
        WHEN 'director_office_attribution' THEN 'director_opex'::operating_pool_type
        ELSE NULL
    END;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION derive_invoice_routes_to_pool IS
    'Post-Stage-3b: only director_office_attribution routes to an operating pool (director_opex). HR / Finance routing removed along with their billing modes. director_attribution uses a separate dept_pools branch in credit_operating_pool_on_invoice_paid.';

-- ── 6. Swap billing_mode enum (rename-and-recast pattern, per migration 71) ─
-- Must DROP the billing_mode-dependent trigger before ALTER COLUMN TYPE,
-- then recreate the trigger against the new enum.

DROP TRIGGER IF EXISTS trg_invoices_route_to_pool ON invoices;

ALTER TYPE billing_mode RENAME TO billing_mode_old;

CREATE TYPE billing_mode AS ENUM (
    'marketing_project',
    'non_billable',
    'director_office_attribution',
    'director_attribution'
);

ALTER TABLE invoices
    ALTER COLUMN billing_mode TYPE billing_mode USING billing_mode::text::billing_mode;

ALTER TABLE service_contracts
    ALTER COLUMN billing_mode TYPE billing_mode USING billing_mode::text::billing_mode;

DROP TYPE billing_mode_old;

-- Recreate the routing trigger against the fresh enum
CREATE TRIGGER trg_invoices_route_to_pool
    BEFORE INSERT OR UPDATE OF billing_mode ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION derive_invoice_routes_to_pool();
