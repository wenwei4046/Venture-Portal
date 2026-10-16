-- ════════════════════════════════════════════════════════════════════════════
-- The CRM opens for whoever the permission matrix lets in (2026-10-16)
-- ════════════════════════════════════════════════════════════════════════════
-- The owner, signed in as CHAI MENG KEAT (DIRECTOR, Ultimate full access):
-- "为什么…还是一样开不到 CRM 的界面？明明用什么界面都可以完成". His template held
-- every CRM cell at All and the database agreed, but the CRM let in only a
-- person whose TITLE had a CRM role (crm_role_map, IR's memberships, the
-- Principal as the Boss) — DIRECTOR had none, so crm_my_role() was NULL and
-- every CRM check closed. Asked how, the owner (the same day): permission is
-- two layers — the title's template first, the cells changed for one person
-- over it ("Edit Permission 的优先级是高于 Title 和 Template 的") — and it
-- must not follow the title alone.
--
-- So the matrix now decides who is IN the CRM, and the titles only where a
-- person stands in it:
--   • crm_me() already answered only for somebody holding CRM · View (any
--     reach, the template's cell or their own over it).
--   • crm_my_role(): a person in the CRM's structure keeps their role (IR's
--     TL / STL / TA / RS, IR's director the HOD, a Boss title); somebody
--     crm_me() answers for who handles NO sub-department (the company's
--     level — the CEO, the directors, their office) is at the top, 'boss' —
--     what they see and do there is still exactly their CRM cells (crm_can:
--     View · All the Control panel, Edit, Manage), as for the CEO. Somebody
--     who handles another sub-department only (Fair's director or people) is
--     not in IR's CRM: the owner's default, "follow by the handled
--     department" (per-person sub-department ticks come next).
--   • crm_people(): the signed-in person is in their own list, with that
--     role, even when no title places them (the screen draws the CRM only for
--     somebody it finds there).
-- Nothing else moves: other people's roles (crm_role_of — who may be sent a
-- customer, a team, a line) still come from the structure, and every policy
-- and write already asks crm_my_role() / crm_can().
--
-- Statements swapped in PRODUCTION's bodies (crm_my_role md5 a759eb74…,
-- crm_people af636d2d…), each found exactly once or the migration stops;
-- crm_keeps_its_permission_checks still sees crm_people's crm_sees_all. Not
-- named `_crm_`: the CRM's sandbox checks load those with a stand-in that
-- gives everybody View (validate-matrix-opens-crm.mjs states its cells).
--
-- Rollback, in words (the database tool refuses the keyword): put back
-- `select crm_role_of(crm_me())` as crm_my_role's body and crm_people's five
-- statements as they were.
-- ════════════════════════════════════════════════════════════════════════════

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

-- Who they are in the CRM: their place in it — else, for somebody who handles no sub-department at all
-- (the company's level: the CEO, the directors, their office), the top. Somebody who handles another
-- sub-department only (Fair's director, Fair's people) is not in IR's CRM (the owner, 2026-10-16: "如果他
-- 不是 handle IR，只是 handle Fare 的话，那他其实就只能看到 Fare 那边罢了").
SELECT pg_temp.swap_once('public.crm_my_role()',
  $q$select crm_role_of(crm_me())$q$,
  $q$select coalesce(crm_role_of(me.id),
    case when me.id is not null
          and not exists (select 1 from comm_sub_department_directors d where d.staff_id = me.id)
          and not exists (select 1 from comm_hierarchy h join comm_schemes c on c.id = h.scheme_id
                           where h.staff_id = me.id and c.is_active
                             and h.effective_from <= (now() at time zone 'Asia/Kuala_Lumpur')::date
                             and (h.effective_to is null or h.effective_to >= (now() at time zone 'Asia/Kuala_Lumpur')::date))
         then 'boss' end)
  from (select crm_me() as id) me$q$);

-- Their own list: the role above, and themselves in it.
SELECT pg_temp.swap_once('public.crm_people()',
  $q$v_role text := crm_role_of(v_me);$q$,
  $q$v_role text := crm_my_role();$q$);
SELECT pg_temp.swap_once('public.crm_people()',
  $q$'role', crm_role_of(s.id),$q$,
  $q$'role', coalesce(crm_role_of(s.id), case when s.id = v_me then v_role end),$q$);
SELECT pg_temp.swap_once('public.crm_people()',
  $q$where v_role is not null and s.status = 'active' and crm_role_of(s.id) is not null$q$,
  $q$where v_role is not null and s.status = 'active' and (crm_role_of(s.id) is not null or s.id = v_me)$q$);
SELECT pg_temp.swap_once('public.crm_people()',
  $q$'role', x.role,$q$,
  $q$'role', coalesce(x.role, case when s.id = v_me then v_role end),$q$);
SELECT pg_temp.swap_once('public.crm_people()',
  $q$where v_role is not null and s.status = 'active' and x.role is not null$q$,
  $q$where v_role is not null and s.status = 'active' and (x.role is not null or s.id = v_me)$q$);
