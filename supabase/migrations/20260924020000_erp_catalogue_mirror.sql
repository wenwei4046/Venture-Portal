-- ════════════════════════════════════════════════════════════════════════════
-- The Houzs ERP's catalogue, mirrored — ITEMS ONLY (2026-09-24)
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THE USER ASKED FOR (2026-09-24), in order:
--
--   1. 所有镜像功能只同步 item，不同步价钱与 costing。价钱由我这边填 —
--      the mirror carries ITEMS. It never carries a price or a cost. Every
--      figure a margin is measured against is typed in the portal.
--   2. SKU Master — every item, kept in step: a SKU the ERP adds appears here.
--   3. Modular — the ERP's models and their allowed options, exactly; and the
--      portal's OWN ticks on top ("Modular 是独立的"), which decide what the
--      Revenue calculator's dropdowns may offer. Ten SKUs over there, seven
--      ticked here: the calculator offers seven.
--   4. Maintenance — Bedframe (divan / total / gap / leg / specials), Sofa
--      (seat sizes / leg / specials) and Fabrics. NOT the "Products
--      Maintenance" pools (bedframe & mattress sizes, compartments, brandings,
--      supplier categories), NOT Variants, Fabric Converter or Categories.
--   5. Sofa Combo — the combos, kept in step; their price is the portal's.
--
-- SO THE SCHEMA SPLITS IN TWO, and the split is the rule:
--
--   erp_*        what the ERP says EXISTS. Written only by the receiver's
--                ingest, never through a session. A delivery overwrites it.
--   catalogue_*  what the PORTAL decides: the price every margin is measured
--                against, which models and options the calculator offers,
--                what may ride a quote as a gift. Keyed to the mirror and
--                never touched by a delivery, so a re-push cannot erase a
--                price somebody typed.
--
-- `erp_products` and `erp_sofa_combos` were created on 2026-09-19 carrying the
-- ERP's cost fields (`cost_price`, `base_price`, `price_1`, `sell_price`, the
-- seat-height cost grid, the combo cost/selling grids). No delivery ever
-- arrived — both tables are empty, and the guard below proves it before this
-- reshapes them. The money columns stay for ONE release, NULL and unwritten,
-- only so the Product List page already deployed keeps loading until this
-- branch replaces it; `20260924030000` drops them.
--
-- NOTHING HERE CHANGES WHAT ANY BILL COSTS. The cost chain, the fill trigger,
-- the recost and the member calculator all read what they read before. The
-- switch to the portal's own prices is `20260924030000`, so the mirror can be
-- filled and the adopted prices checked before a single margin moves.
--
-- Reversal: the DOWN block at the foot, as one statement.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0. The two tables being reshaped have never held a row ──────────────────
DO $guard$
BEGIN
    IF EXISTS (SELECT 1 FROM erp_products) OR EXISTS (SELECT 1 FROM erp_sofa_combos) THEN
        RAISE EXCEPTION 'erp_products / erp_sofa_combos hold rows; this migration reshapes them and assumes they are empty';
    END IF;
END
$guard$;

-- The v1 ingest wrote ERP money into the mirror. It goes with its payload.
DROP FUNCTION IF EXISTS ingest_erp_products(JSONB);

-- ── 1. SKU Master — scm.mfg_products ────────────────────────────────────────
-- Keyed on the ERP's own id, not the code: the ERP renames codes in place
-- (Maintenance's compartment-rename cascade rewrites SKU codes on every
-- document), and a price keyed on the code would be orphaned by the first
-- rename. A sales line still carries the code, so the code is indexed for the
-- lookup — case-folded, because `8030-Console` and `8030-CONSOLE` are two rows
-- over there.
ALTER TABLE erp_products DROP CONSTRAINT IF EXISTS erp_products_pkey;
ALTER TABLE erp_products ALTER COLUMN erp_id SET NOT NULL;
ALTER TABLE erp_products ADD PRIMARY KEY (erp_id);

ALTER TABLE erp_products
    ADD COLUMN IF NOT EXISTS vp_id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS erp_company_id BIGINT      NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS detail         TEXT,
    ADD COLUMN IF NOT EXISTS model_erp_id   UUID,
    ADD COLUMN IF NOT EXISTS size_code      TEXT,
    ADD COLUMN IF NOT EXISTS size_label     TEXT,
    ADD COLUMN IF NOT EXISTS branding       TEXT,
    ADD COLUMN IF NOT EXISTS fabric_color   TEXT,
    ADD COLUMN IF NOT EXISTS erp_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS removed_at     TIMESTAMPTZ;

-- The portal's own id for a SKU: the member calculator's cart lines carry a
-- uuid, and the ERP's is `mfg-…` text.
CREATE UNIQUE INDEX IF NOT EXISTS erp_products_vp_id_uq ON erp_products (vp_id);
CREATE INDEX IF NOT EXISTS erp_products_model_idx ON erp_products (model_erp_id) WHERE model_erp_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS erp_products_company_code_idx
    ON erp_products (erp_company_id, UPPER(BTRIM(item_code)));

COMMENT ON TABLE erp_products IS
    'Mirror of the Houzs ERP SKU master (scm.mfg_products): ITEMS ONLY — no price, no cost. Written by ingest_erp_catalogue from POST /api/erp/v1/products; the portal''s own price for a SKU is catalogue_skus. removed_at = a full delivery stopped carrying it (kept, never deleted: a retired SKU is still what a past bill sold).';
COMMENT ON COLUMN erp_products.description IS 'mfg_products.name — the DESCRIPTION column on the ERP''s SKU Master screen.';
COMMENT ON COLUMN erp_products.detail IS 'mfg_products.description — the long text, rarely set.';
COMMENT ON COLUMN erp_products.module_code IS 'SOFA only: the module after the first dash (8030-1A(LHF) → 1A(LHF)), the vocabulary combos are written in.';
COMMENT ON COLUMN erp_products.first_seen_at IS 'When a delivery first carried this SKU — how the Product List marks what the ERP added since.';
COMMENT ON COLUMN erp_products.cost_price IS 'RETIRED 2026-09-24 — the mirror carries no ERP money. Always NULL; dropped by 20260924030000.';
COMMENT ON COLUMN erp_products.base_price IS 'RETIRED 2026-09-24 — see cost_price.';
COMMENT ON COLUMN erp_products.price_1 IS 'RETIRED 2026-09-24 — see cost_price.';
COMMENT ON COLUMN erp_products.sell_price IS 'RETIRED 2026-09-24 — see cost_price.';
COMMENT ON COLUMN erp_products.seat_height_costs IS 'RETIRED 2026-09-24 — see cost_price.';

-- ── 2. Modular — scm.product_models ─────────────────────────────────────────
-- A model groups its SKUs (8030 SOFFIO → 17 module SKUs; 1025 → six sizes) and
-- carries the ERP's allowed options, verbatim: compartments / sizes / leg
-- heights / specials for a sofa, sizes / divan / total / gaps / leg / specials
-- for a bed frame, sizes for a mattress. The portal's own ticks are
-- catalogue_models + catalogue_skus.
CREATE TABLE IF NOT EXISTS erp_product_models (
    erp_id          UUID        PRIMARY KEY,
    erp_company_id  BIGINT      NOT NULL DEFAULT 1,
    model_code      TEXT        NOT NULL,
    name            TEXT,
    category        TEXT,
    branding        TEXT,
    description     TEXT,
    active          BOOLEAN     NOT NULL DEFAULT TRUE,
    allowed_options JSONB       NOT NULL DEFAULT '{}'::JSONB,
    erp_updated_at  TIMESTAMPTZ,
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    removed_at      TIMESTAMPTZ,
    raw             JSONB
);

