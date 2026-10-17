-- ============================================================================
-- 20261017120000_att_decided_notice_and_correction_punch.sql
-- A decided request tells its person; an approved correction becomes the punch (2026-10-17 — the user's answers
-- to the HR Mobile + Me questions: push for attendance requests "需要通知本人", an approved correction "补上自动").
-- ============================================================================
--
-- 1. att_notify_requester(request) — once a request is DECIDED (approved at its last step, or rejected at any step),
--    its person's login gets a notice: kind 'attendance', ref 'att_request', so it reaches the phone (push) and never
--    a bell, as Today's reminder does; a tap opens Me on that request (lib/push/notices.ts). The words are Me's:
--    "Correction · IN approved" / "CR-2610-022 · Fri 16 Oct · 09:00 · by Li Sean"; a rejection carries its note.
--    A step approved on the way (the upline's, with HR's still to come) tells nobody yet. Nobody without a login,
--    never the one deciding (notify_people).
-- 2. att_correction_apply(request) — an approved correction writes the punch it asks for, so the day reads as
--    corrected everywhere (Me's month, Today, Records, Month close) instead of waiting for HR to mark it at close:
--    source 'hr' (made by the approval, not a device), the request's ref as its reason, created by whoever decided,
--    on the asked day at the asked time (a time before the policy's cutover is the next calendar morning, as
--    att_punch counts a work day). The engine takes a day's FIRST valid IN and LAST valid OUT, so an IN correction
--    sets aside every earlier valid IN of that day and an OUT correction every later valid OUT (invalid_reason
--    "Replaced by CR-…" — the rows stay). A closed month is not touched (its register is frozen); the trail says so.
-- 3. att_decide — PRODUCTION's body (md5 addca1f4537d32a1892d657eba62d45e, read 2026-10-17), calling 2 then 1
--    after its event.
-- 4. app_notifications.ref_kind takes 'att_request'.
--
-- PGlite: tests/member-sql/validate-att-decided.mjs.

DO $guard$
BEGIN
  PERFORM 1 FROM pg_proc p
   WHERE p.oid = 'public.att_decide(uuid, boolean, text)'::regprocedure
     AND (md5(p.prosrc) = 'addca1f4537d32a1892d657eba62d45e' OR strpos(p.prosrc, 'att_notify_requester') > 0);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'public.att_decide(uuid, boolean, text) changed in production since this migration was written';
  END IF;
END
$guard$;

-- ── 4. The notice's kind ────────────────────────────────────────────────────

ALTER TABLE public.app_notifications DROP CONSTRAINT IF EXISTS app_notifications_ref_kind_check;
ALTER TABLE public.app_notifications ADD CONSTRAINT app_notifications_ref_kind_check
  CHECK (ref_kind = ANY (ARRAY['hiring_request', 'booking', 'member_request', 'memo', 'crm_contact', 'crm_invite', 'att_today',
                               'att_request']));

-- ── 1. Tell the person ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.att_notify_requester(p_request uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_r    public.att_requests%ROWTYPE;
  v_user uuid;
  v_by   text;
  v_note text;
  v_what text;
  v_when text;
  v_n    integer;
BEGIN
  SELECT * INTO v_r FROM public.att_requests WHERE id = p_request AND status IN ('approved', 'rejected');
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT s.user_id INTO v_user FROM public.hr_staff_costs s WHERE s.id = v_r.staff_id;
  IF v_user IS NULL THEN
    RETURN;
  END IF;
  SELECT st.decided_by_name, st.note INTO v_by, v_note
    FROM public.att_request_steps st
   WHERE st.request_id = p_request AND st.state IN ('approved', 'rejected')
   ORDER BY st.decided_at DESC NULLS LAST, st.seq DESC
   LIMIT 1;
  -- Me's words for it (lib/me/requests.ts requestTitle / requestWhen).
  v_n := CASE WHEN coalesce(v_r.detail ->> 'count', '') ~ '^[0-9]+$' THEN (v_r.detail ->> 'count')::integer END;
  v_what := CASE v_r.kind
    WHEN 'leave' THEN coalesce((SELECT t.name FROM public.att_leave_types t WHERE t.code = v_r.leave_code ORDER BY t.deleted_at NULLS FIRST LIMIT 1),
                               btrim(coalesce(v_r.leave_code, '') || ' leave'))
    WHEN 'ot' THEN CASE WHEN v_r.detail ->> 'after' = 'true' THEN 'Overtime · after the fact' ELSE 'Overtime' END
    WHEN 'correction' THEN 'Correction' || CASE WHEN coalesce(v_r.detail ->> 'punch', '') <> '' THEN ' · ' || upper(v_r.detail ->> 'punch') ELSE '' END
    WHEN 'manpower' THEN 'Extra manpower' || CASE WHEN v_n > 0 AND coalesce(v_r.detail ->> 'role', '') <> ''
                                                   THEN ' · ' || v_n || ' ' || lower(v_r.detail ->> 'role') || CASE WHEN v_n = 1 THEN '' ELSE 's' END
                                                   ELSE '' END
    ELSE 'Profile change' END;
  v_when := CASE
    WHEN v_r.date_from IS NULL THEN NULL
    WHEN coalesce(v_r.date_to, v_r.date_from) = v_r.date_from THEN to_char(v_r.date_from, 'Dy FMDD Mon')
    WHEN date_trunc('month', v_r.date_from) = date_trunc('month', v_r.date_to)
      THEN to_char(v_r.date_from, 'Dy FMDD') || ' – ' || to_char(v_r.date_to, 'Dy FMDD Mon')
    ELSE to_char(v_r.date_from, 'Dy FMDD Mon') || ' – ' || to_char(v_r.date_to, 'Dy FMDD Mon') END
    || CASE WHEN v_r.kind = 'correction' AND coalesce(v_r.detail ->> 'at', '') <> '' THEN ' · ' || (v_r.detail ->> 'at') ELSE '' END;
  PERFORM public.notify_people(ARRAY[v_user], 'attendance',
    v_what || CASE v_r.status WHEN 'approved' THEN ' approved' ELSE ' rejected' END,
    concat_ws(' · ', v_r.ref, v_when, 'by ' || coalesce(nullif(btrim(v_by), ''), 'HR'))
      || CASE WHEN v_r.status = 'rejected' AND btrim(coalesce(v_note, '')) <> '' THEN ' — “' || btrim(v_note) || '”' ELSE '' END,
    'att_request', p_request::text);
END
$fn$;

REVOKE ALL ON FUNCTION public.att_notify_requester(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.att_notify_requester(uuid) TO service_role;

-- ── 2. The corrected punch ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.att_correction_apply(p_request uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_r    public.att_requests%ROWTYPE;
  v_dir  text;
  v_time text;
  v_cut  text;
  v_at   timestamptz;
  v_gone integer;
BEGIN
  SELECT * INTO v_r FROM public.att_requests WHERE id = p_request AND kind = 'correction' AND status = 'approved';
  IF NOT FOUND THEN
    RETURN;
  END IF;
  v_dir := lower(coalesce(v_r.detail ->> 'punch', ''));
  v_time := coalesce(v_r.detail ->> 'at', '');
  IF v_r.date_from IS NULL OR v_dir NOT IN ('in', 'out') OR v_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    PERFORM public.att_event('request', p_request::text, v_r.staff_id, 'Punch not corrected', 'The day, IN or OUT, or the time could not be read.');
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.att_months m WHERE m.month = date_trunc('month', v_r.date_from)::date AND m.status = 'closed') THEN
    PERFORM public.att_event('request', p_request::text, v_r.staff_id, 'Punch not corrected', to_char(v_r.date_from, 'FMMonth') || ' is closed.');
    RETURN;
  END IF;
  SELECT x.cutover INTO v_cut FROM public.att_policy x WHERE x.effective_from <= v_r.date_from ORDER BY x.effective_from DESC LIMIT 1;
  v_at := ((v_r.date_from + CASE WHEN v_cut IS NOT NULL AND v_time < v_cut THEN 1 ELSE 0 END) + v_time::time) AT TIME ZONE 'Asia/Kuala_Lumpur';
  UPDATE public.att_punches p
     SET invalid_at = now(), invalid_by = auth.uid(), invalid_reason = 'Replaced by ' || v_r.ref
   WHERE p.staff_id = v_r.staff_id AND p.work_day = v_r.date_from AND p.direction = v_dir AND p.invalid_at IS NULL
     AND CASE WHEN v_dir = 'in' THEN p.at < v_at ELSE p.at > v_at END;
  GET DIAGNOSTICS v_gone = ROW_COUNT;
  INSERT INTO public.att_punches (staff_id, work_day, direction, source, at, reason)
  VALUES (v_r.staff_id, v_r.date_from, v_dir, 'hr', v_at, v_r.ref);
  PERFORM public.att_event('request', p_request::text, v_r.staff_id, 'Punch corrected',
    upper(v_dir) || ' ' || v_time
      || CASE WHEN v_gone > 0 THEN ' · ' || v_gone || CASE WHEN v_dir = 'in' THEN ' earlier' ELSE ' later' END
                                    || ' punch' || CASE WHEN v_gone = 1 THEN '' ELSE 'es' END || ' set aside'
              ELSE '' END);
END
$fn$;

REVOKE ALL ON FUNCTION public.att_correction_apply(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.att_correction_apply(uuid) TO service_role;

-- ── 3. att_decide (production's body; the two calls at its end) ─────────────

CREATE OR REPLACE FUNCTION public.att_decide(p_request uuid, p_approve boolean, p_note text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_r      public.att_requests%ROWTYPE;
  v_st     public.att_request_steps%ROWTYPE;
  v_me     uuid := public.att_my_staff_id();
  v_actor  text := public.att_actor_name();
  v_hr     boolean := public.has_any_action(ARRAY['attendance.approve']);
  v_behalf boolean;
  v_next   uuid;
  v_now    timestamptz := now();
  v_done   boolean := false;
BEGIN
  SELECT * INTO v_r FROM public.att_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR v_r.status <> 'pending' THEN RAISE EXCEPTION 'This request is no longer waiting.'; END IF;
  SELECT * INTO v_st FROM public.att_request_steps WHERE request_id = p_request AND state = 'waiting' ORDER BY seq LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This request is no longer waiting.'; END IF;
  IF v_r.staff_id IS NOT DISTINCT FROM v_me THEN RAISE EXCEPTION 'Nobody decides their own request.' USING ERRCODE = '42501'; END IF;
  IF v_st.role = 'upline' AND v_st.approver_staff_id IS NOT DISTINCT FROM v_me AND v_me IS NOT NULL THEN
    v_behalf := false;
  ELSIF v_hr THEN
    v_behalf := v_st.role = 'upline';
  ELSE
    RAISE EXCEPTION 'Deciding a request needs Attendance · Approve.' USING ERRCODE = '42501';
  END IF;
  IF NOT p_approve AND btrim(coalesce(p_note, '')) = '' THEN RAISE EXCEPTION 'A note is needed to reject.'; END IF;
  UPDATE public.att_request_steps
     SET state = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, decided_by = auth.uid(), decided_by_name = v_actor,
         on_behalf = v_behalf, note = btrim(coalesce(p_note, '')), decided_at = v_now
   WHERE id = v_st.id;
  IF p_approve THEN
    SELECT id INTO v_next FROM public.att_request_steps WHERE request_id = p_request AND state = 'queued' ORDER BY seq LIMIT 1;
    IF v_next IS NOT NULL THEN
      UPDATE public.att_request_steps SET state = 'waiting', arrived_at = v_now WHERE id = v_next;
    ELSE
      UPDATE public.att_requests SET status = 'approved', decided_at = v_now WHERE id = p_request;
      v_done := true;
    END IF;
  ELSE
    UPDATE public.att_request_steps SET state = 'skipped' WHERE request_id = p_request AND state = 'queued';
    UPDATE public.att_requests SET status = 'rejected', decided_at = v_now WHERE id = p_request;
  END IF;
  PERFORM public.att_event('request', p_request::text, v_r.staff_id,
    CASE WHEN p_approve THEN 'Approved' ELSE 'Rejected' END || ' by ' || CASE v_st.role WHEN 'hr' THEN 'HR' ELSE 'upline' END
      || CASE WHEN v_behalf THEN ' (on behalf)' ELSE '' END, btrim(coalesce(p_note, '')));
  IF v_done AND v_r.kind = 'profile' AND v_st.role = 'hr' THEN
    PERFORM public.att_profile_apply(p_request);
  END IF;
  -- 2026-10-17: an approved correction is the punch; a decided request tells its person.
  IF v_done AND v_r.kind = 'correction' THEN
    PERFORM public.att_correction_apply(p_request);
  END IF;
  IF v_done OR NOT p_approve THEN
    PERFORM public.att_notify_requester(p_request);
  END IF;
  RETURN jsonb_build_object('id', p_request, 'ref', v_r.ref,
    'status', (SELECT status FROM public.att_requests WHERE id = p_request));
END
$fn$;
