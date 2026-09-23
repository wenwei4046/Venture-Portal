-- ════════════════════════════════════════════════════════════════════════════
-- The portal's own prices cost every bill (2026-09-24)
-- ════════════════════════════════════════════════════════════════════════════
--
-- THE RULE (user 2026-09-24): 价钱由我这边填，Venture Portal 里的 margin
-- 统一由产品这边的价格来计算 costing 和 margin. Every margin in the portal —
-- the member calculator, the monthly run, the drill-downs — is measured
-- against the price keyed on the Product List. Not the cost the ERP stamps on
-- a sales line, not the ERP's SKU master, not a second list somewhere.
--
-- WHAT CHANGES, per sales line (the fill trigger, BEFORE INSERT):
--
--   unit    = the SKU's portal price: a sofa module's grid cell at the line's
--             seat height and fabric tier, else the SKU's one figure
--   + the portal's surcharge for every Maintenance option on the line
--     (a bed frame's divan / leg / total height and specials, a sofa's leg
--     height and specials) — the ERP's own shape, computeMfgLineCost:
--     base price + Σ option surcharges, per line
--   cost    = unit × qty
--
-- Then per ORDER, once its lines are all in (a deferred trigger, at commit):
-- a sofa build whose modules cover one of the portal's priced combos is
-- costed at the combo's price for that seat height instead of its modules
-- added up, and the combo's total is spread across the matched lines in
-- proportion to their own costs — the ERP's recomputeTotals, rule for rule
-- (same base model only, one tier and one seat height across the set, a
-- uniform quantity, subset coverage with extras at full price, the combo
-- always wins).
--
-- WHERE THE LINE'S OPTIONS COME FROM. The feed does not carry the ERP's
-- structured `variants`; it carries `description2`, which for every line the
-- ERP wrote itself is its own buildVariantSummary — `BO315-01 / SEAT 30 /
-- LEG DEFAULT / SPECIAL: Nylon Fabric`, `NB-04 / DIVAN 8" + LEG 4" / GAP 12"
-- / T.Heights 24"`. That grammar is parsed; a line whose raw DOES carry
-- `variants` (the ERP can add it to the feed) is read from those instead.
-- Hand-typed AutoCount-era text parses to nothing, and such a line is costed
-- on its SKU alone.
--
-- A LINE NOTHING HERE CAN PRICE HAS NO COST, and its bill has no margin —
-- the engine's designed behaviour, and the Costing gaps list names it. The
-- ERP's own figure (`raw.cost`) is not a fallback: it is the ERP's costing,
-- and the rule is that the ERP's costing does not decide a margin here.
-- An option with no portal surcharge adds nothing; the Maintenance tab says
-- which options are unpriced.
--
-- NOTHING ALREADY LANDED MOVES BY ITSELF. New and re-pushed lines are costed
-- the new way from the moment this runs; a month already landed changes only
-- when somebody presses Recost on it, and the recost still refuses a month
-- whose run has paid (23RUN).
--
-- Also drops the ERP money columns 20260924020000 left NULL for one release.
--
-- Reversal: the DOWN block at the foot.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0. The mirror carries no money — the columns go ─────────────────────────
ALTER TABLE erp_products
    DROP COLUMN IF EXISTS cost_price,
    DROP COLUMN IF EXISTS base_price,
    DROP COLUMN IF EXISTS price_1,
    DROP COLUMN IF EXISTS sell_price,
    DROP COLUMN IF EXISTS seat_height_costs,
    DROP COLUMN IF EXISTS uom,
    DROP COLUMN IF EXISTS unit_m3,
    DROP COLUMN IF EXISTS erp_snapshot_at;

ALTER TABLE erp_sofa_combos
    DROP COLUMN IF EXISTS cost_by_height,
    DROP COLUMN IF EXISTS selling_by_height,
    DROP COLUMN IF EXISTS customer_id,
    DROP COLUMN IF EXISTS supplier_id,
    DROP COLUMN IF EXISTS erp_snapshot_at;

-- ── 1. Where a line's cost came from, and what it was made of ───────────────
ALTER TABLE sales_order_lines
    ADD COLUMN IF NOT EXISTS list_cost_amount NUMERIC(15, 2),
    ADD COLUMN IF NOT EXISTS cost_detail      JSONB;

COMMENT ON COLUMN sales_order_lines.list_cost_amount IS
    'The line''s cost at its own portal price (unit + option surcharges) × qty, BEFORE a combo spread. cost_amount equals it unless the line is part of a matched combo; kept so re-applying a combo is idempotent.';
COMMENT ON COLUMN sales_order_lines.cost_detail IS
    'How cost_amount was reached: the price used (grid cell or flat), seat height, fabric tier, each option surcharge, the combo that spread onto it — or why nothing could price it (not_in_sku_master / unpriced / no_height).';

ALTER TABLE sales_order_lines DROP CONSTRAINT IF EXISTS sales_order_lines_cost_source_valid;
ALTER TABLE sales_order_lines
    ADD CONSTRAINT sales_order_lines_cost_source_valid
    CHECK (cost_source IS NULL OR cost_source IN (
        'catalogue', 'catalogue_combo', 'manual',
        -- the provenance lines landed with before 2026-09-24, kept truthful
        -- until a recost re-prices them
        'erp_line', 'sku_master', 'product_list'));

COMMENT ON COLUMN sales_order_lines.cost_source IS
    'catalogue (the Product List price) | catalogue_combo (a matched combo''s price, spread) | manual | NULL (nothing could price it — the bill has no margin). erp_line / sku_master / product_list are the pre-2026-09-24 provenance of lines not yet recosted.';

