-- ============================================================================
-- 20261016190000_login_email_change.sql
-- Request to change email (2026-10-16): a person's email is the one they sign in with — theirs to change, by asking.
-- ============================================================================
--
-- The user: "我要 email 的话，他们只能跟着他们登录 email 来去定制，所以他们 email 是不能乱改的，除非他们 request to
-- change email … 在他们的 app 那边，同时有多一个 option 就是 request to change email"; asked who approves: "go with
-- a" — HR, on Attendance › Requests, where a profile change is already decided (mig 20261015200000).
--
-- 1. att_profile_changes — an email asked for is kept in lower case, and for somebody with a login it may not be
--    another login's, nor nothing at all (a login needs one).
-- 2. att_profile_apply — HR's last approval of a login's email writes their login row (`users.email`) too, and only
--    once the login itself already signs in with it: the portal moves the login first (the auth server, at the press
--    of Approve — src/lib/attendance/actions.ts › decideRequest), then decides. An approval that came any other way
--    is refused, so the People record and the login cannot part.
-- 3. att_login_email_change(request) — what Approve must do first, asked of the request about to be decided: when
--    it is HR's last step on a login's email change, who the login is and the email it moves from and to (asking
--    the same as att_decide: not one's own request, Attendance · Approve); otherwise nothing.
-- 4. request_my_email_change(email) — the person's own request, from their app: one at a time, through
--    att_create_request (its route, its checks, its trail).
-- 5. my_email_change() — the person's latest one, for their app to show it waiting, declined or done.
--
-- Every function changed here is PRODUCTION's body (md5 below, read 2026-10-16) with its swaps and nothing else;
-- comments stay outside the bodies. PGlite: tests/member-sql/validate-login-email-change.mjs.

DO $guard$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.att_profile_changes(uuid, jsonb)', '34812ae235526c506e64fa855fab3f59', 'another login'),
      ('public.att_profile_apply(uuid)', '16842d8cbb4848eaee5932310f424159', 'auth.users')
    ) AS t(sig, md5, mark)
  LOOP
    PERFORM 1 FROM pg_proc p
     WHERE p.oid = r.sig::regprocedure AND (md5(p.prosrc) = r.md5 OR strpos(p.prosrc, r.mark) > 0);
    IF NOT FOUND THEN
      RAISE EXCEPTION '% changed in production since this migration was written', r.sig;
    END IF;
  END LOOP;
END
$guard$;

