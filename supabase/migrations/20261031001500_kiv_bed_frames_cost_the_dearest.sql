-- ============================================================================
-- 20261031001500_kiv_bed_frames_cost_the_dearest.sql
-- A bed frame still to be chosen (KIV) costs the dearest frame of its size (2026-10-31).
-- ============================================================================
--
-- The user, of bills whose bed frame is still KIV — BEDFRAME KIV, BEDFRAME KIV LV2, the ERP's sized
-- BEDFRAME KIV LV1–LV4-(K) …: such a bill had no cost, so no margin, and the month's margin left it out and read
-- higher than it was. "最主要是我不要让他们算虚高，因为虚高的话我发了之后很难扣回来。虚低的话，到时候顾客选了比较便宜的，
-- margin 变高，我再补给销售这边没问题，因为补钱容易，扣钱很难"; then: "只要 detect 到 bed frame 它是 KIV 的话 … 就拿最贵的
-- bed frame 按照这样子的 costing 去计算它的 margin: King size 拿 1000 块, Queen size 拿 820 块, Super single 拿 600 块,
-- Single 拿 550 块", and a place on the Product List to set the four.
--
--   1. catalogue_kiv_costs   the four — K, Q, SS, S — what a KIV frame of that size costs until it is chosen
--   2. catalogue_kiv_cost    a line → is it a KIV frame, which size, what it costs
--   3. catalogue_line_cost   a KIV frame costs that (production's body: one declaration and one block added)
--
-- THE SIZE: the code's own (BEDFRAME KIV LV2-(K)), else the words the line was keyed with (QUEEN LVL1, LV1 K/…,
-- King level 3, 6FT), the dearest of them where it names two. No size, or one the four do not set (SK, SP) — the
-- dearest of the four. Never the cheaper guess: a margin read too high pays what cannot be taken back.
-- WHEN THE FRAME IS CHOSEN the ERP saves the order with it, the order comes back whole, and the fill-cost trigger
-- costs that frame at its own price. A month already landed moves when Recost is pressed (recost_sales_order_lines
-- calls catalogue_line_cost, as the trigger does). The option charges of a KIV line (its divan, leg, specials) are
-- charged as before: catalogue_line_option_charge is not touched.
--
-- Production's catalogue_line_cost md5-checked first (5b764573…, 20260924030000's); what both bodies became, at the
-- end. PGlite: tests/member-sql/validate-kiv-costs.mjs (the migration verbatim, twice).

BEGIN;

DO $$
DECLARE
    v_md5 TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5
      FROM pg_proc WHERE oid = 'public.catalogue_line_cost(bigint, text, text, text, jsonb, numeric)'::regprocedure;
    IF v_md5 NOT IN ('5b764573b0f693f2250959ccb52054d1', 'b3276b6af2c6c0a4c547413b536942d9') THEN
        RAISE EXCEPTION 'catalogue_line_cost is md5 %, not the body this migration was written from', v_md5;
    END IF;
END $$;

-- ── 1. The four ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.catalogue_kiv_costs (
    erp_company_id BIGINT        NOT NULL DEFAULT 1,
    -- King, Queen, Super single, Single. Any other size of a KIV frame costs the dearest of these.
    size_code      TEXT          NOT NULL CHECK (size_code IN ('K', 'Q', 'SS', 'S')),
    -- What a KIV frame of this size costs until it is chosen: the dearest frame of the size. Never 0 — a frame
    -- costing nothing would read the margin high.
    cost           NUMERIC(15,2) NOT NULL CHECK (cost > 0 AND cost <= 100000),
    updated_by     UUID          DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE SET NULL,
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    PRIMARY KEY (erp_company_id, size_code)
);

COMMENT ON TABLE public.catalogue_kiv_costs IS
    'A bed frame still to be chosen (KIV, 2026-10-31, Product List › Costing Setting): what one of each size costs until it is chosen — the dearest frame of the size, so its bill''s margin reads low, never high. A size not set here, or a line that names none, costs the dearest of them (catalogue_kiv_cost).';

ALTER TABLE public.catalogue_kiv_costs ENABLE ROW LEVEL SECURITY;

-- As catalogue_option_prices and the fabric upgrades: the Product List's key, the admin domain, and HR reading — a
-- Recost and a file import cost sales lines under HR's session.
DROP POLICY IF EXISTS catalogue_kiv_costs_principal_all ON public.catalogue_kiv_costs;
CREATE POLICY catalogue_kiv_costs_principal_all ON public.catalogue_kiv_costs FOR ALL TO authenticated
    USING ((SELECT has_scope(ARRAY['admin']))) WITH CHECK ((SELECT has_scope(ARRAY['admin'])));
