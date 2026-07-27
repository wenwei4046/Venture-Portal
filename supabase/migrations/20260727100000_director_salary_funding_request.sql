-- Mig 20260727100000: director salary submit auto-files a funding request
-- (user decision 2026-07-27: "一按 submit 就自动要钱，跟 staff 一样").
--
-- The Director Payroll Submission (mig 20260717120000 v2) only wrote the
-- aggregate snapshot Finance bills from — no money flow. Staff payroll has
-- auto-filed its funding request at submit since mig 20260626120000. This
-- migration gives directors the same treatment, riding the SAME pipeline
-- (payroll_payment_requests → Finance funding PV → Principal approval →
-- completion trigger), with these deltas:
--
--   · Request amount = employer cost = snapshot total_gross + total_statutory_er
--     (InfoTech gross + EPF/SOCSO/EIS ER — user-confirmed).
--   · Director requests have NO payroll_run: payroll_run_id becomes nullable
--     and the request carries period_month directly. CHECK: one of the two.
--   · target_pool = 'dept_pool_director'. On funding-PV approval the custody
--     credit goes to the REQUEST's target_pool (was hardcoded dept_pool_hr),
--     and the staging JE is segment-tagged 'director' — so director money
--     never swells HR's pool, and director payouts (which drain
--     dept_pool_director) stay consistent.
--   · Re-submit: still snapshot-replace, but now blocked once Finance has
--     generated a PV / the request completed (money in motion) — a still-
--     'submitted' request is auto-cancelled and re-filed with the new amount.
--   · reopen_director_salary mirrors reopen_payroll_run: auto-cancels a
--     still-'submitted' request, blocked on pv_generated/completed.
--   · get_payroll_breakdown_by_pool: a run-less (director) request returns a
--     single dept_pool_director row so Finance's Generate-PV grid foots.
--
-- NOT touched: create_payroll_disbursement_vouchers scope='directors' still
-- reads director_payouts (dead since the v2 engine retirement) — separate fix.

BEGIN;

-- ── 1. payroll_payment_requests: allow run-less director requests ────────────

ALTER TABLE payroll_payment_requests
    ALTER COLUMN payroll_run_id DROP NOT NULL;

ALTER TABLE payroll_payment_requests
    ADD COLUMN period_month DATE;

COMMENT ON COLUMN payroll_payment_requests.period_month IS
    'Mig 20260727100000: set on run-less DIRECTOR salary funding requests '
    '(payroll_run_id NULL). Staff requests keep deriving the period from '
    'their payroll_run.';

ALTER TABLE payroll_payment_requests
    ADD CONSTRAINT ppr_run_or_period
    CHECK (payroll_run_id IS NOT NULL OR period_month IS NOT NULL);

-- One active director request per period (mirror of uq_ppr_one_active_per_run).
CREATE UNIQUE INDEX uq_ppr_one_active_director_per_period
    ON payroll_payment_requests (period_month)
    WHERE payroll_run_id IS NULL AND status IN ('submitted', 'pv_generated');

-- ── 2. Insert validation: branch on request kind ─────────────────────────────

CREATE OR REPLACE FUNCTION validate_payroll_payment_request_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_run_status payroll_run_status;
    v_run_total  DECIMAL(15, 2);
    v_dir_total  DECIMAL(15, 2);
