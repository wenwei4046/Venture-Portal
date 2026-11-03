-- Lead View › the same as Messenger (2026-10-28 — the user: "需要呈现完整的对话", "我需要跟msg 一摸一样", then
-- "可以，三项都做"; .claude/rules/leads/lead-view.md › THE SAME AS MESSENGER).
--
--   - A conversation's whole history: when a customer first reaches Lead View, the webhook asks Meta for the
--     conversation and hands what Lead View lacks to lead_ingest_history (the service role's alone) — inserted at
--     Meta's times by Meta's ids, the phone found, the last message set by time, lead_contacts.history_at marked.
--     lead_history_wanted(contacts) names the real Messenger conversations not filled yet.
--   - History never starts an automation: lead_ingest_history sets `lead.history` for its transaction and the
--     template runner returns at once while it is on (PRODUCTION's lead_flow_on_message, md5 03b5955f…, one
--     statement put first).
--   - The card carries the Page and the customer's Messenger id (pageId, psid — PRODUCTION's lead_contact_json,
--     md5 599eeb02…, two keys joined after its object — jsonb_build_object takes at most 100 arguments): the Inbox reads Messenger's own unread count for each, and opening
--     a chat marks it seen in Messenger.

ALTER TABLE public.lead_contacts ADD COLUMN IF NOT EXISTS history_at timestamptz;

DO $do$
DECLARE
  v_swaps text[][] := ARRAY[
    ARRAY['public.lead_flow_on_message()',
          $$BEGIN
  SELECT * INTO c FROM public.lead_contacts WHERE id = NEW.contact_id FOR UPDATE;$$,
          $$BEGIN
  -- A conversation's earlier messages filled in from Meta (lead_ingest_history) never start an automation.
  IF current_setting('lead.history', true) = 'on' THEN
    RETURN NULL;
  END IF;
  SELECT * INTO c FROM public.lead_contacts WHERE id = NEW.contact_id FOR UPDATE;$$,
          '03b5955f7bd61d661e022bbec6656110'],
    ARRAY['public.lead_contact_json(public.lead_contacts)',
          $$WHERE cl.contact_id = c.id), '[]'::jsonb))$$,
          $$WHERE cl.contact_id = c.id), '[]'::jsonb)) || jsonb_build_object('pageId', c.page_id, 'psid', c.external_id)$$,
          '599eeb023b6dcde9792d13bb958099e5']];
  i int;
  v_sig regprocedure;
  v_src text;
BEGIN
  FOR i IN 1 .. array_length(v_swaps, 1) LOOP
    v_sig := v_swaps[i][1]::regprocedure;
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
    IF position(v_swaps[i][3] IN v_src) > 0 THEN
      CONTINUE;
    END IF;
    IF md5(v_src) IS DISTINCT FROM v_swaps[i][4] THEN
      RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', v_sig, md5(v_src);
    END IF;
    IF (length(v_src) - length(replace(v_src, v_swaps[i][2], ''))) / length(v_swaps[i][2]) <> 1 THEN
      RAISE EXCEPTION '%: the text to swap is not there exactly once', v_sig;
    END IF;
    EXECUTE replace(pg_get_functiondef(v_sig), v_swaps[i][2], v_swaps[i][3]);
  END LOOP;
END
$do$;

-- Which of these conversations still want their history from Meta.
CREATE OR REPLACE FUNCTION public.lead_history_wanted(p_contacts uuid[])
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'pageId', c.page_id, 'psid', c.external_id)), '[]'::jsonb)
    FROM public.lead_contacts c
   WHERE c.id = ANY (coalesce(p_contacts, '{}')) AND c.history_at IS NULL AND NOT c.is_test
     AND c.channel = 'messenger' AND c.page_id IS NOT NULL;
$fn$;

-- A conversation's earlier messages from Meta: [{mid, in, at, body, mediaUrl?}]. Only what Lead View lacks; none sent.
CREATE OR REPLACE FUNCTION public.lead_ingest_history(p_contact uuid, p_messages jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  m jsonb;
  v_at timestamptz;
  v_in boolean;
  v_body text;
  v_phone text;
  n integer := 0;
BEGIN
  PERFORM set_config('lead.history', 'on', true);
  PERFORM 1 FROM public.lead_contacts WHERE id = p_contact FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  FOR m IN SELECT * FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_messages) = 'array' THEN p_messages ELSE '[]'::jsonb END) LOOP
    CONTINUE WHEN coalesce(m->>'mid', '') = '' OR EXISTS (SELECT 1 FROM public.lead_messages WHERE external_id = m->>'mid');
    BEGIN
      v_at := (m->>'at')::timestamptz;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
    CONTINUE WHEN v_at IS NULL OR v_at > now() + interval '5 minutes';
    v_in := coalesce((m->>'in')::boolean, false);
    v_body := left(coalesce(nullif(btrim(m->>'body'), ''), '[Message]'), 2000);
    v_phone := CASE WHEN v_in THEN public.lead_find_phone(v_body) END;
    INSERT INTO public.lead_messages (contact_id, direction, sender, by_name, body, delivery, external_id, media_url, phone_found, created_at)
    VALUES (p_contact, CASE WHEN v_in THEN 'in' ELSE 'out' END, CASE WHEN v_in THEN 'customer' ELSE 'page' END,
            CASE WHEN v_in THEN '' ELSE 'Business Suite' END, v_body, CASE WHEN v_in THEN 'recorded' ELSE 'sent' END,
            left(m->>'mid', 300), CASE WHEN m->>'mediaUrl' ~ '^https://' THEN left(m->>'mediaUrl', 2000) END, v_phone, v_at);
    n := n + 1;
  END LOOP;
  UPDATE public.lead_contacts c
     SET (last_at, last_dir, last_text) = (SELECT l.created_at, l.direction, left(l.body, 200) FROM public.lead_messages l WHERE l.contact_id = c.id ORDER BY l.created_at DESC, l.id DESC LIMIT 1),
         phone = CASE WHEN c.phone_state = 'none' THEN coalesce((SELECT l.phone_found FROM public.lead_messages l WHERE l.contact_id = c.id AND l.phone_found IS NOT NULL ORDER BY l.created_at LIMIT 1), c.phone) ELSE c.phone END,
         phone_at = CASE WHEN c.phone_state = 'none' THEN (SELECT l.created_at FROM public.lead_messages l WHERE l.contact_id = c.id AND l.phone_found IS NOT NULL ORDER BY l.created_at LIMIT 1) ELSE c.phone_at END,
         phone_state = CASE WHEN c.phone_state = 'none' AND EXISTS (SELECT 1 FROM public.lead_messages l WHERE l.contact_id = c.id AND l.phone_found IS NOT NULL) THEN 'detected' ELSE c.phone_state END,
         history_at = now()
   WHERE c.id = p_contact;
  IF n > 0 THEN
    INSERT INTO public.lead_events (contact_id, what, actor_name) VALUES (p_contact, 'Earlier messages from Messenger added (' || n || ')', 'System');
  END IF;
  RETURN n;
END
$fn$;

REVOKE ALL ON FUNCTION public.lead_history_wanted(uuid[]), public.lead_ingest_history(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_history_wanted(uuid[]), public.lead_ingest_history(uuid, jsonb) TO service_role;

-- The 54 conversations filled in by hand on 2026-10-27 / 28 are complete: none wants it again.
UPDATE public.lead_contacts SET history_at = now() WHERE history_at IS NULL AND NOT is_test AND channel = 'messenger';

NOTIFY pgrst, 'reload schema';
