-- Lead View's writes ask the pages they are offered on (2026-10-16). Lead View · Create stands behind two
-- tabs' boxes — Inbox's Create (a reply) and Settings' Create (the test enquiry) — and Edit behind Inbox's and
-- Leads' (the card and the hand-over are the Inbox's; the outcome is on both, so it asks no page) — so the DEFINER writes behind
-- that narrowing gate ask the same page in the database (tab-write-guards.test.ts), as the app's gates in
-- lib/leads/actions.ts do (requireActionOn('/leads' | '/leads/settings', 'leads', 'create')).
--
-- These functions are new (mig 20261016300200) and ask no page yet: the guard goes in right after the
-- function's own permission check (`PERFORM public.lead_need(…);`, exactly once in each), read from
-- PRODUCTION's body at apply time; nothing else in the body, its settings or its grants moves.

CREATE OR REPLACE FUNCTION pg_temp.guard_put(p_sig text, p_new text)
RETURNS void
LANGUAGE plpgsql
AS $g$
DECLARE
  v_oid oid := p_sig::regprocedure;
  v_src text;
  v_def text;
  v_need text;
  v_n   integer;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_oid;
  IF position(p_new IN v_src) > 0 THEN
    RETURN;
  END IF;
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, 'PERFORM public\.tab_write_guard', 'g');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '% already asks % page guards', p_sig, v_n;
  END IF;
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, 'PERFORM public\.lead_need\([^;]*\);', 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '% asks lead_need % times, not once', p_sig, v_n;
  END IF;
  v_need := (regexp_match(v_src, '(PERFORM public\.lead_need\([^;]*\);)'))[1];
  v_def := pg_get_functiondef(v_oid);
  IF length(v_def) - length(replace(v_def, v_src, '')) <> length(v_src) THEN
    RAISE EXCEPTION '% — its body is not in its definition exactly once', p_sig;
  END IF;
  EXECUTE replace(v_def, v_src, replace(v_src, v_need, v_need || E'\n  ' || p_new));
  IF position(p_new IN (SELECT prosrc FROM pg_proc WHERE oid = v_oid)) = 0 THEN
    RAISE EXCEPTION '% — the new guard is not in place', p_sig;
  END IF;
END
$g$;

CREATE OR REPLACE FUNCTION pg_temp.tab_guard(p_sig text, p_pages text, p_wants text[])
RETURNS void
LANGUAGE plpgsql
AS $g$
BEGIN
  PERFORM pg_temp.guard_put(p_sig, format('PERFORM public.tab_write_guard(%s, ARRAY[%s]);', p_pages,
    array_to_string(ARRAY(SELECT quote_literal(w) FROM unnest(p_wants) w), ', ')));
END
$g$;

SELECT pg_temp.tab_guard('public.lead_reply(uuid, text)',
  $$ARRAY['/leads']$$, ARRAY['leads.create']);
SELECT pg_temp.tab_guard('public.lead_simulate(uuid, text, text, text, text)',
  $$ARRAY['/leads/settings']$$, ARRAY['leads.create']);
SELECT pg_temp.tab_guard('public.lead_save_card(uuid, jsonb)',
  $$ARRAY['/leads']$$, ARRAY['leads.edit']);
SELECT pg_temp.tab_guard('public.lead_handoff(uuid, uuid)',
  $$ARRAY['/leads']$$, ARRAY['leads.edit']);

NOTIFY pgrst, 'reload schema';
