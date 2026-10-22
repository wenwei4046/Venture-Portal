-- ============================================================================
-- 20261023235900_marketing_products.sql
-- Marketing's Product Builder — ③ of the Claude Design handoff "HOUZS Marketing Module Setup" (2026-10-23; the
-- user: "全部照设计做", in order): the products and packages Marketing sells to the subsidiaries — what each includes
-- (actions in categories, a quantity and a unit price each, each linked to a workflow template), the minutes template
-- its first meeting fills in (its intake), its list price and internal cost (the margin), the day a version takes
-- effect — edited as a draft and published as numbered versions; a product retired is picked for no new project while
-- those running keep their version. Prices and costs are the manager's alone (Marketing · Manage): the staff and the
-- PIC never see them. A product project (②b) starts from a published version.
-- ============================================================================
--
-- A product's draft (`Product Builder.dc.html`): name, description, kind (one: a project that closes when delivered;
-- recurring: a new task every month for the same team), groups ([{ name (the category), items: [{ name (the action),
-- qty (0–999, per month when recurring), price (the unit price, RM), workflow (a mkt_workflows id) }] }]), intake (a
-- mkt_minutes_templates id), price and cost (RM, decimal(15,2)), effective_from (the day new projects take the next
-- version). The code is made when the product is: PRD-<YY><NNN>, never typed.
-- Publishing asks what the handoff's five sections do — named; something included; the intake and a workflow for every
-- action, each of them published; a price; the day it takes effect — and keeps the version whole: the workflow and
-- minutes versions it starts projects on, the price, the cost and what it included, in words.
-- Tables (RLS on, NO policy, no client grants — the functions below, as the rest of Marketing's):
--   mkt_products          a product: its code, status (draft · active · retired), its draft, its last version.
--   mkt_product_versions  each version published, whole and never changed — who, when, what it included.
-- Functions (SECURITY DEFINER, plpgsql; PUBLIC and anon revoked, `authenticated` granted), Marketing · Manage:
--   mkt_products()                    the products, their drafts and versions, and the published workflows and minutes
--                                     templates their pickers offer
--   mkt_product_save(id, rev, patch)  a product made (id null — its code made too), or what changed of its draft saved,
--                                     never over somebody else's save (rev); a retired product is read-only
--   mkt_product_publish(id, rev)      the draft, checked whole, published as the next version (active)
--   mkt_product_status(id, to)        retire (no new projects) or reactivate
-- The page `/marketing/products` joins the database's copy of the tab registry under the manager's tools' tab.
-- PGlite: tests/member-sql/validate-marketing-products.mjs.

CREATE TABLE IF NOT EXISTS public.mkt_products (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text NOT NULL UNIQUE CHECK (code ~ '^PRD-[0-9]{5,6}$'),
  name           text NOT NULL DEFAULT '' CHECK (name = btrim(name) AND length(name) <= 80),
  description    text NOT NULL DEFAULT '' CHECK (length(description) <= 600),
  kind           text NOT NULL DEFAULT 'one' CHECK (kind IN ('one', 'recurring')),
  groups         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(groups) = 'array'),
  intake_id      uuid REFERENCES public.mkt_minutes_templates(id),
  price          numeric(15,2) CHECK (price >= 0),
  cost           numeric(15,2) CHECK (cost >= 0),
  effective_from date,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'retired')),
  retired_on     date,
  draft_rev      integer NOT NULL DEFAULT 1 CHECK (draft_rev >= 1),
  version        integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  published_rev  integer CHECK (published_rev >= 1),
  created_by     uuid REFERENCES public.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid REFERENCES public.users(id),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((version = 0) = (published_rev IS NULL)),
  CHECK ((status = 'draft') = (version = 0)),
  CHECK ((status = 'retired') = (retired_on IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.mkt_product_versions (
  product_id      uuid NOT NULL REFERENCES public.mkt_products(id),
  version         integer NOT NULL CHECK (version >= 1),
  name            text NOT NULL,
  description     text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('one', 'recurring')),
  groups          jsonb NOT NULL CHECK (jsonb_typeof(groups) = 'array'),
  intake_id       uuid NOT NULL,
  intake_version  integer NOT NULL,
  price           numeric(15,2) NOT NULL CHECK (price > 0),
  cost            numeric(15,2) CHECK (cost >= 0),
  effective_from  date NOT NULL,
  note            text NOT NULL,
  published_by    uuid REFERENCES public.users(id),
  published_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, version),
  FOREIGN KEY (intake_id, intake_version) REFERENCES public.mkt_minutes_versions (template_id, version)
);

