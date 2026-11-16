-- Marketing — the Product Builder v2 (2026-11-16, docs/design_handoff_product_builder_v2/). What the redesign needs of the
-- database; every function changed here is PRODUCTION's body (read 2026-11-16, md5 compared) with the statements named
-- swapped or added.
--
-- • An item is INTERNAL (`mkt_items.internal`): seen by the team only — left off the client's PDF, still counted in full
--   in every total, cost and margin (the user, 2026-11-16: "Internal 只代表内部可见，客户 PDF 不显示，但照常计入总价 /
--   成本 / margin"). Set by `mkt_item_internal`. A quotation freezes it with each version sent, as the item's own columns
--   (`mkt_quote_with_extras`); "edited since" compares without it (`mkt_quote_plain`).
-- • The Product List's own settings (`mkt_product_list_prefs`, function-only): each catalogue's icon (`icons`) and the
--   built-in columns' internal / hidden (`columns`). Set by `mkt_list_prefs_save`; read in `mkt_quote_book` (`prefs`).
-- • Every item may be deleted (`mkt_item_delete`): taken out of every product's DRAFT and every DRAFT quotation (each
--   named on it: `mkt_quotes.removed`); versions published and quotations sent or accepted keep it.
-- • Every product may be deleted (`mkt_product_delete`): one never published as before; one published is SOFT-deleted
--   (`mkt_products.deleted_at`) — off the list, the pickers and the packages a quotation offers, taken out of draft
--   quotations; its versions stay for the projects and quotations sent on them.
-- • A version may END (`mkt_products.effective_to`, kept with each version in `mkt_product_versions.effective_to`; null =
--   never): `mkt_product_in_effect` reads no version past its end, and a later version never brings an older one back.
-- • A quotation is ARCHIVED (`mkt_quotes.archived_at`, `mkt_quote_archive`): hidden from the list, nothing else changes.
-- PGlite: tests/member-sql/validate-marketing-quotes.mjs.

-- ── Columns ──────────────────────────────────────────────────────────────────
ALTER TABLE public.mkt_items ADD COLUMN IF NOT EXISTS internal boolean NOT NULL DEFAULT false;
ALTER TABLE public.mkt_products ADD COLUMN IF NOT EXISTS effective_to date;
ALTER TABLE public.mkt_products ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.mkt_products ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.users(id);
ALTER TABLE public.mkt_product_versions ADD COLUMN IF NOT EXISTS effective_to date;
ALTER TABLE public.mkt_quotes ADD COLUMN IF NOT EXISTS archived_at timestamptz;
-- The items a deleted Product List item or product took out of a draft quotation: shown on the list ("Removed: …").
ALTER TABLE public.mkt_quotes ADD COLUMN IF NOT EXISTS removed text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.mkt_products DROP CONSTRAINT IF EXISTS mkt_products_effective_to_check;
ALTER TABLE public.mkt_products ADD CONSTRAINT mkt_products_effective_to_check
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from);
ALTER TABLE public.mkt_product_versions DROP CONSTRAINT IF EXISTS mkt_product_versions_effective_to_check;
ALTER TABLE public.mkt_product_versions ADD CONSTRAINT mkt_product_versions_effective_to_check
  CHECK (effective_to IS NULL OR effective_to >= effective_from);

-- ── The Product List's own settings ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mkt_product_list_prefs (
  key        text PRIMARY KEY CHECK (key IN ('icons', 'columns')),
  value      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(value) = 'object'),
  updated_by uuid REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mkt_product_list_prefs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_product_list_prefs FROM anon, authenticated;
SELECT public.audit_register('mkt_product_list_prefs', 'Marketing Product List settings', 'Marketing', '{}', 'none',
  p_reason => 'How the Product List looks — a catalogue''s icon, a built-in column internal or hidden; no price or item changes');

