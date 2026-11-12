-- ============================================================================
-- 20261113100000_marketing_quotes.sql
-- The Product Builder's three tabs (docs/design_handoff_product_builder/, 2026-11-12; the user: "确保那些规则是link在一起,
-- 确保它跟 prototype 的东西是长得一模一样的"): the Product List (Marketing's one menu of sellable items), the products
-- (duplicated, their status changed from a right-click), and quotations — built for a subsidiary or an outside client
-- from items and packages, sent as numbered versions kept whole, accepted by the client (the manager marks it), and
-- their work assigned as quick tasks.
-- ============================================================================
--
-- The user's answers before it was built (2026-11-12):
--   1. A product keeps its revenue account picker (Finance's import posts its lines there, since 2026-10-26); a quotation
--      shows the client's AR account, as the design does.
--   2. Each task row of an accepted quotation becomes a quick task (one stage, the person picked, its start and due day).
--   3. The notice and the banner start on Accepted — the manager's own click ("Client confirmed · mark as accepted").
--   4. A product made Active from the right-click menu that was never published is published first (the page asks).
-- Tables (RLS on, NO policy, no client grants — the functions below, as the rest of Marketing's):
--   mkt_items           the Product List: an item's catalogue, name, description, price, cost, est. days, remarks, workflow,
--                       and its values of the manager's own columns.
--   mkt_item_columns    the manager's own columns of the Product List: what each holds and where its values follow the item.
--   mkt_quotes          a quotation: its number (QT-YYMM-NNN), its client, dates, discount, notes, lines, status, its tasks.
--   mkt_quote_versions  each version sent (its client, dates and lines frozen, its total) and each acceptance.
-- Functions (SECURITY DEFINER, plpgsql; PUBLIC and anon revoked), all Marketing · Manage — prices and costs are the
-- manager's:
--   mkt_quote_book()                       the Product List, the packages on sale, the quotations, the clients, the roster
--   mkt_item_save(id, patch)               an item made or changed; its name changed renames it in every product and quote
--   mkt_item_delete(id)                    an item nothing uses, deleted
--   mkt_item_column_save(id, patch)        the manager's own column of the Product List made or changed (its values follow
--                                          the item into products, quotations and — when ticked — the client's PDF)
--   mkt_item_column_delete(id)             a column taken off, its values with it
--   mkt_item_columns_order(ids)            the columns in their order
--   mkt_catalogue_rename(from, to)         a catalogue renamed for all its items
--   mkt_quote_save(id, rev, patch)         a quotation made (id null), or what changed of it saved, on its count
--   mkt_quote_send(id, rev)                its next version sent — kept whole
--   mkt_quote_accept(id, rev)              the client confirmed: accepted, the managers told
--   mkt_quote_assign(id, rows)             its tasks made: a quick task a row
--   mkt_quote_duplicate(id)                a new draft from it, its history empty
--   mkt_quote_states(ids)                  the bell's question: has each accepted quotation's work been assigned
--   mkt_product_duplicate(id)              a product's draft copied as a new draft
--   mkt_product_set_status(id, to)         Active · Draft · Retired from the list's right-click menu
-- A product published once may go back to Draft (hidden from new projects and quotations while it is worked on): the
-- check that tied Draft to "never published" becomes "Active means published".
-- PGlite: tests/member-sql/validate-marketing-quotes.mjs.

-- ── A published product may be a draft again ────────────────────────────────
ALTER TABLE public.mkt_products DROP CONSTRAINT IF EXISTS mkt_products_check1;
DO $$
DECLARE
  v_con text;
BEGIN
  -- The unnamed CHECK ((status = 'draft') = (version = 0)) of 20261023235900, whatever Postgres called it.
  FOR v_con IN SELECT c.conname FROM pg_constraint c
                WHERE c.conrelid = 'public.mkt_products'::regclass AND c.contype = 'c'
                  AND pg_get_constraintdef(c.oid) ~ 'status = ''draft''::text\) = \(version = 0\)' LOOP
    EXECUTE format('ALTER TABLE public.mkt_products DROP CONSTRAINT %I', v_con);
  END LOOP;
END
$$;
ALTER TABLE public.mkt_products DROP CONSTRAINT IF EXISTS mkt_products_active_published;
ALTER TABLE public.mkt_products ADD CONSTRAINT mkt_products_active_published CHECK (status <> 'active' OR version > 0);

-- ── The tables ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mkt_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalogue    text NOT NULL CHECK (catalogue = btrim(catalogue) AND length(catalogue) BETWEEN 1 AND 60),
  name         text NOT NULL DEFAULT '' CHECK (name = btrim(name) AND length(name) <= 60),
  description  text NOT NULL DEFAULT '' CHECK (length(description) <= 200),
  price        numeric(15,2) CHECK (price >= 0),
  cost         numeric(15,2) CHECK (cost >= 0),
  est_days     integer CHECK (est_days BETWEEN 1 AND 365),
  remarks      text NOT NULL DEFAULT '' CHECK (length(remarks) <= 200),
  workflow_id  uuid REFERENCES public.mkt_workflows(id) ON DELETE SET NULL,
  -- The manager's own columns' values: { <mkt_item_columns.id>: value }.
  extra        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(extra) = 'object'),
  created_by   uuid REFERENCES public.users(id),
  created_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by   uuid REFERENCES public.users(id),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mkt_items_name ON public.mkt_items (lower(name)) WHERE name <> '';

-- The Product List's own columns (the user, 2026-11-12: "管理者可自行增加 column 去填需要的东西", "关系到 product
-- list 的自动联动"): a name, what it holds (text · number · money · a choice of its options · a tick), and where its
-- values follow the item — the products' Items, the quotations' lines, the client's PDF. Values are kept by the
-- column's id, so a column renamed is renamed everywhere.
CREATE TABLE IF NOT EXISTS public.mkt_item_columns (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 40),
  kind         text NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'number', 'money', 'choice', 'check')),
  options      jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) <= 30),
  in_products  boolean NOT NULL DEFAULT true,
  in_quotes    boolean NOT NULL DEFAULT true,
  client       boolean NOT NULL DEFAULT false,
  sort_order   integer NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES public.users(id),
  created_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by   uuid REFERENCES public.users(id),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (in_quotes OR NOT client)
);
CREATE UNIQUE INDEX IF NOT EXISTS mkt_item_columns_name ON public.mkt_item_columns (lower(name));
ALTER TABLE public.mkt_item_columns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_item_columns FROM anon, authenticated;
SELECT public.audit_register('mkt_item_columns', 'Marketing Product List columns', 'Marketing', '{}', 'none',
  p_reason => 'The manager''s own columns of the Product List, saved as they are set; their values live on mkt_items');

CREATE TABLE IF NOT EXISTS public.mkt_quotes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  no             text NOT NULL UNIQUE CHECK (no ~ '^QT-[0-9]{4}-[0-9]{3,4}$'),
  subsidiary_id  uuid REFERENCES public.mkt_subsidiaries(id),
  other          boolean NOT NULL DEFAULT false,
  client_name    text NOT NULL DEFAULT '' CHECK (length(client_name) <= 80),
  contact        text NOT NULL DEFAULT '' CHECK (length(contact) <= 80),
  quote_date     date NOT NULL,
  valid_days     integer NOT NULL DEFAULT 30 CHECK (valid_days BETWEEN 1 AND 90),
  discount       numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount BETWEEN 0 AND 100),
  note           text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  lines          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(lines) = 'array'),
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted')),
  accepted_on    date,
  tasks          jsonb CHECK (tasks IS NULL OR jsonb_typeof(tasks) = 'array'),
  assigned_on    date,
  assigned_by    uuid REFERENCES public.users(id),
  rev            integer NOT NULL DEFAULT 1 CHECK (rev >= 1),
  created_by     uuid REFERENCES public.users(id),
  created_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by     uuid REFERENCES public.users(id),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT other OR subsidiary_id IS NULL),
  CHECK ((status = 'accepted') = (accepted_on IS NOT NULL)),
  CHECK ((tasks IS NULL) = (assigned_on IS NULL)),
  CHECK (tasks IS NULL OR status = 'accepted')
);

CREATE TABLE IF NOT EXISTS public.mkt_quote_versions (
  quote_id   uuid NOT NULL REFERENCES public.mkt_quotes(id) ON DELETE CASCADE,
  seq        integer NOT NULL CHECK (seq >= 1),
  kind       text NOT NULL CHECK (kind IN ('sent', 'accepted')),
  rev        integer NOT NULL CHECK (rev >= 1),
  at         date NOT NULL,
  snap       jsonb CHECK (snap IS NULL OR jsonb_typeof(snap) = 'object'),
  total      numeric(15,2),
  by_user    uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (quote_id, seq),
  CHECK ((kind = 'sent') = (snap IS NOT NULL))
);

