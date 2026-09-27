-- ════════════════════════════════════════════════════════════════════════════
-- Send a month's commission to payroll — one step, all or nothing (2026-09-27)
--
-- Comm Cal's month page works the commission out LIVE, every time it opens,
-- while payroll only ever moved on a button called "Recompute & sync payroll"
-- at the bottom of a folded section — so the live figure read as money already
-- in payroll (user 2026-09-27: 本来它就一直都在 sync 的，不是吗？). It was not:
-- September's run, the portal's first, had never reached payroll. Six
-- warnings kept it `computed`, and every one of them was a rule rather than a
-- gap (two Revenue Directors' own bills; five bills with a free pillow of
-- another brand). Those are fixed in the engine; this is the button.
--
-- The page now says what payroll holds and sends the month with one click.
-- This function is that click's write:
--
--   * a result with warnings is REFUSED before anything moves — payroll keeps
--     what it had. (save_commission_run would store it computed and unsynced;
--     the page lists the same warnings live, so there is nothing to store.)
--   * a run already in payroll is taken back and replaced in the SAME
--     transaction — reopen, save, apply — so "Update payroll" can never leave
--     the month out of payroll half way through.
--   * otherwise it is save_commission_run, which applies a clean result.
--
-- It adds no rule of its own: the guards are those three functions' — Principal
-- or HR, the payroll month still a draft, the period open, no month settled by
-- hand (23CUT), no bill paid twice, titles only ever raised.
--
-- And the page asks BEFORE anyone clicks whether the month's payroll can still
-- change (`commission_payroll_closed`): HR reads only the payroll runs it
-- submitted itself and no period locks, so the answer comes from the same
-- guard the writes use, as the sentence it would have refused with.
--
-- Rollback:
--   DROP FUNCTION public.send_commission_to_payroll(DATE, UUID, UUID, UUID,
--     DECIMAL, JSONB, JSONB, JSONB, JSONB, JSONB);
--   DROP FUNCTION public.commission_payroll_closed(DATE);
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.send_commission_to_payroll(
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
    v_run_id   UUID;
    v_status   comm_run_status;
    v_warnings INTEGER := jsonb_array_length(COALESCE(p_warnings, '[]'::JSONB));
BEGIN
    IF NOT has_scope(ARRAY['hr']) THEN
        RAISE EXCEPTION 'Only Principal or HR may send commission to payroll';
    END IF;

    IF v_warnings > 0 THEN
        RAISE EXCEPTION '% has % thing(s) to settle before it can go to payroll — payroll keeps what it had',
            to_char(p_period_month, 'FMMonth YYYY'), v_warnings;
    END IF;

    -- The lock save / apply / reopen take, taken first so the status read
    -- below cannot race another send of the same month.
    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || p_period_month::TEXT));

    SELECT id, status INTO v_run_id, v_status
      FROM comm_runs
     WHERE sub_department_id = p_sub_department_id
       AND period_month = p_period_month
     FOR UPDATE;

    -- Already in payroll: take this sub-department's share back out, with its
    -- releases, so the fresh result can replace it. Refused, and everything
    -- rolled back, once the payroll month has left draft.
    IF v_status = 'applied' THEN
        PERFORM public.reopen_commission_run(v_run_id);
    END IF;

    -- A clean result: saving it is the hand-off to payroll.
    RETURN public.save_commission_run(
        p_period_month, p_sub_department_id, p_scheme_id, p_batch_id, p_total_commission,
        p_warnings, p_statements, p_released_orders, p_deferred_orders, p_penalised_orders
    );
END;
$fn$;

COMMENT ON FUNCTION public.send_commission_to_payroll(DATE, UUID, UUID, UUID, DECIMAL, JSONB, JSONB, JSONB, JSONB, JSONB) IS
  'The month page''s Send / Update payroll (2026-09-27): refuses a result with warnings before anything moves; replaces a run already in payroll (reopen + save + apply) in one transaction; otherwise save_commission_run, which applies a clean result.';

REVOKE ALL ON FUNCTION public.send_commission_to_payroll(DATE, UUID, UUID, UUID, DECIMAL, JSONB, JSONB, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_commission_to_payroll(DATE, UUID, UUID, UUID, DECIMAL, JSONB, JSONB, JSONB, JSONB, JSONB) TO authenticated;

-- ─── Can this month's payroll still take commission? ────────────────────────
-- NULL = yes. Otherwise the sentence assert_commission_payroll_open refuses
-- with — payroll submitted, the period closed, a payment voucher raised. That
-- guard is SECURITY DEFINER, so HR gets the true answer without reading
-- payroll_runs or period_locks itself.

CREATE OR REPLACE FUNCTION public.commission_payroll_closed(p_period DATE)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
    PERFORM public.assert_commission_payroll_open(p_period);
    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    RETURN SQLERRM;
END;
$fn$;

COMMENT ON FUNCTION public.commission_payroll_closed(DATE) IS
  'NULL while the month''s payroll can still take Revenue commission; otherwise why not, in the words assert_commission_payroll_open refuses with (2026-09-27, the month page''s payroll bar).';

REVOKE ALL ON FUNCTION public.commission_payroll_closed(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_payroll_closed(DATE) TO authenticated;
