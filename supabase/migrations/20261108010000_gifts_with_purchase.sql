-- ============================================================================
-- 20261108010000_gifts_with_purchase.sql
-- Product List › GWP: what a purchase earns free, its cost out of every margin (2026-11-08).
-- ============================================================================
--
-- The user: "i want the product list tab for one more new tab is gwp. is for item that can select than for free
-- selection gwp. example, dullop mattress ecobliss, set a gwp 2 micorfibre pillow. so the margin calculator and
-- margin leader will not calculate the cost in for those 2 pillow. is jsut calculate the mattress cost only."
-- Asked how: by SKU, any sizes ticked together ("2, or can select all as well"); N for every unit bought; several
-- gifts, any of them, together N; the Quote unchanged — "just auto detect is they add on in the pillow. then no
-- need calculate the cost. no need show gwp wording as well"; and no dates — "gwp no need got set date funtion".
--
--   1. catalogue_gwp, catalogue_gwp_items   a GWP: its gift units per unit bought; the SKUs bought and given
--   2. catalogue_save_gwp(id, changes)        Product List › GWP's Save — only what changed; a remove
--   3. sales_order_gwp_free(orders)           each line's units a purchase earned free (twin: gwpFreeUnits,
--                                             lib/catalogue/gwp.ts)
--   4. member_quote_cost_rules                the calculator's rules carry the GWPs (service role only)
--   5. revenue_month_orders                   Comm Cal's month leaves their cost out
--   6. member_order_facts_with_old_bills      Insight, the Arena, Today leave it out (member_order_facts reads it)
--
-- A BILL, as the run (marginBase, lines' gwpFree) and the Quote read it: a GWP's allowance on the bill is its units
-- a unit × every unit of its buy SKUs there; its gift SKUs' lines take it CHEAPEST FIRST — a cost not known yet first
-- of all, then the line's id — so a margin is read low rather than high (the user: 补钱容易、扣钱难); every line of
-- a gift SKU counts, whatever its price (the ERP prices a package on its main line and puts most others at RM 0:
-- in October 933 accessory lines at RM 0, 11 priced); two GWPs each take their own; a line is never more than wholly
-- free. Its cost leaves the margin by the part given, and a line wholly given never holds the bill as uncosted.
-- NO DATES: while a GWP is on the list it counts on every bill, a month gone too; taken off, on none.
--
-- NOTHING MOVES TODAY: no GWP exists. A run already computed moves when it is computed again; Comm Cal's month,
-- Insight and the Arena read a GWP at once.
--
-- Made from PRODUCTION's bodies (2026-11-08 KL, pg_get_functiondef, md5 of prosrc) — member_order_facts_with_old_bills
-- as 20261107235500 left it — refused if one has changed since; a second run changes nothing. Checked at the end:
--
--   catalogue_save_gwp(uuid, jsonb)        (new)                                  → 63d3d0104c92966e459e96b5f83e4f30
--   sales_order_gwp_free(uuid[])           (new)                                  → 658722b990b11b99acc37995ce8dc8f3
--   member_quote_cost_rules                49c4eff9990a4bc0f48c550ecd5fda6e       → 9973901db6f5109566723a1ed4ad2b67
--   revenue_month_orders                   33b6bd204e8345202879f058bde05933       → 99c8386e4549d99c963b250c4538ce80
--   member_order_facts_with_old_bills      c4daa35e4b387d744a5bef3b8edbc23f       → 6904a0dd72dcc3abe5b4463071bbe077
--
-- PGlite: tests/member-sql/validate-gifts-with-purchase.mjs (production's bodies, md5-checked; the migration verbatim,
-- twice).

BEGIN;

-- Production's bodies, or this migration's own once it has run.
DO $$
DECLARE
  r record;
  v_md5 text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.member_quote_cost_rules(uuid)', '49c4eff9990a4bc0f48c550ecd5fda6e', '9973901db6f5109566723a1ed4ad2b67'),
      ('public.revenue_month_orders(uuid, date)', '33b6bd204e8345202879f058bde05933', '99c8386e4549d99c963b250c4538ce80'),
      ('public.member_order_facts_with_old_bills(uuid, date, date)', 'c4daa35e4b387d744a5bef3b8edbc23f', '6904a0dd72dcc3abe5b4463071bbe077')
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

-- ── 1. The GWPs ──────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.catalogue_gwp (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The gift units each unit bought earns, any of its gift SKUs together.
    qty_per_unit INTEGER     NOT NULL CHECK (qty_per_unit BETWEEN 1 AND 100),
    created_by   UUID        DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by   UUID        DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE SET NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.catalogue_gwp_items (
    gwp_id         UUID NOT NULL REFERENCES public.catalogue_gwp(id) ON DELETE CASCADE,
    -- buy: a SKU whose purchase earns it; gift: a SKU it may be.
    role           TEXT NOT NULL CHECK (role IN ('buy', 'gift')),
    erp_product_id TEXT NOT NULL REFERENCES public.erp_products(erp_id),
    -- The code a sales line carries for it when it was saved; a Save follows a SKU the ERP renamed.
    product_code   TEXT NOT NULL CHECK (BTRIM(product_code) <> ''),
    PRIMARY KEY (gwp_id, role, erp_product_id)
);

COMMENT ON TABLE public.catalogue_gwp IS
    'A gift with purchase (Product List › GWP, 2026-11-08): each unit of its buy SKUs on a bill (or a Quote''s cart) earns qty_per_unit units of its gift SKUs whose cost the margin does not count — cheapest first, any line of them, every bill (no dates). Every sub-department alike.';
COMMENT ON TABLE public.catalogue_gwp_items IS
    'A GWP''s SKUs (Product List › GWP): role buy — a SKU whose purchase earns it; role gift — a SKU it may be. Matched on the code a sales line carries.';

ALTER TABLE public.catalogue_gwp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogue_gwp_items ENABLE ROW LEVEL SECURITY;

-- As catalogue_kiv_costs: the Product List's key and the admin domain write; HR reads — Comm Cal's month
-- (revenue_month_orders, SECURITY INVOKER) and a run read them as their reader.
DROP POLICY IF EXISTS catalogue_gwp_principal_all ON public.catalogue_gwp;
CREATE POLICY catalogue_gwp_principal_all ON public.catalogue_gwp FOR ALL TO authenticated
    USING ((SELECT has_scope(ARRAY['admin']))) WITH CHECK ((SELECT has_scope(ARRAY['admin'])));
DROP POLICY IF EXISTS catalogue_gwp_product_list ON public.catalogue_gwp;
CREATE POLICY catalogue_gwp_product_list ON public.catalogue_gwp FOR ALL TO authenticated
    USING ((SELECT has_perm('product_list'))) WITH CHECK ((SELECT has_perm('product_list')));
DROP POLICY IF EXISTS catalogue_gwp_hr_select ON public.catalogue_gwp;
CREATE POLICY catalogue_gwp_hr_select ON public.catalogue_gwp FOR SELECT TO authenticated
    USING ((SELECT has_scope(ARRAY['hr'])));

DROP POLICY IF EXISTS catalogue_gwp_items_principal_all ON public.catalogue_gwp_items;
CREATE POLICY catalogue_gwp_items_principal_all ON public.catalogue_gwp_items FOR ALL TO authenticated
    USING ((SELECT has_scope(ARRAY['admin']))) WITH CHECK ((SELECT has_scope(ARRAY['admin'])));
DROP POLICY IF EXISTS catalogue_gwp_items_product_list ON public.catalogue_gwp_items;
CREATE POLICY catalogue_gwp_items_product_list ON public.catalogue_gwp_items FOR ALL TO authenticated
    USING ((SELECT has_perm('product_list'))) WITH CHECK ((SELECT has_perm('product_list')));
DROP POLICY IF EXISTS catalogue_gwp_items_hr_select ON public.catalogue_gwp_items;
CREATE POLICY catalogue_gwp_items_hr_select ON public.catalogue_gwp_items FOR SELECT TO authenticated
    USING ((SELECT has_scope(ARRAY['hr'])));

REVOKE ALL ON public.catalogue_gwp FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogue_gwp TO authenticated;
GRANT ALL ON public.catalogue_gwp TO service_role;
REVOKE ALL ON public.catalogue_gwp_items FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogue_gwp_items TO authenticated;
GRANT ALL ON public.catalogue_gwp_items TO service_role;

SELECT public.audit_register('catalogue_gwp', 'Gifts with purchase', 'Catalogue', '{product_list}', 'all',
    p_keys => '{id}', p_labels => '{qty_per_unit}');
SELECT public.audit_register('catalogue_gwp_items', 'Gifts with purchase · SKUs', 'Catalogue', '{product_list}', 'all',
    p_keys => '{gwp_id,role,erp_product_id}', p_labels => '{role,product_code}');

-- Who writes them (Product List · Edit) and who reads them: the Product List, and whoever reads a margin a bill
-- makes — Comm Cal's month, a run, a bill's page (comm_cost_ratios' readers, and a Recost's).
INSERT INTO public.permission_table_writes (table_name, command, actions) VALUES
  ('catalogue_gwp', 'DELETE', ARRAY['product_list.edit']),
  ('catalogue_gwp', 'INSERT', ARRAY['product_list.edit']),
  ('catalogue_gwp', 'UPDATE', ARRAY['product_list.edit']),
  ('catalogue_gwp_items', 'DELETE', ARRAY['product_list.edit']),
  ('catalogue_gwp_items', 'INSERT', ARRAY['product_list.edit']),
  ('catalogue_gwp_items', 'UPDATE', ARRAY['product_list.edit'])
ON CONFLICT (table_name, command) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_writes_guard('catalogue_gwp');
SELECT public.permission_writes_guard('catalogue_gwp_items');

INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('catalogue_gwp', ARRAY['product_list.edit', 'product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('catalogue_gwp_items', ARRAY['product_list.edit', 'product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_reads_guard('catalogue_gwp');
SELECT public.permission_reads_guard('catalogue_gwp_items');

-- ── 2. Product List › GWP's Save ────────────────────────────────────────────────────────────────────────────────────
-- p_id NULL makes one (qty, buy and gift all needed); else only the keys sent change it — qty, buy (the whole set of
-- SKUs bought), gift (the whole set given) — or {"remove": true} takes it away. SECURITY INVOKER: the tables'
-- policies decide (Product List · Edit). What names a SKU is read here, never taken from the caller.
CREATE OR REPLACE FUNCTION public.catalogue_save_gwp(p_id UUID, p_changes JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
DECLARE
    v_id   UUID := p_id;
    v_qty  INTEGER;
    v_side TEXT;
    v_ids  TEXT[];
    v_bad  TEXT;
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

    IF p_changes ? 'qty' THEN
        IF jsonb_typeof(p_changes->'qty') IS DISTINCT FROM 'number'
           OR (p_changes->>'qty')::NUMERIC <> TRUNC((p_changes->>'qty')::NUMERIC)
           OR (p_changes->>'qty')::NUMERIC NOT BETWEEN 1 AND 100 THEN
            RAISE EXCEPTION 'Free a unit is a whole number from 1 to 100' USING ERRCODE = '22023';
        END IF;
        v_qty := (p_changes->>'qty')::INTEGER;
    END IF;

    IF v_id IS NULL THEN
        IF v_qty IS NULL OR NOT (p_changes ? 'buy') OR NOT (p_changes ? 'gift') THEN
            RAISE EXCEPTION 'A new GWP needs what is bought, the gifts and how many a unit' USING ERRCODE = '22023';
        END IF;
        INSERT INTO catalogue_gwp (qty_per_unit, created_by, updated_by)
        VALUES (v_qty, auth.uid(), auth.uid())
        RETURNING id INTO v_id;
    ELSE
        UPDATE catalogue_gwp
           SET qty_per_unit = COALESCE(v_qty, qty_per_unit), updated_by = auth.uid(), updated_at = now()
         WHERE id = v_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'This GWP is no longer on the list' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    FOREACH v_side IN ARRAY ARRAY['buy', 'gift'] LOOP
        CONTINUE WHEN NOT (p_changes ? v_side);
        IF jsonb_typeof(p_changes->v_side) IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION '% is a list of SKUs', CASE v_side WHEN 'buy' THEN 'Bought' ELSE 'Gifts' END USING ERRCODE = '22023';
        END IF;
        v_ids := ARRAY(SELECT DISTINCT e FROM jsonb_array_elements_text(p_changes->v_side) AS e);
        IF COALESCE(CARDINALITY(v_ids), 0) = 0 THEN
            RAISE EXCEPTION '%', CASE v_side WHEN 'buy' THEN 'Pick the SKUs bought' ELSE 'Pick the gifts' END USING ERRCODE = '22023';
        END IF;
        SELECT x INTO v_bad FROM unnest(v_ids) AS x WHERE NOT EXISTS (SELECT 1 FROM erp_products p WHERE p.erp_id = x) LIMIT 1;
        IF FOUND THEN
            RAISE EXCEPTION 'SKU % is not in the SKU Master', v_bad USING ERRCODE = '23503';
        END IF;
        DELETE FROM catalogue_gwp_items i WHERE i.gwp_id = v_id AND i.role = v_side AND NOT (i.erp_product_id = ANY (v_ids));
        INSERT INTO catalogue_gwp_items (gwp_id, role, erp_product_id, product_code)
        SELECT v_id, v_side, p.erp_id, p.item_code FROM erp_products p WHERE p.erp_id = ANY (v_ids)
        ON CONFLICT (gwp_id, role, erp_product_id) DO NOTHING;
    END LOOP;

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
    'Product List › GWP''s Save (2026-11-08): makes a gift with purchase, changes one — only the keys sent: qty, buy, gift — or takes one away ({"remove": true}), in one transaction. SECURITY INVOKER: the tables'' policies decide (Product List · Edit).';

REVOKE ALL ON FUNCTION public.catalogue_save_gwp(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalogue_save_gwp(UUID, JSONB) TO authenticated;

-- ── 3. What a purchase earns free, line by line ─────────────────────────────────────────────────────────────────────
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
        SELECT DISTINCT i.gwp_id, UPPER(BTRIM(i.product_code)) AS code FROM catalogue_gwp_items i WHERE i.role = 'gift'
    ), allowance AS (
        -- Each GWP's allowance on each bill: its units a unit × every unit of its buy SKUs there.
        SELECT g.id AS gwp_id, l.order_id, g.qty_per_unit * SUM(l.qty) AS units
          FROM catalogue_gwp g
          JOIN buys b ON b.gwp_id = g.id
          JOIN lines l ON l.code = b.code
         GROUP BY g.id, l.order_id, g.qty_per_unit
    ), claims AS (
        -- Its gift SKUs' lines take it cheapest first (a cost not known yet first of all), then by the line's id.
        SELECT l.id, l.qty, a.units,
               COALESCE(SUM(l.qty) OVER (PARTITION BY a.gwp_id, a.order_id
                                         ORDER BY l.unit_cost NULLS FIRST, l.id::TEXT COLLATE "C"
                                         ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS before
          FROM allowance a
          JOIN gifts gi ON gi.gwp_id = a.gwp_id
          JOIN lines l ON l.order_id = a.order_id AND l.code = gi.code
    )
    SELECT c.id, LEAST(MAX(c.qty), SUM(GREATEST(LEAST(c.units - c.before, c.qty), 0)))
      FROM claims c
     GROUP BY c.id
    HAVING SUM(GREATEST(LEAST(c.units - c.before, c.qty), 0)) > 0;
$fn$;

COMMENT ON FUNCTION public.sales_order_gwp_free(UUID[]) IS
    'Product List › GWP (2026-11-08): each line of these bills a purchase earned free, in units — a GWP''s allowance on a bill is its units a unit × its buy SKUs'' units there, taken by its gift SKUs'' lines cheapest first (an unknown cost first), then by line id; a line never more than wholly. Twin: gwpFreeUnits (lib/catalogue/gwp.ts).';

REVOKE ALL ON FUNCTION public.sales_order_gwp_free(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_order_gwp_free(UUID[]) TO authenticated, service_role;

-- ── 4–6. The readers ────────────────────────────────────────────────────────────────────────────────────────────────
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

-- ── 4. member_quote_cost_rules: the calculator's rules carry the GWPs ───────────────────────────────────────────────
-- Service role only (lib/member/server.ts, after member_quote_context authorised the session): nothing of it
-- reaches a browser. [{ id, perUnit, buy: [codes], gift: [codes] }].
SELECT pg_temp.made_with('public.member_quote_cost_rules(uuid)', '9973901db6f5109566723a1ed4ad2b67', ARRAY[
    $o$GROUP BY b.product_code) x));$o$,
    $n$GROUP BY b.product_code) x),
  -- (20261108010000) The gifts with purchase (Product List › GWP): with a buy SKU in the cart, up to its units of the
  -- gift SKUs leave the cost, cheapest first, as the run reads the bill.
  'gwp',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'perUnit',g.qty_per_unit,
    'buy',(SELECT coalesce(jsonb_agg(i.product_code ORDER BY i.product_code),'[]'::jsonb)
     FROM public.catalogue_gwp_items i WHERE i.gwp_id=g.id AND i.role='buy'),
    'gift',(SELECT coalesce(jsonb_agg(i.product_code ORDER BY i.product_code),'[]'::jsonb)
     FROM public.catalogue_gwp_items i WHERE i.gwp_id=g.id AND i.role='gift'))
   ORDER BY g.created_at,g.id),'[]'::jsonb) FROM public.catalogue_gwp g));$n$
  ]);

