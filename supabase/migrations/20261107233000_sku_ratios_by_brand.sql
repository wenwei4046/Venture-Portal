-- ============================================================================
-- 20261107233000_sku_ratios_by_brand.sql
-- A rider SKU divides its cost by a ratio of its own for each brand it is sold under (2026-11-07).
-- ============================================================================
--
-- The user, on Product List › Costing Setting: "我希望能具体针对它 right click 出来后 spread out，也就是 by brand 可以有
-- 不同的除法 … Trion 我 right click 它，可以设成 0.6 … 当然，这个只是 for 那种 rider 的 category item（比如 accessories 和
-- big frame）". Why: "不要同一个 item 在不同的 brand 卖不一样的 margin … 有人会作弊" — a bed frame or an accessory rides on a
-- bill of any brand and is judged on that brand's ladder, so a seller opens it under the brand whose ladder is easiest.
-- Then, of where it is set: "在 Costing Setting 的 SKU 清单上对 Trion 按 special add … 再按 brand 各填一个除法"; and "only
-- special set in costing select there, if didnt set, then just follow the defauly rate".
--
--   1. comm_cost_ratio_brands   a SKU's ratio for one brand of a sub-department: what its cost is divided by on a bill
--                               (or a cart) that answers to that brand's ladder
--   2. catalogue_save_cost_setting(…, p_brands)   Costing Setting's Save: the ratio, the SKUs' own and their brands', in
--                               ONE transaction (the 4-argument writer, untouched, does the first two)
--   3. member_quote_cost_rules  the calculator's rules carry them: costRatioBrands { code: { brand: ratio } }
--   4. revenue_month_orders     Comm Cal's month divides by them
--   5. member_order_facts       Insight, the Arena, Today divide by them
--
-- A LINE'S RATIO, everywhere a margin is taken (marginBase() and the calculator are the TypeScript twins,
-- lib/commission/cost-basis.ts): its SKU's ratio for the brand the bill answers to, else its SKU's own ratio, else the
-- sub-department's. The brand a bill answers to is the one whose ladder judges it, as marginBase() picks it: the bill's
-- own brand, else the brand its goods lines sell the most of (on a tie, the one whose first line comes first). A brand
-- left unset on a SKU follows the SKU's own ratio, or the sub-department's when it has none — a SKU may be listed for
-- its brands alone. Only a rider takes them (a bed frame, an accessory — every category but a mattress and a sofa, and
-- a mattress or sofa whose model Modular marks Rider): a mattress or a sofa always sells under its own brand.
--
-- NOTHING MOVES TODAY: no SKU has a ratio by brand. A month already computed moves when its run is computed again, as
-- with every ratio; Insight and Comm Cal's month read them at once.
--
-- Made from PRODUCTION's bodies (2026-11-07 KL, pg_get_functiondef, md5 of prosrc), refused if one has changed since;
-- a second run changes nothing. What each became is checked at the end:
--
--   catalogue_save_cost_setting(…, p_brands)   (new)                                  → dae898c708d208cb029c48b65b544801
--   member_quote_cost_rules                    2e7e32cdb544b400461cacc750934314       → 49c4eff9990a4bc0f48c550ecd5fda6e
--   revenue_month_orders                       3cca3cc89e13641177d59dfb8718522e       → 33b6bd204e8345202879f058bde05933
--   member_order_facts                         137eb24ba94e9c5bb49789225ff4c271       → 80efce6255c1462e2a46e794b2062d14
--
-- Dry run on production (2026-11-07 ~23:00 KL, one transaction ending in its own RAISE, nothing stayed): every
-- statement swapped found exactly once; the bodies above.
-- PGlite: tests/member-sql/validate-sku-ratios-by-brand.mjs (production's bodies, md5-checked; the migration verbatim,
-- twice).

BEGIN;

