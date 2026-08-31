-- ============================================================================
-- 20260831040000_commission_run_rpcs.sql
-- The commission run: save, apply, reopen
-- HOUZS Venture Portal
--
-- The engine is TypeScript (src/lib/commission/engine.ts, 91 tests) and stays
-- that way — the hybrid pattern the user chose: money maths where it can be
-- unit-tested against hand-worked examples, the WRITE where it can be atomic.
-- These three functions are the write half. They do no arithmetic beyond
-- checking that the numbers handed to them add up.
--
-- Every one is SECURITY INVOKER on purpose. RLS is the outer wall (principal
-- and hr only, and hr may only touch a DRAFT payroll row), and the explicit
-- guards below are the inner one. A SECURITY DEFINER here would quietly hand
-- HR the ability to rewrite a submitted month.
--
-- The invariants these enforce, none of which the client can be trusted with:
--   1. Sum of a statement's lines = its total_commission. The components
--      already tally by CHECK; this covers the drill-down.
--   2. Sum of the statements = the run's total.
--   3. An applied or locked run is never overwritten in place.
--   4. Payroll is only written for a month whose rows are still draft.
--   5. An order is released exactly once, ever (UNIQUE order_no), so an order
--      carried forward by the deposit gate cannot pay twice.
--   6. Reopening reverses everything the apply wrote.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- save_commission_run
-- Replaces a month's computed statements with a fresh set, in one transaction.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_commission_run(
    p_period_month DATE,
    p_sub_department_id UUID,
    p_scheme_id UUID,
    p_batch_id UUID,
    p_total_commission DECIMAL,
    p_warnings JSONB,
    p_statements JSONB,
    p_released_orders JSONB,
    p_deferred_orders JSONB,
    p_penalised_orders JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
    v_role       TEXT := current_user_role();
    v_run_id     UUID;
    v_status     comm_run_status;
    v_stmt       JSONB;
    v_stmt_id    UUID;
    v_line_sum   DECIMAL(15, 2);
    v_total      DECIMAL(15, 2) := 0;
    v_count      INTEGER := 0;
