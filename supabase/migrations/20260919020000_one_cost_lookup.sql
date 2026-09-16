-- ─────────────────────────────────────────────────────────────────────────────
-- ONE cost lookup, not two.
--
-- `20260919010000` (the SKU-master mirror) and `20260918010000` (the ERP-code
-- bridge, PR #123) were written against different parents and landed within a
-- day of each other. Each added its own answer to the same three questions,
-- and both are live:
--
--   what does this code cost?   `comm_product_unit_cost()`      `erp_resolve_unit_cost()`
--   re-cost a month             `recost_sales_order_lines()`    `erp_recost_month()`
--   what is still blind?        `revenue_uncosted_products()`   `revenue_costing_gaps()`
--
-- Two functions answering one question is the shape that produces a page and a
-- run that disagree, and nobody able to say which is right. This collapses them
-- onto the FIRST column — `comm_product_unit_cost` keeps its name, its
-- signature and all three of its callers, and gains the mirror underneath. The
-- second column's two redundant functions are dropped.
--
-- AND IT CLOSES A HOLE BOTH SIDES HAD. All three of the surviving functions ask
-- `cost_amount IS NULL`. But the 1,720 lines this branch is about are not
-- NULL — they were written as a real RM 0.00, because `ingest_erp_sales_order`
-- accepted a zero whenever the line had no revenue, which is exactly the shape
-- of a sofa combo's companion modules. So the trigger never filled them, the
-- re-cost never revisited them and the blind-list never named them. The
-- definition of "costed" moves to `cost_source IS NOT NULL`, which is the
-- column that records whether anything actually answered.
--
-- WHAT THIS DOES NOT DO, deliberately. It does not turn a guessed zero into
-- NULL. Replacing a fabricated 0 with a REAL cost is an improvement that needs
-- nobody's permission; deciding that a line nothing can cost should take its
-- bill's margin away is a money decision — those bills stop clearing the
-- monthly incentive, not merely stop dodging the penalty — and it is the
-- owner's. `cost_source` now makes the residue countable so the decision can be
-- made on numbers.
--
-- Reversal:        the DOWN block at the foot of this file.
-- Verified against: Venture-Portal (gixpptmfuryskbwkmiwz) — the three callers
--                   re-run and their counts compared before and after.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. The one lookup, and where its answer came from ───────────────────────
-- Same name, same signature, same three callers. The chain underneath is the
-- mirror's, and `comm_products` is now its last step rather than its only one.
--
-- Returns the UNIT cost. `p_seat_height` / `p_fabric_tier` are optional and
-- only a sofa module reads them; every existing caller passes neither and gets
-- the same behaviour it had, plus the mirror.
CREATE OR REPLACE FUNCTION comm_product_unit_cost(
    p_code        TEXT,
    p_seat_height TEXT DEFAULT NULL,
    p_fabric_tier TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT r.unit_cost FROM erp_resolve_unit_cost(p_code, p_seat_height, p_fabric_tier) r;
$fn$;

COMMENT ON FUNCTION comm_product_unit_cost(TEXT, TEXT, TEXT) IS
    'THE cost lookup. Delegates to erp_resolve_unit_cost: the SKU-master mirror first (cost_price, a sofa seat-height cost grid, PRICE 2, PRICE 1), then comm_products as the exception table. Every caller — the fill trigger, the re-cost, the blind list — goes through here.';

-- Where that answer came from, for the provenance column. A second function
-- rather than a second return value because every caller wants the number and
-- only the writers want the label.
CREATE OR REPLACE FUNCTION comm_product_cost_source(
    p_code        TEXT,
    p_seat_height TEXT DEFAULT NULL,
    p_fabric_tier TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT r.cost_source FROM erp_resolve_unit_cost(p_code, p_seat_height, p_fabric_tier) r;
$fn$;

-- ── 2. The fill trigger — and the zero it used to walk past ─────────────────
-- It fired only on `cost_amount IS NULL`. A line the ERP delivered costed 0
-- arrived with 0, not NULL, so the trigger left it alone and the bill went on
-- to claim a margin computed against a cost of nothing.
--
-- It now also fills a line that is sitting at 0 with NO recorded source — that
-- is the signature of a guess, and a real cost is strictly better than one.
-- A zero the ERP itself stamped (`cost_source = 'erp_line'`) is left exactly as
-- it is: the ERP said so, and this is not the place to argue.
CREATE OR REPLACE FUNCTION sales_order_lines_fill_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_unit   NUMERIC;
    v_source TEXT;
BEGIN
    IF NULLIF(BTRIM(NEW.product_code), '') IS NULL THEN
        RETURN NEW;
    END IF;

    -- Already answered by somebody: nothing to do.
    IF NEW.cost_source IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- The ERP stamped a real cost on the sale. Record that it did.
    IF NEW.cost_amount IS NOT NULL AND NEW.cost_amount > 0
       AND COALESCE((NEW.raw->>'cost')::NUMERIC, 0) > 0 THEN
        NEW.cost_source := 'erp_line';
        RETURN NEW;
    END IF;

    IF NEW.cost_amount IS NULL OR NEW.cost_amount = 0 THEN
        SELECT r.unit_cost, r.cost_source INTO v_unit, v_source
          FROM erp_resolve_unit_cost(NEW.product_code) r;
        IF v_unit IS NOT NULL THEN
            NEW.cost_amount := ROUND(v_unit * COALESCE(NEW.qty, 0), 2);
            NEW.cost_source := v_source;
        END IF;
    END IF;

    RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION sales_order_lines_fill_cost() IS
    'BEFORE INSERT on sales_order_lines: stamps cost_source for a cost the ERP sent, and fills a line that has none — including one sitting at a guessed RM 0.00, which the previous version walked past because it only tested IS NULL.';

-- ── 3. The re-cost — same widening, and it now records the source ───────────
-- Unchanged in every other respect, including the 23RUN refusal on a paid
-- month: a cost moves the margin, the margin moves the band, the band moves
-- the commission, so a month that has paid must be reopened and recomputed
-- rather than quietly re-costed underneath.
CREATE OR REPLACE FUNCTION recost_sales_order_lines(p_sub_department_id UUID, p_period DATE)
RETURNS TABLE(lines_costed INTEGER, lines_still_blind INTEGER, orders_with_cost INTEGER)
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_batch  UUID;
    v_costed INTEGER := 0;
BEGIN
    IF commission_order_period_locked(p_sub_department_id, p_period) THEN
        RAISE EXCEPTION 'The run for this month has paid. Reopen it before refilling costs — a cost changes the margin, and the margin changes what the run paid.'
            USING ERRCODE = '23RUN';
    END IF;

    SELECT b.id INTO v_batch
      FROM sales_import_batches b
     WHERE b.sub_department_id = p_sub_department_id
       AND b.period_month = p_period
       AND b.status = 'committed';

    IF v_batch IS NULL THEN
        RETURN QUERY SELECT 0, 0, 0;
        RETURN;
    END IF;

    -- First: say so where the ERP already answered. This is bookkeeping, not a
    -- change of value, and it keeps the blind count below honest.
    UPDATE sales_order_lines sl
       SET cost_source = 'erp_line'
      FROM sales_orders o
     WHERE o.id = sl.order_id
       AND o.batch_id = v_batch
       AND sl.cost_source IS NULL
       AND COALESCE((sl.raw->>'cost')::NUMERIC, 0) > 0;

    -- Then: fill what nothing has answered — NULL or a guessed zero alike.
    UPDATE sales_order_lines sl
       SET cost_amount = ROUND(r.unit_cost * COALESCE(sl.qty, 0), 2),
           cost_source = r.cost_source
      FROM sales_orders o,
           LATERAL erp_resolve_unit_cost(sl.product_code) r
     WHERE o.id = sl.order_id
       AND o.batch_id = v_batch
       AND sl.cost_source IS NULL
       AND r.unit_cost IS NOT NULL;
    GET DIAGNOSTICS v_costed = ROW_COUNT;

    RETURN QUERY
    SELECT v_costed,
           (SELECT COUNT(*)::INTEGER
              FROM sales_order_lines sl
              JOIN sales_orders o ON o.id = sl.order_id
             WHERE o.batch_id = v_batch AND sl.cost_source IS NULL),
           (SELECT COUNT(*)::INTEGER
              FROM sales_orders o
             WHERE o.batch_id = v_batch
               AND NOT EXISTS (SELECT 1 FROM sales_order_lines sl
                                WHERE sl.order_id = o.id AND sl.cost_source IS NULL));
END;
$fn$;

-- ── 4. The blind list — same widening ───────────────────────────────────────
-- `cost_amount IS NULL` named 242 lines. `cost_source IS NULL` names the 1,962
-- that nothing actually costed, which is what the page claims to be showing.
-- It also gains the mirror column, so a code can be sent to the side that owns
-- it instead of being typed into the override table by default.
--
-- DROPPED rather than replaced: it gains a column, and `CREATE OR REPLACE`
-- cannot change a function's return type.
DROP FUNCTION IF EXISTS revenue_uncosted_products(UUID, DATE);

CREATE FUNCTION revenue_uncosted_products(p_sub_department_id UUID, p_period DATE)
RETURNS TABLE(
    product_code    TEXT,
    product_name    TEXT,
    item_group      TEXT,
    commissionable  BOOLEAN,
    lines           INTEGER,
    qty             NUMERIC,
    amount          NUMERIC,
    orders          INTEGER,
    list_item_code  TEXT,
    list_has_cost   BOOLEAN,
    in_sku_master   BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    WITH scheme AS (
        SELECT s.id
          FROM comm_schemes s
         WHERE s.sub_department_id = p_sub_department_id AND s.is_active
         ORDER BY s.effective_from DESC
         LIMIT 1
    ), batch AS (
        SELECT b.id
          FROM sales_import_batches b
         WHERE b.sub_department_id = p_sub_department_id
           AND b.period_month = p_period
           AND b.status = 'committed'
    ), blind AS (
        SELECT UPPER(BTRIM(sl.product_code))              AS product_code,
               MIN(sl.product_name)                       AS product_name,
               MIN(UPPER(BTRIM(sl.item_group)))           AS item_group,
               BOOL_OR(COALESCE(g.commissionable, FALSE)) AS commissionable,
               COUNT(*)::INTEGER                          AS lines,
               SUM(COALESCE(sl.qty, 0))                   AS qty,
               ROUND(SUM(COALESCE(sl.line_amount, 0)), 2) AS amount,
               COUNT(DISTINCT sl.order_id)::INTEGER       AS orders
          FROM sales_order_lines sl
          JOIN sales_orders o ON o.id = sl.order_id
          JOIN batch ON batch.id = o.batch_id
          CROSS JOIN scheme sc
          LEFT JOIN comm_item_groups g
                 ON g.scheme_id = sc.id
                AND UPPER(BTRIM(g.item_group)) = UPPER(BTRIM(sl.item_group))
         WHERE sl.cost_source IS NULL
           AND NULLIF(BTRIM(sl.product_code), '') IS NOT NULL
         GROUP BY UPPER(BTRIM(sl.product_code))
    )
    -- The two membership questions are asked ONCE PER CODE, not per line. The
    -- override lookup carries an OR, which Postgres cannot make a hash join
    -- out of, and joining it to the LINES cost 8.3s against the 8s PostgREST
    -- ceiling on the sibling query that tried it.
    SELECT b.product_code, b.product_name, b.item_group, b.commissionable,
           b.lines, b.qty, b.amount, b.orders,
           (SELECT MIN(p.item_code) FROM comm_products p
             WHERE UPPER(BTRIM(b.product_code))
                   IN (UPPER(BTRIM(p.erp_item_code)), UPPER(BTRIM(p.item_code)))),
           EXISTS (SELECT 1 FROM comm_products p
                    WHERE p.unit_cost IS NOT NULL
                      AND UPPER(BTRIM(b.product_code))
                          IN (UPPER(BTRIM(p.erp_item_code)), UPPER(BTRIM(p.item_code)))),
           EXISTS (SELECT 1 FROM erp_products e
                    WHERE UPPER(BTRIM(e.item_code)) = UPPER(BTRIM(b.product_code)))
      FROM blind b
     ORDER BY b.commissionable DESC, b.amount DESC;
$fn$;

-- ── 5. The two the first migration no longer needs ──────────────────────────
-- `erp_recost_month` is `recost_sales_order_lines` without the 23RUN refusal,
-- which makes it the more dangerous of the two and the one to lose.
-- `erp_resolve_unit_cost` STAYS: it is the implementation both wrappers above
-- call. Only the duplicate ENTRY POINTS go.
DROP FUNCTION IF EXISTS erp_recost_month(DATE, BOOLEAN);

-- The single-argument lookup goes LAST, once every caller above has been
-- rewritten onto the three-argument one. Dropped rather than left beside it
-- because `comm_product_unit_cost('X')` would otherwise be ambiguous between
-- the two, and because a second entry point is how this file's problem started.
DROP FUNCTION IF EXISTS comm_product_unit_cost(TEXT);

GRANT EXECUTE ON FUNCTION comm_product_unit_cost(TEXT, TEXT, TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION comm_product_cost_source(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION revenue_uncosted_products(UUID, DATE)      TO authenticated;

-- ═══ DOWN ════════════════════════════════════════════════════════════════════
-- Restores the pre-merge shape: the one-argument lookup reading comm_products
-- only, the IS NULL trigger, and the two functions this file widened. The full
-- prior bodies are in `20260918010000_product_erp_code_and_recost.sql`.
--
-- DROP FUNCTION IF EXISTS comm_product_cost_source(TEXT, TEXT, TEXT);
-- DROP FUNCTION IF EXISTS comm_product_unit_cost(TEXT, TEXT, TEXT);
-- …then re-run 20260918010000's definitions of comm_product_unit_cost(TEXT),
--    sales_order_lines_fill_cost(), recost_sales_order_lines(UUID, DATE) and
--    revenue_uncosted_products(UUID, DATE).
