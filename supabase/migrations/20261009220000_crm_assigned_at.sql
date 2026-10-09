-- When and by whom a customer was given to the person who has them (user
-- 2026-10-09: 有被分派到广告咨询，或者有新进的名单，都要有 noti 让 team member 知道).
-- Every way a customer reaches someone — dealt on arrival from an ad or by the
-- team's rules, sent by the Principal / Director (crm_send_to), handed out by a
-- TL, a move accepted — sets assigned_to, so one trigger stamps them all. The
-- salesperson's bell reads it: "New enquiry for you" (nobody: the CRM dealt it)
-- or "PETER assigned a customer to you". Additive: two columns and a trigger.
alter table public.crm_contacts
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by uuid references public.hr_staff_costs(id);

create or replace function public.crm_contacts_stamp_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is null then
    new.assigned_at := null;
    new.assigned_by := null;
  elsif tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to then
    new.assigned_at := now();
    -- The signed-in person who gave it; null when the CRM dealt it (the ingest has no session).
    new.assigned_by := case when auth.uid() is null then null else crm_me() end;
  end if;
  return new;
end $$;
revoke all on function public.crm_contacts_stamp_assigned() from public, anon, authenticated;

create or replace trigger crm_contacts_stamp_assigned
  before insert or update of assigned_to on public.crm_contacts
  for each row execute function public.crm_contacts_stamp_assigned();
