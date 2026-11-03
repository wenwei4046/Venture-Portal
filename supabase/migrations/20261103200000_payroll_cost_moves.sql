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
               s.employee_name, s.department_id, d.name
          INTO v_status, v_revenue, v_name, v_dept_id, v_dept
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
-- 9051–9056 and Revenue Department's 9001 exist, IT has none. Opened under 9050 at the next free code of 9051–9099.

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
    IF NOT FOUND OR EXISTS (SELECT 1 FROM chart_of_accounts WHERE name = 'Inter-billing - ' || v_name) THEN
        RETURN;
    END IF;
    SELECT (coalesce(max(code::int), 9050) + 1)::text INTO v_code
      FROM chart_of_accounts
     WHERE code ~ '^[0-9]+$' AND code::int BETWEEN 9051 AND 9099;
    IF v_code::int > 9099 THEN
        RAISE EXCEPTION 'The inter-billing accounts 9051–9099 are all taken — open "Inter-billing - %" by hand', v_name;
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