ALTER TABLE public.mkt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_quote_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_items, public.mkt_quotes, public.mkt_quote_versions FROM anon, authenticated;

-- Prices and costs are the manager's (the products' are kept out of the trail for the same reason): the Product List and
-- a quotation are saved as they are typed; each version sent is kept whole in mkt_quote_versions.
SELECT public.audit_register('mkt_items', 'Marketing Product List', 'Marketing', '{}', 'none',
  p_reason => 'Saved as it is typed; its prices and costs are the manager''s — no reader of the trail may see them');
SELECT public.audit_register('mkt_quotes', 'Marketing quotations', 'Marketing', '{}', 'none',
  p_reason => 'Saved as it is typed; each version sent is kept whole, with who and when, in mkt_quote_versions');
SELECT public.audit_register('mkt_quote_versions', 'Marketing quotation versions', 'Marketing', '{}', 'none',
  p_reason => 'Each version sent and each acceptance, written once and never changed — a record already');

-- ── A notice may point at a quotation ───────────────────────────────────────
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def FROM pg_constraint c
   WHERE c.conname = 'app_notifications_ref_kind_check' AND c.conrelid = 'public.app_notifications'::regclass;
  IF v_def IS NULL THEN
    NULL;  -- a stand-in with no check (the PGlite tests)
  ELSIF v_def = 'CHECK ((ref_kind = ANY (ARRAY[''att_request''::text, ''att_today''::text, ''booking''::text, ''crm_contact''::text, ''crm_invite''::text, ''hiring_request''::text, ''hr_staff''::text, ''it_request''::text, ''member_request''::text, ''memo''::text, ''mkt_project''::text, ''mkt_quote''::text, ''payment_request''::text, ''share_request''::text, ''share_taken''::text])))' THEN
    NULL;  -- made already
  ELSIF v_def = 'CHECK ((ref_kind = ANY (ARRAY[''att_request''::text, ''att_today''::text, ''booking''::text, ''crm_contact''::text, ''crm_invite''::text, ''hiring_request''::text, ''hr_staff''::text, ''it_request''::text, ''member_request''::text, ''memo''::text, ''mkt_project''::text, ''payment_request''::text, ''share_request''::text, ''share_taken''::text])))' THEN
    ALTER TABLE public.app_notifications DROP CONSTRAINT app_notifications_ref_kind_check;
    -- (20261113100000) mkt_quote: a quotation the client accepted — the Product Builder's Quotations, the quote open.
    ALTER TABLE public.app_notifications ADD CONSTRAINT app_notifications_ref_kind_check CHECK (ref_kind = ANY (ARRAY[
      'att_request', 'att_today', 'booking', 'crm_contact', 'crm_invite', 'hiring_request', 'hr_staff', 'it_request',
      'member_request', 'memo', 'mkt_project', 'mkt_quote', 'payment_request', 'share_request', 'share_taken']));
  ELSE
    RAISE EXCEPTION 'app_notifications_ref_kind_check is %, not the one this migration was written from', v_def;
  END IF;
END
$$;

-- ── Helpers (nobody's to call but the functions below) ──────────────────────
-- Money as the inputs send it: a number in ringgit and sen, or null.
CREATE OR REPLACE FUNCTION public.mkt_money_of(p jsonb, p_what text)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v numeric;
BEGIN
  IF coalesce(jsonb_typeof(p), 'null') = 'null' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p) <> 'number' THEN
    RAISE EXCEPTION '%: an amount in ringgit and sen.', p_what USING ERRCODE = '22023';
  END IF;
  v := (p #>> '{}')::numeric;
  IF v < 0 OR v >= 10000000000000 OR v <> round(v, 2) THEN
    RAISE EXCEPTION '%: an amount in ringgit and sen.', p_what USING ERRCODE = '22023';
  END IF;
  RETURN v;
END
$fn$;

-- A day as the date inputs send it (YYYY-MM-DD), or null.
CREATE OR REPLACE FUNCTION public.mkt_day_of(p jsonb, p_what text)
RETURNS date
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
BEGIN
  IF coalesce(jsonb_typeof(p), 'null') = 'null' OR (p #>> '{}') = '' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p) <> 'string' OR (p #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION '%: pick a day.', p_what USING ERRCODE = '22023';
  END IF;
  RETURN (p #>> '{}')::date;
END
$fn$;

-- A quotation's lines, checked and written clean. An item line (from the Product List): the item, its name and
-- catalogue, its list price, cost and est. days as they were when picked (a later change of the Product List never moves
-- a quote), its quantity and the unit price quoted. A package line (a product on sale): the product, its name, code,
-- kind and version, its list price and cost as published, its months (recurring), the price set by hand (or none), and
-- its items with their base and quoted quantities. Every line: its est. delivery and remarks.
CREATE OR REPLACE FUNCTION public.mkt_quote_lines(p_lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uuid  text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_out   jsonb := '[]'::jsonb;
  v_l     jsonb;
  v_it    jsonb;
  v_items jsonb;
  v_kind  text;
  v_qty   integer;
  v_n     integer := 0;
  v_name  text;
BEGIN
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Not a list of lines.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_lines) > 40 THEN
    RAISE EXCEPTION 'A quotation has at most 40 lines.' USING ERRCODE = '22023';
  END IF;
  FOR v_l IN SELECT x FROM jsonb_array_elements(p_lines) x LOOP
    v_n := v_n + 1;
    IF jsonb_typeof(v_l) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Line %: not a line.', v_n USING ERRCODE = '22023';
    END IF;
    v_kind := v_l ->> 'kind';
    v_name := btrim(coalesce(v_l ->> 'name', ''));
    IF length(v_name) NOT BETWEEN 1 AND 80 THEN
      RAISE EXCEPTION 'Line %: its name.', v_n USING ERRCODE = '22023';
    END IF;
    IF length(coalesce(v_l ->> 'remark', '')) > 200 THEN
      RAISE EXCEPTION 'Line %: remarks of at most 200 characters.', v_n USING ERRCODE = '22023';
    END IF;
    IF length(coalesce(v_l ->> 'key', '')) NOT BETWEEN 1 AND 40 THEN
      RAISE EXCEPTION 'Line %: its key.', v_n USING ERRCODE = '22023';
    END IF;
    IF v_kind = 'item' THEN
      IF coalesce(v_l ->> 'item', '') !~ v_uuid THEN
        RAISE EXCEPTION 'Line %: that item is not on the Product List.', v_n USING ERRCODE = '22023';
      END IF;
      v_qty := CASE WHEN coalesce(v_l ->> 'qty', '') ~ '^[0-9]{1,3}$' THEN (v_l ->> 'qty')::integer END;
      IF v_qty IS NULL OR v_qty < 1 THEN
        RAISE EXCEPTION 'Line %: a quantity of 1 to 999.', v_n USING ERRCODE = '22023';
      END IF;
      IF v_l ? 'days' AND coalesce(jsonb_typeof(v_l -> 'days'), 'null') <> 'null'
         AND coalesce(v_l ->> 'days', '') !~ '^[0-9]{1,3}$' THEN
        RAISE EXCEPTION 'Line %: its est. days.', v_n USING ERRCODE = '22023';
      END IF;
      v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'key', v_l ->> 'key', 'kind', 'item', 'item', (v_l ->> 'item')::uuid, 'name', v_name,
        'cat', left(btrim(coalesce(v_l ->> 'cat', '')), 60),
        'list', coalesce(public.mkt_money_of(v_l -> 'list', 'Line ' || v_n || ' list price'), 0),
        'cost', public.mkt_money_of(v_l -> 'cost', 'Line ' || v_n || ' cost'),
        'days', CASE WHEN coalesce(v_l ->> 'days', '') ~ '^[0-9]{1,3}$' THEN (v_l ->> 'days')::integer END,
        'qty', v_qty,
        'price', public.mkt_money_of(v_l -> 'price', 'Line ' || v_n || ' unit price'),
        'eta', public.mkt_day_of(v_l -> 'eta', 'Line ' || v_n || ' est. delivery'),
        'remark', nullif(btrim(coalesce(v_l ->> 'remark', '')), ''))));
    ELSIF v_kind = 'package' THEN
      IF coalesce(v_l ->> 'product', '') !~ v_uuid THEN
        RAISE EXCEPTION 'Line %: that product is not there.', v_n USING ERRCODE = '22023';
      END IF;
      IF coalesce(v_l ->> 'months', '') !~ '^[0-9]{1,2}$' OR (v_l ->> 'months')::integer NOT BETWEEN 1 AND 36 THEN
        RAISE EXCEPTION 'Line %: 1 to 36 months.', v_n USING ERRCODE = '22023';
      END IF;
      IF jsonb_typeof(coalesce(v_l -> 'items', '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(v_l -> 'items', '[]'::jsonb)) > 120 THEN
        RAISE EXCEPTION 'Line %: at most 120 items.', v_n USING ERRCODE = '22023';
      END IF;
      v_items := '[]'::jsonb;
      FOR v_it IN SELECT x FROM jsonb_array_elements(coalesce(v_l -> 'items', '[]'::jsonb)) x LOOP
        IF coalesce(v_it ->> 'qty', '') !~ '^[0-9]{1,3}$' OR coalesce(v_it ->> 'base', '') !~ '^[0-9]{1,3}$' THEN
          RAISE EXCEPTION 'Line %: a quantity of 0 to 999.', v_n USING ERRCODE = '22023';
        END IF;
        v_items := v_items || jsonb_build_array(jsonb_build_object(
          'name', left(btrim(coalesce(v_it ->> 'name', '')), 60), 'group', left(btrim(coalesce(v_it ->> 'group', '')), 60),
          'base', (v_it ->> 'base')::integer, 'qty', (v_it ->> 'qty')::integer,
          'unit', coalesce(public.mkt_money_of(v_it -> 'unit', 'Line ' || v_n || ' unit price'), 0)));
      END LOOP;
      v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'key', v_l ->> 'key', 'kind', 'package', 'product', (v_l ->> 'product')::uuid, 'name', v_name,
        'code', left(coalesce(v_l ->> 'code', ''), 20),
        'pkind', CASE WHEN v_l ->> 'pkind' = 'recurring' THEN 'recurring' ELSE 'one' END,
        'version', CASE WHEN coalesce(v_l ->> 'version', '') ~ '^[0-9]{1,4}$' THEN (v_l ->> 'version')::integer ELSE 0 END,
        'list', coalesce(public.mkt_money_of(v_l -> 'list', 'Line ' || v_n || ' list price'), 0),
        'cost', public.mkt_money_of(v_l -> 'cost', 'Line ' || v_n || ' cost'),
        'months', (v_l ->> 'months')::integer,
        'price', public.mkt_money_of(v_l -> 'price', 'Line ' || v_n || ' price'),
        'items', v_items,
        'eta', public.mkt_day_of(v_l -> 'eta', 'Line ' || v_n || ' est. delivery'),
        'remark', nullif(btrim(coalesce(v_l ->> 'remark', '')), ''))));
    ELSE
      RAISE EXCEPTION 'Line %: an item or a package.', v_n USING ERRCODE = '22023';
    END IF;
  END LOOP;
  RETURN v_out;
