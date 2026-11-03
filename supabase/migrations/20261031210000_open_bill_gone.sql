-- ============================================================================
-- 20261031210000_open_bill_gone.sql
-- Open Bill is gone (2026-10-31).
-- ============================================================================
--
-- The user: "deltet the open bill in revenue team, cause this rules is no longer needed, anythigns related to this, may
-- delete as well". Open Bill — the 1st / 2nd / 3rd bill a salesperson writes on an event day earning +50 / 40 / 30% on
-- top of its commission — paid once, Fair's August 2026, and the claim form paid it, not the portal. On production
-- (2026-10-31): both schemes have it off, the one month switched on is that August (comm_open_bill_months), no statement
-- pays a sen of it (open_bill_bonus 0 on all, no open_bill line), no excluded bill holds a pick, no bill is moved. The
-- pages, the picker and the picks' code went with the app (Comm Cal › Open Bill, Rules › Open Bill, the scheme's switch);
-- this takes it out of the database.
--
--   commit_sales_import_batch   commits, and that is all: no p_suggest_open_bills, nothing returned, no pick carried
--                               over from the import it replaces, none suggested (its signature changes: made again,
--                               its grant and comment as before)
--   ingest_erp_sales_order      a delivery clears no pick and suggests none; the agent's day is still renumbered
--   match_erp_salesperson       matching an agent re-suggests nobody's days
--   member_data_snapshot        a run, in the Revenue app and the Principal's, carries no openBill
--   member_principal_snapshot
--   revenue_exclude_order       Don't count this bill / Count it again / Move to another salesperson: no pick leaves
--   revenue_include_order       with the bill or comes back with it; their answers carry no openBillRank / openBillBack
--   revenue_move_order
--   revenue_month_orders        no open_bill_rank / open_bill_auto on a bill (its return type changes: made again)
--   save_commission_run         writes no open_bill_bonus
--
-- Each is made again from PRODUCTION's body (2026-10-31 20:24, the md5 of each below), its Open Bill statements cut and
-- nothing else — refused if production's body has changed since.
--
-- Then what only Open Bill used: comm_open_bill_on(), erp_sync_suggest_open_bills(), erp_sync_suggest_open_bill_days(),
-- guard_open_bill_scope(); the tables sales_order_open_bill_tags (313 picks), comm_open_bill_months (August's row) and
-- comm_open_bill_rules (the three ranks); comm_statements.open_bill_bonus (components_tally made again without it),
-- comm_schemes.enable_open_bill and open_bill_basis, and with it the type comm_open_bill_basis; sales_order_exclusions'
-- open_bill_rank / _auto / _tagged_by / _tagged_at; their rows in permission_table_reads / _writes and audit_tables, and
-- the Open Bill page's in permission_page_tabs. What the tables' rows said stays in audit_events (7 rows).
--
-- Kept: the enum value comm_component 'open_bill' (a value does not drop; nothing writes it); and
-- sales_order_reassignments.open_bill_rank / _auto / _tagged_by / _tagged_at — erp_sync_note_seller_move
-- (20261031040000, #894, that day's) reads v_pin.open_bill_rank; it is left as it is, its comment too, so an older copy
-- of it applied again still runs. Nothing writes the four any more, so they stay empty; they go once nothing reads them.
-- erp_sync_check_seller's body still says "its Open Bill pick" in a comment.
--
-- August 2026: the claim form paid its Open Bill. Comm Cal's working of August and the Revenue app's portal working of
-- it no longer show any; what was paid does not move.
--
-- PGlite: tests/member-sql/validate-open-bill-gone.mjs (production's ten bodies, md5-checked; the migration verbatim,
-- twice).

BEGIN;

-- Production's bodies (2026-10-31 20:24, pg_get_functiondef, md5 of prosrc), or this migration's own once it has run —
-- under the signature it has after, for the two whose signature or return type changes.
DO $$
DECLARE
  r record;
  v_oid regprocedure;
  v_md5 text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.commit_sales_import_batch(uuid, boolean)', 'public.commit_sales_import_batch(uuid)', '28be945a8451c7196269d747e155dc90', '979e81e46e655fec202496e06c72d162'),
      ('public.ingest_erp_sales_order(jsonb, uuid)', 'public.ingest_erp_sales_order(jsonb, uuid)', '400c57fc7e3479f07bb401e18ede78b7', 'd08d228c1fa90d19379cc31b027f20f7'),
      ('public.match_erp_salesperson(text, text, uuid)', 'public.match_erp_salesperson(text, text, uuid)', '54d8c49d60e1338179c3c72264c520d7', '329166e304cfc822221e946b34499531'),
      ('public.member_data_snapshot(boolean)', 'public.member_data_snapshot(boolean)', 'f5568e775511d6bae5326a71faa3e2e7', '71c6ee7c1b7e75628fac34051f634466'),
      ('public.member_principal_snapshot(boolean)', 'public.member_principal_snapshot(boolean)', 'cff3805f5798d456ec36a7189f84096d', '393e371ea1c3494b3a228148f8a0d03b'),
      ('public.revenue_exclude_order(uuid, text)', 'public.revenue_exclude_order(uuid, text)', '7ee04244a6240b640f22f6fefdf5dff9', 'fcb2c81ab4ce49553572f1a9fc43b5db'),
      ('public.revenue_include_order(uuid)', 'public.revenue_include_order(uuid)', '031c10a95cfe299c9ffac48bcf52698b', '278effab1bdc0448a73f4c998945646e'),
      ('public.revenue_month_orders(uuid, date)', 'public.revenue_month_orders(uuid, date)', 'deac7a5e90e893c978d446613de6b3fe', '3cca3cc89e13641177d59dfb8718522e'),
      ('public.revenue_move_order(uuid, uuid, text)', 'public.revenue_move_order(uuid, uuid, text)', 'b0e138911666f3bbc20f54a56036b66d', 'e8657c774eb710c193fdc8ea984fcac4'),
      ('public.save_commission_run(date, uuid, uuid, uuid, numeric, jsonb, jsonb, jsonb, jsonb, jsonb)', 'public.save_commission_run(date, uuid, uuid, uuid, numeric, jsonb, jsonb, jsonb, jsonb, jsonb)', '93830a226afca5b1525ab22c9149aeb1', '3ce5d4e30d0b5d6878c205fe29427ba0')
    ) AS t(sig, sig_after, before_md5, after_md5)
  LOOP
    v_oid := coalesce(to_regprocedure(r.sig), to_regprocedure(r.sig_after));
    IF v_oid IS NULL THEN
      RAISE EXCEPTION '% is not on this database', r.sig;
    END IF;
    IF r.sig_after <> r.sig AND to_regprocedure(r.sig) IS NOT NULL AND to_regprocedure(r.sig_after) IS NOT NULL THEN
      RAISE EXCEPTION 'Both % and % are on this database', r.sig, r.sig_after;
    END IF;
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = v_oid;
    IF v_md5 IS DISTINCT FROM r.before_md5 AND v_md5 IS DISTINCT FROM r.after_md5 THEN
      RAISE EXCEPTION '% is md5 %, not the body this migration was written from', v_oid, v_md5;
    END IF;
  END LOOP;
END $$;

-- The old text, every run of whitespace matching any run, replaced by the new — found exactly once, or refused
-- (20261030083500's).
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

-- A function made again from its own body with these statements swapped, unless it is this migration's already
-- (its md5). Its signature or its return type changing (p_remake), it is dropped and made: grants and comment after.
CREATE OR REPLACE FUNCTION pg_temp.made_without_open_bill(p_sig text, p_after text, p_swaps text[], p_remake boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_oid regprocedure := to_regprocedure(p_sig);
  v_def text;
  i     integer;
BEGIN
  IF v_oid IS NULL THEN
    RETURN;  -- made already, under its new signature
  END IF;
  IF (SELECT md5(replace(prosrc, E'\r', '')) FROM pg_proc WHERE oid = v_oid) = p_after THEN
    RETURN;  -- made already
  END IF;
  v_def := pg_get_functiondef(v_oid);
  FOR i IN 1 .. array_length(p_swaps, 1) / 2 LOOP
    v_def := pg_temp.swap_text(v_def, p_swaps[2 * i - 1], p_swaps[2 * i]);
  END LOOP;
  IF p_remake THEN
    EXECUTE format('DROP FUNCTION %s', p_sig);
  END IF;
  EXECUTE v_def;
END
$fn$;

-- ── 1. A file import commits, and that is all: no pick carried over from the import it replaces, none suggested.
SELECT pg_temp.made_without_open_bill('public.commit_sales_import_batch(uuid, boolean)', '979e81e46e655fec202496e06c72d162', ARRAY[
    $o$CREATE OR REPLACE FUNCTION public.commit_sales_import_batch(p_batch_id uuid, p_suggest_open_bills boolean DEFAULT true)
 RETURNS integer$o$,
    $n$CREATE OR REPLACE FUNCTION public.commit_sales_import_batch(p_batch_id uuid)
 RETURNS void$n$,
    $o$DECLARE v_batch sales_import_batches%ROWTYPE; v_open_bill BOOLEAN; v_suggested INTEGER := 0;$o$,
    $n$DECLARE v_batch sales_import_batches%ROWTYPE;$n$,
    $o$UPDATE sales_import_batches SET status = 'committed' WHERE id = p_batch_id;

    -- (20260926030000) The month's own Open Bill setting, not the scheme's.
    v_open_bill := comm_open_bill_on(v_batch.sub_department_id, v_batch.period_month);
    -- Retired imports must not reserve the day's bill ranks forever. Preserve
    -- human picks when the replacement still names the same salesperson/day.
    WITH previous AS (
        DELETE FROM sales_order_open_bill_tags t USING sales_orders o, sales_import_batches b
         WHERE t.order_id = o.id AND o.batch_id = b.id
           AND b.sub_department_id = v_batch.sub_department_id
           AND b.period_month = v_batch.period_month AND b.id <> p_batch_id
        RETURNING o.order_no, t.staff_id, t.event_date, t.bill_rank, t.auto_suggested, t.tagged_by, t.tagged_at
    )
    INSERT INTO sales_order_open_bill_tags(order_id, staff_id, event_date, bill_rank, auto_suggested, tagged_by, tagged_at)
    SELECT o.id, o.staff_id, o.event_date, p.bill_rank, FALSE, p.tagged_by, p.tagged_at
      FROM previous p JOIN sales_orders o ON o.batch_id = p_batch_id AND o.order_no = p.order_no
     WHERE v_open_bill AND NOT p.auto_suggested AND NOT o.cancelled
       AND o.staff_id = p.staff_id AND o.event_date = p.event_date
    ON CONFLICT DO NOTHING;

    IF p_suggest_open_bills AND v_open_bill THEN
        INSERT INTO sales_order_open_bill_tags(order_id, staff_id, event_date, bill_rank, auto_suggested, tagged_by)
        SELECT o.id, o.staff_id, o.event_date, o.sequence_in_day, TRUE, auth.uid()
          FROM sales_orders o WHERE o.batch_id = p_batch_id AND NOT o.cancelled
           AND o.staff_id IS NOT NULL AND o.sequence_in_day BETWEEN 1 AND 3
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_suggested = ROW_COUNT;
    END IF;
    RETURN v_suggested;$o$,
    $n$UPDATE sales_import_batches SET status = 'committed' WHERE id = p_batch_id;$n$
  ], true);

-- ── 2. The ERP feed: a delivery clears no pick and suggests none; the day is still re-sequenced.
SELECT pg_temp.made_without_open_bill('public.ingest_erp_sales_order(jsonb, uuid)', 'd08d228c1fa90d19379cc31b027f20f7', ARRAY[
    $o$v_old_event     DATE;
    v_old_staff     UUID;$o$,
    $n$v_old_event     DATE;$n$,
    $o$WHERE id = v_existing.id;
        DELETE FROM sales_order_open_bill_tags WHERE order_id = v_existing.id AND auto_suggested;
        PERFORM erp_sync_resequence_day(v_existing.agent_key, v_existing.event_date);
        PERFORM erp_sync_suggest_open_bills(v_existing.staff_id, v_existing.event_date);
        PERFORM erp_sync_refresh_batch(v_existing.batch_id);$o$,
    $n$WHERE id = v_existing.id;
        PERFORM erp_sync_resequence_day(v_existing.agent_key, v_existing.event_date);
        PERFORM erp_sync_refresh_batch(v_existing.batch_id);$n$,
    $o$PERFORM erp_sync_resequence_day(v_existing.agent_key, v_existing.event_date);
            PERFORM erp_sync_suggest_open_bills(v_existing.staff_id, v_existing.event_date);
            PERFORM erp_sync_refresh_batch(v_old_batch);$o$,
    $n$PERFORM erp_sync_resequence_day(v_existing.agent_key, v_existing.event_date);
            PERFORM erp_sync_refresh_batch(v_old_batch);$n$,
    $o$v_old_event     := v_existing.event_date;
        v_old_staff     := v_existing.staff_id;$o$,
    $n$v_old_event     := v_existing.event_date;$n$,
    $o$-- ── The day's running order and the Open Bill suggestions ──────────────
    IF v_excluded THEN
        DELETE FROM sales_order_open_bill_tags WHERE order_id = v_order_id AND auto_suggested;
    END IF;
    PERFORM erp_sync_resequence_day(v_agent_key, v_event_date);
    PERFORM erp_sync_suggest_open_bills(v_staff_id, v_event_date);
    IF v_found AND (v_old_agent_key <> v_agent_key OR v_old_event <> v_event_date) THEN
        PERFORM erp_sync_resequence_day(v_old_agent_key, v_old_event);
    END IF;
    IF v_found AND v_old_staff IS NOT NULL
       AND (v_old_staff IS DISTINCT FROM v_staff_id OR v_old_event <> v_event_date) THEN
        PERFORM erp_sync_suggest_open_bills(v_old_staff, v_old_event);
    END IF;$o$,
    $n$-- ── The day's running order ────────────────────────────────────────────
    PERFORM erp_sync_resequence_day(v_agent_key, v_event_date);
    IF v_found AND (v_old_agent_key <> v_agent_key OR v_old_event <> v_event_date) THEN
        PERFORM erp_sync_resequence_day(v_old_agent_key, v_old_event);
    END IF;$n$
  ]);

-- ── 3. Matching an agent re-suggests nobody's days.
SELECT pg_temp.made_without_open_bill('public.match_erp_salesperson(text, text, uuid)', '329166e304cfc822221e946b34499531', ARRAY[
    $o$v_locked   DATE[];
    v_dates    DATE[];$o$,
    $n$v_locked   DATE[];$n$,
    $o$AND period_month = ANY (v_locked);

    SELECT COALESCE(ARRAY_AGG(DISTINCT o.event_date), '{}') INTO v_dates
      FROM sales_orders o
     WHERE o.source = 'erp_sync' AND o.staff_id = p_staff_id
       AND (o.agent_key = v_key OR (v_sp_id IS NOT NULL AND o.erp_salesperson_id = v_sp_id))
       AND o.period_month <> ALL (v_locked);

    PERFORM erp_sync_suggest_open_bill_days(p_staff_id, v_dates);$o$,
    $n$AND period_month = ANY (v_locked);$n$
  ]);

-- ── 4. The Revenue app's run carries no openBill.
SELECT pg_temp.made_without_open_bill('public.member_data_snapshot(boolean)', '71c6ee7c1b7e75628fac34051f634466', ARRAY[
    $o$'openBill',s.open_bill_bonus,'incentive'$o$,
    $n$'incentive'$n$
  ]);

-- ── 5. …nor the Principal's department run.
SELECT pg_temp.made_without_open_bill('public.member_principal_snapshot(boolean)', '393e371ea1c3494b3a228148f8a0d03b', ARRAY[
    $o$sum(s.kpi_commission) AS kpi,sum(s.open_bill_bonus) AS open_bill,$o$,
    $n$sum(s.kpi_commission) AS kpi,$n$,
    $o$'kpi',s.kpi,'openBill',s.open_bill,$o$,
    $n$'kpi',s.kpi,$n$
  ]);

-- ── 6. Don't count this bill: no pick leaves with it.
SELECT pg_temp.made_without_open_bill('public.revenue_exclude_order(uuid, text)', 'fcb2c81ab4ce49553572f1a9fc43b5db', ARRAY[
    $o$v_note      TEXT := NULLIF(BTRIM(COALESCE(p_note, '')), '');
    v_open_bill BOOLEAN;
    v_rank      SMALLINT;
    v_auto      BOOLEAN;
    v_by        UUID;
    v_at        TIMESTAMPTZ;$o$,
    $n$v_note      TEXT := NULLIF(BTRIM(COALESCE(p_note, '')), '');$n$,
    $o$END IF;

    -- In a month that pays Open Bill, the pick leaves with the bill.
    v_open_bill := comm_open_bill_on(v_sub, v_order.period_month);
    IF v_open_bill THEN
        SELECT t.bill_rank, t.auto_suggested, t.tagged_by, t.tagged_at
          INTO v_rank, v_auto, v_by, v_at
          FROM sales_order_open_bill_tags t
         WHERE t.order_id = p_order_id;
    END IF;$o$,
    $n$END IF;$n$,
    $o$INSERT INTO sales_order_exclusions (
        order_id, note, open_bill_rank, open_bill_auto, open_bill_tagged_by, open_bill_tagged_at,
        excluded_by, excluded_by_name)
    SELECT p_order_id, v_note, v_rank, v_auto, v_by, v_at, u.id, u.name$o$,
    $n$INSERT INTO sales_order_exclusions (
        order_id, note, excluded_by, excluded_by_name)
    SELECT p_order_id, v_note, u.id, u.name$n$,
    $o$-- (sales_order_exclusions_apply has taken the bill out.)

    IF v_rank IS NOT NULL THEN
        DELETE FROM sales_order_open_bill_tags WHERE order_id = p_order_id;
    END IF;$o$,
    $n$-- (sales_order_exclusions_apply has taken the bill out.)$n$,
    $o$PERFORM erp_sync_resequence_day(v_order.agent_key, v_order.event_date);
        PERFORM erp_sync_suggest_open_bills(v_order.staff_id, v_order.event_date);$o$,
    $n$PERFORM erp_sync_resequence_day(v_order.agent_key, v_order.event_date);$n$,
    $o$'changed', TRUE, 'openBillRank', v_rank);$o$,
    $n$'changed', TRUE);$n$
  ]);

-- ── 7. Count it again: no pick comes back.
SELECT pg_temp.made_without_open_bill('public.revenue_include_order(uuid)', '278effab1bdc0448a73f4c998945646e', ARRAY[
    $o$v_ex       sales_order_exclusions%ROWTYPE;
    v_auto     BOOLEAN;
    v_n        INTEGER := 0;$o$,
    $n$v_ex       sales_order_exclusions%ROWTYPE;$n$,
    $o$END IF;

    -- Its Open Bill pick comes back, unless somebody claimed the rank by hand
    -- meanwhile. A suggestion the feed made while the bill was out gives way.
    IF v_ex.open_bill_rank IS NOT NULL AND NOT v_order.cancelled AND v_order.staff_id IS NOT NULL
       AND comm_open_bill_on(v_sub, v_order.period_month)
       AND NOT EXISTS (SELECT 1 FROM sales_order_open_bill_tags t WHERE t.order_id = p_order_id) THEN
        v_auto := COALESCE(v_ex.open_bill_auto, FALSE);
        DELETE FROM sales_order_open_bill_tags t
         WHERE t.sub_department_id = v_sub
           AND t.staff_id = v_order.staff_id
           AND t.event_date = v_order.event_date
           AND t.bill_rank = v_ex.open_bill_rank
           AND t.auto_suggested;
        INSERT INTO sales_order_open_bill_tags (
            order_id, staff_id, event_date, bill_rank, auto_suggested, tagged_by, tagged_at)
        SELECT p_order_id, v_order.staff_id, v_order.event_date, v_ex.open_bill_rank, v_auto,
               -- Whoever made the pick, while they still have an account.
               (SELECT u.id FROM users u WHERE u.id = v_ex.open_bill_tagged_by),
               COALESCE(v_ex.open_bill_tagged_at, NOW())
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_n = ROW_COUNT;
    END IF;

    IF v_order.source = 'erp_sync' THEN
        PERFORM erp_sync_suggest_open_bills(v_order.staff_id, v_order.event_date);
    END IF;$o$,
    $n$END IF;$n$,
    $o$ELSE 'it is excluded' END,
        'openBillRank', CASE WHEN v_n > 0 THEN v_ex.open_bill_rank END);$o$,
    $n$ELSE 'it is excluded' END);$n$
  ]);