DROP POLICY IF EXISTS catalogue_kiv_costs_product_list ON public.catalogue_kiv_costs;
CREATE POLICY catalogue_kiv_costs_product_list ON public.catalogue_kiv_costs FOR ALL TO authenticated
    USING ((SELECT has_perm('product_list'))) WITH CHECK ((SELECT has_perm('product_list')));
DROP POLICY IF EXISTS catalogue_kiv_costs_hr_select ON public.catalogue_kiv_costs;
CREATE POLICY catalogue_kiv_costs_hr_select ON public.catalogue_kiv_costs FOR SELECT TO authenticated
    USING ((SELECT has_scope(ARRAY['hr'])));

REVOKE ALL ON public.catalogue_kiv_costs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogue_kiv_costs TO authenticated;
GRANT ALL ON public.catalogue_kiv_costs TO service_role;

SELECT public.audit_register('catalogue_kiv_costs', 'KIV bed frame costs', 'Catalogue', '{product_list}', 'all',
    p_keys => '{erp_company_id,size_code}', p_labels => '{size_code}');

-- Who writes it (Product List · Edit) and who reads it — catalogue_option_prices' readers: the Product List, and
-- whoever writes a sales line (the fill-cost trigger reads it as the writer).
INSERT INTO public.permission_table_writes (table_name, command, actions) VALUES
  ('catalogue_kiv_costs', 'DELETE', ARRAY['product_list.edit']),
  ('catalogue_kiv_costs', 'INSERT', ARRAY['product_list.edit']),
  ('catalogue_kiv_costs', 'UPDATE', ARRAY['product_list.edit'])
ON CONFLICT (table_name, command) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_writes_guard('catalogue_kiv_costs');

INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('catalogue_kiv_costs', ARRAY['product_list.edit', 'product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_reads_guard('catalogue_kiv_costs');

-- The user's four (2026-10-31). Set once: a change made on the Product List since is never written over.
INSERT INTO public.catalogue_kiv_costs (erp_company_id, size_code, cost) VALUES
    (1, 'K', 1000), (1, 'Q', 820), (1, 'SS', 600), (1, 'S', 550)
ON CONFLICT (erp_company_id, size_code) DO NOTHING;

-- ── 2. A line → a KIV frame, its size, its cost ─────────────────────────────
-- No row for a line that is not a KIV frame. For one: the size its code carries, else the sizes its words name;
-- the dearest of those when each has a cost here, else (none named, or SK / SP / a size not set) the dearest of all.
-- unit NULL while the four are all unset — the line then prices as before (unpriced / not in the SKU master).
CREATE OR REPLACE FUNCTION public.catalogue_kiv_cost(p_company BIGINT, p_code TEXT, p_description2 TEXT, p_raw JSONB)
RETURNS TABLE (unit NUMERIC, size_code TEXT, named TEXT[], size_from TEXT)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
DECLARE
    v_code TEXT := UPPER(BTRIM(COALESCE(p_code, '')));
    v_text TEXT;
    v_rest TEXT;
BEGIN
    IF v_code NOT LIKE 'BEDFRAME KIV%' THEN
        RETURN;
    END IF;

    -- The size its code carries: BEDFRAME KIV LV2-(K) …
    named := ARRAY_REMOVE(ARRAY[SUBSTRING(v_code FROM '-\((K|Q|SS|S|SK|SP)\)$')], NULL);
    IF CARDINALITY(named) > 0 THEN
        size_from := 'code';
    ELSE
        -- … else the words it was keyed with: QUEEN LVL1, LV1 K/COL:KIV, King level 3, 6FT. The two-word sizes are
        -- read first and taken out, so SUPER SINGLE is no SINGLE, SUPER KING no KING, and 3.5FT no 5FT.
        v_text := UPPER(CONCAT_WS(' ', p_description2, p_raw->>'description'));
        v_rest := REGEXP_REPLACE(v_text, '\mSUPER\s*(SINGLE|KING)\M|\m3\.5\s*FT\M', ' ', 'g');
        named := ARRAY_REMOVE(ARRAY[
            CASE WHEN v_text ~ '\mSUPER\s*SINGLE\M|\m3\.5\s*FT\M|\mSS\M' THEN 'SS' END,
            CASE WHEN v_text ~ '\mSUPER\s*KING\M|\mSK\M' THEN 'SK' END,
            CASE WHEN v_rest ~ '\mK\M|\mKING\M|\m6\s*FT\M' THEN 'K' END,
            CASE WHEN v_rest ~ '\mQ\M|\mQUEEN\M|\m5\s*FT\M' THEN 'Q' END,
            CASE WHEN v_rest ~ '\mS\M|\mSINGLE\M|\m3\s*FT\M' THEN 'S' END], NULL);
        size_from := CASE WHEN CARDINALITY(named) > 0 THEN 'words' END;
    END IF;

    IF CARDINALITY(named) > 0 AND NOT EXISTS (
        SELECT 1 FROM UNNEST(named) AS n(sz)
         WHERE NOT EXISTS (SELECT 1 FROM catalogue_kiv_costs k WHERE k.erp_company_id = p_company AND k.size_code = n.sz)) THEN
        SELECT k.size_code, k.cost INTO size_code, unit
          FROM catalogue_kiv_costs k
         WHERE k.erp_company_id = p_company AND k.size_code = ANY (named)
         ORDER BY k.cost DESC, k.size_code
         LIMIT 1;
    ELSE
        SELECT k.cost INTO unit
          FROM catalogue_kiv_costs k
         WHERE k.erp_company_id = p_company
         ORDER BY k.cost DESC
         LIMIT 1;
    END IF;
    IF CARDINALITY(named) = 0 THEN
        named := NULL;
    END IF;
    RETURN NEXT;
END;
$fn$;

COMMENT ON FUNCTION public.catalogue_kiv_cost(BIGINT, TEXT, TEXT, JSONB) IS
    'A bed frame still to be chosen (2026-10-31): no row unless the code is BEDFRAME KIV…; else its size (the code''s, else the words''), what it costs from catalogue_kiv_costs — the dearest of the sizes named when each is set, else the dearest of all. Read by catalogue_line_cost.';

REVOKE ALL ON FUNCTION public.catalogue_kiv_cost(BIGINT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalogue_kiv_cost(BIGINT, TEXT, TEXT, JSONB) TO authenticated, service_role;

-- ── 3. catalogue_line_cost: a KIV frame costs that ──────────────────────────
-- The old text, every run of whitespace matching any run, replaced by the new — found exactly once, or refused.
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

DO $$
DECLARE
    v_sig regprocedure := 'public.catalogue_line_cost(bigint, text, text, text, jsonb, numeric)'::regprocedure;
    v_def TEXT;
BEGIN
    IF strpos((SELECT prosrc FROM pg_proc WHERE oid = v_sig), 'catalogue_kiv_cost(') > 0 THEN
        RETURN;  -- already done
    END IF;
    v_def := pg_get_functiondef(v_sig);
    v_def := pg_temp.swap_text(v_def, 'v_sku  TEXT;', E'v_sku  TEXT;\n    k      RECORD;');
    v_def := pg_temp.swap_text(v_def, 'SELECT * INTO f FROM catalogue_line_facts(p_description2, p_raw);', $new$-- A bed frame still to be chosen (KIV) costs the dearest frame of its size until it is (2026-10-31,
    -- catalogue_kiv_cost): its bill's margin reads low, never high.
    SELECT * INTO k FROM catalogue_kiv_cost(p_company, p_code, p_description2, p_raw);
    IF FOUND AND k.unit IS NOT NULL THEN
        unit_price := k.unit;
        surcharge  := 0;
        cost       := ROUND(k.unit * COALESCE(p_qty, 0), 2);
        detail     := jsonb_strip_nulls(jsonb_build_object(
            'how', 'kiv', 'unit', k.unit, 'size', k.size_code, 'named', k.named, 'size_from', k.size_from));
        RETURN NEXT;
        RETURN;
    END IF;

    SELECT * INTO f FROM catalogue_line_facts(p_description2, p_raw);$new$);
    EXECUTE v_def;
END $$;

-- ── What landed ─────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_bad TEXT := '';
    r     RECORD;
BEGIN
    FOR r IN
        SELECT t.sig, t.want, md5(replace(p.prosrc, E'\r', '')) AS got
          FROM (VALUES
            ('public.catalogue_line_cost(bigint, text, text, text, jsonb, numeric)', 'b3276b6af2c6c0a4c547413b536942d9'),
            ('public.catalogue_kiv_cost(bigint, text, text, jsonb)', '698d3205f7e8df657c86169388ffc380')) AS t(sig, want)
          JOIN pg_proc p ON p.oid = t.sig::regprocedure
    LOOP
        IF r.got <> r.want THEN
            v_bad := v_bad || format(' %s is %s;', r.sig, r.got);
        END IF;
    END LOOP;
    IF v_bad <> '' THEN
        RAISE EXCEPTION 'Not the bodies this migration makes:%', v_bad;
    END IF;
END $$;

COMMIT;

-- Rollback, in words (the database tool refuses a migration that spells it out): put back catalogue_line_cost from
-- 20260924030000 (md5 5b764573…), then take away catalogue_kiv_cost, catalogue_kiv_costs' rows in
-- permission_table_reads / permission_table_writes / audit_tables, and the table itself.
