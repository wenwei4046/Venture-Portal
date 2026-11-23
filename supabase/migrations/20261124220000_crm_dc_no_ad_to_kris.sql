-- Dream Crafter's leads from no ad go to KRIS; PETER sees Dream Crafter's CRM again (2026-11-24 — the owner, of the five
-- DC customers PETER answers: "let him see this chat, then open view for him, in dc"; of DC's enquiries from no ad, which
-- since mig 20261124200000 waited in DC's Team inbox: "auto go to kris").
--
-- 1. crm_sub_settings.crm_director: the person a sub-department's leads go to when the dealer has nobody else for them
--    (DC's: KRIS) — a lead from no ad, and an ad's lead its split gave somebody who does not hold the brand (2026-11-19).
--    Active, not locked out, holding the brand: the dealer gives it to them before the Revenue Director who holds the brand
--    it gave it to until now. Two statements swapped in production's crm_assign_contact (pg_temp.swap_once, as mig
--    20261124210000), each named by the line before it — the two pick the Revenue Director alike.
-- 2. PETER's DC tick in the CRM back (mig 20261124200000 took it away): his Revenue app lists DC's view again — a CRM-only
--    membership — and its CRM shows Dream Crafter's customers, his five among them. With KRIS named, DC's leads from no ad
--    still go to KRIS, not to PETER as the Revenue Director who holds the brand.

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

-- ── 1. A sub-department's own person for the leads nobody else takes ───────
alter table public.crm_sub_settings add column if not exists crm_director uuid references public.hr_staff_costs(id);

-- DC's: KRIS (staff e2a52899…), where production has him.
update public.crm_sub_settings s set crm_director = k.id
  from public.comm_sub_departments sd, public.hr_staff_costs k
 where sd.id = s.sub_department_id and upper(sd.code) = 'DC' and s.crm_director is null
   and k.id = 'e2a52899-dd15-4020-87e0-9bd8cf22b113';

-- A lead from no ad.
SELECT pg_temp.swap_once('public.crm_assign_contact(uuid)',
  $q$if c.ad_source_id is null then
    select s.id into v_who from hr_staff_costs s where s.status = 'active' and crm_role_of(s.id) = 'hod' and not crm_staff_locked(s.id) and crm_staff_takes_brand(s.id, crm_brand_of(c.account_id)) order by s.id limit 1;$q$,
  $q$if c.ad_source_id is null then
    -- The sub-department's own person first (2026-11-24, mig 20261124220000 — DC's: KRIS), else the Revenue Director.
    select s.id into v_who from hr_staff_costs s
     where s.id = (public.crm_settings_of(c.account_id)).crm_director and s.status = 'active' and not crm_staff_locked(s.id)
       and crm_staff_takes_brand(s.id, crm_brand_of(c.account_id));
    if v_who is null then
      select s.id into v_who from hr_staff_costs s where s.status = 'active' and crm_role_of(s.id) = 'hod' and not crm_staff_locked(s.id) and crm_staff_takes_brand(s.id, crm_brand_of(c.account_id)) order by s.id limit 1;
    end if;$q$);
-- An ad's lead its split gave somebody who does not hold the brand.
SELECT pg_temp.swap_once('public.crm_assign_contact(uuid)',
  $q$if v_who is not null and not crm_staff_takes_brand(v_who, crm_brand_of(c.account_id)) then
    select s.id into v_who from hr_staff_costs s where s.status = 'active' and crm_role_of(s.id) = 'hod' and not crm_staff_locked(s.id)
       and crm_staff_takes_brand(s.id, crm_brand_of(c.account_id)) order by s.id limit 1;$q$,
  $q$if v_who is not null and not crm_staff_takes_brand(v_who, crm_brand_of(c.account_id)) then
    -- The sub-department's own person first (2026-11-24, mig 20261124220000 — DC's: KRIS), else the Revenue Director.
    select s.id into v_who from hr_staff_costs s
     where s.id = (public.crm_settings_of(c.account_id)).crm_director and s.status = 'active' and not crm_staff_locked(s.id)
       and crm_staff_takes_brand(s.id, crm_brand_of(c.account_id));
    if v_who is null then
      select s.id into v_who from hr_staff_costs s where s.status = 'active' and crm_role_of(s.id) = 'hod' and not crm_staff_locked(s.id)
         and crm_staff_takes_brand(s.id, crm_brand_of(c.account_id)) order by s.id limit 1;
    end if;$q$);

-- ── 2. PETER's DC tick back ─────────────────────────────────────────────────
insert into public.user_sub_department_reach (user_id, area, sub_department_id, granted)
select u.id, 'crm', sd.id, true
  from public.users u
  cross join public.comm_sub_departments sd
 where u.id = 'de910eeb-d294-411a-bde8-8b8d03dccf76' and upper(sd.code) = 'DC'
on conflict (user_id, area, sub_department_id) do update set granted = true, updated_at = now();
