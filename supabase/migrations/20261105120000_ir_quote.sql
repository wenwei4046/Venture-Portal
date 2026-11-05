-- IR Quote (2026-11-05 — the user, with the Claude Design handoff `.design/ir-quote/design_handoff_ir_quote`: "按照设计把
-- IR Quote 报价流程和 Quotation settings 做进我们的 app … 确保那些规则是 link 在一起的"). The prototype kept everything in
-- the browser; here it is kept on the server, in the prototype's own shapes:
--
--   ir_quote_config — the price base and the quotation's layout, ONE document (packages, catalogue, styles, document
--                     blocks, customer fields …): row 'live' is what every IR salesperson quotes from, row 'draft' the
--                     Principal's unpublished changes. Publish writes both. One document because Publish is all of it
--                     at once — a catalogue price, the room types that follow it and the quotation that prints them
--                     never disagree mid-way.
--   ir_quote_drafts — a salesperson's quotes not finished yet (the quote home's CONTINUE list), their own only.
--   ir_drive_boards — a salesperson's Drive (style photos by room), their own only.
--   file bucket ir-quote — the photos: config/<uid>/… (room types, styles, logo, signatures — every quoter reads them),
--                     drive/<uid>/… (the owner's alone).
--
-- Who: quoting is the Revenue app's Quote · Create (revenue_app.create — member_quote's cell); the settings are the
-- Product List's Edit (product_list.edit — the Principal's templates, and the Revenue Director's). RLS on, no policy:
-- every read and write goes through the functions below, which ask those cells.

create table if not exists public.ir_quote_config (
  id text primary key check (id in ('live', 'draft')),
  config jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
alter table public.ir_quote_config enable row level security;
revoke all on public.ir_quote_config from anon, authenticated;

create table if not exists public.ir_quote_drafts (
  owner uuid not null,
  id text not null check (length(id) between 1 and 64),
  draft jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner, id)
);
alter table public.ir_quote_drafts enable row level security;
revoke all on public.ir_quote_drafts from anon, authenticated;

create table if not exists public.ir_drive_boards (
  owner uuid not null,
  id text not null check (length(id) between 1 and 128),
  board jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner, id)
);
alter table public.ir_drive_boards enable row level security;
revoke all on public.ir_drive_boards from anon, authenticated;

-- ── reads ──
-- What a screen opens on: the live document, the draft (settings editors only), whether the caller may edit, and the
-- caller's own drafts. A caller who may neither quote nor edit gets nothing.
create or replace function public.ir_quote_read()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_quote boolean := has_any_action(array['revenue_app.create:own']);
  v_edit boolean := has_any_action(array['product_list.edit']);
begin
  if auth.uid() is null or not (v_quote or v_edit) then
    return jsonb_build_object('quote', false, 'edit', false);
  end if;
  return jsonb_build_object(
    'quote', v_quote,
    'edit', v_edit,
    'live', (select config from ir_quote_config where id = 'live'),
    'liveAt', (select published_at from ir_quote_config where id = 'live'),
    'draft', case when v_edit then (select config from ir_quote_config where id = 'draft') end,
    'drafts', coalesce((select jsonb_agg(draft order by updated_at desc) from ir_quote_drafts where owner = auth.uid()), '[]'::jsonb)
  );
end $function$;
revoke execute on function public.ir_quote_read() from public, anon;
grant execute on function public.ir_quote_read() to authenticated;

create or replace function public.ir_drive_read()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not has_any_action(array['revenue_app.create:own', 'product_list.edit']) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(board order by updated_at) from ir_drive_boards where owner = auth.uid()), '[]'::jsonb);
end $function$;
revoke execute on function public.ir_drive_read() from public, anon;
grant execute on function public.ir_drive_read() to authenticated;

-- ── writes ──
-- p_kind 'draft' keeps the Principal's unpublished changes; 'publish' makes them what everybody quotes from (and the
-- draft the same). p_config null on 'draft' throws the draft away (Cancel).
create or replace function public.ir_quote_save_config(p_kind text, p_config jsonb)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_at timestamptz := now();
begin
  if auth.uid() is null or not has_any_action(array['product_list.edit']) then
    raise exception 'Only somebody who may edit the Product List may change the quotation settings.' using errcode = '42501';
  end if;
  if p_kind not in ('draft', 'publish') then raise exception 'Unknown save: %', p_kind using errcode = '22023'; end if;
  if p_config is null then
    if p_kind = 'publish' then raise exception 'Nothing to publish.' using errcode = '22023'; end if;
    delete from ir_quote_config where id = 'draft';
    return null;
  end if;
  if jsonb_typeof(p_config) <> 'object' or jsonb_typeof(p_config -> 'packages') <> 'array' then
    raise exception 'That is not a quotation setup.' using errcode = '22023';
  end if;
  insert into ir_quote_config (id, config, updated_by, updated_at)
  values ('draft', p_config, auth.uid(), v_at)
  on conflict (id) do update set config = excluded.config, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  if p_kind = 'publish' then
    insert into ir_quote_config (id, config, updated_by, updated_at, published_at)
    values ('live', p_config, auth.uid(), v_at, v_at)
    on conflict (id) do update set config = excluded.config, updated_by = excluded.updated_by, updated_at = excluded.updated_at,
      published_at = excluded.published_at;
  end if;
  return v_at;
