-- Lead View: block a customer, and each CS sees only the brands they handle (2026-11-02 — the user: "增加block功能", and
-- "我想要做个小分流（比如周三&四 客服休假，有一个人会carress & 2990mini；另一个会专门负责2990，有办法设定这两个人登入时
-- 只看到自己负责的part吗？").
--
-- BLOCK. `lead_block(contact, on)` (Lead View · Edit, the Inbox's page): the conversation is marked blocked
-- (`lead_contacts.blocked_at`, by whom), a template waiting on it stops and the AI Agent steps aside; while it is, no
-- reply rule, template or AI answers it (the runner returns at once). Its messages still come in and are kept — Meta lets
-- a Page block a person only in Business Suite — and the Inbox leaves it out of the list but under its Blocked filter. The
-- card says so (`blockedAt`). "Blocked by …" / "Unblocked by …" on the timeline.
--
-- BRANDS PER CS. `lead_agent_brands` (person × brand): somebody with rows reads only those brands' conversations — the
-- Inbox's list (`lead_inbox`), an opened chat (`lead_thread`), Leads (`lead_leads`); somebody with none, and anybody with
-- Lead View · Manage, reads every brand (`lead_my_brands()`, NULL = all). Saved on Settings › Team
-- (`lead_save_agent_brands`, Lead View · Manage, Settings' page), read there with `lead_agent_brands()`. Fixed ticks, not a
-- calendar: the two who cover the leave days are ticked for their brands, and Working hours › On leave keeps the leave.
--
-- PRODUCTION's bodies, md5 checked, each swap found exactly once: lead_contact_json (76f24c12…), lead_flow_on_message
-- (7b940387…), lead_inbox (4d7bf550…), lead_thread (44e6aca2…), lead_leads (75ec5244…).

ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_by_name text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.lead_agent_brands (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.lead_brands(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, brand_id)
);
ALTER TABLE public.lead_agent_brands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_agent_brands FROM PUBLIC, anon, authenticated;
SELECT public.audit_register('lead_agent_brands', 'Lead View CS brands', 'Member services', '{leads}', 'all');

-- The caller's brands: NULL (every brand) with no rows, with Lead View · Manage, or with no sign-in (the service role).
CREATE OR REPLACE FUNCTION public.lead_my_brands()
RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v uuid[];
BEGIN
  IF auth.uid() IS NULL OR public.has_any_action(ARRAY['leads.manage']) THEN
    RETURN NULL;
  END IF;
  SELECT array_agg(brand_id) INTO v FROM public.lead_agent_brands WHERE user_id = auth.uid();
  RETURN v;
END
$$;
REVOKE ALL ON FUNCTION public.lead_my_brands() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_my_brands() TO service_role;

-- Settings › Team: who handles which brands.
CREATE OR REPLACE FUNCTION public.lead_agent_brands()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('userId', g.user_id, 'brandIds', g.ids))
                     FROM (SELECT user_id, jsonb_agg(brand_id) ids FROM public.lead_agent_brands GROUP BY user_id) g), '[]'::jsonb);
END
$$;
REVOKE ALL ON FUNCTION public.lead_agent_brands() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_agent_brands() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.lead_save_agent_brands(p_user uuid, p_brands uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Who handles which brand needs Lead View · Manage.');
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user) THEN
    RAISE EXCEPTION 'That person is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_brands, '{}')) b WHERE NOT EXISTS (SELECT 1 FROM public.lead_brands x WHERE x.id = b)) THEN
    RAISE EXCEPTION 'A brand that is not there.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.lead_agent_brands WHERE user_id = p_user AND NOT (brand_id = ANY (coalesce(p_brands, '{}')));
  INSERT INTO public.lead_agent_brands (user_id, brand_id)
  SELECT p_user, b FROM unnest(coalesce(p_brands, '{}')) b ON CONFLICT DO NOTHING;
