-- ============================================================================
-- 20261108020000_gwp_gift_quantities.sql
-- Product List › GWP: each gift carries its own quantity (2026-11-08).
-- ============================================================================
--
-- The user, on the tab's gift list the night it went live (a screenshot, the ticks circled): "我这里换成就是
-- Quantity，就可以加 1、加 2、加 3 这样子" — a gift is counted, not ticked: a mattress protector ×1, pillows ×2.
-- 20261108010000 gave a GWP one number for all its gifts together (`qty_per_unit`, "任选共 N 个"); now each gift
-- has its own, per unit bought, and its lines take that allowance alone.
--
--   1. catalogue_gwp_items.qty          a gift's units per unit bought (1–100); a bought SKU's is NULL. A GWP saved
--                                       before takes its qty_per_unit on each gift (production had none).
--      catalogue_gwp.qty_per_unit       retired: kept, NULL on a new GWP, for the code deployed before this one,
--                                       which reads a GWP without it as none — no figure it shows can be wrong.
--   2. catalogue_save_gwp(id, changes)  {buy, gifts: [{id, qty}]}; the shape before ({qty, gift}) is told to
--                                       reload the page.
--   3. sales_order_gwp_free(orders)     each gift its own allowance (twin: gwpFreeUnits, lib/catalogue/gwp.ts)
--   4. member_quote_cost_rules          gwp: [{ id, buy: [codes], gifts: [{ code, perUnit }] }]
--
-- revenue_month_orders and member_order_facts_with_old_bills read sales_order_gwp_free as before: untouched.
-- Nothing moves today: no GWP exists.
--
-- Made from PRODUCTION's bodies (md5(prosrc) as it stands since 20261108011500), refused if one has changed since;
-- a second run changes nothing. Applied LF (an LF copy to `db query -f`). Checked at the end:
--
--   catalogue_save_gwp(uuid, jsonb)   9769e1ae67c9a0516e2613d3a924c539 → 6f9850c635b623868cb1c1ba3bcf6ad4
--   sales_order_gwp_free(uuid[])      658722b990b11b99acc37995ce8dc8f3 → defa093c0cd313e1e330dcdd603b54d5
--   member_quote_cost_rules(uuid)     9973901db6f5109566723a1ed4ad2b67 → d300e873e6ddc7eb8c9cb5461d92533e
--
-- PGlite: tests/member-sql/validate-gifts-with-purchase.mjs (after 20261108010000 and 011500, this one verbatim,
-- twice).

BEGIN;

-- Production's bodies, or this migration's own once it has run.
DO $$
DECLARE
  r record;
  v_md5 text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.catalogue_save_gwp(uuid, jsonb)', '9769e1ae67c9a0516e2613d3a924c539', '6f9850c635b623868cb1c1ba3bcf6ad4'),
      ('public.sales_order_gwp_free(uuid[])', '658722b990b11b99acc37995ce8dc8f3', 'defa093c0cd313e1e330dcdd603b54d5'),
      ('public.member_quote_cost_rules(uuid)', '9973901db6f5109566723a1ed4ad2b67', 'd300e873e6ddc7eb8c9cb5461d92533e')
    ) AS t(sig, before_md5, after_md5)
  LOOP
    IF to_regprocedure(r.sig) IS NULL THEN
      RAISE EXCEPTION '% is not on this database', r.sig;
    END IF;
    SELECT md5(prosrc) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(r.sig);
    IF v_md5 IS DISTINCT FROM r.before_md5 AND v_md5 IS DISTINCT FROM r.after_md5 THEN
      RAISE EXCEPTION '% is md5 %, not the body this migration was written from', r.sig, v_md5;
    END IF;
  END LOOP;
END $$;

-- ── 1. Each gift its quantity ───────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.catalogue_gwp_items ADD COLUMN IF NOT EXISTS qty INTEGER;
UPDATE public.catalogue_gwp_items i
   SET qty = g.qty_per_unit
  FROM public.catalogue_gwp g
 WHERE i.gwp_id = g.id AND i.role = 'gift' AND i.qty IS NULL AND g.qty_per_unit IS NOT NULL;