end $function$;
revoke all on function public.ir_quote_save_config(text, jsonb) from public, anon;
grant execute on function public.ir_quote_save_config(text, jsonb) to authenticated;

-- A quote draft of the caller's own; p_draft null deletes it.
create or replace function public.ir_quote_save_draft(p_id text, p_draft jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not has_any_action(array['revenue_app.create:own', 'product_list.edit']) then
    raise exception 'Quotes are made by the IR team.' using errcode = '42501';
  end if;
  if p_draft is null then
    delete from ir_quote_drafts where owner = auth.uid() and id = p_id;
    return;
  end if;
  if jsonb_typeof(p_draft) <> 'object' or length(p_draft::text) > 2000000 then
    raise exception 'That draft cannot be kept.' using errcode = '22023';
  end if;
  insert into ir_quote_drafts (owner, id, draft, updated_at) values (auth.uid(), p_id, p_draft, now())
  on conflict (owner, id) do update set draft = excluded.draft, updated_at = excluded.updated_at;
end $function$;
revoke all on function public.ir_quote_save_draft(text, jsonb) from public, anon;
grant execute on function public.ir_quote_save_draft(text, jsonb) to authenticated;

-- A Drive board of the caller's own; p_board null deletes it.
create or replace function public.ir_drive_save_board(p_id text, p_board jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not has_any_action(array['revenue_app.create:own', 'product_list.edit']) then
    raise exception 'The Drive is the IR team''s.' using errcode = '42501';
  end if;
  if p_board is null then
    delete from ir_drive_boards where owner = auth.uid() and id = p_id;
    return;
  end if;
  if jsonb_typeof(p_board) <> 'object' or length(p_board::text) > 2000000 then
    raise exception 'That folder cannot be kept: move its pictures to storage first.' using errcode = '22023';
  end if;
  insert into ir_drive_boards (owner, id, board, updated_at) values (auth.uid(), p_id, p_board, now())
  on conflict (owner, id) do update set board = excluded.board, updated_at = excluded.updated_at;
end $function$;
revoke all on function public.ir_drive_save_board(text, jsonb) from public, anon;
grant execute on function public.ir_drive_save_board(text, jsonb) to authenticated;

-- ── the photos ──
insert into public.file_buckets (id, public, file_size_limit, allowed_mime_types, backend)
values ('ir-quote', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'], 'r2')
on conflict (id) do nothing;

-- In: config/<uid>/… for a settings editor, drive/<uid>/… for anybody who quotes — always their own folder.
create policy "ir quote photos: in" on public.file_objects for insert to authenticated
  with check (bucket_id = 'ir-quote'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (((storage.foldername(name))[1] = 'config' and (select has_any_action(array['product_list.edit'])))
      or ((storage.foldername(name))[1] = 'drive' and (select has_any_action(array['revenue_app.create:own', 'product_list.edit'])))));
-- Read: the settings' photos by everybody who quotes or edits; a Drive's by its owner.
create policy "ir quote photos: read" on public.file_objects for select to authenticated
  using (bucket_id = 'ir-quote'
    and (((storage.foldername(name))[1] = 'config' and (select has_any_action(array['revenue_app.create:own', 'product_list.edit'])))
      or ((storage.foldername(name))[1] = 'drive' and (storage.foldername(name))[2] = (select auth.uid())::text)));
-- Out: one's own files.
create policy "ir quote photos: out" on public.file_objects for delete to authenticated
  using (bucket_id = 'ir-quote' and (storage.foldername(name))[2] = (select auth.uid())::text);

select public.audit_register('ir_quote_config', 'IR quotation settings', 'Revenue', '{}', 'none',
  p_reason => 'One document rewritten whole on every save; when and by whom is on the row (updated_by, published_at).');
select public.audit_register('ir_quote_drafts', 'IR quote drafts', 'Revenue', '{}', 'none',
  p_reason => 'A salesperson''s unfinished quotes, their own only — working copies, not records.');
select public.audit_register('ir_drive_boards', 'IR Drive folders', 'Revenue', '{}', 'none',
  p_reason => 'A salesperson''s own style photos — working material, not records.');
