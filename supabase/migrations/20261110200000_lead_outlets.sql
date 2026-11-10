-- Lead View v3 › Outlets (2026-11-10 — the handoff docs/design_handoff_lead_view_v3 § 3; the user approved the table list:
-- "Yes, build it", with the README's six seed outlets).
--
-- OUTLETS. `lead_outlets` — a brand's showrooms, managed on Settings › Brands (`lead_save_outlets`, the brand's whole
-- list; Lead View · Manage, Settings' page). A removed outlet is soft-deleted, its ads go back to "No outlet" and a
-- customer CS had put on it goes back to following the ad.
--
-- AN AD'S OUTLET. `lead_ad_outlets` (ad id → outlet), set on Reply rules › Ads and Settings › Ads (`lead_set_ad_outlet`,
-- Lead View · Manage, either page). Each change is in the Audit log (the table is audited).
--
-- A CUSTOMER'S OUTLET follows the ad they came in on, unless CS set it in the customer panel
-- (`lead_set_contact_outlet`, Lead View · Edit, the Inbox's page): `lead_contacts.outlet_by = 'cs'` with `outlet_id`
-- (NULL = "No outlet"); 'auto' puts it back to the ad's. Worked out live in the card (`lead_contact_json`: `outletId`,
-- `outletBy` 'cs' | 'ad' | ''), so changing an ad's outlet moves every customer of that ad that CS did not set by hand.
-- Inbox and Leads read the card, so both carry it; `lead_ads()` carries each ad's `outletId`.
--
-- PRODUCTION's bodies, md5 checked, each swap found exactly once: lead_contact_json (7a5c2a13…), lead_ads (03225408…).

CREATE TABLE IF NOT EXISTS public.lead_outlets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.lead_brands(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  sort_order integer NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  updated_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lead_outlets_brand_name ON public.lead_outlets (brand_id, lower(btrim(name))) WHERE deleted_at IS NULL;
ALTER TABLE public.lead_outlets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_outlets FROM PUBLIC, anon, authenticated;
SELECT public.audit_register('lead_outlets', 'Lead View outlets', 'Member services', '{leads}', 'all');

CREATE TABLE IF NOT EXISTS public.lead_ad_outlets (
  ad_id text PRIMARY KEY CHECK (length(ad_id) BETWEEN 1 AND 64),
  outlet_id uuid NOT NULL REFERENCES public.lead_outlets(id) ON DELETE CASCADE,
  updated_by_name text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_ad_outlets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_ad_outlets FROM PUBLIC, anon, authenticated;
SELECT public.audit_register('lead_ad_outlets', 'Lead View ad outlets', 'Member services', '{leads}', 'all');

ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS outlet_id uuid REFERENCES public.lead_outlets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outlet_by text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_contacts_outlet_by_check') THEN
    ALTER TABLE public.lead_contacts ADD CONSTRAINT lead_contacts_outlet_by_check
      CHECK (outlet_by IS NULL OR outlet_by = 'cs') NOT VALID;
    ALTER TABLE public.lead_contacts VALIDATE CONSTRAINT lead_contacts_outlet_by_check;
  END IF;
END
$$;

-- The README's seed (§ 3): 2990s and Carress; 2990s mini has none (its pickers offer every outlet).
INSERT INTO public.lead_outlets (brand_id, name, sort_order, updated_by_name)
SELECT b.id, o.name, o.ord, 'Lead View set-up'
  FROM (VALUES ('2990s', '2990s Kelana Jaya', 0), ('2990s', '2990s Petaling Jaya', 1), ('2990s', 'PWCC Penang', 2),
               ('Carress', 'Carress Taman Maluri', 0), ('Carress', 'Carress Johor', 1), ('Carress', 'Carress Penang', 2)) o(brand, name, ord)
  JOIN public.lead_brands b ON lower(b.name) = lower(o.brand) AND b.deleted_at IS NULL
 WHERE NOT EXISTS (SELECT 1 FROM public.lead_outlets x WHERE x.brand_id = b.id);

-- Every outlet (Settings › Brands, the pickers and the filters).
CREATE OR REPLACE FUNCTION public.lead_outlets()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', o.id, 'brandId', o.brand_id, 'name', o.name)
                                    ORDER BY b.sort_order, b.name, o.sort_order, o.name)
                     FROM public.lead_outlets o JOIN public.lead_brands b ON b.id = o.brand_id
                    WHERE o.deleted_at IS NULL), '[]'::jsonb);
END
$$;
REVOKE ALL ON FUNCTION public.lead_outlets() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_outlets() TO authenticated, service_role;