ALTER TABLE public.catalogue_gwp_items DROP CONSTRAINT IF EXISTS catalogue_gwp_items_qty;
ALTER TABLE public.catalogue_gwp_items ADD CONSTRAINT catalogue_gwp_items_qty
  CHECK ((role = 'buy' AND qty IS NULL) OR (role = 'gift' AND qty BETWEEN 1 AND 100));
COMMENT ON COLUMN public.catalogue_gwp_items.qty IS
    'A gift''s units per unit of its GWP''s bought SKUs on a bill (1–100; the user: "加 1、加 2、加 3"); NULL on a bought SKU (2026-11-08, 20261108020000).';

ALTER TABLE public.catalogue_gwp ALTER COLUMN qty_per_unit DROP NOT NULL;
COMMENT ON COLUMN public.catalogue_gwp.qty_per_unit IS
    'Retired 2026-11-08 (20261108020000): each gift carries its own quantity (catalogue_gwp_items.qty). NULL on a GWP saved since; kept for the code deployed before.';
COMMENT ON TABLE public.catalogue_gwp IS
    'A gift with purchase (Product List › GWP, 2026-11-08): each unit of its buy SKUs on a bill (or a Quote''s cart) earns, of each of its gifts, that gift''s quantity, whose cost the margin does not count — cheapest first, any line of it, every bill (no dates). Every sub-department alike.';
COMMENT ON TABLE public.catalogue_gwp_items IS
    'A GWP''s SKUs (Product List › GWP): role buy — a SKU whose purchase earns it; role gift — a gift, with its quantity a unit bought (qty). Matched on the code a sales line carries.';