-- ── 1. What a profile change keeps ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.att_profile_changes(p_staff uuid, p_detail jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_labels CONSTANT jsonb := '{"contact_number": "Phone", "email": "Email", "address": "Address",
    "emergency_contact_name": "Emergency contact", "emergency_contact_phone": "Emergency phone",
    "emergency_contact_relationship": "Emergency relationship", "bank_name": "Bank", "bank_account_no": "Bank account"}';
  v_rec  jsonb;
  v_c    jsonb;
  v_key  text;
  v_to   text;
  v_from text;
  v_seen text[] := '{}';
  v_out  jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_detail -> 'changes') IS DISTINCT FROM 'array' OR jsonb_array_length(p_detail -> 'changes') = 0 THEN
    RAISE EXCEPTION 'Name at least one field to change.' USING ERRCODE = '22023';
  END IF;
  SELECT to_jsonb(s) INTO v_rec FROM public.hr_staff_costs s WHERE s.id = p_staff;
  FOR v_c IN SELECT e FROM jsonb_array_elements(p_detail -> 'changes') e LOOP
    v_key := v_c ->> 'key';
    IF v_key IS NULL OR NOT (v_labels ? v_key) THEN
      RAISE EXCEPTION 'That field is not changed by request.' USING ERRCODE = '22023';
    END IF;
    IF v_key = ANY (v_seen) THEN
      RAISE EXCEPTION 'A field is named twice.' USING ERRCODE = '22023';
    END IF;
    v_seen := v_seen || v_key;
    v_to := nullif(btrim(coalesce(v_c ->> 'to', '')), '');
    IF v_key = 'email' THEN
      v_to := lower(v_to);
      IF (v_rec ->> 'user_id') IS NOT NULL AND v_to IS NULL THEN
        RAISE EXCEPTION 'Their login needs an email — name the new one.' USING ERRCODE = '22023';
      END IF;
      IF (v_rec ->> 'user_id') IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.users u WHERE lower(u.email) = v_to AND u.id <> (v_rec ->> 'user_id')::uuid) THEN
        RAISE EXCEPTION 'That email already belongs to another login.' USING ERRCODE = '22023';
      END IF;
    END IF;
    IF v_key = 'bank_account_no' AND v_to IS NOT NULL THEN
      v_to := regexp_replace(v_to, '[[:space:]-]', '', 'g');
      IF v_to !~ '^[0-9]{5,20}$' THEN
        RAISE EXCEPTION 'An account number is 5 to 20 digits.' USING ERRCODE = '22023';
      END IF;
    ELSIF v_key IN ('contact_number', 'emergency_contact_phone') AND v_to IS NOT NULL
          AND (char_length(v_to) > 30 OR v_to !~ '^[0-9+() -]+$') THEN
      RAISE EXCEPTION 'Enter a phone number like 012-338 4127.' USING ERRCODE = '22023';
    ELSIF v_key = 'email' AND v_to IS NOT NULL AND v_to !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN
      RAISE EXCEPTION 'Enter an email address like name@houzs.my.' USING ERRCODE = '22023';
    ELSIF char_length(coalesce(v_to, '')) > 300 THEN
      RAISE EXCEPTION 'That is too long — at most 300 characters.' USING ERRCODE = '22023';
    END IF;
    v_from := nullif(btrim(coalesce(v_rec ->> v_key, '')), '');
    CONTINUE WHEN v_from IS NOT DISTINCT FROM v_to;
    v_out := v_out || jsonb_build_array(jsonb_build_object('key', v_key, 'field', v_labels ->> v_key, 'from', v_from, 'to', v_to));
  END LOOP;
  IF jsonb_array_length(v_out) = 0 THEN
    RAISE EXCEPTION 'Nothing to change — the record already says that.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_set(p_detail, '{changes}', v_out);
END
$function$;

-- ── 2. HR's last approval writes it ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.att_profile_apply(p_request uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_r    public.att_requests%ROWTYPE;
  v_set  jsonb;
  v_sql  text;
  v_user uuid;
  v_mail text;
BEGIN
  SELECT * INTO v_r FROM public.att_requests WHERE id = p_request AND kind = 'profile';
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT jsonb_object_agg(c ->> 'key', c -> 'to') INTO v_set
    FROM jsonb_array_elements(coalesce(v_r.detail -> 'changes', '[]'::jsonb)) c
   WHERE c ->> 'key' IN ('contact_number', 'email', 'address', 'emergency_contact_name', 'emergency_contact_phone',
                         'emergency_contact_relationship', 'bank_name', 'bank_account_no');
  IF v_set IS NULL THEN
    RETURN;
  END IF;
  SELECT s.user_id INTO v_user FROM public.hr_staff_costs s WHERE s.id = v_r.staff_id;
  IF v_set ? 'email' AND v_user IS NOT NULL THEN
    v_mail := lower(v_set ->> 'email');
    IF v_mail IS NULL OR v_mail IS DISTINCT FROM (SELECT lower(a.email) FROM auth.users a WHERE a.id = v_user) THEN
      RAISE EXCEPTION 'Their email is the one they sign in with — approve it on HR › Attendance › Requests, which moves their login too.'
        USING ERRCODE = '42501';
    END IF;
    UPDATE public.users SET email = v_mail, updated_at = now() WHERE id = v_user;
    v_set := jsonb_set(v_set, '{email}', to_jsonb(v_mail));
  END IF;
  SELECT string_agg(format('%I = $2 ->> %L', k, k), ', ') INTO v_sql FROM jsonb_object_keys(v_set) k;
  EXECUTE format('UPDATE public.hr_staff_costs SET %s WHERE id = $1', v_sql) USING v_r.staff_id, v_set;
  PERFORM public.att_event('request', p_request::text, v_r.staff_id, 'Record updated',
    (SELECT string_agg(c ->> 'field', ' · ') FROM jsonb_array_elements(v_r.detail -> 'changes') c));
