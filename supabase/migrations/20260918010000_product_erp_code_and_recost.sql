-- 20260918010000_product_erp_code_and_recost.sql
--
-- THE COST THE ERP NEVER SENDS, AND THE CODE THAT LOST IT.
--
-- A bill has a margin only when EVERY commissionable line of it has a cost,
-- and on 2026-09-16 that was true of 90 of September's 199 bills and 28 of
-- August's 319. The engine is right to refuse a part-costed bill — a partial
-- cost over a whole bill reads as a fat margin — but the reason the costs are
-- missing turned out to be a single, mechanical thing:
--
--     the ERP writes   AKEMI ULTIMATE MATT (K)
--     the Product List writes   AK-ULTIMATE MATT (K)
--
-- Same mattress, same cost, two spellings of its code. `ingest_erp_sales_order`
-- falls back to the Product List when the delivery carries no cost, but it
-- matched on `item_code` alone, so every AKEMI line missed by one hyphen. 268
-- of the 294 uncosted mattress lines — RM 1.87M of sales — are that.
--
-- So the Product List gains the ERP's OWN CODE as a second key:
--
--   * `comm_products.erp_item_code` — what the ERP calls this product. Unique,
--     case- and space-insensitive, and only Principal may type it (the table's
--     existing policies: Principal writes, HR reads).
--   * `comm_product_unit_cost(code)` — the one lookup both paths share. The
--     ERP's code wins over the list's own, so a deliberate mapping always
--     beats an accidental collision.
--   * a BEFORE INSERT trigger on `sales_order_lines` fills `cost_amount` from
--     that lookup whenever the row arrives without one. A trigger rather than
--     an edit to `ingest_erp_sales_order` because THREE paths write these rows
--     — the live feed, the spreadsheet importer and a replay — and one of them
--     silently keeping the old behaviour is exactly the bug this is fixing.
--   * `recost_sales_order_lines()` does the same for months already landed.
--   * `revenue_uncosted_products()` is the gap that is left: which ERP codes
--     still have no cost, what they are worth, and whether the Product List
--     has never heard of them or has heard of them and has no cost either.
--
-- WHAT THE BACKFILL CLAIMS, AND WHAT IT DOES NOT. `erp_item_code` is seeded
-- only from codes that actually appear on committed sales orders, and only by
-- two rules that are reversible by eye: the code as written, and `AKEMI ` for
-- `AK-`. Where either rule lands on more than one product, nothing is written.
-- Sofas are NOT mapped: the ERP's `8030-1A(LHF)` and the list's `SVI-00830
-- SOFA` are a supplier-prefix problem, and those rows carry no unit cost to
-- borrow anyway. They stay in the gap report, where a human can see them.
--
-- RECOSTING MOVES MONEY. A cost changes a margin, a margin changes the band,
-- and the band changes the commission. So `recost_sales_order_lines` refuses a
-- month whose run has paid — `commission_order_period_locked`, the same gate
-- `setOpenBillRank` and `setManualMargin` stand behind — and it never
-- overwrites a cost that is already there. The run has to be recomputed after
-- it; the page that calls it says so.
--
-- Additive. Reversal: DROP TRIGGER sales_order_lines_fill_cost ON
-- sales_order_lines; DROP FUNCTION sales_order_lines_fill_cost,
-- recost_sales_order_lines, revenue_uncosted_products, comm_product_unit_cost;
-- ALTER TABLE comm_products DROP COLUMN erp_item_code.

-- ─── 1. The ERP's own code, on the product it names ─────────────────────────

ALTER TABLE comm_products ADD COLUMN IF NOT EXISTS erp_item_code TEXT;

COMMENT ON COLUMN comm_products.erp_item_code IS
    'What the Houzs ERP calls this product on a sales-order line. The Product List keys cost by its own item_code; the ERP spells the same product differently (AKEMI ULTIMATE MATT (K) vs AK-ULTIMATE MATT (K)), and this is the bridge. Unique, case- and space-insensitive.';