-- ── 2. Product List › GWP's Save ────────────────────────────────────────────────────────────────────────────────────
-- p_id NULL makes one (buy and gifts both needed); else only the keys sent change it — buy (the whole set of SKUs
-- bought), gifts (the whole set given, [{id, qty}]) — or {"remove": true} takes it away. SECURITY INVOKER: the
-- tables' policies decide (Product List · Edit). What names a SKU is read here, never taken from the caller.
CREATE OR REPLACE FUNCTION public.catalogue_save_gwp(p_id UUID, p_changes JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
DECLARE
    v_id    UUID := p_id;
    v_ids   TEXT[];
    v_bad   TEXT;
    v_gifts JSONB := p_changes->'gifts';
BEGIN
    IF p_changes IS NULL OR jsonb_typeof(p_changes) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Nothing to save' USING ERRCODE = '22023';
    END IF;

    -- Taken away: its SKUs go with it.
    IF p_changes->'remove' = 'true'::jsonb THEN
        DELETE FROM catalogue_gwp WHERE id = v_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'This GWP is no longer on the list' USING ERRCODE = 'P0002';
        END IF;
        RETURN v_id;
    END IF;

    -- The shape before each gift had its quantity (one number for every gift): a page opened before then.
    IF p_changes ? 'qty' OR p_changes ? 'gift' THEN
        RAISE EXCEPTION 'This page is out of date: reload it' USING ERRCODE = '22023';
    END IF;
    IF NOT (p_changes ? 'buy' OR p_changes ? 'gifts') THEN
        RAISE EXCEPTION 'Nothing to save' USING ERRCODE = '22023';
    END IF;

    -- The gifts, checked before anything is written: [{id, qty}], each qty a whole number from 1 to 100.
    IF p_changes ? 'gifts' THEN
        IF jsonb_typeof(v_gifts) IS DISTINCT FROM 'array' OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(v_gifts) e
             WHERE jsonb_typeof(e) IS DISTINCT FROM 'object'
                OR jsonb_typeof(e->'id') IS DISTINCT FROM 'string'
                OR BTRIM(e->>'id') = '') THEN
            RAISE EXCEPTION 'Gifts is a list of SKUs, each with how many' USING ERRCODE = '22023';
        END IF;
        IF EXISTS (
            SELECT 1 FROM jsonb_array_elements(v_gifts) e,
                   LATERAL (SELECT CASE WHEN jsonb_typeof(e->'qty') = 'number' THEN (e->>'qty')::NUMERIC END AS n) q
             WHERE q.n IS NULL OR q.n <> TRUNC(q.n) OR q.n NOT BETWEEN 1 AND 100) THEN
            RAISE EXCEPTION 'Each gift is a whole number from 1 to 100' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF v_id IS NULL THEN
        IF NOT (p_changes ? 'buy') OR NOT (p_changes ? 'gifts') THEN
            RAISE EXCEPTION 'A new GWP needs what is bought and its gifts' USING ERRCODE = '22023';
        END IF;
        INSERT INTO catalogue_gwp (created_by, updated_by)
        VALUES (auth.uid(), auth.uid())
        RETURNING id INTO v_id;
    ELSE
        UPDATE catalogue_gwp SET updated_by = auth.uid(), updated_at = now() WHERE id = v_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'This GWP is no longer on the list' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    -- What is bought: the whole set.
    IF p_changes ? 'buy' THEN
        IF jsonb_typeof(p_changes->'buy') IS DISTINCT FROM 'array' OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(p_changes->'buy') e WHERE jsonb_typeof(e) IS DISTINCT FROM 'string') THEN
            RAISE EXCEPTION 'Bought is a list of SKUs' USING ERRCODE = '22023';
        END IF;
        v_ids := ARRAY(SELECT DISTINCT e FROM jsonb_array_elements_text(p_changes->'buy') AS e);
        IF COALESCE(CARDINALITY(v_ids), 0) = 0 THEN
            RAISE EXCEPTION 'Pick the SKUs bought' USING ERRCODE = '22023';
        END IF;
        SELECT x INTO v_bad FROM unnest(v_ids) AS x WHERE NOT EXISTS (SELECT 1 FROM erp_products p WHERE p.erp_id = x) LIMIT 1;
        IF FOUND THEN
            RAISE EXCEPTION 'SKU % is not in the SKU Master', v_bad USING ERRCODE = '23503';
        END IF;
        DELETE FROM catalogue_gwp_items i WHERE i.gwp_id = v_id AND i.role = 'buy' AND NOT (i.erp_product_id = ANY (v_ids));
        INSERT INTO catalogue_gwp_items (gwp_id, role, erp_product_id, product_code)
        SELECT v_id, 'buy', p.erp_id, p.item_code FROM erp_products p WHERE p.erp_id = ANY (v_ids)
        ON CONFLICT (gwp_id, role, erp_product_id) DO NOTHING;
    END IF;

    -- The gifts: the whole set, each at its quantity (a SKU sent twice takes its last).
    IF p_changes ? 'gifts' THEN
        v_ids := ARRAY(SELECT DISTINCT e->>'id' FROM jsonb_array_elements(v_gifts) e);
        IF COALESCE(CARDINALITY(v_ids), 0) = 0 THEN
            RAISE EXCEPTION 'Pick the gifts' USING ERRCODE = '22023';
        END IF;
        SELECT x INTO v_bad FROM unnest(v_ids) AS x WHERE NOT EXISTS (SELECT 1 FROM erp_products p WHERE p.erp_id = x) LIMIT 1;
        IF FOUND THEN
            RAISE EXCEPTION 'SKU % is not in the SKU Master', v_bad USING ERRCODE = '23503';
        END IF;
        DELETE FROM catalogue_gwp_items i WHERE i.gwp_id = v_id AND i.role = 'gift' AND NOT (i.erp_product_id = ANY (v_ids));
        INSERT INTO catalogue_gwp_items (gwp_id, role, erp_product_id, product_code, qty)
        SELECT v_id, 'gift', p.erp_id, p.item_code, g.qty
          FROM (SELECT DISTINCT ON (t.e->>'id') t.e->>'id' AS id, (t.e->>'qty')::INTEGER AS qty
                  FROM jsonb_array_elements(v_gifts) WITH ORDINALITY AS t(e, n)
                 ORDER BY t.e->>'id', t.n DESC) g
          JOIN erp_products p ON p.erp_id = g.id
        ON CONFLICT (gwp_id, role, erp_product_id) DO UPDATE SET qty = EXCLUDED.qty
         WHERE catalogue_gwp_items.qty IS DISTINCT FROM EXCLUDED.qty;
    END IF;

    -- A SKU the ERP renamed: the code its new bills carry.
    UPDATE catalogue_gwp_items i
       SET product_code = p.item_code
      FROM erp_products p
     WHERE i.gwp_id = v_id AND p.erp_id = i.erp_product_id AND i.product_code IS DISTINCT FROM p.item_code;

    -- Both sides, and no SKU on both.
    IF NOT EXISTS (SELECT 1 FROM catalogue_gwp_items WHERE gwp_id = v_id AND role = 'buy') THEN
        RAISE EXCEPTION 'Pick the SKUs bought' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM catalogue_gwp_items WHERE gwp_id = v_id AND role = 'gift') THEN
        RAISE EXCEPTION 'Pick the gifts' USING ERRCODE = '22023';
    END IF;
    SELECT b.product_code INTO v_bad
      FROM catalogue_gwp_items b
      JOIN catalogue_gwp_items g ON g.gwp_id = b.gwp_id AND g.erp_product_id = b.erp_product_id AND g.role = 'gift'
     WHERE b.gwp_id = v_id AND b.role = 'buy'
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION '% is both bought and given', v_bad USING ERRCODE = '22023';
    END IF;

    RETURN v_id;
