-- CRM photos, videos and voice notes (2026-10-13; the user: photos multi-select, shown as pictures for both sides, video
-- from the camera, voice notes — "全部做完").
--
-- 1. crm_messages.media_path: a file we sent, kept in the private bucket crm-media at "<contact id>/<file>"; and
--    crm_messages.media_url: the address Messenger gives for a customer's attachment (WhatsApp gives a media id, which
--    media_id already keeps). The chat reads either through GET /member/crm-media/<message id>, under the member's own
--    session.
-- 2. The bucket crm-media: a member uploads into a customer's folder only while they may reply to that customer
--    (crm_can_reply), and reads it while that customer is theirs to read (crm_contacts' own row policies). Up to 25 MB
--    (Messenger's limit; WhatsApp's 16 MB for video and audio is asked by the server before sending).
-- 3. crm_set_out_media(message, path, mime, caption): after a send, the message we just recorded gets its file, its kind
--    from the file (image / video / audio / document — crm_record_out takes only image and document) and its caption as
--    its words (a document keeps its name). Only our own outgoing message, only a file in that customer's folder, only by
--    someone who may reply to them.
-- 4. crm_ingest_messenger keeps an attachment's address (production's body, md5 556aedee8fb75f65098df5f50d73b2bf; the
--    message insert takes media_url; nothing else moves).

alter table public.crm_messages add column if not exists media_path text;
alter table public.crm_messages add column if not exists media_url text;

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then return; end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  -- Any type (a document can be anything); the chat shows in place only what is safe to (lib/whatsapp/media.ts inlineType).
  values ('crm-media', 'crm-media', false, 25 * 1024 * 1024, null)
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'crm media: read') then
    execute $p$create policy "crm media: read" on storage.objects for select to authenticated
      using (bucket_id = 'crm-media' and exists (select 1 from public.crm_contacts c where c.id::text = (storage.foldername(name))[1]))$p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'crm media: in') then
    execute $p$create policy "crm media: in" on storage.objects for insert to authenticated
      with check (bucket_id = 'crm-media'
                  and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  and public.crm_can_reply(((storage.foldername(name))[1])::uuid))$p$;
  end if;
end $$;

create or replace function public.crm_set_out_media(p_message uuid, p_path text, p_mime text, p_caption text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare m crm_messages;
begin
  select * into m from crm_messages where id = p_message;
  if m.id is null or m.direction <> 'out' then raise exception 'That message is not one we sent.' using errcode = '22023'; end if;
  if not public.crm_can_reply(m.contact_id) then perform crm_deny('send files to this customer'); end if;
  if p_path is null or p_path !~ ('^' || m.contact_id::text || '/[A-Za-z0-9._-]{1,120}$') then
    raise exception 'That file is not in this customer''s folder.' using errcode = '22023';
  end if;
  -- Any file type: what the chat may show in place is decided when it is read (anything else is only a download).
  if coalesce(p_mime, '') !~ '^[a-z]+/[a-z0-9.+-]+$' then
    raise exception 'That kind of file cannot be kept.' using errcode = '22023';
  end if;
  update crm_messages
     set media_path = p_path, media_mime = p_mime,
         kind = case when p_mime like 'image/%' then 'image' when p_mime like 'video/%' then 'video' when p_mime like 'audio/%' then 'audio' else 'document' end,
         body = case when p_mime like 'image/%' or p_mime like 'video/%' or p_mime like 'audio/%' then nullif(left(trim(coalesce(p_caption, '')), 4000), '') else body end
   where id = p_message;
end $function$;
revoke all on function public.crm_set_out_media(uuid, text, text, text) from public, anon;
grant execute on function public.crm_set_out_media(uuid, text, text, text) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.crm_ingest_messenger(p_messages jsonb, p_delivered jsonb, p_reads jsonb, p_ignored integer, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    insert into crm_messages (contact_id, external_id, direction, kind, body, status, sent_at, media_url)
    values (v_contact, m->>'externalId', 'in', coalesce(m->>'kind', 'other'), m->>'body', 'received', (m->>'sentAt')::timestamptz,
            case when m->>'mediaUrl' ~ '^https://[A-Za-z0-9.-]+\.(fbcdn\.net|fbsbx\.com|facebook\.com)/' then m->>'mediaUrl' end)
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

  for r in select * from jsonb_array_elements(coalesce(p_delivered, '[]'::jsonb)) loop
    update crm_messages set status = 'delivered'
     where external_id = r->>'externalId' and direction = 'out' and coalesce(status, 'sent') = 'sent';
    get diagnostics v_rows = row_count;
    v_status := v_status + v_rows;
  end loop;

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
end $function$;
