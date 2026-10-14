-- Starred messages (2026-10-14; the owner: "Forward、Info、Star 也加上去" … "做吧"): each person's own stars on a chat's
-- messages, as WhatsApp's — nobody else sees them, and the message itself is not touched. Built exactly as "Delete for
-- me" (crm_message_hides, mig 20261009160000): one's own rows, read under one's own session; written only by a DEFINER
-- function that asks the question the customer's read policy asks.

create table if not exists public.crm_message_stars (
  staff_id   uuid not null references public.hr_staff_costs(id) on delete cascade,
  message_id uuid not null references public.crm_messages(id) on delete cascade,
  starred_at timestamptz not null default now(),
  primary key (staff_id, message_id)
);

alter table public.crm_message_stars enable row level security;
revoke all on public.crm_message_stars from anon, authenticated;
grant select on public.crm_message_stars to authenticated;

drop policy if exists crm_message_stars_own on public.crm_message_stars;
create policy crm_message_stars_own on public.crm_message_stars for select to authenticated
  using (staff_id = (select crm_me()));

-- Star (p_on = true) or unstar a message one can see.
create or replace function public.crm_star_message(p_message uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_contact uuid;
begin
  select contact_id into v_contact from crm_messages where id = p_message;
  -- SECURITY DEFINER reads past RLS, so ask the question the read policy asks.
  if v_contact is null or not exists (select 1 from crm_contacts c where c.id = v_contact
       and (crm_can_see(c.assigned_to, c.team_id) or c.id in (select crm_my_shares()))) then
    perform crm_deny('star this message');
  end if;
  if p_on then
    insert into crm_message_stars (staff_id, message_id) values (crm_me(), p_message) on conflict do nothing;
  else
    delete from crm_message_stars where staff_id = crm_me() and message_id = p_message;
  end if;
end $$;

revoke execute on function public.crm_star_message(uuid, boolean) from public, anon;
grant execute on function public.crm_star_message(uuid, boolean) to authenticated;

SELECT public.audit_register('crm_message_stars', 'CRM starred messages', 'Member services', '{}', 'none',
  p_reason => 'Each person''s own stars on a chat — their view, not a record.');
