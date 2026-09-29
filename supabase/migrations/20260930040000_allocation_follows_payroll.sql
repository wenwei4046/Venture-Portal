-- ════════════════════════════════════════════════════════════════════════════
-- A person's billing split follows their payroll row (2026-09-30)
--
-- User 2026-09-30, on HR › Payroll and its Billing Allocation: once somebody's
-- payroll is Completed, their billing allocation must not be editable any more
-- ("QBO 这边 … set 好 billing allocation 是多少 percent，payroll 那边一 complete，
-- 这边就不能再 edit") — and the two did not look linked. They were not:
-- hr_staff_allocation had no trigger and no key to the payroll row, and the
-- page's only check was the accounting-period lock. Same message: "the 56 staff
-- here and the payroll's name list should be the same — delete a row there, it
-- goes here too; add one there, it comes here too."
--
-- ONE LOCK. The split is part of the person's month, so it takes the payroll
-- row's own lifecycle (guard_payroll_row_lifecycle): it changes only while the
-- row is a DRAFT. Completed (on HR › Payroll, or closed on Comm Cal), submitted
-- and paid rows keep the split they left with. The ways back are the payroll's
-- own: Unlock somebody Completed, reopen a salesperson on Comm Cal, Resubmit or
-- Second payroll somebody already with Finance (the row is a draft again while
-- that is open). A month Closed for good takes nothing.
--
-- ONE LIST. The page has always listed the month's payroll rows, so the names
-- always matched — but the split rows were tied to nothing: removing somebody
-- from the month left their split behind (it came back if they were added
-- again), and Copy from last month copied splits for people no longer on the
-- payroll. A key now ties every split row to its payroll row: no payroll row,
-- no split; the payroll row removed (only a draft can be), its split goes too.
--
-- Nothing billed moves: the billing RPCs already read splits only through the
-- payroll row (get_staff_billing_allocation / get_staff_own_share_allocation
-- join hr_monthly_payroll), and there were no split rows without one on
-- 2026-09-30.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_hr_staff_allocation_follows_payroll ON public.hr_staff_allocation;
--   DROP FUNCTION IF EXISTS public.guard_staff_allocation_follows_payroll();
--   ALTER TABLE public.hr_staff_allocation DROP CONSTRAINT IF EXISTS hr_staff_allocation_payroll_row_fkey;
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 1. Split rows with no payroll row ──────────────────────────────────────
-- None on 2026-09-30. Any made since are invisible (the page lists payroll
-- rows) and never billed (the billing RPCs join the payroll row), so they go
-- before the key — which would otherwise refuse to be added.

DO $orphans$
DECLARE
    v_n INTEGER;
BEGIN
    DELETE FROM public.hr_staff_allocation a
     WHERE NOT EXISTS (SELECT 1 FROM public.hr_monthly_payroll p
                        WHERE p.staff_id = a.staff_id AND p.period_month = a.period_month);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN
        RAISE NOTICE 'Removed % billing split row(s) that had no payroll row', v_n;
    END IF;
END
$orphans$;


-- ─── 2. ONE LIST: every split row belongs to a payroll row ──────────────────
-- (staff_id, period_month) is unique on hr_monthly_payroll
-- (uq_monthly_payroll_staff_period); idx_hr_staff_alloc_staff covers this side.

ALTER TABLE public.hr_staff_allocation
    DROP CONSTRAINT IF EXISTS hr_staff_allocation_payroll_row_fkey;
ALTER TABLE public.hr_staff_allocation
    ADD CONSTRAINT hr_staff_allocation_payroll_row_fkey
    FOREIGN KEY (staff_id, period_month)
    REFERENCES public.hr_monthly_payroll (staff_id, period_month)
    ON UPDATE CASCADE
    ON DELETE CASCADE;


-- ─── 3. ONE LOCK: the split changes only while the payroll row is a draft ───

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
               s.employee_name
          INTO v_status, v_revenue, v_name
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
    END LOOP;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$fn$;

COMMENT ON FUNCTION public.guard_staff_allocation_follows_payroll() IS
    'A billing split (hr_staff_allocation) changes only while its payroll row is a draft, never in a month Closed for good (2026-09-30). The payroll''s own lifecycle functions pass (app.payroll_lifecycle).';

DROP TRIGGER IF EXISTS trg_hr_staff_allocation_follows_payroll ON public.hr_staff_allocation;
CREATE TRIGGER trg_hr_staff_allocation_follows_payroll
    BEFORE INSERT OR UPDATE OR DELETE ON public.hr_staff_allocation
    FOR EACH ROW EXECUTE FUNCTION public.guard_staff_allocation_follows_payroll();

COMMENT ON TABLE public.hr_staff_allocation IS
    'Per-staff per-month split of the employer cost (gross + EPF/SOCSO/EIS ER) across subsidiaries, as 0–1 fractions; the unallocated remainder is HV''s own share, never billed. Every row belongs to the month''s payroll row (hr_staff_allocation_payroll_row_fkey — removed with it) and changes only while that row is a draft (trg_hr_staff_allocation_follows_payroll, 2026-09-30). Billing reads it through the payroll row (get_staff_billing_allocation).';