-- ── 8. A month's bills: no Open Bill rank, no Open Bill auto (its return type changes, so it is made again).
SELECT pg_temp.made_without_open_bill('public.revenue_month_orders(uuid, date)', '3cca3cc89e13641177d59dfb8718522e', ARRAY[
    $o$lines_without_brand integer, open_bill_rank smallint, open_bill_auto boolean, deposit_required numeric$o$,
    $n$lines_without_brand integer, deposit_required numeric$n$,
    $o$COALESCE(l.no_brand, 0)::INTEGER,
        t.bill_rank, t.auto_suggested,$o$,
    $n$COALESCE(l.no_brand, 0)::INTEGER,$n$,
    $o$) l ON TRUE
      LEFT JOIN sales_order_open_bill_tags t ON t.order_id = o.id$o$,
    $n$) l ON TRUE$n$
  ], true);

-- ── 9. Move to another salesperson: no pick leaves with the bill or comes back on the move back.
SELECT pg_temp.made_without_open_bill('public.revenue_move_order(uuid, uuid, text)', 'e8657c774eb710c193fdc8ea984fcac4', ARRAY[
    $o$v_back   BOOLEAN;
    v_rank   SMALLINT;
    v_auto   BOOLEAN;
    v_by     UUID;
    v_at     TIMESTAMPTZ;$o$,
    $n$v_back   BOOLEAN;$n$,
    $o$v_share  NUMERIC;
    v_put    INTEGER := 0;$o$,
    $n$v_share  NUMERIC;$n$,
    $o$END IF;

    -- Its Open Bill pick ranked the old salesperson's day: it leaves with the
    -- bill. The first move remembers it; the move back may put it back.
    SELECT t.bill_rank, t.auto_suggested, t.tagged_by, t.tagged_at
      INTO v_rank, v_auto, v_by, v_at
      FROM sales_order_open_bill_tags t
     WHERE t.order_id = p_order_id;
    IF FOUND THEN
        DELETE FROM sales_order_open_bill_tags WHERE order_id = p_order_id;
    END IF;$o$,
    $n$END IF;$n$,
    $o$DELETE FROM sales_order_reassignments WHERE order_id = p_order_id;
        -- The pick it gave up on its first move comes back, unless somebody
        -- claimed that rank by hand meanwhile; a suggestion gives way.
        IF v_was.open_bill_rank IS NOT NULL AND v_to IS NOT NULL AND comm_open_bill_on(v_sub, v_order.period_month) THEN
            DELETE FROM sales_order_open_bill_tags t
             WHERE t.sub_department_id = v_sub
               AND t.staff_id = v_to
               AND t.event_date = v_order.event_date
               AND t.bill_rank = v_was.open_bill_rank
               AND t.auto_suggested;
            -- The sub-department named here, not left to guard_open_bill_scope:
            -- the rank's uniqueness is per (sub-department, salesperson, day).
            INSERT INTO sales_order_open_bill_tags (
                order_id, sub_department_id, staff_id, event_date, bill_rank, auto_suggested, tagged_by, tagged_at)
            SELECT p_order_id, v_sub, v_to, v_order.event_date, v_was.open_bill_rank, COALESCE(v_was.open_bill_auto, FALSE),
                   -- Whoever made the pick, while they still have an account.
                   (SELECT u.id FROM users u WHERE u.id = v_was.open_bill_tagged_by),
                   COALESCE(v_was.open_bill_tagged_at, NOW())
            ON CONFLICT DO NOTHING;
            GET DIAGNOSTICS v_put = ROW_COUNT;
        END IF;$o$,
    $n$DELETE FROM sales_order_reassignments WHERE order_id = p_order_id;$n$,
    $o$-- Moved on again: the pick remembered is the first holder's, and stays;
        -- the part remembered is now the new holder's.$o$,
    $n$-- Moved on again: the part remembered is now the new holder's.$n$,
    $o$order_id, staff_id, from_staff_id, note,
            open_bill_rank, open_bill_auto, open_bill_tagged_by, open_bill_tagged_at,
            share_taken_pct,$o$,
    $n$order_id, staff_id, from_staff_id, note,
            share_taken_pct,$n$,
    $o$SELECT p_order_id, v_to, v_order.staff_id, v_note, v_rank, v_auto, v_by, v_at,
               v_share,$o$,
    $n$SELECT p_order_id, v_to, v_order.staff_id, v_note,
               v_share,$n$,
    $o$END IF;

    IF v_order.source = 'erp_sync' THEN
        -- Both salespeople's day, where the month pays Open Bill.
        PERFORM erp_sync_suggest_open_bills(v_order.staff_id, v_order.event_date);
        PERFORM erp_sync_suggest_open_bills(v_to, v_order.event_date);
    END IF;$o$,
    $n$END IF;
$n$,
    $o$'movedBack', v_back,
        'openBillRank', v_rank,
        'openBillBack', CASE WHEN v_put > 0 THEN v_was.open_bill_rank END,
        'shareTaken', v_share,$o$,
    $n$'movedBack', v_back,
        'shareTaken', v_share,$n$
  ]);

