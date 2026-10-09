-- ============================================================================
-- 20261010030000_crm_asks_the_permission.sql
-- The CRM asks the permission matrix (2026-10-10; the cells are
-- 20261010020000's: CRM · View / Edit at Own or All, and Manage).
-- ============================================================================
--
-- Until now the CRM asked a person's TITLE only (crm_role_map, IR's
-- memberships, the Principal as the Boss). It still does — that is the
-- STRUCTURE: who is in the CRM, who sells, who is below whom. Each question of
-- PERMISSION now also asks the person's cells, in the CRM's own few helpers
-- every policy and every write already goes through:
--
--   crm_me()          who they are in the CRM — nobody without CRM · View: every
--                     read policy and every write closes with it
--   crm_sees_all()    everybody's customers (policies, crm_can_see, crm_people)
--                     — CRM · View at All. It was "Boss or HOD".
--   crm_can_reply()   working a customer — CRM · Edit: at All anybody's; at Own
--                     their line's (a director who sells included) and what is
--                     shared with them
--   crm_manages()     NEW: assignment (organic leads, ads to teams, sending a
--                     customer to somebody), full time, the team split, the
--                     showrooms — CRM · Manage. Each such write asked
--                     crm_sees_all() or "Boss or HOD"; it now asks this.
--   crm_my_can()      NEW: the four answers for the screens (which panel, which
--                     buttons) — the database's, never the browser's.
--
-- Writes that act in somebody else's chat (share with any team, move a
-- subordinate's customer up their line) ask Edit at All; a team leader
-- assigning their team's enquiry, a team leader's own team rules and answering
-- an invitation ask Edit at Own.
--
-- crm_me / crm_sees_all / crm_can_reply are written whole (their bodies are the
-- same in production and in the repo; checked by md5). Everything else is
-- production's body with ONE statement swapped (pg_temp.crm_swap_check: the
-- swap_check of 20261009030000 — whitespace-blind, exactly once — under a name
-- of its own, so it never meets 20261010020000's in one session). Production's
-- CRM functions drift from the repo's copies only by comments, which the swap
-- does not read.
--
-- LAST: an event trigger that refuses a CREATE FUNCTION of any of these which
-- drops its check. Its colleague rewrites CRM functions whole, often straight
-- on the database; from an older copy, the check would vanish without a sound.
-- Now that CREATE fails, naming what to keep.

-- ── The helpers ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.crm_can(p_action text, p_scope text DEFAULT 'own')
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.has_action('crm', p_action, p_scope);
END
$$;

COMMENT ON FUNCTION public.crm_can(text, text) IS
  'The caller''s CRM cell (permission matrix): has_action(''crm'', action, reach). 20261010030000.';

CREATE OR REPLACE FUNCTION public.crm_manages()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.crm_my_role() IS NOT NULL AND public.crm_can('manage', 'all');
END
$$;

COMMENT ON FUNCTION public.crm_manages() IS
  'In the CRM and holds CRM · Manage: assignment, ads, full time, the team split, showrooms. 20261010030000.';

CREATE OR REPLACE FUNCTION public.crm_my_can()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.crm_my_role() IS NULL THEN
    RETURN jsonb_build_object('viewAll', false, 'editOwn', false, 'editAll', false, 'manage', false);
  END IF;
  RETURN jsonb_build_object(
    'viewAll', public.crm_can('view', 'all'),
    'editOwn', public.crm_can('edit', 'own'),
    'editAll', public.crm_can('edit', 'all'),
    'manage', public.crm_can('manage', 'all'));
END
$$;

COMMENT ON FUNCTION public.crm_my_can() IS
  'What the signed-in person may do in the CRM, for its screens: viewAll, editOwn, editAll, manage. 20261010030000.';

