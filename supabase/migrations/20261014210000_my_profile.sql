-- Edit profile (2026-10-14, the Finance revamp v2 — the account menu at the foot of Finance's sidebar:
-- "Edit profile · Shown on vouchers you create"). The user's call: build it for a PERSONAL login only, as
-- Change password (2026-10-12) — a login a People record names (`my_login_is_personal()`); the shared
-- accounts (principal@, finance@, hr@, marketing@) never see it. The name and the phone change; the email
-- is the sign-in and only shows.
--
-- The name is the login's own (`users.name`) — the one a voucher, an approval and the audit trail print
-- for whoever made them. The person's legal name on the roster (`hr_staff_costs.employee_name`) is HR's
-- and stays. The phone is the People record's contact number.
--
-- SECURITY DEFINER because the roster opens only to HR (and a Finance payroll title, its own department):
-- a Finance or Revenue member login cannot read or write its own row through RLS. Both functions answer
-- for the caller's own uid and nothing else; no argument names a person. Both audit as the caller (the
-- audit trigger reads auth.uid()).

CREATE OR REPLACE FUNCTION public.my_profile()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_email text;
  v_phone text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501';
  END IF;
  SELECT u.name, u.email INTO v_name, v_email
    FROM public.users u
   WHERE u.id = v_uid AND u.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sign in with an active work account.' USING ERRCODE = '42501';
  END IF;
  SELECT s.contact_number INTO v_phone
    FROM public.hr_staff_costs s
   WHERE s.user_id = v_uid
   ORDER BY s.created_at
   LIMIT 1;
  RETURN jsonb_build_object('name', v_name, 'email', v_email, 'phone', v_phone, 'personal', public.my_login_is_personal());
END
$fn$;

CREATE OR REPLACE FUNCTION public.update_my_profile(p_name text, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_uid AND u.is_active) THEN
    RAISE EXCEPTION 'Sign in with an active work account.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.my_login_is_personal() THEN
    RAISE EXCEPTION 'This is a shared login, so its profile is not changed here. Edit profile is for a login of your own.' USING ERRCODE = '42501';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'Enter your full name.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'Your name is too long — at most 80 characters.' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NOT NULL AND (char_length(v_phone) > 30 OR v_phone !~ '^[0-9+() -]+$') THEN
    RAISE EXCEPTION 'Enter a phone number like 012-338 4127.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.users SET name = v_name WHERE id = v_uid AND name IS DISTINCT FROM v_name;
  UPDATE public.hr_staff_costs SET contact_number = v_phone WHERE user_id = v_uid AND contact_number IS DISTINCT FROM v_phone;
  RETURN public.my_profile();
END
$fn$;

REVOKE ALL ON FUNCTION public.my_profile() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_my_profile(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_profile() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.my_profile() IS
  'The caller''s own name, email, phone and whether the login is a person''s own — Edit profile in Finance''s account menu (2026-10-14).';
COMMENT ON FUNCTION public.update_my_profile(text, text) IS
  'A personal login changes its own name (users.name) and phone (its People record''s contact_number); the email is the sign-in and stays (2026-10-14).';

NOTIFY pgrst, 'reload schema';
