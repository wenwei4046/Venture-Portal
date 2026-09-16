-- ─────────────────────────────────────────────────────────────────────────────
-- The ERP's SKU master and Combo Pricing, mirrored into the portal.
--
-- WHY. Until now the portal's only source of cost was `comm_products` — a list
-- somebody typed by hand, 599 of whose rows had no cost at all. The ERP has
-- carried a cost per SKU the whole time (`scm.mfg_products.cost_price_sen`,
-- plus a per-seat-height cost grid for sofas), and it has carried the sofa
-- COMBO's cost and selling grids on the same row. The portal could not see
-- either, so it re-typed one of them badly and could not compute a sofa margin
-- at all.
--
-- WHAT IT FIXES, measured on production 2026-09-17 (2026-08-01 → 2026-09-30):
--
--   · The ERP stamps a cost on a MINORITY of lines — 457 of 1,050 in September,
--     56 of 1,706 in August. The rest arrive costed 0.
--   · `ingest_erp_sales_order` only treated a 0 as "unknown" when the line also
--     had revenue: `IF v_cost IS NULL OR (v_cost = 0 AND v_amount <> 0)`. A
--     sofa combo build lands as N lines with the whole price on the FIRST and
--     0 on the rest, so every companion module took the other branch and was
--     recorded as costing exactly RM 0.00 — a real cost, not a gap.
--   · 1,720 lines were written that way. 177 of August's 186 bills that carry
--     a margin (RM 1,279,941) contain at least one of them, and the margin they
--     produce is nonsense: HC-SO-013377 reads 89.1% off 15 assumed zeros and
--     one real RM 2,600.
--   · It always errs the same way — cost too low, margin too high — so the
--     below-margin penalty (≤27% ×0.5, ≤25% ×0.25, ≤24% ×0) never fires and
--     the monthly incentive (≥36% RM 1,000, ≥43% RM 1,500 per brand) is paid
--     on a margin nobody earned.
--
-- THE PROOF THAT A ZERO IS A GAP, NOT A DESIGN. Cost travels with the module's
-- own SKU (`line_cost_sen = unit_cost_sen × qty`), independent of where the
-- combo put the revenue. Among zero-revenue lines, 416 carry a real cost
-- (RM 140,666) and 1,720 carry none — and the SAME product code appears in both
-- shapes: `AK-CS AIRLOFT COMFY PIL` 39 times at up to RM 600 and 140 times at
-- 0. If the zero were deliberate the RM 600 could not exist.
--
-- Reversal:        the DOWN block at the foot of this file, run as one statement.
-- Verified against: Venture-Portal (gixpptmfuryskbwkmiwz), read-only queries
--                   dated 2026-09-17; every figure above came from one.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. The SKU master mirror ────────────────────────────────────────────────
-- One row per ERP product code. The ERP owns every column: the portal never
-- writes here except through the feed, and an edit made here is overwritten by
-- the next delivery. Overrides live in `comm_products`, which this migration
-- demotes to an exception table.
--
-- Money is RINGGIT, converted from the ERP's sen at the receiver — the same
-- edge conversion the sales-order feed already does (`senToRinggit`).
CREATE TABLE IF NOT EXISTS erp_products (
    item_code         TEXT PRIMARY KEY,   -- mfg_products.code
    erp_id            TEXT,               -- mfg_products.id
    description       TEXT,               -- mfg_products.name — the DESCRIPTION column
    category          TEXT,               -- SOFA / BEDFRAME / ACCESSORY / MATTRESS / …
    size_display      TEXT,               -- size_label, else size_code
    brand_code        TEXT,               -- mfg_products.branding
    barcode           TEXT,
    uom               TEXT,
    unit_m3           NUMERIC(12, 3),     -- unit_m3_milli ÷ 1000
    active            BOOLEAN     NOT NULL DEFAULT TRUE,   -- status = ACTIVE

    -- The ERP carries both of these as columns (`base_model`, `size_code`), so
    -- they are taken rather than parsed. The fallback splits the code at its
    -- FIRST dash — `8030-1A(LHF)` → base `8030`, module `1A(LHF)` — which is
    -- exactly `splitSofaCode` in the ERP's scm/shared/sofa-combo-pricing.ts,
    -- and it is the vocabulary a combo's slots are stored in.
    base_model        TEXT,
    module_code       TEXT,

    -- cost_price  = mfg_products.cost_price_sen. The real, confidential cost:
    --               "exactly what someone typed into the SKU master"
    --               (ERP scm/lib/finance-keys.ts). Director + Purchasing only
    --               over there; the portal holds it behind `product_list`.
    -- base_price  = base_price_sen, shown as "PRICE 2" on the ERP's SKU Master.
    -- price_1     = price1_sen,     shown as "PRICE 1".
    -- sell_price  = sell_price_sen, the selling reference.
    cost_price        NUMERIC(15, 2),
    base_price        NUMERIC(15, 2),
    price_1           NUMERIC(15, 2),
    sell_price        NUMERIC(15, 2),

    -- SOFA only: the per-(seat height, fabric tier) COST grid, verbatim from
    -- mfg_products.seat_height_prices. `[{"height":"30","tier":"PRICE_2",
    -- "price":1650.00}, …]`. The ERP's own comment says priceSen here is COST.
    seat_height_costs JSONB,

    erp_snapshot_at   TIMESTAMPTZ,
    synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw               JSONB
);

