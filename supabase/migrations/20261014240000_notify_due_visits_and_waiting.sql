-- ============================================================================
-- 20261014240000_notify_due_visits_and_waiting.sql
-- The phone is told what the CRM's bell already shows (the owner, 2026-10-14:
-- "notification 要包含 upcoming appt 可以提前 1 天，notification 就是通知業務去
-- send reminder 給客戶"; "有 3h, 6h, 9h 未回復的也有 notification 提醒，要儘快回復";
-- then "是的" to pushing both to the phone):
--   1. a visit TOMORROW (the office's day) whose reminder has not gone yet →
--      its customer's person, once, from 9:00 the day before;
--   2. a chat waiting for its person's reply past 3 h · 6 h · 9 h (the last
--      message not an auto-reply is the customer's — lib/member/crm.ts ›
--      replyUrgency; not Won / Lost; not past the 24-hour window) → its person,
--      once a line, the highest line it has crossed; a reply ends it.
-- Not while they muted, hid or blocked the chat (as a message's notice).
--
-- notify_crm_due() writes them as every CRM notice is written (notify_crm_people,
-- kind 'crm', ref crm_contact → the chat), its key in data.due so the hourly
-- sweep (app/api/member-queue) never tells twice; the sweep's flushPush then
-- sends them. SECURITY DEFINER, the service role's alone: nobody signed in
-- calls it. Named without "_crm_" after the timestamp: the CRM's PGlite checks
-- load every 2026…_crm_*.sql, and this one needs the notifications tables.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_crm_due()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_now   timestamptz := now();
  v_local timestamp := now() AT TIME ZONE 'Asia/Kuala_Lumpur';
  v_n     integer := 0;
  r       record;
  v_name  text;
  v_key   text;
  v_body  text;
  v_h     integer;
BEGIN
  -- 1. Visits tomorrow, from 9:00 the day before.
  IF extract(hour FROM v_local) >= 9 THEN
    FOR r IN
      SELECT a.id, a.start_at, a.showroom, c.id AS contact_id, c.name, c.phone, c.channel, c.assigned_to
        FROM public.crm_appointments a
        JOIN public.crm_contacts c ON c.id = a.contact_id
       WHERE a.state = 'booked' AND a.reminded_at IS NULL AND c.assigned_to IS NOT NULL
         AND (a.start_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date = v_local::date + 1
         AND NOT EXISTS (SELECT 1 FROM public.crm_contact_prefs p
                          WHERE p.staff_id = c.assigned_to AND p.contact_id = c.id AND (p.muted OR p.hidden OR p.blocked))
    LOOP
      v_key := 'visit:' || r.id || ':' || extract(epoch FROM r.start_at)::bigint;
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.app_notifications n WHERE n.kind = 'crm' AND n.data ->> 'due' = v_key);
      v_name := public.notify_crm_name(r.name, r.phone);
      v_body := 'Visit tomorrow · ' || concat_ws(' · ',
        to_char(r.start_at AT TIME ZONE 'Asia/Kuala_Lumpur', 'Dy FMDD Mon, FMHH12:MI am'),
        (SELECT s.name FROM public.crm_showrooms s WHERE s.id = r.showroom)) || ' — send the customer a reminder';
      PERFORM public.notify_crm_people(public.notify_crm_logins(ARRAY[r.assigned_to]), v_name, v_body, 'crm_contact', r.contact_id::text,
        jsonb_build_object('ch', r.channel, 'name', v_name, 'line', v_body, 'at', v_now, 'due', v_key));
      v_n := v_n + 1;
    END LOOP;
  END IF;

  -- 2. Chats waiting for their person's reply past 3 h · 6 h · 9 h.
  FOR r IN
    SELECT c.id AS contact_id, c.name, c.phone, c.channel, c.assigned_to, m.id AS msg_id, m.kind, m.body,
           coalesce(m.sent_at, m.created_at) AS at
      FROM public.crm_contacts c
      CROSS JOIN LATERAL (
        SELECT x.id, x.direction, x.kind, x.body, x.sent_at, x.created_at
          FROM public.crm_messages x
         WHERE x.contact_id = c.id AND NOT coalesce(x.auto, false)
         ORDER BY coalesce(x.sent_at, x.created_at) DESC
         LIMIT 1) m
     WHERE c.assigned_to IS NOT NULL AND c.status NOT IN ('won', 'lost') AND m.direction = 'in'
       AND coalesce(m.sent_at, m.created_at) <= v_now - interval '3 hours'
       AND coalesce(c.last_customer_at, coalesce(m.sent_at, m.created_at)) > v_now - interval '24 hours'
       AND NOT EXISTS (SELECT 1 FROM public.crm_contact_prefs p
                        WHERE p.staff_id = c.assigned_to AND p.contact_id = c.id AND (p.muted OR p.hidden OR p.blocked))
  LOOP
    v_h := CASE WHEN r.at <= v_now - interval '9 hours' THEN 9 WHEN r.at <= v_now - interval '6 hours' THEN 6 ELSE 3 END;
    v_key := 'wait:' || r.contact_id || ':' || r.msg_id || ':' || v_h;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.app_notifications n WHERE n.kind = 'crm' AND n.data ->> 'due' = v_key);
    v_name := public.notify_crm_name(r.name, r.phone);
    v_body := CASE v_h WHEN 9 THEN 'Overdue · waiting ' || floor(extract(epoch FROM v_now - r.at) / 3600)::int || ' h for your reply'
                       WHEN 6 THEN 'Urgent · waiting 6 h for your reply'
                       ELSE 'Waiting for your reply · 3 h' END
              || ' · ' || public.notify_crm_preview(r.kind, r.body);
    PERFORM public.notify_crm_people(public.notify_crm_logins(ARRAY[r.assigned_to]), v_name, v_body, 'crm_contact', r.contact_id::text,
      jsonb_build_object('ch', r.channel, 'name', v_name, 'line', v_body, 'at', v_now, 'due', v_key));
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$fn$;

REVOKE ALL ON FUNCTION public.notify_crm_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_crm_due() TO service_role;

-- The sweep's "told already?" asks by key among the CRM's notices.
CREATE INDEX IF NOT EXISTS app_notifications_crm_due ON public.app_notifications ((data ->> 'due')) WHERE kind = 'crm' AND data ? 'due';
