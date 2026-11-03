-- A showroom's draft (2026-11-03, the owner: "帮我在 showroom 的部分做一个存为草稿"): the desktop's Showrooms editor keeps
-- unfinished changes here — the showroom itself (crm_showrooms, what Book visit and crm_slot_check read) is untouched
-- until Save. One draft a showroom, and one for a showroom not added yet ('new'); the Principal and the Director share
-- them, as they share the settings. Only CRM · Manage reads or writes one; a salesperson never sees a draft.
create table if not exists public.crm_showroom_drafts (
  room text primary key,
  draft jsonb not null,
  saved_by uuid,
  saved_at timestamptz not null default now()
);
-- RLS on and no policy: read through crm_showroom_drafts_read() and written through crm_save_showroom_draft(), each asking
-- crm_manages() (a helper the browser may not call, so no row policy can ask it).
alter table public.crm_showroom_drafts enable row level security;
revoke all on public.crm_showroom_drafts from anon, authenticated;

create or replace function public.crm_showroom_drafts_read()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not crm_manages() then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('room', room, 'draft', draft, 'saved_by', saved_by, 'saved_at', saved_at)) from crm_showroom_drafts), '[]'::jsonb);
end $function$;
revoke execute on function public.crm_showroom_drafts_read() from public, anon;
grant execute on function public.crm_showroom_drafts_read() to authenticated;

-- p_room: a showroom's id or 'new'; p_draft null takes the draft away (Save and Discard draft).
create or replace function public.crm_save_showroom_draft(p_room text, p_draft jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r crm_showroom_drafts;
begin
  if not public.crm_manages() then perform crm_deny('change the showrooms'); end if;
  if p_room is null or (p_room <> 'new' and not exists (select 1 from crm_showrooms where id = p_room and deleted_at is null)) then
    raise exception 'That showroom is not on the list.' using errcode = '22023';
  end if;
  if p_draft is null then
    delete from crm_showroom_drafts where room = p_room;
    return null;
  end if;
  if jsonb_typeof(p_draft) <> 'object' or length(p_draft::text) > 100000 then
    raise exception 'That draft cannot be kept.' using errcode = '22023';
  end if;
  insert into crm_showroom_drafts (room, draft, saved_by, saved_at)
  values (p_room, p_draft, public.crm_me(), now())
  on conflict (room) do update set draft = excluded.draft, saved_by = excluded.saved_by, saved_at = excluded.saved_at
  returning * into r;
  return to_jsonb(r);
end $function$;
revoke all on function public.crm_save_showroom_draft(text, jsonb) from public, anon;
grant execute on function public.crm_save_showroom_draft(text, jsonb) to authenticated, service_role;

SELECT public.audit_register('crm_showroom_drafts', 'CRM showroom drafts', 'Member services', '{}', 'none',
  p_reason => 'Unfinished showroom changes not yet saved — the showroom''s own history is crm_showrooms''.');
