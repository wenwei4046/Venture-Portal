-- Each CRM view's teams follow its own Staff Hierarchy (2026-11-27 — the owner, told that Dream Crafter's CRM still read
-- IR's chart: "need follow by dc heirachy"; "ir = the conts. DC = dream crafter").
--
-- Until now the CRM's structure — who is in it, their title and role, who reports to whom, the teams, whose chats a
-- leader reads, the dealer's teams — was IR's memberships alone (crm_scope(), Revenue › IR › Sales Groups); Dream
-- Crafter's view was IR's chart with the people who hold the brand picked out. Now a customer is read, answered and
-- dealt by the chart of its brand's sub-department (crm_brand_sub: The Conts → IR, Dream Crafter → DC); a customer of
-- no brand of ours stays IR's, as before.
--
--   · The structure helpers take a sub-department: crm_scope_member_in, crm_scope_director_in, crm_role_in,
--     crm_upline_in, crm_downline_in. The old names (crm_scope_member, crm_scope_director, crm_role_of, crm_upline_of,
--     crm_downline — and so crm_team_of, crm_is_team_top, crm_team_handlers, crm_all_handlers, crm_deal_handlers and
--     crm_my_downline, which call them) answer for the chart of the work in hand, crm_line_sub(): the line a write or a
--     deal set (crm.line, transaction-local), else IR's — exactly as before.
--   · A write about a customer follows that customer's chart first (crm_follow_line): Send to, Send to team, a leader's
--     Assign, Give to the Revenue Director, Share / Move and their answer, a customer added by hand. The dealer
--     (crm_assign_contact — production's body renamed crm_deal_in_line, not one character changed) deals in the
--     customer's chart and puts the line back after, as one webhook deals several customers in one transaction. An
--     ad's split follows the ad's brand (crm_follow_ad_line: saving it, Up next's preview); a person's own settings the
--     chart they stand in (crm_follow_staff_line: Full time, lock, work type, Up next's Skip / Pause / Give to / leave,
--     a team's Full time days).
--   · Reading: crm_my_lines() = (brand, person) — one's own line in each brand's chart. crm_contacts' read policy asks
--     the line in the customer's own brand's chart; crm_can_reply too, with one's role in that chart. What a leader
--     reads of their people's settings (crm_staff, Full time rules, team settings, invitations, the old ad rules)
--     reads every line of theirs.
--   · crm_people() hands each person's line in each brand's chart (`lines` — role, upline, title); the app's Dream
--     Crafter view draws its teams from them. The top-level role / upline / title stay IR's for a page opened before.
--   · A Revenue Director (IR's director, a sub-department's CRM director) is one in every chart, as before — PETER and
--     KRIS in Dream Crafter's Director row. A chart's top reports to its own sub-department's director (DC's: KRIS,
--     Revenue › DC › Sales Groups since 2026-11-27), else to its CRM director.
--   · crm_my_role() asks one's role in the chart in hand, then IR's, then DC's, then Boss — somebody in DC's chart alone
--     is no longer read as the Boss; crm_cross_viewers leaves out whoever has a role in either chart.
--
-- From production's bodies (tests/member-sql/crm-lines-production.sql, dumped 2026-11-27): each one-statement change is
-- found exactly once or the migration stops; the bodies replaced whole are checked against production's md5 first; the
-- end checks every body against what tests/member-sql/validate-crm-lines-follow-view.mjs ran.

CREATE OR REPLACE FUNCTION pg_temp.swap_once(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_def   text := pg_get_functiondef(p_sig);
  v_pat   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: the statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  FOR v_found IN SELECT DISTINCT m[1] FROM regexp_matches(v_src, '(' || v_pat || ')', 'g') AS m LOOP
    v_def := replace(v_def, v_found, p_new);
  END LOOP;
  EXECUTE v_def;
END
$fn$;

-- The bodies replaced whole must still be production's of 2026-11-27 (or this migration's, run again).
DO $$
DECLARE r record; v text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.crm_scope_member(uuid)',   'e319a4f1a3d623daa5e109b5f5c9156c', 'ba7cb3c84c5a08e3e218d46b7356a927'),
      ('public.crm_scope_director()',     '9d12205feb18921ad71b7ea87405d145', 'ed6a820ccf43ba65f56ac30e6712d609'),
      ('public.crm_role_of(uuid)',        '2ca8661a549e8676382627239ee7c468', 'ac65cb043219736ac14ec7d0c76d1945'),
      ('public.crm_upline_of(uuid)',      '728f36db9849d17c0a87e57c7de32161', '10fab30009128a4921bc9313ce8eb9dc'),
      ('public.crm_downline(uuid)',       '6d5a7d7cbd33fb8825b484e8bf7a07e9', '23f972cf525cdaa9d6530856b3f0fc58'),
      ('public.crm_people()',             '99b31da7423229e340060dcf4e168cc7', 'a9b67c728b64ec6abc490341c8ffed62'),
      ('public.crm_assign_contact(uuid)', '3454d09ca95fc96fd96a8fa33086af8c', '92b8031cee64ea5c4bd39193059f5b27')) x(sig, before, after)
  LOOP
    v := md5((SELECT prosrc FROM pg_proc WHERE oid = r.sig::regprocedure));
    IF v NOT IN (r.before, r.after) THEN
      RAISE EXCEPTION '% is % — not production''s body of 2026-11-27 (%): rewrite this migration from the one it has now', r.sig, v, r.before;
    END IF;
  END LOOP;
END $$;

-- ── The chart in hand ─────────────────────────────────────────────────────────────────────────────────────────────

-- The sub-department whose chart this transaction's CRM work follows: the line a write or a deal set, else the CRM's own.
CREATE OR REPLACE FUNCTION public.crm_line_sub()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
begin
  return coalesce(nullif(current_setting('crm.line', true), '')::uuid, crm_scope());
end
$fn$;

-- A brand's chart: its sub-department's (crm_brand_sub), else the CRM's own; none while the CRM is tied to none.
CREATE OR REPLACE FUNCTION public.crm_brand_line(p_brand text)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
begin
  if crm_scope() is null then return null; end if;
  return coalesce(crm_brand_sub(coalesce(p_brand, 'conts')), crm_scope());
end
$fn$;

-- An ad's brand, as the app reads it (lib/member/crm-view.ts › adBrands): its leads' number or Page — the most of them,
-- a tie The Conts' — else the Page Meta named for it; none known, none.
CREATE OR REPLACE FUNCTION public.crm_ad_brand(p_ad text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
declare v text;
begin
  if p_ad is null then return null; end if;
  select x.b into v from (
    select crm_brand_of(c.account_id) as b, count(*) as n from crm_contacts c
     where c.ad_source_id = p_ad and crm_brand_of(c.account_id) is not null group by 1) x
   order by x.n desc, (x.b = 'conts') desc limit 1;
  if v is null then
    select crm_brand_of(a.page_id) into v from crm_ad_names a where a.ad_source_id = p_ad;
  end if;
  return v;
end
$fn$;

-- A customer's chart: its number's or Page's brand, else its ad's (Up next's preview has no number), else IR's.
CREATE OR REPLACE FUNCTION public.crm_line_of_contact(p_contact uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
declare v_account text; v_ad text;
begin
  if crm_scope() is null then return null; end if;
  select c.account_id, c.ad_source_id into v_account, v_ad from crm_contacts c where c.id = p_contact;
  return crm_brand_line(coalesce(crm_brand_of(v_account), crm_ad_brand(v_ad)));
end
$fn$;

-- Work on a customer follows its chart, until the transaction ends (or a deal puts it back).
CREATE OR REPLACE FUNCTION public.crm_follow_line(p_contact uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
begin
  if crm_scope() is null then return; end if;
  perform set_config('crm.line', coalesce(crm_line_of_contact(p_contact)::text, ''), true);
end
$fn$;

-- A customer to be added on a number: that number's brand's chart.
CREATE OR REPLACE FUNCTION public.crm_follow_account_line(p_account text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
begin
  if crm_scope() is null then return; end if;
  perform set_config('crm.line', coalesce(crm_brand_line(crm_brand_of(p_account))::text, ''), true);
end
$fn$;

-- An ad's split follows the ad's brand's chart; an ad of no known brand, as before (IR's).
CREATE OR REPLACE FUNCTION public.crm_follow_ad_line(p_ad text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
declare v_brand text;
begin
  if crm_scope() is null then return; end if;
  v_brand := crm_ad_brand(p_ad);
  if v_brand is null then return; end if;
  perform set_config('crm.line', coalesce(crm_brand_line(v_brand)::text, ''), true);
end
$fn$;

-- Several ads (Up next's All ads of a view): their chart when they are all one brand's; else as before.
CREATE OR REPLACE FUNCTION public.crm_follow_ads_line(p_ads text[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
declare v text[];
begin
  if crm_scope() is null or coalesce(cardinality(p_ads), 0) = 0 then return; end if;
  v := array(select distinct crm_ad_brand(a) from unnest(p_ads) a);
  if cardinality(v) = 1 and v[1] is not null then
    perform set_config('crm.line', coalesce(crm_brand_line(v[1])::text, ''), true);
  end if;
end
$fn$;

-- A person's own settings: the chart where they are in one's line (IR's first); else the one they have a role in.
CREATE OR REPLACE FUNCTION public.crm_follow_staff_line(p_staff uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
declare v_me uuid := crm_me(); v_sub uuid; v_subs uuid[];
begin
  if crm_scope() is null or p_staff is null then return; end if;
  v_subs := array[crm_brand_line('conts'), crm_brand_line('dc')];
  if v_me is not null and p_staff is distinct from v_me then
    foreach v_sub in array v_subs loop
      if p_staff in (select crm_downline_in(v_me, v_sub)) then
        perform set_config('crm.line', v_sub::text, true);
        return;
      end if;
    end loop;
  end if;
  foreach v_sub in array v_subs loop
    if crm_role_in(p_staff, v_sub) is not null then
      perform set_config('crm.line', v_sub::text, true);
      return;
    end if;
  end loop;
end
$fn$;

-- ── Each chart's structure ────────────────────────────────────────────────────────────────────────────────────────

-- A person's membership of a sub-department's chart today: title, upline, whether they are in it.
CREATE OR REPLACE FUNCTION public.crm_scope_member_in(p_staff uuid, p_sub uuid, OUT title_id uuid, OUT upline uuid, OUT is_member boolean)
RETURNS record
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
declare v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  is_member := false;
  select h.title_id, h.upline_staff_id, true into title_id, upline, is_member
    from comm_hierarchy h join comm_schemes c on c.id = h.scheme_id
   where h.staff_id = p_staff and c.sub_department_id = p_sub and c.is_active
     and h.effective_from <= v_today and (h.effective_to is null or h.effective_to >= v_today)
   order by h.effective_from desc limit 1;
  is_member := coalesce(is_member, false);
end
$fn$;

-- Whom a chart's top reports to: the sub-department's director (Revenue › Sales Groups), else its CRM director.
CREATE OR REPLACE FUNCTION public.crm_scope_director_in(p_sub uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
declare v uuid;
begin
  select d.staff_id into v from comm_sub_department_directors d join hr_staff_costs s on s.id = d.staff_id
   where d.sub_department_id = p_sub and s.status = 'active' order by s.employee_name limit 1;
  if v is null then
    select ss.crm_director into v from crm_sub_settings ss join hr_staff_costs s on s.id = ss.crm_director
     where ss.sub_department_id = p_sub and s.status = 'active';
  end if;
  return v;
end
$fn$;

-- A person's CRM role in a sub-department's chart: their title there; a Revenue Director — IR's director, this
-- sub-department's, or a sub-department's CRM director — in every chart; the CEO the Boss. No sub-department: by title.
CREATE OR REPLACE FUNCTION public.crm_role_in(p_staff uuid, p_sub uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
declare m record;
begin
  if p_sub is null then
    return (select cm.crm_role from hr_staff_costs s join crm_role_map cm on cm.title_id = s.title_id where s.id = p_staff);
  end if;
  select * into m from crm_scope_member_in(p_staff, p_sub);
  if m.is_member then
    return (select cm.crm_role from crm_role_map cm
             where cm.title_id = coalesce(m.title_id, (select title_id from hr_staff_costs where id = p_staff))
               and cm.crm_role in ('stl', 'tl', 'ta', 'rs'));
  end if;
  if exists (select 1 from comm_sub_department_directors d where d.sub_department_id in (crm_scope(), p_sub) and d.staff_id = p_staff) then
    return 'hod';
  end if;
  -- A sub-department's CRM director (crm_sub_settings.crm_director — DC's: KRIS) is a Revenue Director too
  -- (2026-11-24, mig 20261124230000).
  if exists (select 1 from crm_sub_settings ss where ss.crm_director = p_staff) then
    return 'hod';
  end if;
  return (select cm.crm_role from hr_staff_costs s join crm_role_map cm on cm.title_id = s.title_id
           where s.id = p_staff and cm.crm_role = 'boss');
end
$fn$;

-- A person's direct superior in a sub-department's chart (its top: the sub-department's director). No sub-department:
-- People's reports_to.
CREATE OR REPLACE FUNCTION public.crm_upline_in(p_staff uuid, p_sub uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
declare m record;
begin
  if p_sub is null then return (select reports_to from hr_staff_costs where id = p_staff); end if;
  select * into m from crm_scope_member_in(p_staff, p_sub);
  if not m.is_member then return null; end if;
  return coalesce(m.upline, crm_scope_director_in(p_sub));
end
$fn$;

-- A person and everybody below them in a sub-department's chart. No sub-department: People's reports_to.
CREATE OR REPLACE FUNCTION public.crm_downline_in(p_staff uuid, p_sub uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
declare v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date; v_dir uuid;
begin
  if p_sub is null then
    return query
      with recursive line(id, depth) as (
        select p_staff, 0 where p_staff is not null
        union
        select s.id, l.depth + 1 from hr_staff_costs s join line l on s.reports_to = l.id
         where l.depth < 20 and s.status = 'active'
      )
      select id from line;
    return;
  end if;
  v_dir := crm_scope_director_in(p_sub);
  return query
    with recursive members as (
      select distinct on (h.staff_id) h.staff_id as id, coalesce(h.upline_staff_id, v_dir) as up
        from comm_hierarchy h join comm_schemes c on c.id = h.scheme_id join hr_staff_costs s on s.id = h.staff_id
       where c.sub_department_id = p_sub and c.is_active and s.status = 'active'
         and h.effective_from <= v_today and (h.effective_to is null or h.effective_to >= v_today)
       order by h.staff_id, h.effective_from desc
    ), line(id, depth) as (
      select p_staff, 0 where p_staff is not null
      union
      select m.id, l.depth + 1 from members m join line l on m.up = l.id where l.depth < 20
    )
    select id from line;
end
$fn$;

-- The old names answer for the chart in hand (crm_line_sub()): IR's unless a write or a deal set another.
CREATE OR REPLACE FUNCTION public.crm_scope_member(p_staff uuid, OUT title_id uuid, OUT upline uuid, OUT is_member boolean)
RETURNS record
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
begin
  select m.title_id, m.upline, m.is_member into title_id, upline, is_member from crm_scope_member_in(p_staff, crm_line_sub()) m;
end
$fn$;

CREATE OR REPLACE FUNCTION public.crm_scope_director()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
begin
  return crm_scope_director_in(crm_line_sub());
end
$fn$;

CREATE OR REPLACE FUNCTION public.crm_role_of(p_staff uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
begin
  return crm_role_in(p_staff, crm_line_sub());
end
$fn$;

CREATE OR REPLACE FUNCTION public.crm_upline_of(p_staff uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
begin
  return crm_upline_in(p_staff, crm_line_sub());
end
$fn$;

CREATE OR REPLACE FUNCTION public.crm_downline(p_staff uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
begin
  return query select d from crm_downline_in(p_staff, crm_line_sub()) d;
end
$fn$;

-- ── Reading ───────────────────────────────────────────────────────────────────────────────────────────────────────

-- One's own line in each brand's chart, as (brand, person) — oneself in each. Row policies ask it once a statement.
CREATE OR REPLACE FUNCTION public.crm_my_lines()
RETURNS TABLE(brand text, staff uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
declare v_me uuid := crm_me();
begin
  if v_me is null then return; end if;
  return query
    select b.k, d.d from unnest(array['conts', 'dc']) as b(k)
     cross join lateral crm_downline_in(v_me, crm_brand_line(b.k)) as d(d);
end
$fn$;

-- One's role in a sub-department's chart; where one has none there, one's CRM role.
CREATE OR REPLACE FUNCTION public.crm_my_role_in(p_sub uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
declare v_role text := crm_my_role();
begin
  if v_role is null then return null; end if;
  return coalesce(crm_role_in(crm_me(), p_sub), v_role);
end
$fn$;

-- One's CRM role: in the chart in hand, then IR's, then DC's, then Boss.
SELECT pg_temp.swap_once('public.crm_my_role()',
  $q$then coalesce(crm_role_of(me.id), 'boss') end$q$,
  $q$then coalesce(crm_role_of(me.id), crm_role_in(me.id, crm_brand_line('conts')), crm_role_in(me.id, crm_brand_line('dc')), 'boss') end$q$);

-- Answering a customer of one's own line: the line, and one's role, in the customer's own brand's chart.
SELECT pg_temp.swap_once('public.crm_can_reply(uuid)',
  $q$or (crm_my_role() in ('hod', 'stl', 'tl', 'ta', 'rs') and public.crm_can('edit', 'own')
             and coalesce(c.assigned_to, c.team_id) in (select crm_my_downline()))$q$,
  $q$or (crm_my_role_in(crm_brand_line(public.crm_brand_of(c.account_id))) in ('hod', 'stl', 'tl', 'ta', 'rs') and public.crm_can('edit', 'own')
             and (coalesce(public.crm_brand_of(c.account_id), 'conts'), coalesce(c.assigned_to, c.team_id)) in (select l.brand, l.staff from crm_my_lines() l))$q$);

-- View as's cross-team viewers: people with no role in either chart.
SELECT pg_temp.swap_once('public.crm_cross_viewers()',
  $q$where s.status = 'active' and t.template_id is not null and crm_role_of(s.id) is null$q$,
  $q$where s.status = 'active' and t.template_id is not null and crm_role_of(s.id) is null and crm_role_in(s.id, crm_brand_line('dc')) is null$q$);

-- The people of one's CRM, each with their line in each brand's chart (`lines`); the top-level role / upline / title IR's.
CREATE OR REPLACE FUNCTION public.crm_people()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me   uuid := crm_me();
  v_role text := crm_my_role();
  v_all  boolean := crm_sees_all();
  v_out  jsonb;
  v_ir   uuid;
  v_dc   uuid;
  v_irl  uuid[];
  v_dcl  uuid[];
begin
  if crm_scope() is null then
    select jsonb_build_object('me', v_me, 'role', v_role, 'people', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.employee_name, 'role', coalesce(crm_role_of(s.id), case when s.id = v_me then v_role end),
               'uplineId', s.reports_to, 'fullTime', coalesce(cs.full_time, false), 'title', t.name, 'login', s.user_id is not null, 'paused', coalesce(cs.paused, false),
               'brands', case when s.user_id is null then null else to_jsonb(public.crm_brands_of_user(s.user_id)) end) order by s.employee_name)
        from hr_staff_costs s left join crm_staff cs on cs.staff_id = s.id left join titles t on t.id = s.title_id
       where v_role is not null and s.status = 'active' and (crm_role_of(s.id) is not null or s.id = v_me)
         and (s.id in (select crm_downline(v_me)) or crm_sees_all())), '[]'::jsonb),
      'viewers', case when v_role is not null and crm_manages() then crm_cross_viewers() else '[]'::jsonb end)
      into v_out;
    return v_out;
  end if;
  -- Each brand's chart (2026-11-27): The Conts' is IR's, Dream Crafter's DC's. A person's line in one is listed for
  -- whoever sees everybody, or where the person is in one's own line in that chart; oneself always.
  v_ir := crm_brand_line('conts');
  v_dc := crm_brand_line('dc');
  v_irl := array(select crm_downline_in(v_me, v_ir));
  v_dcl := array(select crm_downline_in(v_me, v_dc));
  select jsonb_build_object('me', v_me, 'role', v_role, 'people', coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.employee_name,
             'role', coalesce(ir.role, dc.role, case when s.id = v_me then v_role end),
             'uplineId', case when ir.role is not null or dc.role is null then ir.upline else dc.upline end,
             'fullTime', coalesce(cs.full_time, false),
             'title', case when ir.role is not null or dc.role is null then coalesce(ir.title, t.name) else coalesce(dc.title, t.name) end,
             'login', s.user_id is not null, 'paused', coalesce(cs.paused, false),
             'brands', case when s.user_id is null then null else to_jsonb(public.crm_brands_of_user(s.user_id)) end,
             'lines', case when ir.role is null then '{}'::jsonb
                           else jsonb_build_object('conts', jsonb_build_object('role', ir.role, 'uplineId', ir.upline, 'title', coalesce(ir.title, t.name))) end
                   || case when dc.role is null then '{}'::jsonb
                           else jsonb_build_object('dc', jsonb_build_object('role', dc.role, 'uplineId', dc.upline, 'title', coalesce(dc.title, t.name))) end)
           order by s.employee_name)
      from hr_staff_costs s
      left join titles t on t.id = s.title_id
      left join crm_staff cs on cs.staff_id = s.id
      cross join lateral (
        select r.role, case when r.role is not null then crm_upline_in(s.id, v_ir) end as upline,
               case when r.role is not null then (select mt.name from crm_scope_member_in(s.id, v_ir) m join titles mt on mt.id = m.title_id) end as title
          from (select case when v_all or s.id = any (v_irl) then crm_role_in(s.id, v_ir) end as role) r) ir
      cross join lateral (
        select r.role, case when r.role is not null then crm_upline_in(s.id, v_dc) end as upline,
               case when r.role is not null then (select mt.name from crm_scope_member_in(s.id, v_dc) m join titles mt on mt.id = m.title_id) end as title
          from (select case when v_all or s.id = any (v_dcl) then crm_role_in(s.id, v_dc) end as role) r) dc
     where v_role is not null and s.status = 'active'
       and (ir.role is not null or dc.role is not null or s.id = v_me)), '[]'::jsonb),
    'viewers', case when v_role is not null and crm_manages() then crm_cross_viewers() else '[]'::jsonb end)
    into v_out;
  return v_out;
end $function$;

-- ── Row policies: a customer by its own brand's chart; a leader's people by every line of theirs ────────────────

ALTER POLICY crm_contacts_read ON public.crm_contacts USING (
  ((SELECT crm_my_role() AS crm_my_role) IS NOT NULL)
  AND ((SELECT crm_sees_all() AS crm_sees_all)
    OR ((coalesce(crm_brand_of(account_id), 'conts'), assigned_to) IN (SELECT l.brand, l.staff FROM crm_my_lines() l))
    OR ((assigned_to IS NULL) AND ((coalesce(crm_brand_of(account_id), 'conts'), team_id) IN (SELECT l.brand, l.staff FROM crm_my_lines() l)))
    OR (id IN (SELECT crm_my_shares() AS crm_my_shares))));

ALTER POLICY crm_staff_read ON public.crm_staff USING (
  (SELECT crm_sees_all() AS crm_sees_all) OR (staff_id IN (SELECT l.staff FROM crm_my_lines() l)));

ALTER POLICY crm_fulltime_rules_read ON public.crm_fulltime_rules USING (
  (SELECT crm_sees_all() AS crm_sees_all) OR (tl_id IN (SELECT l.staff FROM crm_my_lines() l)));

ALTER POLICY crm_team_settings_read ON public.crm_team_settings USING (
  (SELECT crm_sees_all() AS crm_sees_all) OR (tl_id IN (SELECT l.staff FROM crm_my_lines() l)));

ALTER POLICY crm_invites_read ON public.crm_invites USING (
  (SELECT crm_sees_all() AS crm_sees_all) OR (from_staff = (SELECT crm_me() AS crm_me)) OR (to_staff = (SELECT crm_me() AS crm_me))
  OR (from_staff IN (SELECT l.staff FROM crm_my_lines() l)) OR (to_staff IN (SELECT l.staff FROM crm_my_lines() l)));

ALTER POLICY crm_assign_rules_read ON public.crm_assign_rules USING (
  (SELECT crm_sees_all() AS crm_sees_all) OR (tl_ids && ARRAY(SELECT l.staff FROM crm_my_lines() l)));

-- ── Writes follow the chart of what they are about ──────────────────────────────────────────────────────────────

SELECT pg_temp.swap_once('public.crm_send_to(uuid,uuid)',
  $q$if not public.crm_manages() then perform crm_deny('send this customer'); end if;$q$,
  $q$perform crm_follow_line(p_contact);
  if not public.crm_manages() then perform crm_deny('send this customer'); end if;$q$);

SELECT pg_temp.swap_once('public.crm_send_to_team(uuid,uuid)',
  $q$if not public.crm_manages() or not exists (select 1 from crm_contacts where id = p_contact) then
    perform crm_deny('send this customer to a team');$q$,
  $q$perform crm_follow_line(p_contact);
  if not public.crm_manages() or not exists (select 1 from crm_contacts where id = p_contact) then
    perform crm_deny('send this customer to a team');$q$);

SELECT pg_temp.swap_once('public.crm_assign_member(uuid,uuid)',
  $q$select * into c from crm_contacts where id = p_contact;$q$,
  $q$perform crm_follow_line(p_contact);
  select * into c from crm_contacts where id = p_contact;$q$);

SELECT pg_temp.swap_once('public.crm_give_to_hod(uuid,uuid)',
  $q$if not public.crm_manages() or not exists (select 1 from crm_contacts where id = p_contact) then
    perform crm_deny('give this customer to an HOD');$q$,
  $q$perform crm_follow_line(p_contact);
  if not public.crm_manages() or not exists (select 1 from crm_contacts where id = p_contact) then
    perform crm_deny('give this customer to an HOD');$q$);

SELECT pg_temp.swap_once('public.crm_invite(text,uuid,uuid)',
  $q$if p_kind not in ('share', 'move') then raise exception 'Unknown invitation.' using errcode = '22023'; end if;$q$,
  $q$perform crm_follow_line(p_contact);
  if p_kind not in ('share', 'move') then raise exception 'Unknown invitation.' using errcode = '22023'; end if;$q$);

SELECT pg_temp.swap_once('public.crm_answer_invite(uuid,boolean)',
  $q$select * into r from crm_invites where id = p_invite;$q$,
  $q$select * into r from crm_invites where id = p_invite;
  perform crm_follow_line(r.contact_id);$q$);

SELECT pg_temp.swap_once('public.crm_add_contact(text,text,uuid)',
  $q$select id into got from crm_contacts where channel = 'whatsapp' and account_id = acc and external_id = d;$q$,
  $q$perform crm_follow_account_line(acc);
  select id into got from crm_contacts where channel = 'whatsapp' and account_id = acc and external_id = d;$q$);

SELECT pg_temp.swap_once('public.crm_up_next(text,text[],integer,uuid)',
  $q$if v_me is null then perform crm_deny('read who is next'); end if;$q$,
  $q$if v_me is null then perform crm_deny('read who is next'); end if;
  -- The view's ads, all one brand's: its chart (2026-11-27). Full time's teams read again in it.
  perform crm_follow_ads_line(case when p_ad = 'all' then p_ads else array[p_ad] end);
  v_ft := array(select crm_fulltime_teams(now()));$q$);

SELECT pg_temp.swap_once('public.crm_save_ad_assign(text,text,text,jsonb,text,jsonb,jsonb)',
  $q$if not public.crm_manages() then perform crm_deny('assign ads'); end if;$q$,
  $q$perform crm_follow_ad_line(p_ad);
  if not public.crm_manages() then perform crm_deny('assign ads'); end if;$q$);

SELECT pg_temp.swap_once('public.crm_save_fulltime(uuid,text,integer[],jsonb)',
  $q$if not public.crm_manages() then perform crm_deny('set full time allocation'); end if;$q$,
  $q$perform crm_follow_staff_line(p_tl);
  if not public.crm_manages() then perform crm_deny('set full time allocation'); end if;$q$);

SELECT pg_temp.swap_once('public.crm_set_full_time(uuid,boolean)',
  $q$if not public.crm_manages() then perform crm_deny('set who is full time'); end if;$q$,
  $q$perform crm_follow_staff_line(p_staff);
  if not public.crm_manages() then perform crm_deny('set who is full time'); end if;$q$);

SELECT pg_temp.swap_once('public.crm_set_locked(uuid,boolean)',
  $q$if not public.crm_manages() then perform crm_deny('lock a member'); end if;$q$,
  $q$perform crm_follow_staff_line(p_staff);
  if not public.crm_manages() then perform crm_deny('lock a member'); end if;$q$);

SELECT pg_temp.swap_once('public.crm_set_person_days(uuid,integer[])',
  $q$if not crm_up_next_may(p_staff) then perform crm_deny('set this person''s Full time days'); end if;$q$,
  $q$perform crm_follow_staff_line(p_staff);
  if not crm_up_next_may(p_staff) then perform crm_deny('set this person''s Full time days'); end if;$q$);

SELECT pg_temp.swap_once('public.crm_up_next_skip(text,uuid)',
  $q$if not crm_up_next_may(p_staff) then perform crm_deny('skip this person'); end if;$q$,
  $q$perform crm_follow_staff_line(p_staff);
  if not crm_up_next_may(p_staff) then perform crm_deny('skip this person'); end if;$q$);

SELECT pg_temp.swap_once('public.crm_up_next_pause(uuid,boolean)',
  $q$if not crm_up_next_may(p_staff) then perform crm_deny('pause this person'); end if;$q$,
  $q$perform crm_follow_staff_line(p_staff);
  if not crm_up_next_may(p_staff) then perform crm_deny('pause this person'); end if;$q$);

SELECT pg_temp.swap_once('public.crm_up_next_give(text,uuid)',
  $q$if not crm_up_next_may(p_staff) then perform crm_deny('give the next lead to this person'); end if;$q$,
  $q$perform crm_follow_staff_line(p_staff);
  if not crm_up_next_may(p_staff) then perform crm_deny('give the next lead to this person'); end if;$q$);

SELECT pg_temp.swap_once('public.crm_up_next_save_leave(uuid,uuid,timestamp with time zone,timestamp with time zone,text,text)',
  $q$if not crm_up_next_may(p_staff) then perform crm_deny('set this person''s leave'); end if;$q$,
  $q$perform crm_follow_staff_line(p_staff);
  if not crm_up_next_may(p_staff) then perform crm_deny('set this person''s leave'); end if;$q$);

SELECT pg_temp.swap_once('public.crm_up_next_end_leave(uuid)',
  $q$if not crm_up_next_may(l.staff_id) then perform crm_deny('end this person''s leave'); end if;$q$,
  $q$perform crm_follow_staff_line(l.staff_id);
  if not crm_up_next_may(l.staff_id) then perform crm_deny('end this person''s leave'); end if;$q$);

-- ── The dealer deals in the customer's chart ──────────────────────────────────────────────────────────────────────

-- Production's dealer keeps its body under a name of its own; crm_assign_contact — what the webhooks, Up next and the
-- ad split's Save call, and what the dealer calls again for a skip — follows the customer's chart and puts the line
-- back after, so the next customer of the same webhook is dealt in its own.
DO $$
BEGIN
  IF to_regprocedure('public.crm_deal_in_line(uuid)') IS NULL THEN
    ALTER FUNCTION public.crm_assign_contact(uuid) RENAME TO crm_deal_in_line;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.crm_assign_contact(p_contact uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
declare v_was text := current_setting('crm.line', true); v_res jsonb;
begin
  perform crm_follow_line(p_contact);
  v_res := crm_deal_in_line(p_contact);
  perform set_config('crm.line', coalesce(v_was, ''), true);
  return v_res;
end
$fn$;

-- ── Who may call ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Helpers only other DEFINER functions call: the owner's and the service role's. crm_my_lines() is asked by row
-- policies under the reader's own session.
REVOKE ALL ON FUNCTION public.crm_line_sub(), public.crm_brand_line(text), public.crm_ad_brand(text),
  public.crm_line_of_contact(uuid), public.crm_follow_line(uuid), public.crm_follow_account_line(text),
  public.crm_follow_ad_line(text), public.crm_follow_ads_line(text[]), public.crm_follow_staff_line(uuid),
  public.crm_scope_member_in(uuid, uuid), public.crm_scope_director_in(uuid), public.crm_role_in(uuid, uuid),
  public.crm_upline_in(uuid, uuid), public.crm_downline_in(uuid, uuid), public.crm_my_role_in(uuid),
  public.crm_deal_in_line(uuid), public.crm_assign_contact(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_line_sub(), public.crm_brand_line(text), public.crm_ad_brand(text),
  public.crm_line_of_contact(uuid), public.crm_follow_line(uuid), public.crm_follow_account_line(text),
  public.crm_follow_ad_line(text), public.crm_follow_ads_line(text[]), public.crm_follow_staff_line(uuid),
  public.crm_scope_member_in(uuid, uuid), public.crm_scope_director_in(uuid), public.crm_role_in(uuid, uuid),
  public.crm_upline_in(uuid, uuid), public.crm_downline_in(uuid, uuid), public.crm_my_role_in(uuid),
  public.crm_deal_in_line(uuid), public.crm_assign_contact(uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.crm_my_lines() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_my_lines() TO authenticated, service_role;

-- ── Every body as tested ─────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r record; v text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.crm_line_sub()', '001b38858d36c0450586a0147b189d2f'),
      ('public.crm_brand_line(text)', 'f0e2b105abab43ba69e1beebba41c3d0'),
      ('public.crm_ad_brand(text)', '7b21dc2d3ef88c1c99a3a2c383b718ef'),
      ('public.crm_line_of_contact(uuid)', '8a14fe2055e48402b8187630a076ab09'),
      ('public.crm_follow_line(uuid)', '421d587839bf60cb2707429f61a780d0'),
      ('public.crm_follow_account_line(text)', '2d11dc607514813e494342cd9e8b39d6'),
      ('public.crm_follow_ad_line(text)', 'a26772779b3b01167b715005acdf9cc2'),
      ('public.crm_follow_ads_line(text[])', 'e058c93402e5744aa8a52506ec9625d4'),
      ('public.crm_follow_staff_line(uuid)', '381e45ee012fd3efe1876d8de43b7bdc'),
      ('public.crm_scope_member_in(uuid,uuid)', '424b80f4e8e7d401af998e4875f9204c'),
      ('public.crm_scope_director_in(uuid)', 'da89e4f1aade4235338a174fd8078c8f'),
      ('public.crm_role_in(uuid,uuid)', 'a52e9d0d0c6361f1a2308eb07fb6b5e9'),
      ('public.crm_upline_in(uuid,uuid)', '7f26e85eefbd48ee8e376cd939f154ad'),
      ('public.crm_downline_in(uuid,uuid)', 'ec397e0a2b614194c10cc0adc8513de7'),
      ('public.crm_scope_member(uuid)', 'ba7cb3c84c5a08e3e218d46b7356a927'),
      ('public.crm_scope_director()', 'ed6a820ccf43ba65f56ac30e6712d609'),
      ('public.crm_role_of(uuid)', 'ac65cb043219736ac14ec7d0c76d1945'),
      ('public.crm_upline_of(uuid)', '10fab30009128a4921bc9313ce8eb9dc'),
      ('public.crm_downline(uuid)', '23f972cf525cdaa9d6530856b3f0fc58'),
      ('public.crm_my_lines()', '2f3bb43020fa54b8a04c7f0ba38ccf22'),
      ('public.crm_my_role_in(uuid)', 'ba4eb364d88b1a6e242c0e0c60e6245d'),
      ('public.crm_my_role()', 'e42b6509ad2f4f4eadcfa2f654e28ac2'),
      ('public.crm_can_reply(uuid)', '7c513a9b910bea738f8d29bf97a2db6f'),
      ('public.crm_cross_viewers()', 'eba2e25b34222b5aaeeb6a0bdd01e7fc'),
      ('public.crm_people()', 'a9b67c728b64ec6abc490341c8ffed62'),
      ('public.crm_send_to(uuid,uuid)', 'c6d927358dac710effb82d86810ebb1b'),
      ('public.crm_send_to_team(uuid,uuid)', '3ec3f851fbd48b6d7791546a6b883710'),
      ('public.crm_assign_member(uuid,uuid)', '289ea636ca1903f73c71519e222448f4'),
      ('public.crm_give_to_hod(uuid,uuid)', 'abe97a8ca7d0b9bf7d99032a98947493'),
      ('public.crm_invite(text,uuid,uuid)', '2e9f208a6e98ebcdc0da8a4d24240089'),
      ('public.crm_answer_invite(uuid,boolean)', '404a4efe6ee2f23787aba4f1e16a6cc1'),
      ('public.crm_add_contact(text,text,uuid)', '2c33de89dc45f7d4310a9dc6823a832b'),
      ('public.crm_up_next(text,text[],integer,uuid)', '08f2a08288fda91d464e599af8fa777a'),
      ('public.crm_save_ad_assign(text,text,text,jsonb,text,jsonb,jsonb)', 'a932c39799c4decef250db4c9e4ba4df'),
      ('public.crm_save_fulltime(uuid,text,integer[],jsonb)', '02c2a55128acc5e63ca6238b646eb3b4'),
      ('public.crm_set_full_time(uuid,boolean)', 'af349b809edaa84ee33a72a6e5f53edd'),
      ('public.crm_set_locked(uuid,boolean)', 'd5d63b86309511dbe90f2a15a5f92426'),
      ('public.crm_set_person_days(uuid,integer[])', '368bd6765ddf29b86fd5b20776b6da67'),
      ('public.crm_up_next_skip(text,uuid)', '95881d7f19f61d7a20ec0fad002643ba'),
      ('public.crm_up_next_pause(uuid,boolean)', 'a5caf3f011a1075c8afc14c4f284f8cb'),
      ('public.crm_up_next_give(text,uuid)', '5cce136345c561c057383f528cd21371'),
      ('public.crm_up_next_save_leave(uuid,uuid,timestamp with time zone,timestamp with time zone,text,text)', '110b7d4ebfcb10270c7e223ea624bdf6'),
      ('public.crm_up_next_end_leave(uuid)', '6d3ba8313750e4f92622619d8fba6c61'),
      ('public.crm_deal_in_line(uuid)', '3454d09ca95fc96fd96a8fa33086af8c'),
      ('public.crm_assign_contact(uuid)', '92b8031cee64ea5c4bd39193059f5b27')) x(sig, after)
  LOOP
    v := md5((SELECT prosrc FROM pg_proc WHERE oid = r.sig::regprocedure));
    IF v <> r.after THEN
      RAISE EXCEPTION '% came out as %, not the body tested (%)', r.sig, v, r.after;
    END IF;
  END LOOP;
END $$;
