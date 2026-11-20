-- ============================================================================
-- 20261121100000_old_bill_changes.sql
-- An old bill changed in the ERP is an upsell or a drop to answer (2026-11-21).
-- ============================================================================
--
-- The user, 2026-11-19/21, of HC-SO-009046 (LUIS, Ref HC10418 + HC10419, opened 10 Nov 2025; on 19 Nov 2026 the customer
-- added to it — TRION (HB STR) RM 1,040 + CASUAL RM 520): "之前不是给过规则吗？一旦在 ERP 的任何一个 SO 有任何改动数字的话，
-- 都要把它同步到 portal 里面 … 现在这个 SO 是 2025 年的旧单 … 可是它就没有进去 portal"; the Houzs ERP then opened its feed to
-- orders dated before vp.since; asked for the rule, the user took the proposal as written ("可以，找你建议做"):
--
--   the lines keyed since the portal started paying    are the change (raw.items[].created_at on or after
--                                                       comm_first_paid_month — Sep 2026); the lines keyed before
--                                                       were settled by hand in the bill's month
--   the first time the portal sees an old bill         it keeps that bill as settled (sales_order_erp_changes, an
--                                                       'opened' row with no bill — order_id NULL, outcome 'held')
--   every later save                                   is measured from what the portal kept, as any bill's is
--   the whole bill                                     never a sale here: only the change is, a question on the
--                                                       Drops & upsells tab of the month still open (status pending,
--                                                       settled_by 'frozen' with the bill's own month), its
--                                                       salesperson's — matched as the receiver matches, still working
--   a cancellation                                     asked too (not taken back directly: the portal cannot tell
--                                                       whether that old commission was ever given in full)
--
-- What the rule cannot see: an old line's price changed before the portal first kept the bill. Two guards: a bill whose
-- every line was keyed since (the ERP rewrote them) is kept as it is now, asked nothing; a bill under Rules' deposit
-- (comm_schemes.deposit_threshold_pct) when the portal started paying was given no commission, so nothing on it is
-- asked (an old bill topped up whose salesperson has left is 20261107200000's, unchanged).
--
-- erp_sync_old_bill_change() does it, called by ingest_erp_sales_order() where it answers "dated before the feed window"
-- for a document it never kept; the delivery is still answered 200 skipped, its log line saying what the rule found and
-- keeping the payload. A fault in it is a warning on the delivery (old_bill_change_failed), never its failure.
--
-- ingest_erp_sales_order is made again from PRODUCTION's body (2026-11-21, md5 of prosrc f928dad8…, the body
-- 20261112003700 left) with one statement swapped — refused if production's body has changed since.
--
-- PGlite: tests/member-sql/validate-old-bill-changes.mjs (the new function verbatim over production's erp_order_state,
-- erp_sync_lines_value, erp_order_change_kind, erp_sync_note_change, sales_order_bill_ref and sales_order_ref_no).
-- The receiver's swap was dry-run on production first (BEGIN … ROLLBACK), HC-SO-009046's shape among the cases.

BEGIN;

-- Production's body (2026-11-21), or this migration's own once it has run.
DO $$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5
    FROM pg_proc WHERE oid = to_regprocedure('public.ingest_erp_sales_order(jsonb, uuid)');
  IF v_md5 IS NULL THEN
    RAISE EXCEPTION 'public.ingest_erp_sales_order(jsonb, uuid) is not on this database';
  END IF;
  IF v_md5 IS DISTINCT FROM 'f928dad80f27bc09b268e2e34c51a708' AND v_md5 IS DISTINCT FROM '27c1cbc5029f0d328ca5ab8faad07e50' THEN
    RAISE EXCEPTION 'public.ingest_erp_sales_order is md5 %, not the body this migration was written from', v_md5;
  END IF;
END $$;

-- The old text, every run of whitespace matching any run, replaced by the new — found exactly once, or refused
-- (20261031210000's).
CREATE OR REPLACE FUNCTION pg_temp.swap_text(p_src text, p_old text, p_new text)
RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  v_pat   text := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  v_n     integer;
  v_found text;
BEGIN
  SELECT count(*) INTO v_n FROM regexp_matches(p_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'A statement this migration swaps is there % times, not once — production changed since it was written: %', v_n, left(p_old, 80);
  END IF;
  v_found := (regexp_match(p_src, '(' || v_pat || ')'))[1];
  RETURN replace(p_src, v_found, p_new);
END
$fn$;

-- ── 1. The rule ─────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.erp_sync_old_bill_change(p_sub_department_id uuid, p_doc_no text, p_order jsonb,
                                                           p_event_id uuid, p_before jsonb)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    v_scheme     UUID;
    v_cutover    DATE;
    v_today      DATE := (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE;
    v_sold       DATE;
    v_bill_month DATE;
    v_sp_id      TEXT := NULLIF(BTRIM(p_order->>'salespersonId'), '');
    v_agent_key  TEXT := UPPER(REGEXP_REPLACE(BTRIM(COALESCE(NULLIF(BTRIM(p_order->>'salespersonName'), ''),
                                                             '(no salesperson)')), '\s+', ' ', 'g'));
    v_old_lines  JSONB;
    v_old_total  NUMERIC(15, 2);
    v_new_lines  INTEGER;
    v_all_lines  INTEGER;
    v_threshold  NUMERIC;
    v_paid_then  NUMERIC(15, 2);
    v_given      BOOLEAN;
    v_rewritten  BOOLEAN := FALSE;
    v_before     JSONB := p_before;
    v_first      JSONB;
    v_now        JSONB;
    v_flag       JSONB;
    v_change     UUID;
    v_staff      UUID;
    v_settled    NUMERIC(15, 2);
    v_stand      NUMERIC(15, 2);
    v_stood_at   TIMESTAMPTZ;
    v_base       NUMERIC(15, 2);
    v_new        NUMERIC(15, 2);
    v_delta      NUMERIC(15, 2);
    v_reason     TEXT;
    v_ref        TEXT;
    v_month      DATE;
    v_upsale     UUID;
    v_note       TEXT;
BEGIN
    v_scheme := erp_sync_scheme_of(p_sub_department_id);
    v_cutover := comm_first_paid_month(p_sub_department_id);
    v_sold := NULLIF(p_order->>'orderDate', '')::DATE;
    IF v_scheme IS NULL OR v_cutover IS NULL OR p_doc_no IS NULL OR v_sold IS NULL
       OR COALESCE((p_order->>'deleted')::BOOLEAN, FALSE) THEN
        RETURN NULL;
    END IF;
    v_bill_month := DATE_TRUNC('month', v_sold)::DATE;
    v_now := erp_order_state(p_order, v_scheme);

    -- ── The first time: the bill as it was settled by hand ─────────────────
    IF v_before IS NULL THEN
        -- Each line with the day the ERP keyed it (raw.items, matched by line number); a line the ERP gives no day
        -- for counts as keyed before.
        WITH l AS (
            SELECT x.line, x.ord,
                   (SELECT ((NULLIF(i->>'created_at', ''))::TIMESTAMPTZ AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE
                      FROM JSONB_ARRAY_ELEMENTS(CASE WHEN JSONB_TYPEOF(p_order->'raw'->'items') = 'array'
                                                     THEN p_order->'raw'->'items' ELSE '[]'::JSONB END) i
                     WHERE NULLIF(i->>'line_no', '')::INTEGER = NULLIF(x.line->>'lineNo', '')::INTEGER
                     ORDER BY i->>'created_at'
                     LIMIT 1) AS keyed_on
              FROM JSONB_ARRAY_ELEMENTS(CASE WHEN JSONB_TYPEOF(p_order->'lines') = 'array'
                                             THEN p_order->'lines' ELSE '[]'::JSONB END) WITH ORDINALITY AS x(line, ord)
        )
        SELECT COALESCE(JSONB_AGG(l.line ORDER BY l.ord) FILTER (WHERE l.keyed_on IS NULL OR l.keyed_on < v_cutover), '[]'::JSONB),
               COALESCE(SUM(COALESCE(NULLIF(l.line->>'amount', '')::NUMERIC, 0))
                            FILTER (WHERE l.keyed_on IS NULL OR l.keyed_on < v_cutover), 0),
               COUNT(*) FILTER (WHERE l.keyed_on >= v_cutover),
               COUNT(*)
          INTO v_old_lines, v_old_total, v_new_lines, v_all_lines
          FROM l;

        -- Every line keyed since: the ERP rewrote the bill, and what it was cannot be told. Kept as it is now.
        IF v_all_lines > 0 AND v_new_lines = v_all_lines THEN
            v_rewritten := TRUE;
            v_old_lines := CASE WHEN JSONB_TYPEOF(p_order->'lines') = 'array' THEN p_order->'lines' ELSE '[]'::JSONB END;
        END IF;
        -- Nothing keyed since: the bill as it is, its total the ERP's own.
        IF v_rewritten OR v_new_lines = 0 THEN
            v_old_total := COALESCE(NULLIF(p_order->>'total', '')::NUMERIC, 0);
        END IF;

        -- Given its commission then: Rules' deposit reached by the payments dated before the portal started paying.
        SELECT s.deposit_threshold_pct INTO v_threshold FROM comm_schemes s WHERE s.id = v_scheme;
        SELECT COALESCE(SUM(COALESCE(NULLIF(e->>'amount_sen', '')::NUMERIC, 0) / 100), 0)
          INTO v_paid_then
          FROM JSONB_ARRAY_ELEMENTS(CASE WHEN JSONB_TYPEOF(p_order->'raw'->'payments') = 'array'
                                         THEN p_order->'raw'->'payments' ELSE '[]'::JSONB END) e
         WHERE NULLIF(e->>'paid_at', '')::DATE < v_cutover;
        v_given := v_threshold IS NULL OR v_threshold <= 0
                   OR (v_old_total > 0 AND v_paid_then >= ROUND(v_old_total * v_threshold, 2));

        v_first := erp_order_state(p_order || JSONB_BUILD_OBJECT('lines', v_old_lines, 'total', v_old_total), v_scheme)
                   || JSONB_BUILD_OBJECT('oldBill', JSONB_BUILD_OBJECT('given', v_given, 'from', v_cutover));
        PERFORM erp_sync_note_change(p_sub_department_id, p_doc_no, NULL, p_event_id, 'held', v_bill_month,
                                     NULL, v_first, NULL, NOW() - INTERVAL '1 millisecond');
        v_before := v_first;
    END IF;

    -- A document the portal once kept as a bill of its own is not this rule's.
    v_flag := v_before->'oldBill';
    IF v_flag IS NULL OR JSONB_TYPEOF(v_flag) <> 'object' THEN
        RETURN NULL;
    END IF;
    v_now := v_now || JSONB_BUILD_OBJECT('oldBill', v_flag);
    v_change := erp_sync_note_change(p_sub_department_id, p_doc_no, NULL, p_event_id, 'held', v_bill_month,
                                     v_before, v_now, NULLIF(p_order->>'snapshotAt', '')::TIMESTAMPTZ);

    IF NOT COALESCE((v_flag->>'given')::BOOLEAN, FALSE) THEN
        v_note := 'old bill: under its deposit when the portal started paying, so no commission was given on it — nothing to change';
    ELSE
        -- Whose: its salesperson, matched as the receiver matches, still working here.
        SELECT a.staff_id INTO v_staff
          FROM comm_agent_aliases a
          JOIN hr_staff_costs s ON s.id = a.staff_id
         WHERE ((v_sp_id IS NOT NULL AND a.erp_salesperson_id = v_sp_id) OR a.agent_key = v_agent_key)
           AND s.status::TEXT = 'active' AND (s.resignation_date IS NULL OR s.resignation_date >= v_today)
         ORDER BY (v_sp_id IS NOT NULL AND a.erp_salesperson_id = v_sp_id) DESC, a.staff_id
         LIMIT 1;

        -- What was given: the bill as the portal first kept it, then every answer since — as erp_sync_note_adjustment.
        SELECT (c.state_after->>'commissionable')::NUMERIC INTO v_settled
          FROM sales_order_erp_changes c
         WHERE c.sub_department_id = p_sub_department_id AND c.order_no = p_doc_no
           AND c.order_id IS NULL AND c.kind = 'opened'
         ORDER BY c.received_at, c.id
         LIMIT 1;
        v_settled := COALESCE(v_settled, (v_first->>'commissionable')::NUMERIC, 0);
        SELECT u.erp_amount, u.decided_at INTO v_stand, v_stood_at
          FROM comm_upsales u
         WHERE u.sub_department_id = p_sub_department_id AND u.erp_doc_no = p_doc_no
           AND u.status = 'dismissed' AND u.erp_amount IS NOT NULL
         ORDER BY u.decided_at DESC NULLS LAST
         LIMIT 1;
        IF v_stood_at IS NOT NULL THEN
            v_base := v_stand + COALESCE((
                SELECT SUM(u.amount) FROM comm_upsales u
                 WHERE u.sub_department_id = p_sub_department_id AND u.erp_doc_no = p_doc_no
                   AND u.status = 'confirmed' AND u.decided_at > v_stood_at), 0);
        ELSE
            v_base := v_settled + COALESCE((
                SELECT SUM(u.amount) FROM comm_upsales u
                 WHERE u.sub_department_id = p_sub_department_id AND u.erp_doc_no = p_doc_no
                   AND u.status = 'confirmed'), 0);
        END IF;
        v_new := COALESCE((v_now->>'commissionable')::NUMERIC, 0);
        v_delta := ROUND(v_new - v_base, 2);

        IF ABS(v_delta) < 0.01 THEN
            DELETE FROM comm_upsales
             WHERE sub_department_id = p_sub_department_id AND erp_doc_no = p_doc_no AND status = 'pending';
            v_note := 'old bill: kept as settled by hand in ' || TO_CHAR(v_bill_month, 'FMMonth YYYY')
                      || CASE WHEN v_rewritten THEN ' (every line keyed since ' || TO_CHAR(v_cutover, 'FMMonth YYYY')
                                                    || ', so as it is now)' ELSE '' END
                      || '; no change to its commission';
        ELSIF v_staff IS NULL THEN
            v_note := 'old bill: ' || CASE WHEN v_delta > 0 THEN 'upsell' ELSE 'drop' END || ' of RM '
                      || TO_CHAR(ABS(v_delta), 'FM999,999,990.00') || ' since it was settled by hand, but '
                      || COALESCE(NULLIF(BTRIM(p_order->>'salespersonName'), ''), 'its salesperson')
                      || ' is nobody the portal pays — nothing asked';
        ELSE
            v_reason := CASE WHEN UPPER(COALESCE(v_now->>'status', '')) = 'CANCELLED' THEN 'cancelled'
                             WHEN COALESCE((v_now->>'onHold')::BOOLEAN, FALSE)
                                  OR UPPER(COALESCE(v_now->>'status', '')) IN ('ON_HOLD', 'DRAFT') THEN 'on_hold'
                             WHEN ABS(v_base) < 0.01 AND v_delta > 0 THEN 'reinstated'
                             ELSE 'amount' END;
            v_ref := COALESCE(NULLIF(BTRIM(sales_order_bill_ref(p_doc_no, sales_order_ref_no(p_order->'raw'->'header'))), ''), p_doc_no);
            v_month := GREATEST(DATE_TRUNC('month', v_today)::DATE, v_cutover);
            INSERT INTO comm_upsales (
                sub_department_id, period_month, staff_id, amount, sold_on, original_ref, note,
                kind, status, source, erp_doc_no, erp_event_id, settled_amount, erp_amount, original_period,
                erp_reason, settled_period, settled_by, settled_order_id, created_by)
            VALUES (
                p_sub_department_id, v_month, v_staff, v_delta, v_today, v_ref,
                'The ERP ' || CASE v_reason WHEN 'cancelled' THEN 'cancelled ' WHEN 'on_hold' THEN 'held back '
                                            WHEN 'reinstated' THEN 'reinstated ' ELSE 'changed ' END
                    || p_doc_no || ' — an old bill of ' || TO_CHAR(v_bill_month, 'FMMonth YYYY')
                    || ', its commission settled by hand then',
                CASE WHEN v_delta > 0 THEN 'upsale' ELSE 'drop' END, 'pending', 'erp', p_doc_no, p_event_id,
                v_base, v_new, v_bill_month, v_reason, v_bill_month, 'frozen', NULL, NULL)
            ON CONFLICT (sub_department_id, erp_doc_no) WHERE status = 'pending' AND erp_doc_no IS NOT NULL
            DO UPDATE SET amount          = EXCLUDED.amount,
                          kind            = EXCLUDED.kind,
                          staff_id        = EXCLUDED.staff_id,
                          period_month    = EXCLUDED.period_month,
                          sold_on         = CASE WHEN comm_upsales.amount = EXCLUDED.amount THEN comm_upsales.sold_on
                                                 ELSE EXCLUDED.sold_on END,
                          original_ref    = EXCLUDED.original_ref,
                          note            = EXCLUDED.note,
                          erp_event_id    = COALESCE(EXCLUDED.erp_event_id, comm_upsales.erp_event_id),
                          settled_amount  = EXCLUDED.settled_amount,
                          erp_amount      = EXCLUDED.erp_amount,
                          original_period = EXCLUDED.original_period,
                          erp_reason      = EXCLUDED.erp_reason,
                          settled_period  = EXCLUDED.settled_period,
                          settled_by      = EXCLUDED.settled_by
            RETURNING id INTO v_upsale;
            IF v_change IS NOT NULL THEN
                UPDATE sales_order_erp_changes SET adjustment_id = v_upsale WHERE id = v_change;
            END IF;
            v_note := 'old bill: ' || CASE WHEN v_delta > 0 THEN 'upsell' ELSE 'drop' END || ' of RM '
                      || TO_CHAR(ABS(v_delta), 'FM999,999,990.00') || ' since it was settled by hand in '
                      || TO_CHAR(v_bill_month, 'FMMonth YYYY') || ' — asked on ' || TO_CHAR(v_month, 'FMMonth YYYY')
                      || '''s Drops & upsells';
        END IF;
    END IF;

    -- The log says what this rule found, in place of the topped-up rule's reason (which is about another rule).
    IF p_event_id IS NOT NULL THEN
        UPDATE erp_sync_events
           SET message = SPLIT_PART(COALESCE(message, ''), ' — ', 1) || ' — ' || v_note,
               payload = p_order
         WHERE id = p_event_id;
    END IF;
    RETURN v_note;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'erp_sync_old_bill_change(%): %', p_doc_no, SQLERRM;
    IF p_event_id IS NOT NULL THEN
        UPDATE erp_sync_events SET warnings = ARRAY_APPEND(warnings, 'old_bill_change_failed') WHERE id = p_event_id;
    END IF;
    RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION public.erp_sync_old_bill_change(uuid, text, jsonb, uuid, jsonb) IS
  'An old bill changed (2026-11-21): for a document dated before the feed window the portal never kept, the bill as settled by hand (its lines keyed before the month the portal pays from) is kept once in sales_order_erp_changes (opened, no bill), every save is measured from it, and a change in what earns is a pending comm_upsales question for its salesperson in the month still open (settled_by frozen). Nothing when its deposit was not reached then. Read by ingest_erp_sales_order only.';

-- The receiver runs as the service role, and as whoever replays a held delivery — as the receiver's other helpers.
REVOKE ALL ON FUNCTION public.erp_sync_old_bill_change(uuid, text, jsonb, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_sync_old_bill_change(uuid, text, jsonb, uuid, jsonb) TO authenticated, service_role;

-- ── 2. The receiver asks it ─────────────────────────────────────────────────────────────────────────────────────────
DO $made$
DECLARE
  v_oid regprocedure := to_regprocedure('public.ingest_erp_sales_order(jsonb, uuid)');
  v_def text;
  v_swaps text[] := ARRAY[
    $o$RETURN erp_sync_after_delivery(v_sub_id, v_doc_no, p_order, erp_sync_log(v_doc_no, v_period, 'skipped',
                            'dated before the feed window (' || v_floor || ')'
                            -- (20261107200000)
                            || COALESCE(' — ' || COALESCE(v_old->>'reason',
                                   CASE WHEN v_excluded THEN 'not a sale in the ERP (' || LOWER(v_status) || ')' END), ''),
                            '{}', v_snapshot, NULL, p_replay_of), v_before);$o$,
    $n$v_result := erp_sync_log(v_doc_no, v_period, 'skipped',
                            'dated before the feed window (' || v_floor || ')'
                            -- (20261107200000)
                            || COALESCE(' — ' || COALESCE(v_old->>'reason',
                                   CASE WHEN v_excluded THEN 'not a sale in the ERP (' || LOWER(v_status) || ')' END), ''),
                            '{}', v_snapshot, NULL, p_replay_of);
        -- (20261121100000) An old bill changed since it was settled by hand: what changed in what earns is an upsell
        -- or a drop to answer (erp_sync_old_bill_change). The delivery is still skipped; a fault is its warning.
        PERFORM erp_sync_old_bill_change(v_sub_id, v_doc_no, p_order, (v_result->>'eventId')::UUID, v_before);
        RETURN erp_sync_after_delivery(v_sub_id, v_doc_no, p_order, v_result, v_before);$n$
  ];
  i integer;
BEGIN
  IF (SELECT md5(replace(prosrc, E'\r', '')) FROM pg_proc WHERE oid = v_oid) = '27c1cbc5029f0d328ca5ab8faad07e50' THEN
    RETURN;  -- made already
  END IF;
  v_def := pg_get_functiondef(v_oid);
  FOR i IN 1 .. array_length(v_swaps, 1) / 2 LOOP
    v_def := pg_temp.swap_text(v_def, v_swaps[2 * i - 1], v_swaps[2 * i]);
  END LOOP;
  EXECUTE v_def;
END $made$;

-- What this migration made is what it was written to make.
DO $$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5
    FROM pg_proc WHERE oid = to_regprocedure('public.ingest_erp_sales_order(jsonb, uuid)');
  IF v_md5 IS DISTINCT FROM '27c1cbc5029f0d328ca5ab8faad07e50' THEN
    RAISE EXCEPTION 'public.ingest_erp_sales_order ended as md5 %, not the body this migration makes', v_md5;
  END IF;
END $$;

COMMIT;
