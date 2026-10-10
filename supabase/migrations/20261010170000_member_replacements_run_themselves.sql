-- ============================================================================
-- 20261010170000_member_replacements_run_themselves.sql
-- A replacement is approved with its successor and a date, and runs itself
-- on that date (HR revamp 4b/8, 2026-10-10).
-- ============================================================================
--
-- The user's rule A (2026-10-10): in Member services HR picks who takes the
-- seat — somebody from People Management, or nobody (the seat is released) —
-- and the effective date. The request is then `scheduled`; on that date
-- (today or earlier: at once) the system makes the change:
--
--   * the successor takes the seat: a membership here with the original
--     member's title and upline, unless they already hold one here;
--   * everybody under the original member here moves under the successor —
--     the successor themselves up to the original's upline — or, when the
--     seat is released, up to the original's upline;
--   * the original member's arrangement:
--       Leave the company        inactive from the date (their resignation
--                                date); their members in every other
--                                sub-department move up a level too. Their
--                                positions stay open, as for every leaver
--                                (comm_sync_position): the month they leave
--                                in is still paid from them.
--       Leave this department    their membership here closes; if this was
--                                their base, it moves to their oldest other
--                                membership (as Sales Groups' Remove does).
--       Transfer                 their membership moves to the receiving
--                                sub-department, with the same title.
--
-- Chart changes take effect from the commission month they run in, as every
-- other chart edit does (comm_period_start): a position begun this month is
-- edited in place, an older one closed at the month's start and reopened.
-- Somebody based here moves by their roster line (reports_to), which the
-- roster's own triggers check (the ladder, who may lead) and turn into the
-- position; a membership of their own is re-pointed directly. A seat that
-- is given up closes BEFORE the successor sits in it, so the upline's direct
-- lines (23CAP) never count the two of them at once; the headcount
-- (member_capacity_guard) is counted once everything has moved.
--
-- Dry-run on prod data 2026-10-10 (rolled back): Leave the company with a
-- successor already here, Leave this department (based elsewhere / based
-- here) with a successor new to the sub-department, Transfer with the seat
-- released — all run, by HR at once and by the hourly sweep; refused with
-- HR's words: a successor who cannot lead, a full sub-department, a full
-- upline in another sub-department, a date before the original joined.
--
-- Functions (SECURITY DEFINER):
--   member_replacement_problem(request, successor)   why it cannot run, or null
--   member_schedule_replacement(request, successor, date, note)    HR (gate:
--       member_is_manager('member_requests_manage')); runs it at once when
--       the date has come
--   member_unschedule_replacement(request, note)      HR: back to Pending review
--   member_run_replacement(request, actor)             the change itself —
--       service role only (called by the two above and the hourly sweep)
--   member_run_due_replacements()                      the hourly sweep's half
--       (service role), each one on its own: a refusal is written on its
--       request and the rest still run
--   member_admin_request_facts()                       + effectiveOn

ALTER TABLE public.member_requests ADD COLUMN IF NOT EXISTS effective_on date;
COMMENT ON COLUMN public.member_requests.effective_on IS
  'A scheduled replacement: the date HR approved it to run (Member services, 2026-10-10).';

-- ── Why a replacement cannot run ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_replacement_problem(p_request uuid, p_successor uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.member_requests;
  v_sub_name text;
  v_scheme uuid;
  v_target_scheme uuid;
  v_target_name text;
  v_original uuid;
  v_dest text;
  v_o record;
  v_p record;
  o_pos public.comm_hierarchy;
  p_pos public.comm_hierarchy;
  v_lead_title uuid;
  v_home_downlines integer;
  v_downlines integer;
  v_above text;
BEGIN
  SELECT * INTO r FROM public.member_requests WHERE id = p_request;
  IF NOT FOUND OR r.kind IS DISTINCT FROM 'replacement' THEN RETURN 'Replacement request not found.'; END IF;
  SELECT d.name INTO v_sub_name FROM public.comm_sub_departments d WHERE d.id = r.sub_department_id;
  SELECT c.id INTO v_scheme FROM public.comm_schemes c
   WHERE c.sub_department_id = r.sub_department_id AND c.is_active AND c.effective_to IS NULL
   ORDER BY c.effective_from DESC LIMIT 1;
  IF v_scheme IS NULL THEN RETURN format('%s has no scheme.', coalesce(v_sub_name, 'The sub-department')); END IF;

  v_original := nullif(r.detail ->> 'originalStaffId', '')::uuid;
  v_dest := r.detail ->> 'destination';
  SELECT s.id, s.employee_name, s.status, s.department_id INTO v_o FROM public.hr_staff_costs s WHERE s.id = v_original;
  IF NOT FOUND THEN RETURN 'The original member is no longer on the roster.'; END IF;
  IF v_o.status IS DISTINCT FROM 'active' THEN RETURN format('%s has already left the company.', v_o.employee_name); END IF;
  SELECT * INTO o_pos FROM public.comm_hierarchy WHERE scheme_id = v_scheme AND staff_id = v_original AND effective_to IS NULL;
  IF o_pos.id IS NULL THEN RETURN format('%s is no longer a member of %s.', v_o.employee_name, v_sub_name); END IF;

  IF v_dest = 'resignation' THEN
    IF EXISTS (SELECT 1 FROM public.comm_sub_department_directors x WHERE x.staff_id = v_original) THEN
      RETURN format('%s directs a sub-department. Take them off it on Sales Groups first.', v_o.employee_name);
    END IF;
  ELSIF v_dest = 'member_exit' THEN
    IF public.comm_home_scheme_for_staff(v_original) = v_scheme AND NOT EXISTS (
      SELECT 1 FROM public.comm_hierarchy h
        JOIN public.comm_schemes c ON c.id = h.scheme_id AND c.is_active AND c.effective_to IS NULL
        JOIN public.comm_sub_departments d ON d.id = c.sub_department_id AND d.is_active
       WHERE h.staff_id = v_original AND h.effective_to IS NULL AND h.scheme_id <> v_scheme AND d.department_id = v_o.department_id
    ) THEN
      RETURN format('%s works only in %s — leaving it is leaving the company. Ask for Leave the company instead.', v_o.employee_name, v_sub_name);
    END IF;
  ELSIF v_dest = 'transfer' THEN
    SELECT c.id, d.name INTO v_target_scheme, v_target_name
      FROM public.comm_sub_departments d
      JOIN public.comm_schemes c ON c.sub_department_id = d.id AND c.is_active AND c.effective_to IS NULL
     WHERE d.id = nullif(r.detail ->> 'targetDepartmentId', '')::uuid AND d.is_active AND d.department_id = v_o.department_id
     ORDER BY c.effective_from DESC LIMIT 1;
    IF v_target_scheme IS NULL OR v_target_scheme = v_scheme THEN RETURN 'The receiving sub-department is not open.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.comm_hierarchy WHERE scheme_id = v_target_scheme AND staff_id = v_original AND effective_to IS NULL)
       AND public.comm_floor_rank(v_target_scheme, o_pos.title_id) IS NULL THEN
      RETURN format('%s''s title has no rung on %s''s ladder. Add it under Rules › Title ladder first.', v_o.employee_name, v_target_name);
    END IF;
  ELSE
    RETURN 'The arrangement for the original member is not one the system can carry out.';
  END IF;

  IF p_successor IS NULL THEN RETURN NULL; END IF;
  IF p_successor = v_original THEN RETURN 'The replacement cannot be the original member.'; END IF;
  SELECT s.id, s.employee_name, s.status, s.department_id, s.title_id INTO v_p FROM public.hr_staff_costs s WHERE s.id = p_successor;
  IF NOT FOUND OR v_p.status IS DISTINCT FROM 'active' THEN RETURN 'The replacement is not an active employee.'; END IF;
  IF v_p.department_id IS DISTINCT FROM v_o.department_id THEN
    RETURN format('%s is not in the same department.', v_p.employee_name);
  END IF;
  SELECT * INTO p_pos FROM public.comm_hierarchy WHERE scheme_id = v_scheme AND staff_id = p_successor AND effective_to IS NULL;
  IF p_pos.id IS NULL AND public.comm_home_scheme_for_staff(p_successor) = v_scheme THEN
    RETURN format('%s is based in %s but holds no rung on its ladder yet. Give them a title on it first.', v_p.employee_name, v_sub_name);
  END IF;

  -- Whoever takes the seat must be able to lead what the original member led here.
  SELECT count(*), count(*) FILTER (WHERE public.comm_home_scheme_for_staff(h.staff_id) = v_scheme)
    INTO v_downlines, v_home_downlines
    FROM public.comm_hierarchy h
   WHERE h.scheme_id = v_scheme AND h.upline_staff_id = v_original AND h.effective_to IS NULL AND h.staff_id <> p_successor;
  IF v_downlines > 0 THEN
    v_lead_title := coalesce(p_pos.title_id, o_pos.title_id);
    IF NOT coalesce((SELECT bool_or(k.can_recruit) FROM public.comm_ranks k WHERE k.scheme_id = v_scheme AND k.title_id = v_lead_title), false) THEN
      RETURN format('%s''s title in %s cannot hold downlines — %s of %s''s members would move under them.',
        v_p.employee_name, v_sub_name, v_downlines, v_o.employee_name);
    END IF;
    -- Members based here follow the company chart: the successor's own title must lead there too …
    IF v_home_downlines > 0 AND public.comm_staff_can_recruit(p_successor, v_p.title_id) IS NOT TRUE THEN
      RETURN format('%s''s company title cannot hold reports — %s of %s''s members are based in %s and report on the company chart.',
        v_p.employee_name, v_home_downlines, v_o.employee_name, v_sub_name);
    END IF;
    -- … and stand no lower on the title ladder than they do (hr_staff_respects_ladder).
    SELECT d.employee_name INTO v_above
      FROM public.comm_hierarchy h
      JOIN public.hr_staff_costs d ON d.id = h.staff_id
      JOIN public.titles dt ON dt.id = d.title_id JOIN public.title_levels dl ON dl.id = dt.level_id
      JOIN public.titles st ON st.id = v_p.title_id JOIN public.title_levels sl ON sl.id = st.level_id
     WHERE h.scheme_id = v_scheme AND h.upline_staff_id = v_original AND h.effective_to IS NULL
       AND h.staff_id <> p_successor AND public.comm_home_scheme_for_staff(h.staff_id) = v_scheme
       AND sl.rank < dl.rank
     ORDER BY dl.rank DESC, d.employee_name
     LIMIT 1;
    IF v_above IS NOT NULL THEN
      RETURN format('%s stands above %s on the title ladder, so cannot report to them.', v_above, v_p.employee_name);
    END IF;
  END IF;
  RETURN NULL;
END
$$;

-- ── One member's line, from this commission month ───────────────────────────

CREATE OR REPLACE FUNCTION public.member_move_downline(p_position uuid, p_upline uuid, p_actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h public.comm_hierarchy;
  v_from date := public.comm_period_start();
BEGIN
  SELECT * INTO h FROM public.comm_hierarchy WHERE id = p_position AND effective_to IS NULL FOR UPDATE;
  IF NOT FOUND OR h.upline_staff_id IS NOT DISTINCT FROM p_upline THEN RETURN; END IF;
  IF public.comm_home_scheme_for_staff(h.staff_id) = h.scheme_id THEN
    -- Based here: the roster line is the chart line (comm_sync_position).
    UPDATE public.hr_staff_costs SET reports_to = p_upline WHERE id = h.staff_id;
  ELSIF h.effective_from >= v_from THEN
    UPDATE public.comm_hierarchy SET upline_staff_id = p_upline WHERE id = h.id;
  ELSE
    UPDATE public.comm_hierarchy SET effective_to = v_from - 1 WHERE id = h.id;
    INSERT INTO public.comm_hierarchy (scheme_id, staff_id, title_id, upline_staff_id, rank_id, rate_mode, effective_from, created_by)
    VALUES (h.scheme_id, h.staff_id, h.title_id, p_upline, h.rank_id, h.rate_mode, v_from, p_actor);
  END IF;
EXCEPTION WHEN SQLSTATE '23CAP' THEN
  -- The limit can be another sub-department's (a leaver's members move up
  -- everywhere): say which.
  RAISE EXCEPTION 'In %: %',
    (SELECT d.name FROM public.comm_schemes c JOIN public.comm_sub_departments d ON d.id = c.sub_department_id WHERE c.id = h.scheme_id),
    SQLERRM USING ERRCODE = '23CAP';
END
$$;

-- ── The change itself ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_run_replacement(p_request uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.member_requests;
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_from date := public.comm_period_start();
  v_on date;
  v_problem text;
  v_scheme uuid;
  v_target_scheme uuid;
  v_original uuid;
  v_successor uuid;
  v_dest text;
  v_target uuid;
  o_pos public.comm_hierarchy;
  p_pos public.comm_hierarchy;
  h public.comm_hierarchy;
  v_upline uuid;
  v_home boolean;
  v_reports_to uuid;
  v_new_home_sub uuid;
  v_new_home_upline uuid;
  v_moved integer := 0;
  v_o_name text;
  v_p_name text;
  v_sub_name text;
  v_full_name text;
  v_full_limit integer;
  v_full_count integer;
BEGIN
  SELECT * INTO r FROM public.member_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR r.kind IS DISTINCT FROM 'replacement' OR r.status IS DISTINCT FROM 'scheduled' THEN
    RAISE EXCEPTION 'This replacement is not scheduled' USING ERRCODE = '22023';
  END IF;
  v_on := coalesce(r.effective_on, nullif(r.detail ->> 'effective', '')::date);
  IF v_on IS NULL OR v_on > v_today THEN
    RAISE EXCEPTION 'This replacement is not due until %', to_char(v_on, 'FMDD Mon YYYY') USING ERRCODE = '22023';
  END IF;

  -- The roster and the charts change together; everybody else waits.
  LOCK TABLE public.hr_staff_costs IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.comm_hierarchy IN SHARE ROW EXCLUSIVE MODE;

  v_problem := public.member_replacement_problem(r.id, r.allocated_staff_id);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION '%', v_problem USING ERRCODE = '22023'; END IF;

  v_original := (r.detail ->> 'originalStaffId')::uuid;
  v_successor := r.allocated_staff_id;
  v_dest := r.detail ->> 'destination';
  v_target := nullif(r.detail ->> 'targetDepartmentId', '')::uuid;
  SELECT d.name INTO v_sub_name FROM public.comm_sub_departments d WHERE d.id = r.sub_department_id;
  SELECT c.id INTO v_scheme FROM public.comm_schemes c
   WHERE c.sub_department_id = r.sub_department_id AND c.is_active AND c.effective_to IS NULL
   ORDER BY c.effective_from DESC LIMIT 1;
  SELECT * INTO o_pos FROM public.comm_hierarchy WHERE scheme_id = v_scheme AND staff_id = v_original AND effective_to IS NULL FOR UPDATE;
  v_upline := o_pos.upline_staff_id;
  v_home := public.comm_home_scheme_for_staff(v_original) = v_scheme;
  SELECT s.reports_to, s.employee_name INTO v_reports_to, v_o_name FROM public.hr_staff_costs s WHERE s.id = v_original;
  SELECT s.employee_name INTO v_p_name FROM public.hr_staff_costs s WHERE s.id = v_successor;

  -- 1. Leaving this department, or moving: the original member's base goes
  --    with them, then their seat here closes — before anybody sits in it,
  --    so the upline's direct lines never count the two of them at once.
  --    The base moves first because comm_sync_position keeps a base's seat
  --    open.
  IF v_dest = 'member_exit' AND v_home THEN
    SELECT c.sub_department_id, x.upline_staff_id INTO v_new_home_sub, v_new_home_upline
      FROM public.comm_hierarchy x
      JOIN public.comm_schemes c ON c.id = x.scheme_id AND c.is_active AND c.effective_to IS NULL
      JOIN public.comm_sub_departments d ON d.id = c.sub_department_id AND d.is_active
     WHERE x.staff_id = v_original AND x.effective_to IS NULL AND x.scheme_id <> v_scheme
       AND d.department_id = (SELECT s.department_id FROM public.hr_staff_costs s WHERE s.id = v_original)
     ORDER BY d.created_at, d.id LIMIT 1;
    UPDATE public.hr_staff_costs SET home_sub_department_id = v_new_home_sub, reports_to = v_new_home_upline WHERE id = v_original;
  ELSIF v_dest = 'transfer' THEN
    SELECT c.id INTO v_target_scheme FROM public.comm_schemes c
     WHERE c.sub_department_id = v_target AND c.is_active AND c.effective_to IS NULL
     ORDER BY c.effective_from DESC LIMIT 1;
    IF NOT EXISTS (SELECT 1 FROM public.comm_hierarchy WHERE scheme_id = v_target_scheme AND staff_id = v_original AND effective_to IS NULL) THEN
      INSERT INTO public.comm_hierarchy (scheme_id, staff_id, title_id, upline_staff_id, rank_id, rate_mode, effective_from, created_by)
      VALUES (v_target_scheme, v_original, o_pos.title_id, NULL, public.comm_floor_rank(v_target_scheme, o_pos.title_id), NULL, v_from, p_actor);
    END IF;
    IF v_home THEN
      UPDATE public.hr_staff_costs
         SET home_sub_department_id = v_target,
             reports_to = (SELECT x.upline_staff_id FROM public.comm_hierarchy x WHERE x.scheme_id = v_target_scheme AND x.staff_id = v_original AND x.effective_to IS NULL)
       WHERE id = v_original;
    END IF;
  END IF;
  IF v_dest IN ('member_exit', 'transfer') THEN
    IF o_pos.effective_from >= v_from THEN
      DELETE FROM public.comm_hierarchy WHERE id = o_pos.id;
    ELSE
      UPDATE public.comm_hierarchy SET effective_to = v_from - 1 WHERE id = o_pos.id;
    END IF;
  END IF;

  -- 2. The successor takes the seat, unless they hold one here already.
  IF v_successor IS NOT NULL THEN
    SELECT * INTO p_pos FROM public.comm_hierarchy WHERE scheme_id = v_scheme AND staff_id = v_successor AND effective_to IS NULL;
    IF p_pos.id IS NULL THEN
      INSERT INTO public.comm_hierarchy (scheme_id, staff_id, title_id, upline_staff_id, rank_id, rate_mode, effective_from, created_by)
      VALUES (v_scheme, v_successor, o_pos.title_id, v_upline, public.comm_floor_rank(v_scheme, o_pos.title_id), NULL, v_from, p_actor);
    END IF;
  END IF;

  -- 3. Everybody under the original member here: under the successor (the
  --    successor themselves up a level), or up a level when the seat is released.
  FOR h IN SELECT * FROM public.comm_hierarchy
            WHERE scheme_id = v_scheme AND upline_staff_id = v_original AND effective_to IS NULL
            ORDER BY staff_id = v_successor DESC LOOP
    PERFORM public.member_move_downline(h.id, CASE WHEN h.staff_id = v_successor THEN v_upline ELSE coalesce(v_successor, v_upline) END, p_actor);
    v_moved := v_moved + 1;
  END LOOP;

  -- 4. Leaving the company. Their seats stay open, as every leaver's do
  --    (comm_sync_position): the month they leave in is still paid from them.
  IF v_dest = 'resignation' THEN
    -- Their members in every other sub-department move up a level there …
    FOR h IN SELECT * FROM public.comm_hierarchy WHERE upline_staff_id = v_original AND effective_to IS NULL LOOP
      PERFORM public.member_move_downline(h.id,
        (SELECT x.upline_staff_id FROM public.comm_hierarchy x WHERE x.scheme_id = h.scheme_id AND x.staff_id = v_original AND x.effective_to IS NULL),
        p_actor);
    END LOOP;
    -- … and whoever still reports to them on the company chart reports to their manager.
    UPDATE public.hr_staff_costs SET reports_to = v_reports_to WHERE reports_to = v_original AND status = 'active';
    UPDATE public.hr_staff_costs SET status = 'inactive', resignation_date = v_on WHERE id = v_original;
  END IF;

  -- The headcount check is DEFERRED to commit (member_capacity_guard): ask it
  -- now, so a refusal belongs to this replacement — the hourly sweep runs
  -- each one in its own savepoint and must not lose the others to it — and
  -- say it in HR's words. Then put it back: the next replacement in the same
  -- sweep closes a seat before it fills one, and must be counted at its end too.
  BEGIN
    SET CONSTRAINTS public.member_capacity_guard IMMEDIATE;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Department capacity including reserved positions has been reached' THEN
      SELECT d.name, c.headcount_limit, public.member_occupied(d.id, v_today)
        INTO v_full_name, v_full_limit, v_full_count
        FROM public.member_department_capacity c
        JOIN public.comm_sub_departments d ON d.id = c.sub_department_id
       WHERE c.sub_department_id IN (r.sub_department_id, v_target)
       ORDER BY public.member_occupied(d.id, v_today) - c.headcount_limit DESC
       LIMIT 1;
      RAISE EXCEPTION '% is full: % places, and this replacement would make %. Somebody who has left keeps their place until their seat is closed. Release a place or raise the limit on Rules › Capacity first.',
        coalesce(v_full_name, v_sub_name), v_full_limit, v_full_count
        USING ERRCODE = '22023';
    END IF;
    RAISE;
  END;
  SET CONSTRAINTS public.member_capacity_guard DEFERRED;

  UPDATE public.member_requests
     SET status = 'executed',
         note = format('Replaced on %s: %s %s%s.', to_char(v_on, 'FMDD Mon YYYY'), v_o_name,
                  CASE v_dest WHEN 'resignation' THEN 'left the company' WHEN 'member_exit' THEN 'left ' || v_sub_name ELSE 'moved' END,
                  CASE WHEN v_successor IS NULL THEN ', the seat released' ELSE ', ' || v_p_name || ' took the seat' END),
         reviewed_by = coalesce(p_actor, r.reviewed_by), reviewed_at = now()
   WHERE id = r.id;
  RETURN public.member_request_json(r.id);
END
$$;

-- ── HR approves it: successor and date ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_schedule_replacement(p_request uuid, p_successor uuid, p_effective date, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.member_requests;
  v_problem text;
  v_name text;
  v_hired date;
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
  IF public.member_is_manager('member_requests_manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'HR management access is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.member_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR r.kind IS DISTINCT FROM 'replacement' THEN RAISE EXCEPTION 'Replacement request not found'; END IF;
  IF r.status NOT IN ('submitted', 'needs_info', 'scheduled', 'approved') THEN
    RAISE EXCEPTION 'Only a replacement under review or scheduled can be scheduled' USING ERRCODE = '22023';
  END IF;
  IF p_effective IS NULL THEN RAISE EXCEPTION 'Choose the effective date' USING ERRCODE = '22023'; END IF;
  SELECT s.employee_name, s.hire_date INTO v_name, v_hired FROM public.hr_staff_costs s
   WHERE s.id = nullif(r.detail ->> 'originalStaffId', '')::uuid;
  IF p_effective < v_hired THEN
    RAISE EXCEPTION 'The effective date is before % joined (%).', v_name, to_char(v_hired, 'FMDD Mon YYYY') USING ERRCODE = '22023';
  END IF;
  v_problem := public.member_replacement_problem(r.id, p_successor);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION '%', v_problem USING ERRCODE = '22023'; END IF;
  UPDATE public.member_requests
     SET status = 'scheduled', allocated_staff_id = p_successor, effective_on = p_effective,
         note = coalesce(nullif(btrim(p_note), ''), 'Approved to run on ' || to_char(p_effective, 'FMDD Mon YYYY') || '.'),
         reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = r.id;
  IF p_effective <= v_today THEN
    RETURN public.member_run_replacement(r.id, auth.uid());
  END IF;
  RETURN public.member_request_json(r.id);
END
$$;

CREATE OR REPLACE FUNCTION public.member_unschedule_replacement(p_request uuid, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r public.member_requests;
BEGIN
  IF public.member_is_manager('member_requests_manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'HR management access is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.member_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR r.kind IS DISTINCT FROM 'replacement' OR r.status IS DISTINCT FROM 'scheduled' THEN
    RAISE EXCEPTION 'Only a scheduled replacement can be taken off the schedule' USING ERRCODE = '22023';
  END IF;
  UPDATE public.member_requests
     SET status = 'submitted', allocated_staff_id = NULL, effective_on = NULL,
         note = coalesce(nullif(btrim(p_note), ''), 'Taken off the schedule.'), reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = r.id;
  RETURN public.member_request_json(r.id);
END
$$;

-- ── The hourly sweep's half ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_run_due_replacements()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_id uuid;
  v_actor uuid;
  v_ran integer := 0;
  v_failures jsonb := '[]'::jsonb;
  v_state text;
  v_message text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service-role queue access is required' USING ERRCODE = '42501';
  END IF;
  FOR v_id, v_actor IN
    SELECT id, reviewed_by FROM public.member_requests
     WHERE kind = 'replacement' AND status = 'scheduled' AND effective_on <= v_today
     ORDER BY effective_on, created_at
  LOOP
    BEGIN
      PERFORM public.member_run_replacement(v_id, v_actor);
      v_ran := v_ran + 1;
    EXCEPTION WHEN OTHERS THEN
      -- One refusal rolls back its own change only; it is written on the
      -- request for HR, and the rest still run.
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
      UPDATE public.member_requests
         SET note = left('Could not run on ' || to_char(v_today, 'FMDD Mon YYYY') || ': ' || v_message, 2000)
       WHERE id = v_id;
      v_failures := v_failures || jsonb_build_object('requestId', v_id, 'code', v_state, 'message', left(v_message, 300));
    END;
  END LOOP;
  RETURN jsonb_build_object('ran', v_ran, 'failed', jsonb_array_length(v_failures), 'failures', v_failures);
END
$$;

-- ── Member services reads the date ──────────────────────────────────────────
-- member_admin_request_facts() from 20261010160000, + effectiveOn.

CREATE OR REPLACE FUNCTION public.member_admin_request_facts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.member_is_manager('member_requests_manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'HR management access is required' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_object_agg(r.id, jsonb_build_object(
      'submittedBy', (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.id = r.staff_id),
      'original', (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.id::text = r.detail ->> 'originalStaffId'),
      'successor', (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.id = r.allocated_staff_id),
      'target', (SELECT d.name FROM public.comm_sub_departments d WHERE d.id::text = r.detail ->> 'targetDepartmentId'),
      'acceptedAt', (SELECT min(e.created_at) FROM public.member_request_events e WHERE e.request_id = r.id AND e.to_status = 'waiting'),
      'effectiveOn', r.effective_on,
      'events', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'to', ev.status,
          'at', ev.at,
          'note', ev.note,
          'by', coalesce(
            (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.user_id = ev.actor_id ORDER BY s.status = 'active' DESC LIMIT 1),
            (SELECT CASE u.role::text WHEN 'hr' THEN 'HR' WHEN 'principal' THEN 'Principal' WHEN 'finance' THEN 'Finance' ELSE initcap(replace(u.role::text, '_', ' ')) END
               FROM public.users u WHERE u.id = ev.actor_id)
          )
        ) ORDER BY ev.at), '[]'::jsonb)
        FROM (
          SELECT e.created_at AS at, e.to_status AS status, e.note, e.actor_id
            FROM public.member_request_events e
           WHERE e.request_id = r.id AND e.from_status IS DISTINCT FROM e.to_status AND e.to_status <> 'draft'
          UNION ALL
          SELECT c.approved_at, CASE WHEN c.status = 'rejected' THEN 'rejected' ELSE 'approved' END, NULL, c.approved_by
            FROM public.claims c
           WHERE r.kind = 'claim' AND c.id = r.claim_id AND c.status IN ('approved', 'rejected', 'paid') AND c.approved_at IS NOT NULL
          UNION ALL
          SELECT coalesce(v.executed_at, v.payment_date::timestamptz, c.approved_at), 'paid',
                 CASE WHEN c.payroll_month IS NOT NULL THEN 'With ' || to_char(c.payroll_month, 'FMMonth') || ' payroll' END, v.executed_by
            FROM public.claims c LEFT JOIN public.payment_vouchers v ON v.id = c.voucher_id
           WHERE r.kind = 'claim' AND c.id = r.claim_id AND c.status = 'paid'
        ) ev
        WHERE ev.at IS NOT NULL
      )
    ))
    FROM public.member_requests r
    WHERE r.status <> 'draft'
  ), '{}'::jsonb);
END
$$;

-- ── Who may call what ───────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
  -- HR's, through Member services.
  FOREACH f IN ARRAY ARRAY['member_schedule_replacement(uuid, uuid, date, text)', 'member_unschedule_replacement(uuid, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
  -- The machinery: only other DEFINER functions and the service role.
  FOREACH f IN ARRAY ARRAY['member_replacement_problem(uuid, uuid)', 'member_move_downline(uuid, uuid, uuid)',
    'member_run_replacement(uuid, uuid)', 'member_run_due_replacements()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;