END;
$fn$;

COMMENT ON FUNCTION public.catalogue_save_gwp(UUID, JSONB) IS
    'Product List › GWP''s Save (2026-11-08): makes a gift with purchase, changes one — only the keys sent: buy, gifts ([{id, qty}], each gift its quantity a unit bought) — or takes one away ({"remove": true}), in one transaction. SECURITY INVOKER: the tables'' policies decide (Product List · Edit).';

-- ── 3. What a purchase earns free, line by line: each gift its own allowance ───────────────────────────────────────
-- The twin of gwpFreeUnits (lib/catalogue/gwp.ts), read once for a set of bills — never once a line.
CREATE OR REPLACE FUNCTION public.sales_order_gwp_free(p_orders UUID[])
RETURNS TABLE(line_id UUID, free_qty NUMERIC)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
    WITH lines AS (
        SELECT l.id, l.order_id, UPPER(BTRIM(l.product_code)) AS code, l.qty,
               CASE WHEN l.cost_amount IS NOT NULL THEN l.cost_amount / l.qty END AS unit_cost
          FROM sales_order_lines l
         WHERE l.order_id = ANY (p_orders) AND l.qty > 0
    ), buys AS (
        SELECT DISTINCT i.gwp_id, UPPER(BTRIM(i.product_code)) AS code FROM catalogue_gwp_items i WHERE i.role = 'buy'
    ), gifts AS (
        -- Each gift its units per unit bought; a code listed twice in one GWP counts once, at its larger quantity.
        SELECT i.gwp_id, UPPER(BTRIM(i.product_code)) AS code, MAX(i.qty) AS per_unit
          FROM catalogue_gwp_items i
         WHERE i.role = 'gift' AND i.qty > 0
         GROUP BY 1, 2
    ), bought AS (
        -- Each GWP's units bought on each bill.
        SELECT b.gwp_id, l.order_id, SUM(l.qty) AS units
          FROM buys b
          JOIN lines l ON l.code = b.code
         GROUP BY 1, 2
    ), claims AS (
        -- Each gift's lines take its allowance cheapest first (a cost not known yet first of all), then by line id.
        SELECT l.id, l.qty, g.per_unit * bo.units AS units,
               COALESCE(SUM(l.qty) OVER (PARTITION BY g.gwp_id, g.code, bo.order_id
                                         ORDER BY l.unit_cost NULLS FIRST, l.id::TEXT COLLATE "C"
                                         ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS before
          FROM bought bo
          JOIN gifts g ON g.gwp_id = bo.gwp_id
          JOIN lines l ON l.order_id = bo.order_id AND l.code = g.code
    )
    SELECT c.id, LEAST(MAX(c.qty), SUM(GREATEST(LEAST(c.units - c.before, c.qty), 0)))
      FROM claims c
     GROUP BY c.id
    HAVING SUM(GREATEST(LEAST(c.units - c.before, c.qty), 0)) > 0;
$fn$;

COMMENT ON FUNCTION public.sales_order_gwp_free(UUID[]) IS
    'Product List › GWP (2026-11-08): each line of these bills a purchase earned free, in units — each gift''s allowance on a bill is its quantity × its GWP''s bought SKUs'' units there, taken by that gift''s lines cheapest first (an unknown cost first), then by line id; a line never more than wholly. Twin: gwpFreeUnits (lib/catalogue/gwp.ts).';

-- ── 4. member_quote_cost_rules: each gift with its quantity ─────────────────────────────────────────────────────────
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

-- A function made from its own body with these statements swapped, unless it is this migration's already (its md5).
CREATE OR REPLACE FUNCTION pg_temp.made_with(p_sig text, p_after text, p_swaps text[])
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_def text;
  i     integer;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(p_sig)) = p_after THEN
    RETURN;  -- made already
  END IF;
  v_def := pg_get_functiondef(to_regprocedure(p_sig));
  FOR i IN 1 .. array_length(p_swaps, 1) / 2 LOOP
    v_def := pg_temp.swap_text(v_def, p_swaps[2 * i - 1], p_swaps[2 * i]);
  END LOOP;
  EXECUTE v_def;
END
$fn$;

SELECT pg_temp.made_with('public.member_quote_cost_rules(uuid)', 'd300e873e6ddc7eb8c9cb5461d92533e', ARRAY[
    $o$'gwp',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'perUnit',g.qty_per_unit,
    'buy',(SELECT coalesce(jsonb_agg(i.product_code ORDER BY i.product_code),'[]'::jsonb)
     FROM public.catalogue_gwp_items i WHERE i.gwp_id=g.id AND i.role='buy'),
    'gift',(SELECT coalesce(jsonb_agg(i.product_code ORDER BY i.product_code),'[]'::jsonb)
     FROM public.catalogue_gwp_items i WHERE i.gwp_id=g.id AND i.role='gift'))
   ORDER BY g.created_at,g.id),'[]'::jsonb) FROM public.catalogue_gwp g));$o$,
    $n$-- (20261108020000) Each gift with its own quantity a unit bought: [{ id, buy: [codes], gifts: [{ code, perUnit }] }].
  'gwp',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,
    'buy',(SELECT coalesce(jsonb_agg(i.product_code ORDER BY i.product_code),'[]'::jsonb)
     FROM public.catalogue_gwp_items i WHERE i.gwp_id=g.id AND i.role='buy'),
    'gifts',(SELECT coalesce(jsonb_agg(jsonb_build_object('code',i.product_code,'perUnit',i.qty) ORDER BY i.product_code),'[]'::jsonb)
     FROM public.catalogue_gwp_items i WHERE i.gwp_id=g.id AND i.role='gift' AND i.qty>0))
   ORDER BY g.created_at,g.id),'[]'::jsonb) FROM public.catalogue_gwp g));$n$
  ]);

