-- WhatsApp customers who use a username (2026-10-12; user OK the same day: "就空着电话号码可以吗？业务自己手动加").
--
-- Meta now hides the number of a customer who adopted a WhatsApp username: the webhook carries only their
-- business-scoped user ID (BSUID, e.g. "MY.1052914074449222") in messages[].from_user_id / contacts[].user_id. The
-- webhook (lib/whatsapp/webhook.ts) now hands that id in as waId when there is no number, and replies go to it through
-- `recipient` (lib/whatsapp/send.ts). This function stored '+' || waId as the phone, which would read
-- "+MY.1052914074449222": a phone only when waId is digits, else empty — the salesperson adds the number by hand
-- (crm_save_details keeps it; a later delivery never overwrites the phone).
--
-- Production's body of 2026-10-12 (md5(prosrc) 9aaa1f4636f4043b6b174be64effbdfa), one expression swapped.
CREATE OR REPLACE FUNCTION public.crm_ingest_whatsapp(p_messages jsonb, p_statuses jsonb, p_ignored integer, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m jsonb;
  s jsonb;
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

    insert into crm_contacts as c (channel, account_id, external_id, name, phone,
                                   ad_source_id, ad_headline, ad_source_url, last_customer_at)
    values ('whatsapp', m->>'phoneNumberId', m->>'waId', nullif(m->>'name', ''), case when m->>'waId' ~ '^[0-9]+$' then '+' || (m->>'waId') end,
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

    insert into crm_messages (contact_id, external_id, direction, kind, body, media_id, media_mime, status, sent_at)
    values (v_contact, m->>'externalId', 'in', coalesce(m->>'kind', 'other'), m->>'body',
            m->>'mediaId', m->>'mediaMime', 'received', (m->>'sentAt')::timestamptz)
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

  for s in select * from jsonb_array_elements(coalesce(p_statuses, '[]'::jsonb)) loop
    update crm_messages set status = s->>'status', error = coalesce(s->>'error', error)
     where external_id = s->>'externalId' and direction = 'out'
       and (s->>'status' = 'failed'
            or coalesce(array_position(array['sent', 'delivered', 'read'], status), 0)
               < coalesce(array_position(array['sent', 'delivered', 'read'], s->>'status'), 0));
    get diagnostics v_rows = row_count;
    v_status := v_status + v_rows;
  end loop;

  v_counts := jsonb_build_object('messages', v_new, 'duplicates', v_dup, 'statuses', v_status, 'ignored', coalesce(p_ignored, 0), 'assigned', v_assigned);
  insert into crm_channel_events (channel, status, counts, payload)
  values ('whatsapp',
          case when v_new > 0 or v_status > 0 then 'applied' when v_dup > 0 then 'duplicate' else 'ignored' end,
          v_counts, p_payload);
  return v_counts;
end $function$;