BEGIN
    IF NEW.payroll_run_id IS NOT NULL THEN
        SELECT status, total_amount
          INTO v_run_status, v_run_total
          FROM payroll_runs
         WHERE id = NEW.payroll_run_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'payroll_payment_request: payroll_run % not found', NEW.payroll_run_id;
        END IF;

        IF v_run_status <> 'approved' THEN
            RAISE EXCEPTION
                'payroll_payment_request: payroll_run % status is %, must be approved',
                NEW.payroll_run_id, v_run_status;
        END IF;

        IF NEW.amount <> v_run_total THEN
            RAISE EXCEPTION
                'payroll_payment_request: amount % must match payroll_run total %',
                NEW.amount, v_run_total;
        END IF;
    ELSE
        -- Run-less request = director salary funding (mig 20260727100000).
        IF NEW.period_month IS NULL THEN
            RAISE EXCEPTION
                'payroll_payment_request: period_month is required when payroll_run_id is NULL';
        END IF;

        IF NEW.target_pool <> 'dept_pool_director' THEN
            RAISE EXCEPTION
                'payroll_payment_request: run-less requests are director salary fundings — target_pool must be dept_pool_director, got %',
                NEW.target_pool;
        END IF;

        SELECT total_gross + total_statutory_er
          INTO v_dir_total
          FROM director_salary_submissions
         WHERE period_month = NEW.period_month;

        IF v_dir_total IS NULL THEN
            RAISE EXCEPTION
                'payroll_payment_request: no director salary submission for % — submit it first',
                NEW.period_month;
        END IF;

        IF NEW.amount <> v_dir_total THEN
            RAISE EXCEPTION
                'payroll_payment_request: amount % must match the director submission employer cost %',
                NEW.amount, v_dir_total;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- ── 3. submit_director_salary_to_finance v3: snapshot + auto funding request ─

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
    v_locked        INT;
    v_id            UUID;
    v_fund          DECIMAL(15, 2);
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

    -- Money in motion blocks re-submission: once Finance has generated a
    -- funding PV (or the request completed), the numbers are locked — same
    -- rule as the staff reopen path.
    SELECT COUNT(*) INTO v_locked
      FROM payroll_payment_requests
     WHERE payroll_run_id IS NULL
       AND period_month = p_period
       AND status IN ('pv_generated', 'completed');
    IF v_locked > 0 THEN
        RAISE EXCEPTION
            'submit_director_salary_to_finance: Finance has already generated a funding PV for % — void/cancel it first; if it completed, money has already moved',
            p_period;
    END IF;

    -- A still-'submitted' request was auto-filed by the previous submit and
    -- Finance has not acted on it — supersede it.
    UPDATE payroll_payment_requests
       SET status              = 'cancelled',
           cancelled_at        = NOW(),
           cancelled_by        = p_user_id,
           cancellation_reason = 'Superseded by director salary re-submission'
     WHERE payroll_run_id IS NULL
       AND period_month = p_period
       AND status = 'submitted';

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
    RETURNING id, (total_gross + total_statutory_er) INTO v_id, v_fund;

    -- Auto-file the funding request (user 2026-07-27) — the InfoTech employer
    -- cost lands in Finance's funding queue the instant HR submits, exactly
    -- like the staff flow (mig 20260626120000). Skip when 0: nothing to fund,
    -- and the amount > 0 CHECK would roll back the submit.
    IF v_fund > 0 THEN
        INSERT INTO payroll_payment_requests (
            payroll_run_id, period_month, requested_by, amount, target_pool, status
        ) VALUES (
            NULL, p_period, p_user_id, v_fund, 'dept_pool_director', 'submitted'
        );
    END IF;

    INSERT INTO access_log (
        user_id, resource_type, resource_id, action, metadata
    ) VALUES (
        p_user_id, 'director_salary_submission', v_id::TEXT, 'submit_direct_to_finance',
        jsonb_build_object(
            'period', p_period,
            'directors', v_payroll_count,
            'source', 'infotech',
            'funding_requested', v_fund
        )
    );

    RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION submit_director_salary_to_finance(DATE, UUID) IS
    'v3 (2026-07-27): snapshot from director_monthly_payroll (InfoTech actuals) '
    '+ auto-filed funding request (amount = gross + statutory ER, target '
    'dept_pool_director) riding the staff payroll funding pipeline. Re-submit '
    'supersedes a still-submitted request; blocked once a PV is generated.';

-- ── 4. reopen_director_salary v3: also unwind the funding request ────────────

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
    v_locked     INT;
