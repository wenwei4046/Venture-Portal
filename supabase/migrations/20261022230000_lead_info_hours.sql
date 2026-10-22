-- Lead View › General info and Business hours (2026-10-22, the redesign v2 handoff `Basic Info.dc.html`,
-- `Business Hours.dc.html` — the user: "照 claude design 最新版本"; step 3 of the redesign).
--
-- General info: cards per showroom or topic (Showrooms, Payment methods, Delivery, Warranty and returns, and
-- categories CS adds), each a brand's or every brand's, with fields (a showroom's Address, Opening hours, Phone,
-- Google Maps, Waze; a topic's own label · value rows), a note, Draft / In use / Off and an optional date range.
-- Each field is a token `{code.field}` (lib/leads/info.ts) that the reply templates will resolve at send (step 4);
-- the Inbox's General info menu inserts its value. The page saves as a whole (Save / Discard), so the writer takes
-- the whole list.
--
-- Business hours: one week for every page (Kuala Lumpur time) and special dates that replace it (closed all day or
-- other hours). `lead_hours_open(at)` answers "open now?" for the reply rules to come (step 4); today's away flows
-- keep their own hours until then.
--
-- Each page is a tab of its own (lead.info, lead.hours: View, and Edit = Lead View · Manage), added to the registry
-- by name. Tables: RLS on, no policy, no grant — only these functions read and write them, as every lead table.

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lead_info_cats (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- showroom = the fixed category whose cards carry the five shop fields.
  kind        text NOT NULL DEFAULT 'topic' CHECK (kind IN ('showroom', 'topic')),
  label       text NOT NULL CHECK (btrim(label) <> '' AND length(label) <= 60),
  icon        text NOT NULL DEFAULT 'file-text' CHECK (icon ~ '^[a-z-]{1,30}$'),
  -- A category CS added may be deleted; the four seeded may not.
  custom      boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE TABLE IF NOT EXISTS public.lead_info_cards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cat_id          uuid NOT NULL REFERENCES public.lead_info_cats(id),
  -- NULL = every brand.
  brand_id        uuid REFERENCES public.lead_brands(id),
  name            text NOT NULL DEFAULT '' CHECK (length(name) <= 120),
  -- The token's first half: {kl.address}.
  code            text NOT NULL CHECK (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(code) <= 40),
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'on', 'off')),
  valid_from      date,
  valid_until     date,
  note            text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  -- [{ "key": "address" (a showroom's fixed field) | null, "label": "Address", "value": "…" }]
  fields          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(fields) = 'array' AND jsonb_array_length(fields) <= 30),
  -- Where it is used (the handoff's USED BY chips), as written: "AI Agent · 2990s", "Inbox · CS replies".
  uses            text[] NOT NULL DEFAULT '{}' CHECK (cardinality(uses) <= 20),
  sort_order      integer NOT NULL DEFAULT 0,
  updated_by_name text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT lead_info_cards_range CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_from <= valid_until)
);
CREATE UNIQUE INDEX IF NOT EXISTS lead_info_cards_code ON public.lead_info_cards (code) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.lead_business_hours (
  id              smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- [{ "day": 1..7 (Monday = 1), "on": true, "from": "10:00", "to": "22:00" }] — seven, Monday first.
  week            jsonb NOT NULL,
  -- [{ "id": "…", "name": "Deepavali", "from": "2026-11-08", "to": "2026-11-08", "mode": "closed" | "custom", "open": "10:00", "close": "18:00" }]
  specials        jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by_name text NOT NULL DEFAULT '',
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_info_cats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_info_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_business_hours ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_info_cats, public.lead_info_cards, public.lead_business_hours FROM anon, authenticated;

SELECT public.audit_register('lead_info_cats', 'Lead View General info categories', 'Member services', '{leads}', 'all', p_labels => '{label}');
SELECT public.audit_register('lead_info_cards', 'Lead View General info', 'Member services', '{leads}', 'all', p_labels => '{name}');
SELECT public.audit_register('lead_business_hours', 'Lead View business hours', 'Member services', '{leads}', 'all');

-- The four categories the handoff starts with, and its default week (Monday to Friday, 10am to 10pm).
INSERT INTO public.lead_info_cats (kind, label, icon, custom, sort_order)
SELECT v.kind, v.label, v.icon, false, v.ord
  FROM (VALUES ('showroom', 'Showrooms', 'store', 1), ('topic', 'Payment methods', 'credit-card', 2),
               ('topic', 'Delivery', 'truck', 3), ('topic', 'Warranty and returns', 'shield-check', 4)) AS v(kind, label, icon, ord)
 WHERE NOT EXISTS (SELECT 1 FROM public.lead_info_cats c WHERE c.label = v.label AND c.deleted_at IS NULL);

INSERT INTO public.lead_business_hours (id, week)
VALUES (1, '[{"day":1,"on":true,"from":"10:00","to":"22:00"},{"day":2,"on":true,"from":"10:00","to":"22:00"},
             {"day":3,"on":true,"from":"10:00","to":"22:00"},{"day":4,"on":true,"from":"10:00","to":"22:00"},
             {"day":5,"on":true,"from":"10:00","to":"22:00"},{"day":6,"on":false,"from":"10:00","to":"22:00"},
             {"day":7,"on":false,"from":"10:00","to":"22:00"}]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ── General info ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.lead_info()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN jsonb_build_object(
    'cats', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'label', c.label, 'icon', c.icon, 'custom', c.custom)
                        ORDER BY c.sort_order, c.created_at) FROM public.lead_info_cats c WHERE c.deleted_at IS NULL), '[]'::jsonb),
    'cards', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'catId', x.cat_id, 'brandId', x.brand_id, 'name', x.name,
                        'code', x.code, 'status', x.status, 'validFrom', x.valid_from, 'validUntil', x.valid_until, 'note', x.note,
                        'fields', x.fields, 'uses', to_jsonb(x.uses), 'updatedByName', x.updated_by_name, 'updatedAt', x.updated_at)
                        ORDER BY x.sort_order, x.created_at) FROM public.lead_info_cards x WHERE x.deleted_at IS NULL), '[]'::jsonb));
