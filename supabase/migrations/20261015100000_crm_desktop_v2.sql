-- CRM Desktop v2 (2026-10-15; the owner: "请直接实现 CRM 桌面版 v2 … Channels：连接或解除的 Page、号码，要影响 Inbox 收不收得到
-- 消息。只有 Principal 和 Director 能改"; handoff docs/design_handoff_crm_desktop_v2).
--
--   1. crm_channels — each Meta asset the CRM works with (a Facebook Page, a WhatsApp number, an Instagram account, an
--      ads account): whether it is LINKED (an unlinked one's messages no longer come into Inbox — chats already there
--      stay), which one is the DEFAULT of its kind, and what the CRM last SAVED to Meta for it (Page details, the
--      Messenger profile, the WhatsApp business profile) — audited, so the Audit log's Management tab shows who changed
--      which channel. Read by whoever sees the whole CRM (View at All); written only through crm_set_channel /
--      crm_note_channel_save, which ask CRM · Manage (the Principal and the Revenue Director).
--   2. The ingest functions (WhatsApp, Messenger) skip a message for an UNLINKED asset — counted as ignored in the
--      delivery's log (crm_channel_events), nothing stored, nobody told. One statement inserted in PRODUCTION's body
--      (pg_get_functiondef), refused unless the anchor is there exactly once. Production md5 before:
--      crm_ingest_whatsapp 2d6e126814413afdb209f57c05339b57, crm_ingest_messenger 0008ed81ba7d323371ceca29d63d73dc.
--   3. crm_save_form takes v2's "Range (from–to)" answer type ('Range'). Production md5 before a5f52e73a3ac9cb9446c44e663b2db3e.
--
-- No row is written by this migration: every asset starts LINKED (no row = linked), as today.

create table if not exists public.crm_channels (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('page', 'wa', 'ig', 'ads')),
  external_id text not null check (length(external_id) between 1 and 64),
  name        text not null default '',
  linked      boolean not null default true,
  is_default  boolean not null default false,
  saved       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.hr_staff_costs(id) on delete set null,
  unique (kind, external_id)
);

alter table public.crm_channels enable row level security;
revoke all on public.crm_channels from anon, authenticated;
grant select on public.crm_channels to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'crm_channels' and policyname = 'crm_channels_read') then
    -- Channels is a page of the desktop for everybody who sees the whole CRM (read-only without Manage).
    create policy crm_channels_read on public.crm_channels for select to authenticated using ((select crm_sees_all()));
  end if;
end $$;

-- Link or unlink an asset, make it its kind's default. CRM · Manage.
create or replace function public.crm_set_channel(p_kind text, p_external text, p_name text, p_linked boolean, p_default boolean)
returns public.crm_channels language plpgsql security definer set search_path = public as $$
declare r crm_channels;
begin
  if not public.crm_manages() then perform crm_deny('change the channels'); end if;
  if p_kind not in ('page', 'wa', 'ig', 'ads') or coalesce(trim(p_external), '') = '' then
    raise exception 'Choose the channel again.' using errcode = '22023';
  end if;
  insert into crm_channels as x (kind, external_id, name, linked, is_default, updated_by)
  values (p_kind, trim(p_external), coalesce(trim(p_name), ''), coalesce(p_linked, true), coalesce(p_default, false) and coalesce(p_linked, true), crm_me())
  on conflict (kind, external_id) do update set
    name       = coalesce(nullif(trim(p_name), ''), x.name),
    linked     = coalesce(p_linked, x.linked),
    -- An unlinked asset is nobody's default.
    is_default = case when coalesce(p_linked, x.linked) then coalesce(p_default, x.is_default) else false end,
    updated_by = crm_me(), updated_at = now()
  returning * into r;
  if r.is_default then
    update crm_channels set is_default = false, updated_by = crm_me(), updated_at = now()
     where kind = r.kind and id <> r.id and is_default;
  end if;
  return r;
end $$;

-- What the CRM saved to Meta for an asset (called after Meta said yes): the Audit log's record of it. CRM · Manage.
create or replace function public.crm_note_channel_save(p_kind text, p_external text, p_name text, p_saved jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.crm_manages() then perform crm_deny('change the channels'); end if;
  if p_kind not in ('page', 'wa', 'ig', 'ads') or coalesce(trim(p_external), '') = '' or jsonb_typeof(coalesce(p_saved, 'null'::jsonb)) <> 'object' then
    raise exception 'Choose the channel again.' using errcode = '22023';
  end if;
  if length(p_saved::text) > 20000 then raise exception 'That is too long.' using errcode = '22023'; end if;
  insert into crm_channels as x (kind, external_id, name, saved, updated_by)
  values (p_kind, trim(p_external), coalesce(trim(p_name), ''), p_saved, crm_me())
  on conflict (kind, external_id) do update set saved = x.saved || p_saved, name = coalesce(nullif(trim(p_name), ''), x.name), updated_by = crm_me(), updated_at = now();
end $$;

revoke execute on function public.crm_set_channel(text, text, text, boolean, boolean) from public, anon;
revoke execute on function public.crm_note_channel_save(text, text, text, jsonb) from public, anon;
grant execute on function public.crm_set_channel(text, text, text, boolean, boolean) to authenticated;
grant execute on function public.crm_note_channel_save(text, text, text, jsonb) to authenticated;

SELECT public.audit_register('crm_channels', 'CRM channels', 'Member services', '{revenue,crm_manage}', 'people',
  p_keys => '{kind,external_id}', p_labels => '{name}');

-- 2. An unlinked asset's messages are not taken in (statuses of our own messages still are).
do $migration$
declare
  v_def text;
  v_anchor constant text := E'    if exists (select 1 from crm_messages where external_id = m->>''externalId'') then\n      v_dup := v_dup + 1;\n      continue;\n    end if;\n';
  v_wa constant text := E'    if exists (select 1 from crm_channels where kind = ''wa'' and external_id = m->>''phoneNumberId'' and not linked) then\n      p_ignored := coalesce(p_ignored, 0) + 1;\n      continue;\n    end if;\n';
  v_ms constant text := E'    if exists (select 1 from crm_channels where kind = ''page'' and external_id = m->>''pageId'' and not linked) then\n      p_ignored := coalesce(p_ignored, 0) + 1;\n      continue;\n    end if;\n';
begin
  select pg_get_functiondef('public.crm_ingest_whatsapp(jsonb,jsonb,integer,jsonb)'::regprocedure) into v_def;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'crm_ingest_whatsapp: the duplicate check is not there exactly once';
  end if;
  execute replace(v_def, v_anchor, v_anchor || v_wa);
  select pg_get_functiondef('public.crm_ingest_messenger(jsonb,jsonb,jsonb,integer,jsonb)'::regprocedure) into v_def;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'crm_ingest_messenger: the duplicate check is not there exactly once';
  end if;
  execute replace(v_def, v_anchor, v_anchor || v_ms);
end
$migration$;

-- 3. The Customer form's answer types: v2's Range (from–to).
do $migration$
declare
  v_def text;
  v_old constant text := $q$('Text', 'Long text', 'Choice', 'Number', 'Phone', 'Date')$q$;
  v_new constant text := $q$('Text', 'Long text', 'Choice', 'Number', 'Phone', 'Date', 'Range')$q$;
begin
  select pg_get_functiondef('public.crm_save_form(uuid,text,jsonb)'::regprocedure) into v_def;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'crm_save_form: the type list is not there exactly once';
  end if;
  execute replace(v_def, v_old, v_new);
end
$migration$;