-- What this migration made is what it was written to make — md5(prosrc) as it stands, every mismatch in one refusal.
DO $$
DECLARE
  r record;
  v_md5 text;
  v_bad text := '';
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.catalogue_save_gwp(uuid, jsonb)', '6f9850c635b623868cb1c1ba3bcf6ad4'),
      ('public.sales_order_gwp_free(uuid[])', 'defa093c0cd313e1e330dcdd603b54d5'),
      ('public.member_quote_cost_rules(uuid)', 'd300e873e6ddc7eb8c9cb5461d92533e')
    ) AS t(sig, after_md5)
  LOOP
    SELECT md5(prosrc) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(r.sig);
    IF v_md5 IS DISTINCT FROM r.after_md5 THEN
      v_bad := v_bad || format(' %s ended as md5 %s;', r.sig, v_md5);
    END IF;
  END LOOP;
  IF v_bad <> '' THEN
    RAISE EXCEPTION 'Not the bodies this migration makes:%', v_bad;
  END IF;
END $$;

COMMIT;

-- Rollback, in words (the database tool refuses a migration that spells it out): put catalogue_save_gwp,
-- sales_order_gwp_free and member_quote_cost_rules back as 20261108011500 left them (md5 9769e1ae…, 658722b9…,
-- 9973901d…), give every GWP its qty_per_unit back (NOT NULL again), and take catalogue_gwp_items.qty and its check
-- away.