COMMENT ON TABLE erp_products IS
    'Mirror of the Houzs ERP SKU master (scm.mfg_products), pushed by the ERP. The portal never edits it; comm_products holds the exceptions. Money is ringgit, converted from sen at the receiver.';

CREATE INDEX IF NOT EXISTS erp_products_category_idx   ON erp_products (category) WHERE active;
CREATE INDEX IF NOT EXISTS erp_products_base_model_idx ON erp_products (base_model) WHERE base_model IS NOT NULL;
-- The lookup the ingest does on every line, once per line: case- and
-- space-insensitive on the code.
CREATE INDEX IF NOT EXISTS erp_products_lookup_idx     ON erp_products (UPPER(BTRIM(item_code)));

-- ── 2. The Combo Pricing mirror ─────────────────────────────────────────────
-- A combo says: for base model X, this exact SET of modules, at this tier, the
-- price is N — INSTEAD of adding the compartments up.
--
-- Two things about it that decide how the portal may use it, both read out of
-- the ERP's own source rather than assumed:
--
--   · COMBO ALWAYS WINS. `sofa-build.ts` groupPrice: when a subset of the
--     build's cells covers a combo's slots and that seat height is priced > 0,
--     the combo price REPLACES that subset's à-la-carte sum and overrides the
--     bundle path; modules outside the subset stay at full price. The old
--     "only if cheaper" guard was REMOVED (Chairman 2026-05-30), so a matched
--     combo is the price even when it is dearer than adding up.
--   · EVERY ROW CARRIES BOTH SIDES. `prices_by_height` is the COST grid and
--     `selling_prices_by_height` the SELLING grid — `comboChargedPrices(selling,
--     cost)` lays selling over cost to get what is charged. That is what makes
--     a sofa margin computable at all: the ERP's sofa SKU rows are largely
--     unpriced (PRICE 1 / PRICE 2 both blank), so the compartment sum has
--     nothing to sum.
--
-- Append-only and effective-dated over there: an edit INSERTs a fresher row and
-- the latest in scope wins. Mirrored the same way — `erp_id` is the row, not
-- the combo, and the resolver picks the latest effective row per scope.
CREATE TABLE IF NOT EXISTS erp_sofa_combos (
    erp_id            TEXT PRIMARY KEY,
    base_model        TEXT        NOT NULL,

    -- Ordered slots, each an OR-set of alternative module codes:
    -- `[["2A(LHF)","2A(RHF)"],["L(LHF)","L(RHF)"]]`.
    modules           JSONB       NOT NULL,
    -- Order-independent canonical key of the slot-set (the ERP's
    -- `comboSlotsKey`), so two spellings of one combo group together.
    slots_key         TEXT        NOT NULL,

    tier              TEXT,   -- PRICE_1 | PRICE_2 | PRICE_3 | NULL = any tier
    customer_id       TEXT,   -- NULL = every customer (the 2990 B2C model)
    supplier_id       TEXT,   -- NULL = master / sales side; a uuid = that supplier's cost

    cost_by_height    JSONB       NOT NULL DEFAULT '{}'::JSONB,  -- prices_by_height
    selling_by_height JSONB       NOT NULL DEFAULT '{}'::JSONB,  -- selling_prices_by_height
    label             TEXT,

    effective_from    DATE        NOT NULL,
    deleted_at        TIMESTAMPTZ,
    erp_snapshot_at   TIMESTAMPTZ,
    synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw               JSONB,

    CONSTRAINT erp_sofa_combos_tier_valid
        CHECK (tier IS NULL OR tier IN ('PRICE_1', 'PRICE_2', 'PRICE_3'))
);

COMMENT ON TABLE erp_sofa_combos IS
    'Mirror of scm.sofa_combo_pricing. One row per effective-dated combo row. cost_by_height = the ERP prices_by_height (COST); selling_by_height = selling_prices_by_height (SELLING). supplier_id NULL = the sales-side master row.';

