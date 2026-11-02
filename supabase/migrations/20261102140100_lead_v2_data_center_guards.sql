-- Lead View v2 › Data Center (2026-11-02, mig 20261102140000): the new writes ask their page, as the app's gates in
-- lib/leads/actions.ts name them (Data Center · Lead View · Manage; a file's end date also from AI Agent's Knowledge).
-- The guard goes in right after the function's own check (`PERFORM public.lead_need(…);`, once). lead_save_data_file,
-- lead_remove_data_file and lead_save_ai keep their own guards (their bodies carry them).

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
SELECT pg_temp.tab_guard('public.lead_save_data_folder(uuid,jsonb)',
  $$ARRAY['/leads/knowledge']$$, ARRAY['leads.manage']);
SELECT pg_temp.tab_guard('public.lead_remove_data_folder(uuid)',
  $$ARRAY['/leads/knowledge']$$, ARRAY['leads.manage']);
SELECT pg_temp.tab_guard('public.lead_link_checked(uuid,text,integer,text)',
  $$ARRAY['/leads/knowledge']$$, ARRAY['leads.manage']);
-- lead_save_data_file's body (mig 20261102140000) already asks both pages — this finds that line and changes nothing.
SELECT pg_temp.tab_guard('public.lead_save_data_file(uuid,jsonb)',
  $$ARRAY['/leads/knowledge', '/leads/ai']$$, ARRAY['leads.manage']);
SELECT pg_temp.tab_guard('public.lead_data_file_until(uuid,date)',
  $$ARRAY['/leads/knowledge', '/leads/ai']$$, ARRAY['leads.manage']);

NOTIFY pgrst, 'reload schema';
