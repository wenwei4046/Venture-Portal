-- ════════════════════════════════════════════════════════════════════════════
-- The CRM's brands per person (2026-11-17)
-- ════════════════════════════════════════════════════════════════════════════
-- The owner: "我想要选择 dc 后，只有 dc 权限的人可以看到 dc 的客户资讯，ads performance 等",
-- then, of where it is set: "按人打勾", and "那做这个打勾的功能就可以了".
--
-- One CRM holds two brands — The Conts and Dream Crafter (DC) — told apart by the
-- WhatsApp number or Facebook Page a customer wrote to (crm_contacts.account_id;
-- the app's twin is src/lib/member/crm-source.ts › ACCOUNTS). Until now a brand was
-- only a filter. Now each person sees the brands ticked for them:
--
--   user_crm_brands                          one person's brands taken off (or given back)
--   crm_brand_of(account)                    a number's / Page's brand, NULL for one not listed
--   crm_my_brands()                          the signed-in person's brands (every brand by default)
--   person_crm_brands(user)                  a person's window: their ticks
--   permission_user_crm_brands_set(user, …)  their ticks, by whoever manages permissions
--
-- Everybody keeps both brands until somebody unticks one (the owner's choice of the
-- default, 2026-11-17), so nothing anybody reads moves today.
--
-- What a brand taken off hides: the customer (a RESTRICTIVE read policy on
-- crm_contacts) — and with it everything read through it: their messages,
-- visits, events, notes, shares (each policy reads `contact_id IN (SELECT id FROM
-- crm_contacts)`), the files in crm-media, Realtime, the unread badge; and the
-- brand's ads (crm_ad_names, by its Page, or — no Page known — by a customer of it
-- they can read). Writing to such a customer is refused too: crm_can_reply()
-- asks the brand (production's body, one statement swapped, md5 05d5a038…).
--
-- Not named `_crm_`: the CRM's sandbox checks would load it without the
-- permission tables it reads.
--
-- Rollback, in words (the database tool refuses the keyword): put crm_can_reply's
-- `where c.id = p_contact` back alone, then the two policies, the functions and
-- the table can go.
-- ════════════════════════════════════════════════════════════════════════════

-- ── One person's brands ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_crm_brands (
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  brand      text NOT NULL CHECK (brand IN ('conts', 'dc')),
  -- false = held back from a brand they would see; true = given one back (no default leaves one out today).
  granted    boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, brand)
);
ALTER TABLE public.user_crm_brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_crm_brands_read ON public.user_crm_brands;
-- Read as a person's boxes are (user_sub_department_reach); written only through permission_user_crm_brands_set().
CREATE POLICY user_crm_brands_read ON public.user_crm_brands FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.has_perm('team')) OR (SELECT public.has_perm('permissions_manage')));
COMMENT ON TABLE public.user_crm_brands IS
  'One person''s CRM brands (The Conts, Dream Crafter) taken off or given back over every brand (2026-11-17). Written by permission_user_crm_brands_set().';

INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('user_crm_brands', ARRAY['accounts.manage', 'accounts.view', 'team.view:own'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_reads_guard('user_crm_brands');

SELECT public.audit_register('user_crm_brands', 'Personal CRM brands', 'People', '{permissions_manage}', 'all',
  p_keys => '{user_id,brand}', p_labels => '{user_id,brand}');

-- ── A number's or Page's brand ─────────────────────────────────────────────

-- The app's twin: src/lib/member/crm-source.ts › ACCOUNTS. A new number or Page is added to both.
CREATE OR REPLACE FUNCTION public.crm_brand_of(p_account text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $fn$
BEGIN
  RETURN CASE p_account
    WHEN '1438056256053876' THEN 'conts'  -- WhatsApp 018-358 0219
    WHEN '102351059576534'  THEN 'conts'  -- Page: The Conts Property Management
    WHEN '1422533724269131' THEN 'dc'     -- WhatsApp 018-907 9042
    WHEN '478652958664343'  THEN 'dc'     -- Page: Dream Crafter Design
  END;
END
$fn$;

-- The signed-in person's brands: every brand, less what was taken off them. No sign-in: every brand
-- (the service role meets no row policy anyway).
CREATE OR REPLACE FUNCTION public.crm_my_brands()
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  RETURN ARRAY(
    SELECT b FROM unnest(ARRAY['conts', 'dc']) AS b
     WHERE v_me IS NULL
        OR coalesce((SELECT r.granted FROM public.user_crm_brands r WHERE r.user_id = v_me AND r.brand = b), true)
     ORDER BY b);
END
$fn$;

-- ── What a brand taken off hides ───────────────────────────────────────────

DROP POLICY IF EXISTS crm_contacts_brand ON public.crm_contacts;
CREATE POLICY crm_contacts_brand ON public.crm_contacts AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.crm_brand_of(account_id) IS NULL OR public.crm_brand_of(account_id) IN (SELECT unnest(public.crm_my_brands())));

-- An ad: every brand → as before; else its Page's brand, or — no Page known — one of its customers they read.
DROP POLICY IF EXISTS crm_ad_names_brand ON public.crm_ad_names;
CREATE POLICY crm_ad_names_brand ON public.crm_ad_names AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.crm_my_brands()) @> ARRAY['conts', 'dc']
    OR (page_id IS NOT NULL AND (public.crm_brand_of(page_id) IS NULL OR public.crm_brand_of(page_id) IN (SELECT unnest(public.crm_my_brands()))))
    OR (page_id IS NULL AND ad_source_id IN (SELECT c.ad_source_id FROM public.crm_contacts c WHERE c.ad_source_id IS NOT NULL))
  );

