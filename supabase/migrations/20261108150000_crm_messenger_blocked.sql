-- A Messenger customer blocked on Facebook (the owner, 2026-11-08: "若我在 fb 已经 block 了这个人，对话框写 block，并放到 block 分类里").
-- Meta sends no webhook for a block. What it does say is the conversation's `can_reply` (Graph: /{page}/conversations,
-- read with the Page's token): false once the Page blocked the person (on 2026-11-08: Kam Kee Lam, 524 messages, and one
-- more of the latest 100). The hourly sweep (app/api/member-queue › refreshMessengerBlocked) reads it for every Page and
-- hands the answer here; the CRM shows such a chat as Blocked and files it under Blocked.
--
--   crm_contacts.fb_blocked     true while Facebook says the Page cannot reply; fb_blocked_at when it was first seen.
--   crm_set_messenger_blocked   the sweep's one write (service role only): the Page's blocked PSIDs; with p_complete
--                               (every conversation was read) the others on that Page are unblocked again.

alter table public.crm_contacts add column if not exists fb_blocked boolean not null default false;
alter table public.crm_contacts add column if not exists fb_blocked_at timestamptz;

create or replace function public.crm_set_messenger_blocked(p_page text, p_psids text[], p_complete boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n int := 0; v_m int := 0;
begin
  if p_page is null or p_page !~ '^\d+$' then raise exception 'A Page id.' using errcode = '22023'; end if;
  update crm_contacts set fb_blocked = true, fb_blocked_at = coalesce(fb_blocked_at, now())
   where channel = 'messenger' and account_id = p_page and external_id = any (coalesce(p_psids, '{}')) and not fb_blocked;
  get diagnostics v_n = row_count;
  if p_complete then
    update crm_contacts set fb_blocked = false, fb_blocked_at = null
     where channel = 'messenger' and account_id = p_page and fb_blocked and not (external_id = any (coalesce(p_psids, '{}')));
    get diagnostics v_m = row_count;
  end if;
  return v_n + v_m;
end $$;
revoke execute on function public.crm_set_messenger_blocked(text, text[], boolean) from public, anon, authenticated;
grant execute on function public.crm_set_messenger_blocked(text, text[], boolean) to service_role;