-- A project started from a product names a version that was published (empty on 2026-10-23: no project has one).
ALTER TABLE public.mkt_projects DROP CONSTRAINT IF EXISTS mkt_projects_product_version_fkey;
ALTER TABLE public.mkt_projects ADD CONSTRAINT mkt_projects_product_version_fkey
  FOREIGN KEY (product_id, product_version) REFERENCES public.mkt_product_versions (product_id, version);
CREATE INDEX IF NOT EXISTS mkt_projects_product ON public.mkt_projects (product_id) WHERE product_id IS NOT NULL;

ALTER TABLE public.mkt_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_product_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_products, public.mkt_product_versions FROM anon, authenticated;

SELECT public.audit_register('mkt_products', 'Marketing products', 'Marketing', '{}', 'none',
  p_reason => 'A draft is saved as it is typed; each version published is kept whole, with who and when, in mkt_product_versions');
SELECT public.audit_register('mkt_product_versions', 'Marketing product versions', 'Marketing', '{}', 'none',
  p_reason => 'Each version published, written once and never changed — a record already');

-- ── A product's groups, checked (nobody's to call but the functions below) ─
-- As a draft: shapes and limits, half-typed names included; a workflow named must be a template. As published: every
-- category and action named, something included, every action linked to a workflow that is published — and each
-- action carries the workflow version it starts on. Answers the groups written clean.
CREATE OR REPLACE FUNCTION public.mkt_product_groups(p_groups jsonb, p_publish boolean)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uuid  text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_out   jsonb := '[]'::jsonb;
  v_g     jsonb;
  v_it    jsonb;
  v_items jsonb;
  v_name  text;
  v_qty   integer;
  v_price numeric;
  v_wf    uuid;
  v_ver   integer;
  v_any   boolean := false;