-- A brand's outlets, saved whole: [{id?, name}] in order. An id left out is removed (its ads and the customers CS put on
-- it let go); a new one comes without an id.
CREATE OR REPLACE FUNCTION public.lead_save_outlets(p_brand uuid, p_list jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_who text;
  v_keep uuid[] := '{}';
  v_item jsonb;
  v_id uuid;
  v_name text;
  v_ord integer := 0;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Outlets need Lead View · Manage.');
  IF NOT EXISTS (SELECT 1 FROM public.lead_brands b WHERE b.id = p_brand AND b.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'That brand is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF p_list IS NULL OR jsonb_typeof(p_list) <> 'array' OR jsonb_array_length(p_list) > 100 THEN
    RAISE EXCEPTION 'A list of outlets, 100 at most.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_list) e)
     <> (SELECT count(DISTINCT lower(btrim(e->>'name'))) FROM jsonb_array_elements(p_list) e) THEN
    RAISE EXCEPTION 'Two outlets of a brand cannot share a name.' USING ERRCODE = '22023';
  END IF;
  v_who := left(public.lead_actor_name(), 80);

  -- Those left out go first, so a name can move from one to another in the same save.
  FOR v_item IN SELECT e FROM jsonb_array_elements(p_list) e WHERE e ? 'id' AND e->>'id' <> '' LOOP
    v_keep := v_keep || (v_item->>'id')::uuid;
  END LOOP;
  WITH gone AS (
    UPDATE public.lead_outlets SET deleted_at = now(), updated_at = now(), updated_by_name = v_who
     WHERE brand_id = p_brand AND deleted_at IS NULL AND NOT (id = ANY (v_keep))
    RETURNING id)
  , ads AS (DELETE FROM public.lead_ad_outlets a USING gone WHERE a.outlet_id = gone.id RETURNING 1)
  UPDATE public.lead_contacts c SET outlet_id = NULL, outlet_by = NULL
    FROM gone WHERE c.outlet_id = gone.id;

  FOR v_item IN SELECT e FROM jsonb_array_elements(p_list) e LOOP
    v_name := btrim(coalesce(v_item->>'name', ''));
    IF length(v_name) NOT BETWEEN 1 AND 80 THEN
      RAISE EXCEPTION 'An outlet needs a name of 80 characters at most.' USING ERRCODE = '22023';
    END IF;
    v_id := nullif(v_item->>'id', '')::uuid;
    IF v_id IS NULL THEN
      INSERT INTO public.lead_outlets (brand_id, name, sort_order, updated_by_name) VALUES (p_brand, v_name, v_ord, v_who);
    ELSE
      UPDATE public.lead_outlets SET name = v_name, sort_order = v_ord, updated_at = now(), updated_by_name = v_who
       WHERE id = v_id AND brand_id = p_brand AND deleted_at IS NULL
         AND (name IS DISTINCT FROM v_name OR sort_order IS DISTINCT FROM v_ord);
      IF NOT EXISTS (SELECT 1 FROM public.lead_outlets WHERE id = v_id AND brand_id = p_brand AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'An outlet that is not this brand''s.' USING ERRCODE = '22023';
      END IF;
    END IF;
    v_ord := v_ord + 1;
  END LOOP;
  RETURN public.lead_outlets();
END
$$;
REVOKE ALL ON FUNCTION public.lead_save_outlets(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_save_outlets(uuid, jsonb) TO authenticated, service_role;

-- An ad's outlet; NULL = no outlet.
CREATE OR REPLACE FUNCTION public.lead_set_ad_outlet(p_ad text, p_outlet uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'An ad''s outlet needs Lead View · Manage.');
  IF p_ad IS NULL OR length(p_ad) NOT BETWEEN 1 AND 64 THEN
    RAISE EXCEPTION 'Which ad?' USING ERRCODE = '22023';
  END IF;
  IF p_outlet IS NULL THEN
    DELETE FROM public.lead_ad_outlets WHERE ad_id = p_ad;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lead_outlets o WHERE o.id = p_outlet AND o.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'That outlet is gone.' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.lead_ad_outlets (ad_id, outlet_id, updated_by_name) VALUES (p_ad, p_outlet, left(public.lead_actor_name(), 80))
  ON CONFLICT (ad_id) DO UPDATE SET outlet_id = EXCLUDED.outlet_id, updated_by_name = EXCLUDED.updated_by_name, updated_at = now()
   WHERE public.lead_ad_outlets.outlet_id IS DISTINCT FROM EXCLUDED.outlet_id;
END
$$;
REVOKE ALL ON FUNCTION public.lead_set_ad_outlet(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_set_ad_outlet(text, uuid) TO authenticated, service_role;

-- CS sets a customer's outlet: p_mode 'outlet' (with p_outlet), 'none' (No outlet) or 'auto' (follow the ad again).
CREATE OR REPLACE FUNCTION public.lead_set_contact_outlet(p_contact uuid, p_mode text, p_outlet uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c public.lead_contacts;
  v_name text;
  v_what text;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.edit'], 'A customer''s outlet needs Lead View · Edit.');
  SELECT * INTO c FROM public.lead_contacts WHERE id = p_contact FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That conversation is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF p_mode = 'outlet' THEN
    SELECT o.name INTO v_name FROM public.lead_outlets o WHERE o.id = p_outlet AND o.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That outlet is gone.' USING ERRCODE = 'P0002';
    END IF;
    IF c.outlet_by = 'cs' AND c.outlet_id IS NOT DISTINCT FROM p_outlet THEN RETURN; END IF;
    UPDATE public.lead_contacts SET outlet_by = 'cs', outlet_id = p_outlet WHERE id = p_contact;
    v_what := 'Outlet set to ' || v_name;
  ELSIF p_mode = 'none' THEN
    IF c.outlet_by = 'cs' AND c.outlet_id IS NULL THEN RETURN; END IF;
    UPDATE public.lead_contacts SET outlet_by = 'cs', outlet_id = NULL WHERE id = p_contact;
    v_what := 'Outlet set to none';
  ELSIF p_mode = 'auto' THEN
    IF c.outlet_by IS NULL THEN RETURN; END IF;
    UPDATE public.lead_contacts SET outlet_by = NULL, outlet_id = NULL WHERE id = p_contact;
    v_what := 'Outlet follows the ad again';
  ELSE
    RAISE EXCEPTION 'An outlet, none, or the ad''s.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.lead_events (contact_id, what, actor_name, actor_user)
  VALUES (p_contact, left(v_what || ' by ' || public.lead_actor_name(), 200), public.lead_actor_name(), auth.uid());
END
$$;
REVOKE ALL ON FUNCTION public.lead_set_contact_outlet(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_set_contact_outlet(uuid, text, uuid) TO authenticated, service_role;

DO $do$
DECLARE
  v_swaps text[][] := ARRAY[
    ARRAY['public.lead_contact_json(lead_contacts)', '7a5c2a13a48861d561467a41a8cb9937',
          $$'blockedAt', c.blocked_at, 'blockedBy', c.blocked_by_name)$$,
          $$'blockedAt', c.blocked_at, 'blockedBy', c.blocked_by_name)
      || jsonb_build_object(  -- the customer's outlet (mig 20261110200000): CS's pick, else the ad's
           'outletId', CASE WHEN c.outlet_by = 'cs' THEN c.outlet_id ELSE ao.outlet_id END,
           'outletBy', CASE WHEN c.outlet_by = 'cs' THEN 'cs' WHEN ao.outlet_id IS NOT NULL THEN 'ad' ELSE '' END)$$,
          $$    LEFT JOIN public.lead_ads a ON a.ad_id = c.ad_id$$,
          $$    LEFT JOIN public.lead_ads a ON a.ad_id = c.ad_id
    LEFT JOIN public.lead_ad_outlets ao ON ao.ad_id = c.ad_id$$],
    ARRAY['public.lead_ads()', '032254083b38cb91aa19ad77a238abcb',
          $$'updatedByName', coalesce(a.updated_by_name, ''))$$,
          $$'updatedByName', coalesce(a.updated_by_name, ''), 'outletId', ao.outlet_id)  -- mig 20261110200000$$,
          $$LEFT JOIN public.lead_ads a ON a.ad_id = x.ad_id), '[]'::jsonb);$$,
          $$LEFT JOIN public.lead_ads a ON a.ad_id = x.ad_id
      LEFT JOIN public.lead_ad_outlets ao ON ao.ad_id = x.ad_id), '[]'::jsonb);$$]];
  i int;
  v_sig regprocedure;
  v_src text;
  v_def text;
BEGIN
  FOR i IN 1 .. array_length(v_swaps, 1) LOOP
    v_sig := v_swaps[i][1]::regprocedure;
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
    IF position('lead_ad_outlets' IN v_src) > 0 THEN
      CONTINUE;
    END IF;
    IF md5(v_src) IS DISTINCT FROM v_swaps[i][2] THEN
      RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', v_sig, md5(v_src);
    END IF;
    v_def := pg_get_functiondef(v_sig);
    IF (length(v_def) - length(replace(v_def, v_swaps[i][3], ''))) / length(v_swaps[i][3]) <> 1 THEN
      RAISE EXCEPTION '%: the text to swap is not there exactly once', v_sig;
    END IF;
    v_def := replace(v_def, v_swaps[i][3], v_swaps[i][4]);
    IF (length(v_def) - length(replace(v_def, v_swaps[i][5], ''))) / length(v_swaps[i][5]) <> 1 THEN
      RAISE EXCEPTION '%: the second text to swap is not there exactly once', v_sig;
    END IF;
    v_def := replace(v_def, v_swaps[i][5], v_swaps[i][6]);
    EXECUTE v_def;
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';
