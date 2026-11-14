-- ============================================================================
-- 20261114121700_brand_cost_ratios.sql
-- A sub-department's cost ratio, brand by brand (2026-11-14).
-- ============================================================================
--
-- The user, on Product List › Costing Setting's FAIR · COST RATIO (0.70): "我要这个 ratio 这边，它是可以能够被 separate by
-- brand 去填的。因为现在只可以去放 default 的嘛，所以我要它能够 separate by brand 。它其实是有 4 个，如果说我调主要的一个的话，
-- 这样它就是 override 全部" — Fair's four ladders (Akemi, Dunlopillo, Ergotex, Zanotti; 2990s is on its own scheme and
-- stands in no margin) each with a ratio of its own, and the main one, changed, setting all four again. The page does
-- that: a main ratio changed sends every brand back to it (a NULL ratio each); this Save writes only what it is sent.
--
--   1. comm_brand_cost_ratios   a brand's ratio in a sub-department: what a bill (or a cart) that answers to that
--                               brand's ladder divides a line's cost by, where the line's SKU has no ratio of its own
--   2. catalogue_save_cost_setting(…, p_brands, p_brand_ratios)   Costing Setting's Save: the 5-argument writer (the
--                               ratio, the SKUs' own and their brands', untouched) and then the brands' ratios, in ONE
--                               transaction
--   3. member_quote_cost_rules  the calculator's rules carry them: brandDivisors { brand: ratio }
--   4. revenue_month_orders     Comm Cal's month divides by them
--   5. member_order_facts_with_old_bills   Insight, the Arena, Today divide by them (member_order_facts reads it)
--
-- A LINE'S RATIO, everywhere a margin is taken (costDivisorFor in lib/commission/cost-basis.ts is the TypeScript twin,
-- read by marginBase() and the calculator): its SKU's ratio for the brand the bill answers to (comm_cost_ratio_brands),
-- else its SKU's own (comm_cost_ratios), else THE SUB-DEPARTMENT'S RATIO FOR THAT BRAND (this), else the
-- sub-department's (comm_schemes.revenue_cost_divisor). A SKU's own ratio stays ahead of its brand's: Akemi's BASTION at
-- 0.6 keeps 0.6 whatever Akemi's ratio is. The brand a bill answers to is the one 20261107233000 reads (marginBase()'s
-- pick): the bill's own brand, else the brand its goods lines sell the most of, on a tie the one whose first line comes
-- first; a Quote's cart, the brand its calculator prices. No brand — riders alone — takes the sub-department's ratio.
--
-- NOTHING MOVES TODAY: no brand has a ratio. A month already computed moves when its run is computed again, as with
-- every ratio; Insight and Comm Cal's month read them at once.
--
-- Made from PRODUCTION's bodies (2026-11-14 KL, pg_get_functiondef, md5 of prosrc — tests/member-sql/
-- brand-cost-ratios-production.sql), refused if one has changed since; a second run changes nothing. What each became
-- is checked at the end:
--
--   catalogue_save_cost_setting(…, p_brand_ratios)   (new)                           → 09f5809e64edcc5c307ab0a72c7c9f63
--   member_quote_cost_rules                    d300e873e6ddc7eb8c9cb5461d92533e       → 0ec88aecc9974332af01050348963b1d
--   revenue_month_orders                       ca65252e526c2eda011eb476e3d84adb       → 2f22ddc8226a705f2c211cae21563ef1
--   member_order_facts_with_old_bills          33414791db34a741ce9bd6ee84c9687a       → b0840628de75ec6383fcaf06911e2247
--
-- PGlite: tests/member-sql/validate-brand-cost-ratios.mjs (production's bodies, md5-checked; the migration verbatim,
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
      ('public.catalogue_save_cost_setting(uuid, numeric, jsonb, text[], jsonb)', 'a97bf8e72a9944a5c3f62409735fa483', 'a97bf8e72a9944a5c3f62409735fa483'),
      ('public.member_quote_cost_rules(uuid)', 'd300e873e6ddc7eb8c9cb5461d92533e', '0ec88aecc9974332af01050348963b1d'),
      ('public.revenue_month_orders(uuid, date)', 'ca65252e526c2eda011eb476e3d84adb', '2f22ddc8226a705f2c211cae21563ef1'),
      ('public.member_order_facts_with_old_bills(uuid, date, date)', '33414791db34a741ce9bd6ee84c9687a', 'b0840628de75ec6383fcaf06911e2247')
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

-- ── 1. comm_brand_cost_ratios ───────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comm_brand_cost_ratios (
    scheme_id   UUID         NOT NULL,
    -- One of the sub-department's comm_brands with a margin ladder.
    brand_code  TEXT         NOT NULL,
    ratio       NUMERIC(6,4) NOT NULL,
    updated_by  UUID         DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (scheme_id, brand_code),
    -- A brand renamed carries its ratio along; a brand (or its scheme) deleted takes it.
    CONSTRAINT brand_cost_ratio_of_scheme FOREIGN KEY (scheme_id, brand_code)
        REFERENCES public.comm_brands(scheme_id, code) ON UPDATE CASCADE ON DELETE CASCADE,
    -- The range every cost ratio has (comm_cost_ratios, comm_cost_ratio_brands, revenue_cost_divisor).
    CONSTRAINT brand_cost_ratio_range CHECK (ratio > 0 AND ratio <= 10)
);

COMMENT ON TABLE public.comm_brand_cost_ratios IS
    'A sub-department''s Revenue Team cost ratio for one of its brands (Product List › Costing Setting, 2026-11-14): a line on a bill or cart that answers to that brand''s ladder divides its cost by this when its SKU has no ratio of its own (comm_cost_ratio_brands, comm_cost_ratios); a brand without one divides by the sub-department''s (comm_schemes.revenue_cost_divisor).';

ALTER TABLE public.comm_brand_cost_ratios ENABLE ROW LEVEL SECURITY;

-- As comm_cost_ratios: the Product List's key, the admin domain, and HR — a sub-department cloned from another copies
-- them (Rules), and Comm Cal's month reads them as its reader (revenue_month_orders is SECURITY INVOKER). Nobody else:
-- no ratio reaches a member's browser.
DROP POLICY IF EXISTS comm_brand_cost_ratios_principal_all ON public.comm_brand_cost_ratios;
CREATE POLICY comm_brand_cost_ratios_principal_all ON public.comm_brand_cost_ratios FOR ALL TO authenticated
    USING ((SELECT has_scope(ARRAY['admin']))) WITH CHECK ((SELECT has_scope(ARRAY['admin'])));
DROP POLICY IF EXISTS comm_brand_cost_ratios_hr_all ON public.comm_brand_cost_ratios;
CREATE POLICY comm_brand_cost_ratios_hr_all ON public.comm_brand_cost_ratios FOR ALL TO authenticated
    USING ((SELECT has_scope(ARRAY['hr']))) WITH CHECK ((SELECT has_scope(ARRAY['hr'])));
DROP POLICY IF EXISTS comm_brand_cost_ratios_product_list ON public.comm_brand_cost_ratios;
CREATE POLICY comm_brand_cost_ratios_product_list ON public.comm_brand_cost_ratios FOR ALL TO authenticated
    USING ((SELECT has_perm('product_list'))) WITH CHECK ((SELECT has_perm('product_list')));

REVOKE ALL ON public.comm_brand_cost_ratios FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comm_brand_cost_ratios TO authenticated;
GRANT ALL ON public.comm_brand_cost_ratios TO service_role;

SELECT public.audit_register('comm_brand_cost_ratios', 'Brand costing ratios', 'Catalogue', '{product_list}', 'all',
    p_keys => '{scheme_id,brand_code}', p_labels => '{brand_code}');

-- Who writes and reads it: comm_cost_ratios' own lists.
INSERT INTO public.permission_table_writes (table_name, command, actions) VALUES
  ('comm_brand_cost_ratios', 'DELETE', ARRAY['revenue.manage', 'product_list.edit']),
  ('comm_brand_cost_ratios', 'INSERT', ARRAY['revenue.manage', 'product_list.edit']),
  ('comm_brand_cost_ratios', 'UPDATE', ARRAY['revenue.manage', 'product_list.edit'])
ON CONFLICT (table_name, command) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_writes_guard('comm_brand_cost_ratios');

INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('comm_brand_cost_ratios', ARRAY['product_list.edit', 'product_list.view', 'revenue.edit', 'revenue.manage', 'revenue.view:own'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_reads_guard('comm_brand_cost_ratios');

-- ── 2. Costing Setting's Save, with the brands' ratios ──────────────────────────────────────────────────────────────
-- The 5-argument writer does the sub-department's ratio, the SKUs' own and their brands', as it always has; this one
-- calls it, then writes the brands' ratios, in the same transaction. p_brand_ratios: [{brand_code, ratio}] — ratio NULL
-- takes that brand's ratio off (it divides by the sub-department's again). Only what changed is sent: a page open on
-- another PC never writes back a brand it did not touch; a main ratio changed on the page sends every brand that had
-- one of its own, NULL ("override 全部").
CREATE OR REPLACE FUNCTION public.catalogue_save_cost_setting(
    p_scheme       UUID,
    p_divisor      NUMERIC,
    p_ratios       JSONB,
    p_removes      TEXT[],
    p_brands       JSONB,
    p_brand_ratios JSONB
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

    v_touched := public.catalogue_save_cost_setting(p_scheme, p_divisor, p_ratios, p_removes, COALESCE(p_brands, '[]'::JSONB));

    IF jsonb_typeof(p_brand_ratios) IS DISTINCT FROM 'array' OR jsonb_array_length(p_brand_ratios) = 0 THEN
        RETURN v_touched;
    END IF;

    IF (SELECT COUNT(*) FROM jsonb_to_recordset(p_brand_ratios) AS b(brand_code TEXT, ratio NUMERIC))
       <> (SELECT COUNT(DISTINCT COALESCE(b.brand_code, ''))
             FROM jsonb_to_recordset(p_brand_ratios) AS b(brand_code TEXT, ratio NUMERIC)) THEN
        RAISE EXCEPTION 'A brand is named twice' USING ERRCODE = '22023';
    END IF;
    SELECT COALESCE(b.brand_code, '—') INTO v_bad
      FROM jsonb_to_recordset(p_brand_ratios) AS b(brand_code TEXT, ratio NUMERIC)
     WHERE b.ratio IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM comm_brands cb
                        WHERE cb.scheme_id = p_scheme AND cb.code = b.brand_code
                          AND cb.is_active AND NOT COALESCE(cb.own_scheme, FALSE))
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION '% is not a brand this sub-department judges a margin for', v_bad USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_brand_ratios) AS b(brand_code TEXT, ratio NUMERIC)
                WHERE b.ratio IS NOT NULL AND NOT (b.ratio > 0 AND b.ratio <= 10)) THEN
        RAISE EXCEPTION 'A cost ratio must be above 0 and at most 10' USING ERRCODE = '22023';
    END IF;

    DELETE FROM comm_brand_cost_ratios c
     USING jsonb_to_recordset(p_brand_ratios) AS b(brand_code TEXT, ratio NUMERIC)
     WHERE b.ratio IS NULL AND c.scheme_id = p_scheme AND c.brand_code = b.brand_code;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_touched := v_touched + v_n;

    INSERT INTO comm_brand_cost_ratios (scheme_id, brand_code, ratio, updated_by, updated_at)
    SELECT p_scheme, b.brand_code, b.ratio, auth.uid(), now()
      FROM jsonb_to_recordset(p_brand_ratios) AS b(brand_code TEXT, ratio NUMERIC)
     WHERE b.ratio IS NOT NULL
    ON CONFLICT (scheme_id, brand_code) DO UPDATE
       SET ratio      = EXCLUDED.ratio,
           updated_by = EXCLUDED.updated_by,
           updated_at = EXCLUDED.updated_at
     WHERE comm_brand_cost_ratios.ratio IS DISTINCT FROM EXCLUDED.ratio;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_touched := v_touched + v_n;

    RETURN v_touched;
