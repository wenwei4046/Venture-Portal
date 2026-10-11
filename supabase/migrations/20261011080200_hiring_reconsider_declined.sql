-- Hiring (2026-10-11, HR revamp round 2): a declined request can be
-- reconsidered. The handoff's review inbox keeps its three decisions on a
-- request picked under "Declined" too: Acknowledge takes it on after all,
-- Request more info asks the requester again. Both now accept a declined
-- request and clear its closing; Decline itself stays for a pending one.
-- Each body is production's (md5 checked 2026-10-11) with one statement
-- changed: the statuses hiring_lock accepts, and the UPDATE that clears
-- closed_at.

CREATE OR REPLACE FUNCTION public.hiring_acknowledge(p_id text, p_owner uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_owner text := public.hiring_hr_staff_name(p_owner);
  v_note text := btrim(coalesce(p_note, ''));
BEGIN
  IF public.has_any_action(ARRAY['hiring.approve']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Approve is required' USING ERRCODE = '42501';
  END IF;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Pick the owner first.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.hiring_lock(p_id, ARRAY['submitted', 'needs_info', 'declined'], 'Only a pending request is acknowledged');
  UPDATE public.hiring_requests SET status = 'acknowledged', owner_id = p_owner, acknowledged_at = now(), closed_at = NULL WHERE id = p_id;
  PERFORM public.hiring_log(p_id, 'Acknowledged', v_owner,
    'Takes responsibility for this hire' || CASE WHEN v_note <> '' THEN ' · ' || v_note ELSE '' END);
END
$fn$;

CREATE OR REPLACE FUNCTION public.hiring_request_info(p_id text, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_note text := btrim(coalesce(p_note, ''));
BEGIN
  IF public.has_any_action(ARRAY['hiring.approve']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Approve is required' USING ERRCODE = '42501';
  END IF;
  IF v_note = '' THEN
    RAISE EXCEPTION 'Write what you need from the requester.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.hiring_lock(p_id, ARRAY['submitted', 'needs_info', 'declined'], 'Only a pending request can ask for more information');
  UPDATE public.hiring_requests SET status = 'needs_info', closed_at = NULL WHERE id = p_id;
  PERFORM public.hiring_log(p_id, 'More info requested', NULL, v_note);
END
$fn$;
