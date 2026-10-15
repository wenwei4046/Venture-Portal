-- More of a salesperson's own CRM reaches their phone (2026-10-15; the owner: "關於 notification 只要是關於到業務員本身的
-- （appt, upcoming, chat）都要通知"). The hourly sweep notify_crm_due() (mig 20261014240000) told them of a visit
-- tomorrow whose reminder had not gone, and of a chat waiting 3 h · 6 h · 9 h for their reply. Now also:
--   1. a visit tomorrow whether or not the reminder went ("· reminder sent");
--   3. a visit TODAY starting within 2 hours;
--   4. a visit gone by an hour or more (up to 3 days) still marked booked — mark whether they came;
--   5. a chat whose 24-hour window shuts within 3 hours (the customer's last message 21–24 h ago, not won / lost).
-- Each once (its key in data.due), never while its person muted, hid or blocked the chat, to their own login only
-- (notify_crm_logins) — as the two before. The screen lists the same (sales/vm/notifs.ts).
-- Built from PRODUCTION's body (md5 da6e0cfd0e1697ce11e1822e3282ac94): three anchors, each refused unless found exactly once.

do $migration$
declare
  v_def text;
  v_a1 constant text := $q$WHERE a.state = 'booked' AND a.reminded_at IS NULL AND c.assigned_to IS NOT NULL$q$;
  v_b1 constant text := $q$WHERE a.state = 'booked' AND c.assigned_to IS NOT NULL$q$;
  v_a2 constant text := $q$SELECT a.id, a.start_at, a.showroom, c.id AS contact_id$q$;
  v_b2 constant text := $q$SELECT a.id, a.start_at, a.showroom, a.reminded_at, c.id AS contact_id$q$;
  v_a3 constant text := $q$) || ' — send the customer a reminder';$q$;
  v_b3 constant text := $q$) || CASE WHEN r.reminded_at IS NULL THEN ' — send the customer a reminder' ELSE ' · reminder sent' END;$q$;
  v_a4 constant text := E'  RETURN v_n;\nEND';
  v_b4 constant text := $q$
  -- 3. A visit today, starting within 2 hours.
  FOR r IN
    SELECT a.id, a.start_at, a.showroom, a.reminded_at, c.id AS contact_id, c.name, c.phone, c.channel, c.assigned_to
      FROM public.crm_appointments a
      JOIN public.crm_contacts c ON c.id = a.contact_id
     WHERE a.state = 'booked' AND c.assigned_to IS NOT NULL
       AND a.start_at > v_now AND a.start_at <= v_now + interval '2 hours'
       AND NOT EXISTS (SELECT 1 FROM public.crm_contact_prefs p
                        WHERE p.staff_id = c.assigned_to AND p.contact_id = c.id AND (p.muted OR p.hidden OR p.blocked))
  LOOP
    v_key := 'soon:' || r.id || ':' || extract(epoch FROM r.start_at)::bigint;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.app_notifications n WHERE n.kind = 'crm' AND n.data ->> 'due' = v_key);
    v_name := public.notify_crm_name(r.name, r.phone);
    v_body := 'Visit today · ' || concat_ws(' · ',
      to_char(r.start_at AT TIME ZONE 'Asia/Kuala_Lumpur', 'FMHH12:MI am'),
      (SELECT s.name FROM public.crm_showrooms s WHERE s.id = r.showroom))
      || CASE WHEN r.reminded_at IS NULL THEN ' — send the customer a reminder' ELSE '' END;
    PERFORM public.notify_crm_people(public.notify_crm_logins(ARRAY[r.assigned_to]), v_name, v_body, 'crm_contact', r.contact_id::text,
      jsonb_build_object('ch', r.channel, 'name', v_name, 'line', v_body, 'at', v_now, 'due', v_key));
    v_n := v_n + 1;
  END LOOP;

  -- 4. A visit gone by an hour or more, still booked: mark whether they came.
  FOR r IN
    SELECT a.id, a.start_at, c.id AS contact_id, c.name, c.phone, c.channel, c.assigned_to
      FROM public.crm_appointments a
      JOIN public.crm_contacts c ON c.id = a.contact_id
     WHERE a.state = 'booked' AND c.assigned_to IS NOT NULL
       AND a.start_at <= v_now - interval '1 hour' AND a.start_at > v_now - interval '3 days'
       AND NOT EXISTS (SELECT 1 FROM public.crm_contact_prefs p
                        WHERE p.staff_id = c.assigned_to AND p.contact_id = c.id AND (p.muted OR p.hidden OR p.blocked))
  LOOP
    v_key := 'mark:' || r.id || ':' || extract(epoch FROM r.start_at)::bigint;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.app_notifications n WHERE n.kind = 'crm' AND n.data ->> 'due' = v_key);
    v_name := public.notify_crm_name(r.name, r.phone);
    v_body := 'Visit at ' || to_char(r.start_at AT TIME ZONE 'Asia/Kuala_Lumpur', 'FMHH12:MI am') || ' has passed — mark whether they came';
    PERFORM public.notify_crm_people(public.notify_crm_logins(ARRAY[r.assigned_to]), v_name, v_body, 'crm_contact', r.contact_id::text,
      jsonb_build_object('ch', r.channel, 'name', v_name, 'line', v_body, 'at', v_now, 'due', v_key));
    v_n := v_n + 1;
  END LOOP;

  -- 5. A chat whose 24-hour window shuts within 3 hours.
  FOR r IN
    SELECT c.id AS contact_id, c.name, c.phone, c.channel, c.assigned_to, c.last_customer_at
      FROM public.crm_contacts c
     WHERE c.assigned_to IS NOT NULL AND c.status NOT IN ('won', 'lost')
       AND c.last_customer_at <= v_now - interval '21 hours' AND c.last_customer_at > v_now - interval '24 hours'
       AND NOT EXISTS (SELECT 1 FROM public.crm_contact_prefs p
                        WHERE p.staff_id = c.assigned_to AND p.contact_id = c.id AND (p.muted OR p.hidden OR p.blocked))
  LOOP
    v_key := 'window:' || r.contact_id || ':' || extract(epoch FROM r.last_customer_at)::bigint;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.app_notifications n WHERE n.kind = 'crm' AND n.data ->> 'due' = v_key);
    v_name := public.notify_crm_name(r.name, r.phone);
    v_body := 'Chat closes in ' || greatest(1, ceil(extract(epoch FROM r.last_customer_at + interval '24 hours' - v_now) / 3600))::int
      || ' h — reply before the 24-hour window shuts';
    PERFORM public.notify_crm_people(public.notify_crm_logins(ARRAY[r.assigned_to]), v_name, v_body, 'crm_contact', r.contact_id::text,
      jsonb_build_object('ch', r.channel, 'name', v_name, 'line', v_body, 'at', v_now, 'due', v_key));
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END$q$;
  v_once text;
begin
  select pg_get_functiondef('public.notify_crm_due()'::regprocedure) into v_def;
  foreach v_once in array array[v_a1, v_a2, v_a3, v_a4] loop
    if (length(v_def) - length(replace(v_def, v_once, ''))) / length(v_once) <> 1 then
      raise exception 'notify_crm_due: % is not there exactly once', left(v_once, 60);
    end if;
  end loop;
  v_def := replace(replace(replace(replace(v_def, v_a1, v_b1), v_a2, v_b2), v_a3, v_b3), v_a4, v_b4);
  execute v_def;
end
$migration$;