CREATE UNIQUE INDEX IF NOT EXISTS comm_products_erp_item_code_key
    ON comm_products (UPPER(BTRIM(erp_item_code)))
 WHERE erp_item_code IS NOT NULL AND BTRIM(erp_item_code) <> '';

-- ─── 2. One lookup, shared by every path that costs a line ──────────────────

CREATE OR REPLACE FUNCTION comm_product_unit_cost(p_code TEXT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT p.unit_cost
      FROM comm_products p
     WHERE p.is_active
       AND p.unit_cost IS NOT NULL
       AND UPPER(BTRIM(p_code)) IN (UPPER(BTRIM(p.erp_item_code)), UPPER(BTRIM(p.item_code)))
     -- A deliberate ERP mapping beats the list's own spelling.
     ORDER BY (UPPER(BTRIM(p.erp_item_code)) = UPPER(BTRIM(p_code))) DESC NULLS LAST
     LIMIT 1;
$fn$;

COMMENT ON FUNCTION comm_product_unit_cost(TEXT) IS
    'Unit cost for an ERP product code: matched on comm_products.erp_item_code first, then on its own item_code. NULL when the Product List cannot cost it.';

-- ─── 3. A line that arrives without a cost gets one, whoever wrote it ───────

CREATE OR REPLACE FUNCTION sales_order_lines_fill_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_unit NUMERIC;
BEGIN
    IF NEW.cost_amount IS NULL AND NULLIF(BTRIM(NEW.product_code), '') IS NOT NULL THEN
        v_unit := comm_product_unit_cost(NEW.product_code);
        IF v_unit IS NOT NULL THEN
            NEW.cost_amount := ROUND(v_unit * COALESCE(NEW.qty, 0), 2);
        END IF;
    END IF;
    RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION sales_order_lines_fill_cost() IS
    'Fills cost_amount from the Product List when a line arrives without one. Never overwrites a cost the delivery carried.';

DROP TRIGGER IF EXISTS sales_order_lines_fill_cost ON sales_order_lines;
CREATE TRIGGER sales_order_lines_fill_cost
    BEFORE INSERT ON sales_order_lines
    FOR EACH ROW
    EXECUTE FUNCTION sales_order_lines_fill_cost();

-- ─── 4. Seed the mapping from the months already landed ─────────────────────

WITH seen AS (
    SELECT DISTINCT UPPER(BTRIM(sl.product_code)) AS code
      FROM sales_order_lines sl
      JOIN sales_orders o ON o.id = sl.order_id
      JOIN sales_import_batches b ON b.id = o.batch_id AND b.status = 'committed'
     WHERE NULLIF(BTRIM(sl.product_code), '') IS NOT NULL
), guess AS (
    SELECT s.code,
           -- The code as written, and the one hyphen that separates the two
           -- spellings of an Akemi mattress.
           ARRAY[s.code, REGEXP_REPLACE(s.code, '^AKEMI ', 'AK-')] AS candidates
      FROM seen s
), matched AS (
    SELECT g.code,
           (SELECT ARRAY_AGG(p.id) FROM comm_products p
             WHERE UPPER(BTRIM(p.item_code)) = ANY (g.candidates)) AS ids
      FROM guess g
), pick AS (
    -- One code per product, alphabetically, so replaying the seed lands on the
    -- same row it landed on the first time.
    SELECT DISTINCT ON (m.ids[1]) m.ids[1] AS product_id, m.code
      FROM matched m
     WHERE ARRAY_LENGTH(m.ids, 1) = 1       -- an ambiguous rule writes nothing
     ORDER BY m.ids[1], m.code
)
UPDATE comm_products p
   SET erp_item_code = pick.code,
       updated_at = NOW()
  FROM pick
 WHERE p.id = pick.product_id
   AND p.erp_item_code IS NULL
   AND UPPER(BTRIM(p.item_code)) <> pick.code; -- an exact match needs no bridge

-- ─── 5. Recost a month that already landed ──────────────────────────────────

DROP FUNCTION IF EXISTS recost_sales_order_lines(UUID, DATE);

CREATE OR REPLACE FUNCTION recost_sales_order_lines(p_sub_department_id UUID, p_period DATE)
RETURNS TABLE (
    lines_costed      INTEGER,
    lines_still_blind INTEGER,
    orders_with_cost  INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
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

    UPDATE sales_order_lines sl
       SET cost_amount = ROUND(comm_product_unit_cost(sl.product_code) * COALESCE(sl.qty, 0), 2)
      FROM sales_orders o
     WHERE o.id = sl.order_id
       AND o.batch_id = v_batch
       AND sl.cost_amount IS NULL
       AND comm_product_unit_cost(sl.product_code) IS NOT NULL;
    GET DIAGNOSTICS v_costed = ROW_COUNT;

    RETURN QUERY
    SELECT v_costed,
           (SELECT COUNT(*)::INTEGER
              FROM sales_order_lines sl
              JOIN sales_orders o ON o.id = sl.order_id
             WHERE o.batch_id = v_batch AND sl.cost_amount IS NULL),
           (SELECT COUNT(*)::INTEGER
              FROM sales_orders o
             WHERE o.batch_id = v_batch
               AND NOT EXISTS (SELECT 1 FROM sales_order_lines sl
                                WHERE sl.order_id = o.id AND sl.cost_amount IS NULL));
END;
$fn$;

COMMENT ON FUNCTION recost_sales_order_lines(UUID, DATE) IS
    'Fills the missing costs of a committed month from the Product List. Never overwrites a cost, and refuses a month whose run has paid. The run must be recomputed afterwards.';

-- ─── 6. What is still blind, and why ────────────────────────────────────────

DROP FUNCTION IF EXISTS revenue_uncosted_products(UUID, DATE);

CREATE OR REPLACE FUNCTION revenue_uncosted_products(p_sub_department_id UUID, p_period DATE)
RETURNS TABLE (
    product_code   TEXT,
    product_name   TEXT,
    item_group     TEXT,
    commissionable BOOLEAN,
    lines          INTEGER,
    qty            NUMERIC,
    amount         NUMERIC,
    orders         INTEGER,
    list_item_code TEXT,
    list_has_cost  BOOLEAN
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
    )
    SELECT
        UPPER(BTRIM(sl.product_code)),
        MIN(sl.product_name),
        MIN(UPPER(BTRIM(sl.item_group))),
        -- A line outside a commissionable group costs the bill no margin, so
        -- its missing cost is a tidiness problem, not a blind bill.
        BOOL_OR(COALESCE(g.commissionable, FALSE)),
        COUNT(*)::INTEGER,
        SUM(COALESCE(sl.qty, 0)),
        ROUND(SUM(COALESCE(sl.line_amount, 0)), 2),
        COUNT(DISTINCT sl.order_id)::INTEGER,
        MIN(p.item_code),
        BOOL_OR(p.unit_cost IS NOT NULL)
      FROM sales_order_lines sl
      JOIN sales_orders o ON o.id = sl.order_id
      JOIN batch ON batch.id = o.batch_id
      CROSS JOIN scheme sc
      LEFT JOIN comm_item_groups g
             ON g.scheme_id = sc.id
            AND UPPER(BTRIM(g.item_group)) = UPPER(BTRIM(sl.item_group))
      LEFT JOIN comm_products p
             ON UPPER(BTRIM(sl.product_code))
                IN (UPPER(BTRIM(p.erp_item_code)), UPPER(BTRIM(p.item_code)))
     WHERE sl.cost_amount IS NULL
       AND NULLIF(BTRIM(sl.product_code), '') IS NOT NULL
     GROUP BY UPPER(BTRIM(sl.product_code))
     ORDER BY BOOL_OR(COALESCE(g.commissionable, FALSE)) DESC,
              ROUND(SUM(COALESCE(sl.line_amount, 0)), 2) DESC;
$fn$;

COMMENT ON FUNCTION revenue_uncosted_products(UUID, DATE) IS
    'The ERP product codes a month still has no cost for: what they are worth, whether they touch the margin at all, and whether the Product List knows them.';

NOTIFY pgrst, 'reload schema';
