-- ============================================================================
-- 20260101000035_access_audit_log.sql
-- Read-access audit log for sensitive data (director payouts, HR staff costs)
-- HOUZS Venture Portal (VP)
--
-- Tracks who viewed sensitive salary/director data at the application level.
-- Postgres doesn't support SELECT triggers, so logging happens in Server
-- Components when pages render sensitive data.
--
-- LHDN + internal governance compliance requirement (TODOS.md).
-- ============================================================================

CREATE TABLE access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    user_email TEXT,
    user_role user_role,
    resource_type TEXT NOT NULL,          -- 'director_payouts', 'hr_staff_costs', 'director_salary_print', etc.
    resource_id TEXT,                      -- optional specific record ID
    action TEXT NOT NULL DEFAULT 'view',   -- 'view', 'export', 'print'
    metadata JSONB DEFAULT '{}'::jsonb,    -- extra context (period, company, etc.)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_access_log_user ON access_log(user_id);
CREATE INDEX idx_access_log_resource ON access_log(resource_type);
CREATE INDEX idx_access_log_created ON access_log(created_at DESC);

COMMENT ON TABLE access_log IS
    'Application-level read-access audit for sensitive data. Logged from Server Components / Actions when sensitive pages are rendered.';

-- RLS: Principal can read all; others can only see own entries
ALTER TABLE access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY access_log_principal_select ON access_log
    FOR SELECT USING (current_user_role() = 'principal');

CREATE POLICY access_log_self_select ON access_log
    FOR SELECT USING (user_id = auth.uid());

-- Any authenticated user can insert (logging their own access)
CREATE POLICY access_log_insert ON access_log
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Helper RPC for logging access (called from Server Components)
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
AS $$
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
END;
$$;

COMMENT ON FUNCTION log_data_access(TEXT, TEXT, TEXT, JSONB) IS
    'Logs a data access event. Called from Server Components when sensitive pages are rendered. Non-blocking — caller should fire-and-forget.';

GRANT EXECUTE ON FUNCTION log_data_access(TEXT, TEXT, TEXT, JSONB) TO authenticated;
