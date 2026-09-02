-- ============================================================================
-- 20260903030000_rank_title_ratchet.sql
-- The ladder's tier becomes a title, and a title is a ratchet
-- HOUZS Venture Portal
--
-- The user's rule (2026-09-02, plain words):
--
--   > 如果他曾经 hit 到哪一个 tier level，就 hit 到相应的那个 grade。这个月是 6 月，
--   > 他的 title 就变 Team Assistant 了；7 月没 hit 到 target，他的 percentage
--   > 就跌回去他之前的 percent，但是 title 还是 Team Assistant。
--   > Title 只会上，不会下。只有 rank 会上还是下，除非那个人是 fixed rank。
--
-- So a salesperson carries TWO facts from here on, and they move differently:
--
--   title   hr_staff_costs.title_id   A RATCHET. Written the month a run is
--                                     APPLIED whose paid rank belongs to a
--                                     higher title. Never lowered by the
--                                     engine; a human demotes on People.
--   rank %  comm_hierarchy.rank_id    The floor. A `variable` person climbs
--                                     above it on group sales and drops back
--                                     to it; a `fixed` person stays on it.
--                                     (This half already worked — see
--                                     resolveRank in engine.ts.)
--
-- What this migration does:
--
--   1. comm_ranks.tier_key / tier_label (free text) → comm_ranks.title_id →
--      titles. The Rules page picks a title from Team → Role & Permission
--      instead of typing a label. Backfilled 1:1 for the Fair ladder — the
--      Revenue Department already carries the six titles (user confirmed
--      the mapping 2026-09-03).
--   2. comm_statements snapshots the title of the rank PAID (rank_title_id)
--      and the title the run would promote them to (promotes_to_title_id).
--      The second is the engine's preview for the dashboard; the write is the
--      RPC's, decided live at apply time.
--   3. comm_title_promotions — one audit row per ratchet.
--   4. apply_commission_run does the ratchet: raises hr_staff_costs.title_id
--      (and mirrors `designation`, which the payroll export reads) and logs
--      it. reopen_commission_run deliberately does NOT undo it.
--   5. "Can recruit" now follows the TITLE, not the month's rank (user
--      2026-09-03): a Team Assistant who slips back to 5% for a month keeps
--      the team they built. Enforced in the app (engine + Server Action); the
--      ladder's tick stays per rung, and a title may recruit when any rung
--      it carries may.
--
-- A title's rank order is the LADDER's: a title sits where its lowest rung
-- sits. Nothing is read from titles.sort_order, and nothing from
-- title_levels either — the company-wide rungs (Assistant … Head of
-- Department, migration 20260902163019 of the same day) compare titles ACROSS
-- departments for the People org chart; the commission ladder is the one
-- authority on which Revenue title outranks which, because that is what the
-- rate follows. The two meet at the ratchet's UPDATE: hr_staff_costs carries
-- the ladder trigger (hr_staff_respects_ladder), which refuses a title that
-- would stand above the person's `reports_to` line. When that happens the
-- apply fails LOUDLY, naming the person and the line, and the whole month
-- rolls back — a reporting line the People chart got wrong is not something
-- commission should quietly step around.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. comm_ranks: tier → title
-- ----------------------------------------------------------------------------

ALTER TABLE comm_ranks
    ADD COLUMN title_id UUID REFERENCES titles(id) ON DELETE RESTRICT;

-- 1:1 for the seeded Fair ladder. Match on name within the sub-department's
-- own department, so a ladder never borrows another department's titles.
UPDATE comm_ranks r
   SET title_id = t.id
  FROM comm_schemes s
  JOIN comm_sub_departments sd ON sd.id = s.sub_department_id
  JOIN titles t ON t.department_id = sd.department_id
 WHERE r.scheme_id = s.id
   AND upper(btrim(t.name)) = CASE r.rank_key
         WHEN 'rs_5'   THEN 'REVENUE SPECIALIST'
         WHEN 'rs_6'   THEN 'SENIOR REVENUE SPECIALIST'
         WHEN 'ta_7'   THEN 'TEAM ASSISTANT'
         WHEN 'ta_8'   THEN 'SENIOR TEAM ASSISTANT'
         WHEN 'tl_9'   THEN 'TEAM LEADER'
         WHEN 'stl_10' THEN 'SENIOR TEAM LEADER'
       END;

-- Loud, not silent: a rung with no title would make the ratchet undefined.
DO $chk$
DECLARE
    v_missing TEXT;
BEGIN
    SELECT string_agg(rank_key, ', ' ORDER BY sort_order) INTO v_missing
      FROM comm_ranks
     WHERE title_id IS NULL;
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'comm_ranks still without a title after backfill: %. Create the titles under the Revenue Department (Team → Role & Permission) first.',
            v_missing;
    END IF;
END;
$chk$;

ALTER TABLE comm_ranks
    ALTER COLUMN title_id SET NOT NULL,
    DROP COLUMN tier_key,
    DROP COLUMN tier_label;

CREATE INDEX idx_comm_ranks_title ON comm_ranks (scheme_id, title_id);

COMMENT ON COLUMN comm_ranks.title_id IS
    'The title (Team → Role & Permission) this rung belongs to. Several rungs may share one. A person who is PAID this rung in an applied month has their title raised to it — and never lowered by the engine.';

-- ----------------------------------------------------------------------------
-- 2. comm_statements: snapshot the title paid, preview the promotion
-- ----------------------------------------------------------------------------

