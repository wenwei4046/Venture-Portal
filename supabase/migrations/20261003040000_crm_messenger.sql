-- CRM channels, the second one: Messenger on our Facebook Pages (2026-10-03).
--
-- The same Meta app and the same machine-ingest exception as WhatsApp (user
-- approved Messenger 2026-10-01). /api/messenger/v1/webhook checks Meta's
-- signature and calls crm_ingest_messenger — the ONE writer for Page
-- deliveries — with the service role. It mirrors crm_ingest_whatsapp:
--   - a re-delivery changes nothing; a Won/Lost customer who writes again
--     comes back to Follow up; the first ad that brought them is kept;
--   - a NEW customer is dealt at once (crm_assign_contact, mig 20261003020000);
--   - every new message adds to the unread count;
--   - our messages move to delivered (by mid) and read (everything up to the
--     customer's read watermark), never back;
--   - every delivery is logged in crm_channel_events.
-- One customer per (Page, PSID): account_id = the Page id, external_id = PSID.
--
-- Add-only: one function.

create or replace function public.crm_ingest_messenger(
  p_messages jsonb, p_delivered jsonb, p_reads jsonb, p_ignored integer, p_payload jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m jsonb;
  r jsonb;
  v_contact uuid;
  v_created boolean;
  v_new int := 0;
  v_dup int := 0;
  v_status int := 0;
  v_assigned int := 0;
  v_rows int;
  v_counts jsonb;
begin
  for m in select * from jsonb_array_elements(coalesce(p_messages, '[]'::jsonb)) loop
    if exists (select 1 from crm_messages where external_id = m->>'externalId') then
      v_dup := v_dup + 1;
      continue;
    end if;

    insert into crm_contacts as c (channel, account_id, external_id, name, ad_source_id, ad_headline, ad_source_url, last_customer_at)
    values ('messenger', m->>'pageId', m->>'psid', nullif(m->>'name', ''),
            m->'ad'->>'sourceId', m->'ad'->>'headline', m->'ad'->>'sourceUrl', (m->>'sentAt')::timestamptz)
    on conflict (channel, account_id, external_id) do update set
      name             = coalesce(excluded.name, c.name),
      ad_source_id     = coalesce(c.ad_source_id, excluded.ad_source_id),
      ad_headline      = coalesce(c.ad_headline, excluded.ad_headline),
      ad_source_url    = coalesce(c.ad_source_url, excluded.ad_source_url),
      last_customer_at = greatest(c.last_customer_at, excluded.last_customer_at),
      previous_status  = case when c.status in ('won', 'lost') then c.status else c.previous_status end,
      status           = case when c.status in ('won', 'lost') then 'follow_up' else c.status end
    returning id, (xmax = 0) into v_contact, v_created;

    insert into crm_messages (contact_id, external_id, direction, kind, body, status, sent_at)
    values (v_contact, m->>'externalId', 'in', coalesce(m->>'kind', 'other'), m->>'body', 'received', (m->>'sentAt')::timestamptz)
    on conflict (external_id) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      v_new := v_new + 1;
      update crm_contacts set unread = unread + 1 where id = v_contact;
      if v_created and (crm_assign_contact(v_contact) ->> 'assigned')::boolean then
        v_assigned := v_assigned + 1;
      end if;
    else
      v_dup := v_dup + 1;
    end if;
  end loop;

  -- Delivered: by mid, only forward (never undoing a read).
  for r in select * from jsonb_array_elements(coalesce(p_delivered, '[]'::jsonb)) loop
    update crm_messages set status = 'delivered'
     where external_id = r->>'externalId' and direction = 'out' and coalesce(status, 'sent') = 'sent';
    get diagnostics v_rows = row_count;
    v_status := v_status + v_rows;
  end loop;

  -- Read: everything we sent that customer up to the watermark.
  for r in select * from jsonb_array_elements(coalesce(p_reads, '[]'::jsonb)) loop
    update crm_messages x set status = 'read'
      from crm_contacts c
     where c.id = x.contact_id and c.channel = 'messenger' and c.account_id = r->>'pageId' and c.external_id = r->>'psid'
       and x.direction = 'out' and x.sent_at <= (r->>'watermark')::timestamptz and coalesce(x.status, 'sent') in ('sent', 'delivered');
    get diagnostics v_rows = row_count;
    v_status := v_status + v_rows;
  end loop;

  v_counts := jsonb_build_object('messages', v_new, 'duplicates', v_dup, 'statuses', v_status, 'ignored', coalesce(p_ignored, 0), 'assigned', v_assigned);
  insert into crm_channel_events (channel, status, counts, payload)
  values ('messenger',
          case when v_new > 0 or v_status > 0 then 'applied' when v_dup > 0 then 'duplicate' else 'ignored' end,
          v_counts, p_payload);
  return v_counts;
end $$;

revoke all on function public.crm_ingest_messenger(jsonb, jsonb, jsonb, integer, jsonb) from public, anon, authenticated;
grant execute on function public.crm_ingest_messenger(jsonb, jsonb, jsonb, integer, jsonb) to service_role;