CREATE INDEX IF NOT EXISTS erp_sofa_combos_model_idx
    ON erp_sofa_combos (base_model, slots_key, effective_from DESC)
    WHERE deleted_at IS NULL;

-- ── 3. Where a line's cost came from ────────────────────────────────────────
-- The contract's §7.2 asked for this in as many words: "show the cost's
-- PROVENANCE on the order-line drill-down (ERP / Product List / none), so a
-- margin can be argued with". A margin nobody can trace is a margin nobody
-- can defend, and this column is what makes the Costing-gaps view honest.
ALTER TABLE sales_order_lines
    ADD COLUMN IF NOT EXISTS cost_source TEXT;

COMMENT ON COLUMN sales_order_lines.cost_source IS
    'Where cost_amount came from: erp_line (the ERP stamped it on the sale) | sku_master (erp_products) | product_list (comm_products, the exception table) | NULL (nothing could cost it — the bill has no margin).';

ALTER TABLE sales_order_lines
    DROP CONSTRAINT IF EXISTS sales_order_lines_cost_source_valid;
ALTER TABLE sales_order_lines
    ADD CONSTRAINT sales_order_lines_cost_source_valid
    CHECK (cost_source IS NULL OR cost_source IN ('erp_line', 'sku_master', 'product_list'));

