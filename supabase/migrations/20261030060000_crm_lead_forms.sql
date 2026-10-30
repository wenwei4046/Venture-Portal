-- Lead form ads reach the CRM (2026-10-30, the owner: "接下来的广告是设定成客户一定要填了一些资讯才能pm给我们 … 2种都做").
-- Two of Meta's ads ask the customer questions before they talk to us:
--   * Messenger lead ads — Meta's Leadgen app asks inside Messenger, then hands the chat to our app with the answers
--     (a referral LEAD_COMPLETE / LEAD_INCOMPLETE carrying lead.data, or the "Lead summary" message);
--   * Instant Form lead ads — the form on Facebook; Meta sends only the lead's id (field `leadgen`), the server reads
--     the answers from the Graph API with the Page's token (needs leads_retrieval on the token).
-- The webhook (the same machine path, /api/messenger/v1/webhook) hands both to ONE new ingest function,
-- crm_ingest_lead, service role only, which owns the writes and the delivery log as crm_ingest_messenger does:
--   * the customer — a Messenger lead by Page + PSID (as crm_ingest_messenger keys them), an Instant Form lead by the
--     phone it gave, on that brand's WhatsApp number (as crm_add_contact keys them; the window stays shut — the
--     salesperson opens with a template); a new one is dealt as any new enquiry (crm_assign_contact);
--   * the answers kept on the customer (crm_contacts.lead_form: kind, complete, the ad, the form, every question and
--     answer, when) and said once in the chat, so whoever has it reads them at once;
--   * the same Instant Form lead twice (Meta retries) is taken once (its leadId).

alter table public.crm_contacts add column if not exists lead_form jsonb;
grant select (lead_form) on public.crm_contacts to authenticated;

create or replace function public.crm_ingest_lead(p_leads jsonb, p_payload jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  l jsonb; v_contact uuid; v_created boolean; v_body text; v_form jsonb; v_digits text;
  v_new int := 0; v_dup int := 0; v_skip int := 0; v_assigned int := 0; v_counts jsonb;
begin
  for l in select * from jsonb_array_elements(coalesce(p_leads, '[]'::jsonb)) loop
    -- Unreadable (an Instant Form lead the token may not read): logged, nothing written.
    if l ? 'error' then v_skip := v_skip + 1; continue; end if;
    if exists (select 1 from crm_channels where kind = 'page' and external_id = l->>'pageId' and not linked) then
      v_skip := v_skip + 1; continue;
    end if;
    if l->>'kind' = 'instant' and exists (select 1 from crm_contacts where lead_form->>'leadId' = l->>'leadId') then
      v_dup := v_dup + 1; continue;
    end if;
    v_form := jsonb_build_object('kind', l->>'kind', 'complete', coalesce((l->>'complete')::boolean, true),
      'leadId', l->>'leadId', 'formId', l->>'formId', 'at', coalesce(l->>'at', now()::text),
      'answers', coalesce(l->'answers', '[]'::jsonb));
    if l->>'kind' = 'messenger' then
      if coalesce(l->>'psid', '') = '' then v_skip := v_skip + 1; continue; end if;
      insert into crm_contacts as c (channel, account_id, external_id, name, ad_source_id, ad_headline, ad_source_url, ad_media, last_customer_at, lead_form)
      values ('messenger', l->>'pageId', l->>'psid', nullif(l->>'name', ''),
              l->'ad'->>'sourceId', l->'ad'->>'headline', l->'ad'->>'sourceUrl', nullif(l->'ad'->>'media', ''), (l->>'at')::timestamptz, v_form)
      on conflict (channel, account_id, external_id) do update set
        name             = coalesce(c.name, excluded.name),
        ad_source_id     = coalesce(c.ad_source_id, excluded.ad_source_id),
        ad_headline      = coalesce(c.ad_headline, excluded.ad_headline),
        ad_source_url    = coalesce(c.ad_source_url, excluded.ad_source_url),
        ad_media         = coalesce(c.ad_media, excluded.ad_media),
        last_customer_at = greatest(c.last_customer_at, excluded.last_customer_at),
        lead_form        = excluded.lead_form
      returning id, (xmax = 0) into v_contact, v_created;
    elsif l->>'kind' = 'instant' then
      v_digits := regexp_replace(coalesce(l->>'phone', ''), '\D', '', 'g');
      if v_digits like '0%' then v_digits := '6' || v_digits; end if;
      if length(v_digits) < 9 or length(v_digits) > 15 or coalesce(l->>'waAccount', '') !~ '^\d+$' then
        v_skip := v_skip + 1; continue;   -- no phone to reach them on, or no WhatsApp number for the Page's brand
      end if;
      insert into crm_contacts as c (channel, account_id, external_id, name, phone, ad_source_id, ad_headline, lead_form)
      values ('whatsapp', l->>'waAccount', v_digits, nullif(left(trim(coalesce(l->>'name', '')), 120), ''), '+' || v_digits,
              l->'ad'->>'sourceId', l->'ad'->>'headline', v_form)
      on conflict (channel, account_id, external_id) do update set
        name         = coalesce(c.name, excluded.name),
        ad_source_id = coalesce(c.ad_source_id, excluded.ad_source_id),
        ad_headline  = coalesce(c.ad_headline, excluded.ad_headline),
        lead_form    = excluded.lead_form
      returning id, (xmax = 0) into v_contact, v_created;
    else
      v_skip := v_skip + 1; continue;
    end if;
    -- The answers, said once in the chat (a summary and a referral of the same Messenger lead arrive together).
    if not exists (select 1 from crm_messages where contact_id = v_contact and external_id like 'lead:%' and sent_at > now() - interval '30 minutes') then
      v_body := (case when l->>'kind' = 'instant' then '📝 Facebook form' else '📝 Lead form' end)
        || case when coalesce((l->>'complete')::boolean, true) then '' else ' (not finished)' end
        || coalesce(E'\n' || (select string_agg(coalesce(a->>'q', '') || ': ' || coalesce(a->>'a', ''), E'\n' order by n)
                       from jsonb_array_elements(coalesce(l->'answers', '[]'::jsonb)) with ordinality as t(a, n)), '');
      insert into crm_messages (contact_id, external_id, direction, kind, body, status, sent_at)
      values (v_contact, 'lead:' || coalesce(l->>'leadId', l->>'psid', '') || ':' || extract(epoch from clock_timestamp())::text,
              'in', 'text', left(v_body, 4000), 'received', coalesce((l->>'at')::timestamptz, now()));
      update crm_contacts set unread = unread + 1 where id = v_contact;
    end if;
    v_new := v_new + 1;
    if v_created and (crm_assign_contact(v_contact) ->> 'assigned')::boolean then v_assigned := v_assigned + 1; end if;
  end loop;
  v_counts := jsonb_build_object('leads', v_new, 'duplicates', v_dup, 'skipped', v_skip, 'assigned', v_assigned);
  insert into crm_channel_events (channel, status, counts, payload)
  values ('messenger', case when v_new > 0 then 'applied' when v_dup > 0 then 'duplicate' else 'ignored' end, v_counts, p_payload);
  return v_counts;
end $function$;
revoke all on function public.crm_ingest_lead(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.crm_ingest_lead(jsonb, jsonb) to service_role;