-- ── 2. The keys two spellings of one value share ────────────────────────────
-- A seat height is written `30`, `25"`, `75cm`, `75CM`: the inch mark, case
-- and spaces are dropped. `DEFAULT` and `STD` stay two different words.
CREATE OR REPLACE FUNCTION catalogue_height_key(p TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT NULLIF(LOWER(REGEXP_REPLACE(COALESCE(p, ''), '["”“''\s]', '', 'g')), '');
$fn$;

-- An option value as the ERP's summary prints it (`LEG DEFAULT`, `NO LEG`,
-- `DIVAN 10”`) against the pool's own spelling (`Default`, `No Leg`, `10"`).
CREATE OR REPLACE FUNCTION catalogue_value_key(p TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(BTRIM(COALESCE(p, '')), '[”“]', '"', 'g'), '\s+', ' ', 'g')), '');
$fn$;

-- ── 3. What the line says it is ─────────────────────────────────────────────
-- `variants` when the feed carries them; else the ERP's own summary grammar
-- (scm/shared/variant-summary.ts buildVariantSummary):
--   <fabric> / SEAT <h> / LEG <l> / SPECIAL: a + b          — a sofa module
--   <fabric> / DIVAN <d> + LEG <l> / GAP <g> / T.Heights <t> — a bed frame
-- `parsed_from` is NULL when neither answered.
CREATE OR REPLACE FUNCTION catalogue_line_facts(p_description2 TEXT, p_raw JSONB)
RETURNS TABLE (fabric TEXT, seat TEXT, leg TEXT, divan TEXT, gap TEXT, total TEXT,
               specials TEXT[], parsed_from TEXT)
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
    v    JSONB := CASE WHEN jsonb_typeof(p_raw->'variants') = 'object' THEN p_raw->'variants' END;
    seg  TEXT;
    m    TEXT[];
    i    INTEGER := 0;
    hit  BOOLEAN := FALSE;
BEGIN
    specials := '{}';

    IF v IS NOT NULL THEN
        fabric := NULLIF(BTRIM(COALESCE(v->>'fabricCode', v->>'fabricColor', '')), '');
        seat   := NULLIF(BTRIM(COALESCE(v->>'seatHeight', v->>'depth', '')), '');
        leg    := NULLIF(BTRIM(COALESCE(v->>'legHeight', v->>'sofaLegHeight', '')), '');
        divan  := NULLIF(BTRIM(COALESCE(v->>'divanHeight', '')), '');
        gap    := NULLIF(BTRIM(COALESCE(v->>'gap', '')), '');
        total  := NULLIF(BTRIM(COALESCE(v->>'totalHeight', '')), '');
        specials := CASE
            WHEN jsonb_typeof(v->'specials') = 'array'
                THEN ARRAY(SELECT BTRIM(x) FROM jsonb_array_elements_text(v->'specials') x WHERE BTRIM(x) <> '')
            WHEN NULLIF(BTRIM(COALESCE(v->>'specials', '')), '') IS NOT NULL
                THEN ARRAY[BTRIM(v->>'specials')]
            ELSE '{}' END;
        parsed_from := 'variants';
        RETURN NEXT;
        RETURN;
    END IF;

    IF NULLIF(BTRIM(COALESCE(p_description2, '')), '') IS NULL THEN
        RETURN NEXT;
        RETURN;
    END IF;

    FOREACH seg IN ARRAY REGEXP_SPLIT_TO_ARRAY(p_description2, '\s+/\s+') LOOP
        i := i + 1;
        seg := BTRIM(seg);
        IF seg ~* '^SEAT\s+' THEN
            seat := BTRIM(REGEXP_REPLACE(seg, '^SEAT\s+', '', 'i'));
            hit := TRUE;
        ELSIF seg ~* '^DIVAN\s+' THEN
            m := REGEXP_MATCH(seg, '^DIVAN\s+(.+?)\s*\+\s*(?:LEG\s+(.+)|(NO\s*LEG))\s*$', 'i');
            IF m IS NOT NULL THEN
                divan := BTRIM(m[1]);
                leg   := COALESCE(BTRIM(m[2]), 'No Leg');
            ELSE
                divan := BTRIM(REGEXP_REPLACE(seg, '^DIVAN\s+', '', 'i'));
            END IF;
            hit := TRUE;
        ELSIF seg ~* '^LEG\s+' THEN
            leg := BTRIM(REGEXP_REPLACE(seg, '^LEG\s+', '', 'i'));
            hit := TRUE;
        ELSIF seg ~* '^NO\s*LEG$' THEN
            leg := 'No Leg';
            hit := TRUE;
        ELSIF seg ~* '^GAP\s+' THEN
            gap := BTRIM(REGEXP_REPLACE(seg, '^GAP\s+', '', 'i'));
            hit := TRUE;
        ELSIF seg ~* '^T\.\s*Heights?\s+' THEN
            total := BTRIM(REGEXP_REPLACE(seg, '^T\.\s*Heights?\s+', '', 'i'));
            hit := TRUE;
        ELSIF seg ~* '^SPECIAL:\s*' THEN
            specials := ARRAY(SELECT BTRIM(x)
                                FROM REGEXP_SPLIT_TO_TABLE(REGEXP_REPLACE(seg, '^SPECIAL:\s*', '', 'i'), '\s+\+\s+') x
                               WHERE BTRIM(x) <> '');
            hit := TRUE;
        ELSIF seg ~* '^FREE\M' THEN
            NULL;
        ELSIF i = 1 THEN
            fabric := NULLIF(SPLIT_PART(seg, ' ', 1), '');
        END IF;
    END LOOP;

    IF hit THEN
        parsed_from := 'description2';
    ELSE
        fabric := NULL;
    END IF;
    RETURN NEXT;
END;
$fn$;

COMMENT ON FUNCTION catalogue_line_facts(TEXT, JSONB) IS
    'A sales line''s options: raw.variants when the feed carries them, else the ERP''s own description2 grammar (FABRIC / SEAT h / LEG l / SPECIAL: a + b; FABRIC / DIVAN d + LEG l / GAP g / T.Heights t). parsed_from NULL = neither answered (hand-typed text).';

