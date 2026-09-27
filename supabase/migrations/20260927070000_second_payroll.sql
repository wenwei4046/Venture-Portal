-- ════════════════════════════════════════════════════════════════════════════
-- Second payroll beside Resubmit (2026-09-27, the unified Payroll)
--
-- The user, on HR › Payroll's right-click menu: "我可以按 resubmit 或者是
-- second payroll。因为有些人由于 sub-department 的关系，有些 payout 是在 5 号，
-- 有些是在 15 号。我不要把这边的记录搞乱 … 以后要 track 的话，就容易 track 回：
-- 哪一些是写错要 resubmit，哪一些是属于 second payroll。"
--
-- Both open the same top-up — the row unlocks, amounts may only go up, and the
-- next batch sends only the difference. What differs is WHY, and that is
-- recorded so it can be traced later:
--
--   resubmit        a correction: something sent was wrong
--   second_payroll  a planned second payment: e.g. a sub-department that pays
--                   on the 15th after the first payment on the 5th
--
-- Where the kind lives:
--   hr_monthly_payroll.topup_kind / director_monthly_payroll.topup_kind —
--     set by payroll_open_topup(p_scope, p_row_id, p_kind), kept consistent
--     with topup_opened_at by trigger (no open top-up → no kind), so every
--     path that closes a top-up (submit, put back as sent, an unchanged
--     Complete or close) clears it without knowing about it.
--   payroll_batch_lines.topup_kind — copied from the row as the batch left
--     (the line's own snapshot), NULL on a line that is not a top-up.
--   payroll_batches.second_payrolls — how many of the batch's `topups` were
--     second payrolls (the rest were resubmits). On the batch because Finance
--     reads batches and never lines.
-- A batch sent back puts each top-up person back with the kind they left with.
--
-- payroll_open_topup keeps its two-argument call working (p_kind defaults to
-- 'resubmit'), so the pages deployed before this one still open a Resubmit.
--
-- Rollback:
--   DROP TRIGGER trg_hr_monthly_payroll_001_topup_kind ON hr_monthly_payroll;
--   DROP TRIGGER trg_director_monthly_payroll_001_topup_kind ON director_monthly_payroll;
--   DROP TRIGGER trg_payroll_batch_lines_topup_kind ON payroll_batch_lines;
--   DROP TRIGGER trg_payroll_batch_lines_count_second ON payroll_batch_lines;
--   DROP FUNCTION payroll_row_topup_kind(), payroll_batch_line_topup_kind(),
--     payroll_batch_count_second_payrolls(), payroll_open_topup(TEXT, UUID, TEXT);
--   restore payroll_open_topup(TEXT, UUID), payroll_send_back_batch,
--     payroll_month_status and comm_close_sync_payroll from
--     20260927061000_unified_payroll.sql;
--   ALTER TABLE ... DROP COLUMN topup_kind (three tables), payroll_batches
--     DROP COLUMN second_payrolls.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. The kind on a person's row ──────────────────────────────────────────

ALTER TABLE public.hr_monthly_payroll       ADD COLUMN IF NOT EXISTS topup_kind TEXT;
ALTER TABLE public.director_monthly_payroll ADD COLUMN IF NOT EXISTS topup_kind TEXT;

COMMENT ON COLUMN public.hr_monthly_payroll.topup_kind IS
  'Why an open top-up was opened (2026-09-27): resubmit = a correction, second_payroll = a planned second payment. NULL whenever topup_opened_at is NULL (trigger).';
COMMENT ON COLUMN public.director_monthly_payroll.topup_kind IS
  'Why an open top-up was opened (2026-09-27): resubmit = a correction, second_payroll = a planned second payment. NULL whenever topup_opened_at is NULL (trigger).';

-- An open top-up always has a kind, and only an open top-up has one. Every
-- path that clears topup_opened_at (submit, put back as sent, an unchanged
-- Complete, a Comm Cal close that changed nothing) clears the kind with it.
-- Runs right after the lifecycle guard (000), before the payroll triggers.
CREATE OR REPLACE FUNCTION public.payroll_row_topup_kind()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
    IF NEW.topup_opened_at IS NULL THEN
        NEW.topup_kind := NULL;
    ELSIF NEW.topup_kind IS NULL THEN
        NEW.topup_kind := 'resubmit';
    END IF;
    RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.payroll_row_topup_kind() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_hr_monthly_payroll_001_topup_kind ON public.hr_monthly_payroll;
CREATE TRIGGER trg_hr_monthly_payroll_001_topup_kind
    BEFORE INSERT OR UPDATE ON public.hr_monthly_payroll
    FOR EACH ROW EXECUTE FUNCTION public.payroll_row_topup_kind();

DROP TRIGGER IF EXISTS trg_director_monthly_payroll_001_topup_kind ON public.director_monthly_payroll;
CREATE TRIGGER trg_director_monthly_payroll_001_topup_kind
    BEFORE INSERT OR UPDATE ON public.director_monthly_payroll
    FOR EACH ROW EXECUTE FUNCTION public.payroll_row_topup_kind();

-- Any top-up open when this lands was a Resubmit (the only kind there was).
SELECT set_config('app.payroll_lifecycle', 'second_payroll_migration', true);
UPDATE public.hr_monthly_payroll SET topup_kind = 'resubmit'
 WHERE topup_opened_at IS NOT NULL AND topup_kind IS NULL;
UPDATE public.director_monthly_payroll SET topup_kind = 'resubmit'
 WHERE topup_opened_at IS NOT NULL AND topup_kind IS NULL;
SELECT set_config('app.payroll_lifecycle', '', true);

ALTER TABLE public.hr_monthly_payroll
    ADD CONSTRAINT hr_monthly_payroll_topup_kind_known
        CHECK (topup_kind IS NULL OR topup_kind IN ('resubmit', 'second_payroll')),
    ADD CONSTRAINT hr_monthly_payroll_topup_kind_open
        CHECK ((topup_kind IS NULL) = (topup_opened_at IS NULL));
ALTER TABLE public.director_monthly_payroll
    ADD CONSTRAINT director_monthly_payroll_topup_kind_known
        CHECK (topup_kind IS NULL OR topup_kind IN ('resubmit', 'second_payroll')),
    ADD CONSTRAINT director_monthly_payroll_topup_kind_open
        CHECK ((topup_kind IS NULL) = (topup_opened_at IS NULL));

-- ─── 2. The kind on what a batch sent ───────────────────────────────────────

ALTER TABLE public.payroll_batch_lines ADD COLUMN IF NOT EXISTS topup_kind TEXT;
ALTER TABLE public.payroll_batches ADD COLUMN IF NOT EXISTS second_payrolls INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.payroll_batch_lines.topup_kind IS
  'For a top-up line (is_topup): resubmit or second_payroll, as the row left with it. NULL on a first payment.';
COMMENT ON COLUMN public.payroll_batches.second_payrolls IS
  'How many of this batch''s topups were second payrolls; the rest (topups - second_payrolls) were resubmits. Counted by trigger as the lines are written.';

-- The line takes the kind from the row as it stood when the batch left
-- (payroll_submit_batch writes the lines from a snapshot taken before it
-- closes the rows' top-ups).
CREATE OR REPLACE FUNCTION public.payroll_batch_line_topup_kind()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
    IF NEW.is_topup THEN
        NEW.topup_kind := coalesce(NEW.topup_kind, NEW.snapshot->>'topup_kind', 'resubmit');
    ELSE
        NEW.topup_kind := NULL;
    END IF;
    RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.payroll_batch_line_topup_kind() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_payroll_batch_lines_topup_kind ON public.payroll_batch_lines;
CREATE TRIGGER trg_payroll_batch_lines_topup_kind
    BEFORE INSERT ON public.payroll_batch_lines
    FOR EACH ROW EXECUTE FUNCTION public.payroll_batch_line_topup_kind();

CREATE OR REPLACE FUNCTION public.payroll_batch_count_second_payrolls()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    IF NEW.topup_kind = 'second_payroll' THEN
        UPDATE payroll_batches SET second_payrolls = second_payrolls + 1 WHERE id = NEW.batch_id;
    END IF;
    RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.payroll_batch_count_second_payrolls() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_payroll_batch_lines_count_second ON public.payroll_batch_lines;
CREATE TRIGGER trg_payroll_batch_lines_count_second
    AFTER INSERT ON public.payroll_batch_lines
    FOR EACH ROW EXECUTE FUNCTION public.payroll_batch_count_second_payrolls();

-- Every top-up line written before this was a Resubmit.
UPDATE public.payroll_batch_lines SET topup_kind = 'resubmit' WHERE is_topup AND topup_kind IS NULL;

ALTER TABLE public.payroll_batch_lines
    ADD CONSTRAINT payroll_batch_lines_topup_kind_known
        CHECK (topup_kind IS NULL OR topup_kind IN ('resubmit', 'second_payroll')),
    ADD CONSTRAINT payroll_batch_lines_topup_kind_topup
        CHECK ((topup_kind IS NOT NULL) = is_topup);
ALTER TABLE public.payroll_batches
    ADD CONSTRAINT payroll_batches_second_payrolls_counted CHECK (second_payrolls >= 0);

-- ─── 3. Opening a top-up says which kind ────────────────────────────────────
-- As live, plus p_kind (default 'resubmit', so a two-argument call from a page
-- deployed before this still opens a Resubmit), stored on the row and logged.

DROP FUNCTION IF EXISTS public.payroll_open_topup(TEXT, UUID);
CREATE OR REPLACE FUNCTION public.payroll_open_topup(p_scope TEXT, p_row_id UUID, p_kind TEXT DEFAULT 'resubmit')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_period DATE;
    v_status TEXT;
    v_name   TEXT;
    v_kind   TEXT := coalesce(nullif(btrim(p_kind), ''), 'resubmit');
BEGIN
    IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing'), false) THEN
        RAISE EXCEPTION 'Only HR or the Principal may resubmit payroll' USING ERRCODE = '42501';
    END IF;
    IF v_kind NOT IN ('resubmit', 'second_payroll') THEN
        RAISE EXCEPTION 'A top-up is a resubmit or a second payroll';
    END IF;
    IF p_scope = 'staff' THEN
        SELECT mp.period_month, mp.status::TEXT, s.employee_name INTO v_period, v_status, v_name
          FROM hr_monthly_payroll mp JOIN hr_staff_costs s ON s.id = mp.staff_id WHERE mp.id = p_row_id;
    ELSIF p_scope = 'directors' THEN
        SELECT period_month, status, employee_name INTO v_period, v_status, v_name
          FROM director_monthly_payroll WHERE id = p_row_id;
    ELSE
        RAISE EXCEPTION 'Resubmit staff or directors';
    END IF;
    IF v_period IS NULL THEN
        RAISE EXCEPTION 'That payroll row no longer exists — refresh the page';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || v_period::TEXT));
    IF payroll_month_closed(v_period) THEN
        RAISE EXCEPTION 'Payroll for % is closed for good — nobody can be resubmitted or paid a second payroll',
            to_char(v_period, 'FMMonth YYYY') USING ERRCODE = '23PAY';
    END IF;
    IF is_period_locked(v_period) THEN
        RAISE EXCEPTION 'The accounting period % is locked', to_char(v_period, 'FMMonth YYYY');
    END IF;
    IF v_status NOT IN ('submitted', 'paid') THEN
        RAISE EXCEPTION '% is %, not submitted — there is nothing to % yet', v_name, v_status,
            CASE WHEN v_kind = 'second_payroll' THEN 'add a second payroll to' ELSE 'resubmit' END
            USING ERRCODE = '23PAY';
    END IF;
    IF (payroll_row_submitted_money(p_scope, p_row_id)->>'lines')::INT = 0 THEN
        RAISE EXCEPTION '%''s % pay went to Finance before batches existed and cannot be % here',
            v_name, to_char(v_period, 'FMMonth YYYY'),
            CASE WHEN v_kind = 'second_payroll' THEN 'given a second payroll' ELSE 'resubmitted' END
            USING ERRCODE = '23PAY';
    END IF;

    PERFORM set_config('app.payroll_lifecycle', 'topup', true);
    IF p_scope = 'staff' THEN
        UPDATE hr_monthly_payroll
           SET status = 'draft', completed_at = NULL, completed_by = NULL,
               topup_opened_at = now(), topup_opened_by = auth.uid(), topup_kind = v_kind
         WHERE id = p_row_id;
    ELSE
        UPDATE director_monthly_payroll
           SET status = 'draft', completed_at = NULL, completed_by = NULL,
               topup_opened_at = now(), topup_opened_by = auth.uid(), topup_kind = v_kind
         WHERE id = p_row_id;
    END IF;
    PERFORM set_config('app.payroll_lifecycle', '', true);

    INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
    VALUES (auth.uid(), 'payroll_row', p_row_id::TEXT, 'open_topup',
            jsonb_build_object('scope', p_scope, 'period', v_period, 'name', v_name, 'was', v_status,
                               'kind', v_kind));
