-- CRM, the first write: replying to a customer (2026-10-02).
--
-- The reply is sent to Meta by the server (the token never leaves it), under
-- the member's OWN session — no service role:
--   1. crm_can_reply(contact)  — may this person reply here? asked BEFORE sending;
--   2. the server sends it through the WhatsApp Cloud API;
--   3. crm_record_reply(...)   — asks again, then keeps the message with Meta's
--      id (wamid), so the webhook's sent / delivered / read / failed find it.
--
-- Who may reply (src/lib/member/crm-team.ts canReply is the twin): the
-- customer's own person, or anyone above them who takes enquiries (TL, TA)
-- or is a Senior TL. Never the Boss or the HOD — they read, they do not reply.
-- A customer still waiting in a TL's list belongs to that TL until assigned.
--
-- Add-only: two functions.

create or replace function public.crm_can_reply(p_contact uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from crm_contacts c
     where c.id = p_contact
       and crm_my_role() in ('stl', 'tl', 'ta', 'rs')
       and coalesce(c.assigned_to, c.team_id) in (select crm_my_downline())
  )
$$;

create or replace function public.crm_record_reply(p_contact uuid, p_external_id text, p_body text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me  uuid := crm_me();
  v_row crm_messages;
begin
  if not crm_can_reply(p_contact) then
    raise exception 'You may not reply to this customer.' using errcode = '42501';
  end if;
  if coalesce(trim(p_external_id), '') = '' or coalesce(trim(p_body), '') = '' then
    raise exception 'A reply needs Meta''s message id and its text.' using errcode = '22023';
  end if;

  insert into crm_messages (contact_id, external_id, direction, kind, body, status, sent_by, sent_at)
  values (p_contact, p_external_id, 'out', 'text', p_body, 'sent', v_me, now())
  on conflict (external_id) do nothing
  returning * into v_row;

  -- Answered: a New customer moves to Follow up, and their own person has read them.
  update crm_contacts
     set last_reply_at = now(),
         status = case when status = 'new' then 'follow_up' else status end,
         unread = case when assigned_to = v_me then 0 else unread end
   where id = p_contact;

  return jsonb_build_object(
    'id', v_row.id, 'contact_id', v_row.contact_id, 'direction', v_row.direction, 'kind', v_row.kind,
    'body', v_row.body, 'status', v_row.status, 'error', v_row.error, 'auto', v_row.auto,
    'sent_by', v_row.sent_by, 'sent_at', v_row.sent_at);
end $$;

revoke all on function public.crm_can_reply(uuid), public.crm_record_reply(uuid, text, text) from public, anon;
grant execute on function public.crm_can_reply(uuid), public.crm_record_reply(uuid, text, text) to authenticated, service_role;
