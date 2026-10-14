-- The Revenue app's CRM chat button (2026-10-14 — the "Revenue app refresh" Claude Design handoff §2: a chat button in
-- Today's header capsule with the count of what is waiting; the user: the count is the customers' messages not read
-- yet, the CRM's own Inbox figure, and it moves the moment one comes in — "像 notification 这样，只要一 send，对方收到的话，
-- 就会跳" — while nothing else on the screen reads again).
--
-- 1. crm_my_unread(): one's own chats' unread messages — the customers given to them or shared with them, less the
--    ones they hid: CrmApp's Mine, whose unread the CRM's Inbox badge adds up. SECURITY INVOKER — crm_contacts' own
--    row policy answers what the caller may read, and crm_me() is nobody without CRM · View, so they get 0. STABLE:
--    View as a person may call it (lib/supabase/read-only.ts).
-- 2. crm_contacts joins the supabase_realtime publication (empty until now): the app listens to its changes under the
--    member's own session — Realtime asks the table's row policy for every listener, so a change reaches only those who
--    may read that customer — and reads crm_my_unread() again when one comes. A database without the publication
--    (a local check) skips it.

create or replace function public.crm_my_unread()
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(c.unread), 0)::integer
  from public.crm_contacts c
  where c.unread > 0
    and (c.assigned_to = (select public.crm_me()) or c.id in (select public.crm_my_shares()))
    and not exists (
      select 1 from public.crm_contact_prefs p
      where p.contact_id = c.id and p.staff_id = (select public.crm_me()) and p.hidden
    );
$$;

comment on function public.crm_my_unread() is
  'The Revenue app''s CRM chat button (2026-10-14): the unread messages of one''s own chats — given to or shared with the caller, not hidden.';

revoke all on function public.crm_my_unread() from public, anon;
grant execute on function public.crm_my_unread() to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'crm_contacts') then
    alter publication supabase_realtime add table public.crm_contacts;
  end if;
end $$;
