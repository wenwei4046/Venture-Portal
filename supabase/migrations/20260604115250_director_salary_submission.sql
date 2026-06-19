-- ============================================================================
-- Migration 279: Director Payroll Submission — direct HR → Finance handoff
--                (user 2026-06-04, pairs with mig 278's decoupling)
-- ============================================================================
-- Director compensation no longer rides inside the staff payroll_run (mig 278
-- writes director_salary_total = 0). Instead HR submits the calculated
-- director salary straight to Finance from /director-salary's new
-- "Director Payroll Submission" tab. The submission is an AGGREGATE-ONLY
-- snapshot (Finance must never see per-director figures — CLAUDE.md rule):
--   * totals from director_payouts (gross / 75% payroll / 25% invoice /
--     5% saving / statutory ER / net)
--   * per-SUBSIDIARY contribution breakdown from director_ctc (same shape as
--     get_director_ctc_by_company) so Finance knows exactly how much to bill
--     each subsidiary.
--
-- Objects:
--   1. TABLE director_salary_submissions — one live row per period.
--      RLS: SELECT for principal + finance + hr. Writes only via the
--      SECURITY DEFINER RPCs below.
--   2. RPC submit_director_salary_to_finance(p_period, p_user_id):
--      flips draft payouts → confirmed (absorbs the old confirmPayouts
--      action) and (re)writes the submission snapshot. Blocked if any
--      payout for the period is already 'paid'.
--   3. RPC reopen_director_salary(p_period, p_user_id):
--      pulls a submission back — confirmed payouts → draft, snapshot row
--      deleted — so HR can recalculate / edit statutory. Blocked once any
--      payout is 'paid' or a disbursement PV exists for the period.
-- ============================================================================

BEGIN;

-- ── 1. Submission snapshot table ─────────────────────────────────────────────

CREATE TABLE director_salary_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    period_month DATE NOT NULL,

    -- Aggregate totals (no per-director breakdown — Finance-safe by design)
    total_gross         DECIMAL(15, 2) NOT NULL DEFAULT 0,  -- SUM(gross_amount): full pool cost
    total_payroll_gross DECIMAL(15, 2) NOT NULL DEFAULT 0,  -- 75% portion
    total_payroll_net   DECIMAL(15, 2) NOT NULL DEFAULT 0,
    total_statutory_er  DECIMAL(15, 2) NOT NULL DEFAULT 0,  -- payroll EPF+SOCSO+EIS ER
    total_invoice       DECIMAL(15, 2) NOT NULL DEFAULT 0,  -- 25% portion
    total_saving        DECIMAL(15, 2) NOT NULL DEFAULT 0,  -- 5% saving
    director_count      INT            NOT NULL DEFAULT 0,

    -- Per-subsidiary contribution snapshot at submit time:
    -- [{company_id, company_name, company_short_code, total_ctc}, ...]
    by_company JSONB NOT NULL DEFAULT '[]'::JSONB,

    submitted_by UUID NOT NULL REFERENCES users(id),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_director_salary_submission_period
    ON director_salary_submissions (period_month);

COMMENT ON TABLE director_salary_submissions IS
    'Mig 279: aggregate-only Director Salary submission snapshot — the direct '
    'HR → Finance handoff that replaced riding inside the staff payroll_run. '
    'Finance reads totals + per-subsidiary breakdown; never per-director.';

ALTER TABLE director_salary_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY dss_select
    ON director_salary_submissions FOR SELECT
    USING (current_user_role() IN ('principal', 'finance', 'hr'));

-- No INSERT/UPDATE/DELETE policies — writes go through the RPCs below.

-- ── 2. Submit ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_director_salary_to_finance(p_period DATE, p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_role         user_role;
    v_payout_count INT;
    v_paid_count   INT;
    v_id           UUID;
BEGIN
    SELECT role INTO v_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'submit_director_salary_to_finance: unknown or inactive user %', p_user_id;
    END IF;
    IF v_role NOT IN ('hr', 'principal') THEN
        RAISE EXCEPTION 'submit_director_salary_to_finance: role % cannot submit', v_role;
    END IF;

    SELECT COUNT(*) INTO v_payout_count
      FROM director_payouts
     WHERE period_month = p_period;
    IF v_payout_count = 0 THEN
        RAISE EXCEPTION
            'submit_director_salary_to_finance: Director Salary has not been calculated for %. Save & Calculate first.',
            p_period;
    END IF;

    SELECT COUNT(*) INTO v_paid_count
      FROM director_payouts
     WHERE period_month = p_period AND status = 'paid';
    IF v_paid_count > 0 THEN
        RAISE EXCEPTION
            'submit_director_salary_to_finance: % payout(s) already paid for % — figures are final',
            v_paid_count, p_period;
    END IF;

    -- Absorb the old Confirm step: draft → confirmed.
    UPDATE director_payouts
       SET status = 'confirmed'
     WHERE period_month = p_period AND status = 'draft';

    -- Re-submission replaces the snapshot (one live row per period).
    DELETE FROM director_salary_submissions WHERE period_month = p_period;

    INSERT INTO director_salary_submissions (
        period_month,
        total_gross,
        total_payroll_gross,
        total_payroll_net,
        total_statutory_er,
        total_invoice,
        total_saving,
        director_count,
        by_company,
        submitted_by
    )
    SELECT
        p_period,
        COALESCE(SUM(dp.gross_amount), 0),
        COALESCE(SUM(dp.payroll_gross), 0),
        COALESCE(SUM(dp.payroll_net), 0),
        COALESCE(SUM(dp.payroll_epf_er + dp.payroll_socso_er + dp.payroll_eis_er), 0),
        COALESCE(SUM(dp.invoice_total), 0),
        COALESCE(SUM(dp.saving_amount), 0),
        COUNT(*),
        (
            SELECT COALESCE(
                JSONB_AGG(
                    JSONB_BUILD_OBJECT(
                        'company_id',         t.company_id,
                        'company_name',       t.company_name,
                        'company_short_code', t.company_short_code,
                        'total_ctc',          t.total_ctc
                    ) ORDER BY t.company_short_code
                ),
                '[]'::JSONB
            )
            FROM (
                SELECT
                    c.id          AS company_id,
                    c.name        AS company_name,
                    c.short_code  AS company_short_code,
                    COALESCE(SUM(dc.total_ctc), 0)::DECIMAL(15, 2) AS total_ctc
                  FROM companies c
                  JOIN director_ctc dc ON dc.company_id = c.id
                 WHERE dc.period_month = p_period
                 GROUP BY c.id, c.name, c.short_code
                HAVING COALESCE(SUM(dc.total_ctc), 0) > 0
            ) t
        ),
        p_user_id
      FROM director_payouts dp
     WHERE dp.period_month = p_period
    RETURNING id INTO v_id;

    INSERT INTO access_log (
        user_id, resource_type, resource_id, action, metadata
    ) VALUES (
        p_user_id, 'director_salary_submission', v_id::TEXT, 'submit_direct_to_finance',
        jsonb_build_object('period', p_period, 'directors', v_payout_count)
    );

    RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION submit_director_salary_to_finance(DATE, UUID) IS
    'Mig 279: HR submits calculated director salary straight to Finance — '
    'flips draft payouts to confirmed and writes the aggregate-only '
    'submission snapshot (totals + per-subsidiary CTC). No Principal approval.';

GRANT EXECUTE ON FUNCTION submit_director_salary_to_finance(DATE, UUID) TO authenticated;

-- ── 3. Reopen ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION reopen_director_salary(p_period DATE, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_role       user_role;
    v_paid_count INT;
    v_pv_count   INT;
BEGIN
    SELECT role INTO v_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'reopen_director_salary: unknown or inactive user %', p_user_id;
    END IF;
    IF v_role NOT IN ('hr', 'principal') THEN
        RAISE EXCEPTION 'reopen_director_salary: role % cannot reopen', v_role;
    END IF;

    SELECT COUNT(*) INTO v_paid_count
      FROM director_payouts
     WHERE period_month = p_period AND status = 'paid';
    IF v_paid_count > 0 THEN
        RAISE EXCEPTION
            'reopen_director_salary: % payout(s) already paid for % — cannot reopen',
            v_paid_count, p_period;
    END IF;

    -- Disbursement PVs reference director_payouts rows — once they exist
    -- (pending or paid), the figures are in the money pipeline.
    SELECT COUNT(*) INTO v_pv_count
      FROM payment_vouchers pv
     WHERE pv.reference_type = 'payroll_disbursement'
       AND EXISTS (
           SELECT 1 FROM director_payouts dp
            WHERE dp.id::TEXT = pv.reference_id::TEXT
              AND dp.period_month = p_period
       )
       AND pv.status <> 'voided';
    IF v_pv_count > 0 THEN
        RAISE EXCEPTION
            'reopen_director_salary: % disbursement voucher(s) exist for % — void them first',
            v_pv_count, p_period;
    END IF;

    UPDATE director_payouts
       SET status = 'draft'
     WHERE period_month = p_period AND status = 'confirmed';

    DELETE FROM director_salary_submissions WHERE period_month = p_period;

    INSERT INTO access_log (
        user_id, resource_type, resource_id, action, metadata
    ) VALUES (
        p_user_id, 'director_salary_submission', p_period::TEXT, 'reopen_to_draft',
        jsonb_build_object('period', p_period)
    );
END;
$function$;

COMMENT ON FUNCTION reopen_director_salary(DATE, UUID) IS
    'Mig 279: pulls a Director Salary submission back — confirmed payouts → '
    'draft, snapshot deleted — so HR can recalculate. Blocked once paid or '
    'disbursement PVs exist.';

GRANT EXECUTE ON FUNCTION reopen_director_salary(DATE, UUID) TO authenticated;

COMMIT;
