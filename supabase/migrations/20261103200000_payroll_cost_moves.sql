-- ════════════════════════════════════════════════════════════════════════════
-- Part of a person's payroll cost billed to another department (2026-11-03)
--
-- The user, of Director Office's Vivian: "我打算split RM 3000 是由hr pool 承担，
-- 然后hr 那边再根据他department 的percentage bill 去给每个公司" — and "可能往后也会
-- 别的department bill 去别的department, 所以要确定". Of the two ways shown — A, the
-- part is the receiver's own cost in payroll's funding and accrual, no invoice;
-- B, an internal invoice as the one to Venture Office — "对，我决定还是要方法b"
-- (spec: docs/superpowers/specs/2026-11-03-payroll-cost-to-department-design.md).
--
-- So payroll's funding and accrual do not change. What does:
--   1. A person's department lines (hr_staff_dept_moves): a fixed RM or a % of
--      their employer cost, to another department. They follow the company
--      split's lock — a draft row only, a Resubmit opening them again ("不是说
--      不用send back吗？她resubmit 就行？") — and a centralized person may have
--      them, though never a company split ("让他们也能吧" → "只能转给别的部门").
--   2. The receivers' monthly Bill to % (hr_pool_allocation, the January table
--      made for it and never used): HR sets it each month ("每月 HR 自己定"),
--      never for a centralized department (it bears what it receives), nor in
--      a month closed for good; it may now be deleted and set again.
--   3. Every department with a pool has its "Inter-billing - <name>" expense
--      account — the paying side of an internal invoice finds it by name. IT
--      has none (provisioning opens the pool's account only); it gets one, and
--      so does any department given a segment from now on.
--
-- Rollback, in words (the database tool refuses the keyword): take away the
-- triggers and functions this file adds (guard_staff_dept_moves,
-- guard_pool_allocation, ensure_inter_billing_account and their triggers),
-- the table hr_staff_dept_moves with its registry rows, the DELETE policy and
-- registry row on hr_pool_allocation (put back hr_pool_alloc_no_delete
-- USING (false) and its reads row without hr_costing.view:own), and leave the
-- inter-billing accounts (journal lines may name them).
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 1. A person's department lines ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hr_staff_dept_moves (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id      UUID NOT NULL REFERENCES public.hr_staff_costs(id),
    period_month  DATE NOT NULL,
    department_id UUID NOT NULL REFERENCES public.departments(id),
    -- One of the two: a fixed RM of the person's employer cost, or a fraction of it (0–1).
    amount        NUMERIC(15, 2),
    pct           NUMERIC(7, 6),
    created_by    UUID NOT NULL REFERENCES public.users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT hr_staff_dept_moves_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1),
    CONSTRAINT hr_staff_dept_moves_amount_or_pct CHECK (
        (amount IS NOT NULL AND pct IS NULL AND amount > 0)
        OR (pct IS NOT NULL AND amount IS NULL AND pct > 0 AND pct <= 1)),
    CONSTRAINT hr_staff_dept_moves_one_a_department UNIQUE (staff_id, period_month, department_id),
    CONSTRAINT hr_staff_dept_moves_payroll_row FOREIGN KEY (staff_id, period_month)
        REFERENCES public.hr_monthly_payroll(staff_id, period_month) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS hr_staff_dept_moves_period_idx ON public.hr_staff_dept_moves (period_month, department_id);

COMMENT ON TABLE public.hr_staff_dept_moves IS
    'Part of a person''s monthly employer cost billed to another department (2026-11-03, method B): a fixed amount or a fraction (pct, 0–1). Billed by an automatic internal invoice with the month''s payroll invoices; payroll''s funding and accrual are untouched. Changes as the company split does (guard_staff_dept_moves).';

-- As the company split's guard (guard_staff_allocation_follows_payroll, 20260930050000), its words the same: a line
-- changes only while its payroll row is a draft, never in a month closed for good, and only for somebody on the
-- month's payroll. Unlike the split, a centralized person may have one; and the receiver must be another department
-- with a pool of its own — not the person's own, not Venture Office.
CREATE OR REPLACE FUNCTION public.guard_staff_dept_moves()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_side        TEXT;
    v_staff       UUID;
    v_period      DATE;
    v_to          UUID;
    v_status      TEXT;
    v_revenue     BOOLEAN;
    v_name        TEXT;
    v_month       TEXT;
    v_dept_id     UUID;
    v_dept        TEXT;
    v_dept_seg    TEXT;
    v_to_name     TEXT;
    v_to_internal BOOLEAN;
    v_to_segment  TEXT;
