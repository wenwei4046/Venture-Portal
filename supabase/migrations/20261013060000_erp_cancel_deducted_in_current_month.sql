-- ════════════════════════════════════════════════════════════════════════════
-- 20261013060000_erp_cancel_deducted_in_current_month.sql
-- A cancellation is deducted in the current month (2026-10-13)
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY. 20261013050000 deducted a cancellation directly in the FIRST month
-- still open after the one that gave the commission: HC8972 (HC-SO-013367,
-- MELVIN CHONG, RM 10,399 given by the August claim form) went into September,
-- whose pay had not gone out yet. The user, asked whether it should go into the
-- current month (October) instead: "放在当月".
--
-- 1. erp_sync_note_adjustment: the search for the month starts where a drop
--    waiting for an answer is paid from (v_month) — the office's current month,
--    never before the month after the one that gave the commission — and skips
--    a month a run has paid or anybody on the bill is closed in, as before. One
--    statement swapped in production's body (20261013050000's, md5
--    783fc5b82920e9e9db96fc458a8183a8); refused if it changed since.
-- 2. A deduction the feed made into a month before the current one moves to the
--    current month (the first open from it), its note with it: HC8972,
--    September → October 2026. One in a month a run has paid, or somebody on
--    the bill is closed in, stays: that month's pay already took it.
--
-- Rollback, in words (the database tool refuses the keyword): swap the
-- statement back (v_month → the month after v_period); a deduction moved stays
-- where it is.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. The current month ───────────────────────────────────────────────────

DO $swap$
DECLARE
    v_fn  REGPROCEDURE := 'public.erp_sync_note_adjustment(uuid, jsonb, uuid)'::REGPROCEDURE;
    v_src TEXT := (SELECT prosrc FROM pg_proc WHERE oid = 'public.erp_sync_note_adjustment(uuid, jsonb, uuid)'::REGPROCEDURE);
    v_old TEXT := $old$        v_direct := erp_sync_first_open_month(v_sub, (DATE_TRUNC('month', v_period) + INTERVAL '1 month')::DATE,
                                              v_bill, v_staff);$old$;
    v_new TEXT := $new$        v_direct := erp_sync_first_open_month(v_sub, v_month, v_bill, v_staff);$new$;
BEGIN
    IF strpos(v_src, v_new) > 0 THEN
        RETURN;
    END IF;
    IF md5(v_src) <> '783fc5b82920e9e9db96fc458a8183a8' THEN
        RAISE EXCEPTION 'erp_sync_note_adjustment is not the body 20261013050000 left (md5 %) — production changed since this migration was written',
            md5(v_src);
    END IF;
    IF (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
        RAISE EXCEPTION 'erp_sync_note_adjustment: the search for the month is not there once';
    END IF;
    EXECUTE replace(pg_get_functiondef(v_fn), v_src, replace(v_src, v_old, v_new));
END
$swap$;

COMMENT ON FUNCTION public.erp_sync_note_adjustment(UUID, JSONB, UUID) IS
    'What the ERP changed on a bill whose commission was given (erp_sync_settled_basis): the delivery''s commissionable amount minus that figure — moved by drops/upsells confirmed since, re-based by the latest "Not a change" since — is one pending comm_upsales row per document, payable from the current month (never before the month after the one that gave the commission). A cancellation or a deletion is not asked: it is deducted directly in the current month — or the first after it still open for everybody on the bill (answered_by_feed) — and withdrawn by itself if the ERP counts the bill again while that month is open. Nothing given: no question. Never raises. 2026-10-13.';

-- ─── 2. What the feed already deducted into an earlier month ────────────────

DO $move$
DECLARE
    r       RECORD;
    v_month DATE := DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE)::DATE;
    v_to    DATE;
BEGIN
    FOR r IN
        SELECT u.id, u.sub_department_id, u.period_month, u.staff_id, u.settled_period,
               erp_sync_adjustment_bill(u.sub_department_id, u.settled_order_id, u.erp_doc_no) AS bill
          FROM comm_upsales u
         WHERE u.answered_by_feed AND u.status = 'confirmed'
           AND u.period_month < v_month
    LOOP
        CONTINUE WHEN commission_order_period_locked(r.sub_department_id, r.period_month)
                   OR erp_sync_holders_closed(r.sub_department_id, r.period_month, r.bill, r.staff_id);
        v_to := erp_sync_first_open_month(r.sub_department_id,
                    GREATEST(v_month, (DATE_TRUNC('month', COALESCE(r.settled_period, r.period_month)) + INTERVAL '1 month')::DATE),
                    r.bill, r.staff_id);
        CONTINUE WHEN v_to IS NULL OR v_to = r.period_month;
        UPDATE comm_upsales
           SET period_month = v_to,
               note         = regexp_replace(note, ' — taken back directly in .*$', '')
                              || ' — taken back directly in ' || TO_CHAR(v_to, 'FMMonth YYYY')
         WHERE id = r.id;
    END LOOP;
END
$move$;