END
$fn$;

-- What a set of lines comes to, before the discount: an item's unit price (its list price unless set) × its quantity; a
-- package's price (set by hand, else its list price with each item's change in quantity × its unit price) × its months
-- when recurring. As lib/marketing/quotes.ts `lineCalc`.
CREATE OR REPLACE FUNCTION public.mkt_quote_subtotal(p_lines jsonb)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $fn$
  SELECT coalesce(sum(CASE
           WHEN l ->> 'kind' = 'item' THEN coalesce((l ->> 'price')::numeric, (l ->> 'list')::numeric, 0) * (l ->> 'qty')::integer
           ELSE coalesce((l ->> 'price')::numeric,
                         coalesce((l ->> 'list')::numeric, 0)
                         + coalesce((SELECT sum(((it ->> 'qty')::integer - (it ->> 'base')::integer) * (it ->> 'unit')::numeric)
                                       FROM jsonb_array_elements(coalesce(l -> 'items', '[]'::jsonb)) it), 0))
                * CASE WHEN l ->> 'pkind' = 'recurring' THEN (l ->> 'months')::integer ELSE 1 END
         END), 0)
    FROM jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
$fn$;

-- A quotation as it is sent (what a version keeps, and what "edited since" compares): its client, dates, discount,
-- notes and lines.
CREATE OR REPLACE FUNCTION public.mkt_quote_core(p_q public.mkt_quotes)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'sub', p_q.subsidiary_id, 'other', p_q.other,
    'client', CASE WHEN p_q.other THEN p_q.client_name ELSE coalesce((SELECT s.name FROM public.mkt_subsidiaries s WHERE s.id = p_q.subsidiary_id), '') END,
    'contact', p_q.contact, 'date', p_q.quote_date, 'valid', p_q.valid_days, 'discount', p_q.discount, 'note', p_q.note,
    'lines', p_q.lines)
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_quote_total(p_core jsonb)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $fn$
  SELECT round(public.mkt_quote_subtotal(p_core -> 'lines') * (1 - least(100, greatest(0, coalesce((p_core ->> 'discount')::numeric, 0))) / 100), 2)
$fn$;

-- The client's AR account, as Pool › Money in · by source lists them: a group company's own (`ar_account_code_for`), else
-- AR - Other. "3033 · AR - Carres".
CREATE OR REPLACE FUNCTION public.mkt_quote_ar(p_sub uuid, p_other boolean)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_company uuid;
  v_code    text;
BEGIN
  IF p_sub IS NULL AND NOT coalesce(p_other, false) THEN
    RETURN NULL;
  END IF;
  SELECT s.company_id INTO v_company FROM public.mkt_subsidiaries s WHERE s.id = p_sub;
  v_code := public.ar_account_code_for(v_company, NULL, CASE WHEN v_company IS NULL THEN 'other' END);
  RETURN v_code || coalesce(' · ' || (SELECT a.name FROM public.chart_of_accounts a WHERE a.code = v_code), '');
END
$fn$;

-- Each quotation as the page reads it: the quote, its versions newest last, whether it changed since its last sending.
CREATE OR REPLACE FUNCTION public.mkt_quote_json(p_q public.mkt_quotes)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'id', p_q.id, 'no', p_q.no, 'sub', p_q.subsidiary_id, 'other', p_q.other, 'client', p_q.client_name, 'contact', p_q.contact,
    'date', p_q.quote_date, 'valid', p_q.valid_days, 'discount', p_q.discount, 'note', p_q.note, 'lines', p_q.lines,
    'status', p_q.status, 'acceptedOn', p_q.accepted_on, 'tasks', p_q.tasks, 'assignedOn', p_q.assigned_on, 'rev', p_q.rev,
    'createdAt', p_q.created_at,
    'history', coalesce((SELECT jsonb_agg(jsonb_build_object('seq', v.seq, 'kind', v.kind, 'rev', v.rev, 'at', v.at, 'snap', v.snap,
                                                             'total', v.total) ORDER BY v.seq)
                           FROM public.mkt_quote_versions v WHERE v.quote_id = p_q.id), '[]'::jsonb))
$fn$;

