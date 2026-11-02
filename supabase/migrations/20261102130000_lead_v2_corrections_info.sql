-- Lead View v2 › AI corrections and General info (2026-11-02, the v2 handoff `docs/design_handoff_lead_view_v2` §7.9,
-- §7.11 — the user: "完全跟claude design 画的").
--
-- 1. AI corrections: a correction is To review, Saved (a fixed answer was made from it — already known) or **Dismissed**:
--    `lead_ai_drafts.dismissed_at` / `dismissed_by_name`, set and cleared by `lead_ai_dismiss` (Lead View · Manage, the
--    page's guard in the _guards file), read by `lead_ai_dismissed()`.
-- 2. General info:
--    - a card is for **one or more brands** (the handoff's Brand * multi-select): `lead_info_cards.brand_ids`; empty = every
--      brand, as `brand_id` NULL was. `brand_id` stays the single brand when there is exactly one (older readers);
--    - a category keeps **its icon** (the handoff's 6 × N picker): the save takes `icon` from Lucide's names the page offers;
--    - a detail has a **type** (Text · Number · Date · Time · Phone · Link): `fields[].type`.
--    lead_info and lead_save_info are replaced from PRODUCTION's bodies (md5 below) with those three changes.

DO $guard$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.lead_info()'::regprocedure) <> '8d45c4ab8c9101ddb9a1f044132b355a' THEN
    RAISE EXCEPTION 'lead_info is not the body this migration was written from';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.lead_save_info(jsonb)'::regprocedure) <> '8958b0b63084b31b06f965ea30777f9b' THEN
    RAISE EXCEPTION 'lead_save_info is not the body this migration was written from';
  END IF;
END
$guard$;

-- ── AI corrections: Dismissed ──

ALTER TABLE public.lead_ai_drafts
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dismissed_by_name text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.lead_ai_dismissed()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN coalesce((SELECT jsonb_agg(d.id ORDER BY d.id) FROM public.lead_ai_drafts d WHERE d.dismissed_at IS NOT NULL), '[]'::jsonb);
END
$fn$;

-- Dismiss a correction (p_on) or move it back to review.
CREATE OR REPLACE FUNCTION public.lead_ai_dismiss(p_draft bigint, p_on boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'AI corrections need Lead View · Manage.');
  UPDATE public.lead_ai_drafts
     SET dismissed_at = CASE WHEN p_on THEN coalesce(dismissed_at, now()) END,
         dismissed_by_name = CASE WHEN p_on THEN public.lead_actor_name() ELSE '' END
   WHERE id = p_draft AND outcome = 'edited';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That correction is gone.' USING ERRCODE = 'P0002';
  END IF;
END
$fn$;

REVOKE ALL ON FUNCTION public.lead_ai_dismissed() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_ai_dismiss(bigint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_ai_dismissed() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_ai_dismiss(bigint, boolean) TO authenticated;

-- ── General info: brands, icons, field types ──

ALTER TABLE public.lead_info_cards ADD COLUMN IF NOT EXISTS brand_ids uuid[] NOT NULL DEFAULT '{}';
UPDATE public.lead_info_cards SET brand_ids = ARRAY[brand_id] WHERE brand_id IS NOT NULL AND brand_ids = '{}';

CREATE OR REPLACE FUNCTION public.lead_info()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN jsonb_build_object(
    'cats', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'label', c.label, 'icon', c.icon, 'custom', c.custom)
                        ORDER BY c.sort_order, c.created_at) FROM public.lead_info_cats c WHERE c.deleted_at IS NULL), '[]'::jsonb),
    'cards', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'catId', x.cat_id, 'brandId', x.brand_id, 'brandIds', to_jsonb(x.brand_ids), 'name', x.name,
                        'code', x.code, 'status', x.status, 'validFrom', x.valid_from, 'validUntil', x.valid_until, 'note', x.note,
                        'fields', x.fields, 'uses', to_jsonb(x.uses), 'updatedByName', x.updated_by_name, 'updatedAt', x.updated_at)
                        ORDER BY x.sort_order, x.created_at) FROM public.lead_info_cards x WHERE x.deleted_at IS NULL), '[]'::jsonb));
END
$function$;

