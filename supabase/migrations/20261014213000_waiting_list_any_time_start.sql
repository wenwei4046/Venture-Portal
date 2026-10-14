-- ============================================================================
-- 20261014213000_waiting_list_any_time_start.sql
-- A waiting list's joining date may be ANY TIME (2026-10-14, the user: "For the waiting list, add on one things
-- for join date, any time ready. Cause some of them is anytime ready, just wait us to let then join").
-- ============================================================================
--
-- The joining date (`detail.start`) was always a day, YYYY-MM-DD. Now it may also be the word `anytime`: ready to
-- start whenever HR calls them — chosen as *Any time ready* in Sales Groups › Waiting list's "+" window and on the
-- Revenue app's *Submit waiting list* form and its *Edit request* sheet (`lib/member/waiting-start.ts`). One field,
-- so "required" still means "answered"; never a word Postgres reads as a date (`today`, `now`, `infinity` … are).
--
-- Three readers cast it to a date and would refuse the word:
--   * member_waiting_add (HR's "+", production md5 ee9814d7…) checked it was a day and stored the cast day back —
--     now `anytime` passes and is stored as it is;
--   * member_prepare_request (the Revenue app's send, production md5 2e466798…) cast it only to check it is a day
--     (`v_date` is not read after it for a waiting list) — now `anytime` is not cast;
--   * member_admin_action (production md5 7ad5ef71…) — its legacy create_candidate opened the roster row on
--     greatest(start, today) — now `anytime` opens it today, as Transfer's hire date does (`defaultHireDate`).
-- Everything else passes the text through (member_sub_department_requests, member_waiting_queue, the request JSON)
-- and the app words it "Any time ready". Transfer is unchanged: HR picks the hire date, which opens on today.
--
-- Production's bodies, one statement swapped each (pg_temp.swap_check, as in 20261009040000: production's
-- statement, whitespace-blind, exactly once; a body already swapped is left alone). Nothing else moves: a day is
-- checked, cast and stored exactly as before. No waiting list was on production when this was written.
-- PGlite: tests/member-sql/validate-waiting-add.mjs (member_waiting_add verbatim, then this migration).

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

-- HR's "+": `anytime` passes the day check, is not cast, and is stored as it is.
SELECT pg_temp.swap_check('public.member_waiting_add(uuid,uuid,jsonb,uuid,boolean)',
  $q$IF coalesce(p_detail ->> 'start', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN$q$,
  $q$IF p_detail ->> 'start' IS DISTINCT FROM 'anytime' AND coalesce(p_detail ->> 'start', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN$q$);
SELECT pg_temp.swap_check('public.member_waiting_add(uuid,uuid,jsonb,uuid,boolean)',
  $q$v_start := (p_detail ->> 'start')::date;$q$,
  $q$v_start := CASE WHEN p_detail ->> 'start' = 'anytime' THEN NULL ELSE (p_detail ->> 'start')::date END;$q$);
SELECT pg_temp.swap_check('public.member_waiting_add(uuid,uuid,jsonb,uuid,boolean)',
  $q$'start', v_start::text,$q$,
  $q$'start', CASE WHEN p_detail ->> 'start' = 'anytime' THEN 'anytime' ELSE v_start::text END,$q$);

-- The Revenue app's send: a day is still checked by its cast; `anytime` is not cast.
SELECT pg_temp.swap_check('public.member_prepare_request(text,uuid,jsonb,uuid,uuid)',
  $q$v_date:=(p_detail->>'start')::date;$q$,
  $q$v_date:=CASE WHEN p_detail->>'start'='anytime' THEN NULL ELSE (p_detail->>'start')::date END;$q$);

-- The legacy roster row from a candidate: `anytime` starts today.
SELECT pg_temp.swap_check('public.member_admin_action(text,uuid,jsonb)',
  $q$greatest((r.detail->>'start')::date,v_now)$q$,
  $q$greatest(CASE WHEN r.detail->>'start'='anytime' THEN NULL ELSE (r.detail->>'start')::date END,v_now)$q$);