-- Production's bodies, or this migration's own once it has run.
DO $$
DECLARE
  r record;
  v_md5 text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.catalogue_save_cost_setting(uuid, numeric, jsonb, text[])', 'eb9f0116074174ee38a3ea508f0e9582', 'eb9f0116074174ee38a3ea508f0e9582'),
      ('public.member_quote_cost_rules(uuid)', '2e7e32cdb544b400461cacc750934314', '49c4eff9990a4bc0f48c550ecd5fda6e'),
      ('public.revenue_month_orders(uuid, date)', '3cca3cc89e13641177d59dfb8718522e', '33b6bd204e8345202879f058bde05933'),
      ('public.member_order_facts(uuid, date, date)', '137eb24ba94e9c5bb49789225ff4c271', '80efce6255c1462e2a46e794b2062d14')
    ) AS t(sig, before_md5, after_md5)
  LOOP
    IF to_regprocedure(r.sig) IS NULL THEN
      RAISE EXCEPTION '% is not on this database', r.sig;
    END IF;
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(r.sig);
    IF v_md5 IS DISTINCT FROM r.before_md5 AND v_md5 IS DISTINCT FROM r.after_md5 THEN
      RAISE EXCEPTION '% is md5 %, not the body this migration was written from', r.sig, v_md5;
    END IF;
  END LOOP;
END $$;

-- ── 1. comm_cost_ratio_brands ───────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comm_cost_ratio_brands (
    scheme_id      UUID         NOT NULL,
    erp_product_id TEXT         NOT NULL REFERENCES public.erp_products(erp_id),
    -- The SKU's code when it was saved: what a sales line carries (comm_cost_ratios' rule — saving follows a rename).
    product_code   TEXT         NOT NULL,
    -- The brand whose ladder the bill (or the cart) answers to: one of the sub-department's comm_brands.
    brand_code     TEXT         NOT NULL,
    ratio          NUMERIC(6,4) NOT NULL,
    updated_by     UUID         DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE SET NULL,
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (scheme_id, erp_product_id, brand_code),
    -- A brand renamed carries its ratios along; a brand (or its scheme) deleted takes them.
    CONSTRAINT cost_ratio_brand_of_scheme FOREIGN KEY (scheme_id, brand_code)
        REFERENCES public.comm_brands(scheme_id, code) ON UPDATE CASCADE ON DELETE CASCADE,
    -- The range every cost ratio has (comm_cost_ratios, revenue_cost_divisor).
    CONSTRAINT cost_ratio_brand_range CHECK (ratio > 0 AND ratio <= 10),
    CONSTRAINT cost_ratio_brand_code CHECK (BTRIM(product_code) <> '')
);

-- One ratio per code and brand in a scheme, so a line never finds two.
CREATE UNIQUE INDEX IF NOT EXISTS uq_comm_cost_ratio_brand_code
    ON public.comm_cost_ratio_brands (scheme_id, UPPER(BTRIM(product_code)), brand_code);

COMMENT ON TABLE public.comm_cost_ratio_brands IS
    'A rider SKU''s Revenue Team cost ratio for one brand of its sub-department (Product List › Costing Setting, 2026-11-07): on a bill or cart that answers to that brand''s ladder its cost ÷ this, else its own ratio (comm_cost_ratios), else the sub-department''s. Matched on the line''s product code.';

ALTER TABLE public.comm_cost_ratio_brands ENABLE ROW LEVEL SECURITY;

-- As comm_cost_ratios: the Product List's key, the admin domain, and HR — a sub-department cloned from another copies
-- them (Rules), and Comm Cal's month reads them as its reader (revenue_month_orders is SECURITY INVOKER).
DROP POLICY IF EXISTS comm_cost_ratio_brands_principal_all ON public.comm_cost_ratio_brands;
CREATE POLICY comm_cost_ratio_brands_principal_all ON public.comm_cost_ratio_brands FOR ALL TO authenticated
    USING ((SELECT has_scope(ARRAY['admin']))) WITH CHECK ((SELECT has_scope(ARRAY['admin'])));
DROP POLICY IF EXISTS comm_cost_ratio_brands_hr_all ON public.comm_cost_ratio_brands;
CREATE POLICY comm_cost_ratio_brands_hr_all ON public.comm_cost_ratio_brands FOR ALL TO authenticated
    USING ((SELECT has_scope(ARRAY['hr']))) WITH CHECK ((SELECT has_scope(ARRAY['hr'])));
DROP POLICY IF EXISTS comm_cost_ratio_brands_product_list ON public.comm_cost_ratio_brands;
CREATE POLICY comm_cost_ratio_brands_product_list ON public.comm_cost_ratio_brands FOR ALL TO authenticated
    USING ((SELECT has_perm('product_list'))) WITH CHECK ((SELECT has_perm('product_list')));

