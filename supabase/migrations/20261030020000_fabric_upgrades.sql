-- ============================================================================
-- 20261030020000_fabric_upgrades.sql
-- A fabric upgrade: a name and a charge, and the fabric series it is for (2026-10-29).
-- ============================================================================
--
-- The user, on Product List › Maintenance › Fabrics: "我可以选择 fabric，选到某一个 fabric series 的话它是加多少钱，
-- 比如 additional 可能加 200 块。所以这 200 块本身是没有算进 margin 里面的 same as special order concept. this
-- setting is for sofa and bedframe category". Asked, the user chose an upgrade made first and its series ticked
-- under it ("先建 upgrade 再勾 series") — NAME (what the Quote says) · CHARGE (RM) · SERIES; a sofa charged once per
-- sofa ("一组 sofa 加一次"), a bed frame once per frame; the Quote picks the upgrade by its name ("upgrade fabric
-- enough, then i can edit the name and price").
--
--   1. catalogue_fabric_upgrades        an upgrade: a sofa's or a bed frame's, its name and its charge
--   2. catalogue_fabric_upgrade_series  the series ticked under it — a series in one upgrade of a category at most
--   3. catalogue_fabric_upgrade_for     a line's fabric → its series on the ERP's fabric list → that upgrade
--   4. catalogue_save_fabric_upgrades   Maintenance's Save: adds, changes (only what changed), removes — at once
--   5. catalogue_line_option_charge     a bed frame's upgrade, per frame, beside its options
--   6. catalogue_apply_sofa_charges     a sofa's upgrade, once per sofa × the sofas, beside its leg and specials
--
-- A CHARGE, as every option priced on Maintenance (2026-10-06): what the customer pays on top —
-- sales_order_lines.option_charge_amount, out of the margin, in the commissionable sales, never KPI. A line's fabric
-- is the costing's (catalogue_line_facts: variants.fabricCode, else description2's first word) and its series the
-- ERP's fabric list's, found as Rules › KPI items finds it (20261030010000): the code trimmed, in any case, the live
-- row first where a code is listed twice. A fabric keyed TBC has no series and no upgrade; when the ERP saves the
-- order again with its fabric the whole order comes back, its lines are replaced and charged again (the fill-cost
-- trigger, then the deferred sofa pass). A month already landed moves when Recost is pressed
-- (recost_sales_order_lines calls both).
--
-- Production's bodies, md5-checked first — catalogue_line_option_charge 29346dbf… (20261006050000's),
-- catalogue_apply_sofa_charges cefb19e6… (20261027024500's) — each replaced whole; the md5s checked at the end.
-- PGlite: tests/member-sql/validate-fabric-upgrades.mjs (the migration verbatim twice).

BEGIN;

DO $$
DECLARE
    v_charge TEXT;
    v_apply  TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_charge
      FROM pg_proc WHERE oid = 'public.catalogue_line_option_charge(bigint, text, text, text, jsonb, numeric)'::regprocedure;
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_apply
      FROM pg_proc WHERE oid = 'public.catalogue_apply_sofa_charges(uuid)'::regprocedure;
    IF v_charge NOT IN ('29346dbf860b2efa9f02cb208f14f13f', '3f97dee2c547c8af6b2a56c88cd8cd90') THEN
        RAISE EXCEPTION 'catalogue_line_option_charge is md5 %, not the body this migration was written from', v_charge;
    END IF;
    IF v_apply NOT IN ('cefb19e6d7f7b7479dd752e5d9ac9d60', '174b99f3b8e622ccd0f0666da120acad') THEN
        RAISE EXCEPTION 'catalogue_apply_sofa_charges is md5 %, not the body this migration was written from', v_apply;
    END IF;
END $$;

-- ── 1. An upgrade ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.catalogue_fabric_upgrades (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    erp_company_id BIGINT        NOT NULL DEFAULT 1,
    category       TEXT          NOT NULL CHECK (category IN ('SOFA', 'BEDFRAME')),
    -- What the Quote and the customer's quote say: "Upgrade fabric".
    name           TEXT          NOT NULL CHECK (name = BTRIM(name) AND name <> '' AND char_length(name) <= 80),
    -- The customer's: once per sofa, once per bed frame.
    price          NUMERIC(15,2) NOT NULL CHECK (price > 0),
    updated_by     UUID          DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE SET NULL,
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT catalogue_fabric_upgrades_category_key UNIQUE (id, erp_company_id, category)
);

COMMENT ON TABLE public.catalogue_fabric_upgrades IS
    'A fabric upgrade (2026-10-29, Product List › Maintenance › Fabrics › Sofa / Bedframe upgrades): what the customer pays on top for a fabric of the series ticked under it — a sofa once per sofa, a bed frame once per frame. A charge: out of the margin, in the commission, never KPI.';

-- One name per category, spelled any way.
CREATE UNIQUE INDEX IF NOT EXISTS catalogue_fabric_upgrades_name_key
    ON public.catalogue_fabric_upgrades (erp_company_id, category, catalogue_value_key(name));

-- ── 2. The series ticked under it ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.catalogue_fabric_upgrade_series (
    upgrade_id     UUID   NOT NULL,
    erp_company_id BIGINT NOT NULL DEFAULT 1,
    category       TEXT   NOT NULL,
    -- As the ERP's fabric list spells it (erp_fabrics.series): PC151, KS.
    series         TEXT   NOT NULL CHECK (series = BTRIM(series) AND series <> '' AND char_length(series) <= 80),
    PRIMARY KEY (upgrade_id, series),
    FOREIGN KEY (upgrade_id, erp_company_id, category)
        REFERENCES public.catalogue_fabric_upgrades (id, erp_company_id, category) ON DELETE CASCADE
);

COMMENT ON TABLE public.catalogue_fabric_upgrade_series IS
    'The fabric series an upgrade is for (catalogue_fabric_upgrades): a line whose fabric the ERP''s fabric list puts in one is charged the upgrade. A series is in one upgrade of a category at most; a sofa''s and a bed frame''s are apart.';

-- A series in one upgrade of a category at most.
CREATE UNIQUE INDEX IF NOT EXISTS catalogue_fabric_upgrade_series_one_upgrade
    ON public.catalogue_fabric_upgrade_series (erp_company_id, category, catalogue_value_key(series));

ALTER TABLE public.catalogue_fabric_upgrades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogue_fabric_upgrade_series ENABLE ROW LEVEL SECURITY;

-- As catalogue_option_prices: the Product List's key, the admin domain, and HR reading — a Recost and a file
-- import cost sales lines under HR's session.
DROP POLICY IF EXISTS catalogue_fabric_upgrades_principal_all ON public.catalogue_fabric_upgrades;
CREATE POLICY catalogue_fabric_upgrades_principal_all ON public.catalogue_fabric_upgrades FOR ALL TO authenticated
    USING ((SELECT has_scope(ARRAY['admin']))) WITH CHECK ((SELECT has_scope(ARRAY['admin'])));
DROP POLICY IF EXISTS catalogue_fabric_upgrades_product_list ON public.catalogue_fabric_upgrades;
CREATE POLICY catalogue_fabric_upgrades_product_list ON public.catalogue_fabric_upgrades FOR ALL TO authenticated
    USING ((SELECT has_perm('product_list'))) WITH CHECK ((SELECT has_perm('product_list')));
DROP POLICY IF EXISTS catalogue_fabric_upgrades_hr_select ON public.catalogue_fabric_upgrades;
CREATE POLICY catalogue_fabric_upgrades_hr_select ON public.catalogue_fabric_upgrades FOR SELECT TO authenticated
    USING ((SELECT has_scope(ARRAY['hr'])));

DROP POLICY IF EXISTS catalogue_fabric_upgrade_series_principal_all ON public.catalogue_fabric_upgrade_series;
CREATE POLICY catalogue_fabric_upgrade_series_principal_all ON public.catalogue_fabric_upgrade_series FOR ALL TO authenticated
    USING ((SELECT has_scope(ARRAY['admin']))) WITH CHECK ((SELECT has_scope(ARRAY['admin'])));
DROP POLICY IF EXISTS catalogue_fabric_upgrade_series_product_list ON public.catalogue_fabric_upgrade_series;
CREATE POLICY catalogue_fabric_upgrade_series_product_list ON public.catalogue_fabric_upgrade_series FOR ALL TO authenticated
    USING ((SELECT has_perm('product_list'))) WITH CHECK ((SELECT has_perm('product_list')));
DROP POLICY IF EXISTS catalogue_fabric_upgrade_series_hr_select ON public.catalogue_fabric_upgrade_series;
CREATE POLICY catalogue_fabric_upgrade_series_hr_select ON public.catalogue_fabric_upgrade_series FOR SELECT TO authenticated
    USING ((SELECT has_scope(ARRAY['hr'])));

REVOKE ALL ON public.catalogue_fabric_upgrades FROM anon, authenticated;
REVOKE ALL ON public.catalogue_fabric_upgrade_series FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogue_fabric_upgrades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogue_fabric_upgrade_series TO authenticated;
GRANT ALL ON public.catalogue_fabric_upgrades TO service_role;
GRANT ALL ON public.catalogue_fabric_upgrade_series TO service_role;

SELECT public.audit_register('catalogue_fabric_upgrades', 'Fabric upgrades', 'Catalogue', '{product_list}', 'all',
    p_keys => '{id}', p_labels => '{category,name}');
SELECT public.audit_register('catalogue_fabric_upgrade_series', 'Fabric upgrade series', 'Catalogue', '{product_list}', 'all',
    p_keys => '{upgrade_id,series}', p_labels => '{category,series}');

-- Who writes them (Product List · Edit) and who reads them — catalogue_option_prices' readers: the Product List,
-- and whoever writes a sales line (the fill-cost trigger and the sofa pass read them as the writer).
INSERT INTO public.permission_table_writes (table_name, command, actions) VALUES
  ('catalogue_fabric_upgrades', 'DELETE', ARRAY['product_list.edit']),
  ('catalogue_fabric_upgrades', 'INSERT', ARRAY['product_list.edit']),
  ('catalogue_fabric_upgrades', 'UPDATE', ARRAY['product_list.edit']),
  ('catalogue_fabric_upgrade_series', 'DELETE', ARRAY['product_list.edit']),
  ('catalogue_fabric_upgrade_series', 'INSERT', ARRAY['product_list.edit']),
  ('catalogue_fabric_upgrade_series', 'UPDATE', ARRAY['product_list.edit'])
ON CONFLICT (table_name, command) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_writes_guard('catalogue_fabric_upgrades');
SELECT public.permission_writes_guard('catalogue_fabric_upgrade_series');

INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('catalogue_fabric_upgrades', ARRAY['product_list.edit', 'product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage']),
  ('catalogue_fabric_upgrade_series', ARRAY['product_list.edit', 'product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_reads_guard('catalogue_fabric_upgrades');
SELECT public.permission_reads_guard('catalogue_fabric_upgrade_series');

-- ── 3. A line's fabric → its upgrade ────────────────────────────────────────
-- Its series on the ERP's fabric list (the code trimmed, in any case; a code listed twice: the live row, then the
-- active one, then the latest delivery's — as comm_kpi_hits finds it), then the upgrade of the category whose
-- series list holds it. Nothing while the category has no upgrade.
CREATE OR REPLACE FUNCTION public.catalogue_fabric_upgrade_for(p_company BIGINT, p_category TEXT, p_fabric TEXT)
RETURNS TABLE (id UUID, name TEXT, series TEXT, price NUMERIC)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT u.id, u.name, x.series, u.price
      FROM catalogue_fabric_upgrade_series x
      JOIN catalogue_fabric_upgrades u ON u.id = x.upgrade_id
     WHERE x.erp_company_id = p_company
       AND x.category = UPPER(BTRIM(COALESCE(p_category, '')))
       AND catalogue_value_key(x.series) = (
           SELECT catalogue_value_key(f.series)
             FROM erp_fabrics f
            WHERE f.erp_company_id = p_company
              AND UPPER(BTRIM(f.fabric_code)) = UPPER(BTRIM(p_fabric))
              AND NULLIF(BTRIM(COALESCE(f.series, '')), '') IS NOT NULL
            ORDER BY (f.removed_at IS NULL) DESC, f.active DESC, f.synced_at DESC
            LIMIT 1)
     LIMIT 1;
$fn$;

COMMENT ON FUNCTION public.catalogue_fabric_upgrade_for(BIGINT, TEXT, TEXT) IS
    'The fabric upgrade a line''s fabric is charged (2026-10-29): its series on the ERP''s fabric list (the live row first), then the upgrade of the category (SOFA / BEDFRAME) whose series list holds it. No row when there is none.';

REVOKE ALL ON FUNCTION public.catalogue_fabric_upgrade_for(BIGINT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalogue_fabric_upgrade_for(BIGINT, TEXT, TEXT) TO authenticated, service_role;

-- ── 4. Maintenance's Save ───────────────────────────────────────────────────
-- p_adds    [{ "name": "Upgrade fabric", "price": 200, "series": ["PC151", "KS"] }]
-- p_changes [{ "id": …, "name"?: …, "price"?: …, "add_series"?: [...], "drop_series"?: [...] }] — only what the page
--           changed: a name or a charge it did not touch is left as it stands, a series it did not tick or untick too.
-- p_removes the upgrades taken off; their series go with them.
-- Under the caller's own session (Product List · Edit, the tables' policies), one transaction. Series unticked first,
-- so a series moved from one upgrade to another in one Save is free to move. Returns the rows written.
CREATE OR REPLACE FUNCTION public.catalogue_save_fabric_upgrades(p_category TEXT, p_adds JSONB, p_changes JSONB, p_removes UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
    v_cat   TEXT := UPPER(BTRIM(COALESCE(p_category, '')));
    v_n     INTEGER := 0;
    v_k     INTEGER;
    v_id    UUID;
    v_name  TEXT;
    v_price NUMERIC;
    v_held  TEXT;
    v_item  JSONB;
    v_list  JSONB;
    v_s     TEXT;
BEGIN
    IF v_cat NOT IN ('SOFA', 'BEDFRAME') THEN
        RAISE EXCEPTION 'A fabric upgrade is a sofa''s or a bed frame''s' USING ERRCODE = '22023';
    END IF;

    DELETE FROM catalogue_fabric_upgrades u
     WHERE u.erp_company_id = 1 AND u.category = v_cat AND u.id = ANY (COALESCE(p_removes, '{}'::UUID[]));
    GET DIAGNOSTICS v_k = ROW_COUNT;
    v_n := v_n + v_k;

    FOR v_item IN SELECT e FROM jsonb_array_elements(COALESCE(p_changes, '[]'::JSONB)) e LOOP
        v_id := (v_item->>'id')::UUID;
        IF NOT EXISTS (SELECT 1 FROM catalogue_fabric_upgrades u
                        WHERE u.id = v_id AND u.erp_company_id = 1 AND u.category = v_cat) THEN
            RAISE EXCEPTION 'An upgrade was taken off since the page was opened — reload it' USING ERRCODE = '22023';
        END IF;
        DELETE FROM catalogue_fabric_upgrade_series x
         WHERE x.upgrade_id = v_id
           AND catalogue_value_key(x.series) IN (
               SELECT catalogue_value_key(d) FROM jsonb_array_elements_text(COALESCE(v_item->'drop_series', '[]'::JSONB)) d);
        GET DIAGNOSTICS v_k = ROW_COUNT;
        v_n := v_n + v_k;
    END LOOP;

    -- The upgrades, new and changed, and each one's series to tick.
    FOR v_item IN
        SELECT e || jsonb_build_object('series', COALESCE(e->'series', '[]'::JSONB)) FROM jsonb_array_elements(COALESCE(p_adds, '[]'::JSONB)) e
        UNION ALL
        SELECT e || jsonb_build_object('series', COALESCE(e->'add_series', '[]'::JSONB)) FROM jsonb_array_elements(COALESCE(p_changes, '[]'::JSONB)) e
    LOOP
        v_id := NULLIF(v_item->>'id', '')::UUID;
        IF v_id IS NULL OR v_item ? 'name' OR v_item ? 'price' THEN
            v_name := CASE WHEN v_item ? 'name' THEN BTRIM(REGEXP_REPLACE(COALESCE(v_item->>'name', ''), '\s+', ' ', 'g')) END;
            v_price := CASE WHEN v_item ? 'price' THEN (v_item->>'price')::NUMERIC END;
            IF (v_id IS NULL OR v_item ? 'name') AND COALESCE(v_name, '') = '' THEN
                RAISE EXCEPTION 'An upgrade has no name' USING ERRCODE = '22023';
            END IF;
            IF (v_id IS NULL OR v_item ? 'price') AND (v_price IS NULL OR v_price <= 0) THEN
                RAISE EXCEPTION '%: a charge above 0', COALESCE(v_name, 'An upgrade') USING ERRCODE = '22023';
            END IF;
            IF v_name IS NOT NULL THEN
                SELECT u.name INTO v_held FROM catalogue_fabric_upgrades u
                 WHERE u.erp_company_id = 1 AND u.category = v_cat AND u.id IS DISTINCT FROM v_id
                   AND catalogue_value_key(u.name) = catalogue_value_key(v_name);
                IF FOUND THEN
                    RAISE EXCEPTION 'There is already an upgrade named %', v_held USING ERRCODE = '22023';
                END IF;
            END IF;
            IF v_id IS NULL THEN
                INSERT INTO catalogue_fabric_upgrades (erp_company_id, category, name, price, updated_by, updated_at)
                VALUES (1, v_cat, v_name, v_price, auth.uid(), now())
                RETURNING catalogue_fabric_upgrades.id INTO v_id;
            ELSE
                UPDATE catalogue_fabric_upgrades u
                   SET name = COALESCE(v_name, u.name), price = COALESCE(v_price, u.price),
                       updated_by = auth.uid(), updated_at = now()
                 WHERE u.id = v_id;
            END IF;
            v_n := v_n + 1;
        END IF;

        v_list := v_item->'series';
        FOR v_s IN SELECT BTRIM(t) FROM jsonb_array_elements_text(v_list) t WHERE BTRIM(t) <> '' LOOP
            SELECT u.name INTO v_held
              FROM catalogue_fabric_upgrade_series x
              JOIN catalogue_fabric_upgrades u ON u.id = x.upgrade_id
             WHERE x.erp_company_id = 1 AND x.category = v_cat AND x.upgrade_id <> v_id
               AND catalogue_value_key(x.series) = catalogue_value_key(v_s);
            IF FOUND THEN
                RAISE EXCEPTION '% is already in %', v_s, v_held USING ERRCODE = '22023';
            END IF;
            INSERT INTO catalogue_fabric_upgrade_series (upgrade_id, erp_company_id, category, series)
            VALUES (v_id, 1, v_cat, v_s)
            ON CONFLICT DO NOTHING;
            GET DIAGNOSTICS v_k = ROW_COUNT;
            v_n := v_n + v_k;
        END LOOP;
    END LOOP;

    RETURN v_n;
END;
$fn$;

COMMENT ON FUNCTION public.catalogue_save_fabric_upgrades(TEXT, JSONB, JSONB, UUID[]) IS
    'Product List › Maintenance › Fabrics › Sofa / Bedframe upgrades'' Save (2026-10-29): adds, changes — only the fields and series the page changed — and removes, in one transaction; a series in one upgrade of the category at most, a name once. SECURITY INVOKER: the tables'' policies decide.';

REVOKE ALL ON FUNCTION public.catalogue_save_fabric_upgrades(TEXT, JSONB, JSONB, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalogue_save_fabric_upgrades(TEXT, JSONB, JSONB, UUID[]) TO authenticated;

-- ── 5. A bed frame's upgrade, per frame ─────────────────────────────────────
-- Production's body (20261006050000's), its upgrade added after its options: the part names the upgrade and the
-- series it was found by.
CREATE OR REPLACE FUNCTION public.catalogue_line_option_charge(p_company bigint, p_code text, p_item_group text, p_description2 text, p_raw jsonb, p_qty numeric)
 RETURNS TABLE(amount numeric, unit numeric, parts jsonb)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
    f     RECORD;
    c     RECORD;
    u     RECORD;
    v_cat TEXT;
BEGIN
    amount := 0;
    unit   := 0;
    parts  := '[]'::JSONB;
    SELECT e.category INTO v_cat FROM catalogue_sku_for_code(p_company, p_code) e;
    v_cat := UPPER(COALESCE(v_cat, p_item_group, ''));
    IF v_cat <> 'BEDFRAME' THEN
        RETURN NEXT;
        RETURN;
    END IF;
    SELECT * INTO f FROM catalogue_line_facts(p_description2, p_raw);
    SELECT * INTO c FROM catalogue_line_charge(p_company, v_cat, f.divan, f.leg, f.gap, f.total, f.specials);
    unit   := COALESCE(c.amount, 0);
    parts  := COALESCE(c.parts, '[]'::JSONB);
    -- Its fabric's upgrade (2026-10-29), per frame as every option.
    SELECT * INTO u FROM catalogue_fabric_upgrade_for(p_company, v_cat, f.fabric);
    IF FOUND AND u.price > 0 THEN
        unit  := unit + u.price;
        parts := parts || jsonb_build_array(jsonb_build_object(
            'pool', 'bedframe_fabric_upgrades', 'value', u.name, 'series', u.series, 'price', u.price));
    END IF;
    amount := ROUND(unit * COALESCE(p_qty, 0), 2);
    RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.catalogue_line_option_charge(bigint, text, text, text, jsonb, numeric) IS
    'What the customer pays on top for a bed frame line''s options (2026-10-06) and its fabric''s upgrade (2026-10-29): every divan, leg, gap, total height and special priced above zero on Maintenance, and the upgrade of the series its fabric is in, per frame × qty. Out of the margin, in the commissionable sales, never KPI. A sofa is charged once per sofa by catalogue_apply_sofa_charges.';

-- ── 6. A sofa's upgrade, once per sofa ──────────────────────────────────────
-- Production's body (20261027024500's): each piece's fabric read beside its leg and specials; each upgrade any piece
-- of the sofa is in charged once × the sofas, as a special charged as a full set; its part names the series.
CREATE OR REPLACE FUNCTION public.catalogue_apply_sofa_charges(p_order_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_company BIGINT;
    v_changed INTEGER := 0;
    v_n       INTEGER;
    g         RECORD;
    v_total   BIGINT;
    v_sum     BIGINT;
    v_shares  BIGINT[];
    v_target  INTEGER;
    k         INTEGER;
BEGIN
    SELECT COALESCE(o.erp_company_id, 1) INTO v_company
      FROM sales_orders o WHERE o.id = p_order_id;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- Back to no charge first, so a set that no longer carries one (a price
    -- removed, a special dropped in the ERP) lets go of it. Only this pass
    -- ever charges a sofa line, and it always says so in charge_set.
    UPDATE sales_order_lines l
       SET option_charge_amount = 0,
           cost_detail = CASE WHEN l.cost_detail IS NULL THEN NULL
                              ELSE l.cost_detail - 'charges' - 'charge_set' END
     WHERE l.order_id = p_order_id
       AND (l.option_charge_amount <> 0 OR COALESCE(l.cost_detail ? 'charge_set', FALSE))
       AND UPPER(COALESCE((SELECT e.category FROM catalogue_sku_for_code(v_company, l.product_code) e LIMIT 1),
                          l.item_group, '')) = 'SOFA';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_changed := v_changed + v_n;

    FOR g IN
        WITH lines AS (
            SELECT l.id, l.line_no, l.qty,
                   ROUND(GREATEST(COALESCE(l.line_amount, 0), 0) * 100)::BIGINT AS weight,
                   COALESCE(NULLIF(UPPER(BTRIM(e.base_model)), ''),
                            NULLIF(UPPER(SPLIT_PART(BTRIM(COALESCE(l.product_code, '')), '-', 1)), ''),
                            l.id::TEXT) AS base_model,
                   -- Its back cushions — its compartments (the ERP's SOFA_MODULES): the module is
                   -- the code after its last '-', before its brackets.
                   CASE WHEN m.module ~ '^[0-9](A|B|NA|S)$' THEN SUBSTRING(m.module FROM 1 FOR 1)::INTEGER
                        WHEN m.module IN ('CNR', 'CONSOLE', 'STOOL', 'OTT') THEN 0
                        ELSE 1 END AS cushions,
                   f.leg, f.specials, f.fabric
              FROM sales_order_lines l
              LEFT JOIN LATERAL (SELECT x.category, x.base_model
                                   FROM catalogue_sku_for_code(v_company, l.product_code) x
                                  LIMIT 1) e ON TRUE
              CROSS JOIN LATERAL (SELECT UPPER(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(l.product_code, ''),
                                                 '^.*-', ''), '\s+', '', 'g'), '\(.*$', '')) AS module) m
              CROSS JOIN LATERAL catalogue_line_facts(l.description2, l.raw) f
             WHERE l.order_id = p_order_id
               AND UPPER(COALESCE(e.category, l.item_group, '')) = 'SOFA'
               AND COALESCE(l.qty, 0) > 0
        ), sofas AS (
            -- How many sofas — the smallest quantity among the pieces (×2 everywhere = two
            -- sofas) — and how many compartments, every piece's cushions times its quantity.
            SELECT s.base_model, GREATEST(FLOOR(MIN(s.qty)), 1)::INTEGER AS sets,
                   ROUND(SUM(s.cushions * s.qty))::INTEGER AS compartments
              FROM lines s
             GROUP BY s.base_model
        ), named AS (
            -- Every option any piece of the sofa names, once: a value spelled two ways
            -- is one value.
            SELECT x.base_model, x.pool, MIN(x.value) AS value
              FROM (SELECT s.base_model, 'sofa_leg_heights'::TEXT AS pool, BTRIM(s.leg) AS value
                      FROM lines s
                     WHERE NULLIF(BTRIM(COALESCE(s.leg, '')), '') IS NOT NULL
                    UNION ALL
                    SELECT s.base_model, 'sofa_specials', BTRIM(sp)
                      FROM lines s, unnest(s.specials) sp
                     WHERE NULLIF(BTRIM(COALESCE(sp, '')), '') IS NOT NULL) x
             GROUP BY x.base_model, x.pool, catalogue_value_key(x.value)
        ), upgrades AS (
            -- Every fabric upgrade a piece of the sofa is in (2026-10-29), once: Maintenance ›
            -- Fabrics › Sofa upgrades, by the series the piece's fabric is in on the ERP's list.
            SELECT DISTINCT ON (s.base_model, u.id) s.base_model, u.name, u.series, u.price
              FROM lines s
              CROSS JOIN LATERAL catalogue_fabric_upgrade_for(v_company, 'SOFA', s.fabric) u
             WHERE u.price > 0
             ORDER BY s.base_model, u.id, s.line_no, s.id
        ), parts AS (
            -- Maintenance's price, the row catalogue_option_price reads: once per sofa, a
            -- special charged By quantity once per compartment; an upgrade once per sofa.
            SELECT n.base_model, n.pool, n.value, NULL::TEXT AS series, op.price, op.by_quantity,
                   CASE WHEN op.by_quantity THEN st.compartments ELSE st.sets END AS times
              FROM named n
              JOIN sofas st ON st.base_model = n.base_model
              CROSS JOIN LATERAL (
                  SELECT o.price, o.by_quantity
                    FROM catalogue_option_prices o
                   WHERE o.erp_company_id = v_company
                     AND o.pool = n.pool
                     AND catalogue_value_key(o.value) IN (catalogue_value_key(n.value),
                                                          catalogue_value_key(REGEXP_REPLACE(COALESCE(n.value, ''), '\s*\(.*\)\s*$', '')))
                   ORDER BY (catalogue_value_key(o.value) = catalogue_value_key(n.value)) DESC
                   LIMIT 1) op
             WHERE op.price > 0
            UNION ALL
            SELECT up.base_model, 'sofa_fabric_upgrades', up.name, up.series, up.price, FALSE, st.sets
              FROM upgrades up
              JOIN sofas st ON st.base_model = up.base_model
        ), charged AS (
            SELECT p.base_model,
                   SUM(ROUND(p.price * p.times * 100))::BIGINT AS total_sen,
                   jsonb_agg(jsonb_build_object('pool', p.pool, 'value', p.value, 'price', p.price, 'count', p.times)
                             || CASE WHEN p.by_quantity THEN jsonb_build_object('by_quantity', TRUE) ELSE '{}'::JSONB END
                             || CASE WHEN p.series IS NOT NULL THEN jsonb_build_object('series', p.series) ELSE '{}'::JSONB END
                             ORDER BY p.pool, p.value) AS parts
              FROM parts p
             WHERE p.times > 0
             GROUP BY p.base_model
        )
        SELECT s.base_model,
               ARRAY_AGG(s.id ORDER BY s.line_no, s.id)     AS ids,
               ARRAY_AGG(s.weight ORDER BY s.line_no, s.id) AS weights,
               st.sets, st.compartments, c.total_sen, c.parts
          FROM lines s
          JOIN sofas st ON st.base_model = s.base_model
          JOIN charged c ON c.base_model = s.base_model
         GROUP BY s.base_model, st.sets, st.compartments, c.total_sen, c.parts
    LOOP
        v_total := COALESCE(g.total_sen, 0);
        CONTINUE WHEN v_total <= 0;
        v_sum := (SELECT SUM(w) FROM unnest(g.weights) w);

        -- Spread in proportion to what each line sells for, the rounding
        -- residual to the dearest line; evenly when nothing is priced.
        IF v_sum <= 0 THEN
            v_shares := array_fill(v_total / array_length(g.ids, 1), ARRAY[array_length(g.ids, 1)]);
        ELSE
            v_shares := ARRAY(SELECT FLOOR(u.w::NUMERIC * v_total / v_sum)::BIGINT
                                FROM unnest(g.weights) WITH ORDINALITY AS u(w, i) ORDER BY u.i);
        END IF;
        v_target := 1;
        FOR k IN 2 .. array_length(g.ids, 1) LOOP
            IF g.weights[k] > g.weights[v_target] THEN
                v_target := k;
            END IF;
        END LOOP;
        v_shares[v_target] := v_shares[v_target] + (v_total - (SELECT SUM(x) FROM unnest(v_shares) x));

        FOR k IN 1 .. array_length(g.ids, 1) LOOP
            UPDATE sales_order_lines l
               SET option_charge_amount = v_shares[k]::NUMERIC / 100,
                   cost_detail = COALESCE(l.cost_detail, '{}'::JSONB) || jsonb_build_object(
                       'charges', g.parts,
                       'charge_set', jsonb_build_object('sets', g.sets, 'compartments', g.compartments,
                                                        'total', ROUND(v_total::NUMERIC / 100, 2),
                                                        'lines', array_length(g.ids, 1)))
             WHERE l.id = g.ids[k];
            v_changed := v_changed + 1;
        END LOOP;
    END LOOP;

    RETURN v_changed;
END;
$function$;

COMMENT ON FUNCTION public.catalogue_apply_sofa_charges(uuid) IS
    'Charges one order''s sofas their options (2026-10-27) and their fabric''s upgrade (2026-10-29): lines grouped by base model; every distinct leg height and special priced above zero on Maintenance — matched by name — once per sofa times the sofas (the smallest line quantity), a special charged By quantity once per compartment (each piece''s back cushions, the ERP''s SOFA_MODULES — a corner, a console and a stool none — times its quantity), each fabric upgrade a piece''s series is in once per sofa times the sofas; spread over the lines in proportion to their sales. The bill''s own special-order money is not read. Out of the margin, in the commissionable sales, never KPI. Idempotent — starts from no charge.';

DO $$
DECLARE
    v_charge TEXT;
    v_apply  TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_charge
      FROM pg_proc WHERE oid = 'public.catalogue_line_option_charge(bigint, text, text, text, jsonb, numeric)'::regprocedure;
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_apply
      FROM pg_proc WHERE oid = 'public.catalogue_apply_sofa_charges(uuid)'::regprocedure;
    IF v_charge <> '3f97dee2c547c8af6b2a56c88cd8cd90' OR v_apply <> '174b99f3b8e622ccd0f0666da120acad' THEN
        RAISE EXCEPTION 'the bodies landed as md5 % and %, not this file''s', v_charge, v_apply;
    END IF;
END $$;

COMMIT;

-- ═══ DOWN ════════════════════════════════════════════════════════════════════
-- Put back production's two bodies as they were (catalogue_line_option_charge from 20261006050000, md5 29346dbf…;
-- catalogue_apply_sofa_charges from 20261027020300 with 20261027024500's statement, md5 cefb19e6…), drop
-- catalogue_save_fabric_upgrades and catalogue_fabric_upgrade_for, the two tables (series first) with their rows
-- in the permission registry (writes and reads) and in audit_tables, then Recost any month whose bills were
-- charged an upgrade.
