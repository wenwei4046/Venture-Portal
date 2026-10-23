-- CRM redesign v2 · frame 10 Settings (2026-10-23; note 05 › "turn on every lock we control"):
--   * Team inbox alerts — a manager's CRM alerts also tell of their own people's chats (the Inbox's scope). Stored here;
--     the screens draw the alerts (panel/vm/notifs.ts). Default OFF: the owner's 2026-10-16 rule ("notification 只跳关于
--     自己的") stands until they switch it on.
--   * Send auto-reply — off: no auto-reply for anyone, even one set in a Profile (crm_auto_reply_due returns nothing).
-- crm_save_settings gets a NINE-argument twin (no defaults, so no call matches both); the seven-argument one stays for a
-- page open across the release and leaves the two new columns as they are. crm_settings_read and crm_auto_reply_due are
-- rewritten from PRODUCTION's bodies (md5 d5af5ac5… and 2442eb41…), one change each.

alter table public.crm_settings add column if not exists team_alerts boolean not null default false;
alter table public.crm_settings add column if not exists send_auto_reply boolean not null default true;

create or replace function public.crm_save_settings(p_soon integer, p_urgent integer, p_overdue integer, p_suggest boolean, p_auto boolean, p_push boolean, p_reminders boolean, p_team_alerts boolean, p_send_auto boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
begin
  if not crm_manages() then perform crm_deny('change the CRM''s settings'); end if;
  if p_soon is null or p_urgent is null or p_overdue is null or p_suggest is null or p_auto is null or p_push is null or p_reminders is null
     or p_team_alerts is null or p_send_auto is null then
    raise exception 'Every setting needs a value.' using errcode = '22023';
  end if;
  if not (p_soon between 1 and 23 and p_urgent > p_soon and p_overdue > p_urgent and p_overdue <= 24) then
    raise exception 'Reply soon, Urgent and Overdue must rise, from 1 to 24 hours.' using errcode = '22023';
  end if;
  insert into crm_settings (id, reply_soon_h, reply_urgent_h, reply_overdue_h, suggest_template, auto_assign, push_messages, reminders, team_alerts, send_auto_reply, updated_by, updated_at)
  values (true, p_soon, p_urgent, p_overdue, p_suggest, p_auto, p_push, p_reminders, p_team_alerts, p_send_auto, crm_me(), now())
  on conflict (id) do update set reply_soon_h = excluded.reply_soon_h, reply_urgent_h = excluded.reply_urgent_h,
    reply_overdue_h = excluded.reply_overdue_h, suggest_template = excluded.suggest_template, auto_assign = excluded.auto_assign,
    push_messages = excluded.push_messages, reminders = excluded.reminders, team_alerts = excluded.team_alerts, send_auto_reply = excluded.send_auto_reply,
    updated_by = excluded.updated_by, updated_at = now();
  return crm_settings_read();
end $function$;
revoke all on function public.crm_save_settings(integer, integer, integer, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.crm_save_settings(integer, integer, integer, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.crm_settings_read()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s crm_settings;
begin
  if crm_my_role() is null then return null; end if;
  select * into s from crm_settings where id;
  return jsonb_build_object(
    'replySoonH', coalesce(s.reply_soon_h, 3), 'replyUrgentH', coalesce(s.reply_urgent_h, 6), 'replyOverdueH', coalesce(s.reply_overdue_h, 9),
    'suggestTemplate', coalesce(s.suggest_template, true), 'autoAssign', coalesce(s.auto_assign, true),
    'pushMessages', coalesce(s.push_messages, true), 'reminders', coalesce(s.reminders, true),
    'teamAlerts', coalesce(s.team_alerts, false), 'sendAutoReply', coalesce(s.send_auto_reply, true));
end $function$;

CREATE OR REPLACE FUNCTION public.crm_auto_reply_due(p_channel text, p_external_ids text[])
 RETURNS TABLE(message_id uuid, contact_id uuid, account_id text, customer text, body text, sent_at timestamp with time zone, first boolean, settings jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.id, c.id, c.account_id, c.external_id, coalesce(m.body, ''), m.sent_at,
         not exists (select 1 from crm_messages e where e.contact_id = c.id and e.direction = 'in' and e.id <> m.id
                       and (e.sent_at < m.sent_at or (e.sent_at = m.sent_at and e.created_at < m.created_at))),
         a.settings
    from crm_messages m
    join crm_contacts c on c.id = m.contact_id
    join crm_auto_replies a on a.staff_id = c.assigned_to
   where m.direction = 'in' and c.channel = p_channel
     and m.external_id = any (coalesce(p_external_ids, '{}'))
     and c.status is distinct from 'lost'
     and not exists (select 1 from crm_contact_prefs p where p.contact_id = c.id and p.staff_id = c.assigned_to and p.blocked)
     and coalesce((select s.send_auto_reply from crm_settings s where s.id), true)
   order by m.sent_at, m.created_at
$function$;
