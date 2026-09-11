-- Revenue Commission Calculation feeds payroll when a clean calculation is
-- saved. No second Apply/submit step is needed. The existing applied lifecycle
-- remains the audit boundary for order releases, titles and reopen.
-- No historical rows are silently rewritten by this migration.

-- Funding/PV checks must see the same rows for HR and Principal. This helper
-- is read-only SECURITY DEFINER; the write RPCs below remain SECURITY INVOKER.
CREATE OR REPLACE FUNCTION public.assert_commission_payroll_open(p_period DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF current_user_role() IS NULL OR current_user_role() NOT IN ('principal', 'hr') THEN
        RAISE EXCEPTION 'Only Principal or HR may change Revenue payroll' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM period_locks WHERE period_month = p_period AND is_locked) THEN
        RAISE EXCEPTION 'Period % is closed. Reopen the accounting period before changing commission', to_char(p_period, 'Mon YYYY');
    END IF;
    IF EXISTS (SELECT 1 FROM payroll_runs WHERE period_month = p_period AND status IN ('submitted', 'approved', 'paid')) THEN
        RAISE EXCEPTION 'Payroll for % has already been submitted. Reopen payroll before changing commission', to_char(p_period, 'Mon YYYY');
    END IF;
    IF EXISTS (
        SELECT 1 FROM payroll_payment_requests req
        JOIN payroll_runs r ON r.id = req.payroll_run_id
        WHERE r.period_month = p_period AND req.status IN ('pv_generated', 'completed')
    ) OR EXISTS (
        SELECT 1 FROM payment_vouchers pv
        JOIN payroll_payment_requests req ON req.id = pv.reference_id
        JOIN payroll_runs r ON r.id = req.payroll_run_id
        WHERE r.period_month = p_period AND pv.reference_type = 'payroll_payment_request'
          AND pv.status <> 'voided'
    ) THEN
        RAISE EXCEPTION 'Payroll for % has funding or a payment voucher. Resolve it before changing commission', to_char(p_period, 'Mon YYYY');
    END IF;
    IF EXISTS (
        SELECT 1 FROM payment_vouchers pv
        JOIN payroll_voucher_lines l ON l.voucher_id = pv.id
        WHERE l.period_month = p_period AND l.scope = 'staff' AND pv.status <> 'voided'
    ) OR EXISTS (
        SELECT 1 FROM payment_vouchers pv
        JOIN hr_monthly_payroll p ON p.id = pv.reference_id
        WHERE p.period_month = p_period AND pv.reference_type = 'payroll_disbursement' AND pv.status <> 'voided'
    ) THEN
        RAISE EXCEPTION 'Payroll for % already has salary payment vouchers. Resolve them before changing commission', to_char(p_period, 'Mon YYYY');
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_commission_payroll_open(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_commission_payroll_open(DATE) TO authenticated;

-- A reopened run may omit a salesperson on its next calculation. Its old
-- draft row can then be removed, but an applied/locked statement must never
-- disappear from payroll through either a direct delete or a staff cascade.
CREATE OR REPLACE FUNCTION public.guard_revenue_payroll_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.source <> 'commission' THEN RETURN OLD; END IF;

    -- DELETE already holds the tuple lock here. Do not wait for a monthly
    -- lock held by apply/submit, which acquire the monthly lock before rows.
    IF NOT pg_try_advisory_xact_lock(hashtext('commission_payroll:' || OLD.period_month::TEXT)) THEN
        RAISE EXCEPTION 'Commission payroll is being updated; try again';
    END IF;
    PERFORM public.assert_commission_payroll_open(OLD.period_month);
    IF OLD.status <> 'draft' THEN
        RAISE EXCEPTION 'Only a draft Revenue payroll row can be deleted';
    END IF;
    IF EXISTS (
        SELECT 1 FROM comm_statements s
        JOIN comm_runs r ON r.id = s.run_id
        WHERE s.staff_id = OLD.staff_id AND r.period_month = OLD.period_month
          AND r.status IN ('applied', 'locked')
    ) THEN
        RAISE EXCEPTION 'This payroll row is linked to synced Revenue commission. Reopen its commission calculation before deleting it';
    END IF;
    RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_revenue_payroll_delete() FROM PUBLIC;
CREATE TRIGGER trg_hr_monthly_payroll_revenue_delete
    BEFORE DELETE ON public.hr_monthly_payroll
    FOR EACH ROW EXECUTE FUNCTION public.guard_revenue_payroll_delete();

CREATE OR REPLACE FUNCTION public.apply_commission_run(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role         TEXT := current_user_role();
    v_run          comm_runs%ROWTYPE;
    v_blocked      INTEGER;
    v_payroll_run  TEXT;
    v_staff        INTEGER := 0;
    v_released     INTEGER := 0;
    v_promoted     INTEGER := 0;
    v_clash        TEXT;
    v_p            RECORD;
    v_hit_pos      INTEGER;
    v_cur_pos      INTEGER;
    v_title_name   TEXT;
    v_ladder_msg   TEXT;
    v_home_scheme  UUID;
BEGIN
    IF v_role NOT IN ('principal', 'hr') THEN
        RAISE EXCEPTION 'Only Principal or HR may apply a commission run';
    END IF;

    -- All programmes share one payroll field; serialize its monthly sum.
    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' ||
        (SELECT period_month::TEXT FROM comm_runs WHERE id = p_run_id)));
    SELECT * INTO v_run FROM comm_runs WHERE id = p_run_id FOR UPDATE;
    PERFORM lock_commission_order_periods(v_run.sub_department_id, ARRAY[v_run.period_month] || ARRAY(
        SELECT (o->>'order_period_month')::DATE FROM jsonb_array_elements(v_run.released_orders) o));
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
    PERFORM public.assert_commission_payroll_open(v_run.period_month);

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
    SELECT COUNT(*) INTO v_blocked
      FROM comm_statements s
      JOIN hr_monthly_payroll p
        ON p.staff_id = s.staff_id AND p.period_month = v_run.period_month
     WHERE s.run_id = p_run_id AND p.status <> 'draft';

    IF v_blocked > 0 THEN
        RAISE EXCEPTION '% payroll row(s) for % are no longer draft — commission cannot be written into a submitted month',
            v_blocked, to_char(v_run.period_month, 'Mon YYYY');
    END IF;

    -- An imported payroll is a separate source of truth. Do not relabel it
    -- or reuse its imported statutory/tax values as a Revenue calculation.
    IF EXISTS (
        SELECT 1 FROM comm_statements s
        JOIN hr_monthly_payroll p ON p.staff_id = s.staff_id AND p.period_month = v_run.period_month
        WHERE s.run_id = p_run_id AND p.source = 'imported'
    ) THEN
        RAISE EXCEPTION 'An imported payroll row already exists for a salesperson in this month. Resolve that source before syncing Revenue commission';
    END IF;

    IF EXISTS (
        SELECT 1 FROM comm_statements s
        JOIN hr_staff_costs st ON st.id = s.staff_id
        JOIN comm_sub_departments d ON d.id = v_run.sub_department_id
        WHERE s.run_id = p_run_id AND st.department_id IS DISTINCT FROM d.department_id
    ) THEN
        RAISE EXCEPTION 'A salesperson in this run belongs to another payroll department. Correct the Revenue membership before syncing';
    END IF;

    -- Invariant 5, checked before writing anything so the message names the
    -- order rather than surfacing a raw constraint violation.
    SELECT r.order_no INTO v_clash
      FROM jsonb_array_elements(v_run.released_orders) AS o
      JOIN comm_order_releases r ON r.order_no = o ->> 'order_no'
       AND r.sub_department_id = v_run.sub_department_id
     WHERE r.run_id <> p_run_id
     LIMIT 1;

    IF v_clash IS NOT NULL THEN
        RAISE EXCEPTION 'Order % has already been paid by an earlier run. Recompute this month so it is excluded.', v_clash;
    END IF;

    -- ── Payroll ────────────────────────────────────────────────────────────
    -- Existing monthly basic and other payroll inputs
    -- remain intact. New rows take their defaults from the staff master.
    -- commission_amount remains the GROSS upstream commission budget. Since
    -- 2026-09-10 several sub-departments may pay the same person the same
    -- month, so the figure is the SUM of every applied run's statement for
    -- that person and month: this run's, plus whatever other sub-departments
    -- have already applied. A re-apply of this sub-department replaces only
    -- its own share (the earlier run was reopened, so it is not 'applied').
    INSERT INTO hr_monthly_payroll (staff_id, period_month, basic_salary, commission_amount, source, status, created_by)
    SELECT s.staff_id,
           v_run.period_month,
           staff.basic_salary,
           s.total_commission + COALESCE((
             SELECT SUM(os.total_commission)
               FROM comm_statements os
               JOIN comm_runs orr ON orr.id = os.run_id
              WHERE os.staff_id = s.staff_id
                AND orr.period_month = v_run.period_month
                AND orr.status IN ('applied', 'locked')
                AND orr.id <> p_run_id
           ), 0),
           'commission', 'draft', auth.uid()
      FROM comm_statements s
      JOIN hr_staff_costs staff ON staff.id = s.staff_id
     WHERE s.run_id = p_run_id
    ON CONFLICT (staff_id, period_month) DO UPDATE
       SET commission_amount = EXCLUDED.commission_amount,
           source            = 'commission',
           updated_at        = NOW()
     WHERE hr_monthly_payroll.status = 'draft'
       AND hr_monthly_payroll.source <> 'imported';

    GET DIAGNOSTICS v_staff = ROW_COUNT;
    IF v_staff <> (SELECT COUNT(*) FROM comm_statements WHERE run_id = p_run_id) THEN
        RAISE EXCEPTION 'A payroll row changed status or source during commission sync. Refresh payroll and try again';
    END IF;

    -- ── Releases ───────────────────────────────────────────────────────────
    INSERT INTO comm_order_releases (
        sub_department_id, order_no, run_id, staff_id, period_month, order_period_month, product_revenue
    )
    SELECT
        v_run.sub_department_id,
        o ->> 'order_no',
        p_run_id,
        (o ->> 'staff_id')::UUID,
        v_run.period_month,
        (o ->> 'order_period_month')::DATE,
        COALESCE((o ->> 'product_revenue')::DECIMAL, 0)
      FROM jsonb_array_elements(v_run.released_orders) AS o
    ;

    GET DIAGNOSTICS v_released = ROW_COUNT;

    -- ── The title ratchet ──────────────────────────────────────────────────
    -- "Title 只会上，不会下" (user 2026-09-02). The month somebody is PAID a
    -- rank whose title sits higher on this ladder than the title they hold
    -- HERE, their membership's title is raised to it and stays there. The
    -- rank follows inside the row (comm_hierarchy_rank_follows_title).
    --
    -- The company title rises with it only when this run is the HOME
    -- sub-department's — that is the title HR calls them by and the People
    -- chart draws. An IR promotion is IR's; Fair's is everybody's.
    FOR v_p IN
        SELECT s.staff_id, s.rank_title_id, h.id AS membership_id,
               h.title_id AS current_title_id, st.employee_name, st.department_id
          FROM comm_statements s
          JOIN comm_hierarchy h
            ON h.staff_id = s.staff_id AND h.scheme_id = v_run.scheme_id AND h.effective_to IS NULL
          JOIN hr_staff_costs st ON st.id = s.staff_id
         WHERE s.run_id = p_run_id
           AND s.rank_title_id IS NOT NULL
           AND s.rank_title_id IS DISTINCT FROM h.title_id
    LOOP
        SELECT MIN(sort_order) INTO v_hit_pos
          FROM comm_ranks
         WHERE scheme_id = v_run.scheme_id AND title_id = v_p.rank_title_id;
        SELECT MIN(sort_order) INTO v_cur_pos
          FROM comm_ranks
         WHERE scheme_id = v_run.scheme_id AND title_id = v_p.current_title_id;

        IF v_hit_pos IS NOT NULL AND (v_cur_pos IS NULL OR v_hit_pos > v_cur_pos) THEN
            SELECT name INTO v_title_name FROM titles WHERE id = v_p.rank_title_id;

            UPDATE comm_hierarchy
               SET title_id = v_p.rank_title_id
             WHERE id = v_p.membership_id;

            v_home_scheme := comm_scheme_for_department(v_p.department_id);
            IF v_home_scheme = v_run.scheme_id THEN
                -- `designation` mirrors the title's name (titles migration,
                -- 2026-09-01): the payroll export reads it.
                --
                -- hr_staff_respects_ladder (the People org chart's rule,
                -- SQLSTATE 23LAD) may refuse this if the raised title would
                -- stand above the person's reports_to line on the company
                -- ladder. That is a People-chart fact commission cannot
                -- settle, so the apply stops here, says whose line it is, and
                -- the whole month rolls back.
                BEGIN
                    UPDATE hr_staff_costs
                       SET title_id = v_p.rank_title_id,
                           designation = v_title_name
                     WHERE id = v_p.staff_id;
                EXCEPTION WHEN SQLSTATE '23LAD' THEN
                    v_ladder_msg := SQLERRM;
                    RAISE EXCEPTION 'Could not raise %''s title to % — %. Fix their reporting line on People (or where that title sits on the company ladder), then apply again.',
                        v_p.employee_name, v_title_name, v_ladder_msg;
                END;
            END IF;

            INSERT INTO comm_title_promotions (
                run_id, staff_id, period_month, from_title_id, to_title_id, promoted_by
            )
            VALUES (
                p_run_id, v_p.staff_id, v_run.period_month,
                v_p.current_title_id, v_p.rank_title_id, auth.uid()
            );

            v_promoted := v_promoted + 1;
        END IF;
    END LOOP;

    UPDATE comm_runs
       SET status = 'applied', applied_at = NOW(), applied_by = auth.uid()
     WHERE id = p_run_id;

    RETURN jsonb_build_object(
        'run_id', p_run_id,
        'period_month', v_run.period_month,
        'staff_written', v_staff,
        'orders_released', v_released,
        'titles_promoted', v_promoted,
        'total_commission', v_run.total_commission
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_commission_run(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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

    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' ||
        (SELECT period_month::TEXT FROM comm_runs WHERE id = p_run_id)));
    SELECT * INTO v_run FROM comm_runs WHERE id = p_run_id FOR UPDATE;
    PERFORM lock_commission_order_periods(v_run.sub_department_id, ARRAY[v_run.period_month] || ARRAY(
        SELECT (o->>'order_period_month')::DATE FROM jsonb_array_elements(v_run.released_orders) o));
    IF v_run.id IS NULL THEN
        RAISE EXCEPTION 'Commission run not found';
    END IF;
    IF v_run.status NOT IN ('applied', 'computed') THEN
        RAISE EXCEPTION 'Nothing to reopen — the run is %', v_run.status;
    END IF;

    PERFORM public.assert_commission_payroll_open(v_run.period_month);

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
        -- Not zero: what the OTHER sub-departments' applied runs still pay
        -- this person for the month. This run is still 'applied' here, so it
        -- is excluded by id rather than by status.
        UPDATE hr_monthly_payroll p
           SET commission_amount = COALESCE((
                 SELECT SUM(os.total_commission)
                   FROM comm_statements os
                   JOIN comm_runs orr ON orr.id = os.run_id
                  WHERE os.staff_id = p.staff_id
                    AND orr.period_month = v_run.period_month
                    AND orr.status IN ('applied', 'locked')
                    AND orr.id <> p_run_id
               ), 0),
               updated_at = NOW()
          FROM comm_statements s
         WHERE s.run_id = p_run_id
           AND p.staff_id = s.staff_id
           AND p.period_month = v_run.period_month
           AND p.source = 'commission';
        GET DIAGNOSTICS v_zeroed = ROW_COUNT;

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
$function$;


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

    v_run_id     UUID;
    v_status     comm_run_status;
    v_stmt       JSONB;
    v_stmt_id    UUID;
    v_line_sum   DECIMAL(15, 2);
    v_total      DECIMAL(15, 2) := 0;
    v_count      INTEGER := 0;
