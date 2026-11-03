-- Lead View v2 › Settings' Pages and Working hours' On Leave (2026-11-02, the v2 handoff `docs/design_handoff_lead_view_v2`
-- §7.14 and §7.12 — the user: "完全跟claude design 画的"; point 3, Connect page: "System user's Pages").
--
-- 1. A PAGE is a Facebook Page (Messenger) or an Instagram account connected to a brand: `lead_pages`, one per brand and
--    channel. The ingests still find a brand by `lead_brands.fb_page_id` / `ig_account_id`, so no ingest changes: a
--    connected, receiving page's id is in its brand's column; a PAUSED page keeps its id here and leaves the column
--    empty (its messages are ignored, as any page not set up); disconnecting removes the row and empties the column.
--    The two Pages already set up (2990s, Carres) are seeded from the columns. The page list to connect from is the
--    system user's own Pages (Graph `me/accounts`, the app) — no Meta login, no callback.
-- 2. Connecting answers both time windows of that brand and channel with the FIRST REPLY picked (A person / AI Agent),
--    as Reply rules' page row (`lead_reply_pages`), and may make the brand ("+ New brand").
-- 3. ON LEAVE: `lead_staff_leave` — a person (one of `lead_agents()` or a name), from and to (office days); the
--    page saves the list whole.
-- Every table: RLS on, no policy, no grant, audited. Writes: Lead View · Manage, their page's guard (the _guards file).

CREATE TABLE IF NOT EXISTS public.lead_pages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          uuid NOT NULL REFERENCES public.lead_brands(id),
  channel           text NOT NULL CHECK (channel IN ('messenger', 'instagram')),
  -- The Page's id (Messenger) or the Instagram account's id.
  external_id       text NOT NULL CHECK (external_id ~ '^[0-9]{5,30}$'),
  -- Instagram: the Facebook Page it is linked to (replies go through it).
  page_id           text CHECK (page_id ~ '^[0-9]{5,30}$'),
  name              text NOT NULL DEFAULT '' CHECK (length(name) <= 120),
  paused            boolean NOT NULL DEFAULT false,
  connected_by      uuid,
  connected_by_name text NOT NULL DEFAULT '',
  connected_at      timestamptz NOT NULL DEFAULT now(),
  updated_by_name   text NOT NULL DEFAULT '',
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, external_id),
  UNIQUE (brand_id, channel)
);

ALTER TABLE public.lead_pages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_pages FROM anon, authenticated;
SELECT public.audit_register('lead_pages', 'Lead View pages', 'Member services', '{leads}', 'all', p_labels => '{name}');

INSERT INTO public.lead_pages (brand_id, channel, external_id, connected_at)
SELECT b.id, 'messenger', b.fb_page_id, b.created_at FROM public.lead_brands b
 WHERE b.deleted_at IS NULL AND b.fb_page_id ~ '^[0-9]{5,30}$'
ON CONFLICT DO NOTHING;
INSERT INTO public.lead_pages (brand_id, channel, external_id, page_id, connected_at)
SELECT b.id, 'instagram', b.ig_account_id, b.fb_page_id, b.created_at FROM public.lead_brands b
 WHERE b.deleted_at IS NULL AND b.ig_account_id ~ '^[0-9]{5,30}$'
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.lead_staff_leave (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid,
  name            text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 80),
  from_day        date NOT NULL,
  to_day          date NOT NULL CHECK (to_day >= from_day),
  updated_by_name text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_staff_leave ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_staff_leave FROM anon, authenticated;
SELECT public.audit_register('lead_staff_leave', 'Lead View staff leave', 'Member services', '{leads}', 'all', p_labels => '{name}');

-- Puts a brand's column back in step with its page: the receiving page's id, else empty.
CREATE OR REPLACE FUNCTION public.lead_page_sync(p_brand uuid, p_channel text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id text;
BEGIN
  SELECT p.external_id INTO v_id FROM public.lead_pages p WHERE p.brand_id = p_brand AND p.channel = p_channel AND NOT p.paused;
  IF p_channel = 'messenger' THEN
    UPDATE public.lead_brands SET fb_page_id = v_id, updated_at = now() WHERE id = p_brand AND fb_page_id IS DISTINCT FROM v_id;
  ELSE
    UPDATE public.lead_brands SET ig_account_id = v_id, updated_at = now() WHERE id = p_brand AND ig_account_id IS DISTINCT FROM v_id;
  END IF;
END
$fn$;

-- Every connected page, in the brands' order.
CREATE OR REPLACE FUNCTION public.lead_pages()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'brandId', p.brand_id, 'channel', p.channel, 'externalId', p.external_id,
                     'pageId', p.page_id, 'name', p.name, 'paused', p.paused, 'connectedByName', p.connected_by_name, 'connectedAt', p.connected_at)
                     ORDER BY b.sort_order, b.name, p.channel)
                     FROM public.lead_pages p JOIN public.lead_brands b ON b.id = p.brand_id AND b.deleted_at IS NULL), '[]'::jsonb);