END;
$fn$;
REVOKE ALL ON FUNCTION public.payroll_open_topup(TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_open_topup(TEXT, UUID, TEXT) TO authenticated;

-- ─── 4. A batch sent back returns its top-ups with their kind ───────────────
-- As live; the loop now reads each line's topup_kind and puts it back on the
-- row with topup_opened_at.

CREATE OR REPLACE FUNCTION public.payroll_send_back_batch(p_batch_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_batch    payroll_batches%ROWTYPE;
    v_blocking TEXT;
    v_reversed INTEGER;
    v_line     RECORD;
    v_standing INTEGER;
BEGIN
    IF auth.uid() IS NULL OR NOT coalesce(has_perm('treasury'), false) THEN
        RAISE EXCEPTION 'Only Finance or the Principal may send a payroll batch back to HR' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_batch FROM payroll_batches WHERE id = p_batch_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'That payroll batch no longer exists — refresh the page';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || v_batch.period_month::TEXT));
    SELECT * INTO v_batch FROM payroll_batches WHERE id = p_batch_id FOR UPDATE;
    IF v_batch.status <> 'submitted' THEN
        RAISE EXCEPTION 'Batch #% of % was already sent back', v_batch.batch_no, to_char(v_batch.period_month, 'Mon YYYY');
    END IF;
    IF payroll_month_closed(v_batch.period_month) THEN
        RAISE EXCEPTION 'Payroll for % is closed for good', to_char(v_batch.period_month, 'FMMonth YYYY') USING ERRCODE = '23PAY';
    END IF;

    SELECT string_agg(status::TEXT, ', ') INTO v_blocking FROM payroll_payment_requests
     WHERE batch_id = p_batch_id AND status IN ('pv_generated', 'completed');
    IF v_blocking IS NOT NULL THEN
        RAISE EXCEPTION 'Finance has already raised a funding PV for batch #% — void it first; if it completed, the money has moved',
            v_batch.batch_no;
    END IF;

    -- Every person in it must be where the batch left them, with nothing newer.
    SELECT l.employee_name INTO v_blocking
      FROM payroll_batch_lines l
     WHERE l.batch_id = p_batch_id
       AND (EXISTS (SELECT 1 FROM payroll_batch_lines l2 JOIN payroll_batches b2 ON b2.id = l2.batch_id
                     WHERE b2.status = 'submitted' AND b2.batch_no > v_batch.batch_no
                       AND b2.period_month = v_batch.period_month
                       AND l2.scope = l.scope AND l2.row_id = l.row_id)
            OR (l.scope = 'staff' AND NOT EXISTS (SELECT 1 FROM hr_monthly_payroll mp WHERE mp.id = l.row_id AND mp.status = 'submitted'))
            OR (l.scope = 'directors' AND NOT EXISTS (SELECT 1 FROM director_monthly_payroll d WHERE d.id = l.row_id AND d.status = 'submitted')))
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION '% has moved on since batch #% (resubmitted or paid) — this batch can no longer be sent back',
            v_blocking, v_batch.batch_no;
    END IF;

    UPDATE payroll_payment_requests
       SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
           cancellation_reason = coalesce('Sent back by Finance: ' || nullif(btrim(p_reason), ''), 'Sent back by Finance')
     WHERE batch_id = p_batch_id AND status = 'submitted';

    UPDATE payroll_batches
       SET status = 'sent_back', sent_back_at = now(), sent_back_by = auth.uid(),
           sent_back_by_name = payroll_actor_name(), sent_back_reason = nullif(btrim(p_reason), '')
     WHERE id = p_batch_id;

    UPDATE payroll_runs r
       SET marketing_opex_total  = r.marketing_opex_total  - v_batch.marketing_total,
           hr_opex_total         = r.hr_opex_total         - v_batch.hr_total,
           finance_opex_total    = r.finance_opex_total    - v_batch.finance_total,
           director_office_total = r.director_office_total - v_batch.director_office_total,
           it_opex_total         = r.it_opex_total         - v_batch.it_total,
           revenue_opex_total    = r.revenue_opex_total    - v_batch.revenue_total,
           director_salary_total = r.director_salary_total - v_batch.director_total
     WHERE r.id = v_batch.run_id;

    SELECT count(*) INTO v_standing FROM payroll_batches WHERE run_id = v_batch.run_id AND status = 'submitted';
    IF v_standing = 0 THEN
        UPDATE payroll_runs
           SET status = 'rejected', rejected_at = now(), rejection_reason = 'Sent back by Finance for HR edits'
         WHERE id = v_batch.run_id;
    END IF;

    -- Its people wait again as Completed (still a top-up, of the kind it was,
    -- if they had an earlier standing batch); HR unlocks whoever needs a change.
    PERFORM set_config('app.payroll_lifecycle', 'send_back', true);
    FOR v_line IN SELECT scope, row_id, is_topup, topup_kind FROM payroll_batch_lines WHERE batch_id = p_batch_id LOOP
        IF v_line.scope = 'staff' THEN
            UPDATE hr_monthly_payroll
               SET status = 'completed',
                   topup_opened_at = CASE WHEN v_line.is_topup THEN coalesce(topup_opened_at, now()) END,
                   topup_kind = CASE WHEN v_line.is_topup THEN coalesce(topup_kind, v_line.topup_kind, 'resubmit') END
             WHERE id = v_line.row_id;
        ELSE
            UPDATE director_monthly_payroll
               SET status = 'completed',
                   topup_opened_at = CASE WHEN v_line.is_topup THEN coalesce(topup_opened_at, now()) END,
                   topup_kind = CASE WHEN v_line.is_topup THEN coalesce(topup_kind, v_line.topup_kind, 'resubmit') END
             WHERE id = v_line.row_id;
        END IF;
    END LOOP;
    PERFORM set_config('app.payroll_lifecycle', '', true);

    v_reversed := reverse_payroll_accrual_entries(
        ARRAY[p_batch_id] || CASE WHEN v_batch.legacy THEN ARRAY[v_batch.run_id] ELSE '{}'::UUID[] END,
        auth.uid(), 'payroll batch #' || v_batch.batch_no || ' sent back');

    INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
    VALUES (auth.uid(), 'payroll_batch', p_batch_id::TEXT, 'send_back',
            jsonb_build_object('period', v_batch.period_month, 'batch_no', v_batch.batch_no,
                               'total', v_batch.total_amount, 'reason', p_reason, 'accruals_reversed', v_reversed));