BEGIN
    -- The payroll's own functions (and cleanups run inside them) pass.
    IF coalesce(current_setting('app.payroll_lifecycle', true), '') <> '' THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    FOREACH v_side IN ARRAY (CASE TG_OP
        WHEN 'INSERT' THEN ARRAY['new']
        WHEN 'DELETE' THEN ARRAY['old']
        ELSE ARRAY['old', 'new'] END)
    LOOP
        IF v_side = 'old' THEN
            v_staff := OLD.staff_id;  v_period := OLD.period_month;  v_to := OLD.department_id;
        ELSE
            v_staff := NEW.staff_id;  v_period := NEW.period_month;  v_to := NEW.department_id;
        END IF;
        v_month := to_char(v_period, 'FMMonth YYYY');

        SELECT mp.status::TEXT,
               (mp.source::TEXT = 'commission' OR coalesce(d.payroll_source::TEXT = 'commission', false)),
               s.employee_name, s.department_id, d.name, d.segment_key
          INTO v_status, v_revenue, v_name, v_dept_id, v_dept, v_dept_seg
          FROM hr_monthly_payroll mp
          JOIN hr_staff_costs s ON s.id = mp.staff_id
          LEFT JOIN departments d ON d.id = s.department_id
         WHERE mp.staff_id = v_staff AND mp.period_month = v_period;

        IF NOT FOUND THEN
            -- Removing: the payroll row is already gone (its removal cascades here).
            IF v_side = 'old' THEN
                CONTINUE;
            END IF;
            SELECT employee_name INTO v_name FROM hr_staff_costs WHERE id = v_staff;
            RAISE EXCEPTION '% is not on % payroll — add them on HR › Payroll before moving their cost',
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

        IF v_side = 'new' THEN
            SELECT name, is_internal, segment_key INTO v_to_name, v_to_internal, v_to_segment
              FROM departments WHERE id = v_to;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'That department no longer exists — refresh the page' USING ERRCODE = '23PAY';
            END IF;
            IF v_to = v_dept_id THEN
                RAISE EXCEPTION '% is in % — move the cost to another department',
                    coalesce(v_name, 'This person'), v_dept USING ERRCODE = '23PAY';
            END IF;
            -- The sender recovers the move in its own pool's P&L, so it needs one too.
            IF v_dept_seg IS NULL THEN
                RAISE EXCEPTION '% is in %, which has no pool of its own — their cost cannot move to another department',
                    coalesce(v_name, 'This person'), coalesce(v_dept, 'no department') USING ERRCODE = '23PAY';
            END IF;
            IF v_to_internal THEN
                RAISE EXCEPTION '% does not take moved payroll — HOUZS Venture''s own share reaches it by the bill-back',
                    v_to_name USING ERRCODE = '23PAY';
            END IF;
            IF v_to_segment IS NULL THEN
                RAISE EXCEPTION '% has no pool of its own — moved payroll goes to a department with one',
                    v_to_name USING ERRCODE = '23PAY';
            END IF;
        END IF;
    END LOOP;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$fn$;

COMMENT ON FUNCTION public.guard_staff_dept_moves() IS
    'A department line (hr_staff_dept_moves) changes only while its payroll row is a draft, never in a month Closed for good, and lands only on another department with a pool, never Venture Office (2026-11-03). A centralized person may have one. The payroll''s own lifecycle functions pass (app.payroll_lifecycle).';

DROP TRIGGER IF EXISTS trg_hr_staff_dept_moves_follow_payroll ON public.hr_staff_dept_moves;
CREATE TRIGGER trg_hr_staff_dept_moves_follow_payroll
    BEFORE INSERT OR UPDATE OR DELETE ON public.hr_staff_dept_moves
    FOR EACH ROW EXECUTE FUNCTION public.guard_staff_dept_moves();

ALTER TABLE public.hr_staff_dept_moves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hr_staff_dept_moves_hr_select ON public.hr_staff_dept_moves;
CREATE POLICY hr_staff_dept_moves_hr_select ON public.hr_staff_dept_moves FOR SELECT TO authenticated
    USING ((SELECT has_scope(ARRAY['hr'])));
DROP POLICY IF EXISTS hr_staff_dept_moves_hr_insert ON public.hr_staff_dept_moves;
CREATE POLICY hr_staff_dept_moves_hr_insert ON public.hr_staff_dept_moves FOR INSERT TO authenticated
    WITH CHECK ((SELECT has_scope(ARRAY['hr'])));
DROP POLICY IF EXISTS hr_staff_dept_moves_hr_update ON public.hr_staff_dept_moves;
CREATE POLICY hr_staff_dept_moves_hr_update ON public.hr_staff_dept_moves FOR UPDATE TO authenticated
    USING ((SELECT has_scope(ARRAY['hr']))) WITH CHECK ((SELECT has_scope(ARRAY['hr'])));
DROP POLICY IF EXISTS hr_staff_dept_moves_hr_delete ON public.hr_staff_dept_moves;
CREATE POLICY hr_staff_dept_moves_hr_delete ON public.hr_staff_dept_moves FOR DELETE TO authenticated
    USING ((SELECT has_scope(ARRAY['hr'])));

REVOKE ALL ON public.hr_staff_dept_moves FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_staff_dept_moves TO authenticated;
GRANT ALL ON public.hr_staff_dept_moves TO service_role;

SELECT public.audit_register('hr_staff_dept_moves', 'Payroll moved to departments', 'Payroll', '{hr_costing}',
    p_labels => '{staff_id,department_id,period_month}');

-- HR writes them on Allocation (HR Costing · Create / Edit); HR reads them there. Finance reads totals only, through
-- the billing functions (SECURITY DEFINER).
INSERT INTO public.permission_table_writes (table_name, command, actions) VALUES
  ('hr_staff_dept_moves', 'DELETE', ARRAY['hr_costing.create', 'hr_costing.edit']),
  ('hr_staff_dept_moves', 'INSERT', ARRAY['hr_costing.create', 'hr_costing.edit']),
  ('hr_staff_dept_moves', 'UPDATE', ARRAY['hr_costing.create', 'hr_costing.edit'])
ON CONFLICT (table_name, command) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_writes_guard('hr_staff_dept_moves');

INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('hr_staff_dept_moves', ARRAY['hr_costing.create', 'hr_costing.edit', 'hr_costing.view:own'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_reads_guard('hr_staff_dept_moves');


-- ─── 2. The receivers' monthly Bill to % ────────────────────────────────────
-- hr_pool_allocation (20260101000007, "monthly split % for HR/Finance pool cost allocation"; 0 rows, no screen until
-- now): a receiving cost-center department's companies and percentages for the month. HR sets a month by deleting
-- and writing it again, as the company split is saved — so it may now be deleted.

DROP POLICY IF EXISTS hr_pool_alloc_no_delete ON public.hr_pool_allocation;
DROP POLICY IF EXISTS hr_pool_alloc_hr_delete ON public.hr_pool_allocation;
CREATE POLICY hr_pool_alloc_hr_delete ON public.hr_pool_allocation FOR DELETE TO authenticated
    USING ((SELECT has_scope(ARRAY['hr'])));

INSERT INTO public.permission_table_writes (table_name, command, actions) VALUES
  ('hr_pool_allocation', 'DELETE', ARRAY['hr_costing.create', 'hr_costing.edit'])
ON CONFLICT (table_name, command) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_writes_guard('hr_pool_allocation');

-- The Allocation page reads it under HR Costing · View (requirePermission('hr_costing')).
INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('hr_pool_allocation', ARRAY['hr_costing.create', 'hr_costing.edit', 'hr_costing.view:own'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_reads_guard('hr_pool_allocation');

-- Never for a centralized department (it bills the companies by its own invoices: what moves into it is its cost),
-- nor Venture Office, nor a department with no pool; never in a month closed for good.
CREATE OR REPLACE FUNCTION public.guard_pool_allocation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_side     TEXT;
    v_dept     UUID;
    v_period   DATE;
    v_name     TEXT;
    v_internal BOOLEAN;
    v_segment  TEXT;
    v_model    TEXT;
BEGIN
    FOREACH v_side IN ARRAY (CASE TG_OP
        WHEN 'INSERT' THEN ARRAY['new']
        WHEN 'DELETE' THEN ARRAY['old']
        ELSE ARRAY['old', 'new'] END)
    LOOP
        IF v_side = 'old' THEN
            v_dept := OLD.department_id;  v_period := OLD.period_month;
        ELSE
            v_dept := NEW.department_id;  v_period := NEW.period_month;
        END IF;

        IF payroll_month_closed(v_period) THEN
            RAISE EXCEPTION 'Payroll for % is closed for good — its billing splits cannot change',
                to_char(v_period, 'FMMonth YYYY') USING ERRCODE = '23PAY';
        END IF;

        IF v_side = 'new' THEN
            SELECT name, is_internal, segment_key, cost_model INTO v_name, v_internal, v_segment, v_model
              FROM departments WHERE id = v_dept;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'That department no longer exists — refresh the page' USING ERRCODE = '23PAY';
            END IF;
            IF v_internal THEN
                RAISE EXCEPTION '% does not take moved payroll — HOUZS Venture''s own share reaches it by the bill-back',
                    v_name USING ERRCODE = '23PAY';
            END IF;
            IF v_segment IS NULL THEN
                RAISE EXCEPTION '% has no pool of its own — moved payroll goes to a department with one',
                    v_name USING ERRCODE = '23PAY';
            END IF;
            IF v_model = 'centralized' THEN
                RAISE EXCEPTION '% is centralized — what moves into it is its own cost, billed by its own invoices',
                    v_name USING ERRCODE = '23PAY';
            END IF;
        END IF;
    END LOOP;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_hr_pool_allocation_guard ON public.hr_pool_allocation;
CREATE TRIGGER trg_hr_pool_allocation_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.hr_pool_allocation
    FOR EACH ROW EXECUTE FUNCTION public.guard_pool_allocation();

COMMENT ON TABLE public.hr_pool_allocation IS
    'A receiving cost-center department''s Bill to % for a month (2026-11-03): what of the payroll moved into it (hr_staff_dept_moves) each company is billed, merged into its lines on the month''s payroll invoices. What it does not bill stays its own cost. Never for a centralized, internal or pool-less department (guard_pool_allocation).';


-- ─── 3. Each department's inter-billing account ─────────────────────────────
-- The paying side of an internal invoice is Dr "Inter-billing - <department>" (billing/actions.ts finds it by name);
-- 9051–9056 and Revenue Department's 9001 exist, IT has none. Opened under 9050 at the lowest free code of 9057–9079:
-- 9080–9099 are other expenses on production (Staff Salary & Contribution … Printing & Stationery, read 2026-11-03), so
-- the range's highest code is no guide. It exists when the readers would find it ("Inter-billing % <name>", whatever the
-- dash); with the block full it opens none and says so, never refusing the department it was called for.

CREATE OR REPLACE FUNCTION public.ensure_inter_billing_account(p_department UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_name TEXT;
    v_code TEXT;
BEGIN
    SELECT name INTO v_name FROM departments
     WHERE id = p_department AND segment_key IS NOT NULL AND NOT is_internal;
    IF NOT FOUND OR EXISTS (SELECT 1 FROM chart_of_accounts WHERE name ILIKE 'Inter-billing % ' || v_name) THEN
        RETURN;
    END IF;
    SELECT c::text INTO v_code
      FROM generate_series(9057, 9079) c
     WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts a WHERE a.code = c::text)
     ORDER BY c
     LIMIT 1;
    IF v_code IS NULL THEN
        RAISE NOTICE 'The inter-billing codes 9057–9079 are all taken — open "Inter-billing - %" by hand', v_name;
        RETURN;
    END IF;
    INSERT INTO chart_of_accounts (code, name, type, parent_code, is_active, sort_order, cash_flow_category)
    VALUES (v_code, 'Inter-billing - ' || v_name, 'expense', '9050', true, 100, 'operating');
END;
$fn$;
REVOKE ALL ON FUNCTION public.ensure_inter_billing_account(UUID) FROM PUBLIC, anon, authenticated;

-- A department given a segment from now on (provision_full_department) gets its account with it.
CREATE OR REPLACE FUNCTION public.departments_open_inter_billing_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    IF NEW.segment_key IS NOT NULL AND NOT NEW.is_internal THEN
        PERFORM public.ensure_inter_billing_account(NEW.id);
    END IF;
    RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.departments_open_inter_billing_account() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_departments_open_inter_billing_account ON public.departments;
CREATE TRIGGER trg_departments_open_inter_billing_account
    AFTER INSERT OR UPDATE OF segment_key ON public.departments
    FOR EACH ROW EXECUTE FUNCTION public.departments_open_inter_billing_account();

-- The departments with a pool today (IT's is the one missing on 2026-11-03).
SELECT public.ensure_inter_billing_account(id) FROM public.departments
 WHERE segment_key IS NOT NULL AND NOT is_internal ORDER BY name;


-- ─── 4. Billing: the sender less what moved; cost-center receivers billing on ─
-- What each person on the month's Finance-sent payroll moved to another department, in the five invoice items, the
-- way the billing functions split a cost: a % of every item (a fixed RM as its share of the cost), the salary taking
-- the rounding. A move into the department a person now sits in is no move. The sender is the person's roster
-- department, as the billing functions read it. Pay that falls after the lines were saved (unpaid leave) can leave
-- the companies' % and the lines more than the cost: the lines then give way in proportion, so together they move at
-- most what the companies leave — never more than the payroll.
CREATE OR REPLACE FUNCTION public.payroll_moved_parts(p_period_month DATE)
RETURNS TABLE(staff_id UUID, from_department_id UUID, from_department_name TEXT, to_department_id UUID,
              to_department_name TEXT, to_cost_model TEXT, amount NUMERIC, salary_amount NUMERIC,
              allowance_amount NUMERIC, epf_amount NUMERIC, socso_amount NUMERIC, eis_amount NUMERIC)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    WITH staff_rows AS (
        SELECT
            hsc.department_id AS dept_id,
            d.name            AS dept_name,
            hmp.staff_id      AS sid,
            (hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er) AS total_cost,
            -- get_staff_billing_allocation's salary rule (20261005100000).
            GREATEST(
                LEAST(
                    CASE WHEN hmp.source = 'imported' THEN hmp.basic_salary
                         ELSE hmp.basic_salary
                            * CASE WHEN COALESCE(hmp.prorata_days_in_month, 0) = 0 THEN 0
                                   ELSE hmp.prorata_days_worked::NUMERIC
                                        / hmp.prorata_days_in_month::NUMERIC END
                    END
                    - COALESCE(hmp.deduction_amount, 0),
                    hmp.gross
                ),
                0
            ) AS salary_comp,
            hmp.gross    AS gross_amt,
            hmp.epf_er   AS epf_er,
            hmp.socso_er AS socso_er,
            hmp.eis_er   AS eis_er
        FROM hr_monthly_payroll hmp
        JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
        JOIN departments d      ON d.id = hsc.department_id
        WHERE hmp.period_month = p_period_month
          AND hmp.status IN ('submitted', 'paid')
    ),
    raw_moves AS (
        SELECT sr.*, m.department_id AS to_id, td.name AS to_name, td.cost_model AS to_model,
               CASE WHEN m.pct IS NOT NULL THEN sr.total_cost * m.pct
                    ELSE LEAST(m.amount, sr.total_cost) END AS raw_amt
        FROM staff_rows sr
        JOIN hr_staff_dept_moves m ON m.staff_id = sr.sid AND m.period_month = p_period_month
        JOIN departments td ON td.id = m.department_id
        WHERE sr.total_cost > 0
          AND m.department_id <> sr.dept_id
    ),
    -- What the companies' % leave of each person's cost, and the factor their lines give way by.
    room AS (
        SELECT rm.sid,
               CASE WHEN SUM(rm.raw_amt) > GREATEST(MIN(rm.total_cost) - MIN(rm.total_cost) * COALESCE(MIN(co.pct), 0), 0)
                    THEN GREATEST(MIN(rm.total_cost) - MIN(rm.total_cost) * COALESCE(MIN(co.pct), 0), 0) / SUM(rm.raw_amt)
                    ELSE 1 END AS k
        FROM raw_moves rm
        LEFT JOIN (SELECT a.staff_id, SUM(a.allocation_pct) AS pct FROM hr_staff_allocation a
                    WHERE a.period_month = p_period_month AND a.allocation_pct > 0 GROUP BY a.staff_id) co ON co.staff_id = rm.sid
        GROUP BY rm.sid
    ),
    moves AS (
        SELECT rm.*, ROUND(rm.raw_amt * r.k, 2) AS m_amt, rm.raw_amt * r.k / rm.total_cost AS f
        FROM raw_moves rm
        JOIN room r ON r.sid = rm.sid
    ),
    parts AS (
        SELECT mv.*,
               ROUND((mv.gross_amt - mv.salary_comp) * mv.f, 2) AS al,
               ROUND(mv.epf_er * mv.f, 2)   AS ep,
               ROUND(mv.socso_er * mv.f, 2) AS so,
               ROUND(mv.eis_er * mv.f, 2)   AS ei
        FROM moves mv
    )
    SELECT p.sid, p.dept_id, p.dept_name::TEXT, p.to_id, p.to_name::TEXT, p.to_model::TEXT, p.m_amt,
           p.m_amt - p.al - p.ep - p.so - p.ei, p.al, p.ep, p.so, p.ei
      FROM parts p;
$fn$;
REVOKE ALL ON FUNCTION public.payroll_moved_parts(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_moved_parts(DATE) TO service_role;

-- Production's bodies, as this file was written against them (read off pg_proc on 2026-11-03: 20261005100000's with
-- 20261009040000's guard swapped in). The file refuses if either changed since — unless it is this file's own.
DO $guard$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.get_staff_billing_allocation(date)'::regprocedure))
       <> 'b3c79672245014edbee7021c4a8bc82d'
     AND position('payroll_moved_parts' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.get_staff_billing_allocation(date)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'get_staff_billing_allocation changed on production since this file was written';
  END IF;
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.get_staff_own_share_allocation(date)'::regprocedure))
       <> '63e60f8a19d1c05687c6bf5e3dcf1c95'
     AND position('payroll_moved_parts' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.get_staff_own_share_allocation(date)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'get_staff_own_share_allocation changed on production since this file was written';
  END IF;
END
$guard$;

-- The billing allocation (production's body, its guard as live): the sender's companies stay a % of the whole cost;
-- its HOUZS Venture row is the cost less the companies AND what it moved. Each cost-center receiver bills what moved
-- into it by its Bill to % (hr_pool_allocation), merged into its department × company rows; what moved in never feeds
-- its HV row, and a centralized receiver's Bill to % is ignored (it bears what it receives).
CREATE OR REPLACE FUNCTION public.get_staff_billing_allocation(p_period_month date)
 RETURNS TABLE(department_id uuid, department_name text, company_id uuid, company_name text, company_short_code text, staff_count integer, amount numeric, salary_amount numeric, allowance_amount numeric, epf_amount numeric, socso_amount numeric, eis_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
BEGIN
    v_role := current_user_role();
    IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.view', 'hr_costing.view']) THEN RAISE EXCEPTION 'get_staff_billing_allocation: needs Billing or HR Costing · View' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH staff_rows AS (
        SELECT
            hsc.department_id  AS dept_id,
            d.name             AS dept_name,
            hmp.staff_id       AS sid,
            (hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er) AS total_cost,
            -- The basic-pay part of gross. An InfoTech-imported row carries the
            -- file's basic, already prorated by InfoTech for a mid-month joiner
            -- or leaver, beside a gross kept verbatim from the file — so it is
            -- taken as is. A row the compute trigger built holds the monthly
            -- rate, and its gross was prorated from it, so the ratio applies.
            GREATEST(
                LEAST(
                    CASE WHEN hmp.source = 'imported' THEN hmp.basic_salary
                         ELSE hmp.basic_salary
                            * CASE WHEN COALESCE(hmp.prorata_days_in_month, 0) = 0 THEN 0
                                   ELSE hmp.prorata_days_worked::NUMERIC
                                        / hmp.prorata_days_in_month::NUMERIC END
                    END
                    - COALESCE(hmp.deduction_amount, 0),
                    hmp.gross
                ),
                0
            ) AS salary_comp,
            hmp.gross    AS gross_amt,
            hmp.epf_er   AS epf_er,
            hmp.socso_er AS socso_er,
            hmp.eis_er   AS eis_er
        FROM hr_monthly_payroll hmp
        JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
        JOIN departments d      ON d.id = hsc.department_id
        WHERE hmp.period_month = p_period_month
          AND hmp.status IN ('submitted', 'paid')
    ),
    company_agg AS (
        SELECT
            sr.dept_id,
            sr.dept_name,
            hsa.company_id AS comp_id,
            c.name         AS comp_name,
            c.short_code   AS comp_code,
            COUNT(DISTINCT sr.sid)::INT AS n_staff,
            ROUND(SUM(sr.total_cost * hsa.allocation_pct), 2) AS amt,
            ROUND(SUM((sr.gross_amt - sr.salary_comp) * hsa.allocation_pct), 2) AS allowance_amt,
            ROUND(SUM(sr.epf_er * hsa.allocation_pct), 2) AS epf_amt,
            ROUND(SUM(sr.socso_er * hsa.allocation_pct), 2) AS socso_amt,
            ROUND(SUM(sr.eis_er * hsa.allocation_pct), 2) AS eis_amt
        FROM staff_rows sr
        JOIN hr_staff_allocation hsa ON hsa.staff_id = sr.sid
                                    AND hsa.period_month = p_period_month
                                    AND hsa.allocation_pct > 0
        JOIN companies c ON c.id = hsa.company_id
        GROUP BY sr.dept_id, sr.dept_name, hsa.company_id, c.name, c.short_code
        HAVING ROUND(SUM(sr.total_cost * hsa.allocation_pct), 2) > 0
    ),
    dept_tot AS (
        SELECT
            sr.dept_id,
            sr.dept_name,
            COUNT(DISTINCT sr.sid)::INT AS n_staff,
            ROUND(SUM(sr.total_cost), 2) AS amt,
            ROUND(SUM(sr.gross_amt - sr.salary_comp), 2) AS allowance_amt,
            ROUND(SUM(sr.epf_er), 2) AS epf_amt,
            ROUND(SUM(sr.socso_er), 2) AS socso_amt,
            ROUND(SUM(sr.eis_er), 2) AS eis_amt
        FROM staff_rows sr
        GROUP BY sr.dept_id, sr.dept_name
    ),
    moved AS (
        SELECT * FROM public.payroll_moved_parts(p_period_month)
    ),
    -- What each department's people moved out, and its companies' total, a row a department.
    moved_out AS (
        SELECT mv.from_department_id AS dept_id, SUM(mv.amount) AS amt, SUM(mv.allowance_amount) AS allowance_amt,
               SUM(mv.epf_amount) AS epf_amt, SUM(mv.socso_amount) AS socso_amt, SUM(mv.eis_amount) AS eis_amt
        FROM moved mv GROUP BY mv.from_department_id
    ),
    company_tot AS (
        SELECT ca.dept_id, SUM(ca.amt) AS amt, SUM(ca.allowance_amt) AS allowance_amt, SUM(ca.epf_amt) AS epf_amt,
               SUM(ca.socso_amt) AS socso_amt, SUM(ca.eis_amt) AS eis_amt
        FROM company_agg ca GROUP BY ca.dept_id
    ),
    hv_raw AS (
        SELECT
            dt.dept_id,
            dt.dept_name,
            dt.n_staff,
            dt.amt           - COALESCE(ct.amt, 0)           - COALESCE(mo.amt, 0)           AS amt,
            dt.allowance_amt - COALESCE(ct.allowance_amt, 0) - COALESCE(mo.allowance_amt, 0) AS allowance_amt,
            dt.epf_amt       - COALESCE(ct.epf_amt, 0)       - COALESCE(mo.epf_amt, 0)       AS epf_amt,
            dt.socso_amt     - COALESCE(ct.socso_amt, 0)     - COALESCE(mo.socso_amt, 0)     AS socso_amt,
            dt.eis_amt       - COALESCE(ct.eis_amt, 0)       - COALESCE(mo.eis_amt, 0)       AS eis_amt
        FROM dept_tot dt
        LEFT JOIN company_tot ct ON ct.dept_id = dt.dept_id
        LEFT JOIN moved_out mo   ON mo.dept_id = dt.dept_id
        WHERE (dt.amt - COALESCE(ct.amt, 0) - COALESCE(mo.amt, 0)) >= 0.05
    ),
    hv_agg AS (
        SELECT
            hr.dept_id,
            hr.dept_name,
            NULL::UUID       AS comp_id,
            'HOUZS Venture'  AS comp_name,
            'HV'             AS comp_code,
            hr.n_staff,
            hr.amt,
            hr.amt - GREATEST(hr.allowance_amt, 0) - GREATEST(hr.epf_amt, 0)
                   - GREATEST(hr.socso_amt, 0) - GREATEST(hr.eis_amt, 0) AS salary_amt,
            GREATEST(hr.allowance_amt, 0) AS allowance_amt,
            GREATEST(hr.epf_amt, 0)       AS epf_amt,
            GREATEST(hr.socso_amt, 0)     AS socso_amt,
            GREATEST(hr.eis_amt, 0)       AS eis_amt
        FROM hv_raw hr
    ),
    -- What moved into each cost-center receiver, then billed on by its Bill to %.
    moved_in AS (
        SELECT mv.to_department_id AS dept_id, mv.to_department_name AS dept_name, SUM(mv.amount) AS amt,
               SUM(mv.allowance_amount) AS allowance_amt, SUM(mv.epf_amount) AS epf_amt,
               SUM(mv.socso_amount) AS socso_amt, SUM(mv.eis_amount) AS eis_amt
        FROM moved mv
        WHERE mv.to_cost_model <> 'centralized'
        GROUP BY mv.to_department_id, mv.to_department_name
    ),
    moved_billed AS (
        SELECT mi.dept_id, mi.dept_name, pa.company_id AS comp_id, c.name AS comp_name, c.short_code AS comp_code,
               0 AS n_staff,
               ROUND(mi.amt * pa.split_pct, 2)           AS amt,
               ROUND(mi.allowance_amt * pa.split_pct, 2) AS allowance_amt,
               ROUND(mi.epf_amt * pa.split_pct, 2)       AS epf_amt,
               ROUND(mi.socso_amt * pa.split_pct, 2)     AS socso_amt,
               ROUND(mi.eis_amt * pa.split_pct, 2)       AS eis_amt
        FROM moved_in mi
        JOIN hr_pool_allocation pa ON pa.department_id = mi.dept_id
                                  AND pa.period_month = p_period_month
                                  AND pa.split_pct > 0
        JOIN companies c ON c.id = pa.company_id
        WHERE ROUND(mi.amt * pa.split_pct, 2) > 0
    ),
    -- A department's own people's rows and what it bills on, merged by company (the user: "就一起吧").
    company_rows AS (
        SELECT u.dept_id, u.dept_name, u.comp_id, u.comp_name, u.comp_code,
               SUM(u.n_staff)::INT AS n_staff, SUM(u.amt) AS amt, SUM(u.allowance_amt) AS allowance_amt,
               SUM(u.epf_amt) AS epf_amt, SUM(u.socso_amt) AS socso_amt, SUM(u.eis_amt) AS eis_amt
        FROM (
            SELECT ca.dept_id, ca.dept_name, ca.comp_id, ca.comp_name, ca.comp_code, ca.n_staff, ca.amt,
                   ca.allowance_amt, ca.epf_amt, ca.socso_amt, ca.eis_amt
            FROM company_agg ca
            UNION ALL
            SELECT mb.dept_id, mb.dept_name, mb.comp_id, mb.comp_name, mb.comp_code, mb.n_staff, mb.amt,
                   mb.allowance_amt, mb.epf_amt, mb.socso_amt, mb.eis_amt
            FROM moved_billed mb
        ) u
        GROUP BY u.dept_id, u.dept_name, u.comp_id, u.comp_name, u.comp_code
    ),
    combined AS (
        SELECT cr.dept_id, cr.dept_name, cr.comp_id, cr.comp_name, cr.comp_code,
               cr.n_staff, cr.amt,
               cr.amt - cr.allowance_amt - cr.epf_amt - cr.socso_amt - cr.eis_amt AS salary_amt,
               cr.allowance_amt, cr.epf_amt, cr.socso_amt, cr.eis_amt
        FROM company_rows cr
        UNION ALL
        SELECT hv.dept_id, hv.dept_name, hv.comp_id, hv.comp_name, hv.comp_code,
               hv.n_staff, hv.amt, hv.salary_amt, hv.allowance_amt,
               hv.epf_amt, hv.socso_amt, hv.eis_amt
        FROM hv_agg hv
        WHERE EXISTS (SELECT 1 FROM company_rows cr2 WHERE cr2.dept_id = hv.dept_id)
    )
    SELECT
        cb.dept_id,
        cb.dept_name::TEXT,
        cb.comp_id,
        cb.comp_name::TEXT,
        cb.comp_code::TEXT,
        cb.n_staff,
        cb.amt::DECIMAL,
        cb.salary_amt::DECIMAL,
        cb.allowance_amt::DECIMAL,
        cb.epf_amt::DECIMAL,
        cb.socso_amt::DECIMAL,
        cb.eis_amt::DECIMAL
    FROM combined cb
    ORDER BY cb.dept_name, (cb.comp_id IS NULL), cb.comp_code;
END;
$function$;

COMMENT ON FUNCTION public.get_staff_billing_allocation(date) IS
'Staff billing allocation per department × subsidiary with five invoice components (Salary / Allowance / EPF / SOCSO / EIS ER), plus one HV own-share row per dept (company_id NULL, code HV) = dept total − billed − moved to other departments. SUBMITTED payroll rows only; aggregate-only; Billing or HR Costing · View. Since 2026-10-05 an InfoTech-imported row''s basic is taken as paid. Since 2026-11-03 a cost-center department bills on what moved into it (hr_staff_dept_moves) by its Bill to % (hr_pool_allocation), merged into its company rows.';

-- The own share: each department's leftover less what its people moved to another department; nothing moved in.
CREATE OR REPLACE FUNCTION public.get_staff_own_share_allocation(p_period_month date)
 RETURNS TABLE(department_id uuid, department_name text, staff_count integer, amount numeric, salary_amount numeric, allowance_amount numeric, epf_amount numeric, socso_amount numeric, eis_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
BEGIN
    v_role := current_user_role();
    IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.view', 'hr_costing.view']) THEN RAISE EXCEPTION 'get_staff_own_share_allocation: needs Billing or HR Costing · View' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH staff_rows AS (
        SELECT
            hsc.department_id AS dept_id,
            d.name            AS dept_name,
            hmp.staff_id      AS sid,
            (hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er) AS total_cost,
            -- Same rule as get_staff_billing_allocation: an imported row's
            -- basic is already the month's figure; a computed row's is the
            -- monthly rate and takes the ratio.
            GREATEST(
                LEAST(
                    CASE WHEN hmp.source = 'imported' THEN hmp.basic_salary
                         ELSE hmp.basic_salary
                            * CASE WHEN COALESCE(hmp.prorata_days_in_month, 0) = 0 THEN 0
                                   ELSE hmp.prorata_days_worked::NUMERIC
                                        / hmp.prorata_days_in_month::NUMERIC END
                    END
                    - COALESCE(hmp.deduction_amount, 0),
                    hmp.gross
                ),
                0
            ) AS salary_comp,
            hmp.gross    AS gross_amt,
            hmp.epf_er   AS epf_er,
            hmp.socso_er AS socso_er,
            hmp.eis_er   AS eis_er
        FROM hr_monthly_payroll hmp
        JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
        JOIN departments d      ON d.id = hsc.department_id
        WHERE hmp.period_month = p_period_month
          AND hmp.status IN ('submitted', 'paid')
    ),
    company_agg AS (
        SELECT
            sr.dept_id,
            ROUND(SUM(sr.total_cost * hsa.allocation_pct), 2) AS amt,
            ROUND(SUM((sr.gross_amt - sr.salary_comp) * hsa.allocation_pct), 2) AS allowance_amt,
            ROUND(SUM(sr.epf_er * hsa.allocation_pct), 2) AS epf_amt,
            ROUND(SUM(sr.socso_er * hsa.allocation_pct), 2) AS socso_amt,
            ROUND(SUM(sr.eis_er * hsa.allocation_pct), 2) AS eis_amt
        FROM staff_rows sr
        JOIN hr_staff_allocation hsa ON hsa.staff_id = sr.sid
                                    AND hsa.period_month = p_period_month
                                    AND hsa.allocation_pct > 0
        GROUP BY sr.dept_id
    ),
    moved_out AS (
        SELECT mv.from_department_id AS dept_id, SUM(mv.amount) AS amt, SUM(mv.allowance_amount) AS allowance_amt,
               SUM(mv.epf_amount) AS epf_amt, SUM(mv.socso_amount) AS socso_amt, SUM(mv.eis_amount) AS eis_amt
        FROM public.payroll_moved_parts(p_period_month) mv
        GROUP BY mv.from_department_id
    ),
    dept_tot AS (
        SELECT
            sr.dept_id,
            sr.dept_name,
            COUNT(DISTINCT sr.sid)::INT AS n_staff,
            ROUND(SUM(sr.total_cost), 2) AS amt,
            ROUND(SUM(sr.gross_amt - sr.salary_comp), 2) AS allowance_amt,
            ROUND(SUM(sr.epf_er), 2) AS epf_amt,
            ROUND(SUM(sr.socso_er), 2) AS socso_amt,
            ROUND(SUM(sr.eis_er), 2) AS eis_amt
        FROM staff_rows sr
        GROUP BY sr.dept_id, sr.dept_name
    ),
    hv_raw AS (
        SELECT
            dt.dept_id,
            dt.dept_name,
            dt.n_staff,
            dt.amt           - COALESCE(ca.amt, 0)           - COALESCE(mo.amt, 0)           AS amt,
            dt.allowance_amt - COALESCE(ca.allowance_amt, 0) - COALESCE(mo.allowance_amt, 0) AS allowance_amt,
            dt.epf_amt       - COALESCE(ca.epf_amt, 0)       - COALESCE(mo.epf_amt, 0)       AS epf_amt,
            dt.socso_amt     - COALESCE(ca.socso_amt, 0)     - COALESCE(mo.socso_amt, 0)     AS socso_amt,
            dt.eis_amt       - COALESCE(ca.eis_amt, 0)       - COALESCE(mo.eis_amt, 0)       AS eis_amt
        FROM dept_tot dt
        LEFT JOIN company_agg ca ON ca.dept_id = dt.dept_id
        LEFT JOIN moved_out mo   ON mo.dept_id = dt.dept_id
        WHERE (dt.amt - COALESCE(ca.amt, 0) - COALESCE(mo.amt, 0)) >= 0.05
    )
    SELECT
        hr.dept_id,
        hr.dept_name::TEXT,
        hr.n_staff,
        hr.amt::DECIMAL,
        (hr.amt - GREATEST(hr.allowance_amt,0) - GREATEST(hr.epf_amt,0)
                - GREATEST(hr.socso_amt,0) - GREATEST(hr.eis_amt,0))::DECIMAL AS salary_amount,
        GREATEST(hr.allowance_amt,0)::DECIMAL AS allowance_amount,
        GREATEST(hr.epf_amt,0)::DECIMAL       AS epf_amount,
        GREATEST(hr.socso_amt,0)::DECIMAL     AS socso_amount,
        GREATEST(hr.eis_amt,0)::DECIMAL       AS eis_amount
    FROM hv_raw hr
    ORDER BY hr.dept_name;
END;
$function$;

COMMENT ON FUNCTION public.get_staff_own_share_allocation(date) IS
'HV own share of each department''s staff cost (dept total − subsidiary allocations − what its people moved to other departments) in the five invoice components, for the HV own-share payroll invoice. Same salary rule as get_staff_billing_allocation. Since 2026-11-03 what moved to another department (hr_staff_dept_moves) is billed to that department instead.';


-- ─── 5. What moved, for the internal invoices and the preview ───────────────

-- Per sending × receiving department, in the five items: the internal invoices' lines.
CREATE OR REPLACE FUNCTION public.get_staff_dept_moves_allocation(p_period_month DATE)
RETURNS TABLE(from_department_id UUID, from_department_name TEXT, to_department_id UUID, to_department_name TEXT,
              staff_count INTEGER, amount NUMERIC, salary_amount NUMERIC, allowance_amount NUMERIC,
              epf_amount NUMERIC, socso_amount NUMERIC, eis_amount NUMERIC)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.view', 'hr_costing.view']) THEN
        RAISE EXCEPTION 'get_staff_dept_moves_allocation: needs Billing or HR Costing · View' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT mv.from_department_id, mv.from_department_name, mv.to_department_id, mv.to_department_name,
           COUNT(DISTINCT mv.staff_id)::INT, SUM(mv.amount), SUM(mv.salary_amount), SUM(mv.allowance_amount),
           SUM(mv.epf_amount), SUM(mv.socso_amount), SUM(mv.eis_amount)
      FROM public.payroll_moved_parts(p_period_month) mv
     GROUP BY mv.from_department_id, mv.from_department_name, mv.to_department_id, mv.to_department_name
     ORDER BY mv.to_department_name, mv.from_department_name;
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_staff_dept_moves_allocation(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_dept_moves_allocation(DATE) TO authenticated, service_role;

-- Per receiver: what moved in, what its Bill to % bills to the companies (nought for a centralized one), what stays.
CREATE OR REPLACE FUNCTION public.get_payroll_moves_summary(p_period_month DATE)
RETURNS TABLE(department_id UUID, department_name TEXT, cost_model TEXT, moved_in NUMERIC, billed NUMERIC, stays NUMERIC)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.view', 'hr_costing.view']) THEN
        RAISE EXCEPTION 'get_payroll_moves_summary: needs Billing or HR Costing · View' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    WITH moved_in AS (
        SELECT mv.to_department_id AS dept_id, mv.to_department_name AS dept_name, mv.to_cost_model AS model,
               SUM(mv.amount) AS amt
          FROM public.payroll_moved_parts(p_period_month) mv
         GROUP BY mv.to_department_id, mv.to_department_name, mv.to_cost_model
    ),
    billed AS (
        SELECT mi.dept_id, SUM(ROUND(mi.amt * pa.split_pct, 2)) AS amt
          FROM moved_in mi
          JOIN hr_pool_allocation pa ON pa.department_id = mi.dept_id
                                    AND pa.period_month = p_period_month
                                    AND pa.split_pct > 0
         WHERE mi.model <> 'centralized'
         GROUP BY mi.dept_id
    )
    SELECT mi.dept_id, mi.dept_name, mi.model, mi.amt, COALESCE(b.amt, 0), mi.amt - COALESCE(b.amt, 0)
      FROM moved_in mi
      LEFT JOIN billed b ON b.dept_id = mi.dept_id
     ORDER BY mi.dept_name;
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_payroll_moves_summary(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payroll_moves_summary(DATE) TO authenticated, service_role;
