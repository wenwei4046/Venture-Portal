-- Auto-replies are SENT (2026-10-19; the owner, the day before The Conts' ads open: "自动回复确保，只要业务有设定 & 开启，那当
-- 广告资讯进来，就可以发送" and "分配到CRM后也要可以根据crm 的自动回复发送"; supersedes 2026-10-09's "先不發送"). Each person keeps
-- their own (crm_auto_replies: welcome, after hours, keyword replies — Profile › Auto-reply); when a customer's message
-- lands in a chat given to them, the webhook (after Meta has its answer) works out which of theirs apply
-- (lib/member/crm-auto-reply.ts) and sends them from the number / Page the customer wrote to. The webhooks' service role
-- calls RPCs only (CLAUDE.md › Machine ingest), so three, the service role's alone:
--   crm_auto_reply_due(channel, ids)  — the customer's messages just taken in, with their person's auto-reply settings;
--   crm_auto_reply_claim(message, body) — keeps the reply as ours (auto, sent by nobody) before it goes, once: the same
--                                         words to the same customer within an hour are not sent again (a retried
--                                         delivery, an after-hours note to a customer writing five times at night);
--   crm_auto_reply_done(id, wamid, error) — Meta's id once it went (so the receipts find it), or why it did not.
-- An auto-reply is no answer of ours to the screens (the Attention lines, New, first reply, Insight all skip `auto`).

create or replace function public.crm_auto_reply_due(p_channel text, p_external_ids text[])
returns table (message_id uuid, contact_id uuid, account_id text, customer text, body text, sent_at timestamptz,
               first boolean, settings jsonb)
language sql stable security definer set search_path = public as $$
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
   order by m.sent_at, m.created_at
$$;

create or replace function public.crm_auto_reply_claim(p_message uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_contact uuid;
  v_body    text := btrim(coalesce(p_body, ''));
  v_id      uuid;
begin
  if v_body = '' or char_length(v_body) > 4096 then return null; end if;
  select contact_id into v_contact from crm_messages where id = p_message and direction = 'in';
  if v_contact is null then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('crm_auto_reply:' || v_contact::text, 0));
  if exists (select 1 from crm_messages o where o.contact_id = v_contact and o.direction = 'out' and o.auto
               and o.body = v_body and o.sent_at > now() - interval '1 hour') then
    return null;
  end if;
  insert into crm_messages (contact_id, direction, kind, body, status, auto, sent_by, sent_at)
  values (v_contact, 'out', 'text', v_body, 'sent', true, null, now())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.crm_auto_reply_done(p_id uuid, p_external_id text, p_error text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if nullif(btrim(coalesce(p_external_id, '')), '') is not null then
    update crm_messages set external_id = btrim(p_external_id) where id = p_id and auto and direction = 'out' and external_id is null;
  else
    update crm_messages set status = 'failed', error = left(coalesce(nullif(btrim(p_error), ''), 'Not sent'), 300)
     where id = p_id and auto and direction = 'out' and external_id is null;
  end if;
end $$;

revoke execute on function public.crm_auto_reply_due(text, text[]) from public, anon, authenticated;
revoke execute on function public.crm_auto_reply_claim(uuid, text) from public, anon, authenticated;
revoke execute on function public.crm_auto_reply_done(uuid, text, text) from public, anon, authenticated;
grant execute on function public.crm_auto_reply_due(text, text[]) to service_role;
grant execute on function public.crm_auto_reply_claim(uuid, text) to service_role;
grant execute on function public.crm_auto_reply_done(uuid, text, text) to service_role;
