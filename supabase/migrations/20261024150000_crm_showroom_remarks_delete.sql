-- CRM redesign v2 · frame 07 Showrooms (2026-10-23; the owner: "全部根据新设计"; handoff note 04):
--   * Remarks — staff only, never sent to or shown to a customer; shown to sales in Book visit for that showroom.
--   * Delete showroom — confirmed on screen; refused while it has upcoming visits, saying how many. A soft delete: the row
--     stays (closed, deleted_at set) so past visits keep their showroom's name; every list leaves it out.
-- Opening hours per day need nothing new: they are the showroom's slots ("HH:MM@days"), as the weekly grid writes them.
-- New functions only (no CRM function rewritten). Both ask CRM · Manage (crm_manages), as every showroom write.

alter table public.crm_showrooms add column if not exists remarks text not null default '';
alter table public.crm_showrooms add column if not exists deleted_at timestamptz;
alter table public.crm_showrooms drop constraint if exists crm_showrooms_remarks_len;
alter table public.crm_showrooms add constraint crm_showrooms_remarks_len check (char_length(remarks) <= 1000);

create or replace function public.crm_save_showroom_remarks(p_id text, p_remarks text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r crm_showrooms;
begin
  if not public.crm_manages() then perform crm_deny('change the showrooms'); end if;
  update crm_showrooms set remarks = left(trim(coalesce(p_remarks, '')), 1000)
   where id = p_id and deleted_at is null returning * into r;
  if r.id is null then raise exception 'That showroom is not on the list.' using errcode = '22023'; end if;
  return to_jsonb(r);
end $$;

create or replace function public.crm_delete_showroom(p_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r crm_showrooms; n int;
begin
  if not public.crm_manages() then perform crm_deny('change the showrooms'); end if;
  select count(*) into n from crm_appointments where showroom = p_id and state = 'booked' and start_at > now();
  if n > 0 then
    raise exception 'This showroom has % upcoming visit%. Move or cancel them first.', n, case when n = 1 then '' else 's' end using errcode = '22023';
  end if;
  update crm_showrooms set active = false, deleted_at = now() where id = p_id and deleted_at is null returning * into r;
  if r.id is null then raise exception 'That showroom is not on the list.' using errcode = '22023'; end if;
  return to_jsonb(r);
end $$;

revoke all on function public.crm_save_showroom_remarks(text, text) from public, anon;
revoke all on function public.crm_delete_showroom(text) from public, anon;
grant execute on function public.crm_save_showroom_remarks(text, text) to authenticated;
grant execute on function public.crm_delete_showroom(text) to authenticated;