BEGIN
    IF v_role NOT IN ('principal', 'hr') THEN
        RAISE EXCEPTION 'Only Principal or HR may compute a commission run';
    END IF;

    IF EXTRACT(DAY FROM p_period_month) <> 1 THEN
        RAISE EXCEPTION 'Period must be the first of a month, got %', p_period_month;
    END IF;

    -- An applied run has money in payroll behind it. Recomputing it in place
    -- would leave that money describing statements that no longer exist.
    SELECT id, status INTO v_run_id, v_status
      FROM comm_runs
     WHERE sub_department_id = p_sub_department_id
       AND period_month = p_period_month
     FOR UPDATE;

    IF v_status IN ('applied', 'locked') THEN
        RAISE EXCEPTION 'The % run is already % — reopen it before recomputing',
            to_char(p_period_month, 'Mon YYYY'), v_status;
    END IF;

    IF v_run_id IS NULL THEN
        INSERT INTO comm_runs (sub_department_id, period_month, scheme_id, batch_id, status)
        VALUES (p_sub_department_id, p_period_month, p_scheme_id, p_batch_id, 'draft')
        RETURNING id INTO v_run_id;
    END IF;

    -- Cascades to lines and brand margins.
    DELETE FROM comm_statements WHERE run_id = v_run_id;

    FOR v_stmt IN SELECT * FROM jsonb_array_elements(COALESCE(p_statements, '[]'::JSONB))
    LOOP
        INSERT INTO comm_statements (
            run_id, staff_id,
            tier_key, base_rank_key, rank_key, rate_mode, qualifies_for_rank_key,
            product_rate, upline_staff_id,
            product_revenue, penalty_weighted_revenue, group_revenue,
            deferred_revenue, excluded_revenue, product_commission,
            kpi_qty, kpi_base, kpi_threshold_pct, kpi_commission,
            open_bill_bonus, override_commission,
            margin_revenue, margin_cost, margin_pct, margin_band_key,
            margin_incentive, margin_penalty_withheld,
            total_commission
        )
        VALUES (
            v_run_id,
            (v_stmt ->> 'staff_id')::UUID,
            v_stmt ->> 'tier_key',
            v_stmt ->> 'base_rank_key',
            v_stmt ->> 'rank_key',
            (v_stmt ->> 'rate_mode')::comm_rate_mode,
            v_stmt ->> 'qualifies_for_rank_key',
            COALESCE((v_stmt ->> 'product_rate')::DECIMAL, 0),
            (v_stmt ->> 'upline_staff_id')::UUID,
            COALESCE((v_stmt ->> 'product_revenue')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'penalty_weighted_revenue')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'group_revenue')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'deferred_revenue')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'excluded_revenue')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'product_commission')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'kpi_qty')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'kpi_base')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'kpi_threshold_pct')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'kpi_commission')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'open_bill_bonus')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'override_commission')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'margin_revenue')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'margin_cost')::DECIMAL, 0),
            (v_stmt ->> 'margin_pct')::DECIMAL,
            v_stmt ->> 'margin_band_key',
            COALESCE((v_stmt ->> 'margin_incentive')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'margin_penalty_withheld')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'total_commission')::DECIMAL, 0)
        )
        RETURNING id INTO v_stmt_id;

        INSERT INTO comm_statement_lines (
            statement_id, component, source_order_id, source_line_id, source_staff_id,
            basis_amount, rate, qty, amount, note
        )
        SELECT
            v_stmt_id,
            (l ->> 'component')::comm_component,
            (l ->> 'source_order_id')::UUID,
            (l ->> 'source_line_id')::UUID,
            (l ->> 'source_staff_id')::UUID,
            COALESCE((l ->> 'basis_amount')::DECIMAL, 0),
            (l ->> 'rate')::DECIMAL,
            (l ->> 'qty')::DECIMAL,
            (l ->> 'amount')::DECIMAL,
            l ->> 'note'
        FROM jsonb_array_elements(COALESCE(v_stmt -> 'lines', '[]'::JSONB)) AS l;

        INSERT INTO comm_statement_brand_margins (
            statement_id, brand_code, revenue, cost, margin_pct, top_band_key
        )
        SELECT
            v_stmt_id,
            b ->> 'brand_code',
            COALESCE((b ->> 'revenue')::DECIMAL, 0),
            COALESCE((b ->> 'cost')::DECIMAL, 0),
            (b ->> 'margin_pct')::DECIMAL,
            b ->> 'top_band_key'
        FROM jsonb_array_elements(COALESCE(v_stmt -> 'brand_margins', '[]'::JSONB)) AS b
        WHERE b ->> 'brand_code' IS NOT NULL;

        -- Invariant 1.
        SELECT COALESCE(SUM(amount), 0) INTO v_line_sum
          FROM comm_statement_lines WHERE statement_id = v_stmt_id;

        IF ABS(v_line_sum - COALESCE((v_stmt ->> 'total_commission')::DECIMAL, 0)) > 0.01 THEN
            RAISE EXCEPTION 'Statement for staff % does not tally: lines sum to % but the total is %',
                v_stmt ->> 'staff_id', v_line_sum, v_stmt ->> 'total_commission';
        END IF;

        v_total := v_total + COALESCE((v_stmt ->> 'total_commission')::DECIMAL, 0);
        v_count := v_count + 1;
    END LOOP;

    -- Invariant 2.
    IF ABS(v_total - COALESCE(p_total_commission, 0)) > 0.01 THEN
        RAISE EXCEPTION 'Run total % does not match the statements, which sum to %',
            p_total_commission, v_total;
    END IF;

    UPDATE comm_runs
       SET scheme_id        = p_scheme_id,
           batch_id         = p_batch_id,
           status           = 'computed',
           staff_count      = v_count,
           total_commission = v_total,
           warnings         = COALESCE(p_warnings, '[]'::JSONB),
           released_orders  = COALESCE(p_released_orders, '[]'::JSONB),
           deferred_orders  = COALESCE(p_deferred_orders, '[]'::JSONB),
           penalised_orders = COALESCE(p_penalised_orders, '[]'::JSONB),
           computed_at      = NOW(),
           computed_by      = auth.uid(),
           reopened_at      = NULL,
           reopened_by      = NULL
     WHERE id = v_run_id;

    RETURN v_run_id;
END;
$fn$;

COMMENT ON FUNCTION public.save_commission_run IS
    'Atomically replaces one month''s computed statements. Refuses to touch an applied or locked run, and refuses a payload whose lines do not add up to the totals being stored.';

