-- ============================================================================
-- 20261009070000_permission_checks_planned_once.sql
-- The permission checks every policy asks are planned once, not on every call.
-- ============================================================================
--
-- Every row policy and most functions ask the same handful of helpers —
-- has_scope, has_perm, has_action, has_any_action, may_write,
-- current_permissions, current_actions … — and each was a SECURITY DEFINER
-- LANGUAGE sql function. Postgres 17 never inlines a SECURITY DEFINER
-- function, and it does not cache the plan of a SQL function's body: the body
-- is parsed and planned again on EVERY call. A policy calls its helper once
-- per statement (the `(SELECT …)` wrapper makes it an initplan), so every
-- statement paid for planning the helpers again — measured on production
-- 2026-10-09 per call: has_any_action 6.2 ms, has_action 6.4 ms, may_write
-- 17.9 ms (it plans has_any_action inside), has_scope 1.7 ms. A write meets
-- may_write's restrictive policy; a read of invoices or claims meets
-- has_action twice. (Found by the speed work of 2026-10-08: "dashboard_summary
-- spends 94% in permission checks".)
--
-- A plpgsql function keeps its plans for the life of the connection. Each
-- helper becomes plpgsql with its body untouched — `BEGIN RETURN (<the same
-- SELECT>); END` — so every answer is the one it was (each body returns
-- exactly one row: an aggregate, an EXISTS, or a lookup by primary key). The
-- same attributes, owner and grants (CREATE OR REPLACE keeps them). Each
-- body is checked against production's md5 first: a helper changed since
-- this was written stops the migration rather than being overwritten.
--
-- Production, 2026-10-09 (rolled-back dry run, each helper beside its
-- plpgsql twin): every active login, nobody signed in, and each of the nine
-- templates that has a title worn by one login — the same answers from all
-- thirteen over every key, scope, function × action × reach, every
-- permission_table_writes action list and every single action. Per call,
-- before → after: has_scope 1.7 → 0.23 ms, has_action 5.9 → 0.73 ms,
-- has_any_action 6.4 → 0.78 ms, may_write 10.2 → 0.80 ms.

CREATE OR REPLACE FUNCTION pg_temp.to_plpgsql(p_sig regprocedure, p_md5 text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_lang text;
  v_src  text;
  v_def  text;
BEGIN
  SELECT l.lanname, p.prosrc INTO v_lang, v_src
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
   WHERE p.oid = p_sig;
  IF v_lang = 'plpgsql' THEN
    RETURN;  -- already planned once
  END IF;
  IF v_lang <> 'sql' THEN
    RAISE EXCEPTION '%: written in %, not sql', p_sig, v_lang;
  END IF;
  IF md5(v_src) <> p_md5 THEN
    RAISE EXCEPTION '%: production''s body is not the one this migration was written against (md5 %, expected %)',
      p_sig, md5(v_src), p_md5;
  END IF;
  v_def := pg_get_functiondef(p_sig);
  IF strpos(v_def, v_src) = 0 OR v_def !~ '\mLANGUAGE sql\M' THEN
    RAISE EXCEPTION '%: its definition does not read as expected', p_sig;
  END IF;
  -- The one statement, without its closing semicolon, returned as it was.
  v_def := replace(v_def, v_src,
    E'\nBEGIN\n  RETURN (' || regexp_replace(v_src, ';\s*$', '') || E'\n  );\nEND\n');
  v_def := regexp_replace(v_def, '\mLANGUAGE sql\M', 'LANGUAGE plpgsql');
  EXECUTE v_def;
END
$fn$;

-- The person (no permission of their own; read by the ones below).
SELECT pg_temp.to_plpgsql('public.current_user_department_id()', '8e0c62d32bc63eb1fe68278998ab4229');
SELECT pg_temp.to_plpgsql('public.current_user_segment()', '3d3f77822e113f7d6961a42310dcae95');
-- What they hold.
SELECT pg_temp.to_plpgsql('public.current_permissions()', '814b8f51edab0047cc7ff4261380bdaf');
SELECT pg_temp.to_plpgsql('public.current_actions()', '46406b7b35a300c6f42169f92933c717');
SELECT pg_temp.to_plpgsql('public.current_sensitive_fields()', '3df796b43f59a9e50dec597343c4b2a7');
-- What the policies and functions ask.
SELECT pg_temp.to_plpgsql('public.has_perm(text)', '2f059abfbb259595020ddfee4dc9e570');
SELECT pg_temp.to_plpgsql('public.has_scope(text[])', 'db109608746e2ffe2b764d29ad2fbbb5');
SELECT pg_temp.to_plpgsql('public.has_action(text,text,text)', '18050936ee63561429a6b3a0242d0f2a');
SELECT pg_temp.to_plpgsql('public.has_any_action(text[])', '25d550ab811bc07b93f0545483cd9eea');
SELECT pg_temp.to_plpgsql('public.may_write(text,text)', '3bfa7eba8c283a2b6bf90d79a01a028e');
SELECT pg_temp.to_plpgsql('public.approvable_types()', '5e3d7751a14678c1573bb17a14a8fa72');
SELECT pg_temp.to_plpgsql('public.member_is_manager(text)', '092faca80233b18822b61182a60ed374');
SELECT pg_temp.to_plpgsql('public.sees_sensitive(text)', 'e3fceceb37eb37c08dcd1baddef5fadc');

DO $$
DECLARE
  v_sql text[];
BEGIN
  SELECT array_agg(p.oid::regprocedure::text ORDER BY 1) INTO v_sql
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
   WHERE p.pronamespace = 'public'::regnamespace AND l.lanname = 'sql'
     AND p.proname IN ('current_user_department_id', 'current_user_segment', 'current_permissions', 'current_actions',
                       'current_sensitive_fields', 'has_perm', 'has_scope', 'has_action', 'has_any_action', 'may_write',
                       'approvable_types', 'member_is_manager', 'sees_sensitive');
  IF v_sql IS NOT NULL THEN
    RAISE EXCEPTION 'still planned on every call: %', v_sql;
  END IF;
END
$$;
