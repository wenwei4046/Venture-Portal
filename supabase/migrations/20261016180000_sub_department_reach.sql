-- ════════════════════════════════════════════════════════════════════════════
-- Sub-departments per person (2026-10-16)
-- ════════════════════════════════════════════════════════════════════════════
-- The owner, once the CRM opened to the permission matrix (mig
-- 20261016150000): "1, this follow by this handle department, as default" —
-- somebody who handles IR sees IR, somebody who handles only Fair sees only
-- Fair — and "在 CRM 权限那边，应该可以让我去打勾，它是按 sub-department 去打勾的
-- …包括 revenue team 本身也是要分 sub-department，根据权限的 tab 来 view".
--
-- So each person reaches, AREA by area, a set of the Revenue Department's
-- sub-departments:
--   crm           the CRM (People › Permissions: My leads & appointments, CRM · Team)
--   comm_cal      Comm Cal       (/revenue/<sub> and its months)
--   sales_groups  Sales Groups   (/revenue/<sub>/hierarchy)
--   rules         Rules          (/revenue/<sub>/rules)
-- By default the sub-departments they HANDLE — its director
-- (comm_sub_department_directors), or a member of it today (comm_hierarchy on
-- an active scheme, the office's date) — and every sub-department for somebody
-- who handles none (the company's level: the CEO, the directors, HR, the
-- office, the shared logins). One person is ticked on or off a sub-department
-- in an area over that default (user_sub_department_reach: true raises, false
-- holds back), as their boxes are kept over their template's ticks.
--
--   user_sub_department_reach              one person's ticks
--   sub_departments_handled(user)          what they handle            (internal)
--   sub_department_reach_in(user, area)    what they reach in an area  (internal)
--   my_sub_departments(area)               the signed-in person's      (internal: the CRM)
--   my_sub_department_reach()              the signed-in person's, every area (the app)
--   person_sub_department_reach(user)      a person's window: the sub-departments, what
--                                          they handle, their ticks
--   permission_user_reach_set(user, ticks) their ticks, by whoever manages permissions
--
-- The CRM asks the 'crm' area: crm_my_role() places somebody only when the
-- CRM's sub-department (crm_scope()) is in their reach — the structure's role
-- if it gives one, else the top ('boss'; what they see and do there is still
-- their CRM cells, crm_can). With nobody ticked yet everybody lands exactly
-- where mig 20261016150000 put them: IR's people and IR's director by the
-- structure, the company's level at the top, a Fair-only person out.
-- view_as_person() answers the reach AS that person too.
--
-- crm_my_role's and view_as_person's statements are swapped in PRODUCTION's
-- bodies (crm_my_role md5 21fae64b…, view_as_person 642f4cb2…), each found
-- exactly once or the migration stops. Not named `_crm_`: the CRM's sandbox
-- checks would load it with a stand-in that gives everybody View.
--
-- Rollback, in words (the database tool refuses the keyword): put back
-- crm_my_role's body from mig 20261016150000 and view_as_person's 'tabs' line
-- without 'reach'; then the functions and the table can go.
-- ════════════════════════════════════════════════════════════════════════════

-- ── One person's ticks ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_sub_department_reach (
  user_id           uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  area              text NOT NULL CHECK (area IN ('crm', 'comm_cal', 'sales_groups', 'rules')),
  sub_department_id uuid NOT NULL REFERENCES public.comm_sub_departments(id) ON DELETE CASCADE,
  -- true = reaches it although they do not handle it; false = held back from one they would.
  granted           boolean NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, area, sub_department_id)
);
ALTER TABLE public.user_sub_department_reach ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_sub_department_reach_read ON public.user_sub_department_reach;
-- Read as a person's boxes are (user_permission_tabs_read); written only through permission_user_reach_set().
CREATE POLICY user_sub_department_reach_read ON public.user_sub_department_reach FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.has_perm('team')) OR (SELECT public.has_perm('permissions_manage')));
COMMENT ON TABLE public.user_sub_department_reach IS
  'One person''s sub-departments ticked on or off, per Revenue area (crm, comm_cal, sales_groups, rules), over the sub-departments they handle — every one for somebody who handles none (2026-10-16). Written by permission_user_reach_set().';

INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('user_sub_department_reach', ARRAY['accounts.manage', 'accounts.view', 'team.view:own'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_reads_guard('user_sub_department_reach');

SELECT public.audit_register('user_sub_department_reach', 'Personal sub-departments', 'People', '{permissions_manage}', 'all',
  p_keys => '{user_id,area,sub_department_id}', p_labels => '{user_id,area,sub_department_id}');

-- ── What they handle, and what they reach ──────────────────────────────────

-- The active sub-departments somebody directs or is a member of today.
CREATE OR REPLACE FUNCTION public.sub_departments_handled(p_user uuid)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
  RETURN coalesce((
    SELECT array_agg(DISTINCT x.sub ORDER BY x.sub)
      FROM (
        SELECT d.sub_department_id AS sub
          FROM public.comm_sub_department_directors d
          JOIN public.hr_staff_costs s ON s.id = d.staff_id
         WHERE s.user_id = p_user
        UNION
        SELECT c.sub_department_id
          FROM public.comm_hierarchy h
          JOIN public.comm_schemes c ON c.id = h.scheme_id
          JOIN public.hr_staff_costs s ON s.id = h.staff_id
         WHERE s.user_id = p_user AND c.is_active
           AND h.effective_from <= v_today AND (h.effective_to IS NULL OR h.effective_to >= v_today)
      ) x
      JOIN public.comm_sub_departments sd ON sd.id = x.sub AND sd.is_active
  ), '{}'::uuid[]);
END
$fn$;

-- One area: what they handle (every sub-department when they handle none), their own ticks over it.
CREATE OR REPLACE FUNCTION public.sub_department_reach_in(p_user uuid, p_area text)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_handled uuid[] := public.sub_departments_handled(p_user);
BEGIN
  RETURN coalesce((
    SELECT array_agg(sd.id ORDER BY sd.name, sd.id)
      FROM public.comm_sub_departments sd
      LEFT JOIN public.user_sub_department_reach r
        ON r.user_id = p_user AND r.area = p_area AND r.sub_department_id = sd.id
     WHERE sd.is_active
       AND coalesce(r.granted, cardinality(v_handled) = 0 OR sd.id = ANY (v_handled))
  ), '{}'::uuid[]);
END
$fn$;

-- The signed-in person's, for the database's own checks (the CRM).
CREATE OR REPLACE FUNCTION public.my_sub_departments(p_area text)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid;
BEGIN
  SELECT id INTO v_me FROM public.users WHERE id = auth.uid() AND is_active;
  IF v_me IS NULL THEN RETURN '{}'::uuid[]; END IF;
  RETURN public.sub_department_reach_in(v_me, p_area);
END
$fn$;

-- The signed-in person's, every area — what the app draws the Revenue pages and the sidebar by.
CREATE OR REPLACE FUNCTION public.my_sub_department_reach()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid;
BEGIN
  SELECT id INTO v_me FROM public.users WHERE id = auth.uid() AND is_active;
  IF v_me IS NULL THEN RETURN NULL; END IF;
  RETURN (SELECT jsonb_object_agg(a, to_jsonb(public.sub_department_reach_in(v_me, a)))
            FROM unnest(ARRAY['crm', 'comm_cal', 'sales_groups', 'rules']) AS a);
END
$fn$;

-- One person's, for their window on People: the sub-departments, what they handle, their ticks.
CREATE OR REPLACE FUNCTION public.person_sub_department_reach(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Read as their boxes are: their own, or People's / Permissions' readers, who also hold the action.
  IF auth.uid() IS NULL
     OR NOT (p_user = auth.uid() OR public.has_perm('team') OR public.has_perm('permissions_manage'))
     OR NOT public.has_any_action(ARRAY['accounts.manage', 'accounts.view', 'team.view:own']) THEN
    RAISE EXCEPTION 'Only whoever reads people''s permissions sees their sub-departments' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'subs', coalesce((SELECT jsonb_agg(jsonb_build_object('id', sd.id, 'name', sd.name) ORDER BY sd.name, sd.id)
                        FROM public.comm_sub_departments sd WHERE sd.is_active), '[]'::jsonb),
    'handled', to_jsonb(public.sub_departments_handled(p_user)),
    'ticks', coalesce((SELECT jsonb_agg(jsonb_build_object('area', r.area, 'sub', r.sub_department_id, 'granted', r.granted)
                                        ORDER BY r.area, r.sub_department_id)
                         FROM public.user_sub_department_reach r
                         JOIN public.comm_sub_departments sd ON sd.id = r.sub_department_id AND sd.is_active
                        WHERE r.user_id = p_user), '[]'::jsonb));
END
$fn$;

-- ── Their ticks, by whoever manages permissions ────────────────────────────

-- The person's whole list: what is not in it goes (back to the default), what is, is kept.
CREATE OR REPLACE FUNCTION public.permission_user_reach_set(p_user uuid, p_ticks jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_bad text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_perm('permissions_manage') THEN
    RAISE EXCEPTION 'Only whoever manages permissions sets a person''s own permissions' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user) THEN RAISE EXCEPTION 'That account is gone'; END IF;
  IF jsonb_typeof(p_ticks) IS DISTINCT FROM 'array' OR jsonb_array_length(p_ticks) > 200 THEN
    RAISE EXCEPTION 'The sub-departments must be sent as a list';
  END IF;
  SELECT coalesce(t.area, '?') || ' · ' || coalesce(t.sub::text, '?') INTO v_bad
    FROM jsonb_to_recordset(p_ticks) AS t(area text, sub uuid, granted boolean)
   WHERE t.area IS NULL OR t.area NOT IN ('crm', 'comm_cal', 'sales_groups', 'rules') OR t.granted IS NULL
      OR t.sub IS NULL OR NOT EXISTS (SELECT 1 FROM public.comm_sub_departments sd WHERE sd.id = t.sub)
   LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '% is not a sub-department of an area', v_bad; END IF;
  SELECT t.area || ' · ' || t.sub INTO v_bad
    FROM jsonb_to_recordset(p_ticks) AS t(area text, sub uuid, granted boolean)
   GROUP BY t.area, t.sub HAVING count(*) > 1 LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '% is listed twice', v_bad; END IF;

  DELETE FROM public.user_sub_department_reach r
   WHERE r.user_id = p_user
     AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_ticks) AS t(area text, sub uuid, granted boolean)
                      WHERE t.area = r.area AND t.sub = r.sub_department_id);
  INSERT INTO public.user_sub_department_reach AS r (user_id, area, sub_department_id, granted, updated_by)
  SELECT p_user, t.area, t.sub, t.granted, auth.uid()
    FROM jsonb_to_recordset(p_ticks) AS t(area text, sub uuid, granted boolean)
  ON CONFLICT (user_id, area, sub_department_id) DO UPDATE
    SET granted = EXCLUDED.granted, updated_at = now(), updated_by = auth.uid()
    WHERE r.granted IS DISTINCT FROM EXCLUDED.granted;
