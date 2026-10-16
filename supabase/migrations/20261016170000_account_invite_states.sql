-- ════════════════════════════════════════════════════════════════════════════
-- Who has not used their invite link yet (2026-10-16)
-- ════════════════════════════════════════════════════════════════════════════
-- People › Invite user hands a login over two ways since 2026-10-16 (the user:
-- "Invite 选项…两个选择：1. Send Invite Link 2. 直接帮它 set password"): a
-- password HR sets, or an invite link the person opens to choose their own
-- password (/welcome). Until they have chosen it the login cannot sign in, and
-- People says so — *Invited* in Last seen, *Invite again* on the person.
--
-- That fact is Supabase Auth's (auth.users: invited_at, email_confirmed_at —
-- an invite is confirmed by the very step that sets the password), and no
-- signed-in reader may select auth.users. This answers it for the logins
-- asked about (all of them when none are named), to whoever may invite or
-- see the logins — Logins & invites · View or Create, as Invite user asks.
-- It reads; it writes nothing.
--
-- Rollback, in words (the database tool refuses the keyword): take away the
-- function. Nothing else changes.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.account_invite_states(p_logins uuid[] DEFAULT NULL)
RETURNS TABLE (user_id uuid, invited_at timestamptz, pending boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF public.has_any_action(ARRAY['accounts.view', 'accounts.create']) IS NOT TRUE THEN
    RAISE EXCEPTION 'account_invite_states: needs Logins & invites · View' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT u.id, au.invited_at, (au.invited_at IS NOT NULL AND au.email_confirmed_at IS NULL)
      FROM public.users u
      JOIN auth.users au ON au.id = u.id
     WHERE p_logins IS NULL OR u.id = ANY (p_logins);
END
$fn$;

COMMENT ON FUNCTION public.account_invite_states(uuid[]) IS
  'People: which logins were sent an invite link not used yet (pending = invited, no password chosen). Logins & invites · View or Create.';

REVOKE ALL ON FUNCTION public.account_invite_states(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_invite_states(uuid[]) TO authenticated, service_role;