-- icons: { "<catalogue>": "<emoji>" } — at most 200, an icon of 1–16 characters.
-- columns: { "<desc|cost|margin|days|wf|remarks>": { "internal": bool, "hidden": bool } } — Item and Price are the client's always
-- and never hidden;
-- Cost and Margin are internal always (their "internal" is kept, never read).
CREATE OR REPLACE FUNCTION public.mkt_list_prefs_save(p_key text, p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_out jsonb := '{}'::jsonb;
  v_k   text;
  v_v   jsonb;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Product List is the manager''s.');
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;
  IF p_key = 'icons' THEN
    IF (SELECT count(*) FROM jsonb_object_keys(p_value)) > 200 THEN
      RAISE EXCEPTION 'Too many catalogues.' USING ERRCODE = '22023';
    END IF;
    FOR v_k, v_v IN SELECT * FROM jsonb_each(p_value) LOOP
      IF jsonb_typeof(v_v) IS DISTINCT FROM 'string' OR length(v_v #>> '{}') NOT BETWEEN 1 AND 16 OR length(v_k) NOT BETWEEN 1 AND 60 THEN
        RAISE EXCEPTION 'An icon is one emoji.' USING ERRCODE = '22023';
      END IF;
      v_out := v_out || jsonb_build_object(v_k, v_v);
    END LOOP;
  ELSIF p_key = 'columns' THEN
    FOR v_k, v_v IN SELECT * FROM jsonb_each(p_value) LOOP
      IF v_k NOT IN ('desc', 'cost', 'margin', 'days', 'wf', 'remarks') THEN
        RAISE EXCEPTION 'That column is always as it is.' USING ERRCODE = '22023';
      END IF;
      IF jsonb_typeof(v_v) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
      END IF;
      v_out := v_out || jsonb_build_object(v_k, jsonb_build_object(
        'internal', coalesce((v_v ->> 'internal')::boolean, false), 'hidden', coalesce((v_v ->> 'hidden')::boolean, false)));
    END LOOP;
  ELSE
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.mkt_product_list_prefs (key, value, updated_by, updated_at)
  VALUES (p_key, v_out, auth.uid(), now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;
  RETURN v_out;
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_list_prefs_save(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_list_prefs_save(text, jsonb) TO authenticated;

-- ── An item internal, or not ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_item_internal(p_id uuid, p_on boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Product List is the manager''s.');
  UPDATE public.mkt_items SET internal = coalesce(p_on, false), updated_by = auth.uid(), updated_at = now() WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That item is not there any more.' USING ERRCODE = 'P0002';
  END IF;
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_item_internal(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_item_internal(uuid, boolean) TO authenticated;

-- ── An item deleted, whoever uses it (production's body: the "used" refusal swapped for taking it out of drafts) ──
DROP FUNCTION IF EXISTS public.mkt_item_delete(uuid);
CREATE FUNCTION public.mkt_item_delete(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_i      public.mkt_items;
  v_key    text;
  v_np     integer := 0;
  v_drafts text[] := '{}';
  v_q      record;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Product List is the manager''s.');
  SELECT * INTO v_i FROM public.mkt_items WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('products', 0, 'drafts', '[]'::jsonb);  -- gone already
  END IF;
  v_key := lower(btrim(v_i.name));
  -- Every product's DRAFT: the item out of each category (a category left empty stays, to be filled or removed there).
  -- Versions published keep it.
  IF v_key <> '' THEN
    WITH hit AS (
      SELECT p.id FROM public.mkt_products p
       WHERE p.deleted_at IS NULL AND p.status <> 'retired'
         AND EXISTS (SELECT 1 FROM jsonb_array_elements(p.groups) g, jsonb_array_elements(g -> 'items') it
                      WHERE lower(btrim(it ->> 'name')) = v_key)
       FOR UPDATE
    ), done AS (
      UPDATE public.mkt_products p
         SET groups = (SELECT coalesce(jsonb_agg(jsonb_set(g, '{items}', coalesce((
                          SELECT jsonb_agg(it ORDER BY o) FROM jsonb_array_elements(g -> 'items') WITH ORDINALITY x(it, o)
                           WHERE lower(btrim(it ->> 'name')) <> v_key), '[]'::jsonb)) ORDER BY go), '[]'::jsonb)
                         FROM jsonb_array_elements(p.groups) WITH ORDINALITY y(g, go)),
             draft_rev = p.draft_rev + 1, updated_by = auth.uid(), updated_at = now()
        FROM hit WHERE p.id = hit.id
      RETURNING p.id
    )
    SELECT count(*) INTO v_np FROM done;
  END IF;
  -- Every DRAFT quotation: its line of this item out (a package's items are its published version's — kept).
  FOR v_q IN SELECT q.id, q.no FROM public.mkt_quotes q
              WHERE q.status = 'draft'
                AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.lines) l WHERE l ->> 'kind' = 'item' AND l ->> 'item' = p_id::text)
              ORDER BY q.no FOR UPDATE LOOP
    UPDATE public.mkt_quotes q
       SET lines = coalesce((SELECT jsonb_agg(l ORDER BY o) FROM jsonb_array_elements(q.lines) WITH ORDINALITY x(l, o)
                              WHERE NOT (l ->> 'kind' = 'item' AND l ->> 'item' = p_id::text)), '[]'::jsonb),
           removed = array_append(q.removed, v_i.name), rev = q.rev + 1, updated_by = auth.uid(), updated_at = now()
     WHERE q.id = v_q.id;
    v_drafts := array_append(v_drafts, v_q.no);
  END LOOP;
  DELETE FROM public.mkt_items WHERE id = p_id;
  RETURN jsonb_build_object('products', v_np, 'drafts', to_jsonb(v_drafts));
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_item_delete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_item_delete(uuid) TO authenticated;

-- ── A product deleted (production's body: one once on sale is soft-deleted, not refused) ──
CREATE OR REPLACE FUNCTION public.mkt_product_delete(p_id uuid, p_rev integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_p  public.mkt_products;
  v_by text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Product Builder is the manager''s.');
  SELECT * INTO v_p FROM public.mkt_products WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_p.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'That product is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  IF p_rev IS DISTINCT FROM v_p.draft_rev THEN
    v_by := coalesce((SELECT u.name FROM public.users u WHERE u.id = v_p.updated_by), 'Somebody');
    RAISE EXCEPTION '% changed this product since you opened it — reload to see it.', v_by USING ERRCODE = '40001';
  END IF;
  -- Its package lines out of every DRAFT quotation; quotations sent or accepted keep theirs.
  UPDATE public.mkt_quotes q
     SET lines = coalesce((SELECT jsonb_agg(l ORDER BY o) FROM jsonb_array_elements(q.lines) WITH ORDINALITY x(l, o)
                            WHERE NOT (l ->> 'kind' = 'package' AND l ->> 'product' = p_id::text)), '[]'::jsonb),
         removed = array_append(q.removed, coalesce(nullif(v_p.name, ''), v_p.code)), rev = q.rev + 1,
         updated_by = auth.uid(), updated_at = now()
   WHERE q.status = 'draft'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.lines) l WHERE l ->> 'kind' = 'package' AND l ->> 'product' = p_id::text);
  IF v_p.version > 0 THEN
    -- Once on sale: its versions stay for the projects and quotations sent on them; it is off every list and picker.
    UPDATE public.mkt_products SET deleted_at = now(), deleted_by = auth.uid(), updated_by = auth.uid(), updated_at = now()
     WHERE id = p_id;
  ELSE
    DELETE FROM public.mkt_products WHERE id = p_id;
  END IF;
END
$function$;

-- ── The version on sale today (production's body: none deleted, none past its end, no older one brought back) ──
CREATE OR REPLACE FUNCTION public.mkt_product_in_effect(p_product uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_ver   integer;
  v_to    date;
BEGIN
  SELECT v.version, v.effective_to INTO v_ver, v_to FROM public.mkt_product_versions v
    JOIN public.mkt_products p ON p.id = v.product_id
   WHERE v.product_id = p_product AND p.status = 'active' AND p.deleted_at IS NULL
     AND v.effective_from <= v_today
   ORDER BY v.version DESC LIMIT 1;
  IF v_to IS NOT NULL AND v_to < v_today THEN
    RETURN NULL;
  END IF;
  RETURN v_ver;
END
$function$;

-- ── The draft saved (production's body, one key added: effectiveTo) ──
CREATE OR REPLACE FUNCTION public.mkt_product_save(p_id uuid, p_rev integer, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_p      public.mkt_products;
  v_patch  jsonb := coalesce(p_patch, '{}'::jsonb);
  v_uuid   text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_yy     text := to_char((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date, 'YY');
  v_code   text;
  v_name   text;
  v_desc   text;
  v_kind   text;
  v_groups jsonb;
  v_intake uuid;
  v_price  numeric;
  v_cost   numeric;
  v_eff    date;
  v_to     date;
  v_by     text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Product Builder is the manager''s.');
  IF jsonb_typeof(v_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_p FROM public.mkt_products WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR v_p.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'That product is not there any more.' USING ERRCODE = 'P0002';
    END IF;
    IF v_p.status = 'retired' THEN
      RAISE EXCEPTION 'A retired product is read-only — reactivate it first.' USING ERRCODE = '22023';
    END IF;
    IF p_rev IS DISTINCT FROM v_p.draft_rev THEN
      v_by := coalesce((SELECT u.name FROM public.users u WHERE u.id = v_p.updated_by), 'Somebody');
      RAISE EXCEPTION '% changed this product since you opened it — reload to see it.', v_by USING ERRCODE = '40001';
    END IF;
  END IF;

  v_name := CASE WHEN v_patch ? 'name' THEN btrim(coalesce(v_patch ->> 'name', '')) ELSE coalesce(v_p.name, '') END;
  IF length(v_name) > 80 THEN
    RAISE EXCEPTION 'A name of at most 80 characters.' USING ERRCODE = '22023';
  END IF;
  v_desc := CASE WHEN v_patch ? 'description' THEN btrim(coalesce(v_patch ->> 'description', '')) ELSE coalesce(v_p.description, '') END;
  IF length(v_desc) > 600 THEN
    RAISE EXCEPTION 'A description of at most 600 characters.' USING ERRCODE = '22023';
  END IF;
  v_kind := CASE WHEN v_patch ? 'kind' THEN v_patch ->> 'kind' ELSE coalesce(v_p.kind, 'one') END;
  IF v_kind IS NULL OR v_kind NOT IN ('one', 'recurring') THEN
    RAISE EXCEPTION 'One-time or recurring monthly.' USING ERRCODE = '22023';
  END IF;
  v_groups := CASE WHEN v_patch ? 'groups' THEN public.mkt_product_groups(coalesce(v_patch -> 'groups', '[]'::jsonb), false)
                   ELSE coalesce(v_p.groups, '[]'::jsonb) END;
  IF v_patch ? 'intake' THEN
    IF coalesce(v_patch ->> 'intake', '') = '' THEN
      v_intake := NULL;
    ELSIF (v_patch ->> 'intake') !~ v_uuid OR NOT EXISTS (SELECT 1 FROM public.mkt_minutes_templates t WHERE t.id = (v_patch ->> 'intake')::uuid) THEN
      RAISE EXCEPTION 'That minutes template is not there.' USING ERRCODE = '22023';
    ELSE
      v_intake := (v_patch ->> 'intake')::uuid;
    END IF;
  ELSE
    v_intake := v_p.intake_id;
  END IF;
  IF v_patch ? 'price' THEN
    IF coalesce(jsonb_typeof(v_patch -> 'price'), 'null') = 'null' THEN
      v_price := NULL;
    ELSIF jsonb_typeof(v_patch -> 'price') <> 'number' OR (v_patch ->> 'price')::numeric < 0
          OR (v_patch ->> 'price')::numeric >= 10000000000000 OR (v_patch ->> 'price')::numeric <> round((v_patch ->> 'price')::numeric, 2) THEN
      RAISE EXCEPTION 'A price in ringgit and sen.' USING ERRCODE = '22023';
    ELSE
      v_price := (v_patch ->> 'price')::numeric;
    END IF;
  ELSE
    v_price := v_p.price;
  END IF;
  IF v_patch ? 'cost' THEN
    IF coalesce(jsonb_typeof(v_patch -> 'cost'), 'null') = 'null' THEN
      v_cost := NULL;
    ELSIF jsonb_typeof(v_patch -> 'cost') <> 'number' OR (v_patch ->> 'cost')::numeric < 0
          OR (v_patch ->> 'cost')::numeric >= 10000000000000 OR (v_patch ->> 'cost')::numeric <> round((v_patch ->> 'cost')::numeric, 2) THEN
      RAISE EXCEPTION 'A cost in ringgit and sen.' USING ERRCODE = '22023';
    ELSE
      v_cost := (v_patch ->> 'cost')::numeric;
    END IF;
  ELSE
    v_cost := v_p.cost;
  END IF;
  IF v_patch ? 'effectiveFrom' THEN
    IF coalesce(v_patch ->> 'effectiveFrom', '') = '' THEN
      v_eff := NULL;
    ELSIF (v_patch ->> 'effectiveFrom') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'A day for it to take effect.' USING ERRCODE = '22023';
    ELSE
      v_eff := (v_patch ->> 'effectiveFrom')::date;
    END IF;
  ELSE
    v_eff := v_p.effective_from;
  END IF;
  -- Until: never (null) or a day, on or after the day it takes effect (v2, 2026-11-16).
  IF v_patch ? 'effectiveTo' THEN
    IF coalesce(v_patch ->> 'effectiveTo', '') = '' THEN
      v_to := NULL;
    ELSIF (v_patch ->> 'effectiveTo') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'A day for it to end.' USING ERRCODE = '22023';
    ELSE
      v_to := (v_patch ->> 'effectiveTo')::date;
    END IF;
  ELSE
    v_to := v_p.effective_to;
  END IF;
  IF v_to IS NOT NULL AND v_eff IS NOT NULL AND v_to < v_eff THEN
    RAISE EXCEPTION 'It ends before it takes effect — pick a later end day.' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('mkt_product_code'));
    v_code := 'PRD-' || v_yy || lpad((coalesce((SELECT max(substr(p.code, 7)::integer) FROM public.mkt_products p
                                                 WHERE p.code ~ ('^PRD-' || v_yy || '[0-9]{3,4}$')), 0) + 1)::text, 3, '0');
    INSERT INTO public.mkt_products (code, name, description, kind, groups, intake_id, price, cost, effective_from, effective_to, created_by, updated_by)
    VALUES (v_code, v_name, v_desc, v_kind, v_groups, v_intake, v_price, v_cost, v_eff, v_to, auth.uid(), auth.uid())
    RETURNING * INTO v_p;
  ELSE
    UPDATE public.mkt_products
       SET name = v_name, description = v_desc, kind = v_kind, groups = v_groups, intake_id = v_intake, price = v_price,
           cost = v_cost, effective_from = v_eff, effective_to = v_to, draft_rev = draft_rev + 1, updated_by = auth.uid(), updated_at = now()
     WHERE id = p_id
    RETURNING * INTO v_p;
  END IF;
  PERFORM public.mkt_top_up_due();
  RETURN jsonb_build_object('id', v_p.id, 'code', v_p.code, 'rev', v_p.draft_rev);
END
$function$;

-- ── Published (production's body: the end day kept with the version; a deleted product refused) ──
CREATE OR REPLACE FUNCTION public.mkt_product_publish(p_id uuid, p_rev integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_p      public.mkt_products;
  v_groups jsonb;
  v_iver   integer;
  v_by     text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Product Builder is the manager''s.');
  SELECT * INTO v_p FROM public.mkt_products WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_p.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'That product is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  IF v_p.status = 'retired' THEN
    RAISE EXCEPTION 'A retired product is read-only — reactivate it first.' USING ERRCODE = '22023';
  END IF;
  IF p_rev IS DISTINCT FROM v_p.draft_rev THEN
    v_by := coalesce((SELECT u.name FROM public.users u WHERE u.id = v_p.updated_by), 'Somebody');
    RAISE EXCEPTION '% changed this product since you opened it — reload to see it.', v_by USING ERRCODE = '40001';
  END IF;
  IF v_p.published_rev = v_p.draft_rev THEN
    RAISE EXCEPTION 'Nothing has changed since v%.', v_p.version USING ERRCODE = '22023';
  END IF;
  IF v_p.name = '' THEN
    RAISE EXCEPTION 'Name the product.' USING ERRCODE = '22023';
  END IF;
  v_groups := public.mkt_product_groups(v_p.groups, true);
  IF v_p.intake_id IS NULL THEN
    RAISE EXCEPTION 'Pick its intake minutes template.' USING ERRCODE = '22023';
  END IF;
  SELECT nullif(t.version, 0) INTO v_iver FROM public.mkt_minutes_templates t WHERE t.id = v_p.intake_id;
  IF v_iver IS NULL THEN
    RAISE EXCEPTION 'Its intake minutes template is not published yet.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(v_p.price, 0) <= 0 THEN
    RAISE EXCEPTION 'Set its list price.' USING ERRCODE = '22023';
  END IF;
  IF v_p.effective_from IS NULL THEN
    RAISE EXCEPTION 'Pick the day it takes effect.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.mkt_product_versions (product_id, version, name, description, kind, groups, intake_id, intake_version, price, cost,
                                          effective_from, effective_to, note, published_by)
  VALUES (v_p.id, v_p.version + 1, v_p.name, v_p.description, v_p.kind, v_groups, v_p.intake_id, v_iver, v_p.price, v_p.cost,
          v_p.effective_from, v_p.effective_to, public.mkt_product_included(v_groups) || CASE WHEN v_p.kind = 'recurring' THEN ' / month' ELSE '' END, auth.uid());
  UPDATE public.mkt_products
     SET version = v_p.version + 1, published_rev = v_p.draft_rev, status = 'active', updated_by = auth.uid(), updated_at = now()
   WHERE id = v_p.id;
  PERFORM public.mkt_top_up_due();
  RETURN jsonb_build_object('id', v_p.id, 'version', v_p.version + 1, 'rev', v_p.draft_rev, 'effectiveFrom', v_p.effective_from,
    'live', (SELECT count(*) FROM public.mkt_projects x WHERE x.product_id = v_p.id AND x.status NOT IN ('done', 'cancelled')));
END
$function$;

-- ── The builder's reader (production's body: none deleted; the end day; the last version published, for the diff) ──
CREATE OR REPLACE FUNCTION public.mkt_products()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Product Builder is the manager''s.');
  RETURN jsonb_build_object(
    'products', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.id, 'code', p.code, 'name', p.name, 'description', p.description, 'kind', p.kind, 'groups', p.groups,
               'intake', p.intake_id, 'price', p.price, 'cost', p.cost, 'account', p.revenue_account, 'effectiveFrom', p.effective_from,
               'effectiveTo', p.effective_to,
               'status', p.status, 'retiredOn', p.retired_on, 'rev', p.draft_rev, 'version', p.version,
               'changed', p.published_rev IS DISTINCT FROM p.draft_rev,
               'live', (SELECT count(*) FROM public.mkt_projects x WHERE x.product_id = p.id AND x.status NOT IN ('done', 'cancelled')),
               'last', (SELECT jsonb_build_object('version', v.version, 'groups', v.groups, 'price', v.price, 'cost', v.cost)
                          FROM public.mkt_product_versions v WHERE v.product_id = p.id AND v.version = p.version),
               'history', coalesce((SELECT jsonb_agg(jsonb_build_object('version', v.version, 'at', v.published_at, 'note', v.note,
                                                                         'by', (SELECT u.name FROM public.users u WHERE u.id = v.published_by))
                                                      ORDER BY v.version DESC)
                                      FROM public.mkt_product_versions v WHERE v.product_id = p.id), '[]'::jsonb),
               'updatedAt', p.updated_at, 'updatedBy', (SELECT u.name FROM public.users u WHERE u.id = p.updated_by))
             ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, p.created_at, p.id)
        FROM public.mkt_products p WHERE p.deleted_at IS NULL), '[]'::jsonb),
    -- The revenue accounts a product's billing may post to (2026-10-26 — Finance's chart; mkt_revenue_list).
    'accounts', public.mkt_revenue_list(),
    -- The pickers: every workflow template and minutes template, published or not (a draft is linked, then published).
    'workflows', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', w.id, 'action', w.action, 'tname', w.tname, 'version', w.version,
               'stages', jsonb_array_length(coalesce(v.stages, w.draft)),
               'days', (SELECT coalesce(sum((s ->> 'sla')::integer), 0) FROM jsonb_array_elements(coalesce(v.stages, w.draft)) s),
               'pic', (SELECT count(*) FROM jsonb_array_elements(coalesce(v.stages, w.draft)) s, jsonb_array_elements(s -> 'appr') a
                        WHERE a ->> 'kind' = 'pic' OR coalesce(a -> 'ids', '[]'::jsonb) ? 'pic'))
             ORDER BY lower(w.action), w.created_at)
        FROM public.mkt_workflows w
        LEFT JOIN public.mkt_workflow_versions v ON v.workflow_id = w.id AND v.version = w.version), '[]'::jsonb),
    'minutes', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'version', t.version,
               'fields', jsonb_array_length(t.fields)) ORDER BY t.created_at)
        FROM public.mkt_minutes_templates t), '[]'::jsonb));
