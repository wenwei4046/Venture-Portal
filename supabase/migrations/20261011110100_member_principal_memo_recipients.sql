-- ============================================================================
-- 20261011110100_member_principal_memo_recipients.sql
-- The Principal's View as in the Revenue app sees the memos and letters
-- addressed to the member being viewed (2026-10-11, HR revamp round 2).
-- ============================================================================
--
-- People › Documentation's Publish, and every letter filed in its Data
-- center, is a memo addressed to PEOPLE (`member_memo_recipients`, mig
-- 20261011070000) with no sub-department audience. A member's own snapshot
-- already holds theirs (`member_visible_memo`). The Principal's snapshot
-- (`member_principal_snapshot`) listed only memos with a Revenue audience, so
-- viewing a member never showed what was addressed to them.
--
-- Two statements swapped into PRODUCTION's body (md5 a630b01f… on
-- 2026-10-11, read off pg_proc; the swap refuses if production changed):
--   1. each memo also carries its `recipients` (staff ids), so the app shows
--      one to the Principal only while viewing one of them;
--   2. a memo addressed to anybody in a commission department is listed too.
-- Nothing else changes; the function keeps its owner, grants and checks.

CREATE OR REPLACE FUNCTION pg_temp.swap_check(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
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
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: its statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

-- 1. Each memo's recipients (a memo with a sub-department audience has none).
SELECT pg_temp.swap_check('public.member_principal_snapshot(boolean)',
  $q$JOIN public.comm_sub_departments d ON d.id=a.sub_department_id WHERE a.memo_id=m.id)
 ) ORDER BY m.published_at DESC,m.id),'[]'::jsonb) INTO v_memos$q$,
  $q$JOIN public.comm_sub_departments d ON d.id=a.sub_department_id WHERE a.memo_id=m.id),
  'recipients',(SELECT coalesce(jsonb_agg(x.staff_id ORDER BY x.staff_id),'[]'::jsonb)
   FROM public.member_memo_recipients x WHERE x.memo_id=m.id)
 ) ORDER BY m.published_at DESC,m.id),'[]'::jsonb) INTO v_memos$q$);

-- 2. A memo addressed to people in a commission department is listed as well.
SELECT pg_temp.swap_check('public.member_principal_snapshot(boolean)',
  $q$WHERE a.memo_id=m.id AND department.payroll_source='commission');$q$,
  $q$WHERE a.memo_id=m.id AND department.payroll_source='commission')
  OR EXISTS(SELECT 1 FROM public.member_memo_recipients x
  JOIN public.hr_staff_costs s ON s.id=x.staff_id
  JOIN public.departments dd ON dd.id=s.department_id
  WHERE x.memo_id=m.id AND dd.payroll_source='commission');$q$);
