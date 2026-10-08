-- A combo is EXACTLY its set (2026-10-08, user chose "完全一样才算").
--
-- The costing took a combo whenever the bill's sofa pieces COVERED it — the
-- ERP's rule, extras at their own price — so a 3+2+1 bill matched both "3+2"
-- and "3+2+1", and the newest one won: among the 76 adopted from the ERP, all
-- adopted at one moment, that was a random id. Now:
--
--   * catalogue_apply_combos takes a combo only when every sofa piece of the
--     model on the bill fills one of its slots — nothing more, nothing less.
--     A 3+2+1 bill takes "3+2+1"; with only "3+2" priced it takes none and
--     each module keeps its own cost. The TypeScript twin (pickCombo, the
--     member calculator) answers the same.
--   * catalogue_combos_collide(a, b): could ONE bill match both exactly? Same
--     number of pieces, and the pieces pair up so each pair shares a module.
--     ("1A(R) (LHF or RHF) + 1NA" and "1A(R)(LHF) + 1NA" collide; "3+2" and
--     "3+2+1" do not.) On 2026-10-08 none of the 62 live sets collide.
--   * catalogue_add_combo refuses a set that collides with one the model
--     already has, so one bill always meets one combo at most.
--
-- Nothing changes for any bill today: no combo has a price yet. Bodies built
-- from production's (md5 checked before and after).

BEGIN;

DO $$
DECLARE
    v_apply TEXT;
    v_add   TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_apply
      FROM pg_proc WHERE oid = 'public.catalogue_apply_combos(uuid)'::regprocedure;
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_add
      FROM pg_proc WHERE oid = 'public.catalogue_add_combo(text, jsonb, text, jsonb)'::regprocedure;
    IF v_apply IS DISTINCT FROM '65ee0f2f089660940fbdeaf4b6d1d136' AND v_apply IS DISTINCT FROM '1d15a6e075ecdbcbb4fb7615524473cc' THEN
        RAISE EXCEPTION 'catalogue_apply_combos drifted from the repo (md5 %) — compare before replacing it', v_apply;
    END IF;
    IF v_add IS DISTINCT FROM 'af24888148f8ec5d8ed3996e7249caa0' AND v_add IS DISTINCT FROM 'd597904340a301ccd42226108f56978d' THEN
        RAISE EXCEPTION 'catalogue_add_combo drifted from the repo (md5 %) — compare before replacing it', v_add;
    END IF;
END $$;

