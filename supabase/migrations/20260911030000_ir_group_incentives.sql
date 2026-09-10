-- IR monthly packages and bounded group/override depth. Existing schemes keep
-- their current whole-tree behaviour until configured; no live rules are seeded.
alter type public.comm_component add value if not exists 'group_incentive';

-- Different packages can be kept in the catalogue, but only one can define
-- this scheme's group qualification. Competing targets have no agreed rules.
create unique index uq_comm_single_group_package on public.comm_ranks (scheme_id)
  where group_incentive_amount > 0;

alter table public.comm_schemes
  add column enable_group_incentive boolean not null default false,
  add column group_sales_depth integer,
  add column override_depth integer,
  add column direct_line_limit integer,
  add constraint comm_group_sales_depth_valid check (group_sales_depth between 1 and 20),
  add constraint comm_override_depth_valid check (override_depth between 1 and 20),
  add constraint comm_direct_line_limit_valid check (direct_line_limit between 1 and 20),
  add constraint comm_group_package_depth check (not enable_group_incentive or (group_sales_depth = 2 and override_depth = 2 and direct_line_limit = 3) is true);

alter table public.comm_statements
  add column group_incentive decimal(15,2) not null default 0 check (group_incentive >= 0),
  add column group_subsidy_cap decimal(15,2) not null default 0 check (group_subsidy_cap >= 0),
  add column group_breakdown jsonb not null default '[]'::jsonb check (jsonb_typeof(group_breakdown) = 'array'),
  add column full_spec boolean not null default false;

alter table public.comm_statements add constraint comm_group_replaces_percentage check (
  group_incentive = 0 or (product_rate = 0 and product_commission = 0 and override_commission = 0)
);

alter table public.comm_statements drop constraint components_tally;
alter table public.comm_statements add constraint components_tally check (
  abs(total_commission - (product_commission + kpi_commission + open_bill_bonus
    + override_commission + margin_incentive + group_incentive)) <= 0.01
);

comment on column public.comm_statements.group_subsidy_cap is
  'Non-cash monthly Claims cap; excluded from total_commission and payroll. An instalment registration is still needed to pay it.';
comment on column public.comm_statements.group_breakdown is
  'Monthly direct-line qualification snapshot. Leader personal sales intentionally appear in every group; these totals are not additive actual revenue.';

-- Updated save RPC below retains the existing atomic line/statement/run
-- invariants and carries the group snapshot into the statement.
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

    RETURN v_run_id;
END;
$fn$;
