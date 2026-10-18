-- Lead View › ads (2026-10-18, mig 20261018100000): its writes ask Settings, as the app's gates in lib/leads/actions.ts
-- name it — naming an ad and fetching Ads Manager's names are Settings' Edit (Lead View · Manage), the test ad is
-- Settings' Create (Lead View · Create, as the test enquiry). No page or box changed: the registry is not seeded.
-- The guard goes in right after each function's own check (`PERFORM public.lead_need(…);`, once); nothing else moves.

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

SELECT pg_temp.tab_guard('public.lead_name_ad(text, jsonb)',
  $$ARRAY['/leads/settings']$$, ARRAY['leads.manage']);
SELECT pg_temp.tab_guard('public.lead_save_meta_ads(jsonb)',
  $$ARRAY['/leads/settings']$$, ARRAY['leads.manage']);
SELECT pg_temp.tab_guard('public.lead_test_ad(uuid, text)',
  $$ARRAY['/leads/settings']$$, ARRAY['leads.create']);

NOTIFY pgrst, 'reload schema';
