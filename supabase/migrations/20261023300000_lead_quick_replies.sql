-- Lead View › Data Center › Quick replies (2026-10-23, the redesign v2 handoff `Data Center.dc.html`, its second tab —
-- the user, shown where the built pages differ from the design: "Fix all 10 as the design shows").
--
-- A quick reply is a shortcut CS types in the Inbox's reply box (/instal) to put its text in, for one brand or every
-- brand; the AI Agent may use them too. `used` counts how often CS put one in. The Data Center's tab saves them as a
-- whole (Lead View · Manage); the Inbox counts a use (Lead View · Create). RLS on, no policy, no grant.

CREATE TABLE IF NOT EXISTS public.lead_quick_replies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = every brand.
  brand_id        uuid REFERENCES public.lead_brands(id),
  shortcut        text NOT NULL CHECK (shortcut ~ '^/[a-z0-9_-]{1,30}$'),
  body            text NOT NULL CHECK (btrim(body) <> '' AND length(body) <= 1000),
  used            integer NOT NULL DEFAULT 0 CHECK (used >= 0),
  sort_order      integer NOT NULL DEFAULT 0,
  updated_by_name text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lead_quick_replies_shortcut ON public.lead_quick_replies (shortcut, coalesce(brand_id::text, ''));

ALTER TABLE public.lead_quick_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_quick_replies FROM anon, authenticated;

SELECT public.audit_register('lead_quick_replies', 'Lead View quick replies', 'Member services', '{leads}', 'all', p_labels => '{shortcut}');

-- Every quick reply, in the page's order.
CREATE OR REPLACE FUNCTION public.lead_quick_replies()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'brandId', r.brand_id, 'shortcut', r.shortcut, 'body', r.body, 'used', r.used)
                     ORDER BY r.sort_order, r.created_at) FROM public.lead_quick_replies r), '[]'::jsonb);
END
$fn$;

-- The tab's Save: every quick reply as it stands (left out = removed; a new one comes without an id).
CREATE OR REPLACE FUNCTION public.lead_save_quick_replies(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r jsonb;
  v_actor text;
  v_ord integer := 0;
  v_keep uuid[] := '{}';
  v_id uuid;
  v_brand uuid;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Quick replies need Lead View · Manage.');
  v_actor := public.lead_actor_name();
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 200 THEN
    RAISE EXCEPTION 'The quick replies are not in the right shape.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) x
              WHERE coalesce(x->>'shortcut', '') !~ '^/[a-z0-9_-]{1,30}$' OR btrim(coalesce(x->>'body', '')) = '' OR length(x->>'body') > 1000) THEN
    RAISE EXCEPTION 'A quick reply is a shortcut like /instal (small letters and digits) and its text (1,000 characters at most).' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_rows)) <> (SELECT count(DISTINCT (x->>'shortcut', coalesce(x->>'brandId', ''))) FROM jsonb_array_elements(p_rows) x) THEN
    RAISE EXCEPTION 'Two quick replies use the same shortcut for the same brand.' USING ERRCODE = '22023';
  END IF;
  -- Removed first, so a shortcut can move from one row to another in the same save.
  DELETE FROM public.lead_quick_replies q
   WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) x WHERE x->>'id' = q.id::text);
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_ord := v_ord + 1;
    v_brand := CASE WHEN r->>'brandId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (r->>'brandId')::uuid END;
    IF v_brand IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lead_brands WHERE id = v_brand AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'That brand is gone.' USING ERRCODE = 'P0002';
    END IF;
    v_id := CASE WHEN r->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (r->>'id')::uuid END;
    IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.lead_quick_replies WHERE id = v_id) THEN
      UPDATE public.lead_quick_replies q SET brand_id = v_brand, shortcut = r->>'shortcut', body = btrim(r->>'body'), sort_order = v_ord,
             updated_by_name = v_actor, updated_at = now()
       WHERE q.id = v_id AND (q.brand_id, q.shortcut, q.body, q.sort_order) IS DISTINCT FROM (v_brand, r->>'shortcut', btrim(r->>'body'), v_ord);
    ELSE
      INSERT INTO public.lead_quick_replies (brand_id, shortcut, body, sort_order, updated_by_name)
      VALUES (v_brand, r->>'shortcut', btrim(r->>'body'), v_ord, v_actor);
    END IF;
  END LOOP;
END
$fn$;

-- CS put one in a reply: counted.
CREATE OR REPLACE FUNCTION public.lead_quick_reply_used(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.create'], 'Replying needs Lead View · Create.');
  UPDATE public.lead_quick_replies SET used = used + 1 WHERE id = p_id;
END
$fn$;

REVOKE ALL ON FUNCTION public.lead_quick_replies() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_save_quick_replies(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_quick_reply_used(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_quick_replies() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_save_quick_replies(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_quick_reply_used(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