END
$function$;

-- ── A quotation as the page reads it (production's body: archived, and what a deletion took out) ──
CREATE OR REPLACE FUNCTION public.mkt_quote_json(p_q mkt_quotes)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', p_q.id, 'no', p_q.no, 'sub', p_q.subsidiary_id, 'other', p_q.other, 'client', p_q.client_name, 'contact', p_q.contact,
    'date', p_q.quote_date, 'valid', p_q.valid_days, 'discount', p_q.discount, 'note', p_q.note, 'lines', p_q.lines,
    'status', p_q.status, 'acceptedOn', p_q.accepted_on, 'tasks', p_q.tasks, 'assignedOn', p_q.assigned_on, 'rev', p_q.rev,
    'createdAt', p_q.created_at, 'archivedAt', p_q.archived_at, 'removed', to_jsonb(p_q.removed),
    'history', coalesce((SELECT jsonb_agg(jsonb_build_object('seq', v.seq, 'kind', v.kind, 'rev', v.rev, 'at', v.at, 'snap', v.snap,
                                                             'total', v.total) ORDER BY v.seq)
                           FROM public.mkt_quote_versions v WHERE v.quote_id = p_q.id), '[]'::jsonb))
$function$;

-- ── The book (production's body: an item's internal; no deleted or ended package; the Product List's settings) ──
CREATE OR REPLACE FUNCTION public.mkt_quote_book()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Product Builder is the manager''s.');
  RETURN jsonb_build_object(
    'today', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date,
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'cat', i.catalogue, 'name', i.name, 'desc', i.description,
                                          'price', i.price, 'cost', i.cost, 'days', i.est_days, 'remarks', i.remarks, 'wf', i.workflow_id, 'extra', i.extra,
                                          'internal', i.internal)
                                        ORDER BY i.created_at, i.id)
                         FROM public.mkt_items i), '[]'::jsonb),
    -- What a quotation may pick as a package: a product on sale, as its last version was published.
    'packages', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'code', p.code, 'name', v.name, 'kind', v.kind,
                                             'version', v.version, 'price', v.price, 'cost', v.cost, 'groups', v.groups)
                                           ORDER BY p.created_at, p.id)
                            FROM public.mkt_products p
                            JOIN public.mkt_product_versions v ON v.product_id = p.id AND v.version = p.version
                           WHERE p.status = 'active' AND p.deleted_at IS NULL
                             AND (v.effective_to IS NULL OR v.effective_to >= (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)), '[]'::jsonb),
    'quotes', coalesce((SELECT jsonb_agg(public.mkt_quote_json(q) ORDER BY q.created_at DESC, q.id) FROM public.mkt_quotes q), '[]'::jsonb),
    'clients', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name, 'dot', s.dot,
                                            'group', s.company_id IS NOT NULL, 'ar', public.mkt_quote_ar(s.id, false))
                                          ORDER BY s.sort_order, s.name)
                           FROM public.mkt_subsidiaries s WHERE s.active), '[]'::jsonb),
    'columns', coalesce((SELECT jsonb_agg(public.mkt_item_column_json(c) ORDER BY c.sort_order, c.created_at) FROM public.mkt_item_columns c), '[]'::jsonb),
    'prefs', coalesce((SELECT jsonb_object_agg(x.key, x.value) FROM public.mkt_product_list_prefs x), '{}'::jsonb),
    'arOther', public.mkt_quote_ar(NULL, true),
    'people', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.staff_id, 'name', coalesce(nullif(r.first_name, ''), r.full_name),
                                           'full', r.full_name, 'title', r.title) ORDER BY coalesce(nullif(r.first_name, ''), r.full_name), r.staff_id)
                          FROM public.mkt_roster() r), '[]'::jsonb));