BEGIN
  IF jsonb_typeof(p_groups) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Not a list of categories.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_groups) > 12 THEN
    RAISE EXCEPTION 'A product has at most 12 categories.' USING ERRCODE = '22023';
  END IF;
  FOR v_g IN SELECT x FROM jsonb_array_elements(p_groups) x LOOP
    IF jsonb_typeof(v_g) IS DISTINCT FROM 'object' OR jsonb_typeof(coalesce(v_g -> 'items', '[]'::jsonb)) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Not a category.' USING ERRCODE = '22023';
    END IF;
    v_name := btrim(coalesce(v_g ->> 'name', ''));
    IF length(v_name) > 60 OR (p_publish AND v_name = '') THEN
      RAISE EXCEPTION 'Name each category (at most 60 characters).' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(coalesce(v_g -> 'items', '[]'::jsonb)) > 30 THEN
      RAISE EXCEPTION '"%": at most 30 actions.', v_name USING ERRCODE = '22023';
    END IF;
    v_items := '[]'::jsonb;
    FOR v_it IN SELECT x FROM jsonb_array_elements(coalesce(v_g -> 'items', '[]'::jsonb)) x LOOP
      IF jsonb_typeof(v_it) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Not an action.' USING ERRCODE = '22023';
      END IF;
      v_qty := CASE WHEN coalesce(v_it ->> 'qty', '') ~ '^[0-9]{1,3}$' THEN (v_it ->> 'qty')::integer END;
      IF v_qty IS NULL THEN
        RAISE EXCEPTION 'A quantity of 0 to 999.' USING ERRCODE = '22023';
      END IF;
      v_price := CASE WHEN jsonb_typeof(v_it -> 'price') = 'number' THEN (v_it ->> 'price')::numeric
                      WHEN coalesce(jsonb_typeof(v_it -> 'price'), 'null') = 'null' THEN NULL END;
      IF (jsonb_typeof(v_it -> 'price') IS NOT NULL AND jsonb_typeof(v_it -> 'price') <> 'null' AND v_price IS NULL)
         OR v_price < 0 OR v_price >= 10000000000000 OR v_price <> round(v_price, 2) THEN
        RAISE EXCEPTION 'A unit price in ringgit and sen.' USING ERRCODE = '22023';
      END IF;
      v_name := btrim(coalesce(v_it ->> 'name', ''));
      IF length(v_name) > 60 OR (p_publish AND v_name = '') THEN
        RAISE EXCEPTION 'Name each action (at most 60 characters).' USING ERRCODE = '22023';
      END IF;
      v_wf := NULL;
      v_ver := NULL;
      IF coalesce(v_it ->> 'workflow', '') <> '' THEN
        IF (v_it ->> 'workflow') !~ v_uuid THEN
          RAISE EXCEPTION '"%": that workflow is not there.', v_name USING ERRCODE = '22023';
        END IF;
        SELECT w.id, nullif(w.version, 0) INTO v_wf, v_ver FROM public.mkt_workflows w WHERE w.id = (v_it ->> 'workflow')::uuid;
        IF v_wf IS NULL THEN
          RAISE EXCEPTION '"%": that workflow is not there.', v_name USING ERRCODE = '22023';
        END IF;
      END IF;
      IF p_publish AND v_wf IS NULL THEN
        RAISE EXCEPTION '"%": link a workflow.', v_name USING ERRCODE = '22023';
      END IF;
      IF p_publish AND v_ver IS NULL THEN
        RAISE EXCEPTION '"%": its workflow is not published yet.', v_name USING ERRCODE = '22023';
      END IF;
      IF v_qty > 0 AND v_name <> '' THEN
        v_any := true;
      END IF;
      v_items := v_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'name', v_name, 'qty', v_qty, 'price', v_price, 'workflow', v_wf,
        'workflowVersion', CASE WHEN p_publish THEN v_ver END)));
    END LOOP;
    v_out := v_out || jsonb_build_array(jsonb_build_object('name', btrim(coalesce(v_g ->> 'name', '')), 'items', v_items));
  END LOOP;
  IF p_publish AND NOT v_any THEN
    RAISE EXCEPTION 'Add what the product includes.' USING ERRCODE = '22023';
  END IF;
  RETURN v_out;
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_product_groups(jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_product_groups(jsonb, boolean) TO service_role;

-- What a product includes, in words: "4 image posts + 2 videos (reels)".
CREATE OR REPLACE FUNCTION public.mkt_product_included(p_groups jsonb)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
BEGIN
  RETURN coalesce((SELECT string_agg((it ->> 'qty') || ' ' || lower(it ->> 'name'), ' + ' ORDER BY g.o, i.o)
                     FROM jsonb_array_elements(p_groups) WITH ORDINALITY g(v, o),
                          jsonb_array_elements(g.v -> 'items') WITH ORDINALITY i(it, o)
                    WHERE (it ->> 'qty')::integer > 0 AND btrim(coalesce(it ->> 'name', '')) <> ''), 'Nothing added yet');
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_product_included(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_product_included(jsonb) TO service_role;

-- ── The builder's reader ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_products()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Product Builder is the manager''s.');
  RETURN jsonb_build_object(
    'products', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.id, 'code', p.code, 'name', p.name, 'description', p.description, 'kind', p.kind, 'groups', p.groups,
               'intake', p.intake_id, 'price', p.price, 'cost', p.cost, 'effectiveFrom', p.effective_from,
               'status', p.status, 'retiredOn', p.retired_on, 'rev', p.draft_rev, 'version', p.version,
               'changed', p.published_rev IS DISTINCT FROM p.draft_rev,
               'live', (SELECT count(*) FROM public.mkt_projects x WHERE x.product_id = p.id AND x.status NOT IN ('done', 'cancelled')),
               'history', coalesce((SELECT jsonb_agg(jsonb_build_object('version', v.version, 'at', v.published_at, 'note', v.note,
                                                                         'by', (SELECT u.name FROM public.users u WHERE u.id = v.published_by))
                                                      ORDER BY v.version DESC)
                                      FROM public.mkt_product_versions v WHERE v.product_id = p.id), '[]'::jsonb),
               'updatedAt', p.updated_at, 'updatedBy', (SELECT u.name FROM public.users u WHERE u.id = p.updated_by))
             ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, p.created_at, p.id)
        FROM public.mkt_products p), '[]'::jsonb),
    -- The pickers: every workflow template and minutes template, published or not (a draft is linked, then published).
    'workflows', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', w.id, 'action', w.action, 'tname', w.tname, 'version', w.version,
               'stages', jsonb_array_length(coalesce(v.stages, w.draft)),
               'days', (SELECT coalesce(sum((s ->> 'sla')::integer), 0) FROM jsonb_array_elements(coalesce(v.stages, w.draft)) s),
               'pic', (SELECT count(*) FROM jsonb_array_elements(coalesce(v.stages, w.draft)) s, jsonb_array_elements(s -> 'appr') a
                        WHERE a ->> 'kind' = 'pic'))
             ORDER BY lower(w.action), w.created_at)
        FROM public.mkt_workflows w
        LEFT JOIN public.mkt_workflow_versions v ON v.workflow_id = w.id AND v.version = w.version), '[]'::jsonb),
    'minutes', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'version', t.version,
               'fields', jsonb_array_length(t.fields)) ORDER BY t.created_at)
        FROM public.mkt_minutes_templates t), '[]'::jsonb));
END
$fn$;

