-- The Revenue app's bell, live (2026-10-14 — the owner, after Today's CRM chat button went live: "change to on live as
-- well"; the app's rule stands that nothing else on the screen reads again by itself).
--
-- The bell counts three things: their notifications (a meeting booked for them, a manpower request's step, a memo
-- addressed to them), HR's memos to acknowledge, and their requests HR returned. Whenever one of them changes for
-- somebody, the database tells THAT person's own private Realtime channel `bell:<user id>` at once, and the app reads
-- the bell again, silently:
--   notice   — app_notifications: one for them (in), theirs read (another phone's bell follows), one taken back;
--   memo     — a memo they can see published, changed or withdrawn; a sub-department added to or taken off a memo's
--              audience (its people); they themselves added to a memo or taken off it; their own receipt (they read or
--              acknowledged it on another phone);
--   request  — their request sent, or HR moving it (its status, note or title).
-- The channel carries no content — only which of the three changed — and only its owner may listen (the policy on
-- realtime.messages below); every table stays closed to the browser as it was, and the app reads what changed through
-- its usual readers. The CRM's own notices (kind crm) tell nothing here: the bell never lists them, and a busy chat would
-- ring it for nothing.
--
-- One message a person a statement (transition tables): notifications_read() marking fifty read is one, not fifty. A
-- failure only warns — the bell never stops the work it tells of. A database without Realtime (a local check) skips the
-- policy; the trigger's send then only warns.

create or replace function public.revenue_bell_ping()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
  v_users uuid[];
  v_user uuid;
begin
  if tg_table_name = 'app_notifications' then
    v_event := 'notice';
    if tg_op = 'INSERT' then
      select array_agg(distinct f.user_id) into v_users from fresh f where f.kind is distinct from 'crm';
    elsif tg_op = 'UPDATE' then
      -- Read or unread: the push bookkeeping (push_taken_at, pushed_at) is no news.
      select array_agg(distinct f.user_id) into v_users
        from fresh f join before_rows b on b.id = f.id
       where f.kind is distinct from 'crm' and f.read_at is distinct from b.read_at;
    else
      select array_agg(distinct b.user_id) into v_users from before_rows b where b.kind is distinct from 'crm';
    end if;

  elsif tg_table_name = 'member_requests' then
    v_event := 'request';
    if tg_op = 'INSERT' then
      select array_agg(distinct f.created_by) into v_users from fresh f where f.status is distinct from 'draft';
    else
      select array_agg(distinct f.created_by) into v_users
        from fresh f join before_rows b on b.id = f.id
       where f.status is distinct from 'draft' and (f.status, f.note, f.title) is distinct from (b.status, b.note, b.title);
    end if;

  elsif tg_table_name = 'member_memos' then
    -- Whoever sees the memo now (member_visible_memo — the snapshot's own test): its sub-departments' people, their
    -- directors, the people it is addressed to.
    v_event := 'memo';
    select array_agg(distinct s.user_id) into v_users
      from public.hr_staff_costs s
     where s.user_id is not null and s.status = 'active'
       and exists (select 1 from fresh f where public.member_visible_memo(f.id, s.id));

  elsif tg_table_name = 'member_memo_audiences' then
    -- A sub-department added or taken off: its people and directors, who gain the memo or lose it.
    v_event := 'memo';
    if tg_op = 'INSERT' then
      select array_agg(distinct s.user_id) into v_users
        from public.hr_staff_costs s
       where s.user_id is not null and s.status = 'active'
         and exists (select 1 from fresh a
                      where public.member_has_membership(s.id, a.sub_department_id)
                         or public.member_director_scheme(s.id, a.sub_department_id) is not null);
    else
      select array_agg(distinct s.user_id) into v_users
        from public.hr_staff_costs s
       where s.user_id is not null and s.status = 'active'
         and exists (select 1 from before_rows a
                      where public.member_has_membership(s.id, a.sub_department_id)
                         or public.member_director_scheme(s.id, a.sub_department_id) is not null);
    end if;

  elsif tg_table_name = 'member_memo_recipients' then
    -- People a memo is addressed to, added or taken off.
    v_event := 'memo';
    if tg_op = 'INSERT' then
      select array_agg(distinct s.user_id) into v_users
        from fresh r join public.hr_staff_costs s on s.id = r.staff_id
       where s.user_id is not null and s.status = 'active';
    else
      select array_agg(distinct s.user_id) into v_users
        from before_rows r join public.hr_staff_costs s on s.id = r.staff_id
       where s.user_id is not null and s.status = 'active';
    end if;

  elsif tg_table_name = 'member_memo_receipts' then
    -- Read or acknowledged — on this phone or another: the bell's "to acknowledge" follows on every one.
    v_event := 'memo';
    select array_agg(distinct f.user_id) into v_users from fresh f;
  end if;

  foreach v_user in array coalesce(v_users, '{}'::uuid[]) loop
    continue when v_user is null;
    begin
      perform realtime.send(jsonb_build_object('at', now()), v_event, 'bell:' || v_user::text, true);
    exception when others then
      raise warning 'revenue_bell_ping: %', sqlerrm;
    end;
  end loop;
  return null;
exception when others then
  raise warning 'revenue_bell_ping: %', sqlerrm;
  return null;
end $$;

comment on function public.revenue_bell_ping() is
  'The Revenue app''s live bell (2026-10-14): a notice, memo or request of somebody''s changing pings their own private channel bell:<user id> — which of the three, no content, never the CRM''s notices.';

revoke all on function public.revenue_bell_ping() from public, anon, authenticated;

-- One trigger an event: a trigger with transition tables takes one.
drop trigger if exists revenue_bell_notice_in on public.app_notifications;
create trigger revenue_bell_notice_in after insert on public.app_notifications
  referencing new table as fresh for each statement execute function public.revenue_bell_ping();
drop trigger if exists revenue_bell_notice_read on public.app_notifications;
create trigger revenue_bell_notice_read after update on public.app_notifications
  referencing old table as before_rows new table as fresh for each statement execute function public.revenue_bell_ping();
drop trigger if exists revenue_bell_notice_gone on public.app_notifications;
create trigger revenue_bell_notice_gone after delete on public.app_notifications
  referencing old table as before_rows for each statement execute function public.revenue_bell_ping();

drop trigger if exists revenue_bell_request_in on public.member_requests;
create trigger revenue_bell_request_in after insert on public.member_requests
  referencing new table as fresh for each statement execute function public.revenue_bell_ping();
drop trigger if exists revenue_bell_request_moved on public.member_requests;
create trigger revenue_bell_request_moved after update on public.member_requests
  referencing old table as before_rows new table as fresh for each statement execute function public.revenue_bell_ping();

drop trigger if exists revenue_bell_memo_in on public.member_memos;
create trigger revenue_bell_memo_in after insert on public.member_memos
  referencing new table as fresh for each statement execute function public.revenue_bell_ping();
drop trigger if exists revenue_bell_memo_changed on public.member_memos;
create trigger revenue_bell_memo_changed after update on public.member_memos
  referencing new table as fresh for each statement execute function public.revenue_bell_ping();

drop trigger if exists revenue_bell_audience_in on public.member_memo_audiences;
create trigger revenue_bell_audience_in after insert on public.member_memo_audiences
  referencing new table as fresh for each statement execute function public.revenue_bell_ping();
drop trigger if exists revenue_bell_audience_out on public.member_memo_audiences;
create trigger revenue_bell_audience_out after delete on public.member_memo_audiences
  referencing old table as before_rows for each statement execute function public.revenue_bell_ping();

drop trigger if exists revenue_bell_recipient_in on public.member_memo_recipients;
create trigger revenue_bell_recipient_in after insert on public.member_memo_recipients
  referencing new table as fresh for each statement execute function public.revenue_bell_ping();
drop trigger if exists revenue_bell_recipient_out on public.member_memo_recipients;
create trigger revenue_bell_recipient_out after delete on public.member_memo_recipients
  referencing old table as before_rows for each statement execute function public.revenue_bell_ping();

drop trigger if exists revenue_bell_receipt_in on public.member_memo_receipts;
create trigger revenue_bell_receipt_in after insert on public.member_memo_receipts
  referencing new table as fresh for each statement execute function public.revenue_bell_ping();
drop trigger if exists revenue_bell_receipt_changed on public.member_memo_receipts;
create trigger revenue_bell_receipt_changed after update on public.member_memo_receipts
  referencing new table as fresh for each statement execute function public.revenue_bell_ping();

-- Only the channel's owner hears it: a signed-in session may listen to `bell:<its own user id>` and to nothing else of it.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "bell: one''s own channel" on realtime.messages';
    execute $policy$
      create policy "bell: one's own channel" on realtime.messages
        for select to authenticated
        using (
          (select realtime.topic()) = 'bell:' || (select auth.uid())::text
          and realtime.messages.extension = 'broadcast'
        )
    $policy$;
  end if;
end $$;