REVOKE ALL ON public.comm_cost_ratio_brands FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comm_cost_ratio_brands TO authenticated;
GRANT ALL ON public.comm_cost_ratio_brands TO service_role;

SELECT public.audit_register('comm_cost_ratio_brands', 'Costing ratios by brand', 'Catalogue', '{product_list}', 'all',
    p_keys => '{scheme_id,erp_product_id,brand_code}', p_labels => '{product_code,brand_code}');

-- Who writes and reads it: comm_cost_ratios' own lists.
INSERT INTO public.permission_table_writes (table_name, command, actions) VALUES
  ('comm_cost_ratio_brands', 'DELETE', ARRAY['revenue.manage', 'product_list.edit']),
  ('comm_cost_ratio_brands', 'INSERT', ARRAY['revenue.manage', 'product_list.edit']),
  ('comm_cost_ratio_brands', 'UPDATE', ARRAY['revenue.manage', 'product_list.edit'])
ON CONFLICT (table_name, command) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_writes_guard('comm_cost_ratio_brands');

INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('comm_cost_ratio_brands', ARRAY['product_list.edit', 'product_list.view', 'revenue.edit', 'revenue.manage', 'revenue.view:own'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_reads_guard('comm_cost_ratio_brands');

-- ── 2. Costing Setting's Save, with the brands ──────────────────────────────────────────────────────────────────────
-- The 4-argument writer does the sub-department's ratio and the SKUs' own, as it always has; this one calls it, then
-- writes the SKUs' brands, in the same transaction. p_brands: [{erp_product_id, brand_code, ratio}] — ratio NULL takes
-- that brand's ratio off the SKU. Only what changed is sent (a page open on another PC never writes back a brand it
-- did not touch). What names a SKU is read here, never taken from the caller.
CREATE OR REPLACE FUNCTION public.catalogue_save_cost_setting(
    p_scheme  UUID,
    p_divisor NUMERIC,
    p_ratios  JSONB,
    p_removes TEXT[],
    p_brands  JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
    v_touched INTEGER;
    v_n       INTEGER;
    v_bad     TEXT;
BEGIN
    IF NOT COALESCE(public.has_any_action(ARRAY['product_list.edit']), FALSE) THEN
        RAISE EXCEPTION 'Changing the cost ratios needs Product List · Edit.' USING ERRCODE = '42501';
    END IF;

    -- The sub-department's ratio and the SKUs' own.
    v_touched := public.catalogue_save_cost_setting(p_scheme, p_divisor, p_ratios, p_removes);

    -- A brand's ratio follows a SKU the ERP renamed, as its own ratio just did.
    UPDATE comm_cost_ratio_brands b
       SET product_code = p.item_code
      FROM erp_products p
     WHERE b.scheme_id = p_scheme AND p.erp_id = b.erp_product_id AND b.product_code IS DISTINCT FROM p.item_code;

    IF jsonb_typeof(p_brands) IS DISTINCT FROM 'array' OR jsonb_array_length(p_brands) = 0 THEN
        RETURN v_touched;
    END IF;

    -- Each row once.
    IF (SELECT COUNT(*) FROM jsonb_to_recordset(p_brands) AS b(erp_product_id TEXT, brand_code TEXT, ratio NUMERIC))
       <> (SELECT COUNT(DISTINCT (b.erp_product_id, b.brand_code))
             FROM jsonb_to_recordset(p_brands) AS b(erp_product_id TEXT, brand_code TEXT, ratio NUMERIC)) THEN
        RAISE EXCEPTION 'A SKU''s brand is named twice' USING ERRCODE = '22023';
    END IF;
    -- A SKU of the SKU Master …
    SELECT b.erp_product_id INTO v_bad
      FROM jsonb_to_recordset(p_brands) AS b(erp_product_id TEXT, brand_code TEXT, ratio NUMERIC)
     WHERE NOT EXISTS (SELECT 1 FROM erp_products p WHERE p.erp_id = b.erp_product_id)
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'SKU % is not in the SKU Master', v_bad USING ERRCODE = '23503';
    END IF;
    -- … under a brand this sub-department has a ladder for …
    SELECT COALESCE(b.brand_code, '—') INTO v_bad
      FROM jsonb_to_recordset(p_brands) AS b(erp_product_id TEXT, brand_code TEXT, ratio NUMERIC)
     WHERE b.ratio IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM comm_brands cb WHERE cb.scheme_id = p_scheme AND cb.code = b.brand_code AND cb.is_active)
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION '% is not a brand of this sub-department', v_bad USING ERRCODE = '22023';
    END IF;
    -- … at a ratio …
    IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_brands) AS b(erp_product_id TEXT, brand_code TEXT, ratio NUMERIC)
                WHERE b.ratio IS NOT NULL AND NOT (b.ratio > 0 AND b.ratio <= 10)) THEN
        RAISE EXCEPTION 'A cost ratio must be above 0 and at most 10' USING ERRCODE = '22023';
    END IF;
    -- … and a rider: a mattress or a sofa sells under its own brand, unless Modular marks its model Rider.
    SELECT p.item_code INTO v_bad
      FROM jsonb_to_recordset(p_brands) AS b(erp_product_id TEXT, brand_code TEXT, ratio NUMERIC)
      JOIN erp_products p ON p.erp_id = b.erp_product_id
      LEFT JOIN catalogue_models m ON m.erp_model_id = p.model_erp_id
     WHERE b.ratio IS NOT NULL
       AND UPPER(BTRIM(COALESCE(p.category, ''))) IN ('MATTRESS', 'SOFA')
       AND m.brand_code IS DISTINCT FROM 'RIDER'
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION '% sells under its own brand: only a bed frame, an accessory or another rider takes a ratio by brand', v_bad
            USING ERRCODE = '22023';
    END IF;

    DELETE FROM comm_cost_ratio_brands c
     USING jsonb_to_recordset(p_brands) AS b(erp_product_id TEXT, brand_code TEXT, ratio NUMERIC)
     WHERE b.ratio IS NULL AND c.scheme_id = p_scheme AND c.erp_product_id = b.erp_product_id AND c.brand_code = b.brand_code;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_touched := v_touched + v_n;

    INSERT INTO comm_cost_ratio_brands (scheme_id, erp_product_id, product_code, brand_code, ratio, updated_by, updated_at)
    SELECT p_scheme, b.erp_product_id, p.item_code, b.brand_code, b.ratio, auth.uid(), now()
      FROM jsonb_to_recordset(p_brands) AS b(erp_product_id TEXT, brand_code TEXT, ratio NUMERIC)
      JOIN erp_products p ON p.erp_id = b.erp_product_id
     WHERE b.ratio IS NOT NULL
    ON CONFLICT (scheme_id, erp_product_id, brand_code) DO UPDATE
       SET product_code = EXCLUDED.product_code,
           ratio        = EXCLUDED.ratio,
           updated_by   = EXCLUDED.updated_by,
           updated_at   = EXCLUDED.updated_at
     WHERE comm_cost_ratio_brands.ratio IS DISTINCT FROM EXCLUDED.ratio
        OR comm_cost_ratio_brands.product_code IS DISTINCT FROM EXCLUDED.product_code;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_touched := v_touched + v_n;

    RETURN v_touched;