BEGIN
    IF NOT has_scope(ARRAY['hr']) THEN
        RAISE EXCEPTION 'Only Principal or HR may compute a commission run';
    END IF;

    IF EXTRACT(DAY FROM p_period_month) <> 1 THEN
        RAISE EXCEPTION 'Period must be the first of a month, got %', p_period_month;
    END IF;

    -- Match apply/reopen/finance-submit lock order before locking the run.
    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || p_period_month::TEXT));
    PERFORM public.assert_commission_payroll_open(p_period_month);

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
            rank_title_id, promotes_to_title_id,
            base_rank_key, rank_key, rate_mode, qualifies_for_rank_key,
            product_rate, upline_staff_id,
            product_revenue, penalty_weighted_revenue, group_revenue,
            deferred_revenue, excluded_revenue, product_commission,
            kpi_qty, kpi_base, kpi_threshold_pct, kpi_commission,
            open_bill_bonus, override_commission,
            margin_revenue, margin_cost, margin_pct, margin_band_key,
            margin_incentive, margin_penalty_withheld, group_incentive, group_subsidy_cap, group_breakdown, full_spec,
            total_commission
        )
        VALUES (
            v_run_id,
            (v_stmt ->> 'staff_id')::UUID,
            (v_stmt ->> 'rank_title_id')::UUID,
            (v_stmt ->> 'promotes_to_title_id')::UUID,
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
            COALESCE((v_stmt ->> 'group_incentive')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'group_subsidy_cap')::DECIMAL, 0),
            COALESCE(v_stmt -> 'group_breakdown', '[]'::jsonb),
            COALESCE((v_stmt ->> 'full_spec')::boolean, false),
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

    -- Computing a valid Revenue month is the payroll hand-off. The call is
    -- in this transaction: payroll, releases and titles all succeed or roll
    -- back with the statements. Warnings stay visible for correction.
    IF jsonb_array_length(COALESCE(p_warnings, '[]'::JSONB)) = 0 THEN
        PERFORM public.apply_commission_run(v_run_id);
    END IF;

    RETURN v_run_id;
END;
$fn$;

COMMENT ON FUNCTION public.save_commission_run IS
  'Atomically saves commission statements and syncs clean runs into payroll, releases orders and raises titles. Warnings stay computed and unsynced. Reopen an applied run before changing inputs.';
COMMENT ON FUNCTION public.apply_commission_run IS
  'Internal clean-run sync, called automatically when a commission calculation is saved. Preserves monthly payroll inputs and totals all applied or locked sub-department shares. Imported payroll is never replaced.';
COMMENT ON FUNCTION public.reopen_commission_run IS
  'Removes only this run share from draft commission payroll and releases its orders. Other applied or locked sub-department shares and promoted titles remain. Refuses submitted, funded or vouchered payroll.';