END
$fn$;

-- The page's Save: every category and every card as it stands. A card left out is deleted; a category CS added
-- and left out goes with its cards. A new one comes without an id. Codes stay unique; a blank code is the name's.
CREATE OR REPLACE FUNCTION public.lead_save_info(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_actor text;
  r jsonb;
  f jsonb;
  v_cat uuid;
  v_id uuid;
  v_code text;
  v_fields jsonb;
  v_keep_cats uuid[] := '{}';
  v_keep_cards uuid[] := '{}';
  v_ord integer := 0;
  v_from date;
  v_until date;
  v_brand uuid;
  v_codes text[] := '{}';
  v_rows jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'General info needs Lead View · Manage.');
  v_actor := public.lead_actor_name();
  IF jsonb_typeof(p_data->'cats') <> 'array' OR jsonb_typeof(p_data->'cards') <> 'array'
     OR jsonb_array_length(p_data->'cats') > 40 OR jsonb_array_length(p_data->'cards') > 500 THEN
    RAISE EXCEPTION 'General info is not in the right shape.' USING ERRCODE = '22023';
  END IF;

  -- Categories: the seeded ones stay whatever comes; CS's are kept, renamed, added or deleted.
  FOR r IN SELECT * FROM jsonb_array_elements(p_data->'cats') LOOP
    v_ord := v_ord + 1;
    IF btrim(coalesce(r->>'label', '')) = '' THEN
      RAISE EXCEPTION 'A category needs a name.' USING ERRCODE = '22023';
    END IF;
    v_id := CASE WHEN r->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (r->>'id')::uuid END;
    IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.lead_info_cats WHERE id = v_id AND deleted_at IS NULL) THEN
      UPDATE public.lead_info_cats SET label = CASE WHEN custom THEN left(btrim(r->>'label'), 60) ELSE label END, sort_order = v_ord
       WHERE id = v_id;
    ELSE
      INSERT INTO public.lead_info_cats (label, icon, custom, sort_order) VALUES (left(btrim(r->>'label'), 60), 'file-text', true, v_ord)
      RETURNING id INTO v_id;
      -- The page names a new category's cards by the id it gave it; map it.
      p_data := jsonb_set(p_data, '{cards}', coalesce((SELECT jsonb_agg(CASE WHEN c->>'catId' = r->>'id' THEN jsonb_set(c, '{catId}', to_jsonb(v_id::text)) ELSE c END)
        FROM jsonb_array_elements(p_data->'cards') c), '[]'::jsonb));
    END IF;
    v_keep_cats := v_keep_cats || v_id;
  END LOOP;

  -- Cards.
  v_ord := 0;
  FOR r IN SELECT * FROM jsonb_array_elements(p_data->'cards') LOOP
    v_ord := v_ord + 1;
    v_cat := CASE WHEN r->>'catId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (r->>'catId')::uuid END;
    IF v_cat IS NULL OR NOT EXISTS (SELECT 1 FROM public.lead_info_cats WHERE id = v_cat AND deleted_at IS NULL) OR NOT v_cat = ANY (v_keep_cats || ARRAY(SELECT id FROM public.lead_info_cats WHERE NOT custom)) THEN
      RAISE EXCEPTION 'A card is in a category that is not there.' USING ERRCODE = '22023';
    END IF;
    IF NULLIF(r->>'brandId', '') IS NOT NULL AND r->>'brandId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'A card names a brand that is not there.' USING ERRCODE = '22023';
    END IF;
    v_brand := CASE WHEN r->>'brandId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (r->>'brandId')::uuid END;
    IF v_brand IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lead_brands WHERE id = v_brand AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'A card names a brand that is not there.' USING ERRCODE = '22023';
    END IF;
    v_code := trim(both '-' FROM regexp_replace(lower(coalesce(NULLIF(btrim(r->>'code'), ''), r->>'name', '')), '[^a-z0-9]+', '-', 'g'));
    IF v_code = '' THEN
      RAISE EXCEPTION 'Every card needs a name or a code (letters and digits) — it is how its fields are inserted.' USING ERRCODE = '22023';
    END IF;
    IF v_code = ANY (v_codes) THEN
      RAISE EXCEPTION 'Two cards use the code "%". Give one another.', v_code USING ERRCODE = '22023';
    END IF;
    v_codes := v_codes || v_code;
    v_from := NULLIF(r->>'validFrom', '')::date;
    v_until := NULLIF(r->>'validUntil', '')::date;
    IF v_from IS NOT NULL AND v_until IS NOT NULL AND v_from > v_until THEN
      RAISE EXCEPTION 'A card ends before it starts.' USING ERRCODE = '22023';
    END IF;
    IF coalesce(r->>'status', '') NOT IN ('draft', 'on', 'off') THEN
      RAISE EXCEPTION 'A card is Draft, In use or Off.' USING ERRCODE = '22023';
    END IF;
    -- Fields: label and value, a showroom's fixed key kept.
    v_fields := '[]'::jsonb;
    FOR f IN SELECT * FROM jsonb_array_elements(coalesce(r->'fields', '[]'::jsonb)) LOOP
      v_fields := v_fields || jsonb_build_array(jsonb_build_object(
        'key', CASE WHEN f->>'key' IN ('address', 'hours', 'phone', 'maps', 'waze') THEN f->>'key' END,
        'label', left(btrim(coalesce(f->>'label', '')), 60), 'value', left(btrim(coalesce(f->>'value', '')), 1000)));
    END LOOP;
    v_id := CASE WHEN r->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (r->>'id')::uuid END;
    IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.lead_info_cards WHERE id = v_id AND deleted_at IS NULL) THEN
      -- Freed first, so two cards may swap codes in one save.
      UPDATE public.lead_info_cards SET code = 'x-' || replace(id::text, '-', '') WHERE id = v_id AND code <> v_code;
    ELSE
      v_id := NULL;
    END IF;
    v_keep_cards := v_keep_cards || coalesce(v_id, '00000000-0000-0000-0000-000000000000'::uuid);
    r := jsonb_build_object('id', v_id, 'cat', v_cat, 'brand', v_brand, 'name', left(btrim(coalesce(r->>'name', '')), 120), 'code', v_code,
      'status', r->>'status', 'from', v_from, 'until', v_until, 'note', left(coalesce(r->>'note', ''), 2000), 'fields', v_fields,
      'uses', coalesce((SELECT jsonb_agg(DISTINCT left(btrim(u), 80)) FROM jsonb_array_elements_text(coalesce(r->'uses', '[]'::jsonb)) u WHERE btrim(u) <> ''), '[]'::jsonb),
      'ord', v_ord);
    v_rows := v_rows || jsonb_build_array(r);
  END LOOP;

  -- What is gone: cards left out, then CS's categories left out (with whatever cards were still in them).
  UPDATE public.lead_info_cards SET deleted_at = now(), updated_by_name = v_actor
   WHERE deleted_at IS NULL AND NOT id = ANY (v_keep_cards);
  UPDATE public.lead_info_cards SET deleted_at = now(), updated_by_name = v_actor
   WHERE deleted_at IS NULL AND cat_id IN (SELECT id FROM public.lead_info_cats WHERE custom AND NOT id = ANY (v_keep_cats));
  UPDATE public.lead_info_cats SET deleted_at = now() WHERE custom AND deleted_at IS NULL AND NOT id = ANY (v_keep_cats);

  -- Then what stays, each written only when it changed (the audit keeps one line a change).
  FOR r IN SELECT * FROM jsonb_array_elements(v_rows) LOOP
    IF r->>'id' IS NULL THEN
      INSERT INTO public.lead_info_cards (cat_id, brand_id, name, code, status, valid_from, valid_until, note, fields, uses, sort_order, updated_by_name)
      VALUES ((r->>'cat')::uuid, (r->>'brand')::uuid, r->>'name', r->>'code', r->>'status', (r->>'from')::date, (r->>'until')::date,
              r->>'note', r->'fields', ARRAY(SELECT jsonb_array_elements_text(r->'uses')), (r->>'ord')::integer, v_actor);
    ELSE
      UPDATE public.lead_info_cards x SET cat_id = (r->>'cat')::uuid, brand_id = (r->>'brand')::uuid, name = r->>'name', code = r->>'code',
             status = r->>'status', valid_from = (r->>'from')::date, valid_until = (r->>'until')::date, note = r->>'note',
             fields = r->'fields', uses = ARRAY(SELECT jsonb_array_elements_text(r->'uses')), sort_order = (r->>'ord')::integer,
             updated_by_name = v_actor, updated_at = now()
       WHERE x.id = (r->>'id')::uuid
         AND (x.cat_id, x.brand_id, x.name, x.code, x.status, x.valid_from, x.valid_until, x.note, x.fields, x.uses, x.sort_order)
             IS DISTINCT FROM ((r->>'cat')::uuid, (r->>'brand')::uuid, r->>'name', r->>'code', r->>'status', (r->>'from')::date,
                               (r->>'until')::date, r->>'note', r->'fields', ARRAY(SELECT jsonb_array_elements_text(r->'uses')), (r->>'ord')::integer);
    END IF;
  END LOOP;
  RETURN public.lead_info();