END
$function$;

-- ── 3. What Approve must do first ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.att_login_email_change(p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_r    public.att_requests%ROWTYPE;
  v_st   public.att_request_steps%ROWTYPE;
  v_to   text;
  v_user uuid;
BEGIN
  SELECT * INTO v_r FROM public.att_requests WHERE id = p_request;
  IF NOT FOUND OR v_r.status <> 'pending' OR v_r.kind <> 'profile' THEN
    RETURN NULL;
  END IF;
  SELECT lower(c ->> 'to') INTO v_to FROM jsonb_array_elements(coalesce(v_r.detail -> 'changes', '[]'::jsonb)) c
   WHERE c ->> 'key' = 'email';
  SELECT s.user_id INTO v_user FROM public.hr_staff_costs s WHERE s.id = v_r.staff_id;
  IF v_to IS NULL OR v_user IS NULL THEN
    RETURN NULL;
  END IF;
  -- HR's step, and the last: the approval that writes the record.
  SELECT * INTO v_st FROM public.att_request_steps WHERE request_id = p_request AND state = 'waiting' ORDER BY seq LIMIT 1;
  IF NOT FOUND OR v_st.role <> 'hr'
     OR EXISTS (SELECT 1 FROM public.att_request_steps WHERE request_id = p_request AND state = 'queued') THEN
    RETURN NULL;
  END IF;
  IF v_r.staff_id IS NOT DISTINCT FROM public.att_my_staff_id() THEN
    RAISE EXCEPTION 'Nobody decides their own request.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_action(ARRAY['attendance.approve']) THEN
    RAISE EXCEPTION 'Deciding a request needs Attendance · Approve.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('user_id', v_user, 'from', (SELECT a.email FROM auth.users a WHERE a.id = v_user), 'to', v_to);
END
$function$;

-- ── 4. One's own request ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.request_my_email_change(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_staff uuid := public.att_my_staff_id();
BEGIN
  IF v_staff IS NULL THEN
    RAISE EXCEPTION 'Only somebody on the staff list, signed in with a login of their own, can ask for this.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.att_requests r
     WHERE r.staff_id = v_staff AND r.kind = 'profile' AND r.status = 'pending'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(r.detail -> 'changes', '[]'::jsonb)) c WHERE c ->> 'key' = 'email')) THEN
    RAISE EXCEPTION 'You already asked to change your email — HR has not decided yet.' USING ERRCODE = '22023';
  END IF;
  RETURN public.att_create_request(v_staff, 'profile', NULL, NULL, NULL, NULL, NULL,
    jsonb_build_object('changes', jsonb_build_array(jsonb_build_object('key', 'email', 'to', p_email))),
    'Request to change email', false);
END
$function$;

-- ── 5. One's own latest ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.my_email_change()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_staff uuid := public.att_my_staff_id();
  v_out   jsonb;
BEGIN
  IF v_staff IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT jsonb_build_object(
           'id', r.id, 'ref', r.ref, 'status', r.status, 'to', e.c ->> 'to', 'from', e.c ->> 'from',
           'at', r.sent_at, 'decidedAt', r.decided_at,
           'note', (SELECT nullif(st.note, '') FROM public.att_request_steps st
                     WHERE st.request_id = r.id AND st.state = 'rejected' ORDER BY st.seq DESC LIMIT 1))
    INTO v_out
    FROM public.att_requests r
    CROSS JOIN LATERAL (SELECT c FROM jsonb_array_elements(coalesce(r.detail -> 'changes', '[]'::jsonb)) c
                         WHERE c ->> 'key' = 'email' LIMIT 1) e
   WHERE r.staff_id = v_staff AND r.kind = 'profile'
   ORDER BY r.sent_at DESC
   LIMIT 1;
  RETURN v_out;
END
$function$;

-- Who may call them: a sign-in (each asks who the caller is); the anon key never.
REVOKE ALL ON FUNCTION public.att_login_email_change(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_my_email_change(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_email_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.att_login_email_change(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_my_email_change(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_email_change() TO authenticated;
