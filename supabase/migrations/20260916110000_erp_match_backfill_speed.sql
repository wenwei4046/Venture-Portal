-- ============================================================================
-- NAMING A SALESPERSON THE FEED COULD NOT PLACE — 2026-09-16
--
-- The live feed was turned on without a starting month, so it delivered every
-- sales order back to 2023. 2,889 of them name a salesperson the portal has
-- never been told about: 55 people, one click each on Comm Cal. Every click on
-- the busy ones failed, and production could only say "an error occurred in the
-- Server Components render".
--
-- The click was not wrong. `match_erp_salesperson` walked the person's orders
-- one at a time and re-derived, at every step, something it already knew:
--
--   * `erp_sync_period_locked(period_month)` once per ORDER — four queries a
--     row (the Fair lookup, then comm_runs twice) — when the answer only ever
--     varies by MONTH. Chea Huan: 207 orders across 26 months.
--   * `erp_sync_suggest_open_bills(staff, day)` once per DAY, each call
--     re-reading the sub-department and the scheme before touching anything.
--     Chea Huan: 101 days.
--   * `erp_sync_refresh_batch(batch)` once per (DAY, BATCH) pair — the same 26
--     batches recounted 101 times.
--
-- 10.3 s for the biggest name. A PostgREST connection dies at 8 s (the
-- `authenticated` role's statement_timeout), so the transaction was rolled
-- back, the alias was never written, and Next.js redacted the reason. The
-- busier the salesperson, the more certainly they could not be named.
--
-- The same answers, asked once per thing instead of once per row: the locked
-- months are collected into an array before the write, the back-fill is ONE
-- update, the Open Bill suggestions are one delete and one insert across every
-- affected day (`erp_sync_suggest_open_bill_days`, which the single-day
-- function now delegates to so both paths keep one rule), and each batch is
-- refreshed once. 10.3 s → 2.7 s on the same 207 orders, and the result is
-- identical: orders moved, Open Bill tags, batch counters and the alias row
-- were fingerprinted before and after the rewrite and agree exactly.
--
-- The function now also reports what it could NOT move — orders whose month has
-- an applied run — because those rows stay unplaced and the person stays on the
-- list, which otherwise reads exactly like the failure this migration fixes.
--
-- Second thing here: `erp_sync_unmatched_agents()`. The panel read the unplaced
-- orders row by row and counted them in TypeScript, and PostgREST caps a
-- collection request at its first 1,000 rows — silently. Of 2,889 unplaced
-- orders the page saw 1,000: Chea Huan's 207 orders showed as 72, RM 843k of
-- Kingsley's was really RM 1.2M, and the people whose orders fell outside the
-- window did not appear at all. Counting in SQL cannot be truncated.
-- ============================================================================

-- ── Open Bill suggestions for a set of days ─────────────────────────────────
-- The rule is unchanged, only its shape: the sub-department and the locked
-- months are read once for the whole set instead of once per day, per row.
CREATE OR REPLACE FUNCTION erp_sync_suggest_open_bill_days(p_staff_id UUID, p_event_dates DATE[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_sub    UUID;
    v_locked DATE[];
    n        INTEGER := 0;
BEGIN
    IF p_staff_id IS NULL OR COALESCE(ARRAY_LENGTH(p_event_dates, 1), 0) = 0 THEN
        RETURN 0;
    END IF;
    v_sub := erp_sync_sub_department();
    IF NOT EXISTS (
        SELECT 1 FROM comm_schemes
         WHERE sub_department_id = v_sub AND is_active AND effective_to IS NULL AND enable_open_bill
    ) THEN
        RETURN 0;
    END IF;

    -- Which of the months these days fall in are closed. One test per month.
    SELECT COALESCE(ARRAY_AGG(m) FILTER (WHERE commission_order_period_locked(v_sub, m)), '{}')
      INTO v_locked
      FROM (SELECT DISTINCT period_month AS m
              FROM sales_orders
             WHERE source = 'erp_sync' AND staff_id = p_staff_id
               AND event_date = ANY(p_event_dates)) months;

    DELETE FROM sales_order_open_bill_tags t
     USING sales_orders o
     WHERE t.order_id = o.id
       AND t.staff_id = p_staff_id AND t.event_date = ANY(p_event_dates)
       AND t.auto_suggested AND o.source = 'erp_sync'
       AND o.period_month <> ALL (v_locked);

    INSERT INTO sales_order_open_bill_tags (order_id, staff_id, event_date, bill_rank, auto_suggested)
    SELECT o.id, p_staff_id, o.event_date, o.sequence_in_day, TRUE
      FROM sales_orders o
     WHERE o.source = 'erp_sync' AND o.staff_id = p_staff_id
       AND o.event_date = ANY(p_event_dates) AND NOT o.cancelled
       AND o.period_month <> ALL (v_locked)
       AND o.sequence_in_day BETWEEN 1 AND 3
       AND NOT EXISTS (SELECT 1 FROM sales_order_open_bill_tags h WHERE h.order_id = o.id)
       AND NOT EXISTS (
           SELECT 1 FROM sales_order_open_bill_tags h
            WHERE h.sub_department_id = v_sub AND h.staff_id = p_staff_id
              AND h.event_date = o.event_date AND h.bill_rank = o.sequence_in_day);
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;

-- The ingest path still asks about one day; one rule, one implementation.
CREATE OR REPLACE FUNCTION erp_sync_suggest_open_bills(p_staff_id UUID, p_event_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    RETURN erp_sync_suggest_open_bill_days(p_staff_id, ARRAY[p_event_date]);
END;
$$;

-- ── The match itself ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_erp_salesperson(p_agent_key TEXT, p_erp_salesperson_id TEXT, p_staff_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_key      TEXT := UPPER(REGEXP_REPLACE(BTRIM(COALESCE(p_agent_key, '')), '\s+', ' ', 'g'));
    v_sp_id    TEXT := NULLIF(BTRIM(p_erp_salesperson_id), '');
    v_sub      UUID;
    v_sample   TEXT;
    v_orders   INTEGER := 0;
    v_locked_orders INTEGER := 0;
    v_locked   DATE[];
    v_dates    DATE[];
    r          RECORD;
BEGIN
    IF v_key = '' AND v_sp_id IS NULL THEN
        RAISE EXCEPTION 'Nothing to match on';
    END IF;
    IF p_staff_id IS NULL THEN
        RAISE EXCEPTION 'Pick a salesperson';
    END IF;
    v_sub := erp_sync_sub_department();

    SELECT agent_name INTO v_sample
      FROM sales_orders
     WHERE source = 'erp_sync' AND (agent_key = v_key OR (v_sp_id IS NOT NULL AND erp_salesperson_id = v_sp_id))
     ORDER BY synced_at DESC NULLS LAST
     LIMIT 1;

    -- One alias per spelling, and one per ERP identity. An existing alias for
    -- the spelling is re-pointed rather than duplicated.
    IF v_key <> '' THEN
        INSERT INTO comm_agent_aliases (agent_key, agent_name_sample, staff_id, erp_salesperson_id, created_by)
        VALUES (v_key, COALESCE(v_sample, v_key), p_staff_id, v_sp_id, auth.uid())
        ON CONFLICT (agent_key) DO UPDATE
            SET staff_id = EXCLUDED.staff_id,
                erp_salesperson_id = COALESCE(EXCLUDED.erp_salesperson_id, comm_agent_aliases.erp_salesperson_id);
    ELSE
        INSERT INTO comm_agent_aliases (agent_key, agent_name_sample, staff_id, erp_salesperson_id, created_by)
        VALUES ('ERP:' || v_sp_id, COALESCE(v_sample, v_sp_id), p_staff_id, v_sp_id, auth.uid())
        ON CONFLICT (agent_key) DO UPDATE SET staff_id = EXCLUDED.staff_id;
    END IF;

    -- Which of this name's months can still move. Asked once per month, not
    -- once per order: three years of back-fill is 26 months and 207 orders.
    SELECT COALESCE(ARRAY_AGG(m) FILTER (WHERE commission_order_period_locked(v_sub, m)), '{}')
      INTO v_locked
      FROM (SELECT DISTINCT period_month AS m
              FROM sales_orders
             WHERE source = 'erp_sync'
               AND (agent_key = v_key OR (v_sp_id IS NOT NULL AND erp_salesperson_id = v_sp_id))) months;

    UPDATE sales_orders SET staff_id = p_staff_id
     WHERE source = 'erp_sync' AND staff_id IS NULL
       AND (agent_key = v_key OR (v_sp_id IS NOT NULL AND erp_salesperson_id = v_sp_id))
       AND period_month <> ALL (v_locked);
    GET DIAGNOSTICS v_orders = ROW_COUNT;

    -- What stayed behind, and why the person may still be on the list.
    SELECT COUNT(*) INTO v_locked_orders
      FROM sales_orders
     WHERE source = 'erp_sync' AND staff_id IS NULL
       AND (agent_key = v_key OR (v_sp_id IS NOT NULL AND erp_salesperson_id = v_sp_id))
       AND period_month = ANY (v_locked);

    SELECT COALESCE(ARRAY_AGG(DISTINCT o.event_date), '{}') INTO v_dates
      FROM sales_orders o
     WHERE o.source = 'erp_sync' AND o.staff_id = p_staff_id
       AND (o.agent_key = v_key OR (v_sp_id IS NOT NULL AND o.erp_salesperson_id = v_sp_id))
       AND o.period_month <> ALL (v_locked);

    PERFORM erp_sync_suggest_open_bill_days(p_staff_id, v_dates);

    FOR r IN
        SELECT DISTINCT o.batch_id
          FROM sales_orders o
         WHERE o.source = 'erp_sync' AND o.staff_id = p_staff_id
           AND (o.agent_key = v_key OR (v_sp_id IS NOT NULL AND o.erp_salesperson_id = v_sp_id))
           AND o.period_month <> ALL (v_locked)
    LOOP
        PERFORM erp_sync_refresh_batch(r.batch_id);
    END LOOP;

    RETURN JSONB_BUILD_OBJECT('ordersMatched', v_orders, 'ordersLocked', v_locked_orders);
END;
$$;

-- ── Who the feed could not place ────────────────────────────────────────────
-- Counted in SQL because PostgREST truncates a collection at 1,000 rows and
-- says nothing about it. SECURITY INVOKER: the caller sees what their policies
-- let them see, which is the same set the page could already read.
CREATE OR REPLACE FUNCTION erp_sync_unmatched_agents()
RETURNS TABLE (agent_key TEXT, agent_name TEXT, erp_salesperson_id TEXT, orders BIGINT, total NUMERIC)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT o.agent_key,
           (ARRAY_AGG(o.agent_name ORDER BY o.synced_at DESC NULLS LAST))[1],
           o.erp_salesperson_id,
           COUNT(*),
           COALESCE(SUM(o.order_total), 0)
      FROM sales_orders o
      JOIN sales_import_batches b ON b.id = o.batch_id
     WHERE o.source = 'erp_sync' AND o.staff_id IS NULL AND NOT o.cancelled
       AND b.sub_department_id = erp_sync_sub_department()
     GROUP BY o.agent_key, o.erp_salesperson_id
     ORDER BY COALESCE(SUM(o.order_total), 0) DESC, o.agent_key;
$$;

REVOKE ALL ON FUNCTION erp_sync_unmatched_agents() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION erp_sync_unmatched_agents() TO service_role, authenticated;

COMMENT ON FUNCTION erp_sync_suggest_open_bill_days(UUID, DATE[]) IS
    'Re-derives the auto Open Bill suggestions for one salesperson over a set of days, reading the sub-department and the locked months once for the whole set. erp_sync_suggest_open_bills(staff, day) is the single-day door onto it.';
COMMENT ON FUNCTION match_erp_salesperson(TEXT, TEXT, UUID) IS
    'Remembers which portal salesperson an ERP salesperson is and back-fills every live order that was waiting on the answer. Returns ordersMatched and ordersLocked — the orders left behind in months whose commission run is applied.';
COMMENT ON FUNCTION erp_sync_unmatched_agents() IS
    'The ERP salespeople the portal cannot place, with their live order count and value. Grouped in SQL: the row-by-row read it replaced was silently cut to PostgREST''s first 1,000 rows.';
