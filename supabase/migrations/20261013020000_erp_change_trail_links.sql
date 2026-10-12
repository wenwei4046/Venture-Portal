-- ════════════════════════════════════════════════════════════════════════════
-- 20261013020000_erp_change_trail_links.sql
-- A trail row points at a question only when it moved what earns (2026-10-13)
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY. Seen on production the hour 20261013010000 went in: HC-SO-013335's
-- drop (RM 16,388 → RM 8,194, 30 Sep 18:45) read "nothing to pay now" while a
-- save three minutes later that moved only the fair's day read "RM (8,194.00)
-- waiting for an answer". erp_sync_note_change pointed every row of a bill
-- whose commission was given at the question waiting on it, and the rebuild
-- re-linked only each bill's latest row. A row now points at the question only
-- when it moved what earns — an upsell, a drop, a cancellation, a deletion, a
-- hold, a reinstatement — never a save that changed a status, a date or a
-- payment; the rebuilt rows are linked again by the same rule.
--
-- erp_sync_note_change is production's body (md5 13d50f3403d154711b69731c6e6b3cf1,
-- as 20261013010000 left it) with one condition swapped, refused if it changed
-- since.
--
-- Rollback: re-apply 20261013010000's erp_sync_note_change; the links are
-- display only.
-- ════════════════════════════════════════════════════════════════════════════

DO $swap$
DECLARE
    v_fn  REGPROCEDURE := 'public.erp_sync_note_change(uuid, text, uuid, uuid, text, date, jsonb, jsonb, timestamptz, timestamptz)'::REGPROCEDURE;
    v_src TEXT := (SELECT prosrc FROM pg_proc WHERE oid = 'public.erp_sync_note_change(uuid, text, uuid, uuid, text, date, jsonb, jsonb, timestamptz, timestamptz)'::REGPROCEDURE);
    v_old TEXT := 'IF v_settled IS NOT NULL THEN';
    v_new TEXT := 'IF v_settled IS NOT NULL AND erp_order_change_kind(p_before, p_after) NOT IN (''changed'', ''opened'') THEN';
BEGIN
    IF strpos(v_src, v_new) > 0 THEN
        RETURN;
    END IF;
    IF md5(v_src) <> '13d50f3403d154711b69731c6e6b3cf1' THEN
        RAISE EXCEPTION 'erp_sync_note_change is not the body 20261013010000 left (md5 %) — production changed since this migration was written', md5(v_src);
    END IF;
    IF (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
        RAISE EXCEPTION 'erp_sync_note_change: its condition is not there once';
    END IF;
    EXECUTE replace(pg_get_functiondef(v_fn), v_src, replace(v_src, v_old, v_new));
END
$swap$;

-- The rebuilt and the live rows, linked again: a save that moved nothing that
-- earns points at no question; the latest that did, at the one waiting.
UPDATE public.sales_order_erp_changes
   SET adjustment_id = NULL
 WHERE adjustment_id IS NOT NULL AND kind IN ('changed', 'opened');

UPDATE public.sales_order_erp_changes c
   SET adjustment_id = u.id
  FROM public.comm_upsales u
 WHERE u.sub_department_id = c.sub_department_id AND u.erp_doc_no = c.order_no AND u.status = 'pending'
   AND c.adjustment_id IS NULL
   AND c.id = (SELECT c2.id FROM public.sales_order_erp_changes c2
                WHERE c2.sub_department_id = c.sub_department_id AND c2.order_no = c.order_no
                  AND c2.kind NOT IN ('changed', 'opened')
                ORDER BY c2.received_at DESC, c2.id DESC
                LIMIT 1);
