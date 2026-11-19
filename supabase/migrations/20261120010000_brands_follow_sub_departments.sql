-- The CRM split by sub-department, step 1 (the owner, 2026-11-19: "Fair, IR, DC 完全拆分，意思是 DC 只能看到自己 DC 的东西，包含
-- CRM 等等，IR & Fair 以此类推"; asked how a person is placed: "能不能用 HR View 的 permission 的方式来设定" — HECTOR and LIM YAU
-- WEI take DC; the Revenue Director sees all three, "在 HR View 的 permission 设定好就能看到").
--
-- A CRM brand IS a sub-department: The Conts' numbers and Page are IR's (the CRM's own sub-department, crm_scope()), Dream
-- Crafter's are DC's (code DC). The brand layer already shuts a customer, its chat, its ads and its replies to whoever does
-- not hold its brand (crm_contacts_brand, crm_ad_names_brand, crm_can_reply — mig 20261117160000). From here a person holds
-- a brand only while its SUB-DEPARTMENT is in their reach for the CRM (People › Permissions › the CRM's sub-department pills:
-- by default what they handle, every one for somebody who handles none — sub_department_reach_in), and their own brand pill
-- (user_crm_brands) can still take it off. So an IR member sees IR's customers alone until DC is ticked for them.
--
-- 1. crm_brand_sub(brand), crm_brands_of_user(user), crm_staff_takes_brand(staff, brand) — helpers, the service role's.
-- 2. crm_my_brands() reads them (production's md5 3cd5d209… replaced whole: it is the tick read alone).
-- 3. crm_my_role(): in the CRM with IR OR DC in reach (it asked IR alone) — one condition swapped in production's body.
-- 4. crm_assign_contact: a customer goes only to somebody its brand opens to — else the Revenue Director who holds it,
--    else it waits to be sent by hand (two statements swapped in production's body, md5 080263d1…). Somebody with no login
--    is dealt as before (the dealer never skipped them).
-- 5. DC ticked in the CRM for HECTOR, LIM YAU WEI and PETER (the owner named them); every DC customer today is theirs.

create or replace function public.crm_brand_sub(p_brand text)
 returns uuid language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  return case p_brand
    when 'conts' then crm_scope()
    when 'dc' then (select sd.id from comm_sub_departments sd where upper(sd.code) = 'DC' and sd.is_active order by sd.created_at limit 1)
  end;
end $function$;

create or replace function public.crm_brands_of_user(p_user uuid)
 returns text[] language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_reach uuid[];
begin
  if p_user is null then return array['conts', 'dc']; end if;
  v_reach := sub_department_reach_in(p_user, 'crm');
  return array(
    select b from unnest(array['conts', 'dc']) as b
     where coalesce((select r.granted from user_crm_brands r where r.user_id = p_user and r.brand = b), true)
       and (crm_brand_sub(b) is null or crm_brand_sub(b) = any (v_reach))
     order by b);
end $function$;

create or replace function public.crm_staff_takes_brand(p_staff uuid, p_brand text)
 returns boolean language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_user uuid;
begin
  if p_brand is null or p_staff is null then return true; end if;
  select s.user_id into v_user from hr_staff_costs s where s.id = p_staff;
  if v_user is null then return true; end if;
  return p_brand = any (crm_brands_of_user(v_user));
end $function$;

revoke all on function public.crm_brand_sub(text) from public, anon, authenticated;
revoke all on function public.crm_brands_of_user(uuid) from public, anon, authenticated;
revoke all on function public.crm_staff_takes_brand(uuid, text) from public, anon, authenticated;
grant execute on function public.crm_brand_sub(text) to service_role;
grant execute on function public.crm_brands_of_user(uuid) to service_role;
grant execute on function public.crm_staff_takes_brand(uuid, text) to service_role;

do $$
declare
  v_md5 text;
  v_def text;
  v_new text;
begin
  -- 2. crm_my_brands
  select md5(prosrc) into v_md5 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'crm_my_brands';
  if v_md5 is distinct from '3cd5d20985a4bb81692d1a8023e61f48' then raise exception 'crm_my_brands changed on production (%): rewrite from its body', v_md5; end if;
  execute $f$
create or replace function public.crm_my_brands()
 returns text[] language plpgsql stable security definer set search_path to 'public'
as $b$
begin
  -- A brand is a sub-department (crm_brand_sub): held while it is in one's CRM reach and one's own pill keeps it (2026-11-19).
  return crm_brands_of_user(auth.uid());
end $b$;$f$;

  -- 3. crm_my_role
  select pg_get_functiondef(p.oid), md5(p.prosrc) into v_def, v_md5 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'crm_my_role';
  if v_md5 is distinct from 'a31511ee366b1cfa5fc2d759e6ed1b36' then raise exception 'crm_my_role changed on production (%)', v_md5; end if;
  v_new := replace(v_def, $q$(crm_scope() is null or crm_scope() = any (my_sub_departments('crm')))$q$,
    $q$(crm_scope() is null or exists (select 1 from unnest(array[crm_brand_sub('conts'), crm_brand_sub('dc')]) b(s) where b.s = any (my_sub_departments('crm'))))$q$);
  if v_new = v_def then raise exception 'crm_my_role: its reach check is not there'; end if;
  execute v_new;

  -- 4. crm_assign_contact
  select pg_get_functiondef(p.oid), md5(p.prosrc) into v_def, v_md5 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'crm_assign_contact';
  if v_md5 is distinct from '080263d1f14f788e6f2a870e04740436' then raise exception 'crm_assign_contact changed on production (%)', v_md5; end if;
  v_new := replace(v_def,
    $q$select s.id into v_who from hr_staff_costs s where s.status = 'active' and crm_role_of(s.id) = 'hod' and not crm_staff_locked(s.id) order by s.id limit 1;$q$,
    $q$select s.id into v_who from hr_staff_costs s where s.status = 'active' and crm_role_of(s.id) = 'hod' and not crm_staff_locked(s.id) and crm_staff_takes_brand(s.id, crm_brand_of(c.account_id)) order by s.id limit 1;$q$);
  if v_new = v_def then raise exception 'crm_assign_contact: the no-ad pick is not there'; end if;
  v_def := v_new;
  v_new := replace(v_def,
    E'  if v_who is null then return jsonb_build_object(''assigned'', false, ''waits'', ''organic''); end if;\n  if v_team = crm_director_key() then v_team := null; end if;',
    E'  -- A customer goes only to somebody its brand (sub-department) opens to (2026-11-19): else the Revenue Director who holds it.\n'
    || E'  if v_who is not null and not crm_staff_takes_brand(v_who, crm_brand_of(c.account_id)) then\n'
    || E'    select s.id into v_who from hr_staff_costs s where s.status = ''active'' and crm_role_of(s.id) = ''hod'' and not crm_staff_locked(s.id)\n'
    || E'       and crm_staff_takes_brand(s.id, crm_brand_of(c.account_id)) order by s.id limit 1;\n'
    || E'    v_team := null; v_how := ''brand_director'';\n'
    || E'  end if;\n'
    || E'  if v_who is null then return jsonb_build_object(''assigned'', false, ''waits'', ''organic''); end if;\n  if v_team = crm_director_key() then v_team := null; end if;');
  if v_new = v_def then raise exception 'crm_assign_contact: the last pick is not there'; end if;
  execute v_new;
end $$;

-- 5. DC in the CRM for the three the owner named.
insert into public.user_sub_department_reach (user_id, area, sub_department_id, granted)
select u.id, 'crm', sd.id, true
  from (values ('375df29a-a922-4cc2-9e92-a6f27376354b'::uuid), ('7a71ab10-a626-4d4d-b2cc-1e5469fe17b2'::uuid), ('de910eeb-d294-411a-bde8-8b8d03dccf76'::uuid)) u(id)
  join public.users x on x.id = u.id
  cross join public.comm_sub_departments sd
 where upper(sd.code) = 'DC'
on conflict (user_id, area, sub_department_id) do update set granted = true, updated_at = now();
