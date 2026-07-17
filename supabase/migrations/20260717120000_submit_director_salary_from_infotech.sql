-- ─────────────────────────────────────────────────────────────────────────────
-- Director Salary submission v2 (user decision 2026-07-17): the calculation
-- engine (75/25 split, 5% saving, advance tracking) is retired. The submission
-- snapshot now sources its payroll totals from director_monthly_payroll (the
-- InfoTech actual run) instead of director_payouts:
--
--   · total_gross / total_payroll_gross  = SUM(gross)   from InfoTech rows
--   · total_payroll_net                  = SUM(net)
--   · total_statutory_er                 = SUM(EPF+SOCSO+EIS ER)
--   · total_invoice / total_saving       = 0 (engine retired)
--   · by_company                         = unchanged (director_ctc breakdown)
--
-- Guards: requires BOTH the InfoTech import (payroll side) and saved CTC
-- (billing side) before submitting. The old payout flip/paid checks are gone —
-- director_payouts is no longer written.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_director_salary_to_finance(p_period DATE, p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_role          user_role;
    v_payroll_count INT;
    v_ctc_count     INT;
    v_id            UUID;
BEGIN
    SELECT role INTO v_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'submit_director_salary_to_finance: unknown or inactive user %', p_user_id;
    END IF;
    IF v_role NOT IN ('hr', 'principal') THEN
        RAISE EXCEPTION 'submit_director_salary_to_finance: role % cannot submit', v_role;
    END IF;

    SELECT COUNT(*) INTO v_payroll_count
      FROM director_monthly_payroll
     WHERE period_month = p_period;
    IF v_payroll_count = 0 THEN
        RAISE EXCEPTION
            'submit_director_salary_to_finance: no InfoTech director payroll imported for %. Import InfoTech first.',
            p_period;
    END IF;

    SELECT COUNT(*) INTO v_ctc_count
      FROM director_ctc
     WHERE period_month = p_period;
    IF v_ctc_count = 0 THEN
        RAISE EXCEPTION
            'submit_director_salary_to_finance: no CTC saved for %. Save the Pool Breakdown (Billing) first.',
            p_period;
    END IF;

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
        COALESCE(SUM(dmp.gross), 0),
        COALESCE(SUM(dmp.gross), 0),
        COALESCE(SUM(dmp.net), 0),
        COALESCE(SUM(dmp.epf_er + dmp.socso_er + dmp.eis_er), 0),
        0,
        0,
        COUNT(*),
        (
            SELECT COALESCE(
                JSONB_AGG(
                    JSONB_BUILD_OBJECT(
                        'company_id',         t.company_id,
                        'company_name',       t.company_name,
                        'company_short_code', t.company_short_code,
                        'basic',              t.basic,
                        'kpi',                t.kpi,
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
                    COALESCE(SUM(dc.basic), 0)::DECIMAL(15, 2)          AS basic,
                    COALESCE(SUM(dc.kpi), 0)::DECIMAL(15, 2)            AS kpi,
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
      FROM director_monthly_payroll dmp
     WHERE dmp.period_month = p_period
    RETURNING id INTO v_id;

    INSERT INTO access_log (
        user_id, resource_type, resource_id, action, metadata
    ) VALUES (
        p_user_id, 'director_salary_submission', v_id::TEXT, 'submit_direct_to_finance',
        jsonb_build_object('period', p_period, 'directors', v_payroll_count, 'source', 'infotech')
    );

    RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION submit_director_salary_to_finance(DATE, UUID) IS
    'v2 (2026-07-17): submission totals come from director_monthly_payroll '
    '(InfoTech actuals) — the calculation engine is retired. by_company still '
    'carries the director_ctc per-subsidiary breakdown for billing. Requires '
    'both the InfoTech import and saved CTC.';