BEGIN
    SELECT role INTO v_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'reopen_director_salary: unknown or inactive user %', p_user_id;
    END IF;
    IF v_role NOT IN ('hr', 'principal') THEN
        RAISE EXCEPTION 'reopen_director_salary: role % cannot reopen', v_role;
    END IF;

    -- Block once Finance/Principal have acted on the funding request
    -- (mig 20260727100000 — mirror of reopen_payroll_run).
    SELECT COUNT(*) INTO v_locked
      FROM payroll_payment_requests
     WHERE payroll_run_id IS NULL
       AND period_month = p_period
       AND status IN ('pv_generated', 'completed');
    IF v_locked > 0 THEN
        RAISE EXCEPTION
            'reopen_director_salary: Finance has already generated a funding PV for % — void/cancel it first; if it completed, money has already moved',
            p_period;
    END IF;

    -- Legacy engine-era guards (pre-v2 periods still carry payouts).
    SELECT COUNT(*) INTO v_paid_count
      FROM director_payouts
     WHERE period_month = p_period AND status = 'paid';
    IF v_paid_count > 0 THEN
        RAISE EXCEPTION
            'reopen_director_salary: % payout(s) already paid for % — cannot reopen',
            v_paid_count, p_period;
    END IF;

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

    -- The auto-filed request was never acted on — cancel it with the reopen.
    UPDATE payroll_payment_requests
       SET status              = 'cancelled',
           cancelled_at        = NOW(),
           cancelled_by        = p_user_id,
           cancellation_reason = 'Auto-cancelled on director salary reopen'
     WHERE payroll_run_id IS NULL
       AND period_month = p_period
       AND status = 'submitted';

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
    'v3 (2026-07-27): pulls a Director Salary submission back — snapshot '
    'deleted, still-submitted funding request auto-cancelled. Blocked once a '
    'funding PV is generated/completed (money in motion).';

-- ── 5. Breakdown grid: run-less request = single Director pool row ───────────

