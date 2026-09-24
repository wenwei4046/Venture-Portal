-- ════════════════════════════════════════════════════════════════════════════
-- Carrying the old Product List over: one more rule, for mattresses (2026-09-24)
-- ════════════════════════════════════════════════════════════════════════════
--
-- `catalogue_adopt_legacy` (20260924020000 §12) gives a SKU the ERP pushes for
-- the first time the price the old Product List already had for it — matched
-- on the ERP bridge code, then on the code itself. After the first full load
-- that had adopted 784 SKUs, and every priced mattress the old list held for
-- Ergotex (40 of 40), 79 of Akemi's and 129 of Dunlop's were still unmatched:
-- the old list spelled a mattress the supplier's way and the ERP spells it its
-- own way, with nothing in between.
--
--     old list                      ERP SKU master
--     AK-APEX MATT (K)              AKEMI APEX MATT (K)
--     DL-AMIRA DELUXE PLUS (K)      DUNLOPILLO AMIRA DELUXE PLUS MATT (K)
--     DL-AQUA RELAXER 300(K)        DUNLOPILLO AQUA RELAXER 300 MATT (K)
--     EG-CLOUDREST MATT (Q)         ERGOTEX CLOUDREST MATT (Q)
--
-- THE RULE: a mattress is the same mattress when its BRAND, its MODEL NAME and
-- its SIZE are the same — the brand read from each side's own field
-- (`comm_products.brand_code`; `erp_products.branding` through
-- `erp_sync_brand_code`, which is how DUNLOPILLO lands on DUNLOP everywhere
-- else), the name being what is left of the code once the prefix, the word
-- MATT and the size are taken off, the size the code's own (K) / (Q) / (S) /
-- (SS) / (SK) / (SP). The ERP's code must begin with its own branding word.
--
-- Only when it is UNIQUE both ways: one ERP SKU for the old row and one old row
-- for the ERP SKU, counted over the whole catalogue (not only what is still
-- unpriced), and an old row a SKU already adopted is not handed to a second
-- one. Measured on 2026-09-24 before this ran: 248 pairs, 0 ambiguous.
--
-- NOT extended to bed frames. The old list named a bed frame by its SUPPLIER's
-- code (HOK-1003 (A) (K), NB-KHJ01(K), NK-1005 (K)) and the ERP by its own
-- model number (1025-(K), KHJ19(A)-(K)); dropping the supplier leaves HOK-1005
-- and NK-1005 both claiming 1005, and nothing on either side says which one the
-- ERP's 1005 is. A wrong match here is a wrong price on somebody's margin, so
-- those wait for a person on the Product List.
--
-- Adds prices to catalogue_skus only; it does not change what any bill costs
-- until 20260924030000 points the cost chain at the catalogue.
--
-- Reversal: re-run 20260924020000 §12 (catalogue_adopt_legacy), then
--   DROP FUNCTION catalogue_legacy_mattress_key(TEXT, TEXT);
--   DROP FUNCTION catalogue_erp_mattress_key(TEXT, TEXT, TEXT);
-- The rows it adopted carry adopted_from and note = 'Carried over from the old
-- Product List (brand · model · size)'; delete those to undo them.
-- ════════════════════════════════════════════════════════════════════════════