END;
$function$;

-- ─── 5. HR › Payroll reads the count ────────────────────────────────────────
-- As live, plus 'second_payrolls' on each batch.

CREATE OR REPLACE FUNCTION public.payroll_month_status(p_period date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF auth.uid() IS NULL OR NOT (coalesce(has_perm('hr_costing'), false) OR coalesce(has_perm('director_salary'), false)) THEN
        RAISE EXCEPTION 'payroll_month_status: not permitted' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object(
        'period', p_period,
        'closed', (SELECT jsonb_build_object('at', c.closed_at, 'by', c.closed_by_name)
                     FROM payroll_month_closes c WHERE c.period_month = p_period),
        'batches', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'id', b.id, 'no', b.batch_no, 'status', b.status, 'legacy', b.legacy,
                'submitted_at', b.submitted_at, 'submitted_by', b.submitted_by_name,
                'people', b.people, 'topups', b.topups, 'second_payrolls', b.second_payrolls,
                'total', b.total_amount,
                'departments', b.departments,
                'sent_back_at', b.sent_back_at, 'sent_back_by', b.sent_back_by_name,
                'sent_back_reason', b.sent_back_reason,
                'request', (SELECT jsonb_build_object(
                                'id', q.id, 'status', q.status, 'amount', q.amount,
                                'requested_at', q.requested_at, 'cancelled_at', q.cancelled_at,
                                'cancellation_reason', q.cancellation_reason,
                                'paid_amount', (SELECT coalesce(sum(pv.amount), 0) FROM payment_vouchers pv
                                                 WHERE pv.reference_type = 'payroll_payment_request'
                                                   AND pv.reference_id = q.id AND pv.status = 'paid'),
                                'pv_count', (SELECT count(*) FROM payment_vouchers pv
                                              WHERE pv.reference_type = 'payroll_payment_request'
                                                AND pv.reference_id = q.id AND pv.status <> 'voided'))
                              FROM payroll_payment_requests q
                             WHERE q.batch_id = b.id
                             ORDER BY (q.status IN ('submitted', 'pv_generated', 'completed')) DESC, q.created_at DESC
                             LIMIT 1))
                ORDER BY b.batch_no)
              FROM payroll_batches b WHERE b.period_month = p_period), '[]'::JSONB),
        -- Directors of a month before batches were funded on their own.
        'director_legacy_request', (
            SELECT jsonb_build_object('status', q.status, 'amount', q.amount, 'requested_at', q.requested_at)
              FROM payroll_payment_requests q
             WHERE q.payroll_run_id IS NULL AND q.period_month = p_period
               AND q.status IN ('submitted', 'pv_generated', 'completed')
             ORDER BY q.requested_at DESC LIMIT 1),
        'director_submission', (
            SELECT jsonb_build_object('submitted_at', s.submitted_at) FROM director_salary_submissions s
             WHERE s.period_month = p_period));