-- ----------------------------------------------------------------------------
-- apply_commission_run
-- Writes the run into payroll. The only place commission_amount is set.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_commission_run(p_run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
    v_role         TEXT := current_user_role();
    v_run          comm_runs%ROWTYPE;
    v_blocked      INTEGER;
    v_payroll_run  TEXT;
    v_staff        INTEGER := 0;
    v_released     INTEGER := 0;
    v_clash        TEXT;
BEGIN
    IF v_role NOT IN ('principal', 'hr') THEN
        RAISE EXCEPTION 'Only Principal or HR may apply a commission run';
    END IF;

    SELECT * INTO v_run FROM comm_runs WHERE id = p_run_id FOR UPDATE;
    IF v_run.id IS NULL THEN
        RAISE EXCEPTION 'Commission run not found';
    END IF;
    IF v_run.status <> 'computed' THEN
        RAISE EXCEPTION 'Only a computed run can be applied — this one is %', v_run.status;
    END IF;

    -- The warnings are not advisory. Every one of them is a case where the run
    -- knows it paid the wrong amount: an unclassified item group, a
    -- salesperson with sales and no rank, a placement that should not exist.
    IF jsonb_array_length(COALESCE(v_run.warnings, '[]'::JSONB)) > 0 THEN
        RAISE EXCEPTION 'This run has % unresolved warning(s). Clear them and recompute before applying.',
            jsonb_array_length(v_run.warnings);
    END IF;

    -- Invariant 4, half one: the payroll RUN for the month must still be open.
    -- A period can hold several payroll_runs rows (a rejected attempt sits
    -- beside the live one), so this asks whether any run has SETTLED. A
    -- rejected run is dead and must not block; draft is still open by
    -- definition.
    SELECT status::TEXT INTO v_payroll_run
      FROM payroll_runs
     WHERE period_month = v_run.period_month
       AND status IN ('submitted', 'approved', 'paid')
     ORDER BY CASE status WHEN 'paid' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END
     LIMIT 1;
    IF v_payroll_run IS NOT NULL THEN
        RAISE EXCEPTION 'The % payroll run is % — reopen it before changing commission',
            to_char(v_run.period_month, 'Mon YYYY'), v_payroll_run;
    END IF;

    -- Invariant 4, half two: and so must every row we are about to write.
    -- RLS already stops HR here; this stops the Principal too, and says why.
    SELECT COUNT(*) INTO v_blocked
      FROM comm_statements s
      JOIN hr_monthly_payroll p
        ON p.staff_id = s.staff_id AND p.period_month = v_run.period_month
     WHERE s.run_id = p_run_id AND p.status <> 'draft';

    IF v_blocked > 0 THEN
        RAISE EXCEPTION '% payroll row(s) for % are no longer draft — commission cannot be written into a submitted month',
            v_blocked, to_char(v_run.period_month, 'Mon YYYY');
    END IF;

    -- Invariant 5, checked before writing anything so the message names the
    -- order rather than surfacing a raw constraint violation.
    SELECT r.order_no INTO v_clash
      FROM jsonb_array_elements(v_run.released_orders) AS o
      JOIN comm_order_releases r ON r.order_no = o ->> 'order_no'
     WHERE r.run_id <> p_run_id
     LIMIT 1;

    IF v_clash IS NOT NULL THEN
        RAISE EXCEPTION 'Order % has already been paid by an earlier run. Recompute this month so it is excluded.', v_clash;
    END IF;

    -- ── Payroll ────────────────────────────────────────────────────────────
    -- commission_amount is the ONLY field this module writes. The row's
    -- statutory, PCB / withholding, gross and net are all recomputed by
    -- trg_hr_monthly_payroll_compute, which reads the staff record — a Revenue
    -- salesperson has basic 0 and allowance 0, so every statutory lookup
    -- returns 0 on its own and the commission flows straight to gross.
    INSERT INTO hr_monthly_payroll (staff_id, period_month, commission_amount, source, status, created_by)
    SELECT s.staff_id, v_run.period_month, s.total_commission, 'commission', 'draft', auth.uid()
      FROM comm_statements s
     WHERE s.run_id = p_run_id
    ON CONFLICT (staff_id, period_month) DO UPDATE
       SET commission_amount = EXCLUDED.commission_amount,
           source            = 'commission',
           updated_at        = NOW();

    GET DIAGNOSTICS v_staff = ROW_COUNT;

    -- ── Releases ───────────────────────────────────────────────────────────
    INSERT INTO comm_order_releases (
        order_no, run_id, staff_id, period_month, order_period_month, product_revenue
    )
    SELECT
        o ->> 'order_no',
        p_run_id,
        (o ->> 'staff_id')::UUID,
        v_run.period_month,
        (o ->> 'order_period_month')::DATE,
        COALESCE((o ->> 'product_revenue')::DECIMAL, 0)
      FROM jsonb_array_elements(v_run.released_orders) AS o
    ON CONFLICT (order_no) DO NOTHING;

    GET DIAGNOSTICS v_released = ROW_COUNT;

    UPDATE comm_runs
       SET status = 'applied', applied_at = NOW(), applied_by = auth.uid()
     WHERE id = p_run_id;

    RETURN jsonb_build_object(
        'run_id', p_run_id,
        'period_month', v_run.period_month,
        'staff_written', v_staff,
        'orders_released', v_released,
        'total_commission', v_run.total_commission
    );
END;
$fn$;

COMMENT ON FUNCTION public.apply_commission_run IS
    'Writes a computed run into hr_monthly_payroll.commission_amount and records which orders it paid for. Refuses on any outstanding warning, on a payroll month that is no longer draft, and on an order another run already paid.';

-- ----------------------------------------------------------------------------
-- reopen_commission_run
-- Reverses an apply, so a month can be re-imported or recomputed.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reopen_commission_run(p_run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
    v_role        TEXT := current_user_role();
    v_run         comm_runs%ROWTYPE;
    v_payroll_run TEXT;
    v_blocked     INTEGER;
    v_zeroed      INTEGER := 0;
    v_dropped     INTEGER := 0;
BEGIN
    IF v_role NOT IN ('principal', 'hr') THEN
        RAISE EXCEPTION 'Only Principal or HR may reopen a commission run';
    END IF;

    SELECT * INTO v_run FROM comm_runs WHERE id = p_run_id FOR UPDATE;
    IF v_run.id IS NULL THEN
        RAISE EXCEPTION 'Commission run not found';
    END IF;
    IF v_run.status NOT IN ('applied', 'computed') THEN
        RAISE EXCEPTION 'Nothing to reopen — the run is %', v_run.status;
    END IF;

    -- A period can hold several payroll_runs rows (a rejected attempt sits
    -- beside the live one), so this asks whether any run has SETTLED. A
    -- rejected run is dead and must not block; draft is still open by
    -- definition.
    SELECT status::TEXT INTO v_payroll_run
      FROM payroll_runs
     WHERE period_month = v_run.period_month
       AND status IN ('submitted', 'approved', 'paid')
     ORDER BY CASE status WHEN 'paid' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END
     LIMIT 1;
    IF v_payroll_run IS NOT NULL THEN
        RAISE EXCEPTION 'The % payroll run is % — reopen that first',
            to_char(v_run.period_month, 'Mon YYYY'), v_payroll_run;
    END IF;

    SELECT COUNT(*) INTO v_blocked
      FROM comm_statements s
      JOIN hr_monthly_payroll p
        ON p.staff_id = s.staff_id AND p.period_month = v_run.period_month
     WHERE s.run_id = p_run_id AND p.status <> 'draft';

    IF v_blocked > 0 THEN
        RAISE EXCEPTION '% payroll row(s) for % are no longer draft',
            v_blocked, to_char(v_run.period_month, 'Mon YYYY');
    END IF;

    IF v_run.status = 'applied' THEN
        -- Take back exactly what was put in. The row itself stays: for a
        -- Revenue salesperson it is 100% commission, so this leaves a zeroed
        -- draft row rather than deleting a row payroll may already list.
        UPDATE hr_monthly_payroll p
           SET commission_amount = 0, updated_at = NOW()
          FROM comm_statements s
         WHERE s.run_id = p_run_id
           AND p.staff_id = s.staff_id
           AND p.period_month = v_run.period_month;
        GET DIAGNOSTICS v_zeroed = ROW_COUNT;

        -- The orders return to the pool, so the next compute sees them again.
        DELETE FROM comm_order_releases WHERE run_id = p_run_id;
        GET DIAGNOSTICS v_dropped = ROW_COUNT;
    END IF;

    UPDATE comm_runs
       SET status = 'draft', applied_at = NULL, applied_by = NULL,
           reopened_at = NOW(), reopened_by = auth.uid()
     WHERE id = p_run_id;

    RETURN jsonb_build_object(
        'run_id', p_run_id,
        'payroll_rows_zeroed', v_zeroed,
        'releases_dropped', v_dropped
    );
END;
$fn$;

COMMENT ON FUNCTION public.reopen_commission_run IS
    'Pulls a run back to draft and undoes what it wrote: commission_amount back to 0 and its order releases deleted, so the orders can be paid by a later run. Refuses once the payroll month has left draft.';

GRANT EXECUTE ON FUNCTION public.save_commission_run(DATE, UUID, UUID, UUID, DECIMAL, JSONB, JSONB, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_commission_run(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_commission_run(UUID) TO authenticated;