REVOKE ALL ON FUNCTION public.crm_can(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_manages() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_my_can() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_can(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_manages() TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_my_can() TO authenticated, service_role;

-- ── The three written whole ─────────────────────────────────────────────────

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.crm_me()'::regprocedure, '698f373a406fbbd4a71dd51088349b64'),
      ('public.crm_sees_all()'::regprocedure, '191a5b3b52712549687634ab5735884a'),
      ('public.crm_can_reply(uuid)'::regprocedure, '36d8c1107cc3aa26fcaa263869ad210b')
    ) AS v(sig, was)
  LOOP
    IF (SELECT strpos(prosrc, 'crm_can(') = 0 AND md5(replace(prosrc, E'\r', '')) <> r.was FROM pg_proc WHERE oid = r.sig) THEN
      RAISE EXCEPTION '% changed since this migration was written — compare production''s body first', r.sig;
    END IF;
  END LOOP;
END
$$;

-- Who they are in the CRM: nobody, without CRM · View.
CREATE OR REPLACE FUNCTION public.crm_me()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when public.crm_can('view', 'own') then coalesce(
    (select s.id from users u join hr_staff_costs s on s.user_id = u.id
      where u.id = auth.uid() and u.is_active and s.status = 'active'
      limit 1),
    (select s.id from hr_staff_costs s join crm_role_map m on m.title_id = s.title_id
      where m.crm_role = 'boss' and s.status = 'active'
        and exists (select 1 from users u where u.id = auth.uid() and u.is_active and u.role = 'principal')
      order by s.id
      limit 1)
  ) end
$function$;

-- Everybody's customers: CRM · View at All (was: Boss or HOD).
CREATE OR REPLACE FUNCTION public.crm_sees_all()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(crm_my_role() is not null and public.crm_can('view', 'all'), false)
$function$;

-- Working a customer: CRM · Edit — at All anybody's; at Own their line's
-- (a director sells too) and what is shared with them.
CREATE OR REPLACE FUNCTION public.crm_can_reply(p_contact uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from crm_contacts c
     where c.id = p_contact
       and (
         (crm_my_role() is not null and public.crm_can('edit', 'all'))
         or (crm_my_role() in ('hod', 'stl', 'tl', 'ta', 'rs') and public.crm_can('edit', 'own')
             and coalesce(c.assigned_to, c.team_id) in (select crm_my_downline()))
         or (crm_my_role() is not null and public.crm_can('edit', 'own')
             and exists (select 1 from crm_contact_shares s where s.contact_id = c.id and s.staff_id = crm_me()))
       )
  )
$function$;

-- ── One statement each, in production's bodies ──────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.crm_swap_check(p_sig regprocedure, p_old text, p_new text, p_times integer DEFAULT 1)
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
  -- The old statement, every run of whitespace matching any run.
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> p_times THEN
    RAISE EXCEPTION '%: its check is there % times, not % — production changed since this migration was written', p_sig, v_n, p_times;
  END IF;
  FOR v_found IN SELECT DISTINCT m[1] FROM regexp_matches(v_src, '(' || v_pat || ')', 'g') AS m LOOP
    v_def := replace(v_def, v_found, p_new);
  END LOOP;
  EXECUTE v_def;
END
$fn$;

-- Assignment, ads, full time, the team split, showrooms: CRM · Manage.
SELECT pg_temp.crm_swap_check('public.crm_save_ad_assign(text,text,text,jsonb,text,jsonb)',
  $q$if not crm_sees_all() then perform crm_deny('assign ads'); end if;$q$,
  $q$if not public.crm_manages() then perform crm_deny('assign ads'); end if;$q$);
SELECT pg_temp.crm_swap_check('public.crm_save_ad_rule(text,text,uuid[])',
  $q$if not crm_sees_all() then perform crm_deny('hand ads to TLs'); end if;$q$,
  $q$if not public.crm_manages() then perform crm_deny('hand ads to TLs'); end if;$q$);
SELECT pg_temp.crm_swap_check('public.crm_save_ad_rule(text,text,uuid[],jsonb)',
  $q$if not crm_sees_all() then perform crm_deny('decide which teams take an ad'); end if;$q$,
  $q$if not public.crm_manages() then perform crm_deny('decide which teams take an ad'); end if;$q$);
SELECT pg_temp.crm_swap_check('public.crm_save_fulltime(uuid,text,integer[],jsonb)',
  $q$if not crm_sees_all() then perform crm_deny('set full time allocation'); end if;$q$,
  $q$if not public.crm_manages() then perform crm_deny('set full time allocation'); end if;$q$);
SELECT pg_temp.crm_swap_check('public.crm_save_team_shares(jsonb)',
  $q$if not crm_sees_all() then perform crm_deny('change the split between teams'); end if;$q$,
  $q$if not public.crm_manages() then perform crm_deny('change the split between teams'); end if;$q$);
SELECT pg_temp.crm_swap_check('public.crm_send_to(uuid,uuid)',
  $q$if not crm_sees_all() then perform crm_deny('send this customer'); end if;$q$,
  $q$if not public.crm_manages() then perform crm_deny('send this customer'); end if;$q$);
SELECT pg_temp.crm_swap_check('public.crm_send_to_team(uuid,uuid)',
  $q$if not crm_sees_all() or not exists (select 1 from crm_contacts where id = p_contact) then$q$,
  $q$if not public.crm_manages() or not exists (select 1 from crm_contacts where id = p_contact) then$q$);
SELECT pg_temp.crm_swap_check('public.crm_give_to_hod(uuid,uuid)',
  $q$if not crm_sees_all() or not exists (select 1 from crm_contacts where id = p_contact) then$q$,
  $q$if not public.crm_manages() or not exists (select 1 from crm_contacts where id = p_contact) then$q$);
SELECT pg_temp.crm_swap_check('public.crm_set_full_time(uuid,boolean)',
  $q$if coalesce(crm_my_role(), '') not in ('boss', 'hod') then perform crm_deny('set who is full time'); end if;$q$,
  $q$if not public.crm_manages() then perform crm_deny('set who is full time'); end if;$q$);
SELECT pg_temp.crm_swap_check('public.crm_save_showroom(text,text,boolean)',
  $q$if coalesce(crm_my_role(), '') not in ('boss', 'hod') then perform crm_deny('change the showrooms'); end if;$q$,
  $q$if not public.crm_manages() then perform crm_deny('change the showrooms'); end if;$q$);
SELECT pg_temp.crm_swap_check('public.crm_save_showroom_full(text,text,text,text[],integer,integer[],jsonb,boolean)',
  $q$if coalesce(crm_my_role(), '') not in ('boss', 'hod') then perform crm_deny('change the showrooms'); end if;$q$,
  $q$if not public.crm_manages() then perform crm_deny('change the showrooms'); end if;$q$);
-- A team leader's own team rules: Edit at Own; anybody else's: Manage.
SELECT pg_temp.crm_swap_check('public.crm_save_team_settings(uuid,integer[],boolean,jsonb)',
  $q$if not (crm_sees_all() or (crm_me() = p_tl)) then perform crm_deny('change this team''s rules'); end if;$q$,
  $q$if not (public.crm_manages() or (crm_me() = p_tl and public.crm_can('edit', 'own'))) then perform crm_deny('change this team''s rules'); end if;$q$);

-- Acting in somebody else's chat (share with any team, move a subordinate's
-- customer up THEIR line): CRM · Edit at All.
SELECT pg_temp.crm_swap_check('public.crm_invite(text,uuid,uuid)',
  $q$v_up := case when crm_sees_all() and c.assigned_to is not null$q$,
  $q$v_up := case when public.crm_can('edit', 'all') and c.assigned_to is not null$q$);