-- ── 4. The tier a fabric costs a sofa or a bed frame at ─────────────────────
-- The ERP's own default when the fabric is unknown or carries no tier:
-- PRICE_2 (recomputeTotals: `tierByFabric.get(...) ?? 'PRICE_2'`).
CREATE OR REPLACE FUNCTION catalogue_fabric_tier(p_company BIGINT, p_fabric TEXT, p_category TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT COALESCE((
        SELECT CASE WHEN UPPER(COALESCE(p_category, '')) = 'BEDFRAME'
                    THEN COALESCE(f.bedframe_tier, f.price_tier)
                    ELSE COALESCE(f.sofa_tier, f.price_tier) END
          FROM erp_fabrics f
         WHERE f.erp_company_id = p_company
           AND UPPER(BTRIM(f.fabric_code)) = UPPER(BTRIM(p_fabric))
           AND f.removed_at IS NULL
         ORDER BY f.active DESC, f.synced_at DESC
         LIMIT 1), 'PRICE_2');
$fn$;

-- ── 5. Which mirrored SKU a code is ─────────────────────────────────────────
-- Exact spelling first (`8030-Console` and `8030-CONSOLE` are two rows over
-- there), then a live row before a retired one.
CREATE OR REPLACE FUNCTION catalogue_sku_for_code(p_company BIGINT, p_code TEXT)
RETURNS SETOF erp_products
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT e.*
      FROM erp_products e
     WHERE e.erp_company_id = p_company
       AND UPPER(BTRIM(e.item_code)) = UPPER(BTRIM(p_code))
     ORDER BY (e.item_code = BTRIM(p_code)) DESC, (e.removed_at IS NULL) DESC, e.active DESC, e.erp_id
     LIMIT 1;
$fn$;

-- ── 6. A grid cell ──────────────────────────────────────────────────────────
-- The member calculator's resolveUnitCost, in SQL: the exact (height, tier)
-- cell, else PRICE_2 at that height, else the lowest tier at that height.
CREATE OR REPLACE FUNCTION catalogue_grid_price(p_grid JSONB, p_height TEXT, p_tier TEXT)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT (c->>'price')::NUMERIC
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_grid) = 'array' THEN p_grid ELSE '[]'::JSONB END) c
     WHERE catalogue_height_key(c->>'height') = catalogue_height_key(p_height)
       AND (c->>'price') ~ '^\d+(\.\d+)?$'
     ORDER BY (c->>'tier' = COALESCE(p_tier, 'PRICE_2')) DESC,
              (c->>'tier' = 'PRICE_2') DESC,
              c->>'tier'
     LIMIT 1;
$fn$;

-- ── 7. A SKU's portal price ─────────────────────────────────────────────────
-- `how`: grid | price | no_height (a grid, but no seat height to read it at)
-- | unpriced (in the SKU master, no portal price). No row at all = the code
-- is not in the SKU master. A grid of a single seat height answers without
-- one — there is only one cell it could be.
CREATE OR REPLACE FUNCTION catalogue_unit_price(p_company BIGINT, p_code TEXT, p_height TEXT, p_tier TEXT)
RETURNS TABLE (unit_price NUMERIC, erp_product_id TEXT, category TEXT, base_model TEXT,
               module_code TEXT, how TEXT)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
DECLARE
    e        erp_products%ROWTYPE;
    s        catalogue_skus%ROWTYPE;
    v_count  INTEGER;
    v_height TEXT := p_height;
    v_price  NUMERIC;
BEGIN
    SELECT * INTO e FROM catalogue_sku_for_code(p_company, p_code);
    IF NOT FOUND THEN
        RETURN;
    END IF;

    erp_product_id := e.erp_id;
    category       := e.category;
    base_model     := e.base_model;
    module_code    := e.module_code;

    SELECT * INTO s FROM catalogue_skus cs WHERE cs.erp_product_id = e.erp_id;
    IF NOT FOUND THEN
        how := 'unpriced';
        RETURN NEXT;
        RETURN;
    END IF;

    IF jsonb_typeof(s.price_grid) = 'array' AND jsonb_array_length(s.price_grid) > 0 THEN
        IF catalogue_height_key(v_height) IS NULL THEN
            SELECT COUNT(DISTINCT catalogue_height_key(c->>'height')), MIN(c->>'height')
              INTO v_count, v_height
              FROM jsonb_array_elements(s.price_grid) c;
            IF v_count <> 1 THEN
                v_height := NULL;
            END IF;
        END IF;
        v_price := catalogue_grid_price(s.price_grid, v_height, p_tier);
        IF v_price IS NOT NULL THEN
            unit_price := v_price;
            how := 'grid';
            RETURN NEXT;
            RETURN;
        END IF;
    END IF;

    IF s.price IS NOT NULL THEN
        unit_price := s.price;
        how := 'price';
        RETURN NEXT;
        RETURN;
    END IF;

    how := CASE WHEN jsonb_typeof(s.price_grid) = 'array' AND jsonb_array_length(s.price_grid) > 0
                THEN 'no_height' ELSE 'unpriced' END;
    RETURN NEXT;
END;
$fn$;

COMMENT ON FUNCTION catalogue_unit_price(BIGINT, TEXT, TEXT, TEXT) IS
    'THE unit price lookup: the SKU''s portal price — a sofa module''s grid cell at (height, tier), else its one figure. No row = not in the SKU master; unit_price NULL with how = unpriced / no_height = in it but nothing to read.';