END
$fn$;

-- Only the app's three are callable by a signed-in session; the rest only from the database's own functions.
REVOKE ALL ON FUNCTION public.sub_departments_handled(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sub_department_reach_in(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.my_sub_departments(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sub_departments_handled(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sub_department_reach_in(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.my_sub_departments(text) TO service_role;
REVOKE ALL ON FUNCTION public.my_sub_department_reach() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.person_sub_department_reach(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.permission_user_reach_set(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_sub_department_reach() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.person_sub_department_reach(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.permission_user_reach_set(uuid, jsonb) TO authenticated, service_role;

-- ── The CRM asks the 'crm' area; viewing as a person answers it as them ────

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

-- In the CRM only when its sub-department is in their reach — then their place in the structure, else the top.
SELECT pg_temp.swap_once('public.crm_my_role()',
  $q$select coalesce(crm_role_of(me.id),
    case when me.id is not null
          and not exists (select 1 from comm_sub_department_directors d where d.staff_id = me.id)
          and not exists (select 1 from comm_hierarchy h join comm_schemes c on c.id = h.scheme_id
                           where h.staff_id = me.id and c.is_active
                             and h.effective_from <= (now() at time zone 'Asia/Kuala_Lumpur')::date
                             and (h.effective_to is null or h.effective_to >= (now() at time zone 'Asia/Kuala_Lumpur')::date))
         then 'boss' end)
  from (select crm_me() as id) me$q$,
  $q$select case when me.id is not null and (crm_scope() is null or crm_scope() = any (my_sub_departments('crm')))
              then coalesce(crm_role_of(me.id), 'boss') end
  from (select crm_me() as id) me$q$);

SELECT pg_temp.swap_once('public.view_as_person(uuid)',
  $q$'tabs', public.current_tabs());$q$,
  $q$'tabs', public.current_tabs(),
      'reach', public.my_sub_department_reach());$q$);