END;
$fn$;

COMMENT ON FUNCTION public.catalogue_save_cost_setting(UUID, NUMERIC, JSONB, TEXT[], JSONB) IS
    'Product List › Costing Setting (2026-11-07): the 4-argument save — a sub-department''s ratio and its SKUs'' own — then the rider SKUs'' ratios by brand (comm_cost_ratio_brands; a NULL ratio takes one off), in one transaction. Product List · Edit.';

REVOKE ALL ON FUNCTION public.catalogue_save_cost_setting(UUID, NUMERIC, JSONB, TEXT[], JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalogue_save_cost_setting(UUID, NUMERIC, JSONB, TEXT[], JSONB) TO authenticated;

-- ── 3–5. The readers ────────────────────────────────────────────────────────────────────────────────────────────────
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
-- Each old text starts at its first character: a leading run of whitespace would take the line break before it.
CREATE OR REPLACE FUNCTION pg_temp.made_with(p_sig text, p_after text, p_swaps text[])
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_def text;
  i     integer;
BEGIN
  IF (SELECT md5(replace(prosrc, E'\r', '')) FROM pg_proc WHERE oid = to_regprocedure(p_sig)) = p_after THEN
    RETURN;  -- made already
  END IF;
  v_def := pg_get_functiondef(to_regprocedure(p_sig));
  FOR i IN 1 .. array_length(p_swaps, 1) / 2 LOOP
    v_def := pg_temp.swap_text(v_def, p_swaps[2 * i - 1], p_swaps[2 * i]);
  END LOOP;
  EXECUTE v_def;
END
$fn$;

-- ── 3. member_quote_cost_rules: the calculator's rules carry them ──────────────────────────────────────────────────
-- Service role only (lib/member/server.ts, after member_quote_context authorised the session): no ratio reaches a
-- browser. { "<product code>": { "<brand>": ratio } }.
SELECT pg_temp.made_with('public.member_quote_cost_rules(uuid)', '49c4eff9990a4bc0f48c550ecd5fda6e', ARRAY[
    $o$FROM public.comm_cost_ratios r WHERE r.scheme_id=p_scheme));$o$,
    $n$FROM public.comm_cost_ratios r WHERE r.scheme_id=p_scheme),
  -- (20261107233000) A rider SKU's ratio for each brand the cart may answer to: { code: { brand: ratio } }.
  'costRatioBrands',(SELECT coalesce(jsonb_object_agg(x.product_code,x.brands),'{}'::jsonb)
   FROM (SELECT b.product_code,jsonb_object_agg(upper(btrim(b.brand_code)),b.ratio) AS brands
    FROM public.comm_cost_ratio_brands b WHERE b.scheme_id=p_scheme GROUP BY b.product_code) x));$n$
  ]);