-- ── 5. revenue_month_orders: Comm Cal's month ──────────────────────────────────────────────────────────────────────
SELECT pg_temp.made_with('public.revenue_month_orders(uuid, date)', '99c8386e4549d99c963b250c4538ce80', ARRAY[
    -- (a) What the month's bills' purchases earn free, read once.
    $o$GROUP BY h.order_id
    )
    SELECT$o$,
    $n$GROUP BY h.order_id
    ), gwp AS (
        -- (20261108010000) What each bill's purchases earn free (Product List › GWP): the units of each line given.
        SELECT g.line_id, g.free_qty
          FROM sales_order_gwp_free(ARRAY(SELECT o.id FROM sales_orders o JOIN batch ON batch.id = o.batch_id)) g
    )
    SELECT$n$,
    -- (b) A line wholly given never holds the bill as uncosted …
    $o$COUNT(*) FILTER (WHERE ig.commissionable AND sl.cost_amount IS NULL) > 0$o$,
    $n$COUNT(*) FILTER (WHERE ig.commissionable AND sl.cost_amount IS NULL
                                             AND NOT COALESCE(gw.free_qty >= sl.qty, FALSE)) > 0$n$,
    -- (c) … and the part of a line given leaves the cost.
    $o$SUM(sl.cost_amount / COALESCE(crb.ratio, cr.ratio, sc.cost_divisor))$o$,
    $n$SUM(sl.cost_amount * (1 - COALESCE(gw.free_qty / NULLIF(sl.qty, 0), 0))
                                / COALESCE(crb.ratio, cr.ratio, sc.cost_divisor))$n$,
    -- (d) Nor is a line wholly given a line without a cost.
    $o$COUNT(*) FILTER (WHERE sl.cost_amount IS NULL) AS no_cost$o$,
    $n$COUNT(*) FILTER (WHERE sl.cost_amount IS NULL AND NOT COALESCE(gw.free_qty >= sl.qty, FALSE)) AS no_cost$n$,
    -- (e) Each line's units given.
    $o$AND UPPER(BTRIM(crb.brand_code)) = lb.brand$o$,
    $n$AND UPPER(BTRIM(crb.brand_code)) = lb.brand
                -- (20261108010000) The units of the line a purchase earned free (Product List › GWP).
                LEFT JOIN gwp gw ON gw.line_id = sl.id$n$
  ]);