CREATE OR REPLACE FUNCTION get_payroll_breakdown_by_pool(p_request_id UUID)
RETURNS TABLE (
    pool_key TEXT,
    dept_name TEXT,
    required_amount DECIMAL(15, 2),
    pool_balance DECIMAL(15, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $function$
DECLARE
    v_period DATE;
    v_run_id UUID;
    v_amount DECIMAL(15, 2);
BEGIN
    SELECT COALESCE(pr.period_month, ppr.period_month), ppr.payroll_run_id, ppr.amount
      INTO v_period, v_run_id, v_amount
      FROM payroll_payment_requests ppr
      LEFT JOIN payroll_runs pr ON pr.id = ppr.payroll_run_id
     WHERE ppr.id = p_request_id;

    IF v_period IS NULL THEN
        RAISE EXCEPTION 'get_payroll_breakdown_by_pool: request % not found or has no period', p_request_id;
    END IF;

    -- Director salary funding (mig 20260727100000): the whole round draws from
    -- the Director pool — one row so the Generate-PV grid foots to the request.
    IF v_run_id IS NULL THEN
        RETURN QUERY
        SELECT
            'dept_pool_director'::TEXT,
            'Director'::TEXT,
            v_amount,
            COALESCE((
                SELECT dpb.balance
                  FROM dept_pool_balances dpb
                  JOIN departments d ON d.id = dpb.department_id
                 WHERE d.name = 'Director'
            ), 0)::DECIMAL(15, 2);
        RETURN;
    END IF;

    RETURN QUERY
    WITH hr_payroll_totals AS (
        -- Staff-side payroll aggregated from hr_monthly_payroll, one row per
        -- dept. Director row REMOVED (mig 278): director costing is decoupled
        -- from the staff run — its funding rides its own run-less request.
        SELECT
            LOWER(d.name) AS dept_slug,
            d.name        AS d_name,
            d.id          AS d_id,
            COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)::DECIMAL(15, 2) AS total
          FROM departments d
          LEFT JOIN hr_staff_costs hsc ON hsc.department_id = d.id
          LEFT JOIN hr_monthly_payroll hmp
                 ON hmp.staff_id = hsc.id
                AND hmp.period_month = v_period
         WHERE d.name IN ('HR', 'Finance', 'Director Office', 'Marketing')
         GROUP BY d.id, d.name
    ),
    pool_balances AS (
        SELECT department_id, balance FROM dept_pool_balances
    )
    SELECT
        CASE hpt.dept_slug
            WHEN 'hr'              THEN 'dept_pool_hr'
            WHEN 'finance'         THEN 'dept_pool_finance'
            WHEN 'director office' THEN 'dept_pool_director_office'
            WHEN 'marketing'       THEN 'dept_pool_marketing'
        END AS pool_key,
        hpt.d_name AS dept_name,
        hpt.total  AS required_amount,
        COALESCE((SELECT balance FROM pool_balances WHERE department_id = hpt.d_id), 0)::DECIMAL(15, 2) AS pool_balance
      FROM hr_payroll_totals hpt
     ORDER BY CASE hpt.dept_slug
         WHEN 'hr'              THEN 1
         WHEN 'finance'         THEN 2
         WHEN 'director office' THEN 3
         WHEN 'marketing'       THEN 4
         ELSE 99
     END;
END;
$function$;

COMMENT ON FUNCTION get_payroll_breakdown_by_pool(UUID) IS
    'Mig 20260727100000: staff requests → 4 dept-pool rows; run-less director '
    'requests → single dept_pool_director row footing to the request amount.';

-- ── 6. approve_single_voucher: custody credit + JE segment follow the request's
--       target_pool (anchored transforms of the live def, mig-156 style) ──────

DO $mig$
DECLARE
    v_src    TEXT;
    v_anchor TEXT;
    v_repl   TEXT;
    v_cnt    INT;
BEGIN
    v_src := pg_get_functiondef('approve_single_voucher(uuid,uuid,text,boolean)'::regprocedure);

    -- (a) Custody credit → the funding request's target_pool (dept_pool_hr for
    --     staff runs, dept_pool_director for director salary rounds).
    v_anchor := $a$            PERFORM apply_pool_adjustment('dept_pool_hr', 'in', v_voucher.amount,
                format('PV %s: payroll fund → HR custody', v_voucher.voucher_no),
                p_user_id, p_approval_id, v_now, NULL);$a$;
    v_repl := $a$            -- Mig 20260727100000: custody follows the request's target_pool —
            -- staff rounds park in dept_pool_hr, director rounds in
            -- dept_pool_director (their payouts drain that pool).
            PERFORM apply_pool_adjustment(
                COALESCE((SELECT ppr.target_pool
                            FROM payroll_payment_requests ppr
                           WHERE v_voucher.reference_type = 'payroll_payment_request'
                             AND ppr.id = v_voucher.reference_id), 'dept_pool_hr'),
                'in', v_voucher.amount,
                format('PV %s: payroll fund → custody pool', v_voucher.voucher_no),
                p_user_id, p_approval_id, v_now, NULL);$a$;
    v_cnt := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'mig 20260727100000: custody-credit anchor found % times', v_cnt;
    END IF;
    v_src := replace(v_src, v_anchor, v_repl);

    -- (b) Staging JE segment: 'director' for director rounds so the per-bank
    --     slice attribution matches the payout side (segment 'director').
    v_anchor := $a$'hr'::gl_segment)$a$;
    v_repl := $a$CASE WHEN COALESCE((SELECT ppr.target_pool
                                      FROM payroll_payment_requests ppr
                                     WHERE v_voucher.reference_type = 'payroll_payment_request'
                                       AND ppr.id = v_voucher.reference_id), 'dept_pool_hr') = 'dept_pool_director'
                     THEN 'director'::gl_segment
                     ELSE 'hr'::gl_segment END)$a$;
    v_cnt := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'mig 20260727100000: staging-JE segment anchor found % times', v_cnt;
    END IF;
    v_src := replace(v_src, v_anchor, v_repl);

    EXECUTE v_src;
END;
$mig$;

COMMENT ON FUNCTION approve_single_voucher(uuid, uuid, text, boolean) IS
    'Mig 20260727100000: payroll_bank_transfer custody credit + staging-JE '
    'segment now follow the linked funding request''s target_pool — '
    'dept_pool_hr/hr for staff rounds, dept_pool_director/director for '
    'director salary rounds.';

COMMIT;