END
$$;
REVOKE ALL ON FUNCTION public.lead_save_agent_brands(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_save_agent_brands(uuid, uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.lead_block(p_contact uuid, p_on boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c public.lead_contacts;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.edit'], 'Blocking needs Lead View · Edit.');
  SELECT * INTO c FROM public.lead_contacts WHERE id = p_contact FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That conversation is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF coalesce(p_on, false) AND c.blocked_at IS NULL THEN
    UPDATE public.lead_contacts SET blocked_at = now(), blocked_by_name = left(public.lead_actor_name(), 80),
           flow_state = CASE WHEN flow_state = 'running' THEN 'stopped' ELSE flow_state END,
           flow_step = CASE WHEN flow_state = 'running' THEN NULL ELSE flow_step END,
           ai_on = false, ai_busy_at = NULL, restart_at = NULL
     WHERE id = p_contact;
    INSERT INTO public.lead_events (contact_id, what, actor_name, actor_user)
    VALUES (p_contact, left('Blocked by ' || public.lead_actor_name(), 200), public.lead_actor_name(), auth.uid());
  ELSIF NOT coalesce(p_on, false) AND c.blocked_at IS NOT NULL THEN
    UPDATE public.lead_contacts SET blocked_at = NULL, blocked_by_name = '' WHERE id = p_contact;
    INSERT INTO public.lead_events (contact_id, what, actor_name, actor_user)
    VALUES (p_contact, left('Unblocked by ' || public.lead_actor_name(), 200), public.lead_actor_name(), auth.uid());
  END IF;
END
$$;
REVOKE ALL ON FUNCTION public.lead_block(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_block(uuid, boolean) TO authenticated, service_role;

DO $do$
DECLARE
  v_swaps text[][] := ARRAY[
    ARRAY['public.lead_contact_json(lead_contacts)', '76f24c12338de17f3f5043caf1b64282',
          $$'aiOn', c.ai_on)$$, $$'aiOn', c.ai_on, 'blockedAt', c.blocked_at, 'blockedBy', c.blocked_by_name)$$, '', ''],
    ARRAY['public.lead_flow_on_message()', '7b940387d6bb92c39b186860a44f0c50',
          $$  IF NEW.direction <> 'in' THEN
    RETURN NULL;
  END IF;$$,
          $$  IF NEW.direction <> 'in' THEN
    RETURN NULL;
  END IF;

  -- Blocked in Lead View (mig 20261102270000): kept, never answered.
  IF c.blocked_at IS NOT NULL THEN
    RETURN NULL;
  END IF;$$, '', ''],
    ARRAY['public.lead_inbox()', '4d7bf550e4fd12d4f9764f2e8f8d1680',
          $$FROM (SELECT * FROM public.lead_contacts ORDER BY last_at DESC LIMIT 500) c$$,
          $$FROM (SELECT * FROM public.lead_contacts x  -- the caller's brands (mig 20261102270000)
             WHERE (SELECT public.lead_my_brands()) IS NULL OR x.brand_id = ANY ((SELECT public.lead_my_brands())::uuid[])
             ORDER BY last_at DESC LIMIT 500) c$$, '', ''],
    ARRAY['public.lead_thread(uuid)', '44e6aca2975928cf48d4d71f7f70a49e',
          $$  IF NOT FOUND THEN
    RETURN NULL;
  END IF;$$,
          $$  -- Another brand's, for somebody who handles only theirs (mig 20261102270000): as if it were not there.
  IF NOT FOUND OR NOT (public.lead_my_brands() IS NULL OR c.brand_id = ANY (public.lead_my_brands())) THEN
    RETURN NULL;
  END IF;$$, '', ''],
    ARRAY['public.lead_leads(date, date)', '75ec52448160262c67aac09b8750325e',
          $$             WHERE p_from IS NULL$$,
          $$             WHERE ((SELECT public.lead_my_brands()) IS NULL OR x.brand_id = ANY ((SELECT public.lead_my_brands())::uuid[]))  -- mig 20261102270000
               AND (p_from IS NULL$$,
          $$             ORDER BY greatest(x.last_at, x.updated_at) DESC
             LIMIT 5000) c$$,
          $$)
             ORDER BY greatest(x.last_at, x.updated_at) DESC
             LIMIT 5000) c$$]];
  i int;
  v_sig regprocedure;
  v_src text;
  v_def text;
BEGIN
  FOR i IN 1 .. array_length(v_swaps, 1) LOOP
    v_sig := v_swaps[i][1]::regprocedure;
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
    IF position('mig 20261102270000' IN v_src) > 0 OR position('''blockedAt''' IN v_src) > 0 THEN
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
    IF v_swaps[i][5] <> '' THEN
      IF (length(v_def) - length(replace(v_def, v_swaps[i][5], ''))) / length(v_swaps[i][5]) <> 1 THEN
        RAISE EXCEPTION '%: the second text to swap is not there exactly once', v_sig;
      END IF;
      v_def := replace(v_def, v_swaps[i][5], v_swaps[i][6]);
    END IF;
    EXECUTE v_def;
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';