-- ── A person's window, and their ticks ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.person_crm_brands(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Read as their boxes are: their own, or People's / Permissions' readers, who also hold the action.
  IF auth.uid() IS NULL
     OR NOT (p_user = auth.uid() OR public.has_perm('team') OR public.has_perm('permissions_manage'))
     OR NOT public.has_any_action(ARRAY['accounts.manage', 'accounts.view', 'team.view:own']) THEN
    RAISE EXCEPTION 'Only whoever reads people''s permissions sees their CRM brands' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('brand', r.brand, 'granted', r.granted) ORDER BY r.brand)
                     FROM public.user_crm_brands r WHERE r.user_id = p_user), '[]'::jsonb);
END
$fn$;

-- The person's whole list: what is not in it goes (back to every brand), what is, is kept.
CREATE OR REPLACE FUNCTION public.permission_user_crm_brands_set(p_user uuid, p_ticks jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_bad text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_perm('permissions_manage') THEN
    RAISE EXCEPTION 'Only whoever manages permissions sets a person''s own permissions' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user) THEN RAISE EXCEPTION 'That account is gone'; END IF;
  IF jsonb_typeof(p_ticks) IS DISTINCT FROM 'array' OR jsonb_array_length(p_ticks) > 2 THEN
    RAISE EXCEPTION 'The brands must be sent as a list';
  END IF;
  SELECT coalesce(t.brand, '?') INTO v_bad
    FROM jsonb_to_recordset(p_ticks) AS t(brand text, granted boolean)
   WHERE t.brand IS NULL OR t.brand NOT IN ('conts', 'dc') OR t.granted IS NULL
   LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '% is not a CRM brand', v_bad; END IF;
  SELECT t.brand INTO v_bad FROM jsonb_to_recordset(p_ticks) AS t(brand text, granted boolean)
   GROUP BY t.brand HAVING count(*) > 1 LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '% is listed twice', v_bad; END IF;

  DELETE FROM public.user_crm_brands r
   WHERE r.user_id = p_user
     AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_ticks) AS t(brand text, granted boolean) WHERE t.brand = r.brand);
  INSERT INTO public.user_crm_brands AS r (user_id, brand, granted, updated_by)
  SELECT p_user, t.brand, t.granted, auth.uid()
    FROM jsonb_to_recordset(p_ticks) AS t(brand text, granted boolean)
  ON CONFLICT (user_id, brand) DO UPDATE
    SET granted = EXCLUDED.granted, updated_at = now(), updated_by = auth.uid()
    WHERE r.granted IS DISTINCT FROM EXCLUDED.granted;
END
$fn$;

-- The policies call the two helpers as the reader; the window's two are the app's.
REVOKE ALL ON FUNCTION public.crm_brand_of(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_my_brands() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.person_crm_brands(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.permission_user_crm_brands_set(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_brand_of(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crm_my_brands() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.person_crm_brands(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.permission_user_crm_brands_set(uuid, jsonb) TO authenticated, service_role;

-- ── Writing to a customer asks the brand too ───────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.swap_once(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_def   text := pg_get_functiondef(p_sig);
  v_pat   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: the statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  FOR v_found IN SELECT DISTINCT m[1] FROM regexp_matches(v_src, '(' || v_pat || ')', 'g') AS m LOOP
    v_def := replace(v_def, v_found, p_new);
  END LOOP;
  EXECUTE v_def;
END
$fn$;

SELECT pg_temp.swap_once('public.crm_can_reply(uuid)',
  $q$where c.id = p_contact$q$,
  $q$where c.id = p_contact
       and (public.crm_brand_of(c.account_id) is null or public.crm_brand_of(c.account_id) = any (public.crm_my_brands()))$q$);
