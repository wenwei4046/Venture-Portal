-- A sub-department's CRM director is a Revenue Director in the CRM (2026-11-24 — the owner, of KRIS missing from DC's
-- Revenue Director row on Assignment: "他们过后会建立DC的Hierarchy， 目前现在DC CRM 上让Kris as a revenue director 进来").
--
-- crm_role_of answered 'hod' only for a director of IR (crm_scope(), Revenue › Staff Hierarchy), so KRIS — Fair's director,
-- named DC's CRM director by mig 20261124220000 (crm_sub_settings.crm_director) — had no CRM role for anybody else: he was
-- in no list, not in the Director row of an ad's split, and the split's Director share never reached him. Now somebody
-- named a sub-department's crm_director is 'hod' too, after IR's memberships and IR's directors are asked. Everything that
-- reads the Revenue Director follows by itself — crm_people (the Director row on the desktop's and the phone's
-- Assignment, kept to a view's own brand's people), crm_team_handlers (the Director share of an ad's split), and the
-- dealer's "the Revenue Director who holds the brand". IR's view still lists PETER alone: KRIS holds Dream Crafter only.
-- Until DC's own hierarchy names its director (the owner: they will build it later).
--
-- One statement swapped into production's body (md5 307b04cf… before), named by the line before it.

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

SELECT pg_temp.swap_once('public.crm_role_of(uuid)',
  $q$if exists (select 1 from comm_sub_department_directors d where d.sub_department_id = crm_scope() and d.staff_id = p_staff) then
    return 'hod';
  end if;$q$,
  $q$if exists (select 1 from comm_sub_department_directors d where d.sub_department_id = crm_scope() and d.staff_id = p_staff) then
    return 'hod';
  end if;
  -- A sub-department's CRM director (crm_sub_settings.crm_director — DC's: KRIS) is a Revenue Director too
  -- (2026-11-24, mig 20261124230000), until that sub-department's own hierarchy names one.
  if exists (select 1 from crm_sub_settings ss where ss.crm_director = p_staff) then
    return 'hod';
  end if;$q$);