-- ── 8. An option's surcharge, and a line's ──────────────────────────────────
-- A special printed with its choices (`Right Drawer (10")`) is looked up as
-- itself first, then without the parenthesis.
CREATE OR REPLACE FUNCTION catalogue_option_price(p_company BIGINT, p_pool TEXT, p_value TEXT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT op.price
      FROM catalogue_option_prices op
     WHERE op.erp_company_id = p_company
       AND op.pool = p_pool
       AND catalogue_value_key(op.value) IN (catalogue_value_key(p_value),
                                             catalogue_value_key(REGEXP_REPLACE(COALESCE(p_value, ''), '\s*\(.*\)\s*$', '')))
     ORDER BY (catalogue_value_key(op.value) = catalogue_value_key(p_value)) DESC
     LIMIT 1;
$fn$;

CREATE OR REPLACE FUNCTION catalogue_line_surcharge(p_company BIGINT, p_category TEXT, p_leg TEXT,
                                                    p_divan TEXT, p_total TEXT, p_specials TEXT[])
RETURNS TABLE (amount NUMERIC, parts JSONB)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
DECLARE
    v_cat   TEXT := UPPER(COALESCE(p_category, ''));
    v_parts JSONB := '[]'::JSONB;
    v_sum   NUMERIC := 0;
    v_price NUMERIC;
    v_sp    TEXT;
    v_pairs TEXT[][];
    k       INTEGER;
BEGIN
    IF v_cat = 'BEDFRAME' THEN
        v_pairs := ARRAY[['bedframe_divan_heights', p_divan],
                         ['bedframe_leg_heights',   p_leg],
                         ['bedframe_total_heights', p_total]];
    ELSIF v_cat = 'SOFA' THEN
        v_pairs := ARRAY[['sofa_leg_heights', p_leg]];
    ELSE
        amount := 0;
        parts  := '[]'::JSONB;
        RETURN NEXT;
        RETURN;
    END IF;

    FOR k IN 1 .. array_length(v_pairs, 1) LOOP
        CONTINUE WHEN v_pairs[k][2] IS NULL;
        v_price := catalogue_option_price(p_company, v_pairs[k][1], v_pairs[k][2]);
        v_parts := v_parts || jsonb_build_array(jsonb_build_object(
            'pool', v_pairs[k][1], 'value', v_pairs[k][2], 'price', v_price));
        v_sum := v_sum + COALESCE(v_price, 0);
    END LOOP;

    FOREACH v_sp IN ARRAY COALESCE(p_specials, '{}') LOOP
        v_price := catalogue_option_price(p_company,
                                          CASE v_cat WHEN 'BEDFRAME' THEN 'bedframe_specials' ELSE 'sofa_specials' END,
                                          v_sp);
        v_parts := v_parts || jsonb_build_array(jsonb_build_object(
            'pool', CASE v_cat WHEN 'BEDFRAME' THEN 'bedframe_specials' ELSE 'sofa_specials' END,
            'value', v_sp, 'price', v_price));
        v_sum := v_sum + COALESCE(v_price, 0);
    END LOOP;

    amount := v_sum;
    parts  := v_parts;
    RETURN NEXT;
END;
$fn$;

-- ── 9. A line's cost ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION catalogue_line_cost(p_company BIGINT, p_code TEXT, p_item_group TEXT,
                                               p_description2 TEXT, p_raw JSONB, p_qty NUMERIC)
RETURNS TABLE (cost NUMERIC, unit_price NUMERIC, surcharge NUMERIC, detail JSONB)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
DECLARE
    f      RECORD;
    u      RECORD;
    s      RECORD;
    v_cat  TEXT;
    v_tier TEXT;
    v_sku  TEXT;
BEGIN
    SELECT * INTO f FROM catalogue_line_facts(p_description2, p_raw);

    -- The category decides which tier a fabric reads and which pools the
    -- options are looked up in: the mirror's, else the line's item group.
    SELECT e.category INTO v_cat FROM catalogue_sku_for_code(p_company, p_code) e;
    v_cat  := UPPER(COALESCE(v_cat, p_item_group, ''));
    v_tier := CASE WHEN v_cat IN ('SOFA', 'BEDFRAME') THEN catalogue_fabric_tier(p_company, f.fabric, v_cat) END;

    SELECT * INTO u FROM catalogue_unit_price(p_company, p_code, f.seat, v_tier);
    IF NOT FOUND THEN
        detail := jsonb_build_object('reason', 'not_in_sku_master');
        RETURN NEXT;
        RETURN;
    END IF;
    IF u.unit_price IS NULL THEN
        detail := jsonb_strip_nulls(jsonb_build_object(
            'reason', u.how, 'erp_product_id', u.erp_product_id, 'height', f.seat, 'tier', v_tier));
        RETURN NEXT;
        RETURN;
    END IF;

    SELECT * INTO s FROM catalogue_line_surcharge(p_company, v_cat, f.leg, f.divan, f.total, f.specials);

    unit_price := u.unit_price;
    surcharge  := COALESCE(s.amount, 0);
    cost       := ROUND((u.unit_price + COALESCE(s.amount, 0)) * COALESCE(p_qty, 0), 2);
    detail     := jsonb_strip_nulls(jsonb_build_object(
        'how', u.how, 'erp_product_id', u.erp_product_id, 'unit', u.unit_price,
        'height', f.seat, 'tier', v_tier, 'fabric', f.fabric,
        'surcharge', NULLIF(COALESCE(s.amount, 0), 0),
        'options', CASE WHEN jsonb_array_length(COALESCE(s.parts, '[]'::JSONB)) > 0 THEN s.parts END,
        'parsed_from', f.parsed_from));
    RETURN NEXT;
END;
$fn$;

COMMENT ON FUNCTION catalogue_line_cost(BIGINT, TEXT, TEXT, TEXT, JSONB, NUMERIC) IS
    'One sales line at the portal''s prices: (unit price at its seat height and fabric tier + each option''s surcharge) × qty. cost NULL = nothing could price it; detail says why (reason) or how (how, height, tier, options).';

-- ── 10. Does a build cover a combo's slots? ─────────────────────────────────
-- SUBSET coverage, as the ERP's matchComboSubset: every slot filled by a
-- DISTINCT built module whose code is in that slot's OR-set; extras allowed.
-- Returns the 1-based indices of the modules consumed, ascending, or NULL.
-- An exhaustive search in slot order (a slot that CAN be covered always is),
-- trying modules in build order — the same first choice the ERP's Kuhn pass
-- makes. Builds are a handful of modules; this is cheap.
CREATE OR REPLACE FUNCTION catalogue_match_slots(p_built TEXT[], p_slots JSONB)
RETURNS INTEGER[]
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
    n       INTEGER := CASE WHEN jsonb_typeof(p_slots) = 'array' THEN jsonb_array_length(p_slots) ELSE 0 END;
    m       INTEGER := COALESCE(array_length(p_built, 1), 0);
    cand    JSONB := '[]'::JSONB;
    slot    JSONB;
    codes   TEXT[];
    opts    INTEGER[];
    pos     INTEGER[];
    chosen  INTEGER[];
    used    BOOLEAN[];
    j       INTEGER;
    k       INTEGER;
    idx     INTEGER;
    found   BOOLEAN;
