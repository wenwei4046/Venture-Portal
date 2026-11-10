-- A customer's photo, video, voice note and file kept on arrival (the owner, 2026-11-10: "Yes, copy on arrival").
-- Meta keeps a WhatsApp customer's media id downloadable 7 days (since 2025-10-09; it was 30), and Messenger's attachment
-- address (fbcdn / fbsbx, signed with `oe=`) dies after ~10–30 days — production that day: every WhatsApp customer file
-- (45 photos, 28 voice notes, 2 videos, 3 documents) black. What WE send was already in crm-media (media_path) and fine.
--
-- Now both webhooks, once Meta has its answer, copy each customer file into the private bucket crm-media at
-- `<contact id>/in-<message id>.<ext>` (lib/member/crm-media-keep.ts) and record it here; the hourly sweep
-- (api/member-queue) asks again for what a copy missed. Both functions are the service role's alone (the two webhooks
-- and the cron — admin.ts' existing callers; EXECUTE for nobody else):
--   crm_media_to_keep(p_external_ids, p_limit) — customer messages with a Meta file and no copy yet, still at Meta
--     (WhatsApp: under 7 days old; Messenger: its `oe=` not passed, or under 30 days when it carries none), at most
--     p_limit (≤ 100), newest first; each listed one is counted as tried (media_keep_tries) and one tried 6 times
--     (a file over the size cap, one Meta refuses) is listed no more, so it never holds a sweep's places for ever.
--   crm_keep_in_media(p_message, p_path, p_mime) — only a customer's (incoming) message with a Meta file, only the path
--     `<its customer>/in-<its id>.<ext>`, only a file that arrived (file_objects); sets media_path / media_mime.
--     GET /member/crm-media/<id> already prefers media_path (a signed link to our bucket, as for what we send).

alter table public.crm_messages add column if not exists media_keep_tries smallint not null default 0;

create index if not exists crm_messages_media_to_keep_idx on public.crm_messages (sent_at desc)
  where direction = 'in' and media_path is null and (media_id is not null or media_url is not null);

create or replace function public.crm_media_to_keep(p_external_ids text[] default null, p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare out jsonb;
begin
  with due as (
    select m.id
      from crm_messages m
     where m.direction = 'in' and m.media_path is null and m.media_keep_tries < 6
       and (m.media_id is not null or m.media_url is not null)
       and (p_external_ids is null or m.external_id = any(p_external_ids))
       and m.sent_at > now() - interval '60 days'
       and (
         (m.media_id is not null and m.sent_at > now() - interval '7 days')
         or (m.media_id is null and case
               when substring(m.media_url from '[?&]oe=([0-9A-Fa-f]{1,15})') is null then m.sent_at > now() - interval '30 days'
               else to_timestamp(('x' || lpad(substring(m.media_url from '[?&]oe=([0-9A-Fa-f]{1,15})'), 16, '0'))::bit(64)::bigint) > now()
             end)
       )
     order by m.sent_at desc
     limit greatest(1, least(coalesce(p_limit, 20), 100))
     for update of m skip locked
  ), tried as (
    update crm_messages t set media_keep_tries = t.media_keep_tries + 1
      from due where t.id = due.id
    returning t.id, t.contact_id, t.media_id, t.media_url, t.media_mime, t.sent_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'contactId', r.contact_id, 'channel', c.channel,
           'mediaId', r.media_id, 'mediaUrl', r.media_url, 'mime', r.media_mime) order by r.sent_at desc), '[]'::jsonb)
    into out
    from tried r join crm_contacts c on c.id = r.contact_id;
  return out;
end $function$;

create or replace function public.crm_keep_in_media(p_message uuid, p_path text, p_mime text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare m crm_messages;
begin
  select * into m from crm_messages where id = p_message;
  if m.id is null or m.direction <> 'in' then
    raise exception 'That message is not one a customer sent.' using errcode = '22023';
  end if;
  if m.media_id is null and m.media_url is null then
    raise exception 'That message has no file at Meta.' using errcode = '22023';
  end if;
  if p_path is null or p_path !~ ('^' || m.contact_id::text || '/in-' || m.id::text || '\.[a-z0-9]{1,10}$') then
    raise exception 'That file is not in this customer''s folder.' using errcode = '22023';
  end if;
  if coalesce(p_mime, '') !~ '^[a-z]+/[a-z0-9.+-]+$' then
    raise exception 'That kind of file cannot be kept.' using errcode = '22023';
  end if;
  if not exists (select 1 from file_objects f where f.bucket_id = 'crm-media' and f.name = p_path) then
    raise exception 'The file did not arrive.' using errcode = '22023';
  end if;
  -- Kept already (the webhook and the sweep can both reach one): only the same file is "kept".
  if m.media_path is not null then return m.media_path = p_path; end if;
  update crm_messages set media_path = p_path, media_mime = p_mime where id = p_message;
  return true;
end $function$;

revoke all on function public.crm_media_to_keep(text[], integer) from public, anon, authenticated;
grant execute on function public.crm_media_to_keep(text[], integer) to service_role;
revoke all on function public.crm_keep_in_media(uuid, text, text) from public, anon, authenticated;
grant execute on function public.crm_keep_in_media(uuid, text, text) to service_role;
