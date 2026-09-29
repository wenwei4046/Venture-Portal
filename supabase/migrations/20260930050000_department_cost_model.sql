-- ════════════════════════════════════════════════════════════════════════════
-- A department is a COST CENTER or CENTRALIZED (2026-09-30)
--
-- User 2026-09-30, on Billing Allocation's name list:
--
--   COST CENTER — only passes its cost through: whatever it spends is split
--   across the subsidiaries, so its pool nets to zero ("in 多少就 out 多少").
--   HR, Finance, IT and Director Office.
--
--   CENTRALIZED — bills a service to the subsidiaries by INVOICE, collects the
--   money into its own pool and pays its own people and expenses from it
--   ("有自己的 pool 可以自主运用"). Director (the subsidiaries pay the
--   directors' CTC), Marketing, Revenue Department. It is not split, so it is
--   not on Billing Allocation's name list.
--
--   An on/off switch per department, flipped by the highest authority —
--   in Settings › Departments and on each department's own page.
--
-- What the mode decides today: who is on Billing Allocation. A centralized
-- department's people are not listed and cannot be given a split; switching a
-- department to centralized clears its splits on payroll that is still a draft
-- (a split whose payroll row is Completed or later stays — it left with that
-- pay, like every other split; 20260930040000).
--
-- What it does NOT decide (user 2026-09-30): whether a cost center's leftover
-- — the part of its payroll not billed to a subsidiary — is charged to Venture
-- Office. A cost center SHOULD net to zero, but if it does not, the user wants
-- to see where the bill-back was missed, not have Venture absorb it silently.
-- That stays `own_share_billback`, ticked by Finance per run (20260929040000).
--
-- Seeded as the user classified them. None of the three centralized
-- departments has ever had a split (checked 2026-09-30), so nothing billed
-- moves.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.department_set_cost_model(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.department_modes();
--   re-run 20260930040000 for guard_staff_allocation_follows_payroll();
--   DELETE FROM public.role_default_permissions WHERE permission_key = 'department_mode';
--   DELETE FROM public.permission_defs WHERE key = 'department_mode';
--   ALTER TABLE public.departments DROP COLUMN IF EXISTS cost_model;
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 1. The mode ────────────────────────────────────────────────────────────

ALTER TABLE public.departments
    ADD COLUMN IF NOT EXISTS cost_model TEXT NOT NULL DEFAULT 'cost_center';
ALTER TABLE public.departments DROP CONSTRAINT IF EXISTS departments_cost_model_known;
ALTER TABLE public.departments ADD CONSTRAINT departments_cost_model_known
    CHECK (cost_model IN ('cost_center', 'centralized'));

COMMENT ON COLUMN public.departments.cost_model IS
    'cost_center = its payroll is split across the subsidiaries on Billing Allocation and its pool should net to zero; centralized = bills the subsidiaries by invoice, runs its own pool, not on Billing Allocation (2026-09-30). Switched by department_set_cost_model.';

UPDATE public.departments
   SET cost_model = 'centralized'
 WHERE segment_key IN ('director', 'marketing', 'revenue_department');


-- ─── 2. Who may switch it: the highest authority ────────────────────────────
-- Scope 'none': the switch is a SECURITY DEFINER function, so granting it to
-- somebody later opens no table to them.

INSERT INTO public.permission_defs (key, label, section, scope, description, sort_order)
VALUES ('department_mode', 'Department mode', 'Admin', 'none',
        'Switch a department between cost center (split across the subsidiaries on Billing Allocation) and centralized (bills by invoice, runs its own pool).',
        232)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_default_permissions (role, permission_key)
VALUES ('principal', 'department_mode')
ON CONFLICT DO NOTHING;


-- ─── 3. A centralized department's people take no split ────────────────────
-- 20260930040000's guard, plus one rule on the side a split lands on.
-- Removing one is still allowed (subject to the payroll lock), so a split left
-- over from before can be cleared.

CREATE OR REPLACE FUNCTION public.guard_staff_allocation_follows_payroll()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_side    TEXT;
    v_staff   UUID;
    v_period  DATE;
    v_status  TEXT;
    v_revenue BOOLEAN;
    v_name    TEXT;
    v_month   TEXT;
    v_dept    TEXT;
    v_model   TEXT;
BEGIN
    -- The payroll's own functions (and cleanups run inside them) pass, as they
    -- do past guard_payroll_row_lifecycle.
    IF coalesce(current_setting('app.payroll_lifecycle', true), '') <> '' THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    -- A split row is checked where it is removed from and where it lands.
    FOREACH v_side IN ARRAY (CASE TG_OP
        WHEN 'INSERT' THEN ARRAY['new']
        WHEN 'DELETE' THEN ARRAY['old']
        ELSE ARRAY['old', 'new'] END)
    LOOP
        IF v_side = 'old' THEN
            v_staff := OLD.staff_id;  v_period := OLD.period_month;
        ELSE
            v_staff := NEW.staff_id;  v_period := NEW.period_month;
        END IF;
        v_month := to_char(v_period, 'FMMonth YYYY');

        SELECT mp.status::TEXT,
               (mp.source::TEXT = 'commission' OR coalesce(d.payroll_source::TEXT = 'commission', false)),
               s.employee_name, d.name, d.cost_model
          INTO v_status, v_revenue, v_name, v_dept, v_model
          FROM hr_monthly_payroll mp
          JOIN hr_staff_costs s ON s.id = mp.staff_id
          LEFT JOIN departments d ON d.id = s.department_id
         WHERE mp.staff_id = v_staff AND mp.period_month = v_period;

        IF NOT FOUND THEN
            -- Removing: the payroll row is already gone (its own removal
            -- cascades here) — there is nothing left to protect.
            IF v_side = 'old' THEN
                CONTINUE;
            END IF;
            SELECT employee_name INTO v_name FROM hr_staff_costs WHERE id = v_staff;
            RAISE EXCEPTION '% is not on % payroll — add them on HR › Payroll before splitting their cost',
                coalesce(v_name, 'This person'), v_month USING ERRCODE = '23PAY';
        END IF;

        IF payroll_month_closed(v_period) THEN
            RAISE EXCEPTION 'Payroll for % is closed for good — its billing splits cannot change',
                v_month USING ERRCODE = '23PAY';
        END IF;

        IF v_status <> 'draft' THEN
            RAISE EXCEPTION '%''s % pay is % — its billing split is locked with it. % to change it',
                coalesce(v_name, 'This person'), v_month,
                CASE v_status WHEN 'completed' THEN 'Completed'
                              WHEN 'submitted' THEN 'with Finance'
                              ELSE v_status END,
                CASE WHEN v_status = 'completed' AND v_revenue THEN 'Reopen them on Comm Cal'
                     WHEN v_status = 'completed' THEN 'Unlock them on HR › Payroll'
                     ELSE 'Resubmit them on HR › Payroll' END
                USING ERRCODE = '23PAY';
        END IF;

        IF v_side = 'new' AND v_model = 'centralized' THEN
            RAISE EXCEPTION '% is centralized — it bills the subsidiaries by invoice, so %''s pay is not split. Switch % to Cost center first',
                v_dept, coalesce(v_name, 'this person'), v_dept USING ERRCODE = '23PAY';
        END IF;
    END LOOP;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$fn$;

COMMENT ON FUNCTION public.guard_staff_allocation_follows_payroll() IS
    'A billing split (hr_staff_allocation) changes only while its payroll row is a draft, never in a month Closed for good, and never lands on a centralized department''s person (2026-09-30). The payroll''s own lifecycle functions pass (app.payroll_lifecycle).';


-- ─── 4. Reading the modes ───────────────────────────────────────────────────
-- Names, modes and a head-count — never a salary, so every signed-in person
-- may read it. `can_switch` answers for the person SIGNED IN, not the view
-- they are looking through: the Principal flips it from HR's or Finance's
-- view too (user 2026-09-30). `open_split_people` is how many people (per
-- month) still have a split on draft payroll — what switching to centralized
-- would clear.

CREATE OR REPLACE FUNCTION public.department_modes()
RETURNS TABLE (
    id                UUID,
    name              TEXT,
    segment_key       TEXT,
    is_internal       BOOLEAN,
    cost_model        TEXT,
    open_split_people INTEGER,
    can_switch        BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
    SELECT d.id, d.name, d.segment_key, d.is_internal, d.cost_model,
           (SELECT count(*)::INTEGER
              FROM (SELECT DISTINCT a.staff_id, a.period_month
                      FROM hr_staff_allocation a
                      JOIN hr_monthly_payroll mp
                        ON mp.staff_id = a.staff_id AND mp.period_month = a.period_month
                       AND mp.status = 'draft'
                      JOIN hr_staff_costs s ON s.id = a.staff_id AND s.department_id = d.id
                     WHERE NOT payroll_month_closed(a.period_month)) open_splits),
           coalesce(has_perm('department_mode'), false)
      FROM departments d
     WHERE auth.uid() IS NOT NULL
     ORDER BY d.name;
$fn$;

REVOKE ALL ON FUNCTION public.department_modes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.department_modes() TO authenticated;


-- ─── 5. The switch ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.department_set_cost_model(p_department_id UUID, p_cost_model TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_dept    RECORD;
    v_splits  INTEGER := 0;
    v_people  INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL OR NOT coalesce(has_perm('department_mode'), false) THEN
        RAISE EXCEPTION 'Only the Principal can switch a department between cost center and centralized'
            USING ERRCODE = '42501';
    END IF;
    IF p_cost_model IS NULL OR p_cost_model NOT IN ('cost_center', 'centralized') THEN
        RAISE EXCEPTION 'A department is a cost center or centralized';
    END IF;

    SELECT id, name, is_internal, segment_key, cost_model INTO v_dept
      FROM departments WHERE id = p_department_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'That department no longer exists — refresh the page';
    END IF;
    IF v_dept.is_internal THEN
        RAISE EXCEPTION '% is HOUZS Venture itself — it is neither a cost center nor centralized', v_dept.name;
    END IF;
    IF v_dept.segment_key IS NULL THEN
        RAISE EXCEPTION '% has no pool of its own yet — 转正 it in Settings › Departments first', v_dept.name;
    END IF;
    IF v_dept.cost_model = p_cost_model THEN
        RETURN jsonb_build_object('changed', false, 'cleared_splits', 0, 'cleared_people', 0);
    END IF;

    UPDATE departments SET cost_model = p_cost_model WHERE id = p_department_id;

    -- Centralized: its people leave Billing Allocation, so a split still open
    -- (payroll row a draft) goes. One whose payroll row is Completed or later
    -- stays — it left with that pay.
    IF p_cost_model = 'centralized' THEN
        WITH gone AS (
            DELETE FROM hr_staff_allocation a
             USING hr_monthly_payroll mp, hr_staff_costs s
             WHERE mp.staff_id = a.staff_id
               AND mp.period_month = a.period_month
               AND mp.status = 'draft'
               AND s.id = a.staff_id
               AND s.department_id = p_department_id
               AND NOT payroll_month_closed(a.period_month)
            RETURNING a.staff_id, a.period_month
        )
        SELECT count(*), count(DISTINCT (staff_id, period_month)) INTO v_splits, v_people FROM gone;
    END IF;

    INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
    VALUES (auth.uid(), 'department', p_department_id::TEXT, 'set_cost_model',
            jsonb_build_object('name', v_dept.name, 'from', v_dept.cost_model, 'to', p_cost_model,
                               'cleared_splits', v_splits, 'cleared_people', v_people));

    RETURN jsonb_build_object('changed', true, 'cleared_splits', v_splits, 'cleared_people', v_people);
END;
$fn$;

REVOKE ALL ON FUNCTION public.department_set_cost_model(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.department_set_cost_model(UUID, TEXT) TO authenticated;