-- ── 6. member_order_facts_with_old_bills: Insight, the Arena, Today ────────────────────────────────────────────────
SELECT pg_temp.made_with('public.member_order_facts_with_old_bills(uuid, date, date)', '6904a0dd72dcc3abe5b4463071bbe077', ARRAY[
    -- (a) What the window's bills' purchases earn free, read once.
    $o$), kpi AS ($o$,
    $n$), gwp AS (
  -- (20261108010000) What each bill's purchases earn free (Product List › GWP): the units of each line given.
  SELECT g.line_id,g.free_qty FROM public.sales_order_gwp_free(ARRAY(SELECT w.id FROM windowed w)) g
 ), kpi AS ($n$,
    -- (b) The part of a line given leaves its cost; a line wholly given is marked.
    $o$l.cost_amount/coalesce(crb.ratio,cr.ratio,o.cost_divisor) AS team_cost,$o$,
    $n$l.cost_amount*(1-coalesce(gw.free_qty/nullif(l.qty,0),0))/coalesce(crb.ratio,cr.ratio,o.cost_divisor) AS team_cost,
   -- (20261108010000) A line wholly given with a purchase never holds the bill as uncosted.
   coalesce(gw.free_qty>=l.qty,false) AS gwp_whole,$n$,
    -- (c) Each line's units given.
    $o$AND upper(btrim(crb.product_code))=upper(btrim(l.product_code)) AND upper(btrim(crb.brand_code))=lb.brand$o$,
    $n$AND upper(btrim(crb.product_code))=upper(btrim(l.product_code)) AND upper(btrim(crb.brand_code))=lb.brand
  LEFT JOIN gwp gw ON gw.line_id=l.id$n$,
    -- (d) A bill is costed when every goods line has a cost or is wholly given.
    $o$bool_and(l.cost_amount IS NOT NULL) FILTER(WHERE l.is_goods) AS costed,$o$,
    $n$bool_and(l.cost_amount IS NOT NULL OR l.gwp_whole) FILTER(WHERE l.is_goods) AS costed,$n$
  ]);

-- What this migration made is what it was written to make — every mismatch in one refusal.
DO $$
DECLARE
  r record;
  v_md5 text;
  v_bad text := '';
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.catalogue_save_gwp(uuid, jsonb)', '63d3d0104c92966e459e96b5f83e4f30'),
      ('public.sales_order_gwp_free(uuid[])', '658722b990b11b99acc37995ce8dc8f3'),
      ('public.member_quote_cost_rules(uuid)', '9973901db6f5109566723a1ed4ad2b67'),
      ('public.revenue_month_orders(uuid, date)', '99c8386e4549d99c963b250c4538ce80'),
      ('public.member_order_facts_with_old_bills(uuid, date, date)', '6904a0dd72dcc3abe5b4463071bbe077')
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
-- revenue_month_orders and member_order_facts_with_old_bills back as production had them (md5 49c4eff9…, 33b6bd20…,
-- c4daa35e…), take away catalogue_save_gwp and sales_order_gwp_free, the two tables' rows in permission_table_reads /
-- permission_table_writes / audit_tables, and the tables themselves.