ALTER TABLE comm_statements
    DROP COLUMN tier_key,
    ADD COLUMN rank_title_id UUID REFERENCES titles(id) ON DELETE SET NULL,
    ADD COLUMN promotes_to_title_id UUID REFERENCES titles(id) ON DELETE SET NULL;

COMMENT ON COLUMN comm_statements.rank_title_id IS
    'Title of the rank actually paid this month (rank_key''s title at compute time).';
COMMENT ON COLUMN comm_statements.promotes_to_title_id IS
    'Engine preview: the title this run would raise them to, or NULL when it is not above what they hold. apply_commission_run decides afresh from the live record; comm_title_promotions is what actually happened.';

-- ----------------------------------------------------------------------------
-- 3. comm_title_promotions: the audit line
-- ----------------------------------------------------------------------------

CREATE TABLE comm_title_promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Nullable + SET NULL rather than CASCADE: the person's title stays raised
    -- even if the run row ever went, so the record of why must too.
    run_id UUID REFERENCES comm_runs(id) ON DELETE SET NULL,
    staff_id UUID NOT NULL REFERENCES hr_staff_costs(id) ON DELETE CASCADE,
    period_month DATE NOT NULL,
    from_title_id UUID REFERENCES titles(id) ON DELETE RESTRICT,
    to_title_id UUID NOT NULL REFERENCES titles(id) ON DELETE RESTRICT,
    promoted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    promoted_by UUID REFERENCES users(id)
);

CREATE INDEX idx_comm_title_promotions_staff ON comm_title_promotions (staff_id, promoted_at DESC);
CREATE INDEX idx_comm_title_promotions_run ON comm_title_promotions (run_id);

COMMENT ON TABLE comm_title_promotions IS
    'Every time apply_commission_run raised somebody''s title. A ratchet only goes one way: reopening the run does not write a row here and does not lower the title.';

-- Same wall as every other comm_* table: Principal and HR, nobody else.
ALTER TABLE comm_title_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY comm_title_promotions_principal_all ON comm_title_promotions FOR ALL
    USING ((SELECT has_scope(ARRAY['admin'])))
    WITH CHECK ((SELECT has_scope(ARRAY['admin'])));

CREATE POLICY comm_title_promotions_hr_all ON comm_title_promotions FOR ALL
    USING ((SELECT has_scope(ARRAY['hr'])))
    WITH CHECK ((SELECT has_scope(ARRAY['hr'])));

-- ----------------------------------------------------------------------------
-- 4. save_commission_run: tier_key → rank_title_id + promotes_to_title_id
-- Body otherwise identical to 20260831040000.
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
            rank_title_id, promotes_to_title_id,
            base_rank_key, rank_key, rate_mode, qualifies_for_rank_key,
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

-- ----------------------------------------------------------------------------
-- 5. apply_commission_run: + the title ratchet
-- Everything up to the payroll write is unchanged from 20260831040000.
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
    v_promoted     INTEGER := 0;
    v_clash        TEXT;
    v_p            RECORD;
    v_hit_pos      INTEGER;
    v_cur_pos      INTEGER;
    v_title_name   TEXT;
    v_ladder_msg   TEXT;
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
    -- commission_amount is the ONLY payroll field this module writes. The
    -- row's statutory, PCB / withholding, gross and net are all recomputed by
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

    -- ── The title ratchet ──────────────────────────────────────────────────
    -- "Title 只会上，不会下" (user 2026-09-02). The month somebody is PAID a
    -- rank whose title sits higher on this ladder than the title they hold,
    -- their title is raised to it and stays there — the rank itself keeps
    -- floating with the target; the title does not.
    --
    -- Decided here from the LIVE staff record, not from the statement's
    -- preview column: HR may have moved the title between compute and apply,
    -- and the ratchet must compare against what is true now.
    --
    -- A title's position is where its lowest rung sits on THIS scheme's
    -- ladder. A title that is not on the ladder at all (none yet, or one from
    -- another department) sits below every rung, so the first paid rank
    -- gives them a ladder title.
    FOR v_p IN
        SELECT s.staff_id, s.rank_title_id, h.title_id AS current_title_id, h.employee_name
          FROM comm_statements s
          JOIN hr_staff_costs h ON h.id = s.staff_id
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

            -- `designation` mirrors the title's name (titles migration,
            -- 2026-09-01): the payroll export reads it.
            --
            -- hr_staff_respects_ladder (the People org chart's rule, SQLSTATE
            -- 23LAD) may refuse this if the raised title would stand above
            -- the person's reports_to line on the company ladder. That is a
            -- People-chart fact commission cannot settle, so the apply stops
            -- here, says whose line it is, and the whole month rolls back.
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
$fn$;

COMMENT ON FUNCTION public.apply_commission_run IS
    'Writes a computed run into hr_monthly_payroll.commission_amount, records which orders it paid for, and raises each salesperson''s title to the title of the rank they were paid when that is higher (never lower — the ratchet). Refuses on any outstanding warning, on a payroll month that is no longer draft, and on an order another run already paid.';

COMMENT ON FUNCTION public.reopen_commission_run IS
    'Reverses an apply — zeroes the payroll commission and drops the order releases — so the month can be re-imported or recomputed. Does NOT lower a title the apply raised: a ratchet only goes one way, and a human demotes on the People page.';