-- ── 4. revenue_month_orders: Comm Cal's month ──────────────────────────────────────────────────────────────────────
SELECT pg_temp.made_with('public.revenue_month_orders(uuid, date)', '33b6bd204e8345202879f058bde05933', ARRAY[
    -- (a) The brand each bill answers to, before its lines are costed.
    $o$LEFT JOIN kpi k ON k.order_id = o.id$o$,
    $n$LEFT JOIN kpi k ON k.order_id = o.id
      -- (20261107233000) The brand whose ladder the bill answers to, as marginBase() picks it: its own, else the brand
      -- its goods lines sell the most of (on a tie, the one whose first line comes first). A rider SKU may divide by a
      -- ratio of its own for that brand (Product List › Costing Setting).
      LEFT JOIN LATERAL (
          SELECT UPPER(BTRIM(COALESCE(NULLIF(BTRIM(o.brand_code), ''), (
              SELECT bl.brand_code
                FROM sales_order_lines bl
               WHERE bl.order_id = o.id
                 AND NULLIF(bl.brand_code, '') IS NOT NULL
                 AND EXISTS (SELECT 1 FROM comm_item_groups bg
                              WHERE bg.scheme_id = sc.id AND bg.commissionable
                                AND UPPER(BTRIM(bg.item_group)) = UPPER(BTRIM(bl.item_group)))
               GROUP BY bl.brand_code
               ORDER BY SUM(bl.line_amount) DESC, MIN(bl.id::TEXT COLLATE "C")
               LIMIT 1)))) AS brand
      ) lb ON TRUE$n$,
    -- (b) Each line divided by its SKU's ratio for that brand, else its own, else the scheme's.
    $o$SUM(sl.cost_amount / COALESCE(cr.ratio, sc.cost_divisor))$o$,
    $n$SUM(sl.cost_amount / COALESCE(crb.ratio, cr.ratio, sc.cost_divisor))$n$,
    $o$LEFT JOIN comm_cost_ratios cr
                       ON cr.scheme_id = sc.id
                      AND UPPER(BTRIM(cr.product_code)) = UPPER(BTRIM(sl.product_code))$o$,
    $n$LEFT JOIN comm_cost_ratios cr
                       ON cr.scheme_id = sc.id
                      AND UPPER(BTRIM(cr.product_code)) = UPPER(BTRIM(sl.product_code))
                -- (20261107233000) The SKU's ratio for the brand the bill answers to (Costing Setting).
                LEFT JOIN comm_cost_ratio_brands crb
                       ON crb.scheme_id = sc.id
                      AND UPPER(BTRIM(crb.product_code)) = UPPER(BTRIM(sl.product_code))
                      AND UPPER(BTRIM(crb.brand_code)) = lb.brand$n$
  ]);