BEGIN
    IF n = 0 OR m < n THEN
        RETURN NULL;
    END IF;

    FOR j IN 0 .. n - 1 LOOP
        slot  := p_slots->j;
        codes := CASE WHEN jsonb_typeof(slot) = 'array'
                      THEN ARRAY(SELECT BTRIM(x) FROM jsonb_array_elements_text(slot) x WHERE BTRIM(x) <> '')
                      ELSE ARRAY[BTRIM(slot #>> '{}')] END;
        opts  := ARRAY(SELECT i FROM generate_subscripts(p_built, 1) i
                        WHERE BTRIM(COALESCE(p_built[i], '')) = ANY (codes)
                        ORDER BY i);
        IF COALESCE(array_length(opts, 1), 0) = 0 THEN
            RETURN NULL;
        END IF;
        cand := cand || jsonb_build_array(to_jsonb(opts));
    END LOOP;

    pos    := array_fill(0, ARRAY[n]);
    chosen := array_fill(0, ARRAY[n]);
    used   := array_fill(FALSE, ARRAY[m]);
    j := 1;
    WHILE j BETWEEN 1 AND n LOOP
        IF chosen[j] > 0 THEN
            used[chosen[j]] := FALSE;
            chosen[j] := 0;
        END IF;
        found := FALSE;
        k := pos[j] + 1;
        WHILE k <= jsonb_array_length(cand->(j - 1)) LOOP
            idx := (cand->(j - 1)->>(k - 1))::INTEGER;
            IF NOT used[idx] THEN
                used[idx]  := TRUE;
                chosen[j]  := idx;
                pos[j]     := k;
                found      := TRUE;
                EXIT;
            END IF;
            k := k + 1;
        END LOOP;
        IF found THEN
            j := j + 1;
        ELSE
            pos[j] := 0;
            j := j - 1;
        END IF;
    END LOOP;

    IF j <= n THEN
        RETURN NULL;
    END IF;
    RETURN ARRAY(SELECT x FROM unnest(chosen) x ORDER BY x);
END;
$fn$;

-- ── 11. A sofa build at its combo price ─────────────────────────────────────
-- The ERP's recomputeTotals, at the portal's prices. Idempotent: every call
-- starts from each line's own cost (`list_cost_amount`).
CREATE OR REPLACE FUNCTION catalogue_apply_combos(p_order_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_company  BIGINT;
    v_date     DATE;
    v_changed  INTEGER := 0;
    v_n        INTEGER;
    g          RECORD;
    c          RECORD;
    v_ids      UUID[];
    v_weights  BIGINT[];
    v_qtys     NUMERIC[];
    v_total    BIGINT;
    v_sum      BIGINT;
    v_shares   BIGINT[];
    v_target   INTEGER;
    k          INTEGER;
BEGIN
    SELECT COALESCE(o.erp_company_id, 1), o.order_date INTO v_company, v_date
      FROM sales_orders o WHERE o.id = p_order_id;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- Back to each line's own cost first, so a combo that no longer matches
    -- (a price removed, a line cancelled) lets go of the lines it held.
    UPDATE sales_order_lines l
       SET cost_amount = l.list_cost_amount,
           cost_source = CASE WHEN l.list_cost_amount IS NULL THEN NULL ELSE 'catalogue' END,
           cost_detail = COALESCE(l.cost_detail, '{}'::JSONB) - 'combo'
     WHERE l.order_id = p_order_id
       AND l.cost_source = 'catalogue_combo';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_changed := v_changed + v_n;

    FOR g IN
        WITH lines AS (
            SELECT l.id, l.line_no, l.qty, COALESCE(l.list_cost_amount, 0) AS own_cost,
                   UPPER(e.base_model) AS base_model, e.module_code,
                   catalogue_height_key(l.cost_detail->>'height') AS height_key,
                   l.cost_detail->>'height' AS height,
                   COALESCE(l.cost_detail->>'tier', 'PRICE_2') AS tier
              FROM sales_order_lines l
              CROSS JOIN LATERAL catalogue_sku_for_code(v_company, l.product_code) e
             WHERE l.order_id = p_order_id
               AND e.category = 'SOFA'
               AND e.module_code IS NOT NULL
               AND COALESCE(l.cost_source, '') <> 'manual'
        )
        SELECT base_model,
               ARRAY_AGG(id ORDER BY line_no, id)          AS ids,
               ARRAY_AGG(module_code ORDER BY line_no, id) AS mods,
               ARRAY_AGG(qty ORDER BY line_no, id)         AS qtys,
               ARRAY_AGG(ROUND(own_cost * 100)::BIGINT ORDER BY line_no, id) AS weights,
               COUNT(DISTINCT tier)                        AS tiers,
               MIN(tier)                                   AS tier,
               COUNT(DISTINCT height_key)                  AS heights,
               MIN(height_key)                             AS height_key,
               MIN(height)                                 AS height,
               BOOL_OR(height_key IS NULL)                 AS unknown_height
          FROM lines
         GROUP BY base_model
    LOOP
        -- One tier and one seat height across the set, or no combo: the ERP
        -- refuses to guess which of two heights a combo was priced at.
        CONTINUE WHEN g.tiers <> 1 OR g.heights <> 1 OR g.unknown_height;

        SELECT x.* INTO c
          FROM (SELECT sc.erp_id, sc.label, sc.tier, sc.effective_from, sc.erp_created_at,
                       catalogue_match_slots(g.mods, sc.modules) AS matched,
                       (SELECT kv.value::NUMERIC
                          FROM jsonb_each_text(cp.price_by_height) kv
                         WHERE catalogue_height_key(kv.key) = g.height_key
                           AND kv.value ~ '^\d+(\.\d+)?$'
                         LIMIT 1) AS price
                  FROM erp_sofa_combos sc
                  JOIN catalogue_combo_prices cp
                    ON cp.erp_company_id = sc.erp_company_id
                   AND cp.base_model     = sc.base_model
                   AND cp.slots_key      = sc.slots_key
                   AND cp.tier           = COALESCE(sc.tier, '')
                 WHERE sc.erp_company_id = v_company
                   AND UPPER(sc.base_model) = g.base_model
                   AND sc.deleted_at IS NULL
                   AND sc.removed_at IS NULL
                   AND sc.effective_from <= COALESCE(v_date, CURRENT_DATE)
                   AND (sc.tier IS NULL OR sc.tier = g.tier)) x
         WHERE x.matched IS NOT NULL
           AND x.price IS NOT NULL
           AND x.price > 0
         ORDER BY (x.tier IS NOT NULL) DESC, x.effective_from DESC,
                  x.erp_created_at DESC NULLS LAST, x.erp_id DESC
         LIMIT 1;
        CONTINUE WHEN NOT FOUND;

        v_ids     := ARRAY(SELECT g.ids[i]     FROM unnest(c.matched) i);
        v_weights := ARRAY(SELECT g.weights[i] FROM unnest(c.matched) i);
        v_qtys    := ARRAY(SELECT g.qtys[i]    FROM unnest(c.matched) i);

        -- A combo is ONE set; line costs are line totals. Mixed quantities
        -- have no clean set count, so the modules keep their own costs
        -- (never under-book) — the ERP's own guard.
        CONTINUE WHEN (SELECT COUNT(DISTINCT GREATEST(q, 1)) FROM unnest(v_qtys) q) <> 1;

        v_total := ROUND(c.price * GREATEST(v_qtys[1], 1) * 100)::BIGINT;
        v_sum   := (SELECT SUM(GREATEST(w, 0)) FROM unnest(v_weights) w);

        -- spreadComboTotal: in proportion to each line's own cost, the
        -- rounding residual to the dearest line; evenly when nothing is costed.
        IF v_sum <= 0 THEN
            v_shares := array_fill(v_total / array_length(v_ids, 1), ARRAY[array_length(v_ids, 1)]);
        ELSE
            v_shares := ARRAY(SELECT FLOOR(GREATEST(w, 0)::NUMERIC * v_total / v_sum)::BIGINT FROM unnest(v_weights) w);
        END IF;
        v_target := 1;
        FOR k IN 2 .. array_length(v_ids, 1) LOOP
            IF v_weights[k] > v_weights[v_target] THEN
                v_target := k;
            END IF;
        END LOOP;
        v_shares[v_target] := v_shares[v_target] + (v_total - (SELECT SUM(s) FROM unnest(v_shares) s));

        FOR k IN 1 .. array_length(v_ids, 1) LOOP
            UPDATE sales_order_lines l
               SET cost_amount = v_shares[k]::NUMERIC / 100,
                   cost_source = 'catalogue_combo',
                   cost_detail = COALESCE(l.cost_detail, '{}'::JSONB) || jsonb_build_object('combo', jsonb_build_object(
                       'erp_id', c.erp_id, 'label', c.label, 'price', c.price,
                       'sets', GREATEST(v_qtys[1], 1), 'height', g.height, 'tier', g.tier,
                       'lines', array_length(v_ids, 1)))
             WHERE l.id = v_ids[k];
            v_changed := v_changed + 1;
        END LOOP;
    END LOOP;

    RETURN v_changed;
END;
$fn$;

COMMENT ON FUNCTION catalogue_apply_combos(UUID) IS
    'Re-costs one order''s sofa builds at the portal''s combo prices, the ERP''s recomputeTotals rule for rule: same base model, one tier and one seat height across the set, subset coverage (extras at their own cost), uniform qty, the combo''s total spread across the matched lines in proportion to their own costs. Idempotent — starts from list_cost_amount.';

-- ── 12. The fill trigger: every line at the portal's prices ─────────────────
-- Replaces the 2026-09-19 chain (the ERP's stamp → the SKU master → the old
-- Product List). `manual` is the one source it leaves alone.
CREATE OR REPLACE FUNCTION sales_order_lines_fill_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_company BIGINT;
    r         RECORD;
BEGIN
    IF COALESCE(NEW.cost_source, '') = 'manual' THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(o.erp_company_id, 1) INTO v_company FROM sales_orders o WHERE o.id = NEW.order_id;

    -- A pricing fault must never stop an order landing: the ERP retries a
    -- refused delivery forever. The line lands unpriced, and says why.
    BEGIN
        SELECT * INTO r
          FROM catalogue_line_cost(COALESCE(v_company, 1), NEW.product_code, NEW.item_group,
                                   NEW.description2, NEW.raw, NEW.qty);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'catalogue_line_cost failed for % on order %: %', NEW.product_code, NEW.order_id, SQLERRM;
        NEW.list_cost_amount := NULL;
        NEW.cost_amount      := NULL;
        NEW.cost_source      := NULL;
        NEW.cost_detail      := jsonb_build_object('reason', 'error', 'message', LEFT(SQLERRM, 200));
        RETURN NEW;
    END;

    NEW.list_cost_amount := r.cost;
    NEW.cost_amount      := r.cost;
    NEW.cost_source      := CASE WHEN r.cost IS NULL THEN NULL ELSE 'catalogue' END;
    NEW.cost_detail      := r.detail;
    RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION sales_order_lines_fill_cost() IS
    'BEFORE INSERT on sales_order_lines: prices the line from the Product List (catalogue_line_cost) — never from the ERP''s own stamp. Every write path lands here: the live feed, a file import, a replay.';

-- ── 13. …and each sofa build at its combo, once the order's lines are in ────
-- DEFERRED to commit, so it runs after the LAST line of the order has been
-- inserted, whatever order the ingest wrote them in. Once per order per
-- transaction: the first firing re-costs the whole order.
CREATE OR REPLACE FUNCTION sales_order_lines_apply_combos()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_flag TEXT := 'catalogue.combos_' || REPLACE(NEW.order_id::TEXT, '-', '');
BEGIN
    IF current_setting(v_flag, TRUE) = 'done' THEN
        RETURN NULL;
    END IF;
    PERFORM set_config(v_flag, 'done', TRUE);
    -- At COMMIT of the delivery that inserted the lines: a fault here would
    -- refuse the whole order, so it is reported and the modules keep their
    -- own costs instead.
    BEGIN
        PERFORM catalogue_apply_combos(NEW.order_id);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'catalogue_apply_combos failed on order %: %', NEW.order_id, SQLERRM;
    END;
    RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS sales_order_lines_apply_combos ON sales_order_lines;
CREATE CONSTRAINT TRIGGER sales_order_lines_apply_combos
    AFTER INSERT ON sales_order_lines
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (UPPER(COALESCE(NEW.item_group, '')) = 'SOFA')
    EXECUTE FUNCTION sales_order_lines_apply_combos();

-- ── 14. Recost a month at today's prices ────────────────────────────────────
-- It used to FILL what had no cost. It now RE-PRICES the month: every line,
-- then every sofa build — the only way a price corrected on the Product List
-- reaches a bill that already landed. Still refuses a month whose run has
-- paid (23RUN), and the run must be computed again afterwards.
CREATE OR REPLACE FUNCTION recost_sales_order_lines(p_sub_department_id UUID, p_period DATE)
RETURNS TABLE(lines_costed INTEGER, lines_still_blind INTEGER, orders_with_cost INTEGER)
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_batch   UUID;
    v_changed INTEGER := 0;
    v_order   UUID;
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

    WITH priced AS (
        SELECT sl.id, r.cost, r.detail
          FROM sales_order_lines sl
          JOIN sales_orders o ON o.id = sl.order_id
          CROSS JOIN LATERAL catalogue_line_cost(COALESCE(o.erp_company_id, 1), sl.product_code, sl.item_group,
                                                 sl.description2, sl.raw, sl.qty) r
         WHERE o.batch_id = v_batch
           AND COALESCE(sl.cost_source, '') <> 'manual'
    )
    UPDATE sales_order_lines sl
       SET list_cost_amount = p.cost,
           cost_amount      = p.cost,
           cost_source      = CASE WHEN p.cost IS NULL THEN NULL ELSE 'catalogue' END,
           cost_detail      = p.detail
      FROM priced p
     WHERE sl.id = p.id
       AND (sl.cost_amount      IS DISTINCT FROM p.cost
         OR sl.list_cost_amount IS DISTINCT FROM p.cost
         OR sl.cost_detail      IS DISTINCT FROM p.detail
         OR sl.cost_source      IS DISTINCT FROM CASE WHEN p.cost IS NULL THEN NULL ELSE 'catalogue' END);
    GET DIAGNOSTICS v_changed = ROW_COUNT;

    FOR v_order IN
        SELECT DISTINCT o.id
          FROM sales_orders o
          JOIN sales_order_lines sl ON sl.order_id = o.id
         WHERE o.batch_id = v_batch
           AND UPPER(COALESCE(sl.item_group, '')) = 'SOFA'
    LOOP
        PERFORM catalogue_apply_combos(v_order);
    END LOOP;

    RETURN QUERY
    SELECT v_changed,
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

COMMENT ON FUNCTION recost_sales_order_lines(UUID, DATE) IS
    'Re-prices one sub-department''s month from the Product List: every line (catalogue_line_cost), then every sofa build (catalogue_apply_combos). Refuses a paid month (23RUN). Returns lines changed, lines still without a cost, bills fully costed.';

-- ── 15. The one lookup's old names ──────────────────────────────────────────
-- Kept, pointed at the portal's price, so nothing that asks by the old name
-- gets the old chain.
CREATE OR REPLACE FUNCTION comm_product_unit_cost(p_code TEXT, p_seat_height TEXT DEFAULT NULL, p_fabric_tier TEXT DEFAULT NULL)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT u.unit_price FROM catalogue_unit_price(1, p_code, p_seat_height, p_fabric_tier) u;
$fn$;

CREATE OR REPLACE FUNCTION comm_product_cost_source(p_code TEXT, p_seat_height TEXT DEFAULT NULL, p_fabric_tier TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT CASE WHEN u.unit_price IS NULL THEN NULL ELSE 'catalogue' END
      FROM catalogue_unit_price(1, p_code, p_seat_height, p_fabric_tier) u;
$fn$;

DROP FUNCTION IF EXISTS erp_resolve_unit_cost(TEXT, TEXT, TEXT);

-- ── 16. What nothing could price — the work lists ───────────────────────────
-- Both now say which of three things is wrong, per code: not in the ERP's SKU
-- master at all; in it with no portal price; priced as a sofa grid but the
-- line named no seat height the grid knows.
DROP FUNCTION IF EXISTS revenue_costing_gaps(DATE, DATE);

CREATE FUNCTION revenue_costing_gaps(p_from DATE, p_to DATE)
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
    has_price       BOOLEAN,
    reason          TEXT,
    erp_product_id  TEXT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    WITH gaps AS (
        SELECT l.product_code                                        AS item_code,
               MIN(l.item_group)                                     AS item_group,
               MIN(l.product_name)                                   AS product_name,
               MIN(l.brand_code)                                     AS brand_code,
               COUNT(*)                                              AS lines,
               COUNT(DISTINCT l.order_id)                            AS bills,
               ROUND(SUM(l.qty), 3)                                  AS qty,
               ROUND(SUM(l.line_amount), 2)                          AS revenue,
               MODE() WITHIN GROUP (ORDER BY l.cost_detail->>'reason') AS reason,
               MIN(COALESCE(o.erp_company_id, 1))                    AS company
          FROM sales_order_lines l
          JOIN sales_orders o ON o.id = l.order_id
         WHERE o.order_date >= p_from
           AND o.order_date <  p_to
           AND NOT o.cancelled
           AND l.cost_source IS NULL
         GROUP BY l.product_code
    )
    SELECT g.item_code, g.item_group, g.product_name, g.brand_code,
           g.lines, g.bills, g.qty, g.revenue,
           e.erp_id IS NOT NULL,
           EXISTS (SELECT 1 FROM catalogue_skus s
                    WHERE s.erp_product_id = e.erp_id
                      AND (s.price IS NOT NULL OR jsonb_array_length(COALESCE(s.price_grid, '[]'::JSONB)) > 0)),
           COALESCE(g.reason, CASE WHEN e.erp_id IS NULL THEN 'not_in_sku_master' ELSE 'unpriced' END),
           e.erp_id
      FROM gaps g
      LEFT JOIN LATERAL catalogue_sku_for_code(g.company, g.item_code) e ON TRUE
     ORDER BY g.revenue DESC, g.lines DESC;
$fn$;

COMMENT ON FUNCTION revenue_costing_gaps(DATE, DATE) IS
    'Codes sold in a window that nothing could price (cost_source IS NULL), worth-first, with why: not_in_sku_master / unpriced / no_height.';

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
    in_sku_master   BOOLEAN,
    has_price       BOOLEAN,
    reason          TEXT,
    erp_product_id  TEXT
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
               COUNT(DISTINCT sl.order_id)::INTEGER       AS orders,
               MODE() WITHIN GROUP (ORDER BY sl.cost_detail->>'reason') AS reason,
               MIN(COALESCE(o.erp_company_id, 1))         AS company
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
    SELECT b.product_code, b.product_name, b.item_group, b.commissionable,
           b.lines, b.qty, b.amount, b.orders,
           e.erp_id IS NOT NULL,
           EXISTS (SELECT 1 FROM catalogue_skus s
                    WHERE s.erp_product_id = e.erp_id
                      AND (s.price IS NOT NULL OR jsonb_array_length(COALESCE(s.price_grid, '[]'::JSONB)) > 0)),
           COALESCE(b.reason, CASE WHEN e.erp_id IS NULL THEN 'not_in_sku_master' ELSE 'unpriced' END),
           e.erp_id
      FROM blind b
      LEFT JOIN LATERAL catalogue_sku_for_code(b.company, b.product_code) e ON TRUE
     ORDER BY b.commissionable DESC, b.amount DESC;
$fn$;

GRANT EXECUTE ON FUNCTION revenue_costing_gaps(DATE, DATE)             TO authenticated;
GRANT EXECUTE ON FUNCTION revenue_uncosted_products(UUID, DATE)        TO authenticated;
GRANT EXECUTE ON FUNCTION comm_product_unit_cost(TEXT, TEXT, TEXT)     TO authenticated;
GRANT EXECUTE ON FUNCTION comm_product_cost_source(TEXT, TEXT, TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION catalogue_unit_price(BIGINT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION catalogue_line_facts(TEXT, JSONB)            TO authenticated;

-- ── 17. The ingest, without the columns §0 dropped ──────────────────────────
-- Identical to 20260924020000 §13 except that it no longer writes
-- erp_sofa_combos' customer / supplier / money columns, which are gone.
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
                erp_id, erp_company_id, base_model, modules, slots_key, tier, label, heights,
                effective_from, erp_created_at, deleted_at, synced_at, removed_at, raw)
            SELECT i.erp_id, v_company, i.base_model, i.modules, erp_combo_slots_key(i.modules), i.tier,
                   i.label, i.heights, i.effective_from, i.erp_created_at, i.deleted_at, v_now, NULL, i.raw
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

    v_adopted := catalogue_adopt_legacy(v_company);

    RETURN v_result || jsonb_build_object('adopted', v_adopted);
END;
$fn$;

REVOKE ALL ON FUNCTION ingest_erp_catalogue(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ingest_erp_catalogue(JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ═══ DOWN ════════════════════════════════════════════════════════════════════
-- The pre-2026-09-24 cost chain is 20260919020000 (comm_product_unit_cost,
-- sales_order_lines_fill_cost, recost_sales_order_lines,
-- revenue_uncosted_products) over 20260919010000 (erp_resolve_unit_cost,
-- revenue_costing_gaps) — re-run those definitions, then:
--
-- DROP TRIGGER IF EXISTS sales_order_lines_apply_combos ON sales_order_lines;
-- DROP FUNCTION IF EXISTS sales_order_lines_apply_combos();
-- DROP FUNCTION IF EXISTS catalogue_apply_combos(UUID);
-- DROP FUNCTION IF EXISTS catalogue_match_slots(TEXT[], JSONB);
-- DROP FUNCTION IF EXISTS catalogue_line_cost(BIGINT, TEXT, TEXT, TEXT, JSONB, NUMERIC);
-- DROP FUNCTION IF EXISTS catalogue_line_surcharge(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT[]);
-- DROP FUNCTION IF EXISTS catalogue_option_price(BIGINT, TEXT, TEXT);
-- DROP FUNCTION IF EXISTS catalogue_unit_price(BIGINT, TEXT, TEXT, TEXT);
-- DROP FUNCTION IF EXISTS catalogue_grid_price(JSONB, TEXT, TEXT);
-- DROP FUNCTION IF EXISTS catalogue_sku_for_code(BIGINT, TEXT);
-- DROP FUNCTION IF EXISTS catalogue_fabric_tier(BIGINT, TEXT, TEXT);
-- DROP FUNCTION IF EXISTS catalogue_line_facts(TEXT, JSONB);
-- DROP FUNCTION IF EXISTS catalogue_value_key(TEXT);
-- DROP FUNCTION IF EXISTS catalogue_height_key(TEXT);
-- ALTER TABLE sales_order_lines DROP COLUMN IF EXISTS list_cost_amount, DROP COLUMN IF EXISTS cost_detail;
-- (the dropped erp_* money columns held nothing; re-add them only with 20260919010000)
