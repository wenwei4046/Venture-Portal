-- Settings are read only by somebody IN the CRM (2026-10-18, the owner: "Kris不用读"). crm_settings_read() asked crm_me()
-- — CRM · View — and KRIS (Fair's director) holds View though IR's CRM does not place him (crm_my_role() is null), so he
-- read the seven settings. It asks crm_my_role() now, the CRM's own answer to who is in it; everything else is the body
-- of mig 20261018100000 as production runs it (md5 cfc942be…). Nobody else moves: everybody the CRM places has a role.

create or replace function public.crm_settings_read()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s crm_settings;
begin
  if crm_my_role() is null then return null; end if;
  select * into s from crm_settings where id;
  return jsonb_build_object(
    'replySoonH', coalesce(s.reply_soon_h, 3), 'replyUrgentH', coalesce(s.reply_urgent_h, 6), 'replyOverdueH', coalesce(s.reply_overdue_h, 9),
    'suggestTemplate', coalesce(s.suggest_template, true), 'autoAssign', coalesce(s.auto_assign, true),
    'pushMessages', coalesce(s.push_messages, true), 'reminders', coalesce(s.reminders, true));
end $$;

revoke execute on function public.crm_settings_read() from public, anon;
grant execute on function public.crm_settings_read() to authenticated;