-- ── Saved as it is typed ────────────────────────────────────────────────────
-- p_id null: a new product (its code made: PRD-<YY><NNN>); otherwise only the parts given change: name, description,
-- kind, groups, intake, price, cost, effectiveFrom (null clears what may be cleared). p_rev: the draft the caller last
-- saw. A retired product is read-only.
CREATE OR REPLACE FUNCTION public.mkt_product_save(p_id uuid, p_rev integer, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
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
  v_by     text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Product Builder is the manager''s.');
  IF jsonb_typeof(v_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_p FROM public.mkt_products WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
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

  IF p_id IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('mkt_product_code'));
    v_code := 'PRD-' || v_yy || lpad((coalesce((SELECT max(substr(p.code, 7)::integer) FROM public.mkt_products p
                                                 WHERE p.code ~ ('^PRD-' || v_yy || '[0-9]{3,4}$')), 0) + 1)::text, 3, '0');
    INSERT INTO public.mkt_products (code, name, description, kind, groups, intake_id, price, cost, effective_from, created_by, updated_by)
    VALUES (v_code, v_name, v_desc, v_kind, v_groups, v_intake, v_price, v_cost, v_eff, auth.uid(), auth.uid())
    RETURNING * INTO v_p;
  ELSE
    UPDATE public.mkt_products
       SET name = v_name, description = v_desc, kind = v_kind, groups = v_groups, intake_id = v_intake, price = v_price,
           cost = v_cost, effective_from = v_eff, draft_rev = draft_rev + 1, updated_by = auth.uid(), updated_at = now()
     WHERE id = p_id
    RETURNING * INTO v_p;
  END IF;
  PERFORM public.mkt_top_up_due();
  RETURN jsonb_build_object('id', v_p.id, 'code', v_p.code, 'rev', v_p.draft_rev);
END
$fn$;

-- ── Published: the draft as the caller saw it, checked whole, is the next version ──
CREATE OR REPLACE FUNCTION public.mkt_product_publish(p_id uuid, p_rev integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p      public.mkt_products;
  v_groups jsonb;
  v_iver   integer;
  v_by     text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Product Builder is the manager''s.');
  SELECT * INTO v_p FROM public.mkt_products WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
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
                                          effective_from, note, published_by)
  VALUES (v_p.id, v_p.version + 1, v_p.name, v_p.description, v_p.kind, v_groups, v_p.intake_id, v_iver, v_p.price, v_p.cost,
          v_p.effective_from, public.mkt_product_included(v_groups) || CASE WHEN v_p.kind = 'recurring' THEN ' / month' ELSE '' END, auth.uid());
  UPDATE public.mkt_products
     SET version = v_p.version + 1, published_rev = v_p.draft_rev, status = 'active', updated_by = auth.uid(), updated_at = now()
   WHERE id = v_p.id;
  PERFORM public.mkt_top_up_due();
  RETURN jsonb_build_object('id', v_p.id, 'version', v_p.version + 1, 'rev', v_p.draft_rev, 'effectiveFrom', v_p.effective_from,
    'live', (SELECT count(*) FROM public.mkt_projects x WHERE x.product_id = v_p.id AND x.status NOT IN ('done', 'cancelled')));
END
$fn$;

-- ── Retired (picked for no new project; those running keep their version) or reactivated ──
CREATE OR REPLACE FUNCTION public.mkt_product_status(p_id uuid, p_to text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p public.mkt_products;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Product Builder is the manager''s.');
  SELECT * INTO v_p FROM public.mkt_products WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That product is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  IF p_to = 'retire' THEN
    IF v_p.status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'Only a product on sale is retired.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.mkt_products SET status = 'retired', retired_on = (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date,
           updated_by = auth.uid(), updated_at = now()
     WHERE id = p_id RETURNING * INTO v_p;
  ELSIF p_to = 'reactivate' THEN
    IF v_p.status IS DISTINCT FROM 'retired' THEN
      RAISE EXCEPTION 'Only a retired product is reactivated.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.mkt_products SET status = 'active', retired_on = NULL, updated_by = auth.uid(), updated_at = now()
     WHERE id = p_id RETURNING * INTO v_p;
  ELSE
    RAISE EXCEPTION 'Retire or reactivate.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mkt_top_up_due();
  RETURN jsonb_build_object('id', v_p.id, 'status', v_p.status, 'retiredOn', v_p.retired_on, 'version', v_p.version,
    'live', (SELECT count(*) FROM public.mkt_projects x WHERE x.product_id = v_p.id AND x.status NOT IN ('done', 'cancelled')));
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_products() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_product_save(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_product_publish(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_product_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_products() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_product_save(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_product_publish(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_product_status(uuid, text) TO authenticated;

-- ── The builder's page in the database's copy of the tab registry: the manager's tools ──
INSERT INTO public.permission_page_tabs (page, tab_id) VALUES ('/marketing/products', 'mkt.tracking')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