CREATE OR REPLACE FUNCTION public.lead_save_info(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_brands uuid[];
  v_icon text;
  v_codes text[] := '{}';
  v_rows jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'General info needs Lead View · Manage.');
  PERFORM public.tab_write_guard(ARRAY['/leads/info'], ARRAY['leads.manage']);
  v_actor := public.lead_actor_name();
  IF jsonb_typeof(p_data->'cats') <> 'array' OR jsonb_typeof(p_data->'cards') <> 'array'
     OR jsonb_array_length(p_data->'cats') > 40 OR jsonb_array_length(p_data->'cards') > 500 THEN
    RAISE EXCEPTION 'General info is not in the right shape.' USING ERRCODE = '22023';
  END IF;

  -- Categories: kept, renamed, re-iconed, added or deleted.
  FOR r IN SELECT * FROM jsonb_array_elements(p_data->'cats') LOOP
    v_ord := v_ord + 1;
    IF btrim(coalesce(r->>'label', '')) = '' THEN
      RAISE EXCEPTION 'A category needs a name.' USING ERRCODE = '22023';
    END IF;
    v_icon := CASE WHEN coalesce(r->>'icon', '') ~ '^[a-z0-9-]{2,40}$' THEN r->>'icon' END;
    v_id := CASE WHEN r->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (r->>'id')::uuid END;
    IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.lead_info_cats WHERE id = v_id AND deleted_at IS NULL) THEN
      UPDATE public.lead_info_cats SET label = left(btrim(r->>'label'), 60), icon = coalesce(v_icon, icon), sort_order = v_ord
       WHERE id = v_id AND (label, icon, sort_order) IS DISTINCT FROM (left(btrim(r->>'label'), 60), coalesce(v_icon, icon), v_ord);
    ELSE
      INSERT INTO public.lead_info_cats (label, icon, custom, sort_order) VALUES (left(btrim(r->>'label'), 60), coalesce(v_icon, 'folder'), true, v_ord)
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
    IF v_cat IS NULL OR NOT EXISTS (SELECT 1 FROM public.lead_info_cats WHERE id = v_cat AND deleted_at IS NULL) OR NOT v_cat = ANY (v_keep_cats) THEN
      RAISE EXCEPTION 'A card is in a category that is not there.' USING ERRCODE = '22023';
    END IF;
    -- Its brands: brandIds (the page's), else the one brandId (an older page); empty = every brand.
    IF jsonb_typeof(r->'brandIds') = 'array' THEN
      IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(r->'brandIds') b WHERE b !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
        RAISE EXCEPTION 'A card names a brand that is not there.' USING ERRCODE = '22023';
      END IF;
      v_brands := ARRAY(SELECT DISTINCT b::uuid FROM jsonb_array_elements_text(r->'brandIds') b ORDER BY 1);
    ELSIF NULLIF(r->>'brandId', '') IS NOT NULL THEN
      IF r->>'brandId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'A card names a brand that is not there.' USING ERRCODE = '22023';
      END IF;
      v_brands := ARRAY[(r->>'brandId')::uuid];
    ELSE
      v_brands := '{}';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_brands) b WHERE NOT EXISTS (SELECT 1 FROM public.lead_brands WHERE id = b AND deleted_at IS NULL)) THEN
      RAISE EXCEPTION 'A card names a brand that is not there.' USING ERRCODE = '22023';
    END IF;
    v_brand := CASE WHEN cardinality(v_brands) = 1 THEN v_brands[1] END;
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
    -- Fields: label, value and its type; a showroom's fixed key kept.
    v_fields := '[]'::jsonb;
    FOR f IN SELECT * FROM jsonb_array_elements(coalesce(r->'fields', '[]'::jsonb)) LOOP
      v_fields := v_fields || jsonb_build_array(jsonb_build_object(
        'key', CASE WHEN f->>'key' IN ('address', 'hours', 'phone', 'maps', 'waze') THEN f->>'key' END,
        'label', left(btrim(coalesce(f->>'label', '')), 60), 'value', left(btrim(coalesce(f->>'value', '')), 1000),
        'type', CASE WHEN f->>'type' IN ('number', 'date', 'time', 'tel', 'url') THEN f->>'type' ELSE 'text' END));
    END LOOP;
    v_id := CASE WHEN r->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (r->>'id')::uuid END;
    IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.lead_info_cards WHERE id = v_id AND deleted_at IS NULL) THEN
      -- Freed first, so two cards may swap codes in one save.
      UPDATE public.lead_info_cards SET code = 'x-' || replace(id::text, '-', '') WHERE id = v_id AND code <> v_code;
    ELSE
      v_id := NULL;
    END IF;
    v_keep_cards := v_keep_cards || coalesce(v_id, '00000000-0000-0000-0000-000000000000'::uuid);
    r := jsonb_build_object('id', v_id, 'cat', v_cat, 'brand', v_brand, 'brands', to_jsonb(v_brands), 'name', left(btrim(coalesce(r->>'name', '')), 120), 'code', v_code,
      'status', r->>'status', 'from', v_from, 'until', v_until, 'note', left(coalesce(r->>'note', ''), 2000), 'fields', v_fields,
      'uses', coalesce((SELECT jsonb_agg(DISTINCT left(btrim(u), 80)) FROM jsonb_array_elements_text(coalesce(r->'uses', '[]'::jsonb)) u WHERE btrim(u) <> ''), '[]'::jsonb),
      'ord', v_ord);
    v_rows := v_rows || jsonb_build_array(r);
  END LOOP;

  -- What is gone: cards left out, then categories left out (with whatever cards were still in them).
  UPDATE public.lead_info_cards SET deleted_at = now(), updated_by_name = v_actor
   WHERE deleted_at IS NULL AND NOT id = ANY (v_keep_cards);
  UPDATE public.lead_info_cards SET deleted_at = now(), updated_by_name = v_actor
   WHERE deleted_at IS NULL AND cat_id IN (SELECT id FROM public.lead_info_cats WHERE NOT id = ANY (v_keep_cats));
  UPDATE public.lead_info_cats SET deleted_at = now() WHERE deleted_at IS NULL AND NOT id = ANY (v_keep_cats);

  -- Then what stays, each written only when it changed (the audit keeps one line a change).
  FOR r IN SELECT * FROM jsonb_array_elements(v_rows) LOOP
    IF r->>'id' IS NULL THEN
      INSERT INTO public.lead_info_cards (cat_id, brand_id, brand_ids, name, code, status, valid_from, valid_until, note, fields, uses, sort_order, updated_by_name)
      VALUES ((r->>'cat')::uuid, (r->>'brand')::uuid, ARRAY(SELECT jsonb_array_elements_text(r->'brands'))::uuid[], r->>'name', r->>'code', r->>'status', (r->>'from')::date, (r->>'until')::date,
              r->>'note', r->'fields', ARRAY(SELECT jsonb_array_elements_text(r->'uses')), (r->>'ord')::integer, v_actor);
    ELSE
      UPDATE public.lead_info_cards x SET cat_id = (r->>'cat')::uuid, brand_id = (r->>'brand')::uuid,
             brand_ids = ARRAY(SELECT jsonb_array_elements_text(r->'brands'))::uuid[], name = r->>'name', code = r->>'code',
             status = r->>'status', valid_from = (r->>'from')::date, valid_until = (r->>'until')::date, note = r->>'note',
             fields = r->'fields', uses = ARRAY(SELECT jsonb_array_elements_text(r->'uses')), sort_order = (r->>'ord')::integer,
             updated_by_name = v_actor, updated_at = now()
       WHERE x.id = (r->>'id')::uuid
         AND (x.cat_id, x.brand_id, x.brand_ids, x.name, x.code, x.status, x.valid_from, x.valid_until, x.note, x.fields, x.uses, x.sort_order)
             IS DISTINCT FROM ((r->>'cat')::uuid, (r->>'brand')::uuid, ARRAY(SELECT jsonb_array_elements_text(r->'brands'))::uuid[], r->>'name', r->>'code', r->>'status', (r->>'from')::date,
                               (r->>'until')::date, r->>'note', r->'fields', ARRAY(SELECT jsonb_array_elements_text(r->'uses')), (r->>'ord')::integer);
    END IF;
  END LOOP;
  RETURN public.lead_info();
END
$function$;

NOTIFY pgrst, 'reload schema';
