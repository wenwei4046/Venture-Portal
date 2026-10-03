-- A status that beats the reply to the database (2026-10-03, first real
-- Messenger test). sendCrmReply sends, THEN crm_record_reply keeps the
-- message — and Meta's "delivered" for it arrived in between, found no row
-- and was logged as ignored, so the reply sat at "sent" for good.
-- Nothing is lost: every delivery is in crm_channel_events. So when the reply
-- is recorded, crm_early_status looks for its id in the latest deliveries and
-- the row starts at what Meta already said (sent / delivered / read / failed).
--
-- Add-only: one function, crm_record_reply re-stated with it.

create or replace function public.crm_early_status(p_external_id text) returns text
language sql stable security definer set search_path = public as $$
  with recent as (
    select payload from crm_channel_events
     where payload is not null and id > (select coalesce(max(id), 0) - 500 from crm_channel_events)
       and position(p_external_id in payload::text) > 0
  ), said as (
    -- WhatsApp: the status rows that name this wamid.
    select s #>> '{}' as status
      from recent, jsonb_path_query(payload, '$.entry[*].changes[*].value.statuses[*] ? (@.id == $id).status', jsonb_build_object('id', p_external_id)) s
    union all
    -- Messenger: a delivery that names this mid.
    select 'delivered'
      from recent
     where jsonb_path_exists(payload, '$.entry[*].messaging[*].delivery.mids[*] ? (@ == $id)', jsonb_build_object('id', p_external_id))
  )
  select case when bool_or(status = 'failed') then 'failed'
              else (array['sent', 'delivered', 'read'])[max(coalesce(array_position(array['sent', 'delivered', 'read'], status), 1))] end
    from said
   having count(*) > 0
$$;
revoke all on function public.crm_early_status(text) from public, anon, authenticated;

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
  values (p_contact, p_external_id, 'out', 'text', p_body, coalesce(crm_early_status(p_external_id), 'sent'), v_me, now())
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