END
$fn$;

-- Connect page: {channel, externalId, pageId?, name, brandId | newBrand, reply 'cs' | 'ai'} → the page's id.
CREATE OR REPLACE FUNCTION public.lead_connect_page(p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ch text := coalesce(p_data->>'channel', '');
  v_ext text := btrim(coalesce(p_data->>'externalId', ''));
  v_pg text := nullif(btrim(coalesce(p_data->>'pageId', '')), '');
  v_name text := left(btrim(coalesce(p_data->>'name', '')), 120);
  v_new text := btrim(coalesce(p_data->>'newBrand', ''));
  v_reply text := coalesce(p_data->>'reply', 'cs');
  v_brand uuid;
  v_id uuid;
  v_actor text;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Connecting a page needs Lead View · Manage.');
  v_actor := public.lead_actor_name();
  IF v_ch NOT IN ('messenger', 'instagram') OR v_ext !~ '^[0-9]{5,30}$' OR (v_pg IS NOT NULL AND v_pg !~ '^[0-9]{5,30}$') THEN
    RAISE EXCEPTION 'Pick a page to connect.' USING ERRCODE = '22023';
  END IF;
  IF v_reply NOT IN ('cs', 'ai') THEN
    RAISE EXCEPTION 'The first reply is a person or the AI Agent.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lead_pages WHERE channel = v_ch AND external_id = v_ext)
     OR EXISTS (SELECT 1 FROM public.lead_brands WHERE deleted_at IS NULL AND (CASE WHEN v_ch = 'messenger' THEN fb_page_id ELSE ig_account_id END) = v_ext) THEN
    RAISE EXCEPTION 'That page is connected already.' USING ERRCODE = '23505';
  END IF;
  IF v_new <> '' THEN
    IF length(v_new) > 40 THEN
      RAISE EXCEPTION 'A brand needs a name (40 characters at most).' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.lead_brands WHERE lower(name) = lower(v_new) AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'There is already a brand called %.', v_new USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.lead_brands (name, tone, handoff_mode, sort_order)
    VALUES (v_new, 'ink', 'rotate', (SELECT coalesce(max(sort_order), 0) + 1 FROM public.lead_brands))
    RETURNING id INTO v_brand;
  ELSE
    SELECT id INTO v_brand FROM public.lead_brands WHERE id::text = p_data->>'brandId' AND deleted_at IS NULL;
    IF v_brand IS NULL THEN
      RAISE EXCEPTION 'Pick the page''s brand.' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.lead_pages WHERE brand_id = v_brand AND channel = v_ch) THEN
    RAISE EXCEPTION 'That brand has a % already — disconnect it first.', CASE WHEN v_ch = 'messenger' THEN 'Facebook Page' ELSE 'Instagram account' END USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.lead_pages (brand_id, channel, external_id, page_id, name, connected_by, connected_by_name, updated_by_name)
  VALUES (v_brand, v_ch, v_ext, v_pg, v_name, auth.uid(), v_actor, v_actor)
  RETURNING id INTO v_id;
  PERFORM public.lead_page_sync(v_brand, v_ch);
  INSERT INTO public.lead_reply_pages AS p (brand_id, channel, work_reply, after_reply, updated_by_name)
  VALUES (v_brand, v_ch, v_reply, v_reply, v_actor)
  ON CONFLICT (brand_id, channel) DO UPDATE SET work_reply = EXCLUDED.work_reply, after_reply = EXCLUDED.after_reply,
         updated_by_name = EXCLUDED.updated_by_name, updated_at = now();
  RETURN v_id;
END
$fn$;