END
$function$;

-- ── A version sent freezes each item's internal with its columns (production's body + `internal`) ──
CREATE OR REPLACE FUNCTION public.mkt_quote_with_extras(p_lines jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(CASE
           WHEN l ->> 'kind' = 'item' THEN l || jsonb_build_object('extra',
             public.mkt_item_extras((SELECT i.extra FROM public.mkt_items i WHERE i.id::text = l ->> 'item')),
             'internal', coalesce((SELECT i.internal FROM public.mkt_items i WHERE i.id::text = l ->> 'item'), false))
           ELSE jsonb_set(l, '{items}', coalesce((SELECT jsonb_agg(it || jsonb_build_object('extra',
             public.mkt_item_extras((SELECT i.extra FROM public.mkt_items i WHERE lower(i.name) = lower(btrim(it ->> 'name')) AND i.name <> '')),
             'internal', coalesce((SELECT i.internal FROM public.mkt_items i WHERE lower(i.name) = lower(btrim(it ->> 'name')) AND i.name <> ''), false))
             ORDER BY o) FROM jsonb_array_elements(l -> 'items') WITH ORDINALITY x(it, o)), '[]'::jsonb))
         END ORDER BY lo), '[]'::jsonb)
    FROM jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) WITH ORDINALITY y(l, lo)
