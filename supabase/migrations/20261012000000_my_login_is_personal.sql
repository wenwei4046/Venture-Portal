-- Change password, for a PERSONAL login only (2026-10-12 — the user: "i want every user, have a change
-- password function … in their profile tab. or admin category"; then, told that principal@, finance@
-- and hr@ are shared by several people at the office: "just for that personal acc").
--
-- A personal login is one a person on the People roster holds: `hr_staff_costs.user_id` names it —
-- every login People › Invite user makes is attached to its person there. The shared accounts
-- (principal@, finance@, hr@, marketing@) are named by nobody's record; one person changing such a
-- password would lock out everybody else who signs in with it, on every device.
--
-- This answers, for the caller only, which kind theirs is. The app shows Change password where it
-- is true (the portal's Admin, the HR app's More, the Revenue app's Profile) and the change itself
-- asks again before the auth server is called (lib/account/actions.ts).
--
-- SECURITY DEFINER because `hr_staff_costs` opens only to HR (and a Finance payroll title, its own
-- department): a Finance or Revenue member login cannot read its own row through RLS. It reads one
-- yes / no about the caller's own uid, nothing else; no sign-in answers false. STABLE: it writes
-- nothing (and so reads while the portal is viewing as somebody — though nothing asks it then).

CREATE OR REPLACE FUNCTION public.my_login_is_personal()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.hr_staff_costs s WHERE s.user_id = auth.uid());
END
$fn$;

REVOKE ALL ON FUNCTION public.my_login_is_personal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_login_is_personal() TO authenticated, service_role;

COMMENT ON FUNCTION public.my_login_is_personal() IS
  'Is the caller''s login a person''s own (a People record names it) rather than a shared account? Change password is offered only then (2026-10-12).';

NOTIFY pgrst, 'reload schema';
