-- ─────────────────────────────────────────────────────────────────────────────
-- Director Salary submission: per-subsidiary COMPONENT breakdown
-- (user request 2026-07-13).
--
-- Finance's "Director Salary Submission" table showed one lump CTC number
-- per subsidiary. Break it out like the Staff Billing Allocation table:
-- Salary (basic+kpi) / Allowance / EPF ER / SOCSO ER / EIS ER / Total.
--
-- 1. get_director_ctc_by_company: return the component columns (signature
--    change → drop + recreate).
-- 2. submit_director_salary_to_finance: by_company snapshot JSON gains the
--    same component fields. Old snapshots keep their lump-sum shape — the UI
--    falls back to showing just the total for them.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS get_director_ctc_by_company(DATE);

CREATE FUNCTION get_director_ctc_by_company(p_period_month DATE)
 RETURNS TABLE(
    company_id UUID,
    company_name TEXT,
    company_short_code TEXT,
    salary NUMERIC,
    allowance NUMERIC,
    epf_er NUMERIC,
    socso_er NUMERIC,
    eis_er NUMERIC,
    total_ctc NUMERIC
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('principal', 'finance', 'hr') THEN
        RAISE EXCEPTION 'insufficient_privilege';
    END IF;

    RETURN QUERY
    SELECT
        c.id,
        c.name::TEXT,
        c.short_code::TEXT,
        COALESCE(SUM(dc.basic + dc.kpi), 0)::DECIMAL   AS salary,
        COALESCE(SUM(dc.allowance), 0)::DECIMAL        AS allowance,
        COALESCE(SUM(dc.employer_epf), 0)::DECIMAL     AS epf_er,
        COALESCE(SUM(dc.employer_socso), 0)::DECIMAL   AS socso_er,
        COALESCE(SUM(dc.employer_eis), 0)::DECIMAL     AS eis_er,
        COALESCE(SUM(dc.total_ctc), 0)::DECIMAL        AS total_ctc
    FROM companies c
    JOIN director_ctc dc ON dc.company_id = c.id
    WHERE dc.period_month = p_period_month
    GROUP BY c.id, c.name, c.short_code
    HAVING COALESCE(SUM(dc.total_ctc), 0) > 0
    ORDER BY c.short_code;
END;
$function$;

GRANT EXECUTE ON FUNCTION get_director_ctc_by_company(DATE) TO authenticated;

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
                        'salary',             t.salary,
                        'allowance',          t.allowance,
                        'epf_er',             t.epf_er,
                        'socso_er',           t.socso_er,
                        'eis_er',             t.eis_er,
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
                    COALESCE(SUM(dc.basic + dc.kpi), 0)::DECIMAL(15, 2) AS salary,
                    COALESCE(SUM(dc.allowance), 0)::DECIMAL(15, 2)      AS allowance,
                    COALESCE(SUM(dc.employer_epf), 0)::DECIMAL(15, 2)   AS epf_er,
                    COALESCE(SUM(dc.employer_socso), 0)::DECIMAL(15, 2) AS socso_er,
                    COALESCE(SUM(dc.employer_eis), 0)::DECIMAL(15, 2)   AS eis_er,
                    COALESCE(SUM(dc.total_ctc), 0)::DECIMAL(15, 2)      AS total_ctc
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
    'Mig 279 + component breakdown (2026-07-13): HR submits calculated director '
    'salary straight to Finance — flips draft payouts to confirmed and writes '
    'the aggregate-only snapshot. by_company now carries salary / allowance / '
    'EPF / SOCSO / EIS ER components per subsidiary (still no per-director data).';
