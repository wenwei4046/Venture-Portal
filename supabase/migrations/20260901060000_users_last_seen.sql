-- ═══════════════════════════════════════════════════════════════════════
-- users.last_seen_at — what the People roster's "Last seen" column reads
--
-- The roster spent its widest column printing an email address to answer a
-- yes/no: can this person sign in. That answer moves onto the monogram (a
-- tinted tile means there is a login), which frees the column for the question
-- worth asking — is the login still in use.
--
-- Where the number comes from was the real decision. `auth.users.last_sign_in_at`
-- needs the service role, and `access_log` is Principal-or-self under its own
-- RLS, so an HR reader would have seen every cell blank. One column on
-- public.users is readable by exactly the people who can already read the
-- roster, and it is written by the RPC the page-view logger already calls on
-- every navigation.
--
-- "Last seen", not "last login", because that is the question behind revoking
-- an account: not when they got in, but whether anybody is still using it.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN users.last_seen_at IS
    'Last time this account was seen using the portal — any logged page view or privileged read. Written by log_data_access(), throttled to one write per five minutes.';

-- Seed it from the history already in access_log, so the column arrives
-- populated rather than empty for everybody who has used the portal.
UPDATE users u
   SET last_seen_at = a.seen
  FROM (
        SELECT user_id, MAX(created_at) AS seen
          FROM access_log
         WHERE user_id IS NOT NULL
         GROUP BY user_id
       ) a
 WHERE u.id = a.user_id
   AND u.last_seen_at IS NULL;

-- The write path: the same SECURITY DEFINER RPC that has recorded access since
-- Phase 1 and that the portal shell fires once per navigation. Body unchanged
-- apart from the stamp at the end.
CREATE OR REPLACE FUNCTION log_data_access(
    p_resource_type TEXT,
    p_resource_id TEXT DEFAULT NULL,
    p_action TEXT DEFAULT 'view',
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_user_id UUID;
    v_email TEXT;
    v_role user_role;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RETURN; END IF;

    SELECT email, role INTO v_email, v_role
    FROM users WHERE id = v_user_id;

    INSERT INTO access_log (user_id, user_email, user_role, resource_type, resource_id, action, metadata)
    VALUES (v_user_id, v_email, v_role, p_resource_type, p_resource_id, p_action, p_metadata);

    -- Throttled to five minutes: the column is read as "2h ago", never to the
    -- second, so there is no reason to turn every page view into a row update.
    UPDATE users
       SET last_seen_at = now()
     WHERE id = v_user_id
       AND (last_seen_at IS NULL OR last_seen_at < now() - INTERVAL '5 minutes');
END;
$fn$;

COMMENT ON FUNCTION log_data_access(TEXT, TEXT, TEXT, JSONB) IS
    'Logs a data access event and stamps users.last_seen_at (throttled to five minutes). Called from Server Components when sensitive pages render, and once per navigation by the portal shell. Non-blocking — caller should fire-and-forget.';

GRANT EXECUTE ON FUNCTION log_data_access(TEXT, TEXT, TEXT, JSONB) TO authenticated;
