-- ============================================================================
-- 20260101000054_period_closing.sql
-- Period closing (月结/年结) — lock completed periods from new transactions
-- HOUZS Venture Portal — Phase 4 Step 8
--
-- Design:
--   - period_locks: one row per closed period (month)
--   - Closing is Principal-only
--   - Closed periods block new repayments, vouchers, journal entries
--   - Reopening requires Principal (for correction)
-- ============================================================================

CREATE TABLE period_locks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_month DATE NOT NULL UNIQUE,
    closed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_by   UUID NOT NULL REFERENCES users(id),
    reopened_at TIMESTAMPTZ,
    reopened_by UUID REFERENCES users(id),
    notes       TEXT,
    is_locked   BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT period_is_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1)
);

COMMENT ON TABLE period_locks IS
    'Phase 4: period closing. Locked periods cannot accept new transactions (repayments, vouchers, journal entries).';

-- RLS
ALTER TABLE period_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY pl_select ON period_locks
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));
CREATE POLICY pl_insert ON period_locks
    FOR INSERT WITH CHECK (current_user_role() = 'principal');
CREATE POLICY pl_update ON period_locks
    FOR UPDATE USING (current_user_role() = 'principal');
CREATE POLICY pl_no_delete ON period_locks
    FOR DELETE USING (FALSE);

-- Index
CREATE INDEX idx_period_locks_month ON period_locks(period_month) WHERE is_locked = TRUE;

-- Helper function to check if a period is locked
CREATE OR REPLACE FUNCTION is_period_locked(p_date DATE)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM period_locks
        WHERE period_month = DATE_TRUNC('month', p_date)::DATE
          AND is_locked = TRUE
    );
$$;

COMMENT ON FUNCTION is_period_locked IS
    'Returns TRUE if the month containing p_date is closed. Used by Server Actions to block transactions in locked periods.';
