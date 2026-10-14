-- HR › Attendance's writes ask the pages they are offered on (2026-10-15). The app's gates in front of
-- them (lib/attendance/actions.ts) name /attendance/{records,requests,balances,close,settings}, each a
-- tab with its own Create / Edit / Approve boxes (mig 20261015030300), so the DEFINER writes behind a
-- narrowing gate ask the same pages in the database (tab-write-guards.test.ts).
--
-- These functions are new (mig 20261015030200) and ask no page yet: the guard goes in right after the
-- function's own permission check (`PERFORM public.att_need(…);`, exactly once in each), read from
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
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, 'PERFORM public\.att_need\([^;]*\);', 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '% asks att_need % times, not once', p_sig, v_n;
  END IF;
  v_need := (regexp_match(v_src, '(PERFORM public\.att_need\([^;]*\);)'))[1];
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

CREATE OR REPLACE FUNCTION pg_temp.tab_guard_sites(p_sig text, p_sites text[])
RETURNS void
LANGUAGE plpgsql
AS $g$
BEGIN
  PERFORM pg_temp.guard_put(p_sig, format('PERFORM public.tab_write_guard_sites(ARRAY[%s]);',
    array_to_string(ARRAY(SELECT quote_literal(s) FROM unnest(p_sites) s), ', ')));
END
$g$;

SELECT pg_temp.tab_guard('public.att_set_day_override(date, date, text, text)',
  $$ARRAY['/attendance/records']$$, ARRAY['attendance.edit']);
SELECT pg_temp.tab_guard_sites('public.att_create_request(uuid, text, text, date, date, numeric, numeric, jsonb, text, boolean)',
  ARRAY['/attendance/requests|attendance.create',
        '/attendance/balances|attendance.create']);
SELECT pg_temp.tab_guard('public.att_ledger_add(uuid, text, integer, text, numeric, text, jsonb)',
  $$ARRAY['/attendance/balances']$$, ARRAY['attendance.edit']);
SELECT pg_temp.tab_guard('public.att_decide_day(uuid, date, text)',
  $$ARRAY['/attendance/close']$$, ARRAY['attendance.edit']);
SELECT pg_temp.tab_guard('public.att_close_month(date, jsonb)',
  $$ARRAY['/attendance/close']$$, ARRAY['attendance.edit']);
SELECT pg_temp.tab_guard('public.att_reopen_month(date, text)',
  $$ARRAY['/attendance/close']$$, ARRAY['attendance.edit']);
SELECT pg_temp.tab_guard_sites('public.att_save_setting(text, uuid, jsonb)',
  ARRAY['/attendance/settings|attendance.edit',
        '/attendance/requests|attendance.edit']);
SELECT pg_temp.tab_guard('public.att_delete_setting(text, uuid)',
  $$ARRAY['/attendance/settings']$$, ARRAY['attendance.edit']);

NOTIFY pgrst, 'reload schema';