END;
$fn$;

COMMENT ON FUNCTION public.catalogue_save_cost_setting(UUID, NUMERIC, JSONB, TEXT[], JSONB, JSONB) IS
    'Product List › Costing Setting (2026-11-14): the 5-argument save — a sub-department''s ratio, its SKUs'' own and their ratios by brand — then the sub-department''s ratio for each of its brands (comm_brand_cost_ratios; a NULL ratio takes one off), in one transaction. Product List · Edit.';

REVOKE ALL ON FUNCTION public.catalogue_save_cost_setting(UUID, NUMERIC, JSONB, TEXT[], JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalogue_save_cost_setting(UUID, NUMERIC, JSONB, TEXT[], JSONB, JSONB) TO authenticated;

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
-- browser. { "<brand>": ratio }.
SELECT pg_temp.made_with('public.member_quote_cost_rules(uuid)', '0ec88aecc9974332af01050348963b1d', ARRAY[
    $o$FROM public.comm_cost_ratio_brands b WHERE b.scheme_id=p_scheme GROUP BY b.product_code) x),$o$,
    $n$FROM public.comm_cost_ratio_brands b WHERE b.scheme_id=p_scheme GROUP BY b.product_code) x),
  -- (20261114121700) The sub-department's ratio for each brand the cart may answer to: { brand: ratio }.
  'brandDivisors',(SELECT coalesce(jsonb_object_agg(upper(btrim(d.brand_code)),d.ratio),'{}'::jsonb)
   FROM public.comm_brand_cost_ratios d WHERE d.scheme_id=p_scheme),$n$
  ]);