-- ── 4. The resolver ─────────────────────────────────────────────────────────
-- ONE function decides what a line costs, so the ingest, a re-cost and any
-- report cannot drift apart. Returns the UNIT cost and where it came from;
-- the caller multiplies by qty.
--
-- Precedence, highest first:
--   1. erp_products.cost_price   — the ERP's own confidential cost field
--   2. seat_height_costs         — a sofa module's cost at this build's seat
--                                  height and fabric tier, else that height at
--                                  any tier, else the cheapest entry
--   3. erp_products.base_price   — "PRICE 2"; the ERP's cost-anchor sync calls
--                                  base_price_sen a product's cost, and the
--                                  sofa chain falls back through it the same
--                                  way ("else flat base_price_sen, else
--                                  cost_price_sen")
--   4. erp_products.price_1      — "PRICE 1", the last cost-shaped field
--   5. comm_products.unit_cost   — the portal's exception table
--
-- sell_price is deliberately NOT in the chain: it is the selling reference, and
-- costing a line at its own selling price would read as 0% margin, which is a
-- different lie from the one this migration removes.
CREATE OR REPLACE FUNCTION erp_resolve_unit_cost(
    p_item_code   TEXT,
    p_seat_height TEXT DEFAULT NULL,
    p_fabric_tier TEXT DEFAULT NULL
)
RETURNS TABLE (unit_cost NUMERIC, cost_source TEXT)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
DECLARE
    v_code  TEXT := UPPER(BTRIM(COALESCE(p_item_code, '')));
    v_p     erp_products%ROWTYPE;
    v_seat  NUMERIC;
    v_list  NUMERIC;
BEGIN
    IF v_code = '' THEN
        RETURN;
    END IF;

    SELECT * INTO v_p FROM erp_products WHERE UPPER(BTRIM(item_code)) = v_code LIMIT 1;

    IF FOUND THEN
        IF v_p.cost_price IS NOT NULL AND v_p.cost_price > 0 THEN
            RETURN QUERY SELECT v_p.cost_price, 'sku_master'::TEXT;
            RETURN;
        END IF;

        IF v_p.seat_height_costs IS NOT NULL
           AND jsonb_typeof(v_p.seat_height_costs) = 'array' THEN
            -- Exact (height, tier), then the height at any tier, then the
            -- cheapest priced entry. Ordering the fallbacks rather than
            -- COALESCEing them keeps "which one answered" decidable.
            SELECT e.price INTO v_seat
              FROM jsonb_to_recordset(v_p.seat_height_costs)
                   AS e(height TEXT, tier TEXT, price NUMERIC)
             WHERE e.price IS NOT NULL AND e.price > 0
             ORDER BY (p_seat_height IS NOT NULL AND e.height = p_seat_height
                       AND p_fabric_tier IS NOT NULL AND e.tier = p_fabric_tier) DESC,
                      (p_seat_height IS NOT NULL AND e.height = p_seat_height) DESC,
                      e.price ASC
             LIMIT 1;
            IF v_seat IS NOT NULL THEN
                RETURN QUERY SELECT v_seat, 'sku_master'::TEXT;
                RETURN;
            END IF;
        END IF;

        IF v_p.base_price IS NOT NULL AND v_p.base_price > 0 THEN
            RETURN QUERY SELECT v_p.base_price, 'sku_master'::TEXT;
            RETURN;
        END IF;

        IF v_p.price_1 IS NOT NULL AND v_p.price_1 > 0 THEN
            RETURN QUERY SELECT v_p.price_1, 'sku_master'::TEXT;
            RETURN;
        END IF;
    END IF;

    -- The exception table. `erp_item_code` was added 2026-09-16 because the
    -- portal's own codes and the ERP's differ by punctuation (`AK-ULTIMATE
    -- MATT (K)` vs `AKEMI ULTIMATE MATT (K)` — one hyphen, 268 lines,
    -- RM 1.87M); both spellings are matched here for the same reason.
    SELECT cp.unit_cost INTO v_list
      FROM comm_products cp
     WHERE cp.is_active
       AND (UPPER(BTRIM(cp.item_code)) = v_code
            OR UPPER(BTRIM(COALESCE(cp.erp_item_code, ''))) = v_code)
       AND cp.unit_cost IS NOT NULL
       AND cp.unit_cost > 0
     ORDER BY (UPPER(BTRIM(COALESCE(cp.erp_item_code, ''))) = v_code) DESC
     LIMIT 1;

    IF v_list IS NOT NULL THEN
        RETURN QUERY SELECT v_list, 'product_list'::TEXT;
        RETURN;
    END IF;

    RETURN;  -- nothing could cost it: the caller writes NULL and the bill
             -- loses its margin, which is the engine's designed behaviour.
END;
$fn$;

COMMENT ON FUNCTION erp_resolve_unit_cost(TEXT, TEXT, TEXT) IS
    'The one place that decides a UNIT cost: erp_products.cost_price → sofa seat-height cost grid → base_price → price_1 → comm_products.unit_cost. Returns nothing when none of them can cost the code.';

-- ── 5. Ingesting a SKU-master / combo delivery ──────────────────────────────
-- The ERP's `comboSlotsKey`, in SQL, so a delivery that omits `slotsKey` still
-- groups identically: sort the codes inside each slot, sort the slots, dump as
-- compact JSON. Defined before the ingest that calls it.
CREATE OR REPLACE FUNCTION erp_combo_slots_key(p_modules JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
    SELECT COALESCE(
        (SELECT JSONB_AGG(slot ORDER BY slot::TEXT)::TEXT
           FROM (SELECT COALESCE(
                          (SELECT JSONB_AGG(code ORDER BY code)
                             FROM JSONB_ARRAY_ELEMENTS_TEXT(
                                    CASE WHEN jsonb_typeof(elem) = 'array' THEN elem
                                         ELSE JSONB_BUILD_ARRAY(elem) END) AS code),
                          '[]'::JSONB) AS slot
                   FROM JSONB_ARRAY_ELEMENTS(
                          CASE WHEN jsonb_typeof(p_modules) = 'array' THEN p_modules
                               ELSE '[]'::JSONB END) AS elem) s),
        '[]');
$fn$;

-- One RPC, one round trip, the whole batch. Mirrors the sales-order receiver's
-- shape: the service role calls this and it owns every write.
CREATE OR REPLACE FUNCTION ingest_erp_products(p_batch JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_snapshot  TIMESTAMPTZ := NULLIF(p_batch->>'snapshotAt', '')::TIMESTAMPTZ;
    v_full      BOOLEAN     := COALESCE((p_batch->>'full')::BOOLEAN, FALSE);
    v_products  JSONB       := COALESCE(p_batch->'products', '[]'::JSONB);
    v_combos    JSONB       := COALESCE(p_batch->'combos',   '[]'::JSONB);
    v_row       JSONB;
    v_codes     TEXT[]      := '{}';
    v_ids       TEXT[]      := '{}';
    v_code      TEXT;
    v_dash      INTEGER;
    v_products_n INTEGER := 0;
    v_combos_n   INTEGER := 0;
    v_retired_p  INTEGER := 0;
    v_retired_c  INTEGER := 0;
BEGIN
    FOR v_row IN SELECT * FROM JSONB_ARRAY_ELEMENTS(v_products) LOOP
        v_code := NULLIF(BTRIM(v_row->>'itemCode'), '');
        CONTINUE WHEN v_code IS NULL;
        v_codes := ARRAY_APPEND(v_codes, v_code);

        -- `8030-1A(LHF)` → base `8030`, module `1A(LHF)`; a code with no dash
        -- is its own base and has no module. Same split as the ERP's
        -- splitSofaCode, which cuts at the FIRST dash only.
        v_dash := POSITION('-' IN v_code);

        INSERT INTO erp_products (
            item_code, erp_id, description, category, size_display, brand_code,
            barcode, uom, unit_m3, active, base_model, module_code,
            cost_price, base_price, price_1, sell_price, seat_height_costs,
            erp_snapshot_at, synced_at, raw)
        VALUES (
            v_code,
            NULLIF(v_row->>'erpId', ''),
            NULLIF(v_row->>'description', ''),
            NULLIF(UPPER(BTRIM(COALESCE(v_row->>'category', ''))), ''),
            NULLIF(v_row->>'size', ''),
            NULLIF(UPPER(BTRIM(COALESCE(v_row->>'brand', ''))), ''),
            NULLIF(v_row->>'barcode', ''),
            NULLIF(v_row->>'uom', ''),
            NULLIF(v_row->>'unitM3', '')::NUMERIC,
            COALESCE((v_row->>'active')::BOOLEAN, TRUE),
            COALESCE(NULLIF(BTRIM(v_row->>'baseModel'), ''),
                     CASE WHEN v_dash > 1 THEN LEFT(v_code, v_dash - 1) ELSE v_code END),
            COALESCE(NULLIF(BTRIM(v_row->>'moduleCode'), ''),
                     CASE WHEN v_dash > 1 THEN SUBSTRING(v_code FROM v_dash + 1) END),
            NULLIF(v_row->>'costPrice', '')::NUMERIC,
            NULLIF(v_row->>'basePrice', '')::NUMERIC,
            NULLIF(v_row->>'price1', '')::NUMERIC,
            NULLIF(v_row->>'sellPrice', '')::NUMERIC,
            CASE WHEN jsonb_typeof(v_row->'seatHeightCosts') = 'array'
                 THEN v_row->'seatHeightCosts' END,
            v_snapshot, NOW(), v_row)
        ON CONFLICT (item_code) DO UPDATE SET
            erp_id            = EXCLUDED.erp_id,
            description       = EXCLUDED.description,
            category          = EXCLUDED.category,
            size_display      = EXCLUDED.size_display,
            brand_code        = EXCLUDED.brand_code,
            barcode           = EXCLUDED.barcode,
            uom               = EXCLUDED.uom,
            unit_m3           = EXCLUDED.unit_m3,
            active            = EXCLUDED.active,
            base_model        = EXCLUDED.base_model,
            module_code       = EXCLUDED.module_code,
            cost_price        = EXCLUDED.cost_price,
            base_price        = EXCLUDED.base_price,
            price_1           = EXCLUDED.price_1,
            sell_price        = EXCLUDED.sell_price,
            seat_height_costs = EXCLUDED.seat_height_costs,
            erp_snapshot_at   = EXCLUDED.erp_snapshot_at,
            synced_at         = NOW(),
            raw               = EXCLUDED.raw;

        v_products_n := v_products_n + 1;
    END LOOP;

    FOR v_row IN SELECT * FROM JSONB_ARRAY_ELEMENTS(v_combos) LOOP
        CONTINUE WHEN NULLIF(BTRIM(v_row->>'erpId'), '') IS NULL;
        v_ids := ARRAY_APPEND(v_ids, BTRIM(v_row->>'erpId'));

        INSERT INTO erp_sofa_combos (
            erp_id, base_model, modules, slots_key, tier, customer_id, supplier_id,
            cost_by_height, selling_by_height, label, effective_from, deleted_at,
            erp_snapshot_at, synced_at, raw)
        VALUES (
            BTRIM(v_row->>'erpId'),
            UPPER(BTRIM(COALESCE(v_row->>'baseModel', ''))),
            COALESCE(v_row->'modules', '[]'::JSONB),
            -- The delivered `slotsKey` is IGNORED. Postgres renders jsonb with
            -- spaces and JSON.stringify does not, so trusting whichever arrived
            -- would give one combo two keys and split its history in half. The
            -- database computes its own, always — one function, one answer.
            erp_combo_slots_key(v_row->'modules'),
            NULLIF(v_row->>'tier', ''),
            NULLIF(v_row->>'customerId', ''),
            NULLIF(v_row->>'supplierId', ''),
            COALESCE(v_row->'costByHeight',    '{}'::JSONB),
            COALESCE(v_row->'sellingByHeight', '{}'::JSONB),
            NULLIF(v_row->>'label', ''),
            COALESCE(NULLIF(v_row->>'effectiveFrom', '')::DATE, CURRENT_DATE),
            NULLIF(v_row->>'deletedAt', '')::TIMESTAMPTZ,
            v_snapshot, NOW(), v_row)
        ON CONFLICT (erp_id) DO UPDATE SET
            base_model        = EXCLUDED.base_model,
            modules           = EXCLUDED.modules,
            slots_key         = EXCLUDED.slots_key,
            tier              = EXCLUDED.tier,
            customer_id       = EXCLUDED.customer_id,
            supplier_id       = EXCLUDED.supplier_id,
            cost_by_height    = EXCLUDED.cost_by_height,
            selling_by_height = EXCLUDED.selling_by_height,
            label             = EXCLUDED.label,
            effective_from    = EXCLUDED.effective_from,
            deleted_at        = EXCLUDED.deleted_at,
            erp_snapshot_at   = EXCLUDED.erp_snapshot_at,
            synced_at         = NOW(),
            raw               = EXCLUDED.raw;

        v_combos_n := v_combos_n + 1;
    END LOOP;

    -- A FULL delivery is the whole catalogue, so anything it did not mention no
    -- longer exists over there. Deactivate rather than delete: a retired SKU is
    -- still the cost of a bill that was sold last month, and deleting it would
    -- silently un-cost history. A PARTIAL delivery (the default) touches only
    -- what it carried.
    IF v_full AND v_products_n > 0 THEN
        UPDATE erp_products SET active = FALSE, synced_at = NOW()
         WHERE active AND NOT (item_code = ANY (v_codes));
        GET DIAGNOSTICS v_retired_p = ROW_COUNT;
    END IF;
    IF v_full AND v_combos_n > 0 THEN
        UPDATE erp_sofa_combos SET deleted_at = NOW(), synced_at = NOW()
         WHERE deleted_at IS NULL AND NOT (erp_id = ANY (v_ids));
        GET DIAGNOSTICS v_retired_c = ROW_COUNT;
    END IF;

    RETURN JSONB_BUILD_OBJECT(
        'status',          'applied',
        'products',        v_products_n,
        'combos',          v_combos_n,
        'retiredProducts', v_retired_p,
        'retiredCombos',   v_retired_c,
        'full',            v_full,
        'snapshotAt',      v_snapshot);
END;
$fn$;

COMMENT ON FUNCTION ingest_erp_products(JSONB) IS
    'Upserts one SKU-master / combo-pricing delivery from the Houzs ERP. `full: true` also deactivates anything the delivery did not mention. Called only by the service role from /api/erp/v1/products.';

-- ── 6. RLS ──────────────────────────────────────────────────────────────────
-- Cost is confidential on the ERP side (director + Purchasing) and stays so
-- here: the mirror is readable by whoever may see the Product List, and
-- writable by nobody through a session — only the service role, which bypasses
-- RLS, and only from the receiver.
ALTER TABLE erp_products    ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_sofa_combos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_products_read    ON erp_products;
DROP POLICY IF EXISTS erp_sofa_combos_read ON erp_sofa_combos;

CREATE POLICY erp_products_read ON erp_products
    FOR SELECT TO authenticated
    USING ((SELECT has_scope(ARRAY['product_list'])));

CREATE POLICY erp_sofa_combos_read ON erp_sofa_combos
    FOR SELECT TO authenticated
    USING ((SELECT has_scope(ARRAY['product_list'])));

-- ── 7. Re-cost what is already here ─────────────────────────────────────────
-- Re-runs the resolver over a month's lines and reports what moved, WITHOUT
-- touching the ERP's own stamped costs — `erp_line` is the ERP's answer and
-- outranks anything derived here. Returns a summary; pass p_apply => FALSE to
-- see the effect first, which is how this should be read before it is run.
CREATE OR REPLACE FUNCTION erp_recost_month(p_period DATE, p_apply BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_result JSONB;
BEGIN
    -- Summarise BEFORE writing, so `costWas` means the same thing whether or
    -- not the write runs. Reading it after the UPDATE would report the new
    -- value as the old one — the "check that answers a different question".
    SELECT JSONB_BUILD_OBJECT(
        'period',          p_period,
        'applied',         p_apply,
        'linesConsidered', COUNT(*),
        'nowCosted',       COUNT(*) FILTER (WHERE new_cost IS NOT NULL),
        'stillUncosted',   COUNT(*) FILTER (WHERE new_cost IS NULL),
        'fromSkuMaster',   COUNT(*) FILTER (WHERE new_source = 'sku_master'),
        'fromProductList', COUNT(*) FILTER (WHERE new_source = 'product_list'),
        'costWas',         COALESCE(ROUND(SUM(COALESCE(old_cost, 0)), 2), 0),
        'costBecomes',     COALESCE(ROUND(SUM(COALESCE(new_cost, 0)), 2), 0))
      INTO v_result
      FROM (
        SELECT l.cost_amount AS old_cost,
               CASE WHEN r.unit_cost IS NULL THEN NULL
                    ELSE ROUND(r.unit_cost * l.qty, 2) END AS new_cost,
               r.cost_source AS new_source
          FROM sales_order_lines l
          JOIN sales_orders o ON o.id = l.order_id
          LEFT JOIN LATERAL erp_resolve_unit_cost(l.product_code) r ON TRUE
         WHERE o.period_month = p_period
           AND NOT o.cancelled
           AND COALESCE((l.raw->>'cost')::NUMERIC, 0) <= 0
      ) s;

    IF p_apply THEN
        WITH resolved AS (
            SELECT l.id AS line_id,
                   CASE WHEN r.unit_cost IS NULL THEN NULL
                        ELSE ROUND(r.unit_cost * l.qty, 2) END AS new_cost,
                   r.cost_source AS new_source
              FROM sales_order_lines l
              JOIN sales_orders o ON o.id = l.order_id
              LEFT JOIN LATERAL erp_resolve_unit_cost(l.product_code) r ON TRUE
             WHERE o.period_month = p_period
               AND NOT o.cancelled
               -- The ERP's own stamped cost is never overwritten.
               AND COALESCE((l.raw->>'cost')::NUMERIC, 0) <= 0
        )
        UPDATE sales_order_lines l
           SET cost_amount = res.new_cost,
               cost_source = res.new_source
          FROM resolved res
         WHERE l.id = res.line_id
           AND (l.cost_amount IS DISTINCT FROM res.new_cost
                OR l.cost_source IS DISTINCT FROM res.new_source);
    END IF;

    RETURN v_result;
END;
$fn$;

COMMENT ON FUNCTION erp_recost_month(DATE, BOOLEAN) IS
    'Re-resolves the cost of every line in a month that the ERP did not cost itself, through erp_resolve_unit_cost. p_apply FALSE reports what would change; TRUE writes it. Never overwrites a cost the ERP stamped on the sale.';

-- ── 8. The provenance of what is already here ───────────────────────────────
-- A line whose cost_amount is 0 gets NULL, not 'erp_line'. The ERP did send a
-- zero for it — but recording that as a source would launder a guess into a
-- fact, and this column exists so a margin can be argued with.
--
-- MEASURED after this ran (2,756 lines, Aug + Sep 2026):
--   erp_line      513 lines   RM 273,047
--   product_list  281 lines   RM 421,290
--   NULL        1,962 lines   —      of which 1,720 are carrying a fake RM 0.00
UPDATE sales_order_lines l
   SET cost_source = CASE
         WHEN COALESCE((l.raw->>'cost')::NUMERIC, 0) > 0 THEN 'erp_line'
         WHEN COALESCE(l.cost_amount, 0) > 0             THEN 'product_list'
         ELSE NULL END
 WHERE l.cost_source IS DISTINCT FROM (CASE
         WHEN COALESCE((l.raw->>'cost')::NUMERIC, 0) > 0 THEN 'erp_line'
         WHEN COALESCE(l.cost_amount, 0) > 0             THEN 'product_list'
         ELSE NULL END);

-- ── 9. The costing gaps — the work list, sorted by what it is worth ─────────
-- The contract's §7.2 asked for exactly this: "item codes the ERP priced but
-- costed 0, grouped and sorted by value, with line counts. That turns '230
-- codes' into a work list of roughly 40 codes covering RM 2.66M, most of which
-- belong back in the ERP."
--
-- An RPC rather than a view because the answer is a GROUP BY over every line of
-- a window, and PostgREST would page the underlying rows at 1,000 — the same
-- silent truncation that has already bitten this codebase twice (the Open Bill
-- `.in()` of 507 ids, and the Comm Cal panel counting a 1,000-row sample).
--
-- IT AGGREGATES BEFORE IT ASKS WHICH LIST HOLDS EACH CODE, and that ordering is
-- the whole performance of it. The first version joined both lists to the LINES
-- and timed out at the 8s PostgREST ceiling. MEASURED on production,
-- `EXPLAIN (ANALYZE, BUFFERS)`, 2026-09-17:
--
--   Nested Loop Left Join  (actual time=53..8300 rows=1950)
--     Join Filter: (upper(btrim(cp.item_code)) = … OR upper(btrim(coalesce(
--                   cp.erp_item_code,''))) = …)
--     Rows Removed by Join Filter: 3,027,195
--     ->  Materialize -> Seq Scan on comm_products (1,553 rows, 1,950 loops)
--   Execution Time: 8302.358 ms
--
-- The OR in the override join is what does it: Postgres cannot make a hash join
-- out of an OR, so it compared all 1,950 lines against all 1,553 override rows
-- and evaluated four upper(btrim(…)) calls per pair — 3.03 MILLION of them. The
-- `erp_products` side was never the problem; it index-scans and memoizes.
--
-- Membership is a question about a CODE, not a line, and 1,950 lines carry 205
-- distinct codes. Asking once per code removes 90% of the work before any index
-- helps; the two functional indexes below then make each of those 205 questions
-- a probe instead of a scan. **8,302 ms → 105 ms**, both measured the same way.
CREATE INDEX IF NOT EXISTS comm_products_code_lookup_idx
    ON comm_products (UPPER(BTRIM(item_code))) WHERE is_active;
CREATE INDEX IF NOT EXISTS comm_products_erp_code_lookup_idx
    ON comm_products (UPPER(BTRIM(erp_item_code))) WHERE is_active AND erp_item_code IS NOT NULL;

CREATE OR REPLACE FUNCTION revenue_costing_gaps(p_from DATE, p_to DATE)
RETURNS TABLE (
    item_code       TEXT,
    item_group      TEXT,
    product_name    TEXT,
    brand_code      TEXT,
    lines           BIGINT,
    bills           BIGINT,
    qty             NUMERIC,
    revenue         NUMERIC,
    in_sku_master   BOOLEAN,
    in_product_list BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    WITH gaps AS (
        SELECT l.product_code                       AS item_code,
               MIN(l.item_group)                    AS item_group,
               MIN(l.product_name)                  AS product_name,
               MIN(l.brand_code)                    AS brand_code,
               COUNT(*)                             AS lines,
               COUNT(DISTINCT l.order_id)           AS bills,
               ROUND(SUM(l.qty), 3)                 AS qty,
               ROUND(SUM(l.line_amount), 2)         AS revenue
          FROM sales_order_lines l
          JOIN sales_orders o ON o.id = l.order_id
         WHERE o.order_date >= p_from
           AND o.order_date <  p_to
           AND NOT o.cancelled
           AND l.cost_source IS NULL      -- nothing could cost this line
         GROUP BY l.product_code
    )
    SELECT g.item_code, g.item_group, g.product_name, g.brand_code,
           g.lines, g.bills, g.qty, g.revenue,
           EXISTS (SELECT 1 FROM erp_products p
                    WHERE UPPER(BTRIM(p.item_code)) = UPPER(BTRIM(g.item_code))),
           EXISTS (SELECT 1 FROM comm_products cp
                    WHERE cp.is_active
                      AND (UPPER(BTRIM(cp.item_code)) = UPPER(BTRIM(g.item_code))
                        OR UPPER(BTRIM(cp.erp_item_code)) = UPPER(BTRIM(g.item_code))))
      FROM gaps g
     ORDER BY g.revenue DESC, g.lines DESC;
$fn$;

COMMENT ON FUNCTION revenue_costing_gaps(DATE, DATE) IS
    'Item codes sold in a window that nothing could cost (cost_source IS NULL), grouped and sorted by the revenue they carried. Aggregates BEFORE asking which list holds each code: the membership question is about a code, not a line, and asking per line cost 8.3s against the 8s PostgREST ceiling.';

GRANT EXECUTE ON FUNCTION revenue_costing_gaps(DATE, DATE) TO authenticated;

-- ═══ DOWN ════════════════════════════════════════════════════════════════════
-- Run as one statement to reverse everything above. Dropping the mirror cannot
-- lose anything the ERP cannot re-push; `cost_source` is additive and its loss
-- costs only provenance, not money.
--
-- DROP FUNCTION IF EXISTS revenue_costing_gaps(DATE, DATE);
-- DROP INDEX IF EXISTS comm_products_code_lookup_idx;
-- DROP INDEX IF EXISTS comm_products_erp_code_lookup_idx;
-- DROP FUNCTION IF EXISTS erp_recost_month(DATE, BOOLEAN);
-- DROP FUNCTION IF EXISTS ingest_erp_products(JSONB);
-- DROP FUNCTION IF EXISTS erp_resolve_unit_cost(TEXT, TEXT, TEXT);
-- DROP FUNCTION IF EXISTS erp_combo_slots_key(JSONB);
-- ALTER TABLE sales_order_lines DROP CONSTRAINT IF EXISTS sales_order_lines_cost_source_valid;
-- ALTER TABLE sales_order_lines DROP COLUMN IF EXISTS cost_source;
-- DROP TABLE IF EXISTS erp_sofa_combos;
-- DROP TABLE IF EXISTS erp_products;
