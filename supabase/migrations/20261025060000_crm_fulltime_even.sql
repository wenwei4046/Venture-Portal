-- Full time evenly (the owner, 2026-10-24: "因为现在的广告名单很少，所以如果按照广告比例再把广告咨询分给full time 的话，原定广告比例少的
-- 基本上拿不到资讯 … 例如harm hao hong, 这2天没有任何名单 … 只要我打开这个按钮，那广告名单就会平均分配给full time，而不是先针对比例再分配").
--
-- crm_settings.ft_even (off by default). On, on a Full time day an ad's lead — of an ad with a rule — goes to whichever
-- full-time person ticked for that day, across every team, has had the fewest ad leads today (then whoever got one least
-- recently), never through the ad's team split. A lead from no ad, and an ad nobody set, go to the Revenue Director as
-- before; a day nobody is ticked deals as any other day. crm_assign_contact: production's body (md5 2e8a3f1b…), one block
-- added after the Full time day is known. crm_settings_read: production's body, 'ftEven' added. crm_set_ft_even saves it.

alter table public.crm_settings add column if not exists ft_even boolean not null default false;

-- Today's full-time people (ticked for the office's weekday, full time, dealt), the one with fewest ad leads today first.
create or replace function public.crm_fulltime_even(p_at timestamptz)
returns table(staff uuid, team uuid) language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_local timestamp := p_at at time zone 'Asia/Kuala_Lumpur';
  v_day   int := (extract(isodow from v_local)::int + 6) % 7; -- 0 = Monday
  v_from  timestamptz := date_trunc('day', v_local) at time zone 'Asia/Kuala_Lumpur';
begin
  return query
    select f.h, f.tl from (
      select h, r.tl_id as tl,
             (select count(*) from crm_contacts c where c.assigned_to = h and c.ad_source_id is not null and c.assigned_at >= v_from) as n,
             (select max(c.assigned_at) from crm_contacts c where c.assigned_to = h) as last_at
        from crm_fulltime_rules r
        cross join lateral crm_deal_handlers(r.tl_id) h
        join crm_staff cs on cs.staff_id = h and cs.full_time
       where v_day = any (r.days) and coalesce((r.vals -> h::text ->> v_day::text)::numeric, 0) > 0
    ) f
    order by f.n, f.last_at nulls first, f.h
    limit 1;
end $$;
revoke all on function public.crm_fulltime_even(timestamptz) from public, anon, authenticated;
grant execute on function public.crm_fulltime_even(timestamptz) to service_role;

create or replace function public.crm_set_ft_even(p_on boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not crm_manages() then perform crm_deny('change the Full time setting'); end if;
  update crm_settings set ft_even = coalesce(p_on, false), updated_by = crm_me(), updated_at = now() where id = true;
end $$;
revoke all on function public.crm_set_ft_even(boolean) from public, anon;
grant execute on function public.crm_set_ft_even(boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.crm_settings_read()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s crm_settings;
begin
  if crm_my_role() is null then return null; end if;
  select * into s from crm_settings where id;
  return jsonb_build_object(
    'replySoonH', coalesce(s.reply_soon_h, 3), 'replyUrgentH', coalesce(s.reply_urgent_h, 6), 'replyOverdueH', coalesce(s.reply_overdue_h, 9),
    'suggestTemplate', coalesce(s.suggest_template, true), 'autoAssign', coalesce(s.auto_assign, true),
    'pushMessages', coalesce(s.push_messages, true), 'reminders', coalesce(s.reminders, true),
    'teamAlerts', coalesce(s.team_alerts, false), 'sendAutoReply', coalesce(s.send_auto_reply, true),
    'ftEven', coalesce(s.ft_even, false));
end $function$;

-- crm_assign_contact: production's body, the Full time evenly block put in once before the "no setting" branch.
do $do$
declare d text; anchor text := E'\n  if r.ad_source_id is null then\n    -- B · No setting';
begin
  select pg_get_functiondef('public.crm_assign_contact(uuid)'::regprocedure) into d;
  if md5((select prosrc from pg_proc where oid = 'public.crm_assign_contact(uuid)'::regprocedure)) <> '2e8a3f1b3d7613a134f186e7b11971da' then
    raise exception 'crm_assign_contact is not the body this was written over';
  end if;
  if (length(d) - length(replace(d, anchor, ''))) / length(anchor) <> 1 then raise exception 'anchor not found exactly once'; end if;
  d := replace(d, anchor, E'\n  -- Full time evenly (2026-10-24): on a Full time day, an ad''s lead to the full-time person with fewest ad leads today,\n  -- across every team — not through the ad''s split. Settings › New leads › Full time evenly.\n  if v_ftday and r.ad_source_id is not null and coalesce((select s.ft_even from crm_settings s where s.id), false) then\n    select e.staff, e.team into v_who, v_team from crm_fulltime_even(v_at) e;\n    if v_who is not null then\n      update crm_contacts set team_id = v_team, assigned_to = v_who, held_reason = null where id = p_contact;\n      return jsonb_build_object(''assigned'', true, ''team'', v_team, ''member'', v_who, ''member_by'', ''full_time_even'');\n    end if;\n  end if;' || anchor);
  execute d;
end $do$;