-- ── 4. revenue_month_orders: Comm Cal's month ──────────────────────────────────────────────────────────────────────
SELECT pg_temp.made_with('public.revenue_month_orders(uuid, date)', '2f22ddc8226a705f2c211cae21563ef1', ARRAY[
    -- Each line divided by its SKU's ratio for the bill's brand, else its own, else the brand's, else the scheme's.
    $o$/ COALESCE(crb.ratio, cr.ratio, sc.cost_divisor))$o$,
    $n$/ COALESCE(crb.ratio, cr.ratio, bcr.ratio, sc.cost_divisor))$n$,
    $o$AND UPPER(BTRIM(crb.brand_code)) = lb.brand$o$,
    $n$AND UPPER(BTRIM(crb.brand_code)) = lb.brand
                -- (20261114121700) The sub-department's ratio for that brand, where the SKU has none (Costing Setting).
                LEFT JOIN comm_brand_cost_ratios bcr
                       ON bcr.scheme_id = sc.id
                      AND UPPER(BTRIM(bcr.brand_code)) = lb.brand$n$
  ]);

-- ── 5. member_order_facts_with_old_bills: Insight, the Arena, Today ────────────────────────────────────────────────
SELECT pg_temp.made_with('public.member_order_facts_with_old_bills(uuid, date, date)', 'b0840628de75ec6383fcaf06911e2247', ARRAY[
    $o$/coalesce(crb.ratio,cr.ratio,o.cost_divisor) AS team_cost,$o$,
    $n$/coalesce(crb.ratio,cr.ratio,bcr.ratio,o.cost_divisor) AS team_cost,$n$,
    $o$AND upper(btrim(crb.brand_code))=lb.brand$o$,
    $n$AND upper(btrim(crb.brand_code))=lb.brand
  -- (20261114121700) The sub-department's ratio for that brand, where the SKU has none (Costing Setting).
  LEFT JOIN public.comm_brand_cost_ratios bcr ON bcr.scheme_id=p_scheme AND upper(btrim(bcr.brand_code))=lb.brand$n$
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
      ('public.catalogue_save_cost_setting(uuid, numeric, jsonb, text[], jsonb)', 'a97bf8e72a9944a5c3f62409735fa483'),
      ('public.catalogue_save_cost_setting(uuid, numeric, jsonb, text[], jsonb, jsonb)', '09f5809e64edcc5c307ab0a72c7c9f63'),
      ('public.member_quote_cost_rules(uuid)', '0ec88aecc9974332af01050348963b1d'),
      ('public.revenue_month_orders(uuid, date)', '2f22ddc8226a705f2c211cae21563ef1'),
      ('public.member_order_facts_with_old_bills(uuid, date, date)', 'b0840628de75ec6383fcaf06911e2247')
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
-- revenue_month_orders and member_order_facts_with_old_bills back as production had them (md5 d300e873…, ca65252e…,
-- 33414791… — tests/member-sql/brand-cost-ratios-production.sql holds them), take away the 6-argument
-- catalogue_save_cost_setting, comm_brand_cost_ratios' rows in permission_table_reads / permission_table_writes /
-- audit_tables, and the table itself.