-- `AK-APEX MATT (K)` / `DL-AQUA RELAXER 300(K)` → `AKEMI|APEX|K` / `DUNLOP|AQUA RELAXER 300|K`
CREATE OR REPLACE FUNCTION catalogue_legacy_mattress_key(p_brand_code TEXT, p_code TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT CASE WHEN NULLIF(BTRIM(COALESCE(p_brand_code, '')), '') IS NOT NULL AND x.m IS NOT NULL
                THEN UPPER(BTRIM(p_brand_code)) || '|'
                     || UPPER(REGEXP_REPLACE(BTRIM(x.m[1]), '\s+', ' ', 'g')) || '|'
                     || UPPER(x.m[2])
           END
      FROM (SELECT REGEXP_MATCH(COALESCE(p_code, ''),
                                '^[A-Za-z]+-\s*(.+?)\s*(?:MATT(?:RESS)?)?\s*\(\s*(K|Q|S|SS|SK|SP)\s*\)\s*$',
                                'i') AS m) x;
$fn$;

-- `AKEMI APEX MATT (K)` with branding AKEMI → `AKEMI|APEX|K`. The first word of
-- the code must BE the branding, or there is no key.
CREATE OR REPLACE FUNCTION catalogue_erp_mattress_key(p_brand_code TEXT, p_branding TEXT, p_code TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT CASE WHEN NULLIF(BTRIM(COALESCE(p_brand_code, '')), '') IS NOT NULL
                 AND x.m IS NOT NULL
                 AND UPPER(x.m[1]) = UPPER(BTRIM(COALESCE(p_branding, '')))
                THEN UPPER(BTRIM(p_brand_code)) || '|'
                     || UPPER(REGEXP_REPLACE(BTRIM(x.m[2]), '\s+', ' ', 'g')) || '|'
                     || UPPER(x.m[3])
           END
      FROM (SELECT REGEXP_MATCH(COALESCE(p_code, ''),
                                '^(\S+)\s+(.+?)\s+MATT\s*\(\s*(K|Q|S|SS|SK|SP)\s*\)\s*$',
                                'i') AS m) x;
$fn$;

CREATE OR REPLACE FUNCTION catalogue_adopt_legacy(p_company BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_skus   INTEGER := 0;
    v_models INTEGER := 0;
BEGIN
    -- Keys computed ONCE per side and joined on equality, never one join on
    -- `a = x OR b = x` (an OR cannot become a hash join — 20260919010000 §9).
    WITH legacy AS (
        SELECT cp.id, cp.unit_cost, cp.cost_grid, cp.is_active, cp.updated_at,
               catalogue_code_key(cp.erp_item_code) AS erp_key,
               catalogue_code_key(cp.item_code)     AS own_key,
               catalogue_legacy_mattress_key(cp.brand_code, cp.item_code) AS mattress_key,
               cp.is_active AND COALESCE(o.available, FALSE) AS offered,
               (cp.unit_cost IS NOT NULL
                OR jsonb_array_length(CASE WHEN jsonb_typeof(cp.cost_grid) = 'array'
                                           THEN cp.cost_grid ELSE '[]'::JSONB END) > 0) AS has_price
          FROM comm_products cp
          LEFT JOIN member_product_options o ON o.product_id = cp.id
    ), catalogue AS (
        SELECT e.erp_id,
               catalogue_code_key(e.item_code) AS code_key,
               CASE WHEN e.category = 'MATTRESS'
                    THEN catalogue_erp_mattress_key(erp_sync_brand_code(NULLIF(BTRIM(e.branding), '')),
                                                    e.branding, e.item_code)
               END AS mattress_key,
               NOT EXISTS (SELECT 1 FROM catalogue_skus s WHERE s.erp_product_id = e.erp_id) AS fresh
          FROM erp_products e
         WHERE e.erp_company_id = p_company
    ), fresh AS (
        SELECT c.erp_id, c.code_key FROM catalogue c WHERE c.fresh
    ), by_mattress AS (
        -- Unique both ways over the WHOLE catalogue, and never an old row a
        -- SKU has already adopted.
        SELECT x.erp_id, x.legacy_id
          FROM (SELECT c.erp_id, c.fresh, l.id AS legacy_id,
                       COUNT(*) OVER (PARTITION BY c.erp_id) AS per_sku,
                       COUNT(*) OVER (PARTITION BY l.id)     AS per_legacy
                  FROM catalogue c
                  JOIN legacy l ON l.mattress_key = c.mattress_key
                 WHERE c.mattress_key IS NOT NULL) x
         WHERE x.fresh
           AND x.per_sku = 1
           AND x.per_legacy = 1
           AND NOT EXISTS (SELECT 1 FROM catalogue_skus s WHERE s.adopted_from = x.legacy_id)
    ), matched AS (
        SELECT f.erp_id, l.*, 1 AS via FROM fresh f JOIN legacy l ON l.erp_key = f.code_key WHERE l.erp_key <> ''
        UNION ALL
        SELECT f.erp_id, l.*, 2 AS via FROM fresh f JOIN legacy l ON l.own_key = f.code_key
        UNION ALL
        SELECT b.erp_id, l.*, 3 AS via FROM by_mattress b JOIN legacy l ON l.id = b.legacy_id
    ), candidates AS (
        SELECT DISTINCT ON (m.erp_id)
               m.erp_id, m.id AS legacy_id, m.unit_cost, m.cost_grid, m.offered, m.via
          FROM matched m
         ORDER BY m.erp_id, m.via, m.is_active DESC, m.has_price DESC, m.updated_at DESC
    )
    INSERT INTO catalogue_skus (erp_product_id, offered, price, price_grid, adopted_from, note, updated_by, updated_at)
    SELECT c.erp_id,
           c.offered,
           c.unit_cost,
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
           CASE WHEN c.via = 3 THEN 'Carried over from the old Product List (brand · model · size)'
                ELSE 'Carried over from the old Product List' END,
           NULL,
           NOW()
      FROM candidates c
    ON CONFLICT (erp_product_id) DO NOTHING;
    GET DIAGNOSTICS v_skus = ROW_COUNT;

    -- A model the old list sold from is offered; its gift tick and section
    -- follow the old rows. A sofa's seat sizes are the heights its adopted
    -- grids price. First sight only, as before.
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
    'First sight only: a mirrored SKU with no catalogue_skus row inherits the price, grid and calculator tick of the comm_products row that names it — its ERP bridge code, else its own code (case- and space-folded), else for a mattress the same brand + model name + size when that pairing is unique both ways. Its model inherits offered / gift / section and, for a sofa, the seat sizes its grids price. Never overwrites a portal decision.';

REVOKE ALL ON FUNCTION catalogue_adopt_legacy(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalogue_adopt_legacy(BIGINT) TO service_role;

-- The SKUs the first load left unpriced get the new rule now, not at the next
-- delivery.
SELECT catalogue_adopt_legacy(1);
