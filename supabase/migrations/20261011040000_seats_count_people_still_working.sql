-- ============================================================================
-- 20261011040000_seats_count_people_still_working.sql
-- A seat counts only somebody still working; a leaver's opens on the spot
-- (2026-10-11 — the user: "only calculate occupied", "if leave, on the spot
-- open position … once stop the post. all in live").
-- ============================================================================
--
-- A leaver's position is left open on purpose (comm_sync_position — their
-- final month's commission still pays from it), so everything that counted
-- open positions counted them too: Fair read 28 of 28 — 25 at work and miao
-- miao, WEI HOW and WENG GI, who left on 24 Sep — and a leader's direct line
-- stayed taken by somebody gone. Rules › Capacity, the Revenue app's places,
-- the waiting list's Transfer and replacements all refused a full Fair that
-- was not full; the Principal's app view alone already counted 25.
--
-- One rule now, for both kinds of seat: somebody takes a seat on a day when
-- they hold a position that day, are active, and have not passed their
-- resignation date. Their position itself is not touched — the commission
-- still reads it.
--
--   member_occupied            a sub-department's places (Rules › Capacity, the
--                              capacity guard, Transfer, replacements, HR's and
--                              the member's snapshots)
--   member_data_snapshot       the Revenue app's own two counts now ask it
--   comm_hierarchy_direct_line_limit
--                              a leader's direct lines: a leaver's line is not
--                              counted from the day after their last
--
-- Each body is production's, read from the live database and checked against
-- the md5 it was written against; every swap must match exactly once
-- (CLAUDE.md › Do NOT).

DO $patch$
DECLARE
  v_oid oid;
  v_src text;
  v_old text;
  v_new text;
  v_count int;
BEGIN
  -- member_occupied -----------------------------------------------------------
  SELECT p.oid, p.prosrc INTO v_oid, v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE p.proname = 'member_occupied';
  IF md5(v_src) <> '2555889f3538e54078e0ee55675b68be' THEN
    RAISE EXCEPTION 'member_occupied is not the body this migration was written against (md5 %)', md5(v_src);
  END IF;
  v_new := E'\n SELECT count(DISTINCT h.staff_id)::integer FROM public.comm_hierarchy h JOIN public.comm_schemes c ON c.id=h.scheme_id\n'
        || E' JOIN public.hr_staff_costs s ON s.id=h.staff_id\n'
        || E' WHERE c.sub_department_id=p_sub AND h.effective_from<=p_date AND (h.effective_to IS NULL OR h.effective_to>=p_date)\n'
        -- Somebody still working that day: active, and not past their last day.
        || E' AND s.status=''active'' AND (s.resignation_date IS NULL OR s.resignation_date>=p_date);\n';
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.member_occupied(p_sub uuid, p_date date) RETURNS %s '
    'LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''public'' AS %L',
    pg_get_function_result(v_oid), v_new);

  -- member_data_snapshot(p_full) — its two counts ask member_occupied ------------
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE p.proname = 'member_data_snapshot' AND pg_get_function_identity_arguments(p.oid) = 'p_full boolean';
  IF md5(v_src) <> '79d03374ab02b2280cc0ca91f9d889b6' THEN
    RAISE EXCEPTION 'member_data_snapshot is not the body this migration was written against (md5 %)', md5(v_src);
  END IF;
  v_old := E'(SELECT count(DISTINCT h.staff_id) FROM public.comm_hierarchy h JOIN public.comm_schemes c ON c.id=h.scheme_id\n'
        || E' WHERE c.sub_department_id=d.id AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today))';
  v_count := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  IF v_count <> 1 THEN RAISE EXCEPTION 'member_data_snapshot: the directory''s count matched % times', v_count; END IF;
  v_src := replace(v_src, v_old, 'public.member_occupied(d.id,v_today)');
  v_old := E'(SELECT count(DISTINCT x.staff_id)\n FROM public.comm_hierarchy x JOIN public.comm_schemes xc ON xc.id=x.scheme_id WHERE xc.sub_department_id=d.id\n'
        || E' AND x.effective_from<=v_today AND (x.effective_to IS NULL OR x.effective_to>=v_today))';
  v_count := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  IF v_count <> 1 THEN RAISE EXCEPTION 'member_data_snapshot: the membership''s count matched % times', v_count; END IF;
  v_src := replace(v_src, v_old, 'public.member_occupied(d.id,v_today)');
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.member_data_snapshot(p_full boolean) RETURNS jsonb '
    'LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''public'' AS %L', v_src);

  -- comm_hierarchy_direct_line_limit ---------------------------------------------
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE p.proname = 'comm_hierarchy_direct_line_limit';
  IF md5(v_src) <> '6d894fd5c479964f25c698734e3d03c8' THEN
    RAISE EXCEPTION 'comm_hierarchy_direct_line_limit is not the body this migration was written against (md5 %)', md5(v_src);
  END IF;
  -- The line being written takes no slot for somebody who has left, nor past their last day.
  v_old := E'    PERFORM pg_advisory_xact_lock(hashtextextended(\n';
  v_count := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  IF v_count <> 1 THEN RAISE EXCEPTION 'comm_hierarchy_direct_line_limit: the lock matched % times', v_count; END IF;
  v_new := E'    -- Somebody who has left takes no slot, nor anyone past their last day\n'
        || E'    -- (2026-10-11): their seat opens on the spot.\n'
        || E'    IF NOT EXISTS (SELECT 1 FROM public.hr_staff_costs s WHERE s.id = NEW.staff_id AND s.status = ''active'') THEN RETURN NEW; END IF;\n'
        || E'    v_window := v_window * daterange(NULL, (SELECT s.resignation_date FROM public.hr_staff_costs s WHERE s.id = NEW.staff_id), ''[]'');\n'
        || E'    IF isempty(v_window) THEN RETURN NEW; END IF;\n'
        || v_old;
  v_src := replace(v_src, v_old, v_new);
  -- …and the lines already there count only while their holder is still working.
  v_old := E'        SELECT daterange(h.effective_from, h.effective_to, ''[]'') * v_window AS span\n'
        || E'          FROM public.comm_hierarchy h\n';
  v_count := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  IF v_count <> 1 THEN RAISE EXCEPTION 'comm_hierarchy_direct_line_limit: the windows matched % times', v_count; END IF;
  v_src := replace(v_src, v_old,
           E'        SELECT daterange(h.effective_from, h.effective_to, ''[]'') * daterange(NULL, s.resignation_date, ''[]'') * v_window AS span\n'
        || E'          FROM public.comm_hierarchy h\n'
        || E'          JOIN public.hr_staff_costs s ON s.id = h.staff_id AND s.status = ''active''\n');
  v_old := E'           AND daterange(h.effective_from, h.effective_to, ''[]'') && v_window\n';
  v_count := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  IF v_count <> 1 THEN RAISE EXCEPTION 'comm_hierarchy_direct_line_limit: the overlap matched % times', v_count; END IF;
  v_src := replace(v_src, v_old,
           E'           AND daterange(h.effective_from, h.effective_to, ''[]'') * daterange(NULL, s.resignation_date, ''[]'') && v_window\n');
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.comm_hierarchy_direct_line_limit() RETURNS trigger '
    'LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS %L', v_src);
END
$patch$;
