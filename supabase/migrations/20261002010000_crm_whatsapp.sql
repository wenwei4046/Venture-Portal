-- CRM channels, first one: the WhatsApp Cloud API (2026-10-02).
--
-- Meta is the portal's second machine-ingest system (approved by the user
-- 2026-10-01 for Messenger, 2026-10-02 for WhatsApp under the same approval).
-- Its receiver, /api/whatsapp/v1/webhook, checks Meta's signature and calls
-- crm_ingest_whatsapp — the ONE writer of these tables — with the service role.
--
-- READS ARE LOCKED FOR NOW: row level security is on and there are no
-- policies, so only the service role and SECURITY DEFINER functions see a
-- row. The CRM still runs on demo data; the read path (a salesperson their
-- own customers, a team leader their team, the Boss everyone) arrives with
-- its own functions and policies, never by opening these tables wholesale.
--
-- Add-only: three new tables and one function. Nothing existing is touched.

-- Every delivery Meta makes, applied or not — the trail when something is missing.
create table if not exists public.crm_channel_events (
  id          bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  channel     text not null check (channel in ('whatsapp', 'messenger')),
  status      text not null check (status in ('applied', 'duplicate', 'ignored', 'rejected')),
  message     text,
  counts      jsonb,
  payload     jsonb
);
create index if not exists crm_channel_events_received_idx on public.crm_channel_events (received_at desc);

-- One customer per (channel, our number or Page, their WhatsApp id or PSID).
create table if not exists public.crm_contacts (
  id               uuid primary key default gen_random_uuid(),
  channel          text not null check (channel in ('whatsapp', 'messenger')),
  account_id       text not null,  -- our WhatsApp phone_number_id (or Page id)
  external_id      text not null,  -- the customer's wa_id (or PSID)
  name             text,           -- their WhatsApp profile name
  phone            text,           -- +<wa_id> for WhatsApp
  ad_source_id     text,           -- the click-to-WhatsApp ad that first brought them
  ad_headline      text,
  ad_source_url    text,
  status           text not null default 'new'
                   check (status in ('new', 'follow_up', 'appointment', 'won', 'lost')),
  lost_reason      text,
  lost_note        text,
  previous_status  text check (previous_status in ('won', 'lost')),  -- "was Lost" after they write again
  assigned_to      uuid references public.hr_staff_costs(id),
  last_customer_at timestamptz,    -- starts Meta's 24-hour window
  last_reply_at    timestamptz,
  created_at       timestamptz not null default now(),
  unique (channel, account_id, external_id)
);
create index if not exists crm_contacts_assigned_idx on public.crm_contacts (assigned_to);

create table if not exists public.crm_messages (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references public.crm_contacts(id) on delete cascade,
  external_id text unique,         -- wamid; Meta re-delivers with the same one
  direction   text not null check (direction in ('in', 'out')),
  kind        text not null default 'text'
              check (kind in ('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'button', 'template', 'other')),
  body        text,
  media_id    text,                -- downloaded later with the token; never Meta's URL
  media_mime  text,
  status      text check (status in ('received', 'sent', 'delivered', 'read', 'failed')),
  error       text,
  auto        boolean not null default false,  -- sent by an auto-reply rule
  sent_by     uuid references public.hr_staff_costs(id),
  sent_at     timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists crm_messages_contact_idx on public.crm_messages (contact_id, sent_at);

alter table public.crm_channel_events enable row level security;
alter table public.crm_contacts       enable row level security;
alter table public.crm_messages       enable row level security;
revoke all on public.crm_channel_events, public.crm_contacts, public.crm_messages from anon, authenticated;

-- The one writer. p_messages / p_statuses are the rows parseDelivery()
-- (src/lib/whatsapp/webhook.ts) made from Meta's payload.
create or replace function public.crm_ingest_whatsapp(
  p_messages jsonb, p_statuses jsonb, p_ignored integer, p_payload jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m jsonb;
  s jsonb;
  v_contact uuid;
  v_new int := 0;
  v_dup int := 0;
  v_status int := 0;
  v_rows int;
  v_counts jsonb;
begin
  for m in select * from jsonb_array_elements(coalesce(p_messages, '[]'::jsonb)) loop
    -- A re-delivery changes nothing — not even the contact, or an old message
    -- arriving late would reopen a customer the salesperson has since closed.
    if exists (select 1 from crm_messages where external_id = m->>'externalId') then
      v_dup := v_dup + 1;
      continue;
    end if;

    insert into crm_contacts as c (channel, account_id, external_id, name, phone,
                                   ad_source_id, ad_headline, ad_source_url, last_customer_at)
    values ('whatsapp', m->>'phoneNumberId', m->>'waId', nullif(m->>'name', ''), '+' || (m->>'waId'),
            m->'ad'->>'sourceId', m->'ad'->>'headline', m->'ad'->>'sourceUrl', (m->>'sentAt')::timestamptz)
    on conflict (channel, account_id, external_id) do update set
      name             = coalesce(excluded.name, c.name),
      ad_source_id     = coalesce(c.ad_source_id, excluded.ad_source_id),
      ad_headline      = coalesce(c.ad_headline, excluded.ad_headline),
      ad_source_url    = coalesce(c.ad_source_url, excluded.ad_source_url),
      last_customer_at = greatest(c.last_customer_at, excluded.last_customer_at),
      -- A Won or Lost customer who writes again comes back to Follow up by
      -- themselves, remembering what they were (lost_reason stays for "was Lost · reason").
      previous_status  = case when c.status in ('won', 'lost') then c.status else c.previous_status end,
      status           = case when c.status in ('won', 'lost') then 'follow_up' else c.status end
    returning id into v_contact;

    insert into crm_messages (contact_id, external_id, direction, kind, body, media_id, media_mime, status, sent_at)
    values (v_contact, m->>'externalId', 'in', coalesce(m->>'kind', 'other'), m->>'body',
            m->>'mediaId', m->>'mediaMime', 'received', (m->>'sentAt')::timestamptz)
    on conflict (external_id) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then v_new := v_new + 1; else v_dup := v_dup + 1; end if;
  end loop;

  -- Statuses of messages we sent: never step back (read is not undone by a
  -- late "delivered"); failed always lands, with Meta's reason.
  for s in select * from jsonb_array_elements(coalesce(p_statuses, '[]'::jsonb)) loop
    update crm_messages set status = s->>'status', error = coalesce(s->>'error', error)
     where external_id = s->>'externalId' and direction = 'out'
       and (s->>'status' = 'failed'
            or coalesce(array_position(array['sent', 'delivered', 'read'], status), 0)
               < coalesce(array_position(array['sent', 'delivered', 'read'], s->>'status'), 0));
    get diagnostics v_rows = row_count;
    v_status := v_status + v_rows;
  end loop;

  v_counts := jsonb_build_object('messages', v_new, 'duplicates', v_dup, 'statuses', v_status, 'ignored', coalesce(p_ignored, 0));
  insert into crm_channel_events (channel, status, counts, payload)
  values ('whatsapp',
          case when v_new > 0 or v_status > 0 then 'applied' when v_dup > 0 then 'duplicate' else 'ignored' end,
          v_counts, p_payload);
  return v_counts;
end $$;

revoke all on function public.crm_ingest_whatsapp(jsonb, jsonb, integer, jsonb) from public, anon, authenticated;
grant execute on function public.crm_ingest_whatsapp(jsonb, jsonb, integer, jsonb) to service_role;
