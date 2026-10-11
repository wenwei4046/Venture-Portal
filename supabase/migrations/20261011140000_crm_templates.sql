-- Cold lead templates (rev 1011 › Profile › Cold lead templates; user OK 2026-10-11: "E 只做 WhatsApp").
--
-- The Principal and the Director (CRM · Manage) write templates here; a WhatsApp one is submitted to Meta for review
-- from the server (crm-actions.ts › submitCrmTemplate, the WhatsApp Business template API) and its status comes back
-- from Meta's list (refreshCrmTemplates — on opening the page and after a submit). Only an Approved template may be
-- switched on, and a salesperson sees only Approved + On ones (the row policy), so with every template off — the
-- default — the cold chat offers no template, as before. Messenger templates are kept as drafts only (not connected).
-- The body's {name} is the customer's first name: it goes to Meta as {{1}}.

create table if not exists public.crm_templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) between 1 and 80),
  channel       text not null default 'whatsapp' check (channel in ('whatsapp', 'messenger')),
  body          text not null check (length(trim(body)) between 1 and 1024),
  status        text not null default 'draft' check (status in ('draft', 'review', 'approved', 'rejected')),
  is_on         boolean not null default false,
  -- What Meta knows it by: the template's name there (lowercase, unique per account) and its id.
  meta_name     text,
  meta_id       text,
  language      text not null default 'en',
  category      text not null default 'MARKETING',
  reject_reason text,
  created_by    uuid references public.hr_staff_costs(id),
  updated_by    uuid references public.hr_staff_costs(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint crm_templates_on_only_approved check (not is_on or status = 'approved')
);
create unique index if not exists crm_templates_meta_name on public.crm_templates (meta_name) where meta_name is not null;

alter table public.crm_templates enable row level security;
revoke all on public.crm_templates from public, anon, authenticated;
grant select on public.crm_templates to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'crm_templates' and policyname = 'crm_templates_read') then
    -- The Control panel reads every template; anybody in the CRM reads the ones salespeople may send.
    create policy crm_templates_read on public.crm_templates for select to authenticated
      using ((select crm_sees_all()) or (status = 'approved' and is_on and (select crm_my_role()) is not null));
  end if;
end $$;

SELECT public.audit_register('crm_templates', 'CRM cold lead templates', 'Member services', '{revenue}', 'people',
  p_keys => '{id}', p_labels => '{name}');

-- ── Writers: CRM · Manage only ───────────────────────────────────────────
create or replace function public.crm_save_template(p_id uuid, p_name text, p_channel text, p_body text)
returns public.crm_templates language plpgsql security definer set search_path = public as $$
declare t crm_templates;
begin
  if not public.crm_manages() then perform crm_deny('write templates'); end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_body), '') = '' then raise exception 'Give the template a name and a message.' using errcode = '22023'; end if;
  if length(trim(p_body)) > 1024 then raise exception 'A template message can be up to 1,024 characters.' using errcode = '22023'; end if;
  if coalesce(p_channel, '') not in ('whatsapp', 'messenger') then raise exception 'Choose WhatsApp or Messenger.' using errcode = '22023'; end if;
  if p_id is null then
    insert into crm_templates (name, channel, body, created_by, updated_by) values (trim(p_name), p_channel, trim(p_body), crm_me(), crm_me()) returning * into t;
  else
    -- A changed template is a new draft: Meta reviews the new words again, and it is off until then.
    update crm_templates set name = trim(p_name), channel = p_channel, body = trim(p_body),
      status = case when body = trim(p_body) and channel = p_channel then status else 'draft' end,
      is_on = case when body = trim(p_body) and channel = p_channel then is_on else false end,
      meta_name = case when body = trim(p_body) and channel = p_channel then meta_name else null end,
      meta_id = case when body = trim(p_body) and channel = p_channel then meta_id else null end,
      reject_reason = case when body = trim(p_body) and channel = p_channel then reject_reason else null end,
      updated_by = crm_me(), updated_at = now()
     where id = p_id returning * into t;
    if t.id is null then raise exception 'That template is gone. Reload.' using errcode = 'P0002'; end if;
  end if;
  return t;
end $$;

create or replace function public.crm_template_on(p_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare t crm_templates;
begin
  if not public.crm_manages() then perform crm_deny('switch templates'); end if;
  select * into t from crm_templates where id = p_id for update;
  if t.id is null then raise exception 'That template is gone. Reload.' using errcode = 'P0002'; end if;
  if coalesce(p_on, false) and t.status <> 'approved' then raise exception 'Only an approved template can be switched on.' using errcode = '22023'; end if;
  update crm_templates set is_on = coalesce(p_on, false), updated_by = crm_me(), updated_at = now() where id = p_id;
end $$;

create or replace function public.crm_delete_template(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.crm_manages() then perform crm_deny('delete templates'); end if;
  delete from crm_templates where id = p_id;
end $$;

-- The server sent it to Meta (submitCrmTemplate): what Meta calls it, and the status Meta answered.
create or replace function public.crm_template_submitted(p_id uuid, p_meta_name text, p_meta_id text, p_status text)
returns public.crm_templates language plpgsql security definer set search_path = public as $$
declare t crm_templates;
begin
  if not public.crm_manages() then perform crm_deny('submit templates'); end if;
  if coalesce(p_status, '') not in ('review', 'approved', 'rejected') then raise exception 'Unknown template status.' using errcode = '22023'; end if;
  update crm_templates set meta_name = p_meta_name, meta_id = p_meta_id, status = p_status, is_on = false, reject_reason = null,
    updated_by = crm_me(), updated_at = now()
   where id = p_id and channel = 'whatsapp' and status in ('draft', 'rejected') returning * into t;
  if t.id is null then raise exception 'That template is not a WhatsApp draft any more. Reload.' using errcode = '22023'; end if;
  return t;
end $$;

-- Meta's review, read from Meta's list by the server (refreshCrmTemplates): [{ name, status, reason }] by Meta's name.
-- A template no longer Approved is switched off. Answers how many changed.
create or replace function public.crm_template_statuses(p_rows jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.crm_manages() then perform crm_deny('refresh templates'); end if;
  with meta as (
    select r ->> 'name' as meta_name,
           case upper(coalesce(r ->> 'status', '')) when 'APPROVED' then 'approved' when 'REJECTED' then 'rejected' when 'DISABLED' then 'rejected' else 'review' end as status,
           nullif(r ->> 'reason', '') as reason
      from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  )
  update crm_templates t set status = m.status, is_on = t.is_on and m.status = 'approved',
         reject_reason = case when m.status = 'rejected' then coalesce(m.reason, t.reject_reason) else null end, updated_at = now()
    from meta m
   where t.meta_name = m.meta_name and t.status in ('review', 'approved', 'rejected') and (t.status <> m.status or (m.status = 'rejected' and t.reject_reason is distinct from m.reason));
  get diagnostics n = row_count;
  return n;
end $$;

do $$
declare f text;
begin
  foreach f in array array['crm_save_template(uuid, text, text, text)', 'crm_template_on(uuid, boolean)', 'crm_delete_template(uuid)',
    'crm_template_submitted(uuid, text, text, text)', 'crm_template_statuses(jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