END;
$function$;

-- ─── 6. Comm Cal's refusal names both ways back ─────────────────────────────
-- As live; only the 23CLS sentence for a salesperson already with Finance
-- changes ("Resubmit" → "Resubmit or Second payroll").

CREATE OR REPLACE FUNCTION public.comm_close_sync_payroll()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_close    comm_salesperson_closes%ROWTYPE := NEW;
    v_row      hr_monthly_payroll%ROWTYPE;
    v_has_row  BOOLEAN;
    v_name     TEXT;
    v_total    NUMERIC(15,2);
    v_standing INTEGER;
    v_run      UUID;
    v_delta    JSONB;
    v_falls    TEXT;
    v_context  TEXT := coalesce(current_setting('app.revenue_commission_write', true), '');
    v_clash    TEXT;
BEGIN
    -- Only a new standing close, or its reopening.
    IF TG_OP = 'UPDATE' AND NOT (OLD.reopened_at IS NULL AND NEW.reopened_at IS NOT NULL) THEN
        RETURN NULL;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || v_close.period_month::TEXT));
    SELECT employee_name INTO v_name FROM hr_staff_costs WHERE id = v_close.staff_id;
    v_name := coalesce(v_name, 'This salesperson');

    IF payroll_month_closed(v_close.period_month) THEN
        RAISE EXCEPTION 'Payroll for % is closed for good — % cannot be % there',
            to_char(v_close.period_month, 'FMMonth YYYY'), v_name,
            CASE WHEN TG_OP = 'INSERT' THEN 'closed' ELSE 'reopened' END USING ERRCODE = '23CLS';
    END IF;

    SELECT * INTO v_row FROM hr_monthly_payroll
     WHERE staff_id = v_close.staff_id AND period_month = v_close.period_month FOR UPDATE;
    v_has_row := FOUND;

    IF v_has_row AND v_row.status IN ('submitted', 'paid') THEN
        RAISE EXCEPTION '%''s % pay is already with Finance. Right-click them on HR › Payroll (Resubmit or Second payroll) first, then % them here',
            v_name, to_char(v_close.period_month, 'FMMonth YYYY'),
            CASE WHEN TG_OP = 'INSERT' THEN 'close' ELSE 'reopen' END USING ERRCODE = '23CLS';
    END IF;
    IF v_has_row AND v_row.source = 'imported' THEN
        RAISE EXCEPTION '%''s % payroll was imported from InfoTech — resolve that row on HR › Payroll before closing them here',
            v_name, to_char(v_close.period_month, 'FMMonth YYYY') USING ERRCODE = '23CLS';
    END IF;

    -- The bills this close pays.
    IF TG_OP = 'INSERT' THEN
        IF jsonb_array_length(v_close.released_orders) > 0 THEN
            SELECT r.order_no INTO v_clash
              FROM jsonb_array_elements(v_close.released_orders) o
              JOIN comm_order_releases r ON r.order_no = o->>'order_no'
               AND r.sub_department_id = v_close.sub_department_id
             LIMIT 1;
            IF v_clash IS NOT NULL THEN
                RAISE EXCEPTION 'Bill % was already paid in an earlier month — refresh Comm Cal and close % again',
                    v_clash, v_name USING ERRCODE = '23CLS';
            END IF;
            v_run := comm_month_run_for_releases(v_close.sub_department_id, v_close.period_month);
            INSERT INTO comm_order_releases (sub_department_id, order_no, run_id, staff_id, period_month,
                                             order_period_month, product_revenue)
            SELECT v_close.sub_department_id, o->>'order_no', v_run, (o->>'staff_id')::UUID,
                   v_close.period_month, (o->>'order_period_month')::DATE,
                   coalesce((o->>'product_revenue')::NUMERIC, 0)
              FROM jsonb_array_elements(v_close.released_orders) o;
        END IF;
    ELSE
        DELETE FROM comm_order_releases r
         USING jsonb_array_elements(OLD.released_orders) o
         WHERE r.sub_department_id = OLD.sub_department_id
           AND r.order_no = o->>'order_no'
           AND r.period_month = OLD.period_month
           AND r.staff_id = (o->>'staff_id')::UUID;
    END IF;

    v_total := comm_standing_close_total(v_close.staff_id, v_close.period_month);
    SELECT count(*) INTO v_standing FROM comm_salesperson_closes
     WHERE staff_id = v_close.staff_id AND period_month = v_close.period_month AND reopened_at IS NULL;

    PERFORM set_config('app.payroll_lifecycle', 'revenue_close', true);
    IF NOT v_has_row THEN
        IF TG_OP = 'UPDATE' THEN
            PERFORM set_config('app.payroll_lifecycle', '', true);
            RETURN NULL;
        END IF;
        PERFORM set_config('app.revenue_commission_write', 'sync', true);
        INSERT INTO hr_monthly_payroll (staff_id, period_month, basic_salary, commission_synced_amount,
                                        source, status, created_by)
        SELECT v_close.staff_id, v_close.period_month, s.basic_salary, v_total, 'commission', 'draft', auth.uid()
          FROM hr_staff_costs s WHERE s.id = v_close.staff_id
        RETURNING * INTO v_row;
        PERFORM set_config('app.revenue_commission_write', v_context, true);
    ELSE
        -- The commission moves only on a draft row.
        IF v_row.status = 'completed' THEN
            UPDATE hr_monthly_payroll SET status = 'draft', completed_at = NULL, completed_by = NULL
             WHERE id = v_row.id;
        END IF;
        IF v_row.commission_synced_amount IS DISTINCT FROM v_total OR v_row.source <> 'commission' THEN
            PERFORM set_config('app.revenue_commission_write', 'sync', true);
            UPDATE hr_monthly_payroll
               SET commission_synced_amount = v_total, source = 'commission'
             WHERE id = v_row.id;
            PERFORM set_config('app.revenue_commission_write', v_context, true);
        END IF;
    END IF;

    -- A new close completes the person; a reopen leaves them a draft.
    IF TG_OP = 'INSERT' AND v_standing > 0 THEN
        v_delta := payroll_row_delta('staff', v_row.id);
        IF (v_delta->>'lines')::INT > 0 THEN
            SELECT string_agg(payroll_money_label(k), ', ') INTO v_falls
              FROM jsonb_array_elements_text(v_delta->'falls') k;
            IF v_falls IS NOT NULL THEN
                RAISE EXCEPTION '%''s resubmit can only add to what was sent — % went down', v_name, v_falls
                    USING ERRCODE = '23CLS';
            END IF;
            IF NOT (v_delta->>'rises')::BOOLEAN THEN
                UPDATE hr_monthly_payroll
                   SET status = payroll_row_settled_status('staff', v_row.id, v_close.period_month)::hr_monthly_payroll_status,
                       topup_opened_at = NULL, topup_opened_by = NULL
                 WHERE id = v_row.id;
                PERFORM set_config('app.payroll_lifecycle', '', true);
                RETURN NULL;
            END IF;
        END IF;
        UPDATE hr_monthly_payroll
           SET status = 'completed', completed_at = v_close.closed_at, completed_by = v_close.closed_by
         WHERE id = v_row.id;
    END IF;
    PERFORM set_config('app.payroll_lifecycle', '', true);
    RETURN NULL;
END;
$function$;

NOTIFY pgrst, 'reload schema';