SELECT pg_temp.crm_swap_check('public.crm_invite(text,uuid,uuid)',
  $q$if not crm_sees_all() and (v_team is null$q$,
  $q$if not public.crm_can('edit', 'all') and (v_team is null$q$);

-- A team leader assigning their team's enquiry, answering an invitation: Edit at Own.
SELECT pg_temp.crm_swap_check('public.crm_assign_member(uuid,uuid)',
  $q$if c.id is null or c.team_id is null or crm_my_role() not in ('tl', 'stl')$q$,
  $q$if c.id is null or c.team_id is null or not public.crm_can('edit', 'own') or crm_my_role() not in ('tl', 'stl')$q$);
SELECT pg_temp.crm_swap_check('public.crm_answer_invite(uuid,boolean)',
  $q$if r.id is null or r.to_staff <> v_me then perform crm_deny('answer this invitation'); end if;$q$,
  $q$if r.id is null or r.to_staff <> v_me or not public.crm_can('edit', 'own') then perform crm_deny('answer this invitation'); end if;$q$);

-- The people a person's CRM lists: everybody with View at All (was: Boss or HOD), else their line.
SELECT pg_temp.crm_swap_check('public.crm_people()',
  $q$or v_role in ('boss', 'hod')$q$,
  $q$or crm_sees_all()$q$,
  2);

-- ── The guard ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.crm_keeps_its_permission_checks()
RETURNS event_trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r       record;
  v_name  text;
  v_src   text;
  v_needs text;
BEGIN
  FOR r IN SELECT * FROM pg_event_trigger_ddl_commands()
            WHERE object_type IN ('function', 'procedure') AND schema_name = 'public' LOOP
    SELECT p.proname, p.prosrc INTO v_name, v_src FROM pg_proc p WHERE p.oid = r.objid;
    v_needs := CASE
      WHEN v_name = 'crm_can' THEN 'has_action('
      WHEN v_name IN ('crm_me', 'crm_sees_all', 'crm_can_reply', 'crm_manages', 'crm_my_can',
                      'crm_invite', 'crm_assign_member', 'crm_answer_invite') THEN 'crm_can('
      WHEN v_name = 'crm_people' THEN 'crm_sees_all('
      WHEN v_name IN ('crm_save_ad_assign', 'crm_save_ad_rule', 'crm_save_fulltime', 'crm_save_team_shares',
                      'crm_send_to', 'crm_send_to_team', 'crm_give_to_hod', 'crm_set_full_time',
                      'crm_save_showroom', 'crm_save_showroom_full', 'crm_save_team_settings') THEN 'crm_manages('
    END;
    IF v_needs IS NOT NULL AND strpos(coalesce(v_src, ''), v_needs) = 0 THEN
      RAISE EXCEPTION '% must keep its CRM permission check — it no longer calls %. Rewrite it from production''s current body, not an older copy (CLAUDE.md › THE CRM ASKS THE PERMISSION MATRIX, mig 20261010030000).',
        r.object_identity, v_needs
        USING ERRCODE = '42501';
    END IF;
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION public.crm_keeps_its_permission_checks() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'crm_keeps_its_permission_checks') THEN
    CREATE EVENT TRIGGER crm_keeps_its_permission_checks ON ddl_command_end
      WHEN TAG IN ('CREATE FUNCTION', 'CREATE PROCEDURE')
      EXECUTE FUNCTION public.crm_keeps_its_permission_checks();
  END IF;
END
$$;