$function$;

-- ── "Edited since" compares without the Product List's own (production's body: `internal` dropped with `extra`) ──
CREATE OR REPLACE FUNCTION public.mkt_quote_plain(p_core jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_set(p_core, '{lines}', coalesce((SELECT jsonb_agg(CASE
           WHEN l ->> 'kind' = 'item' THEN l - 'extra' - 'internal'
           ELSE jsonb_set(l, '{items}', coalesce((SELECT jsonb_agg(it - 'extra' - 'internal' ORDER BY o)
                                                  FROM jsonb_array_elements(l -> 'items') WITH ORDINALITY x(it, o)), '[]'::jsonb))
         END ORDER BY lo) FROM jsonb_array_elements(coalesce(p_core -> 'lines', '[]'::jsonb)) WITH ORDINALITY y(l, lo)), '[]'::jsonb))
$function$;

-- ── A quotation archived, or back (any status; nothing else changes — the client's copy, its tasks) ──
CREATE OR REPLACE FUNCTION public.mkt_quote_archive(p_id uuid, p_on boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_q public.mkt_quotes;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Quotations are the manager''s.');
  UPDATE public.mkt_quotes
     SET archived_at = CASE WHEN coalesce(p_on, false) THEN coalesce(archived_at, now()) END
   WHERE id = p_id
  RETURNING * INTO v_q;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That quotation is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  RETURN public.mkt_quote_json(v_q);
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_quote_archive(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_quote_archive(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