-- ── 1. Could one bill match both? ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION catalogue_combos_collide(p_a JSONB, p_b JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $collide$
    WITH a AS (
        SELECT i, p_a->i AS slot FROM generate_series(0, jsonb_array_length(p_a) - 1) i
    ), adj AS (
        -- Per slot of A: the slots of B it shares a module with, as codes the
        -- slot matcher can take ("b0", "b1", …).
        SELECT a.i,
               (SELECT jsonb_agg('b' || j ORDER BY j)
                  FROM generate_series(0, jsonb_array_length(p_b) - 1) j
                 WHERE EXISTS (SELECT 1
                                 FROM jsonb_array_elements_text(a.slot) x
                                 JOIN jsonb_array_elements_text(p_b->j) y ON BTRIM(x) = BTRIM(y))) AS codes
          FROM a
    )
    SELECT jsonb_typeof(p_a) = 'array' AND jsonb_typeof(p_b) = 'array'
       AND jsonb_array_length(p_a) > 0
       AND jsonb_array_length(p_a) = jsonb_array_length(p_b)
       AND NOT EXISTS (SELECT 1 FROM adj WHERE codes IS NULL)
       AND catalogue_match_slots(
               ARRAY(SELECT 'b' || j FROM generate_series(0, jsonb_array_length(p_b) - 1) j ORDER BY j),
               (SELECT jsonb_agg(codes ORDER BY i) FROM adj)) IS NOT NULL
$collide$;

COMMENT ON FUNCTION catalogue_combos_collide(JSONB, JSONB) IS
    'Two combos'' slots (one module, or the modules a piece may be): TRUE when a single bill could match both exactly — the same number of pieces, paired so each pair shares a module. catalogue_add_combo refuses such a set (2026-10-08: one bill, one combo).';

REVOKE ALL ON FUNCTION catalogue_combos_collide(JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION catalogue_combos_collide(JSONB, JSONB) TO authenticated, service_role;

-- ── 2. The costing takes exactly the set ────────────────────────────────────
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
                       -- A usable price at the build's height: a zero or a
                       -- word under another spelling of it never hides one.
                       (SELECT kv.value::NUMERIC
                          FROM jsonb_each_text(cp.price_by_height) kv
                         WHERE catalogue_height_key(kv.key) = g.height_key
                           AND CASE WHEN kv.value ~ '^\d+(\.\d+)?$' THEN kv.value::NUMERIC > 0 ELSE FALSE END
                         LIMIT 1) AS price
                  FROM catalogue_live_combos sc
                  JOIN catalogue_combo_prices cp
                    ON cp.erp_company_id = sc.erp_company_id
                   AND cp.base_model     = sc.base_model
                   AND cp.slots_key      = sc.slots_key
                   AND cp.tier           = COALESCE(sc.tier, '')
                 WHERE sc.erp_company_id = v_company
                   AND UPPER(sc.base_model) = g.base_model
                   AND sc.effective_from <= COALESCE(v_date, CURRENT_DATE)
                   AND (sc.tier IS NULL OR sc.tier = g.tier)) x
         WHERE x.matched IS NOT NULL
           -- Exactly the set (user 2026-10-08: 完全一样才算): every sofa piece of
           -- the model on the bill fills one of its slots. A bill with a piece
           -- more or a piece less keeps its modules' own costs.
           AND cardinality(x.matched) = cardinality(g.mods)
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

-- ── 3. One bill, one combo ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION catalogue_add_combo(p_base_model TEXT, p_modules JSONB, p_label TEXT, p_prices JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $add$
DECLARE
    v_company BIGINT := 1;
    v_model   TEXT := UPPER(BTRIM(COALESCE(p_base_model, '')));
    v_label   TEXT := BTRIM(COALESCE(p_label, ''));
    v_key     TEXT;
    v_code    TEXT;
    v_tier    TEXT;
    v_prices  JSONB;
    v_heights TEXT[];
    v_n       INTEGER := 0;
    v_clash   TEXT;
BEGIN
    IF v_model = '' THEN
        RAISE EXCEPTION 'Pick a sofa model.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_modules) IS DISTINCT FROM 'array' OR jsonb_array_length(p_modules) < 2 THEN
        RAISE EXCEPTION 'Add at least two compartments.' USING ERRCODE = '22023';
    END IF;
    IF v_label = '' THEN
        RAISE EXCEPTION 'Give the set a name.' USING ERRCODE = '22023';
    END IF;

    -- A piece is one module of this model's sofa SKUs, or up to four it may be
    -- instead — the left or the right of a pair (2026-10-08), the ERP's own
    -- shape for a slot: ["1A(R)(LHF)", "1A(R)(RHF)"].
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_modules) s
                WHERE jsonb_typeof(s) <> 'array' OR jsonb_array_length(s) = 0) THEN
        RAISE EXCEPTION 'Each piece is one compartment.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_modules) s WHERE jsonb_array_length(s) > 4) THEN
        RAISE EXCEPTION 'A compartment may be one of four modules at most.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_modules) s, jsonb_array_elements(s) e
                WHERE jsonb_typeof(e) <> 'string' OR BTRIM(e #>> '{}') = '') THEN
        RAISE EXCEPTION 'Each piece is one compartment.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_modules) s
                WHERE (SELECT count(DISTINCT BTRIM(e #>> '{}')) FROM jsonb_array_elements(s) e) <> jsonb_array_length(s)) THEN
        RAISE EXCEPTION 'A compartment names the same module twice.' USING ERRCODE = '22023';
    END IF;
    FOR v_code IN
        SELECT DISTINCT BTRIM(e #>> '{}')
          FROM jsonb_array_elements(p_modules) s, jsonb_array_elements(s) e
    LOOP
        PERFORM 1
           FROM erp_products p
          WHERE p.erp_company_id = v_company
            AND UPPER(BTRIM(COALESCE(p.base_model, ''))) = v_model
            AND UPPER(COALESCE(p.category, '')) = 'SOFA'
            AND p.module_code = v_code
            AND p.removed_at IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Model % has no compartment %.', v_model, v_code USING ERRCODE = '22023';
        END IF;
    END LOOP;

    v_key := erp_combo_slots_key(p_modules);
    IF EXISTS (SELECT 1 FROM catalogue_live_combos c
                WHERE c.erp_company_id = v_company AND UPPER(c.base_model) = v_model AND c.slots_key = v_key) THEN
        RAISE EXCEPTION 'This model already has a combo with these compartments.' USING ERRCODE = '22023';
    END IF;
    -- One bill, one combo (2026-10-08): a set a single bill could match
    -- exactly as well as an existing one — "1A(R) (LHF or RHF) + 1NA" beside
    -- "1A(R)(LHF) + 1NA" — would leave the costing to pick between them.
    SELECT c.label INTO v_clash
      FROM catalogue_live_combos c
     WHERE c.erp_company_id = v_company AND UPPER(c.base_model) = v_model
       AND catalogue_combos_collide(p_modules, c.modules)
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Model % already has a combo for these pieces: "%".', v_model, v_clash USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM catalogue_live_combos c
                WHERE c.erp_company_id = v_company AND UPPER(c.base_model) = v_model
                  AND LOWER(BTRIM(COALESCE(c.label, ''))) = LOWER(v_label)) THEN
        RAISE EXCEPTION 'Model % already has a set called "%".', v_model, v_label USING ERRCODE = '22023';
    END IF;

    FOREACH v_tier IN ARRAY ARRAY['PRICE_1', 'PRICE_2', 'PRICE_3'] LOOP
        SELECT jsonb_object_agg(BTRIM(e.key), (e.value #>> '{}')::NUMERIC), array_agg(BTRIM(e.key) ORDER BY e.key)
          INTO v_prices, v_heights
          FROM jsonb_each(CASE WHEN jsonb_typeof(p_prices->v_tier) = 'object' THEN p_prices->v_tier ELSE '{}'::JSONB END) e
         WHERE BTRIM(e.key) <> ''
           AND (e.value #>> '{}') ~ '^\d+(\.\d{1,2})?$'
           AND (e.value #>> '{}')::NUMERIC > 0;
        CONTINUE WHEN v_prices IS NULL;
        INSERT INTO catalogue_combos (erp_company_id, base_model, modules, tier, label, heights)
        VALUES (v_company, v_model, p_modules, v_tier, v_label, v_heights);
        INSERT INTO catalogue_combo_prices (erp_company_id, base_model, slots_key, tier, price_by_height, updated_by, updated_at)
        VALUES (v_company, v_model, v_key, v_tier, v_prices, auth.uid(), now())
        ON CONFLICT (erp_company_id, base_model, slots_key, tier)
        DO UPDATE SET price_by_height = EXCLUDED.price_by_height, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;
        v_n := v_n + cardinality(v_heights);
    END LOOP;

    IF v_n = 0 THEN
        RAISE EXCEPTION 'Fill at least one price.' USING ERRCODE = '22023';
    END IF;
    RETURN v_n;
END;
$add$;

COMMENT ON FUNCTION catalogue_add_combo(TEXT, JSONB, TEXT, JSONB) IS
    'Product List › Combo Pricing › Add combo (2026-10-08): a sofa set in one transaction — a catalogue_combos row and a catalogue_combo_prices row per fabric tier with a positive price. A piece is one module or up to four it may be instead (the left or the right of a pair). Refuses (22023) a model or module that is not a sofa''s, a module twice in a piece, a set or a name the model already has, and a set one bill could match as well as an existing one (catalogue_combos_collide).';

REVOKE ALL ON FUNCTION catalogue_add_combo(TEXT, JSONB, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION catalogue_add_combo(TEXT, JSONB, TEXT, JSONB) TO authenticated;

-- ── 4. What landed is what this file says ───────────────────────────────────
DO $$
DECLARE
    v_md5 TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5
      FROM pg_proc WHERE oid = 'public.catalogue_apply_combos(uuid)'::regprocedure;
    IF v_md5 IS DISTINCT FROM '1d15a6e075ecdbcbb4fb7615524473cc' THEN
        RAISE EXCEPTION 'catalogue_apply_combos landed as %', v_md5;
    END IF;
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5
      FROM pg_proc WHERE oid = 'public.catalogue_add_combo(text, jsonb, text, jsonb)'::regprocedure;
    IF v_md5 IS DISTINCT FROM 'd597904340a301ccd42226108f56978d' THEN
        RAISE EXCEPTION 'catalogue_add_combo landed as %', v_md5;
    END IF;
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5
      FROM pg_proc WHERE oid = 'public.catalogue_combos_collide(jsonb, jsonb)'::regprocedure;
    IF v_md5 IS DISTINCT FROM '162a457c511ac7cca35745e519379284' THEN
        RAISE EXCEPTION 'catalogue_combos_collide landed as %', v_md5;
    END IF;
    -- No two live sets one bill could match.
    IF EXISTS (
        WITH sets AS (
            SELECT DISTINCT ON (base_model, slots_key) base_model, slots_key, modules
              FROM catalogue_combos WHERE removed_at IS NULL
             ORDER BY base_model, slots_key, created_at)
        SELECT 1 FROM sets a JOIN sets b ON a.base_model = b.base_model AND a.slots_key < b.slots_key
         WHERE catalogue_combos_collide(a.modules, b.modules)) THEN
        RAISE EXCEPTION 'two live combo sets collide — remove one before this rule';
    END IF;
END $$;

COMMIT;
