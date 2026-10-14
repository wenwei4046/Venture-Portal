-- Mark a chat as unread, as WhatsApp's swipe right does (the owner, 2026-10-14: "聊天對話往右滑能 unread & unpin";
-- "好，加上 Unread，做吧"). Each person's own mark, kept beside their pins and mutes in crm_contact_prefs — their view,
-- not a record (audit_tables mode 'none' already says so for the table). Opening the chat takes the mark off.
--
-- crm_set_pref gains p_marked_unread as a NEW eight-argument function written from production's body
-- (md5(prosrc) 9999f80cf94fa9a281ac57568ee60eb3, checked 2026-10-14) with one column added. The seven-argument one stays
-- as it is, so a page opened before the release keeps saving pins: PostgREST picks a function by the argument names
-- sent, and the app sends all eight from now on. The new one has no defaults, so no call can match both.
-- (Named without "_crm_" so the CRM's PGlite checks, which load every migration so named, do not load it; it only adds.)

ALTER TABLE public.crm_contact_prefs ADD COLUMN IF NOT EXISTS marked_unread boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.crm_set_pref(p_contact uuid, p_pinned boolean, p_muted boolean, p_hidden boolean, p_blocked boolean, p_pinned_message uuid, p_clear_pinned_message boolean, p_marked_unread boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := crm_me();
  r crm_contact_prefs;
begin
  if v_me is null or not exists (select 1 from crm_contacts c where c.id = p_contact
       and (crm_can_see(c.assigned_to, c.team_id) or c.id in (select crm_my_shares()))) then
    perform crm_deny('change this chat');
  end if;
  if p_pinned_message is not null and not exists (select 1 from crm_messages where id = p_pinned_message and contact_id = p_contact) then
    raise exception 'That message is not in this chat.' using errcode = '22023';
  end if;
  insert into crm_contact_prefs as x (staff_id, contact_id, pinned, muted, hidden, blocked, pinned_message_id, marked_unread)
  values (v_me, p_contact, coalesce(p_pinned, false), coalesce(p_muted, false), coalesce(p_hidden, false), coalesce(p_blocked, false), p_pinned_message, coalesce(p_marked_unread, false))
  on conflict (staff_id, contact_id) do update set
    pinned = coalesce(p_pinned, x.pinned), muted = coalesce(p_muted, x.muted),
    hidden = coalesce(p_hidden, x.hidden), blocked = coalesce(p_blocked, x.blocked),
    pinned_message_id = case when coalesce(p_clear_pinned_message, false) then null else coalesce(p_pinned_message, x.pinned_message_id) end,
    marked_unread = coalesce(p_marked_unread, x.marked_unread),
    updated_at = now()
  returning * into r;
  return to_jsonb(r);
end $function$;

REVOKE ALL ON FUNCTION public.crm_set_pref(uuid, boolean, boolean, boolean, boolean, uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_set_pref(uuid, boolean, boolean, boolean, boolean, uuid, boolean, boolean) TO authenticated, service_role;