-- ── 5. member_order_facts: Insight, the Arena, Today ───────────────────────────────────────────────────────────────
SELECT pg_temp.made_with('public.member_order_facts(uuid, date, date)', '80efce6255c1462e2a46e794b2062d14', ARRAY[
    -- (a) The brand each bill answers to.
    $o$), kpi AS ($o$,
    $n$), ladder AS (
  -- (20261107233000) The brand whose ladder each bill answers to, as marginBase() picks it: its own, else the brand its
  -- goods lines sell the most of (on a tie, the one whose first line comes first). A rider SKU may divide by a ratio of
  -- its own for that brand (Product List › Costing Setting).
  SELECT w.id,upper(btrim(coalesce(nullif(btrim(w.brand_code),''),(
   SELECT bl.brand_code FROM public.sales_order_lines bl
   WHERE bl.order_id=w.id AND nullif(bl.brand_code,'') IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.comm_item_groups bg WHERE bg.scheme_id=p_scheme AND bg.commissionable
     AND upper(btrim(bg.item_group))=upper(btrim(bl.item_group)))
   GROUP BY bl.brand_code ORDER BY sum(bl.line_amount) DESC,min(bl.id::text COLLATE "C") LIMIT 1)))) AS brand
  FROM windowed w
 ), kpi AS ($n$,
    -- (b) Each line divided by its SKU's ratio for that brand, else its own, else the scheme's.
    $o$l.cost_amount/coalesce(cr.ratio,o.cost_divisor) AS team_cost,$o$,
    $n$l.cost_amount/coalesce(crb.ratio,cr.ratio,o.cost_divisor) AS team_cost,$n$,
    $o$LEFT JOIN public.comm_cost_ratios cr ON cr.scheme_id=p_scheme
   AND upper(btrim(cr.product_code))=upper(btrim(l.product_code))$o$,
    $n$LEFT JOIN public.comm_cost_ratios cr ON cr.scheme_id=p_scheme
   AND upper(btrim(cr.product_code))=upper(btrim(l.product_code))
  -- (20261107233000) The SKU's ratio for the brand the bill answers to (Costing Setting).
  LEFT JOIN ladder lb ON lb.id=o.id
  LEFT JOIN public.comm_cost_ratio_brands crb ON crb.scheme_id=p_scheme
   AND upper(btrim(crb.product_code))=upper(btrim(l.product_code)) AND upper(btrim(crb.brand_code))=lb.brand$n$
  ]);

-- What this migration made is what it was written to make — every mismatch in one refusal.
DO $$
DECLARE
  r record;
  v_md5 text;
  v_bad text := '';
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.catalogue_save_cost_setting(uuid, numeric, jsonb, text[])', 'eb9f0116074174ee38a3ea508f0e9582'),
      ('public.catalogue_save_cost_setting(uuid, numeric, jsonb, text[], jsonb)', 'dae898c708d208cb029c48b65b544801'),
      ('public.member_quote_cost_rules(uuid)', '49c4eff9990a4bc0f48c550ecd5fda6e'),
      ('public.revenue_month_orders(uuid, date)', '33b6bd204e8345202879f058bde05933'),
      ('public.member_order_facts(uuid, date, date)', '80efce6255c1462e2a46e794b2062d14')
    ) AS t(sig, after_md5)
  LOOP
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(r.sig);
    IF v_md5 IS DISTINCT FROM r.after_md5 THEN
      v_bad := v_bad || format(' %s ended as md5 %s;', r.sig, v_md5);
    END IF;
  END LOOP;
  IF v_bad <> '' THEN
    RAISE EXCEPTION 'Not the bodies this migration makes:%', v_bad;
  END IF;
END $$;

COMMIT;

-- Rollback, in words (the database tool refuses a migration that spells it out): put member_quote_cost_rules,
-- revenue_month_orders and member_order_facts back as production had them (md5 2e7e32cd…, 3cca3cc8…, 137eb24b…), take
-- away the 5-argument catalogue_save_cost_setting, comm_cost_ratio_brands' rows in permission_table_reads /
-- permission_table_writes / audit_tables, and the table itself.
