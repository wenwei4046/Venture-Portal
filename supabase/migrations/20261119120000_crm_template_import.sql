-- Cold lead templates: IMPORT FROM META (2026-11-19; the owner, a template made and approved in WhatsApp Manager —
-- "followup", GRR, three quick-reply buttons — that never showed in the CRM: "刚刚的template fb已经通过了，但是crm 还没出现",
-- then "做导入功能" and "whatapps 也能发送pdf，图片对吧？").
--
-- The CRM listed only the templates it wrote and submitted itself. Now CRM · Manage can bring in the account's APPROVED
-- templates from Meta (crm-actions.ts › importCrmTemplates reads Meta's list on the server; crm_import_templates keeps
-- them). An imported template:
--   * is source 'meta', comes in Approved and OFF (a salesperson sees it only once switched on, as every template);
--   * keeps what Meta has beside the body in `parts` — header (TEXT / IMAGE / VIDEO / DOCUMENT), footer, buttons, and the
--     one variable's form (positional {{1}} or a named one) — the body's variable is kept as {name}, the customer's first name;
--   * is edited in WhatsApp Manager, not here (a trigger refuses new words; importing again brings Meta's new ones);
--   * with a picture / video / PDF header needs that file attached here (bucket crm-templates) before it can be switched
--     on — Meta's example file is not ours to send.

alter table public.crm_templates add column if not exists source text not null default 'crm';
alter table public.crm_templates add column if not exists parts jsonb not null default '{}'::jsonb;
alter table public.crm_templates add column if not exists header_path text;
alter table public.crm_templates add column if not exists header_mime text;
alter table public.crm_templates add column if not exists header_name text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crm_templates_source_check') then
    alter table public.crm_templates add constraint crm_templates_source_check check (source in ('crm', 'meta'));
  end if;
end $$;

-- A template whose header is a file: is a file attached?
create or replace function public.crm_template_needs_file(t public.crm_templates)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(t.parts -> 'header' ->> 'format', '') in ('IMAGE', 'VIDEO', 'DOCUMENT') and t.header_path is null
$$;

-- ── An imported template's words are Meta's ───────────────────────────────
create or replace function public.crm_templates_meta_words()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.source = 'meta' and coalesce(current_setting('crm.tpl_import', true), '') <> 'on'
     and (new.body is distinct from old.body or new.channel is distinct from old.channel or new.parts is distinct from old.parts
          or new.language is distinct from old.language or new.category is distinct from old.category or new.source is distinct from old.source) then
    raise exception 'This template was imported from Meta — change it in WhatsApp Manager, then import again.' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists crm_templates_meta_words on public.crm_templates;
create trigger crm_templates_meta_words before update on public.crm_templates
  for each row execute function public.crm_templates_meta_words();

-- ── Import: [{ name, id, language, category, body, parts }] — Meta's approved templates, read by the server ──
-- New ones come in Approved and Off; ones imported before take Meta's words again (a header that is no longer a file
-- lets its file go, and a template that now needs one is switched off). The CRM's own templates are never touched.
-- Answers how many are new.
create or replace function public.crm_import_templates(p_rows jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; r jsonb; t crm_templates;
begin
  if not public.crm_manages() then perform crm_deny('import templates'); end if;
  perform set_config('crm.tpl_import', 'on', true);
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if coalesce(trim(r ->> 'name'), '') = '' or coalesce(trim(r ->> 'body'), '') = '' then continue; end if;
    select * into t from crm_templates where meta_name = r ->> 'name';
    if t.id is null then
      insert into crm_templates (name, channel, body, status, is_on, meta_name, meta_id, language, category, source, parts, created_by, updated_by)
      values (left(r ->> 'name', 80), 'whatsapp', left(trim(r ->> 'body'), 1024), 'approved', false, r ->> 'name', nullif(r ->> 'id', ''),
              coalesce(nullif(r ->> 'language', ''), 'en'), coalesce(nullif(r ->> 'category', ''), 'MARKETING'), 'meta',
              coalesce(r -> 'parts', '{}'::jsonb), crm_me(), crm_me());
      n := n + 1;
    elsif t.source = 'meta' then
      update crm_templates set body = left(trim(r ->> 'body'), 1024), parts = coalesce(r -> 'parts', '{}'::jsonb),
             language = coalesce(nullif(r ->> 'language', ''), language), category = coalesce(nullif(r ->> 'category', ''), category),
             meta_id = coalesce(nullif(r ->> 'id', ''), meta_id), status = 'approved', reject_reason = null,
             header_path = case when coalesce(r -> 'parts' -> 'header' ->> 'format', '') in ('IMAGE', 'VIDEO', 'DOCUMENT')
                                 and r -> 'parts' -> 'header' ->> 'format' = parts -> 'header' ->> 'format' then header_path end,
             header_mime = case when coalesce(r -> 'parts' -> 'header' ->> 'format', '') in ('IMAGE', 'VIDEO', 'DOCUMENT')
                                 and r -> 'parts' -> 'header' ->> 'format' = parts -> 'header' ->> 'format' then header_mime end,
             header_name = case when coalesce(r -> 'parts' -> 'header' ->> 'format', '') in ('IMAGE', 'VIDEO', 'DOCUMENT')
                                 and r -> 'parts' -> 'header' ->> 'format' = parts -> 'header' ->> 'format' then header_name end,
             updated_by = crm_me(), updated_at = now()
       where id = t.id;
      update crm_templates set is_on = false where id = t.id and is_on and public.crm_template_needs_file(crm_templates);
    end if;
  end loop;
  perform set_config('crm.tpl_import', '', true);
  return n;
end $$;

-- ── The header's file (a picture, video or PDF in bucket crm-templates); null takes it away and switches it off ──
create or replace function public.crm_template_header(p_id uuid, p_path text, p_mime text, p_name text)
returns public.crm_templates language plpgsql security definer set search_path = public as $$
declare t crm_templates; f text;
begin
  if not public.crm_manages() then perform crm_deny('attach template files'); end if;
  select * into t from crm_templates where id = p_id for update;
  if t.id is null then raise exception 'That template is gone. Reload.' using errcode = 'P0002'; end if;
  f := coalesce(t.parts -> 'header' ->> 'format', '');
  if f not in ('IMAGE', 'VIDEO', 'DOCUMENT') then raise exception 'This template has no picture, video or PDF at its top.' using errcode = '22023'; end if;
  if p_path is not null then
    if split_part(p_path, '/', 1) <> p_id::text then raise exception 'Choose the file again.' using errcode = '22023'; end if;
    if not exists (select 1 from file_objects o where o.bucket_id = 'crm-templates' and o.name = p_path) then
      raise exception 'The file did not arrive. Try again.' using errcode = '22023';
    end if;
    if (f = 'IMAGE' and coalesce(p_mime, '') not in ('image/jpeg', 'image/png'))
       or (f = 'VIDEO' and coalesce(p_mime, '') <> 'video/mp4')
       or (f = 'DOCUMENT' and coalesce(p_mime, '') <> 'application/pdf') then
      raise exception '%', case f when 'IMAGE' then 'This template takes a JPG or PNG picture.' when 'VIDEO' then 'This template takes an MP4 video.' else 'This template takes a PDF.' end
        using errcode = '22023';
    end if;
  end if;
  update crm_templates set header_path = p_path, header_mime = case when p_path is null then null else p_mime end,
         header_name = case when p_path is null then null else left(coalesce(nullif(trim(p_name), ''), 'file'), 240) end,
         is_on = is_on and p_path is not null, updated_by = crm_me(), updated_at = now()
   where id = p_id returning * into t;
  return t;
end $$;

-- ── Switching on: as before, and a template whose header is a file needs that file ──
create or replace function public.crm_template_on(p_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare t crm_templates;
begin
  if not public.crm_manages() then perform crm_deny('switch templates'); end if;
  select * into t from crm_templates where id = p_id for update;
  if t.id is null then raise exception 'That template is gone. Reload.' using errcode = 'P0002'; end if;
  if coalesce(p_on, false) and t.status <> 'approved' then raise exception 'Only an approved template can be switched on.' using errcode = '22023'; end if;
  if coalesce(p_on, false) and public.crm_template_needs_file(t) then
    raise exception 'Attach the picture, video or PDF this template starts with first.' using errcode = '22023';
  end if;
  update crm_templates set is_on = coalesce(p_on, false), updated_by = crm_me(), updated_at = now() where id = p_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array['crm_import_templates(jsonb)', 'crm_template_header(uuid, text, text, text)', 'crm_template_on(uuid, boolean)',
    'crm_template_needs_file(public.crm_templates)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.crm_templates_meta_words() from public, anon, authenticated;

-- ── Bucket crm-templates (R2): a template's header file. Anybody in the CRM reads it (the salesperson's send uploads
-- it to WhatsApp under their own session); only CRM · Manage puts one there or takes it away. Path: <template id>/<file>.
insert into public.file_buckets (id, public, file_size_limit, allowed_mime_types, backend)
values ('crm-templates', false, 100 * 1024 * 1024, array['image/jpeg', 'image/png', 'video/mp4', 'application/pdf'], 'r2')
on conflict (id) do nothing;

drop policy if exists "crm template files: read" on public.file_objects;
create policy "crm template files: read" on public.file_objects for select to authenticated
  using (bucket_id = 'crm-templates' and (select public.crm_me()) is not null);
drop policy if exists "crm template files: in" on public.file_objects;
create policy "crm template files: in" on public.file_objects for insert to authenticated
  with check (bucket_id = 'crm-templates' and coalesce(((select public.crm_my_can()) ->> 'manage')::boolean, false));
drop policy if exists "crm template files: out" on public.file_objects;
create policy "crm template files: out" on public.file_objects for delete to authenticated
  using (bucket_id = 'crm-templates' and coalesce(((select public.crm_my_can()) ->> 'manage')::boolean, false));