END
$fn$;

-- ── Business hours ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.lead_business_hours()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN (SELECT jsonb_build_object('week', h.week, 'specials', h.specials, 'updatedByName', h.updated_by_name, 'updatedAt', h.updated_at)
            FROM public.lead_business_hours h WHERE h.id = 1);
END
$fn$;

-- The week (seven days, Monday first; a time is HH:MM on the half hour, "to" 00:00 = midnight) and the special dates.
CREATE OR REPLACE FUNCTION public.lead_save_hours(p_week jsonb, p_specials jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  d jsonb;
  s jsonb;
  v_week jsonb := '[]'::jsonb;
  v_specials jsonb := '[]'::jsonb;
  v_i integer := 0;
  v_t constant text := '^([01][0-9]|2[0-3]):(00|30)$';
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Business hours need Lead View · Manage.');
  IF jsonb_typeof(p_week) <> 'array' OR jsonb_array_length(p_week) <> 7 OR jsonb_typeof(p_specials) <> 'array' OR jsonb_array_length(p_specials) > 200 THEN
    RAISE EXCEPTION 'The hours are not in the right shape.' USING ERRCODE = '22023';
  END IF;
  FOR d IN SELECT * FROM jsonb_array_elements(p_week) LOOP
    v_i := v_i + 1;
    IF coalesce(d->>'from', '') !~ v_t OR coalesce(d->>'to', '') !~ v_t THEN
      RAISE EXCEPTION 'A time is on the hour or the half hour.' USING ERRCODE = '22023';
    END IF;
    IF (d->>'on')::boolean AND d->>'to' <> '00:00' AND d->>'to' <= d->>'from' THEN
      RAISE EXCEPTION 'A day closes after it opens.' USING ERRCODE = '22023';
    END IF;
    v_week := v_week || jsonb_build_array(jsonb_build_object('day', v_i, 'on', coalesce((d->>'on')::boolean, false), 'from', d->>'from', 'to', d->>'to'));
  END LOOP;
  FOR s IN SELECT * FROM jsonb_array_elements(p_specials) LOOP
    IF coalesce(s->>'from', '') !~ '^\d{4}-\d{2}-\d{2}$' OR coalesce(s->>'to', '') !~ '^\d{4}-\d{2}-\d{2}$' OR (s->>'from')::date > (s->>'to')::date THEN
      RAISE EXCEPTION 'A special date runs from a day to the same day or later.' USING ERRCODE = '22023';
    END IF;
    IF coalesce(s->>'mode', '') NOT IN ('closed', 'custom') OR coalesce(s->>'open', '') !~ v_t OR coalesce(s->>'close', '') !~ v_t THEN
      RAISE EXCEPTION 'A special date is closed all day or open on the half hour.' USING ERRCODE = '22023';
    END IF;
    IF s->>'mode' = 'custom' AND s->>'close' <> '00:00' AND s->>'close' <= s->>'open' THEN
      RAISE EXCEPTION 'A special date closes after it opens.' USING ERRCODE = '22023';
    END IF;
    v_specials := v_specials || jsonb_build_array(jsonb_build_object('id', left(coalesce(NULLIF(s->>'id', ''), gen_random_uuid()::text), 40),
      'name', left(btrim(coalesce(s->>'name', '')), 80), 'from', s->>'from', 'to', s->>'to', 'mode', s->>'mode', 'open', s->>'open', 'close', s->>'close'));
  END LOOP;
  UPDATE public.lead_business_hours SET week = v_week,
         specials = coalesce((SELECT jsonb_agg(x ORDER BY x->>'from', x->>'to') FROM jsonb_array_elements(v_specials) x), '[]'::jsonb),
         updated_by_name = public.lead_actor_name(), updated_at = now()
   WHERE id = 1 AND (week, specials) IS DISTINCT FROM (v_week, coalesce((SELECT jsonb_agg(x ORDER BY x->>'from', x->>'to') FROM jsonb_array_elements(v_specials) x), '[]'::jsonb));
END
$fn$;

-- Open at this instant (Kuala Lumpur)? A special date covering the day decides; else the week. For the reply rules.
CREATE OR REPLACE FUNCTION public.lead_hours_open(p_at timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  h public.lead_business_hours;
  v_local timestamp := p_at AT TIME ZONE 'Asia/Kuala_Lumpur';
  v_day date := v_local::date;
  v_time text := to_char(v_local, 'HH24:MI');
  s jsonb;
  d jsonb;
BEGIN
  SELECT * INTO h FROM public.lead_business_hours WHERE id = 1;
  IF NOT FOUND THEN
    RETURN true;
  END IF;
  SELECT x INTO s FROM jsonb_array_elements(h.specials) x WHERE v_day BETWEEN (x->>'from')::date AND (x->>'to')::date ORDER BY x->>'from' DESC LIMIT 1;
  IF s IS NOT NULL THEN
    RETURN s->>'mode' = 'custom' AND v_time >= s->>'open' AND (s->>'close' = '00:00' OR v_time < s->>'close');
  END IF;
  SELECT x INTO d FROM jsonb_array_elements(h.week) x WHERE (x->>'day')::integer = extract(isodow FROM v_day)::integer;
  RETURN coalesce((d->>'on')::boolean, false) AND v_time >= d->>'from' AND (d->>'to' = '00:00' OR v_time < d->>'to');
END
$fn$;

REVOKE ALL ON FUNCTION public.lead_info() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_save_info(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_business_hours() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_save_hours(jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_hours_open(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_info() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_save_info(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_business_hours() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_save_hours(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_hours_open(timestamptz) TO service_role;

-- ── The two tabs, by name ────────────────────────────────────────────────────

INSERT INTO public.permission_page_tabs (page, tab_id) VALUES
  ('/leads/info', 'lead.info'),
  ('/leads/hours', 'lead.hours')
ON CONFLICT DO NOTHING;

INSERT INTO public.permission_tab_cells (tab_id, action, cell) VALUES
  ('lead.info', 'view', 'leads.view'),
  ('lead.info', 'edit', 'leads.manage'),
  ('lead.hours', 'view', 'leads.view'),
  ('lead.hours', 'edit', 'leads.manage')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