-- ── 10. A saved run writes no open_bill_bonus.
SELECT pg_temp.made_without_open_bill('public.save_commission_run(date, uuid, uuid, uuid, numeric, jsonb, jsonb, jsonb, jsonb, jsonb)', '3ce5d4e30d0b5d6878c205fe29427ba0', ARRAY[
    $o$kpi_qty, kpi_base, kpi_threshold_pct, kpi_commission,
            open_bill_bonus, override_commission,$o$,
    $n$kpi_qty, kpi_base, kpi_threshold_pct, kpi_commission,
            override_commission,$n$,
    $o$COALESCE((v_stmt ->> 'kpi_commission')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'open_bill_bonus')::DECIMAL, 0),$o$,
    $n$COALESCE((v_stmt ->> 'kpi_commission')::DECIMAL, 0),$n$
  ]);

-- The two made again: their grants and comments, as production had them (revenue_month_orders' without the rank; its
-- grant the portal's — a reader under RLS, which never needed PUBLIC's or anon's).
REVOKE ALL ON FUNCTION public.commit_sales_import_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_sales_import_batch(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.commit_sales_import_batch(uuid) IS
  'Commits a staged file import as its month''s batch, retiring the one before. A month fed live by the ERP refuses, unless it is closed to the feed (erp_feed_closed_months).';

REVOKE ALL ON FUNCTION public.revenue_month_orders(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revenue_month_orders(uuid, date) TO authenticated, service_role;
COMMENT ON FUNCTION public.revenue_month_orders(uuid, date) IS
  'A month''s sales orders as the commission engine reads them: commissionable value, the margin base and its verdict (manual / cost / none) on the scheme''s cost basis (revenue_cost_divisor), the venue as written plus the PLACE it belongs to and the organiser of THAT MONTH''S fair there, the deposit-gate verdict, why an excluded bill is excluded when the ERP is not the reason, and the paper beside the document: its Ref No. (ref_no) and the paper number the double-claim check reads from it (paper_no).';

-- What the others' comments said of Open Bill.
COMMENT ON FUNCTION public.ingest_erp_sales_order(jsonb, uuid) IS
  'The ERP live feed''s one write: upserts one sales order (canonical shape from src/lib/erp-sync/contract.ts) into the period''s erp_sync batch, replaces its lines, renumbers the agent''s day, refreshes the batch counters and logs the outcome. Every way out goes through erp_sync_after_delivery (2026-10-13): the ERP audit trail (sales_order_erp_changes) and the drop / upsell question an applied change to a bill whose commission was given asks. Never raises for a business outcome — see erp_sync_events.status.';
COMMENT ON FUNCTION public.revenue_exclude_order(uuid, text) IS
  'Take one bill out of its month by hand (Sales orders › right-click › Don''t count this bill): it stops counting everywhere a cancelled bill does and stays out through every ERP re-send. Refuses a month whose run has paid (23RUN) and a bill that is already out for another reason (23EXC). The salesperson''s day is renumbered.';
COMMENT ON FUNCTION public.revenue_include_order(uuid) IS
  'Undo revenue_exclude_order: the bill goes back to whatever its document says (the ERP''s verdict, or in for a file import), and the salesperson''s day is renumbered. Refuses a month whose run has paid (23RUN).';
COMMENT ON FUNCTION public.revenue_move_order(uuid, uuid, text) IS
  'Move one bill to another salesperson (right-click › Move to another salesperson…): it becomes theirs everywhere a bill''s salesperson counts and stays theirs through every ERP re-send. Moving it to the salesperson the ERP names (or to null) takes the move off. The new holder''s share goes, remembered, and is theirs again when the bill leaves them (shareBack / shareNotBack). Refuses a month whose run has paid (23RUN) and a bill that does not count (23EXC).';
COMMENT ON COLUMN public.comm_salesperson_closes.order_ids IS
  'The person''s own bills (shared parts included, upsales not): a share, exclusion or keyed margin on one of them is refused while this close stands.';
COMMENT ON TABLE public.comm_sub_departments IS
  'Sub-units of a commission department, each with its own calculation rules. First one: "Fair" — the roadshow / event team.';
COMMENT ON TABLE public.comm_upsales IS
  'Upsales (+) and drops (−) on bills of a settled month, paid at the salesperson''s own rate in period_month and counted toward the upline''s override. Recorded by hand, or found by the ERP feed (source = erp) as a pending row HR confirms or dismisses. Runs read confirmed rows only. Not a bill — no KPI, margin or deposit gate (lib/commission/upsales.ts).';
COMMENT ON COLUMN public.sales_order_reassignments.open_bill_rank IS
  'Nothing writes this since Open Bill went (20261031210000). Kept while erp_sync_note_seller_move (20261031040000) still reads it.';

-- ── 11. What only Open Bill used ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.erp_sync_suggest_open_bills(uuid, date);
DROP FUNCTION IF EXISTS public.erp_sync_suggest_open_bill_days(uuid, date[]);
-- Each table's triggers (the audit's, guard_open_bill_scope's, guard_commission_order_child's) and policies with it.
DROP TABLE IF EXISTS public.sales_order_open_bill_tags;
DROP TABLE IF EXISTS public.comm_open_bill_months;
DROP TABLE IF EXISTS public.comm_open_bill_rules;
DROP FUNCTION IF EXISTS public.guard_open_bill_scope();
DROP FUNCTION IF EXISTS public.comm_open_bill_on(uuid, date);

-- A run's statement: no Open Bill bonus — refused if one paid any, which dropping it would lose. The tally checks the
-- five parts left.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'comm_statements' AND column_name = 'open_bill_bonus') THEN
    IF EXISTS (SELECT 1 FROM public.comm_statements WHERE open_bill_bonus <> 0) THEN
      RAISE EXCEPTION 'A run''s statement pays Open Bill: dropping comm_statements.open_bill_bonus would lose it';
    END IF;
  END IF;
END $$;
ALTER TABLE public.comm_statements DROP CONSTRAINT IF EXISTS components_tally;
ALTER TABLE public.comm_statements DROP COLUMN IF EXISTS open_bill_bonus;
ALTER TABLE public.comm_statements ADD CONSTRAINT components_tally
  CHECK (abs(total_commission - (product_commission + kpi_commission + override_commission + margin_incentive + group_incentive)) <= 0.01);

ALTER TABLE public.comm_schemes DROP COLUMN IF EXISTS enable_open_bill, DROP COLUMN IF EXISTS open_bill_basis;
DROP TYPE IF EXISTS public.comm_open_bill_basis;

-- sales_order_exclusions_rank goes with its column.
ALTER TABLE public.sales_order_exclusions
  DROP COLUMN IF EXISTS open_bill_rank, DROP COLUMN IF EXISTS open_bill_auto,
  DROP COLUMN IF EXISTS open_bill_tagged_by, DROP COLUMN IF EXISTS open_bill_tagged_at;

-- Their lines in the registries — the app's twins went with the pages (TABLE_READS, TABLE_WRITES, PAGE_TABS).
DELETE FROM public.permission_table_reads WHERE table_name IN ('sales_order_open_bill_tags', 'comm_open_bill_months', 'comm_open_bill_rules');
DELETE FROM public.permission_table_writes WHERE table_name IN ('sales_order_open_bill_tags', 'comm_open_bill_months', 'comm_open_bill_rules');
DELETE FROM public.audit_tables WHERE table_name IN ('sales_order_open_bill_tags', 'comm_open_bill_months', 'comm_open_bill_rules');
DELETE FROM public.permission_page_tabs WHERE page IN ('/revenue/[sub]/[period]/open-bill');

-- Nothing left names what went.
DO $$
DECLARE
  v_left text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text) INTO v_left
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosrc ~ '(sales_order_open_bill_tags|comm_open_bill_(rules|months|on|basis)|erp_sync_suggest_open_bill|guard_open_bill_scope|open_bill_bonus|enable_open_bill|open_bill_basis|p_suggest_open_bills|openBill)';
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'Still naming what went with Open Bill: %', v_left;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
