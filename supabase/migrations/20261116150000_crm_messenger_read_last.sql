-- A Messenger chat's last message of ours never turned read (2026-11-16, the owner, of Alexandra Anne Jo's chat: "很多的聊天
-- 记录，最后一个讯息都没显示蓝勾勾？", then "只有最后一则讯息是这样").
--
-- Messenger reports a read as a WATERMARK: every message up to that instant is read, the instant being Meta's own time of the
-- newest one. We keep our message's time as the moment WE recorded it (sent_at), after Meta had accepted it — a little
-- later: Alexandra's 8 Nov 11:58 message was recorded at 11:58:21.665, her read's watermark is 11:58:21.450, so
-- `sent_at <= watermark` missed exactly the message she had read. On production, in the 30 days to 2026-11-16, 64 messages
-- were missed this way, the gap never over 3.8 s. Now a read takes our messages up to 5 seconds after its watermark too.
-- (A message sent within those 5 s after the customer read — while they are in the chat — may be shown read a moment early.)
--
-- crm_ingest_messenger: production's body (md5 854dedcf…, 20261015210000), one condition widened.
-- Then the messages already missed are marked read, from the read events kept in crm_channel_events.

do $mig$
declare v_src text; v_new text;
  a1 text := 'and x.direction = ''out'' and x.sent_at <= (r->>''watermark'')::timestamptz and';
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.crm_ingest_messenger(jsonb,jsonb,jsonb,integer,jsonb)'::regprocedure) <> '854dedcf1026b87f6e77f8b56c11b2c2' then
    raise exception 'crm_messenger_read_last: crm_ingest_messenger is no longer the body this was written from';
  end if;
  select pg_get_functiondef('public.crm_ingest_messenger(jsonb,jsonb,jsonb,integer,jsonb)'::regprocedure) into v_src;
  if position(a1 in v_src) = 0 then
    raise exception 'crm_messenger_read_last: the read condition has changed; look before replacing.';
  end if;
  v_new := replace(v_src, a1,
    'and x.direction = ''out'' and x.sent_at <= (r->>''watermark'')::timestamptz + interval ''5 seconds'' and');
  execute v_new;
end $mig$;

-- The messages already missed: delivered (or sent) and recorded within 5 s after a read watermark of that customer.
with reads as (
  select (regexp_match(ev.payload::text, '"recipient":\s*\{\s*"id":\s*"(\d+)"'))[1] as page_id,
         (regexp_match(ev.payload::text, '"sender":\s*\{\s*"id":\s*"(\d+)"'))[1] as psid,
         to_timestamp((regexp_match(ev.payload::text, '"watermark":\s*(\d+)'))[1]::bigint / 1000.0) as wm
    from crm_channel_events ev
   where ev.channel = 'messenger' and ev.payload::text like '%"read"%' and ev.payload::text like '%"watermark"%'
)
update crm_messages x set status = 'read'
  from crm_contacts c, reads r
 where c.id = x.contact_id and c.channel = 'messenger'
   and c.external_id = r.psid and (r.page_id is null or c.account_id = r.page_id)
   and x.direction = 'out' and coalesce(x.status, 'sent') in ('sent', 'delivered')
   and x.sent_at > r.wm and x.sent_at <= r.wm + interval '5 seconds';
