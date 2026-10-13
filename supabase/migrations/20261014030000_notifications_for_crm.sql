-- ============================================================================
-- 20261014030000_notifications_for_crm.sql
-- The CRM tells a person's PHONE about their own chats (the user, 2026-10-14:
-- "当收到 message、有人上来的时候，如果是分到你自己的（也就是 mine 那边 …
-- 负责的 chat），我希望它是能够跳得出 notification … 你被分到 appointment、
-- 收到 message、或者收到新的 lead … 有人家的 profile pic, then content").
--
-- What is told, to whom — the person's own login (hr_staff_costs.user_id), as a
-- meeting tells the people in it, and never whoever did it:
--   1. a customer's message → everybody who has the chat in Mine: the person
--      it is given to and anybody it is shared with — not while they muted,
--      hid or blocked it;
--   2. a customer given to somebody (crm_events 'assigned'): dealt by the CRM
--      on arrival = "New lead · <name>" with the customer's words; given by a
--      person = "<person> assigned this customer to you";
--   3. a visit booked, moved or cancelled for their customer by somebody else
--      ('appt_booked' / 'appt_changed' / 'appt_cancelled');
--   4. a reminder to reply from the Control panel ('reminded');
--   5. a share or move invitation to them (crm_invites), and the answer to one
--      they sent ('shared' / 'moved' / 'share_declined' / 'move_declined').
--
-- A notice is an app_notifications row of kind 'crm' whose `data` carries what
-- the phone draws (the channel, the customer's name, the line, the time); the
-- outbox hands it to the push. The bells never list them — notifications_mine
-- leaves kind 'crm' out: the CRM keeps its own inbox and bell.
--
-- Written by AFTER triggers beside the event, in its transaction; a trigger
-- that fails only warns — a notice never stops the message, the assignment or
-- the visit it tells of. Comments stay outside the function bodies.
--
-- Named without `_crm_` after the timestamp on purpose: the CRM's PGlite checks
-- load every `2026…_crm_*.sql`, and this one needs the notifications tables.
-- ============================================================================

-- ── What a notice carries ───────────────────────────────────────────────────

ALTER TABLE public.app_notifications ADD COLUMN IF NOT EXISTS data jsonb;

ALTER TABLE public.app_notifications DROP CONSTRAINT IF EXISTS app_notifications_kind_check;
ALTER TABLE public.app_notifications ADD CONSTRAINT app_notifications_kind_check
  CHECK (kind IN ('hiring', 'rooms', 'review', 'memo', 'crm'));
ALTER TABLE public.app_notifications DROP CONSTRAINT IF EXISTS app_notifications_ref_kind_check;
ALTER TABLE public.app_notifications ADD CONSTRAINT app_notifications_ref_kind_check
  CHECK (ref_kind IN ('hiring_request', 'booking', 'member_request', 'memo', 'crm_contact', 'crm_invite'));

-- ── The words (pure) ────────────────────────────────────────────────────────

-- A customer's message as the CRM's inbox names it (lib/member/crm-data.ts › chatMessage): its words, or what it is.
CREATE OR REPLACE FUNCTION public.notify_crm_preview(p_kind text, p_body text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $fn$
  SELECT left(CASE
    WHEN coalesce(p_kind, 'text') IN ('text', 'button', 'other')
      THEN coalesce(nullif(v.b, ''), CASE WHEN p_kind = 'button' THEN 'Tapped a button' ELSE 'New message' END)
    ELSE coalesce(CASE p_kind
        WHEN 'image' THEN '📷 Photo' WHEN 'video' THEN '🎥 Video' WHEN 'audio' THEN '🎤 Voice message'
        WHEN 'document' THEN '📄 Document' WHEN 'sticker' THEN 'Sticker' WHEN 'location' THEN '📍 Location'
        WHEN 'template' THEN 'Template message' END, 'New message')
      || coalesce(' · ' || nullif(v.b, ''), '')
  END, 300)
  FROM (SELECT btrim(regexp_replace(regexp_replace(coalesce(p_body, ''), '\*([^*\n]+)\*', '\1', 'g'), '\s+', ' ', 'g')) AS b) v
$fn$;

-- Who the customer is to the phone: their name, else their number.
CREATE OR REPLACE FUNCTION public.notify_crm_name(p_name text, p_phone text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $fn$
  SELECT left(coalesce(nullif(btrim(p_name), ''), nullif(btrim(p_phone), ''), 'Customer'), 100)
$fn$;

-- The logins of these people (their own, linked in People), active ones only.
CREATE OR REPLACE FUNCTION public.notify_crm_logins(p_staff uuid[])
RETURNS uuid[]
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  SELECT coalesce(array_agg(DISTINCT s.user_id), '{}'::uuid[])
    FROM public.hr_staff_costs s
   WHERE s.id = ANY (coalesce(p_staff, '{}'::uuid[])) AND s.status = 'active' AND s.user_id IS NOT NULL
$fn$;

-- ── Writing a notice (only the triggers call it) ────────────────────────────

-- As notify_people (20261011180000), with kind 'crm' and what the phone draws.
CREATE OR REPLACE FUNCTION public.notify_crm_people(p_users uuid[], p_title text, p_body text, p_ref_kind text, p_ref_id text, p_data jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.app_notifications (user_id, kind, title, body, ref_kind, ref_id, data)
  SELECT u.id, 'crm', left(coalesce(nullif(btrim(p_title), ''), 'Customer'), 200), left(coalesce(p_body, ''), 400), p_ref_kind, p_ref_id, p_data
    FROM public.users u
   WHERE u.id IN (SELECT DISTINCT x FROM unnest(p_users) x WHERE x IS NOT NULL)
     AND u.is_active
     AND u.id IS DISTINCT FROM auth.uid();
END
$fn$;

REVOKE ALL ON FUNCTION public.notify_crm_preview(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_crm_name(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_crm_logins(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_crm_people(uuid[], text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_crm_preview(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_crm_name(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_crm_logins(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_crm_people(uuid[], text, text, text, text, jsonb) TO service_role;

-- ── 1. A customer's message ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_crm_message()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  c      public.crm_contacts;
  v_name text;
  v_line text;
  v_who  uuid[];
BEGIN
  SELECT * INTO c FROM public.crm_contacts WHERE id = NEW.contact_id;
  IF c.id IS NULL OR c.assigned_to IS NULL THEN
    RETURN NULL;
  END IF;
  v_who := ARRAY(
    SELECT w.staff
      FROM (SELECT c.assigned_to AS staff UNION SELECT sh.staff_id FROM public.crm_contact_shares sh WHERE sh.contact_id = c.id) w
     WHERE NOT EXISTS (SELECT 1 FROM public.crm_contact_prefs p
                        WHERE p.staff_id = w.staff AND p.contact_id = c.id AND (p.muted OR p.hidden OR p.blocked)));
  v_name := public.notify_crm_name(c.name, c.phone);
  v_line := public.notify_crm_preview(NEW.kind, NEW.body);
  PERFORM public.notify_crm_people(public.notify_crm_logins(v_who), v_name, v_line, 'crm_contact', c.id::text,
    jsonb_build_object('ch', c.channel, 'name', v_name, 'line', v_line, 'at', coalesce(NEW.sent_at, NEW.created_at, now())));
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_crm_message: %', SQLERRM;
  RETURN NULL;
END
$fn$;

CREATE OR REPLACE TRIGGER crm_messages_notify
AFTER INSERT ON public.crm_messages
FOR EACH ROW WHEN (NEW.direction = 'in') EXECUTE FUNCTION public.notify_crm_message();

-- ── 2–5. What the CRM's journey records about somebody's customer ──────────

CREATE OR REPLACE FUNCTION public.notify_crm_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  c       public.crm_contacts;
  v_name  text;
  v_actor text;
  v_title text;
  v_body  text;
  v_line  text;
  v_when  text;
  v_room  text;
  v_to    uuid := NEW.owner;
  v_ref   text := 'crm_contact';
  v_at    timestamptz := coalesce(NEW.at, now());
BEGIN
  SELECT * INTO c FROM public.crm_contacts WHERE id = NEW.contact_id;
  IF c.id IS NULL THEN
    RETURN NULL;
  END IF;
  v_name := public.notify_crm_name(c.name, c.phone);
  v_title := v_name;
  SELECT coalesce(nullif(btrim(s.employee_name), ''), 'Someone') INTO v_actor FROM public.hr_staff_costs s WHERE s.id = NEW.actor;
  v_actor := coalesce(v_actor, 'Someone');
  IF NEW.kind = 'assigned' THEN
    IF NEW.actor IS NULL THEN
      SELECT public.notify_crm_preview(m.kind, m.body), coalesce(m.sent_at, v_at) INTO v_body, v_at
        FROM public.crm_messages m
       WHERE m.contact_id = c.id AND m.direction = 'in'
       ORDER BY m.sent_at DESC NULLS LAST, m.created_at DESC
       LIMIT 1;
      v_at := coalesce(v_at, NEW.at, now());
      v_body := coalesce(v_body, 'From ' || coalesce(nullif(btrim(c.ad_headline), ''), 'an ad'));
      v_title := 'New lead · ' || v_name;
      v_line := 'New lead · ' || v_body;
    ELSE
      v_body := v_actor || ' assigned this customer to you';
    END IF;
  ELSIF NEW.kind IN ('appt_booked', 'appt_changed', 'appt_cancelled') THEN
    SELECT r.name INTO v_room FROM public.crm_showrooms r WHERE r.id = NEW.data ->> 'showroom';
    v_room := coalesce(v_room, NEW.data ->> 'showroom');
    v_when := to_char((NEW.data ->> 'start')::timestamptz AT TIME ZONE 'Asia/Kuala_Lumpur', 'Dy FMDD Mon, FMHH12:MI am');
    v_body := v_actor || CASE NEW.kind
      WHEN 'appt_booked' THEN ' booked a visit · ' || concat_ws(' · ', v_when, v_room)
      WHEN 'appt_changed' THEN ' moved the visit to ' || concat_ws(' · ', v_when, v_room)
      ELSE ' cancelled the visit · ' || coalesce(v_when, '') END;
  ELSIF NEW.kind = 'reminded' THEN
    v_body := v_actor || ' reminded you to reply';
  ELSIF NEW.kind IN ('shared', 'share_declined', 'move_declined')
     OR (NEW.kind = 'moved' AND NOT coalesce((NEW.data ->> 'by_manager')::boolean, false)) THEN
    v_to := (NEW.data ->> 'from')::uuid;
    v_ref := 'crm_invite';
    v_title := v_actor || CASE NEW.kind
      WHEN 'shared' THEN ' accepted your share invite'
      WHEN 'moved' THEN ' accepted your move request'
      WHEN 'share_declined' THEN ' declined your share invite'
      ELSE ' declined your move request' END;
    v_body := v_name;
    v_line := v_title;
  ELSE
    RETURN NULL;
  END IF;
  IF v_to IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM public.notify_crm_people(public.notify_crm_logins(ARRAY[v_to]), v_title, v_body, v_ref,
    CASE WHEN v_ref = 'crm_invite' THEN 'e' || NEW.id::text ELSE c.id::text END,
    jsonb_build_object('ch', c.channel, 'name', v_name, 'line', coalesce(v_line, v_body), 'at', v_at));
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_crm_event: %', SQLERRM;
  RETURN NULL;
END
$fn$;

CREATE OR REPLACE TRIGGER crm_events_notify
AFTER INSERT ON public.crm_events
FOR EACH ROW
WHEN (NEW.kind IN ('assigned', 'appt_booked', 'appt_changed', 'appt_cancelled', 'reminded', 'shared', 'moved', 'share_declined', 'move_declined'))
EXECUTE FUNCTION public.notify_crm_event();

-- ── 5. An invitation to share a chat or take a lead ────────────────────────

CREATE OR REPLACE FUNCTION public.notify_crm_invite()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_from  text;
  v_ch    text;
  v_name  text;
  v_title text;
BEGIN
  IF NEW.state IS DISTINCT FROM 'pending' OR (TG_OP = 'UPDATE' AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at) THEN
    RETURN NULL;
  END IF;
  SELECT coalesce(nullif(btrim(s.employee_name), ''), 'Someone') INTO v_from FROM public.hr_staff_costs s WHERE s.id = NEW.from_staff;
  SELECT c.channel INTO v_ch FROM public.crm_contacts c WHERE c.id = NEW.contact_id;
  v_name := public.notify_crm_name(NEW.contact_name, NULL);
  v_title := coalesce(v_from, 'Someone') || CASE NEW.kind WHEN 'share' THEN ' invited you to a chat' ELSE ' wants to move a lead to you' END;
  PERFORM public.notify_crm_people(public.notify_crm_logins(ARRAY[NEW.to_staff]), v_title, v_name, 'crm_invite', 'i' || NEW.id::text,
    jsonb_build_object('ch', v_ch, 'name', v_name, 'line', v_title, 'at', coalesce(NEW.created_at, now())));
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_crm_invite: %', SQLERRM;
  RETURN NULL;
END
$fn$;

CREATE OR REPLACE TRIGGER crm_invites_notify
AFTER INSERT OR UPDATE OF created_at ON public.crm_invites
FOR EACH ROW EXECUTE FUNCTION public.notify_crm_invite();

-- The triggers' own, as the CRM's journey triggers are: nobody calls them.
REVOKE ALL ON FUNCTION public.notify_crm_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_crm_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_crm_invite() FROM PUBLIC, anon, authenticated;

-- ── The bells leave them out; the outbox hands the phone what it draws ─────

-- Production's body, one statement swapped (the helper of 20261011150000).
CREATE OR REPLACE FUNCTION pg_temp.swap_check(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_pat   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;
  END IF;
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: its statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

SELECT pg_temp.swap_check('public.notifications_mine(integer)'::regprocedure,
  'WHERE n.user_id = v_me AND n.read_at IS NULL',
  'WHERE n.user_id = v_me AND n.read_at IS NULL AND n.kind <> ''crm''');
SELECT pg_temp.swap_check('public.notifications_mine(integer)'::regprocedure,
  'WHERE x.user_id = v_me',
  'WHERE x.user_id = v_me AND x.kind <> ''crm''');
SELECT pg_temp.swap_check('public.push_outbox_take(text, integer)'::regprocedure,
  '''refKind'', n.ref_kind, ''refId'', n.ref_id,',
  '''refKind'', n.ref_kind, ''refId'', n.ref_id, ''data'', n.data,');