REVOKE ALL ON FUNCTION public.mkt_money_of(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_day_of(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_quote_lines(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_quote_subtotal(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_quote_core(public.mkt_quotes) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_quote_total(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_quote_ar(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_quote_json(public.mkt_quotes) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_money_of(jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_day_of(jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_quote_lines(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_quote_subtotal(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_quote_core(public.mkt_quotes) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_quote_total(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_quote_ar(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_quote_json(public.mkt_quotes) TO service_role;

-- A value of one of the manager's columns, checked by what it holds: text (≤ 200), a number, money (ringgit and sen),
-- one of its options, a tick. Null (or '') clears it.
CREATE OR REPLACE FUNCTION public.mkt_item_value(p_col public.mkt_item_columns, p_v jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_t text := coalesce(jsonb_typeof(p_v), 'null');
  v_s text;
BEGIN
  IF v_t = 'null' OR (v_t = 'string' AND btrim(p_v #>> '{}') = '') THEN
    RETURN NULL;
  END IF;
  IF p_col.kind = 'text' THEN
    v_s := btrim(p_v #>> '{}');
    IF v_t NOT IN ('string', 'number') OR length(v_s) > 200 THEN
      RAISE EXCEPTION '%: at most 200 characters.', p_col.name USING ERRCODE = '22023';
    END IF;
    RETURN to_jsonb(v_s);
  ELSIF p_col.kind = 'number' THEN
    IF v_t <> 'number' OR abs((p_v #>> '{}')::numeric) >= 1000000000000 THEN
      RAISE EXCEPTION '%: a number.', p_col.name USING ERRCODE = '22023';
    END IF;
    RETURN p_v;
  ELSIF p_col.kind = 'money' THEN
    RETURN to_jsonb(public.mkt_money_of(p_v, p_col.name));
  ELSIF p_col.kind = 'choice' THEN
    IF v_t <> 'string' OR NOT (p_col.options ? (p_v #>> '{}')) THEN
      RAISE EXCEPTION '%: pick one of its options.', p_col.name USING ERRCODE = '22023';
    END IF;
    RETURN p_v;
  ELSE
    IF v_t <> 'boolean' THEN
      RAISE EXCEPTION '%: ticked or not.', p_col.name USING ERRCODE = '22023';
    END IF;
    RETURN CASE WHEN (p_v #>> '{}')::boolean THEN 'true'::jsonb END;
  END IF;
END
$fn$;

-- What an item shows of the manager's columns in a quotation, frozen with a version sent: [{ name, value, client }]
-- for the columns that follow quotations and hold something, in the columns' order.
CREATE OR REPLACE FUNCTION public.mkt_item_extras(p_extra jsonb)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'kind', c.kind, 'value', p_extra -> c.id::text, 'client', c.client)
                            ORDER BY c.sort_order, c.created_at), '[]'::jsonb)
    FROM public.mkt_item_columns c
   WHERE c.in_quotes AND coalesce(p_extra, '{}'::jsonb) ? c.id::text
$fn$;

-- A quotation's lines with each item's columns as the Product List has them now (what a version sent keeps) — and
-- the same lines without them (what "changed since" compares: a Product List value changed is no edit of the quote).
CREATE OR REPLACE FUNCTION public.mkt_quote_with_extras(p_lines jsonb)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT coalesce(jsonb_agg(CASE
           WHEN l ->> 'kind' = 'item' THEN l || jsonb_build_object('extra',
             public.mkt_item_extras((SELECT i.extra FROM public.mkt_items i WHERE i.id::text = l ->> 'item')))
           ELSE jsonb_set(l, '{items}', coalesce((SELECT jsonb_agg(it || jsonb_build_object('extra',
             public.mkt_item_extras((SELECT i.extra FROM public.mkt_items i WHERE lower(i.name) = lower(btrim(it ->> 'name')) AND i.name <> '')))
             ORDER BY o) FROM jsonb_array_elements(l -> 'items') WITH ORDINALITY x(it, o)), '[]'::jsonb))
         END ORDER BY lo), '[]'::jsonb)
    FROM jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) WITH ORDINALITY y(l, lo)
$fn$;
CREATE OR REPLACE FUNCTION public.mkt_quote_plain(p_core jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $fn$
  SELECT jsonb_set(p_core, '{lines}', coalesce((SELECT jsonb_agg(CASE
           WHEN l ->> 'kind' = 'item' THEN l - 'extra'
           ELSE jsonb_set(l, '{items}', coalesce((SELECT jsonb_agg(it - 'extra' ORDER BY o)
                                                  FROM jsonb_array_elements(l -> 'items') WITH ORDINALITY x(it, o)), '[]'::jsonb))
         END ORDER BY lo) FROM jsonb_array_elements(coalesce(p_core -> 'lines', '[]'::jsonb)) WITH ORDINALITY y(l, lo)), '[]'::jsonb))
$fn$;

REVOKE ALL ON FUNCTION public.mkt_item_value(public.mkt_item_columns, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_item_extras(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_quote_with_extras(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_quote_plain(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_item_value(public.mkt_item_columns, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_item_extras(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_quote_with_extras(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_quote_plain(jsonb) TO service_role;

-- ── The Product List's own columns ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_item_column_json(p_c public.mkt_item_columns)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  SELECT jsonb_build_object('id', p_c.id, 'name', p_c.name, 'kind', p_c.kind, 'options', p_c.options, 'inProducts', p_c.in_products,
                            'inQuotes', p_c.in_quotes, 'client', p_c.client)
$fn$;
REVOKE ALL ON FUNCTION public.mkt_item_column_json(public.mkt_item_columns) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_item_column_json(public.mkt_item_columns) TO service_role;

-- p_id null: a new column (its name, at the end). Else only the keys given: name, kind, options, inProducts, inQuotes,
-- client. A column's kind changed, or an option taken off, clears the values that no longer fit. At most 20 columns.
CREATE OR REPLACE FUNCTION public.mkt_item_column_save(p_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_c     public.mkt_item_columns;
  v_old   public.mkt_item_columns;
  v_name  text;
  v_opts  jsonb := '[]'::jsonb;
  v_o     text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Product List is the manager''s.');
  IF jsonb_typeof(v_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;
  IF p_id IS NULL THEN
    IF (SELECT count(*) FROM public.mkt_item_columns) >= 20 THEN
      RAISE EXCEPTION 'The Product List has at most 20 columns of your own.' USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT * INTO v_old FROM public.mkt_item_columns WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That column is not there any more.' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  v_name := CASE WHEN v_patch ? 'name' THEN regexp_replace(btrim(coalesce(v_patch ->> 'name', '')), '\s+', ' ', 'g') ELSE v_old.name END;
  IF length(coalesce(v_name, '')) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Name the column (at most 40 characters).' USING ERRCODE = '22023';
  END IF;
  IF lower(v_name) IN ('item', 'description', 'price', 'cost', 'est. days', 'workflow', 'remarks')
     OR EXISTS (SELECT 1 FROM public.mkt_item_columns c WHERE lower(c.name) = lower(v_name) AND c.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'There is a column called “%” already.', v_name USING ERRCODE = '23505';
  END IF;
  IF v_patch ? 'kind' AND coalesce(v_patch ->> 'kind', '') NOT IN ('text', 'number', 'money', 'choice', 'check') THEN
    RAISE EXCEPTION 'Text, a number, money, a choice or a tick.' USING ERRCODE = '22023';
  END IF;
  IF v_patch ? 'options' THEN
    IF jsonb_typeof(v_patch -> 'options') IS DISTINCT FROM 'array' OR jsonb_array_length(v_patch -> 'options') > 30 THEN
      RAISE EXCEPTION 'At most 30 options.' USING ERRCODE = '22023';
    END IF;
    FOR v_o IN SELECT regexp_replace(btrim(x), '\s+', ' ', 'g') FROM jsonb_array_elements_text(v_patch -> 'options') x LOOP
      IF length(v_o) NOT BETWEEN 1 AND 40 THEN
        RAISE EXCEPTION 'Name each option (at most 40 characters).' USING ERRCODE = '22023';
      END IF;
      IF v_opts ? v_o THEN
        RAISE EXCEPTION '“%” twice.', v_o USING ERRCODE = '22023';
      END IF;
      v_opts := v_opts || to_jsonb(v_o);
    END LOOP;
  ELSE
    v_opts := coalesce(v_old.options, '[]'::jsonb);
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.mkt_item_columns (name, kind, options, in_products, in_quotes, client, sort_order, created_by, updated_by)
    VALUES (v_name, coalesce(v_patch ->> 'kind', 'text'), v_opts,
            coalesce((v_patch ->> 'inProducts')::boolean, true), coalesce((v_patch ->> 'inQuotes')::boolean, true),
            coalesce((v_patch ->> 'client')::boolean, false) AND coalesce((v_patch ->> 'inQuotes')::boolean, true),
            coalesce((SELECT max(c.sort_order) FROM public.mkt_item_columns c), 0) + 1, auth.uid(), auth.uid())
    RETURNING * INTO v_c;
  ELSE
    UPDATE public.mkt_item_columns
       SET name = v_name, kind = coalesce(v_patch ->> 'kind', kind), options = v_opts,
           in_products = coalesce((v_patch ->> 'inProducts')::boolean, in_products),
           in_quotes = coalesce((v_patch ->> 'inQuotes')::boolean, in_quotes),
           client = coalesce((v_patch ->> 'client')::boolean, client) AND coalesce((v_patch ->> 'inQuotes')::boolean, in_quotes),
           updated_by = auth.uid(), updated_at = now()
     WHERE id = p_id
    RETURNING * INTO v_c;
    -- Values that no longer fit go: every one when the kind changes; a choice's taken off its options.
    IF v_c.kind <> v_old.kind THEN
      UPDATE public.mkt_items SET extra = extra - v_c.id::text WHERE extra ? v_c.id::text;
    ELSIF v_c.kind = 'choice' THEN
      UPDATE public.mkt_items SET extra = extra - v_c.id::text
       WHERE extra ? v_c.id::text AND NOT (v_c.options ? (extra ->> v_c.id::text));
    END IF;
  END IF;
  RETURN public.mkt_item_column_json(v_c);
END
$fn$;

-- A column taken off the Product List, its values with it (a version sent keeps what it showed).
CREATE OR REPLACE FUNCTION public.mkt_item_column_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Product List is the manager''s.');
  UPDATE public.mkt_items SET extra = extra - p_id::text WHERE extra ? p_id::text;
  DELETE FROM public.mkt_item_columns WHERE id = p_id;
END
$fn$;

-- The columns in the order given (every one of them, once).
CREATE OR REPLACE FUNCTION public.mkt_item_columns_order(p_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Product List is the manager''s.');
  IF coalesce(array_length(p_ids, 1), 0) <> (SELECT count(*) FROM public.mkt_item_columns)
     OR EXISTS (SELECT 1 FROM public.mkt_item_columns c WHERE NOT (c.id = ANY (p_ids)))
     OR (SELECT count(DISTINCT x) FROM unnest(p_ids) x) <> array_length(p_ids, 1) THEN
    RAISE EXCEPTION 'Reload the Product List and try again.' USING ERRCODE = '40001';
  END IF;
  UPDATE public.mkt_item_columns c SET sort_order = o.n, updated_by = auth.uid(), updated_at = now()
    FROM unnest(p_ids) WITH ORDINALITY o(id, n) WHERE c.id = o.id;
END
$fn$;

-- ── The reader ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_quote_book()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Product Builder is the manager''s.');
  RETURN jsonb_build_object(
    'today', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date,
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'cat', i.catalogue, 'name', i.name, 'desc', i.description,
                                          'price', i.price, 'cost', i.cost, 'days', i.est_days, 'remarks', i.remarks, 'wf', i.workflow_id, 'extra', i.extra)
                                        ORDER BY i.created_at, i.id)
                         FROM public.mkt_items i), '[]'::jsonb),
    -- What a quotation may pick as a package: a product on sale, as its last version was published.
    'packages', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'code', p.code, 'name', v.name, 'kind', v.kind,
                                             'version', v.version, 'price', v.price, 'cost', v.cost, 'groups', v.groups)
                                           ORDER BY p.created_at, p.id)
                            FROM public.mkt_products p
                            JOIN public.mkt_product_versions v ON v.product_id = p.id AND v.version = p.version
                           WHERE p.status = 'active'), '[]'::jsonb),
    'quotes', coalesce((SELECT jsonb_agg(public.mkt_quote_json(q) ORDER BY q.created_at DESC, q.id) FROM public.mkt_quotes q), '[]'::jsonb),
    'clients', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name, 'dot', s.dot,
                                            'group', s.company_id IS NOT NULL, 'ar', public.mkt_quote_ar(s.id, false))
                                          ORDER BY s.sort_order, s.name)
                           FROM public.mkt_subsidiaries s WHERE s.active), '[]'::jsonb),
    'columns', coalesce((SELECT jsonb_agg(public.mkt_item_column_json(c) ORDER BY c.sort_order, c.created_at) FROM public.mkt_item_columns c), '[]'::jsonb),
    'arOther', public.mkt_quote_ar(NULL, true),
    'people', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.staff_id, 'name', coalesce(nullif(r.first_name, ''), r.full_name),
                                           'full', r.full_name, 'title', r.title) ORDER BY coalesce(nullif(r.first_name, ''), r.full_name), r.staff_id)
                          FROM public.mkt_roster() r), '[]'::jsonb));
END
$fn$;

-- ── The Product List ────────────────────────────────────────────────────────
-- p_id null: a new item (its catalogue given). Else only the keys given change: cat, name, desc, price, cost, days,
-- remarks, wf. A new name is the item's everywhere: every product's draft and every quotation's lines (never a version
-- already published or sent).
CREATE OR REPLACE FUNCTION public.mkt_item_save(p_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uuid  text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_i     public.mkt_items;
  v_old   text;
  v_cat   text;
  v_name  text;
  v_desc  text;
  v_rem   text;
  v_days  integer;
  v_wf    uuid;
  v_extra jsonb;
  v_key   text;
  v_val   jsonb;
  v_col   public.mkt_item_columns;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Product List is the manager''s.');
  IF jsonb_typeof(v_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_i FROM public.mkt_items WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That item is not on the Product List any more.' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  v_old := coalesce(v_i.name, '');
  v_cat := CASE WHEN v_patch ? 'cat' THEN regexp_replace(btrim(coalesce(v_patch ->> 'cat', '')), '\s+', ' ', 'g') ELSE v_i.catalogue END;
  IF length(coalesce(v_cat, '')) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Name the catalogue (at most 60 characters).' USING ERRCODE = '22023';
  END IF;
  v_name := CASE WHEN v_patch ? 'name' THEN regexp_replace(btrim(coalesce(v_patch ->> 'name', '')), '\s+', ' ', 'g') ELSE v_old END;
  IF length(v_name) > 60 THEN
    RAISE EXCEPTION 'An item''s name of at most 60 characters.' USING ERRCODE = '22023';
  END IF;
  IF v_name <> '' AND EXISTS (SELECT 1 FROM public.mkt_items x WHERE lower(x.name) = lower(v_name) AND x.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION '“%” is on the Product List already.', v_name USING ERRCODE = '23505';
  END IF;
  v_desc := CASE WHEN v_patch ? 'desc' THEN btrim(coalesce(v_patch ->> 'desc', '')) ELSE coalesce(v_i.description, '') END;
  IF length(v_desc) > 200 THEN
    RAISE EXCEPTION 'A description of at most 200 characters.' USING ERRCODE = '22023';
  END IF;
  v_rem := CASE WHEN v_patch ? 'remarks' THEN btrim(coalesce(v_patch ->> 'remarks', '')) ELSE coalesce(v_i.remarks, '') END;
  IF length(v_rem) > 200 THEN
    RAISE EXCEPTION 'Remarks of at most 200 characters.' USING ERRCODE = '22023';
  END IF;
  IF v_patch ? 'days' THEN
    IF coalesce(jsonb_typeof(v_patch -> 'days'), 'null') = 'null' THEN
      v_days := NULL;
    ELSIF coalesce(v_patch ->> 'days', '') !~ '^[0-9]{1,3}$' OR (v_patch ->> 'days')::integer NOT BETWEEN 1 AND 365 THEN
      RAISE EXCEPTION 'Est. days: 1 to 365.' USING ERRCODE = '22023';
    ELSE
      v_days := (v_patch ->> 'days')::integer;
    END IF;
  ELSE
    v_days := v_i.est_days;
  END IF;
  IF v_patch ? 'wf' THEN
    IF coalesce(v_patch ->> 'wf', '') = '' THEN
      v_wf := NULL;
    ELSIF (v_patch ->> 'wf') !~ v_uuid OR NOT EXISTS (SELECT 1 FROM public.mkt_workflows w WHERE w.id = (v_patch ->> 'wf')::uuid) THEN
      RAISE EXCEPTION 'That workflow is not there.' USING ERRCODE = '22023';
    ELSE
      v_wf := (v_patch ->> 'wf')::uuid;
    END IF;
  ELSE
    v_wf := v_i.workflow_id;
  END IF;
  -- The manager's own columns: only those sent change, each checked by what it holds; null clears one.
  v_extra := coalesce(v_i.extra, '{}'::jsonb);
  IF v_patch ? 'extra' THEN
    IF jsonb_typeof(v_patch -> 'extra') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Not the Product List''s columns.' USING ERRCODE = '22023';
    END IF;
    FOR v_key, v_val IN SELECT k, v FROM jsonb_each(v_patch -> 'extra') x(k, v) LOOP
      SELECT * INTO v_col FROM public.mkt_item_columns c WHERE c.id::text = v_key;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'That column is not on the Product List any more — reload it.' USING ERRCODE = '22023';
      END IF;
      v_val := public.mkt_item_value(v_col, v_val);
      v_extra := CASE WHEN v_val IS NULL THEN v_extra - v_key ELSE v_extra || jsonb_build_object(v_key, v_val) END;
    END LOOP;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.mkt_items (catalogue, name, description, price, cost, est_days, remarks, workflow_id, extra, created_by, updated_by)
    VALUES (v_cat, v_name, v_desc,
            CASE WHEN v_patch ? 'price' THEN public.mkt_money_of(v_patch -> 'price', 'Price') END,
            CASE WHEN v_patch ? 'cost' THEN public.mkt_money_of(v_patch -> 'cost', 'Cost') END,
            v_days, v_rem, v_wf, v_extra, auth.uid(), auth.uid())
    RETURNING * INTO v_i;
  ELSE
    UPDATE public.mkt_items
       SET catalogue = v_cat, name = v_name, description = v_desc,
           price = CASE WHEN v_patch ? 'price' THEN public.mkt_money_of(v_patch -> 'price', 'Price') ELSE price END,
           cost = CASE WHEN v_patch ? 'cost' THEN public.mkt_money_of(v_patch -> 'cost', 'Cost') ELSE cost END,
           est_days = v_days, remarks = v_rem, workflow_id = v_wf, extra = v_extra, updated_by = auth.uid(), updated_at = now()
     WHERE id = p_id
    RETURNING * INTO v_i;
    -- Renamed: the item is renamed wherever it was by its old name (the design's link by name) — products' drafts, and
    -- quotations' lines (an item line by its id too). Versions published or sent keep the words they were sent with.
    IF v_old <> '' AND v_name <> '' AND v_old <> v_name THEN
      UPDATE public.mkt_products p
         SET groups = (SELECT jsonb_agg(jsonb_set(g, '{items}', coalesce((SELECT jsonb_agg(CASE WHEN lower(btrim(it ->> 'name')) = lower(v_old)
                                                                                                 THEN jsonb_set(it, '{name}', to_jsonb(v_name)) ELSE it END ORDER BY o)
                                                                             FROM jsonb_array_elements(g -> 'items') WITH ORDINALITY x(it, o)), '[]'::jsonb)) ORDER BY go)
                         FROM jsonb_array_elements(p.groups) WITH ORDINALITY y(g, go)),
             draft_rev = draft_rev + 1, updated_by = auth.uid(), updated_at = now()
       WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(p.groups) g, jsonb_array_elements(g -> 'items') it
                      WHERE lower(btrim(it ->> 'name')) = lower(v_old));
      UPDATE public.mkt_quotes q
         SET lines = (SELECT jsonb_agg(CASE
                                         WHEN l ->> 'kind' = 'item' AND (l ->> 'item')::uuid = v_i.id THEN jsonb_set(l, '{name}', to_jsonb(v_name))
                                         WHEN l ->> 'kind' = 'package' THEN jsonb_set(l, '{items}', coalesce((
                                           SELECT jsonb_agg(CASE WHEN lower(btrim(it ->> 'name')) = lower(v_old) THEN jsonb_set(it, '{name}', to_jsonb(v_name)) ELSE it END ORDER BY o)
                                             FROM jsonb_array_elements(l -> 'items') WITH ORDINALITY x(it, o)), '[]'::jsonb))
                                         ELSE l END ORDER BY lo)
                        FROM jsonb_array_elements(q.lines) WITH ORDINALITY y(l, lo)),
             rev = rev + 1, updated_by = auth.uid(), updated_at = now()
       WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(q.lines) l
                      WHERE (l ->> 'kind' = 'item' AND (l ->> 'item')::uuid = v_i.id)
                         OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(l -> 'items', '[]'::jsonb)) it
                                     WHERE lower(btrim(it ->> 'name')) = lower(v_old)));
    END IF;
  END IF;
  RETURN jsonb_build_object('id', v_i.id, 'cat', v_i.catalogue, 'name', v_i.name, 'desc', v_i.description, 'price', v_i.price,
                            'cost', v_i.cost, 'days', v_i.est_days, 'remarks', v_i.remarks, 'wf', v_i.workflow_id, 'extra', v_i.extra);
END
$fn$;

-- Where an item is used: products (any status, by name in their draft) and quotations (an item line, or a package's
-- item by name). "2 products · 1 quote", or NULL.
CREATE OR REPLACE FUNCTION public.mkt_item_used(p_id uuid, p_name text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_pc integer;
  v_qc integer;
BEGIN
  SELECT count(*) INTO v_pc FROM public.mkt_products p
   WHERE btrim(coalesce(p_name, '')) <> ''
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(p.groups) g, jsonb_array_elements(g -> 'items') it
                  WHERE lower(btrim(it ->> 'name')) = lower(btrim(p_name)));
  SELECT count(*) INTO v_qc FROM public.mkt_quotes q
   WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(q.lines) l
                  WHERE (l ->> 'kind' = 'item' AND l ->> 'item' = p_id::text)
                     OR (btrim(coalesce(p_name, '')) <> '' AND EXISTS (
                           SELECT 1 FROM jsonb_array_elements(coalesce(l -> 'items', '[]'::jsonb)) it
                            WHERE lower(btrim(it ->> 'name')) = lower(btrim(p_name)))));
  RETURN nullif(concat_ws(' · ', CASE WHEN v_pc > 0 THEN v_pc || ' product' || CASE WHEN v_pc = 1 THEN '' ELSE 's' END END,
                                 CASE WHEN v_qc > 0 THEN v_qc || ' quote' || CASE WHEN v_qc = 1 THEN '' ELSE 's' END END), '');
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_item_used(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_item_used(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.mkt_item_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_i    public.mkt_items;
  v_used text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Product List is the manager''s.');
  SELECT * INTO v_i FROM public.mkt_items WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;  -- gone already
  END IF;
  v_used := public.mkt_item_used(v_i.id, v_i.name);
  IF v_used IS NOT NULL THEN
    RAISE EXCEPTION '“%” is used in % — remove it there first', v_i.name, v_used USING ERRCODE = '23503';
  END IF;
  DELETE FROM public.mkt_items WHERE id = p_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_catalogue_rename(p_from text, p_to text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_to text := regexp_replace(btrim(coalesce(p_to, '')), '\s+', ' ', 'g');
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Product List is the manager''s.');
  IF length(v_to) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Name the catalogue (at most 60 characters).' USING ERRCODE = '22023';
  END IF;
  UPDATE public.mkt_items SET catalogue = v_to, updated_by = auth.uid(), updated_at = now()
   WHERE catalogue = p_from AND catalogue <> v_to;
END
$fn$;

-- ── Quotations ──────────────────────────────────────────────────────────────
-- p_id null: a new quotation (QT-<YYMM>-<NNN>, the office's month), dated today, valid 30 days. Else only the keys given
-- change, on the count the caller last saw: sub (a subsidiary or Marketing's own client), other + client (an outside
-- client named here), contact, date, valid, discount, note, lines.
CREATE OR REPLACE FUNCTION public.mkt_quote_save(p_id uuid, p_rev integer, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_uuid  text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_q     public.mkt_quotes;
  v_pre   text;
  v_no    text;
  v_sub   uuid;
  v_other boolean;
  v_by    text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Quotations are the manager''s.');
  IF jsonb_typeof(v_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;
  IF p_id IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('mkt_quote_no'));
    v_pre := 'QT-' || to_char(v_today, 'YYMM') || '-';
    v_no := v_pre || lpad((coalesce((SELECT max(substr(q.no, 9)::integer) FROM public.mkt_quotes q WHERE q.no LIKE v_pre || '%'), 0) + 1)::text, 3, '0');
    INSERT INTO public.mkt_quotes (no, quote_date, created_by, updated_by) VALUES (v_no, v_today, auth.uid(), auth.uid())
    RETURNING * INTO v_q;
  ELSE
    SELECT * INTO v_q FROM public.mkt_quotes WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That quotation is not there any more.' USING ERRCODE = 'P0002';
    END IF;
    IF p_rev IS DISTINCT FROM v_q.rev THEN
      v_by := coalesce((SELECT u.name FROM public.users u WHERE u.id = v_q.updated_by), 'Somebody');
      RAISE EXCEPTION '% changed this quotation since you opened it — reload to see it.', v_by USING ERRCODE = '40001';
    END IF;
  END IF;

  v_sub := v_q.subsidiary_id;
  v_other := v_q.other;
  IF v_patch ? 'other' THEN
    v_other := coalesce((v_patch ->> 'other')::boolean, false);
    IF v_other THEN
      v_sub := NULL;
    END IF;
  END IF;
  IF v_patch ? 'sub' THEN
    IF coalesce(v_patch ->> 'sub', '') = '' THEN
      v_sub := NULL;
    ELSIF (v_patch ->> 'sub') !~ v_uuid OR NOT EXISTS (SELECT 1 FROM public.mkt_subsidiaries s WHERE s.id = (v_patch ->> 'sub')::uuid AND s.active) THEN
      RAISE EXCEPTION 'Pick who the quotation is for.' USING ERRCODE = '22023';
    ELSE
      v_sub := (v_patch ->> 'sub')::uuid;
      v_other := false;
    END IF;
  END IF;
  IF v_patch ? 'client' AND length(btrim(coalesce(v_patch ->> 'client', ''))) > 80 THEN
    RAISE EXCEPTION 'A client''s name of at most 80 characters.' USING ERRCODE = '22023';
  END IF;
  IF v_patch ? 'contact' AND length(btrim(coalesce(v_patch ->> 'contact', ''))) > 80 THEN
    RAISE EXCEPTION 'Attention to: at most 80 characters.' USING ERRCODE = '22023';
  END IF;
  IF v_patch ? 'valid' AND (coalesce(v_patch ->> 'valid', '') !~ '^[0-9]{1,2}$' OR (v_patch ->> 'valid')::integer NOT BETWEEN 1 AND 90) THEN
    RAISE EXCEPTION 'Valid for 1 to 90 days.' USING ERRCODE = '22023';
  END IF;
  IF v_patch ? 'discount' AND (jsonb_typeof(v_patch -> 'discount') <> 'number'
                               OR (v_patch ->> 'discount')::numeric NOT BETWEEN 0 AND 100
                               OR (v_patch ->> 'discount')::numeric <> round((v_patch ->> 'discount')::numeric, 2)) THEN
    RAISE EXCEPTION 'A discount of 0 to 100%%.' USING ERRCODE = '22023';
  END IF;
  IF v_patch ? 'note' AND length(coalesce(v_patch ->> 'note', '')) > 2000 THEN
    RAISE EXCEPTION 'Notes of at most 2,000 characters.' USING ERRCODE = '22023';
  END IF;
  IF v_patch ? 'date' AND public.mkt_day_of(v_patch -> 'date', 'Quote date') IS NULL THEN
    RAISE EXCEPTION 'Quote date: pick a day.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.mkt_quotes
     SET subsidiary_id = v_sub, other = v_other,
         client_name = CASE WHEN NOT v_other THEN '' WHEN v_patch ? 'client' THEN btrim(coalesce(v_patch ->> 'client', '')) ELSE client_name END,
         contact = CASE WHEN v_patch ? 'contact' THEN btrim(coalesce(v_patch ->> 'contact', '')) ELSE contact END,
         quote_date = CASE WHEN v_patch ? 'date' THEN public.mkt_day_of(v_patch -> 'date', 'Quote date') ELSE quote_date END,
         valid_days = CASE WHEN v_patch ? 'valid' THEN (v_patch ->> 'valid')::integer ELSE valid_days END,
         discount = CASE WHEN v_patch ? 'discount' THEN (v_patch ->> 'discount')::numeric ELSE discount END,
         note = CASE WHEN v_patch ? 'note' THEN coalesce(v_patch ->> 'note', '') ELSE note END,
         lines = CASE WHEN v_patch ? 'lines' THEN public.mkt_quote_lines(v_patch -> 'lines') ELSE lines END,
         rev = CASE WHEN p_id IS NULL THEN rev ELSE rev + 1 END, updated_by = auth.uid(), updated_at = now()
   WHERE id = v_q.id
  RETURNING * INTO v_q;
  RETURN public.mkt_quote_json(v_q);
END
$fn$;

-- The next version sent: the quotation as it is now, kept whole (its prices frozen), its total. A first sending makes a
-- draft Sent; a later one only after an edit.
CREATE OR REPLACE FUNCTION public.mkt_quote_send(p_id uuid, p_rev integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_q     public.mkt_quotes;
  v_core  jsonb;
  v_last  public.mkt_quote_versions;
  v_by    text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Quotations are the manager''s.');
  SELECT * INTO v_q FROM public.mkt_quotes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That quotation is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  IF p_rev IS DISTINCT FROM v_q.rev THEN
    v_by := coalesce((SELECT u.name FROM public.users u WHERE u.id = v_q.updated_by), 'Somebody');
    RAISE EXCEPTION '% changed this quotation since you opened it — reload to see it.', v_by USING ERRCODE = '40001';
  END IF;
  IF v_q.subsidiary_id IS NULL AND NOT (v_q.other AND v_q.client_name <> '') THEN
    RAISE EXCEPTION 'Pick the subsidiary first' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_q.lines) = 0 THEN
    RAISE EXCEPTION 'Add an item first' USING ERRCODE = '22023';
  END IF;
  v_core := public.mkt_quote_core(v_q);
  SELECT * INTO v_last FROM public.mkt_quote_versions WHERE quote_id = v_q.id AND kind = 'sent' ORDER BY seq DESC LIMIT 1;
  IF v_last.quote_id IS NOT NULL AND public.mkt_quote_plain(v_last.snap) = v_core THEN
    RAISE EXCEPTION 'Nothing has changed since v% was sent.', v_last.rev USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.mkt_quote_versions (quote_id, seq, kind, rev, at, snap, total, by_user)
  VALUES (v_q.id, coalesce((SELECT max(v.seq) FROM public.mkt_quote_versions v WHERE v.quote_id = v_q.id), 0) + 1, 'sent',
          coalesce(v_last.rev, 0) + 1, v_today, jsonb_set(v_core, '{lines}', public.mkt_quote_with_extras(v_core -> 'lines')),
          public.mkt_quote_total(v_core), auth.uid());
  -- A revision sent after an acceptance is a new offer — back to Sent, to be accepted again — unless its work is
  -- assigned already: then it stays Accepted (its tasks are under way) and the revision is kept in its history.
  UPDATE public.mkt_quotes
     SET status = CASE WHEN tasks IS NULL THEN 'sent' ELSE 'accepted' END,
         accepted_on = CASE WHEN tasks IS NULL THEN NULL ELSE accepted_on END,
         rev = rev + 1, updated_by = auth.uid(), updated_at = now()
   WHERE id = v_q.id
  RETURNING * INTO v_q;
  RETURN public.mkt_quote_json(v_q);
END
$fn$;

-- The client confirmed the version last sent (the manager marks it): Accepted, the day logged against that version, and
-- Marketing's managers told — whoever marked it too (their bell keeps it until the work is assigned).
CREATE OR REPLACE FUNCTION public.mkt_quote_accept(p_id uuid, p_rev integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_q     public.mkt_quotes;
  v_last  public.mkt_quote_versions;
  v_by    text;
  v_who   text;
  v_total numeric;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Quotations are the manager''s.');
  SELECT * INTO v_q FROM public.mkt_quotes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That quotation is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  IF p_rev IS DISTINCT FROM v_q.rev THEN
    v_by := coalesce((SELECT u.name FROM public.users u WHERE u.id = v_q.updated_by), 'Somebody');
    RAISE EXCEPTION '% changed this quotation since you opened it — reload to see it.', v_by USING ERRCODE = '40001';
  END IF;
  IF v_q.status <> 'sent' THEN
    RAISE EXCEPTION 'Only a quotation sent to the client is accepted.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_last FROM public.mkt_quote_versions WHERE quote_id = v_q.id AND kind = 'sent' ORDER BY seq DESC LIMIT 1;
  IF public.mkt_quote_plain(v_last.snap) IS DISTINCT FROM public.mkt_quote_core(v_q) THEN
    RAISE EXCEPTION 'It changed since v% was sent — send the revision first.', v_last.rev USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.mkt_quote_versions (quote_id, seq, kind, rev, at, by_user)
  VALUES (v_q.id, (SELECT max(v.seq) FROM public.mkt_quote_versions v WHERE v.quote_id = v_q.id) + 1, 'accepted', v_last.rev, v_today, auth.uid());
  UPDATE public.mkt_quotes SET status = 'accepted', accepted_on = v_today, rev = rev + 1, updated_by = auth.uid(), updated_at = now()
   WHERE id = v_q.id
  RETURNING * INTO v_q;

  v_who := coalesce(nullif(v_last.snap ->> 'client', ''), 'The client');
  v_total := v_last.total;
  INSERT INTO public.app_notifications (user_id, kind, title, body, ref_kind, ref_id, data)
  SELECT u.id, 'marketing', left(v_who || ' accepted ' || v_q.no, 200),
         'RM ' || to_char(v_total, 'FM999,999,999,990.##'), 'mkt_quote', v_q.id::text,
         jsonb_build_object('type', 'accepted', 'no', v_q.no, 'total', v_total)
    FROM public.users u
   WHERE u.is_active
     AND (u.id = auth.uid()
          OR u.id IN (SELECT r.user_id FROM public.mkt_roster() r
                       WHERE r.user_id IS NOT NULL AND upper(coalesce(r.title, '')) LIKE '%MARKETING MANAGER%'));
  RETURN public.mkt_quote_json(v_q);
END
$fn$;

-- Its work assigned: each row a quick task for the client (one stage, the person picked) from its start to its due day.
-- p_rows: [{ name, from, team (Content · Design · Ads · Brand · Manager), who (a staff id on the roster), start, due,
-- days, eta }]. Once.
CREATE OR REPLACE FUNCTION public.mkt_quote_assign(p_id uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today  date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_uuid   text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_q      public.mkt_quotes;
  v_roster uuid[] := ARRAY(SELECT r.staff_id FROM public.mkt_roster() r);
  v_r      jsonb;
  v_out    jsonb := '[]'::jsonb;
  v_name   text;
  v_from   text;
  v_team   text;
  v_who    uuid;
  v_start  date;
  v_due    date;
  v_sla    integer;
  v_made   jsonb;
  v_n      integer := 0;
  v_hol    date[];
  d        date;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Quotations are the manager''s.');
  SELECT * INTO v_q FROM public.mkt_quotes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That quotation is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  IF v_q.status <> 'accepted' THEN
    RAISE EXCEPTION 'Its tasks are assigned once the client accepts.' USING ERRCODE = '22023';
  END IF;
  IF v_q.tasks IS NOT NULL THEN
    RAISE EXCEPTION 'Its tasks were assigned on %.', to_char(v_q.assigned_on, 'DD/MM/YYYY') USING ERRCODE = '22023';
  END IF;
  IF v_q.subsidiary_id IS NULL THEN
    RAISE EXCEPTION 'Add “%” as a client (+ Add subsidiary), pick it on this quotation, then assign its tasks.',
      coalesce(nullif(v_q.client_name, ''), 'the client') USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'Nothing to assign.' USING ERRCODE = '22023';
  END IF;
  v_hol := ARRAY(SELECT h.day FROM public.att_holidays h WHERE h.deleted_at IS NULL);
  FOR v_r IN SELECT x FROM jsonb_array_elements(p_rows) x LOOP
    v_n := v_n + 1;
    v_name := left(btrim(coalesce(v_r ->> 'name', '')), 140);
    v_from := left(btrim(coalesce(v_r ->> 'from', '')), 200);
    v_team := coalesce(v_r ->> 'team', 'Manager');
    IF v_name = '' THEN
      RAISE EXCEPTION 'Task %: its name.', v_n USING ERRCODE = '22023';
    END IF;
    IF coalesce(v_r ->> 'who', '') !~ v_uuid OR NOT ((v_r ->> 'who')::uuid = ANY (v_roster)) THEN
      RAISE EXCEPTION 'Pick someone for every task first' USING ERRCODE = '22023';
    END IF;
    v_who := (v_r ->> 'who')::uuid;
    v_start := public.mkt_day_of(v_r -> 'start', 'Task ' || v_n || ' start');
    v_due := public.mkt_day_of(v_r -> 'due', 'Task ' || v_n || ' due');
    IF v_start IS NULL OR v_due IS NULL OR v_due < v_start THEN
      RAISE EXCEPTION 'Task %: a due day on or after its start.', v_n USING ERRCODE = '22023';
    END IF;
    IF v_start < v_today - 7 OR v_due > v_today + 400 THEN
      RAISE EXCEPTION 'Task %: its days are out of range.', v_n USING ERRCODE = '22023';
    END IF;
    -- Its working days (Monday–Friday less the holidays), as a stage's SLA counts them — 1 to 30.
    v_sla := 0;
    d := v_start;
    WHILE d < v_due LOOP
      d := d + 1;
      IF extract(isodow FROM d) < 6 AND NOT (d = ANY (v_hol)) THEN
        v_sla := v_sla + 1;
      END IF;
    END LOOP;
    v_sla := least(30, greatest(1, v_sla));
    v_made := public.mkt_task_create(v_q.subsidiary_id, 'quick', v_name,
                CASE v_team WHEN 'Content' THEN 'content' WHEN 'Ads' THEN 'ads' WHEN 'Brand' THEN 'brand' WHEN 'Design' THEN 'social' ELSE 'other' END,
                concat_ws(E'\n', 'From quotation ' || v_q.no || CASE WHEN v_from <> '' THEN ' · ' || v_from ELSE '' END,
                          CASE WHEN public.mkt_day_of(v_r -> 'eta', 'eta') IS NOT NULL
                               THEN 'Quoted delivery ' || to_char(public.mkt_day_of(v_r -> 'eta', 'eta'), 'DD/MM/YYYY') END),
                jsonb_build_array(jsonb_build_object('name', left(v_name, 80), 'who', v_who, 'sla', v_sla, 'appr', '[]'::jsonb, 'form', '[]'::jsonb)));
    -- Its days as picked here, not counted from today.
    UPDATE public.mkt_stages SET starts_on = v_start, due_on = v_due WHERE project_id = (v_made ->> 'id')::uuid;
    UPDATE public.mkt_projects SET starts_on = v_start, due_on = v_due WHERE id = (v_made ->> 'id')::uuid;
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'name', v_name, 'from', v_from, 'team', v_team, 'who', v_who, 'start', v_start, 'due', v_due,
      'days', CASE WHEN coalesce(v_r ->> 'days', '') ~ '^[0-9]{1,3}$' THEN (v_r ->> 'days')::integer END,
      'eta', public.mkt_day_of(v_r -> 'eta', 'eta'), 'project', v_made ->> 'id', 'track', v_made ->> 'track')));
  END LOOP;
  UPDATE public.mkt_quotes SET tasks = v_out, assigned_on = v_today, assigned_by = auth.uid(), rev = rev + 1,
         updated_by = auth.uid(), updated_at = now()
   WHERE id = v_q.id
  RETURNING * INTO v_q;
  -- The bell's notices of it are read: their work is assigned.
  UPDATE public.app_notifications SET read_at = coalesce(read_at, now())
   WHERE ref_kind = 'mkt_quote' AND ref_id = v_q.id::text AND user_id = auth.uid();
  RETURN public.mkt_quote_json(v_q);
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_quote_duplicate(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_from public.mkt_quotes;
  v_new  jsonb;
  v_q    public.mkt_quotes;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Quotations are the manager''s.');
  SELECT * INTO v_from FROM public.mkt_quotes WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That quotation is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  v_new := public.mkt_quote_save(NULL, NULL, '{}'::jsonb);
  UPDATE public.mkt_quotes
     SET subsidiary_id = v_from.subsidiary_id, other = v_from.other, client_name = v_from.client_name, contact = v_from.contact,
         valid_days = v_from.valid_days, discount = v_from.discount, note = v_from.note,
         lines = (SELECT coalesce(jsonb_agg(jsonb_set(l, '{key}', to_jsonb('l' || substr(md5(random()::text || o::text), 1, 12))) ORDER BY o), '[]'::jsonb)
                    FROM jsonb_array_elements(v_from.lines) WITH ORDINALITY x(l, o))
   WHERE id = (v_new ->> 'id')::uuid
  RETURNING * INTO v_q;
  RETURN public.mkt_quote_json(v_q);
END
$fn$;

-- The bell's question about its quotation notices: is each one's work assigned yet (and how many tasks).
CREATE OR REPLACE FUNCTION public.mkt_quote_states(p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT coalesce(public.has_any_action(ARRAY['marketing.manage']), false) OR auth.uid() IS NULL THEN
    RETURN '{}'::jsonb;  -- nobody else's notices point at a quotation
  END IF;
  RETURN coalesce((SELECT jsonb_object_agg(q.id, jsonb_build_object('status', q.status,
                            'tasks', CASE WHEN q.tasks IS NULL THEN NULL ELSE jsonb_array_length(q.tasks) END))
                     FROM public.mkt_quotes q WHERE q.id = ANY (coalesce(p_ids, '{}'))), '{}'::jsonb);
END
$fn$;

-- ── Products: duplicated, and their status from the right-click menu ─────────
CREATE OR REPLACE FUNCTION public.mkt_product_duplicate(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p   public.mkt_products;
  v_new jsonb;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Product Builder is the manager''s.');
  SELECT * INTO v_p FROM public.mkt_products WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That product is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  v_new := public.mkt_product_save(NULL, NULL, jsonb_build_object(
    'name', left(CASE WHEN v_p.name = '' THEN '' ELSE v_p.name || ' (copy)' END, 80), 'description', v_p.description,
    'kind', v_p.kind, 'groups', v_p.groups, 'intake', v_p.intake_id, 'price', v_p.price, 'cost', v_p.cost));
  -- Its revenue account goes with it (Finance's import posts there).
  UPDATE public.mkt_products SET revenue_account = v_p.revenue_account WHERE id = (v_new ->> 'id')::uuid;
  RETURN v_new;
END
$fn$;

-- Active (on sale — only a product published), Draft (hidden from new projects and quotations while it is worked on),
-- Retired (no new projects; those running keep their version). Running projects never move.
CREATE OR REPLACE FUNCTION public.mkt_product_set_status(p_id uuid, p_to text)
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
  IF p_to IS NULL OR p_to NOT IN ('active', 'draft', 'retired') THEN
    RAISE EXCEPTION 'Active, Draft or Retired.' USING ERRCODE = '22023';
  END IF;
  IF p_to <> v_p.status THEN
    IF p_to = 'active' AND v_p.version = 0 THEN
      RAISE EXCEPTION 'Please publish % before making it active.', coalesce(nullif(v_p.name, ''), 'this product') USING ERRCODE = '22023';
    END IF;
    IF p_to = 'retired' AND v_p.version = 0 THEN
      RAISE EXCEPTION 'A product never published is not retired — delete the draft instead.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.mkt_products
       SET status = p_to, retired_on = CASE WHEN p_to = 'retired' THEN (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date END,
           updated_by = auth.uid(), updated_at = now()
     WHERE id = p_id
    RETURNING * INTO v_p;
    PERFORM public.mkt_top_up_due();
  END IF;
  RETURN jsonb_build_object('id', v_p.id, 'status', v_p.status, 'retiredOn', v_p.retired_on, 'version', v_p.version,
    'live', (SELECT count(*) FROM public.mkt_projects x WHERE x.product_id = v_p.id AND x.status NOT IN ('done', 'cancelled')));
END
$fn$;

-- ── Grants ──────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.mkt_quote_book() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_item_column_save(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_item_column_delete(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_item_columns_order(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_item_save(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_item_delete(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_catalogue_rename(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_quote_save(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_quote_send(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_quote_accept(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_quote_assign(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_quote_duplicate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_quote_states(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_product_duplicate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_product_set_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_quote_book() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_item_column_save(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_item_column_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_item_columns_order(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_item_save(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_item_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_catalogue_rename(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_quote_save(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_quote_send(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_quote_accept(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_quote_assign(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_quote_duplicate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_quote_states(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_product_duplicate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_product_set_status(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
