-- ============================================================================
-- 20261012220000_guest_hire_company_departments.sql
-- The guest link's Request manpower asks the company's OWN departments
-- (2026-10-12, the user: Book a meeting room was linked to Admin › Guest Link ›
-- Subsidiaries & departments, Request manpower was not — "they use the same
-- table"). The page's Department dropdown listed Hiring › Form settings'
-- choices, which are HQ's (Revenue · Fair … Director Office), so a Carres guest
-- filed HR-001 under "Finance". The page now lists the picked company's
-- departments (lib/guest/model.ts `companyDepartment`), and the database asks
-- the same of the request — the rule guest_link_book has kept since
-- 20261011091000:
--
--   * a company with departments listed: the answer is one of them, exactly as
--     listed, or the request is refused in the page's words;
--   * a company with none listed: the guest types it (Department is a core
--     field, always asked), no longer than a listed one (60 characters, as
--     guest_link_save_subsidiary keeps them);
--   * left empty, the Hiring module's own check still says "Fill in Department.".
--
-- What a request keeps does not change: the answer stays answers.dept, and the
-- requester's own department stays unasked (requester_department NULL).
-- guest_link_page is untouched — the page draws the company's list from the
-- subsidiaries it already reads.
--
-- PRODUCTION's body, one statement swapped by `pg_temp.swap_check`
-- (whitespace-blind, exactly once, refused if production changed — the
-- hardening migration's helper). md5(prosrc) on production before this
-- migration: guest_link_hire 027bde7f… (20261011092000 with 20261011120000's
-- hourly cap). CREATE OR REPLACE keeps its owner and grants — still anon's BY
-- NAME.
-- ============================================================================

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

SELECT pg_temp.swap_check('public.guest_link_hire(text, uuid, text, jsonb, text, text)',
  $q$IF length(v_name) > 80 THEN RAISE EXCEPTION 'Keep your name under 80 characters.'; END IF;$q$,
  $q$IF length(v_name) > 80 THEN RAISE EXCEPTION 'Keep your name under 80 characters.'; END IF;
  -- The role's department is one of the company's own (2026-10-12, the user): Admin › Guest Link ›
  -- Subsidiaries & departments, as Book a meeting room asks it — never Hiring › Form settings'
  -- choices, which are HQ's. A company with none listed takes the guest's own words.
  IF cardinality(v_sub.departments) > 0 AND btrim(coalesce(p_answers ->> 'dept', '')) <> ''
     AND NOT (btrim(p_answers ->> 'dept') = ANY (v_sub.departments)) THEN
    RAISE EXCEPTION 'Pick a department from %''s list — reload the page if it has changed.', v_sub.name;
  END IF;
  IF length(btrim(coalesce(p_answers ->> 'dept', ''))) > 60 THEN
    RAISE EXCEPTION 'Keep the department under 60 characters.';
  END IF;$q$);

-- ── Guards ──────────────────────────────────────────────────────────────────

DO $guard$
DECLARE
  v_fn  text := 'public.guest_link_hire(text, uuid, text, jsonb, text, text)';
  v_src text := (SELECT p.prosrc FROM pg_proc p WHERE p.oid = 'public.guest_link_hire(text, uuid, text, jsonb, text, text)'::regprocedure);
BEGIN
  IF NOT has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION '%: anon lost EXECUTE — the guest page would stop', v_fn;
  END IF;
  IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_fn::regprocedure) THEN
    RAISE EXCEPTION '%: no longer SECURITY DEFINER', v_fn;
  END IF;
  IF strpos(v_src, 'interval ''1 hour''') = 0 THEN
    RAISE EXCEPTION '%: its hourly cap is missing', v_fn;
  END IF;
  IF strpos(v_src, '= ANY (v_sub.departments)') = 0 THEN
    RAISE EXCEPTION '%: the company''s departments are not asked', v_fn;
  END IF;
END
$guard$;