-- A page's status or brand: {paused?, brandId?, name?}.
CREATE OR REPLACE FUNCTION public.lead_set_page(p_id uuid, p_data jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  p public.lead_pages;
  v_brand uuid;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Pages need Lead View · Manage.');
  SELECT * INTO p FROM public.lead_pages WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That page is not connected any more.' USING ERRCODE = 'P0002';
  END IF;
  v_brand := p.brand_id;
  IF p_data ? 'brandId' THEN
    SELECT id INTO v_brand FROM public.lead_brands WHERE id::text = p_data->>'brandId' AND deleted_at IS NULL;
    IF v_brand IS NULL THEN
      RAISE EXCEPTION 'That brand is gone.' USING ERRCODE = 'P0002';
    END IF;
    IF v_brand <> p.brand_id AND EXISTS (SELECT 1 FROM public.lead_pages WHERE brand_id = v_brand AND channel = p.channel) THEN
      RAISE EXCEPTION 'That brand has a % already.', CASE WHEN p.channel = 'messenger' THEN 'Facebook Page' ELSE 'Instagram account' END USING ERRCODE = '23505';
    END IF;
  END IF;
  UPDATE public.lead_pages SET
    brand_id = v_brand,
    paused = CASE WHEN p_data ? 'paused' THEN coalesce((p_data->>'paused')::boolean, paused) ELSE paused END,
    name = CASE WHEN p_data ? 'name' THEN left(btrim(coalesce(p_data->>'name', '')), 120) ELSE name END,
    updated_by_name = public.lead_actor_name(), updated_at = now()
  WHERE id = p_id;
  PERFORM public.lead_page_sync(p.brand_id, p.channel);
  IF v_brand <> p.brand_id THEN
    PERFORM public.lead_page_sync(v_brand, p.channel);
  END IF;
END
$fn$;

-- Disconnect page: new messages stop; past chats stay.
CREATE OR REPLACE FUNCTION public.lead_disconnect_page(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  p public.lead_pages;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Pages need Lead View · Manage.');
  DELETE FROM public.lead_pages WHERE id = p_id RETURNING * INTO p;
  IF p.id IS NULL THEN
    RAISE EXCEPTION 'That page is not connected any more.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.lead_page_sync(p.brand_id, p.channel);
END
$fn$;

-- Who is on leave, latest last.
CREATE OR REPLACE FUNCTION public.lead_leave()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'userId', l.user_id, 'name', l.name, 'from', l.from_day, 'to', l.to_day)
                     ORDER BY l.from_day, l.name) FROM public.lead_staff_leave l), '[]'::jsonb);
END
$fn$;

-- On Leave as it stands: [{id?, userId?, name, from, to}] (left out = removed).
CREATE OR REPLACE FUNCTION public.lead_save_leave(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r jsonb;
  v_actor text;
  v_id uuid;
  v_user uuid;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'On Leave needs Lead View · Manage.');
  v_actor := public.lead_actor_name();
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 200 THEN
    RAISE EXCEPTION 'The leave list is not in the right shape.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) x
              WHERE btrim(coalesce(x->>'name', '')) = '' OR length(x->>'name') > 80
                 OR coalesce(x->>'from', '') !~ '^\d{4}-\d{2}-\d{2}$' OR coalesce(x->>'to', '') !~ '^\d{4}-\d{2}-\d{2}$'
                 OR (x->>'from')::date > (x->>'to')::date) THEN
    RAISE EXCEPTION 'Leave names a person and runs from a day to the same day or later.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.lead_staff_leave l
   WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) x WHERE x->>'id' = l.id::text);
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_user := CASE WHEN r->>'userId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (r->>'userId')::uuid END;
    v_id := CASE WHEN r->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (r->>'id')::uuid END;
    IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.lead_staff_leave WHERE id = v_id) THEN
      UPDATE public.lead_staff_leave l SET user_id = v_user, name = btrim(r->>'name'), from_day = (r->>'from')::date, to_day = (r->>'to')::date,
             updated_by_name = v_actor, updated_at = now()
       WHERE l.id = v_id AND (l.user_id, l.name, l.from_day, l.to_day) IS DISTINCT FROM (v_user, btrim(r->>'name'), (r->>'from')::date, (r->>'to')::date);
    ELSE
      INSERT INTO public.lead_staff_leave (user_id, name, from_day, to_day, updated_by_name)
      VALUES (v_user, btrim(r->>'name'), (r->>'from')::date, (r->>'to')::date, v_actor);
    END IF;
  END LOOP;
END
$fn$;

REVOKE ALL ON FUNCTION public.lead_page_sync(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_page_sync(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.lead_pages() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_connect_page(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_set_page(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_disconnect_page(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_leave() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_save_leave(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_pages() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_connect_page(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_set_page(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_disconnect_page(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_leave() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_save_leave(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