CREATE INDEX IF NOT EXISTS erp_product_models_category_idx ON erp_product_models (erp_company_id, category);

COMMENT ON TABLE erp_product_models IS
    'Mirror of the ERP''s Modular tab (scm.product_models) with its allowed_options verbatim. The portal''s own decisions per model are catalogue_models.';

-- ── 3. Maintenance — the Bedframe and Sofa pools ────────────────────────────
-- One row per (pool, value). Six pools live in the ERP's effective-dated
-- maintenance_config_history JSON, the two specials pools in its
-- scm.special_addons table; both arrive here stripped of their RM figures,
-- which in the ERP are the COST surcharge (`priceSen`, "这些价钱都是 costing").
-- The portal's own surcharge per option is catalogue_option_prices.
CREATE TABLE IF NOT EXISTS erp_maintenance_options (
    erp_company_id  BIGINT      NOT NULL DEFAULT 1,
    pool            TEXT        NOT NULL,
    value           TEXT        NOT NULL,
    label           TEXT,
    sort_order      INTEGER     NOT NULL DEFAULT 0,
    active          BOOLEAN     NOT NULL DEFAULT TRUE,
    erp_id          TEXT,
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    removed_at      TIMESTAMPTZ,
    raw             JSONB,
    PRIMARY KEY (erp_company_id, pool, value),
    CONSTRAINT erp_maintenance_options_pool_valid CHECK (pool IN (
        'bedframe_divan_heights', 'bedframe_total_heights', 'bedframe_gaps',
        'bedframe_leg_heights', 'bedframe_specials',
        'sofa_sizes', 'sofa_leg_heights', 'sofa_specials'))
);

COMMENT ON TABLE erp_maintenance_options IS
    'Mirror of the ERP''s Maintenance pools (Bedframe: divan / total / gaps / leg / specials; Sofa: sizes / leg / specials) — the option values only, never the RM. The portal''s surcharge per option is catalogue_option_prices.';

-- ── 4. Fabrics — scm.fabric_trackings ───────────────────────────────────────
-- Its tier (PRICE_1 / 2 / 3) is what a sofa module and a bed frame are costed
-- at, so it travels; its price per metre and its stock do not.
CREATE TABLE IF NOT EXISTS erp_fabrics (
    erp_company_id  BIGINT      NOT NULL DEFAULT 1,
    erp_id          TEXT        NOT NULL,
    fabric_code     TEXT        NOT NULL,
    description     TEXT,
    category        TEXT,
    series          TEXT,
    sofa_tier       TEXT,
    bedframe_tier   TEXT,
    price_tier      TEXT,
    active          BOOLEAN     NOT NULL DEFAULT TRUE,
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    removed_at      TIMESTAMPTZ,
    raw             JSONB,
    PRIMARY KEY (erp_company_id, erp_id)
);

CREATE INDEX IF NOT EXISTS erp_fabrics_code_idx ON erp_fabrics (erp_company_id, UPPER(BTRIM(fabric_code)));

COMMENT ON TABLE erp_fabrics IS
    'Mirror of the ERP''s fabric list (scm.fabric_trackings): code, series and the PRICE_1/2/3 tier it costs a sofa or bed frame at. No price per metre, no stock.';

-- ── 5. Sofa Combo — scm.sofa_combo_pricing, the definitions ─────────────────
-- Append-only and effective-dated over there: an edit INSERTs a fresher row.
-- Mirrored the same way — `erp_id` is the ROW — and a combo's identity is
-- (base model, slot-set, tier), which is what the portal's price is keyed on
-- so an edit over there cannot orphan a price typed here. Only the sales-side
-- master rows travel (no customer, no supplier).
ALTER TABLE erp_sofa_combos
    ADD COLUMN IF NOT EXISTS erp_company_id BIGINT      NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS heights        TEXT[]      NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS erp_created_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS removed_at     TIMESTAMPTZ;

COMMENT ON TABLE erp_sofa_combos IS
    'Mirror of the ERP''s Combo Pricing (scm.sofa_combo_pricing), sales-side master rows only, DEFINITIONS only: base model, slots, tier, label and which seat heights it is offered at. The portal''s price per height is catalogue_combo_prices, keyed on (base_model, slots_key, tier).';
COMMENT ON COLUMN erp_sofa_combos.heights IS 'The seat heights the ERP offers this combo at — the keys of its price grid, never the values.';
COMMENT ON COLUMN erp_sofa_combos.cost_by_height IS 'RETIRED 2026-09-24 — the mirror carries no ERP money. Always {}; dropped by 20260924030000.';
COMMENT ON COLUMN erp_sofa_combos.selling_by_height IS 'RETIRED 2026-09-24 — see cost_by_height.';

-- ══ The portal's own decisions ══════════════════════════════════════════════

-- ── 6. A SKU: its price, and whether the calculator may offer it ────────────
-- `price` is the one figure a mattress, bed frame or accessory is costed at;
-- `price_grid` is a sofa module's [{height, tier, price}] — the shape the ERP
-- prices a module in (seat height × fabric tier), so the calculator and the
-- run can cost a sofa the way the ERP builds one.
--
-- `offered` is the Modular tick: a SKU the ERP adds arrives UNticked, and the
-- calculator never offers what nobody here decided to offer.
CREATE TABLE IF NOT EXISTS catalogue_skus (
    erp_product_id  TEXT          PRIMARY KEY REFERENCES erp_products (erp_id),
    offered         BOOLEAN       NOT NULL DEFAULT FALSE,
    price           NUMERIC(15, 2),
    price_grid      JSONB,
    adopted_from    UUID,
    note            TEXT,
    updated_by      UUID          DEFAULT auth.uid(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT catalogue_skus_price_non_negative CHECK (price IS NULL OR price >= 0),
    CONSTRAINT catalogue_skus_grid_is_array CHECK (price_grid IS NULL OR jsonb_typeof(price_grid) = 'array')
);

COMMENT ON TABLE catalogue_skus IS
    'The portal''s own decisions per ERP SKU: the price every margin is measured against (flat, or a sofa module''s [{height, tier, price}] grid) and whether the Revenue calculator may offer it. Never written by a delivery. adopted_from = the comm_products row it was carried over from on first sight.';

-- ── 7. A model: whether it is offered, and which of its options ─────────────
-- `enabled` has the ERP's allowed_options shape for the option pools that are
-- NOT SKUs — a sofa's seat sizes, leg heights and specials; a bed frame's
-- divan / total / gap / leg heights and specials. Which SKUs (a sofa's
-- compartments, a bed frame's or mattress's sizes) is catalogue_skus.offered.
-- `gift`, `calc_category` and `brand_code` are overrides; NULL means derived
-- (catalogue_brand_of / catalogue_calc_category / catalogue_default_gift).
CREATE TABLE IF NOT EXISTS catalogue_models (
    erp_model_id    UUID          PRIMARY KEY REFERENCES erp_product_models (erp_id),
    offered         BOOLEAN       NOT NULL DEFAULT FALSE,
    enabled         JSONB         NOT NULL DEFAULT '{}'::JSONB,
    gift            BOOLEAN,
    calc_category   TEXT,
    brand_code      TEXT,
    updated_by      UUID          DEFAULT auth.uid(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT catalogue_models_enabled_is_object CHECK (jsonb_typeof(enabled) = 'object'),
    CONSTRAINT catalogue_models_calc_category_valid CHECK (calc_category IS NULL OR calc_category IN (
        'Mattress', 'Bed frame', 'Sofa', 'Pillow', 'Protector', 'Accessory', 'Other'))
);

COMMENT ON TABLE catalogue_models IS
    'The portal''s Modular ticks per ERP model: offered in the Revenue calculator or not, and which non-SKU options (seat sizes, leg heights, specials, divan / total / gap heights) its dropdowns may show. Independent of the ERP''s own allowed_options, which only say what exists.';

-- ── 8. An option's surcharge ────────────────────────────────────────────────
-- A price may be negative: the ERP's "No Side Panel" takes RM 40 off.
CREATE TABLE IF NOT EXISTS catalogue_option_prices (
    erp_company_id  BIGINT        NOT NULL DEFAULT 1,
    pool            TEXT          NOT NULL,
    value           TEXT          NOT NULL,
    price           NUMERIC(15, 2) NOT NULL,
    updated_by      UUID          DEFAULT auth.uid(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (erp_company_id, pool, value),
    FOREIGN KEY (erp_company_id, pool, value) REFERENCES erp_maintenance_options (erp_company_id, pool, value)
);

COMMENT ON TABLE catalogue_option_prices IS
    'The portal''s own surcharge for a Maintenance option (a divan height, a leg height, a special) — what choosing it adds to the cost a margin is measured against.';

-- ── 9. A combo's price per seat height ──────────────────────────────────────
-- `tier` '' = any tier (the ERP's NULL), so the key is total.
CREATE TABLE IF NOT EXISTS catalogue_combo_prices (
    erp_company_id  BIGINT        NOT NULL DEFAULT 1,
    base_model      TEXT          NOT NULL,
    slots_key       TEXT          NOT NULL,
    tier            TEXT          NOT NULL DEFAULT '',
    price_by_height JSONB         NOT NULL DEFAULT '{}'::JSONB,
    updated_by      UUID          DEFAULT auth.uid(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (erp_company_id, base_model, slots_key, tier),
    CONSTRAINT catalogue_combo_prices_is_object CHECK (jsonb_typeof(price_by_height) = 'object'),
    CONSTRAINT catalogue_combo_prices_tier_valid CHECK (tier IN ('', 'PRICE_1', 'PRICE_2', 'PRICE_3'))
);

COMMENT ON TABLE catalogue_combo_prices IS
    'The portal''s price for a sofa combo, per seat height: {"24": 3200, "30": 3500}. A build that covers the combo''s slots is costed at this instead of adding its modules up — the ERP''s own rule (the combo always wins, spread across the matched lines).';

-- ══ Derived facts ═══════════════════════════════════════════════════════════

-- ── 10. Which brand's margin ladder a model sells under ─────────────────────
-- Only a mattress or a sofa carries a brand. A bed frame, an accessory and
-- everything else is a RIDER (user 2026-09-12): it joins any cart and the
-- mattress or sofa in it decides the ladder — even where the ERP writes a
-- branding on it ("AKEMI -PEBBLE GREY" bed frame, 112 bed frames branded
-- "BEDFRAME"). The ERP's branding is mapped through the scheme's brands, so
-- DUNLOPILLO lands on DUNLOP by the brand's name, as the sales feed maps it.
CREATE OR REPLACE FUNCTION catalogue_brand_of(p_category TEXT, p_model_branding TEXT, p_sku_branding TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT CASE WHEN UPPER(BTRIM(COALESCE(p_category, ''))) IN ('MATTRESS', 'SOFA')
                THEN COALESCE(erp_sync_brand_code(NULLIF(BTRIM(p_model_branding), '')),
                              erp_sync_brand_code(NULLIF(BTRIM(p_sku_branding), '')))
           END;
$fn$;

-- ── 11. Which calculator section a model belongs to ─────────────────────────
-- The ERP files pillows and protectors under ACCESSORY with the stools and
-- consoles; the calculator suggests pillows as gifts, so it needs them apart.
CREATE OR REPLACE FUNCTION catalogue_calc_category(p_category TEXT, p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT CASE UPPER(BTRIM(COALESCE(p_category, '')))
        WHEN 'MATTRESS'  THEN 'Mattress'
        WHEN 'BEDFRAME'  THEN 'Bed frame'
        WHEN 'SOFA'      THEN 'Sofa'
        WHEN 'ACCESSORY' THEN CASE WHEN COALESCE(p_name, '') ~* 'PROTECTOR' THEN 'Protector'
                                   WHEN COALESCE(p_name, '') ~* 'PILLOW'    THEN 'Pillow'
                                   ELSE 'Accessory' END
        WHEN 'FABRIC_ACCESSORY' THEN 'Accessory'
        ELSE 'Other'
    END;
$fn$;

-- Accessories were gift-eligible on the old Product List without exception
-- (116 of 116); nothing else was.
CREATE OR REPLACE FUNCTION catalogue_default_gift(p_calc_category TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT COALESCE(p_calc_category, '') IN ('Pillow', 'Protector', 'Accessory');
$fn$;

-- The comparison key for a code: case, surrounding space and runs of space
-- folded. Nothing else — `AK-` and `AKEMI ` stay different words.
CREATE OR REPLACE FUNCTION catalogue_code_key(p_code TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT UPPER(REGEXP_REPLACE(BTRIM(COALESCE(p_code, '')), '\s+', ' ', 'g'));
$fn$;

-- ══ Carrying the old Product List over ══════════════════════════════════════

-- ── 12. Adopt what the old Product List already knew ───────────────────────
-- 1,553 products were keyed into comm_products by hand on 2026-09-12 — 777 of
-- them with a cost, 289 sofa modules with a seat-height × tier grid, 1,066
-- ticked available in the calculator — from supplier price lists the ERP
-- never had (the Ergotex +25% column among them). That is the portal's own
-- pricing, which is exactly what this mirror is not allowed to overwrite, so
-- the FIRST time a SKU arrives it inherits the old row that names it, and
-- never again: once a catalogue_skus row exists, only a person changes it.
--
-- A code matches its ERP bridge (`erp_item_code`, the 37 AKEMI rows) first,
-- then its own code, both case- and space-folded. Nothing fuzzier: a wrong
-- match here is a wrong price on somebody's margin.
CREATE OR REPLACE FUNCTION catalogue_adopt_legacy(p_company BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_skus   INTEGER := 0;
    v_models INTEGER := 0;
BEGIN
    -- Keys computed ONCE per side and joined on equality, twice, rather than
    -- one join on `a = x OR b = x`: an OR cannot become a hash join, and that
    -- shape already cost this codebase an 8.3-second query (20260919010000
    -- §9) — here it would be 2,400 × 1,553 pairs of regex calls.
    WITH legacy AS (
        SELECT cp.id, cp.unit_cost, cp.cost_grid, cp.is_active, cp.updated_at,
               catalogue_code_key(cp.erp_item_code) AS erp_key,
               catalogue_code_key(cp.item_code)     AS own_key,
               cp.is_active AND COALESCE(o.available, FALSE) AS offered,
               (cp.unit_cost IS NOT NULL
                OR jsonb_array_length(CASE WHEN jsonb_typeof(cp.cost_grid) = 'array'
                                           THEN cp.cost_grid ELSE '[]'::JSONB END) > 0) AS has_price
          FROM comm_products cp
          LEFT JOIN member_product_options o ON o.product_id = cp.id
    ), fresh AS (
        SELECT e.erp_id, catalogue_code_key(e.item_code) AS code_key
          FROM erp_products e
         WHERE e.erp_company_id = p_company
           AND NOT EXISTS (SELECT 1 FROM catalogue_skus s WHERE s.erp_product_id = e.erp_id)
    ), matched AS (
        SELECT f.erp_id, l.*, 1 AS via FROM fresh f JOIN legacy l ON l.erp_key = f.code_key WHERE l.erp_key <> ''
        UNION ALL
        SELECT f.erp_id, l.*, 2 AS via FROM fresh f JOIN legacy l ON l.own_key = f.code_key
    ), candidates AS (
        SELECT DISTINCT ON (m.erp_id)
               m.erp_id, m.id AS legacy_id, m.unit_cost, m.cost_grid, m.offered
          FROM matched m
         ORDER BY m.erp_id, m.via, m.is_active DESC, m.has_price DESC, m.updated_at DESC
    )
    INSERT INTO catalogue_skus (erp_product_id, offered, price, price_grid, adopted_from, note, updated_by, updated_at)
    SELECT c.erp_id,
           c.offered,
           c.unit_cost,
           -- comm_products.cost_grid is [{height, tier, cost}]; the catalogue
           -- says `price`. Cells without a usable figure are dropped, never
           -- carried as a zero.
           NULLIF((SELECT jsonb_agg(jsonb_build_object(
                                 'height', cell->>'height',
                                 'tier',   cell->>'tier',
                                 'price',  (cell->>'cost')::NUMERIC)
                             ORDER BY cell->>'height', cell->>'tier')
                     FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.cost_grid) = 'array'
                                                    THEN c.cost_grid ELSE '[]'::JSONB END) cell
                    WHERE NULLIF(cell->>'height', '') IS NOT NULL
                      AND NULLIF(cell->>'tier', '') IS NOT NULL
                      AND (cell->>'cost') ~ '^\d+(\.\d+)?$'), '[]'::JSONB),
           c.legacy_id,
           'Carried over from the old Product List',
           NULL,
           NOW()
      FROM candidates c
    ON CONFLICT (erp_product_id) DO NOTHING;
    GET DIAGNOSTICS v_skus = ROW_COUNT;

    -- A model the old list sold from is offered; its gift tick and section
    -- follow the old rows. A sofa's seat sizes are the heights its adopted
    -- grids price — the calculator offered exactly those before, and a size
    -- nobody priced has nothing to cost a module at.
    WITH adopted AS (
        SELECT e.model_erp_id,
               BOOL_OR(s.offered) AS offered,
               BOOL_OR(COALESCE(o.gift, FALSE)) AS gift,
               MODE() WITHIN GROUP (ORDER BY o.category) AS legacy_category,
               ARRAY_REMOVE(ARRAY_AGG(DISTINCT cell->>'height'), NULL) AS heights
          FROM catalogue_skus s
          JOIN erp_products e ON e.erp_id = s.erp_product_id
          LEFT JOIN comm_products cp ON cp.id = s.adopted_from
          LEFT JOIN member_product_options o ON o.product_id = cp.id
          LEFT JOIN LATERAL jsonb_array_elements(COALESCE(s.price_grid, '[]'::JSONB)) cell ON TRUE
         WHERE s.adopted_from IS NOT NULL
           AND e.model_erp_id IS NOT NULL
           AND e.erp_company_id = p_company
         GROUP BY e.model_erp_id
    )
    INSERT INTO catalogue_models (erp_model_id, offered, enabled, gift, calc_category, updated_by, updated_at)
    SELECT a.model_erp_id,
           a.offered,
           CASE WHEN m.category = 'SOFA' AND COALESCE(array_length(a.heights, 1), 0) > 0
                THEN jsonb_build_object('sizes', to_jsonb(a.heights))
                ELSE '{}'::JSONB END,
           a.gift,
           CASE
               WHEN a.legacy_category IS NULL THEN NULL
               WHEN LOWER(a.legacy_category) IN ('mattress', 'mattresses')         THEN 'Mattress'
               WHEN LOWER(a.legacy_category) IN ('bed frame', 'bedframe')          THEN 'Bed frame'
               WHEN LOWER(a.legacy_category) IN ('sofa', 'sofas')                  THEN 'Sofa'
               WHEN LOWER(a.legacy_category) IN ('pillow', 'pillows')              THEN 'Pillow'
               WHEN LOWER(a.legacy_category) IN ('protector', 'protectors')        THEN 'Protector'
               WHEN LOWER(a.legacy_category) IN ('accessory', 'accessories')       THEN 'Accessory'
               ELSE NULL
           END,
           NULL,
           NOW()
      FROM adopted a
      JOIN erp_product_models m ON m.erp_id = a.model_erp_id
    ON CONFLICT (erp_model_id) DO NOTHING;
    GET DIAGNOSTICS v_models = ROW_COUNT;

    RETURN jsonb_build_object('skus', v_skus, 'models', v_models);
END;
$fn$;

COMMENT ON FUNCTION catalogue_adopt_legacy(BIGINT) IS
    'First sight only: a mirrored SKU with no catalogue_skus row inherits the price, grid and calculator tick of the comm_products row that names it (erp_item_code, then item_code, case- and space-folded); its model inherits offered / gift / section and, for a sofa, the seat sizes its grids price. Never overwrites a portal decision.';

-- ══ The receiver's one write path ═══════════════════════════════════════════

-- ── 13. ingest_erp_catalogue ────────────────────────────────────────────────
-- One delivery, one transaction, every section set-based (a catalogue is
-- ~2,400 SKUs; a row-at-a-time loop was the thing to avoid).
--
-- A SECTION the delivery carries is upserted; one it omits is not touched, so
-- the ERP can send the models alone. With `full: true`, a row the section did
-- not mention is marked `removed_at` — never deleted: a retired SKU is still
-- what last month's bill sold, and its price here is still what that bill's
-- margin was measured against. An EMPTY section never retires anything: an
-- empty array from a broken query must not take the catalogue down with it.
--
-- ERP money is stripped from `raw` on the way in, whatever the sender did: the
-- mirror holding no price is the rule this table exists under, and an
-- allowlist on the other side is one edit away from sending one.
CREATE OR REPLACE FUNCTION catalogue_strip_money(p_row JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT CASE WHEN jsonb_typeof(p_row) = 'object'
                THEN p_row - ARRAY[
                    'cost_price_sen', 'base_price_sen', 'price1_sen', 'sell_price_sen', 'pwp_price_sen',
                    'seat_height_prices', 'prices_by_height', 'selling_prices_by_height', 'pwp_prices_by_height',
                    'priceSen', 'costSen', 'sellingPriceSen', 'price', 'price_sen', 'selling_price_sen',
                    'cost_price', 'costPrice', 'basePrice', 'price1', 'sellPrice', 'default_surcharge']
                ELSE p_row END;
$fn$;

CREATE OR REPLACE FUNCTION ingest_erp_catalogue(p_batch JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_company   BIGINT      := COALESCE(NULLIF(p_batch->>'companyId', '')::BIGINT, 1);
    v_full      BOOLEAN     := COALESCE((p_batch->>'full')::BOOLEAN, FALSE);
    v_now       TIMESTAMPTZ := NOW();
    v_result    JSONB       := jsonb_build_object('status', 'applied', 'companyId', v_company, 'full', v_full);
    v_n         INTEGER;
    v_new       INTEGER;
    v_gone      INTEGER;
    v_pool      RECORD;
    v_adopted   JSONB;
BEGIN
    -- ── SKU master ──────────────────────────────────────────────────────────
    IF jsonb_typeof(p_batch->'products') = 'array' THEN
        WITH incoming AS (
            SELECT DISTINCT ON (BTRIM(e->>'id'))
                   BTRIM(e->>'id')                                        AS erp_id,
                   BTRIM(e->>'code')                                      AS item_code,
                   NULLIF(BTRIM(e->>'name'), '')                          AS description,
                   NULLIF(BTRIM(e->>'description'), '')                   AS detail,
                   NULLIF(UPPER(BTRIM(COALESCE(e->>'category', ''))), '') AS category,
                   CASE WHEN (e->>'model_id') ~* '^[0-9a-f-]{36}$' THEN (e->>'model_id')::UUID END AS model_erp_id,
                   NULLIF(BTRIM(e->>'base_model'), '')                    AS base_model,
                   NULLIF(BTRIM(e->>'size_code'), '')                     AS size_code,
                   NULLIF(BTRIM(e->>'size_label'), '')                    AS size_label,
                   NULLIF(BTRIM(e->>'branding'), '')                      AS branding,
                   NULLIF(BTRIM(e->>'barcode'), '')                       AS barcode,
                   NULLIF(BTRIM(e->>'fabric_color'), '')                  AS fabric_color,
                   UPPER(COALESCE(NULLIF(BTRIM(e->>'status'), ''), 'ACTIVE')) = 'ACTIVE' AS active,
                   NULLIF(e->>'updated_at', '')::TIMESTAMPTZ              AS erp_updated_at,
                   catalogue_strip_money(e)                               AS raw
              FROM jsonb_array_elements(p_batch->'products') e
             WHERE NULLIF(BTRIM(e->>'id'), '') IS NOT NULL
               AND NULLIF(BTRIM(e->>'code'), '') IS NOT NULL
             ORDER BY BTRIM(e->>'id')
        ), upserted AS (
            INSERT INTO erp_products (
                erp_id, erp_company_id, item_code, description, detail, category, model_erp_id,
                base_model, module_code, size_code, size_label, size_display, branding, brand_code,
                barcode, fabric_color, active, erp_updated_at, synced_at, removed_at, raw)
            SELECT i.erp_id, v_company, i.item_code, i.description, i.detail, i.category, i.model_erp_id,
                   COALESCE(i.base_model,
                            CASE WHEN POSITION('-' IN i.item_code) > 1
                                 THEN LEFT(i.item_code, POSITION('-' IN i.item_code) - 1)
                                 ELSE i.item_code END),
                   -- `8030-1A(LHF)` → `1A(LHF)`: the ERP's splitSofaCode, first
                   -- dash only, and only a sofa has a module.
                   CASE WHEN i.category = 'SOFA' AND POSITION('-' IN i.item_code) > 1
                        THEN NULLIF(SUBSTRING(i.item_code FROM POSITION('-' IN i.item_code) + 1), '') END,
                   i.size_code, i.size_label, COALESCE(i.size_label, i.size_code),
                   i.branding, UPPER(i.branding),
                   i.barcode, i.fabric_color, i.active, i.erp_updated_at, v_now, NULL, i.raw
              FROM incoming i
            ON CONFLICT (erp_id) DO UPDATE SET
                erp_company_id = EXCLUDED.erp_company_id,
                item_code      = EXCLUDED.item_code,
                description    = EXCLUDED.description,
                detail         = EXCLUDED.detail,
                category       = EXCLUDED.category,
                model_erp_id   = EXCLUDED.model_erp_id,
                base_model     = EXCLUDED.base_model,
                module_code    = EXCLUDED.module_code,
                size_code      = EXCLUDED.size_code,
                size_label     = EXCLUDED.size_label,
                size_display   = EXCLUDED.size_display,
                branding       = EXCLUDED.branding,
                brand_code     = EXCLUDED.brand_code,
                barcode        = EXCLUDED.barcode,
                fabric_color   = EXCLUDED.fabric_color,
                active         = EXCLUDED.active,
                erp_updated_at = EXCLUDED.erp_updated_at,
                synced_at      = EXCLUDED.synced_at,
                removed_at     = NULL,
                raw            = EXCLUDED.raw
            RETURNING (xmax = 0) AS inserted
        )
        SELECT COUNT(*), COUNT(*) FILTER (WHERE inserted) INTO v_n, v_new FROM upserted;

        v_gone := 0;
        IF v_full AND v_n > 0 THEN
            UPDATE erp_products p SET removed_at = v_now, synced_at = v_now
             WHERE p.erp_company_id = v_company
               AND p.removed_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_batch->'products') e
                                WHERE BTRIM(e->>'id') = p.erp_id);
            GET DIAGNOSTICS v_gone = ROW_COUNT;
        END IF;
        v_result := v_result || jsonb_build_object('products', v_n, 'productsNew', v_new, 'productsRemoved', v_gone);
    END IF;

    -- ── Modular ─────────────────────────────────────────────────────────────
    IF jsonb_typeof(p_batch->'models') = 'array' THEN
        WITH incoming AS (
            SELECT DISTINCT ON ((e->>'id')::UUID)
                   (e->>'id')::UUID                                       AS erp_id,
                   BTRIM(e->>'model_code')                                AS model_code,
                   NULLIF(BTRIM(e->>'name'), '')                          AS name,
                   NULLIF(UPPER(BTRIM(COALESCE(e->>'category', ''))), '') AS category,
                   NULLIF(BTRIM(e->>'branding'), '')                      AS branding,
                   NULLIF(BTRIM(e->>'description'), '')                   AS description,
                   COALESCE((e->>'active')::BOOLEAN, TRUE)                AS active,
                   CASE WHEN jsonb_typeof(e->'allowed_options') = 'object'
                        THEN e->'allowed_options' ELSE '{}'::JSONB END    AS allowed_options,
                   NULLIF(e->>'updated_at', '')::TIMESTAMPTZ              AS erp_updated_at,
                   catalogue_strip_money(e)                               AS raw
              FROM jsonb_array_elements(p_batch->'models') e
             WHERE (e->>'id') ~* '^[0-9a-f-]{36}$'
               AND NULLIF(BTRIM(e->>'model_code'), '') IS NOT NULL
             ORDER BY (e->>'id')::UUID
        ), upserted AS (
            INSERT INTO erp_product_models (
                erp_id, erp_company_id, model_code, name, category, branding, description, active,
                allowed_options, erp_updated_at, synced_at, removed_at, raw)
            SELECT i.erp_id, v_company, i.model_code, i.name, i.category, i.branding, i.description,
                   i.active, i.allowed_options, i.erp_updated_at, v_now, NULL, i.raw
              FROM incoming i
            ON CONFLICT (erp_id) DO UPDATE SET
                erp_company_id  = EXCLUDED.erp_company_id,
                model_code      = EXCLUDED.model_code,
                name            = EXCLUDED.name,
                category        = EXCLUDED.category,
                branding        = EXCLUDED.branding,
                description     = EXCLUDED.description,
                active          = EXCLUDED.active,
                allowed_options = EXCLUDED.allowed_options,
                erp_updated_at  = EXCLUDED.erp_updated_at,
                synced_at       = EXCLUDED.synced_at,
                removed_at      = NULL,
                raw             = EXCLUDED.raw
            RETURNING (xmax = 0) AS inserted
        )
        SELECT COUNT(*), COUNT(*) FILTER (WHERE inserted) INTO v_n, v_new FROM upserted;

        v_gone := 0;
        IF v_full AND v_n > 0 THEN
            UPDATE erp_product_models m SET removed_at = v_now, synced_at = v_now
             WHERE m.erp_company_id = v_company
               AND m.removed_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_batch->'models') e
                                WHERE LOWER(BTRIM(e->>'id')) = m.erp_id::TEXT);
            GET DIAGNOSTICS v_gone = ROW_COUNT;
        END IF;
        v_result := v_result || jsonb_build_object('models', v_n, 'modelsNew', v_new, 'modelsRemoved', v_gone);
    END IF;

    -- ── Maintenance pools (from the ERP's config JSON) ──────────────────────
    -- An entry is a plain string (= active) or {value, active, …}; only the
    -- value and the flag are kept. The ERP key → the portal's pool name is the
    -- one mapping below; a key not listed is not one the user asked for.
    IF jsonb_typeof(p_batch->'maintenance'->'pools') = 'object' THEN
        v_n := 0; v_new := 0; v_gone := 0;
        FOR v_pool IN
            SELECT m.erp_key, m.pool, p_batch->'maintenance'->'pools'->m.erp_key AS entries
              FROM (VALUES ('divanHeights',   'bedframe_divan_heights'),
                           ('totalHeights',   'bedframe_total_heights'),
                           ('gaps',           'bedframe_gaps'),
                           ('legHeights',     'bedframe_leg_heights'),
                           ('sofaSizes',      'sofa_sizes'),
                           ('sofaLegHeights', 'sofa_leg_heights')) AS m(erp_key, pool)
             WHERE jsonb_typeof(p_batch->'maintenance'->'pools'->m.erp_key) = 'array'
        LOOP
            WITH incoming AS (
                SELECT DISTINCT ON (val)
                       val, active, ord
                  FROM (SELECT BTRIM(COALESCE(CASE WHEN jsonb_typeof(x.entry) = 'object'
                                                    THEN x.entry->>'value' ELSE x.entry #>> '{}' END, '')) AS val,
                               CASE WHEN jsonb_typeof(x.entry) = 'object'
                                    THEN COALESCE((x.entry->>'active')::BOOLEAN, TRUE) ELSE TRUE END AS active,
                               x.ord
                          FROM jsonb_array_elements(v_pool.entries) WITH ORDINALITY AS x(entry, ord)) s
                 WHERE val <> ''
                 ORDER BY val, ord
            ), upserted AS (
                INSERT INTO erp_maintenance_options (
                    erp_company_id, pool, value, label, sort_order, active, synced_at, removed_at, raw)
                SELECT v_company, v_pool.pool, i.val, i.val, i.ord, i.active, v_now, NULL,
                       jsonb_build_object('value', i.val, 'active', i.active)
                  FROM incoming i
                ON CONFLICT (erp_company_id, pool, value) DO UPDATE SET
                    label      = EXCLUDED.label,
                    sort_order = EXCLUDED.sort_order,
                    active     = EXCLUDED.active,
                    synced_at  = EXCLUDED.synced_at,
                    removed_at = NULL,
                    raw        = EXCLUDED.raw
                RETURNING (xmax = 0) AS inserted
            )
            SELECT v_n + COUNT(*), v_new + COUNT(*) FILTER (WHERE inserted) INTO v_n, v_new FROM upserted;

            IF v_full AND jsonb_array_length(v_pool.entries) > 0 THEN
                WITH gone AS (
                    UPDATE erp_maintenance_options o SET removed_at = v_now, synced_at = v_now
                     WHERE o.erp_company_id = v_company
                       AND o.pool = v_pool.pool
                       AND o.removed_at IS NULL
                       AND NOT EXISTS (
                           SELECT 1 FROM jsonb_array_elements(v_pool.entries) x(entry)
                            WHERE BTRIM(COALESCE(CASE WHEN jsonb_typeof(x.entry) = 'object'
                                                      THEN x.entry->>'value' ELSE x.entry #>> '{}' END, '')) = o.value)
                    RETURNING 1)
                SELECT v_gone + COUNT(*) INTO v_gone FROM gone;
            END IF;
        END LOOP;
        v_result := v_result || jsonb_build_object('maintenanceOptions', v_n, 'maintenanceNew', v_new, 'maintenanceRemoved', v_gone);
    END IF;

    -- ── Specials (scm.special_addons) → one row per category it applies to ─
    IF jsonb_typeof(p_batch->'specials') = 'array' THEN
        WITH incoming AS (
            SELECT DISTINCT ON (pool, val)
                   pool, val, label, active, sort_order, erp_id, raw
              FROM (SELECT CASE UPPER(BTRIM(cat)) WHEN 'BEDFRAME' THEN 'bedframe_specials'
                                                  WHEN 'SOFA'     THEN 'sofa_specials' END AS pool,
                           BTRIM(e->>'code')                                   AS val,
                           COALESCE(NULLIF(BTRIM(e->>'label'), ''), BTRIM(e->>'code')) AS label,
                           COALESCE((e->>'active')::BOOLEAN, TRUE)             AS active,
                           COALESCE(NULLIF(e->>'sort_order', '')::INTEGER, 0)  AS sort_order,
                           NULLIF(BTRIM(e->>'id'), '')                         AS erp_id,
                           catalogue_strip_money(e)                            AS raw
                      FROM jsonb_array_elements(p_batch->'specials') e
                      CROSS JOIN LATERAL jsonb_array_elements_text(
                          CASE WHEN jsonb_typeof(e->'categories') = 'array' THEN e->'categories' ELSE '[]'::JSONB END) cat
                     WHERE NULLIF(BTRIM(e->>'code'), '') IS NOT NULL) s
             WHERE pool IS NOT NULL
             ORDER BY pool, val, active DESC
        ), upserted AS (
            INSERT INTO erp_maintenance_options (
                erp_company_id, pool, value, label, sort_order, active, erp_id, synced_at, removed_at, raw)
            SELECT v_company, i.pool, i.val, i.label, i.sort_order, i.active, i.erp_id, v_now, NULL, i.raw
              FROM incoming i
            ON CONFLICT (erp_company_id, pool, value) DO UPDATE SET
                label      = EXCLUDED.label,
                sort_order = EXCLUDED.sort_order,
                active     = EXCLUDED.active,
                erp_id     = EXCLUDED.erp_id,
                synced_at  = EXCLUDED.synced_at,
                removed_at = NULL,
                raw        = EXCLUDED.raw
            RETURNING (xmax = 0) AS inserted
        )
        SELECT COUNT(*), COUNT(*) FILTER (WHERE inserted) INTO v_n, v_new FROM upserted;

        v_gone := 0;
        IF v_full AND v_n > 0 THEN
            UPDATE erp_maintenance_options o SET removed_at = v_now, synced_at = v_now
             WHERE o.erp_company_id = v_company
               AND o.pool IN ('bedframe_specials', 'sofa_specials')
               AND o.removed_at IS NULL
               AND NOT EXISTS (
                   SELECT 1
                     FROM jsonb_array_elements(p_batch->'specials') e
                     CROSS JOIN LATERAL jsonb_array_elements_text(
                         CASE WHEN jsonb_typeof(e->'categories') = 'array' THEN e->'categories' ELSE '[]'::JSONB END) cat
                    WHERE BTRIM(e->>'code') = o.value
                      AND o.pool = CASE UPPER(BTRIM(cat)) WHEN 'BEDFRAME' THEN 'bedframe_specials'
                                                          WHEN 'SOFA'     THEN 'sofa_specials' END);
            GET DIAGNOSTICS v_gone = ROW_COUNT;
        END IF;
        v_result := v_result || jsonb_build_object('specials', v_n, 'specialsNew', v_new, 'specialsRemoved', v_gone);
    END IF;

    -- ── Fabrics ─────────────────────────────────────────────────────────────
    IF jsonb_typeof(p_batch->'fabrics') = 'array' THEN
        WITH incoming AS (
            SELECT DISTINCT ON (BTRIM(e->>'id'))
                   BTRIM(e->>'id')                                  AS erp_id,
                   BTRIM(e->>'fabric_code')                         AS fabric_code,
                   NULLIF(BTRIM(e->>'fabric_description'), '')      AS description,
                   NULLIF(BTRIM(e->>'fabric_category'), '')         AS category,
                   NULLIF(BTRIM(e->>'series'), '')                  AS series,
                   NULLIF(UPPER(BTRIM(e->>'sofa_price_tier')), '')     AS sofa_tier,
                   NULLIF(UPPER(BTRIM(e->>'bedframe_price_tier')), '') AS bedframe_tier,
                   NULLIF(UPPER(BTRIM(e->>'price_tier')), '')          AS price_tier,
                   COALESCE((e->>'is_active')::BOOLEAN, (e->>'active')::BOOLEAN, TRUE) AS active,
                   catalogue_strip_money(e) - ARRAY['soh_sen', 'po_outstanding_sen', 'last_month_usage_sen',
                                                    'one_week_usage_sen', 'two_weeks_usage_sen',
                                                    'one_month_usage_sen', 'shortage_sen', 'reorder_point_sen'] AS raw
              FROM jsonb_array_elements(p_batch->'fabrics') e
             WHERE NULLIF(BTRIM(e->>'id'), '') IS NOT NULL
               AND NULLIF(BTRIM(e->>'fabric_code'), '') IS NOT NULL
             ORDER BY BTRIM(e->>'id')
        ), upserted AS (
            INSERT INTO erp_fabrics (
                erp_company_id, erp_id, fabric_code, description, category, series,
                sofa_tier, bedframe_tier, price_tier, active, synced_at, removed_at, raw)
            SELECT v_company, i.erp_id, i.fabric_code, i.description, i.category, i.series,
                   i.sofa_tier, i.bedframe_tier, i.price_tier, i.active, v_now, NULL, i.raw
              FROM incoming i
            ON CONFLICT (erp_company_id, erp_id) DO UPDATE SET
                fabric_code   = EXCLUDED.fabric_code,
                description   = EXCLUDED.description,
                category      = EXCLUDED.category,
                series        = EXCLUDED.series,
                sofa_tier     = EXCLUDED.sofa_tier,
                bedframe_tier = EXCLUDED.bedframe_tier,
                price_tier    = EXCLUDED.price_tier,
                active        = EXCLUDED.active,
                synced_at     = EXCLUDED.synced_at,
                removed_at    = NULL,
                raw           = EXCLUDED.raw
            RETURNING (xmax = 0) AS inserted
        )
        SELECT COUNT(*), COUNT(*) FILTER (WHERE inserted) INTO v_n, v_new FROM upserted;

        v_gone := 0;
        IF v_full AND v_n > 0 THEN
            UPDATE erp_fabrics f SET removed_at = v_now, synced_at = v_now
             WHERE f.erp_company_id = v_company
               AND f.removed_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_batch->'fabrics') e
                                WHERE BTRIM(e->>'id') = f.erp_id);
            GET DIAGNOSTICS v_gone = ROW_COUNT;
        END IF;
        v_result := v_result || jsonb_build_object('fabrics', v_n, 'fabricsNew', v_new, 'fabricsRemoved', v_gone);
    END IF;

    -- ── Sofa combos (definitions) ───────────────────────────────────────────
    -- A customer's or a supplier's row is a different question (a negotiated
    -- deal, a purchase cost) and is skipped even if it is sent.
    IF jsonb_typeof(p_batch->'combos') = 'array' THEN
        WITH incoming AS (
            SELECT DISTINCT ON (BTRIM(e->>'id'))
                   BTRIM(e->>'id')                                           AS erp_id,
                   UPPER(BTRIM(e->>'base_model'))                            AS base_model,
                   CASE WHEN jsonb_typeof(e->'modules') = 'array' THEN e->'modules' ELSE '[]'::JSONB END AS modules,
                   CASE WHEN UPPER(BTRIM(COALESCE(e->>'tier', ''))) IN ('PRICE_1', 'PRICE_2', 'PRICE_3')
                        THEN UPPER(BTRIM(e->>'tier')) END                    AS tier,
                   NULLIF(BTRIM(e->>'label'), '')                            AS label,
                   COALESCE(ARRAY(SELECT BTRIM(h) FROM jsonb_array_elements_text(
                                     CASE WHEN jsonb_typeof(e->'heights') = 'array' THEN e->'heights' ELSE '[]'::JSONB END) h
                                   WHERE BTRIM(h) <> ''), '{}')              AS heights,
                   COALESCE(NULLIF(e->>'effective_from', '')::DATE, CURRENT_DATE) AS effective_from,
                   NULLIF(e->>'created_at', '')::TIMESTAMPTZ                 AS erp_created_at,
                   NULLIF(e->>'deleted_at', '')::TIMESTAMPTZ                 AS deleted_at,
                   catalogue_strip_money(e)                                  AS raw
              FROM jsonb_array_elements(p_batch->'combos') e
             WHERE NULLIF(BTRIM(e->>'id'), '') IS NOT NULL
               AND NULLIF(BTRIM(e->>'base_model'), '') IS NOT NULL
               AND NULLIF(e->>'customer_id', '') IS NULL
               AND NULLIF(e->>'supplier_id', '') IS NULL
             ORDER BY BTRIM(e->>'id')
        ), upserted AS (
            INSERT INTO erp_sofa_combos (
                erp_id, erp_company_id, base_model, modules, slots_key, tier, customer_id, supplier_id,
                cost_by_height, selling_by_height, label, heights, effective_from, erp_created_at,
                deleted_at, synced_at, removed_at, raw)
            SELECT i.erp_id, v_company, i.base_model, i.modules, erp_combo_slots_key(i.modules), i.tier, NULL, NULL,
                   '{}'::JSONB, '{}'::JSONB, i.label, i.heights, i.effective_from, i.erp_created_at,
                   i.deleted_at, v_now, NULL, i.raw
              FROM incoming i
            ON CONFLICT (erp_id) DO UPDATE SET
                erp_company_id = EXCLUDED.erp_company_id,
                base_model     = EXCLUDED.base_model,
                modules        = EXCLUDED.modules,
                slots_key      = EXCLUDED.slots_key,
                tier           = EXCLUDED.tier,
                label          = EXCLUDED.label,
                heights        = EXCLUDED.heights,
                effective_from = EXCLUDED.effective_from,
                erp_created_at = EXCLUDED.erp_created_at,
                deleted_at     = EXCLUDED.deleted_at,
                synced_at      = EXCLUDED.synced_at,
                removed_at     = NULL,
                raw            = EXCLUDED.raw
            RETURNING (xmax = 0) AS inserted
        )
        SELECT COUNT(*), COUNT(*) FILTER (WHERE inserted) INTO v_n, v_new FROM upserted;

        v_gone := 0;
        IF v_full AND v_n > 0 THEN
            UPDATE erp_sofa_combos c SET removed_at = v_now, synced_at = v_now
             WHERE c.erp_company_id = v_company
               AND c.removed_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_batch->'combos') e
                                WHERE BTRIM(e->>'id') = c.erp_id);
            GET DIAGNOSTICS v_gone = ROW_COUNT;
        END IF;
        v_result := v_result || jsonb_build_object('combos', v_n, 'combosNew', v_new, 'combosRemoved', v_gone);
    END IF;

    -- First sight of a SKU inherits what the old Product List knew about it.
    v_adopted := catalogue_adopt_legacy(v_company);

    RETURN v_result || jsonb_build_object('adopted', v_adopted);
END;
$fn$;

COMMENT ON FUNCTION ingest_erp_catalogue(JSONB) IS
    'The one write path into the catalogue mirror (erp_products, erp_product_models, erp_maintenance_options, erp_fabrics, erp_sofa_combos). Items only — ERP money is stripped from raw. A carried section is upserted; with full:true a non-empty section also marks what it omitted removed_at (never deleted). Then adopts the old Product List for first-seen SKUs. Called only by the service role from POST /api/erp/v1/products.';

REVOKE ALL ON FUNCTION ingest_erp_catalogue(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION catalogue_adopt_legacy(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ingest_erp_catalogue(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION catalogue_adopt_legacy(BIGINT) TO service_role;

-- ══ Who may read and write ══════════════════════════════════════════════════
-- The same split comm_products has: the Principal (`admin` scope — Product
-- List is Principal-only) reads and writes; HR reads, because a recost or a
-- run that HR presses reads the price through the caller's own session. The
-- mirror has no write policy at all: only the receiver's service role writes
-- it.
--
-- The 2026-09-19 policies asked `has_scope(ARRAY['product_list'])` — but
-- `product_list` is a permission KEY whose SCOPE is `admin`; no permission
-- carries a `product_list` scope, so those policies were false for everybody
-- and the mirror would have read empty to the very page built to show it.
ALTER TABLE erp_products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_sofa_combos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_product_models      ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_maintenance_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_fabrics             ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogue_skus          ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogue_models        ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogue_option_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogue_combo_prices  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_products_read    ON erp_products;
DROP POLICY IF EXISTS erp_sofa_combos_read ON erp_sofa_combos;

DO $policies$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['erp_products', 'erp_sofa_combos', 'erp_product_models',
                             'erp_maintenance_options', 'erp_fabrics']
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_read', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR SELECT TO authenticated
                USING ((SELECT has_scope(ARRAY[''admin''])) OR (SELECT has_scope(ARRAY[''hr''])))',
            t || '_read', t);
    END LOOP;

    FOREACH t IN ARRAY ARRAY['catalogue_skus', 'catalogue_models', 'catalogue_option_prices',
                             'catalogue_combo_prices']
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_hr_select', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR SELECT TO authenticated
                USING ((SELECT has_scope(ARRAY[''hr''])))',
            t || '_hr_select', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_principal_all', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL TO authenticated
                USING ((SELECT has_scope(ARRAY[''admin''])))
                WITH CHECK ((SELECT has_scope(ARRAY[''admin''])))',
            t || '_principal_all', t);
    END LOOP;
END
$policies$;

GRANT SELECT ON erp_products, erp_sofa_combos, erp_product_models, erp_maintenance_options, erp_fabrics
    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON catalogue_skus, catalogue_models, catalogue_option_prices, catalogue_combo_prices
    TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ═══ DOWN ════════════════════════════════════════════════════════════════════
-- Loses the portal's own catalogue decisions (catalogue_*) — read them out
-- first. The mirror is whatever the ERP re-pushes.
--
-- DROP FUNCTION IF EXISTS ingest_erp_catalogue(JSONB);
-- DROP FUNCTION IF EXISTS catalogue_adopt_legacy(BIGINT);
-- DROP FUNCTION IF EXISTS catalogue_strip_money(JSONB);
-- DROP FUNCTION IF EXISTS catalogue_code_key(TEXT);
-- DROP FUNCTION IF EXISTS catalogue_default_gift(TEXT);
-- DROP FUNCTION IF EXISTS catalogue_calc_category(TEXT, TEXT);
-- DROP FUNCTION IF EXISTS catalogue_brand_of(TEXT, TEXT, TEXT);
-- DROP TABLE IF EXISTS catalogue_combo_prices, catalogue_option_prices, catalogue_models, catalogue_skus;
-- DROP TABLE IF EXISTS erp_fabrics, erp_maintenance_options, erp_product_models;
-- DELETE FROM erp_sofa_combos; DELETE FROM erp_products;
-- ALTER TABLE erp_sofa_combos DROP COLUMN erp_company_id, DROP COLUMN heights, DROP COLUMN erp_created_at,
--     DROP COLUMN first_seen_at, DROP COLUMN removed_at;
-- ALTER TABLE erp_products DROP CONSTRAINT erp_products_pkey;
-- ALTER TABLE erp_products DROP COLUMN vp_id, DROP COLUMN erp_company_id, DROP COLUMN detail,
--     DROP COLUMN model_erp_id, DROP COLUMN size_code, DROP COLUMN size_label, DROP COLUMN branding,
--     DROP COLUMN fabric_color, DROP COLUMN erp_updated_at, DROP COLUMN first_seen_at, DROP COLUMN removed_at;
-- ALTER TABLE erp_products ADD PRIMARY KEY (item_code);
-- …then re-run 20260919010000 §5 (ingest_erp_products) and §6 (its policies).
