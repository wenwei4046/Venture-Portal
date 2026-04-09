-- ============================================================================
-- 20260101000009_settings.sql
-- Settings tables: treasury_config, tier_config, overdue_config
-- HOUZS Venture Portal (VP)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE: treasury_config
-- Generic key-value config for treasury-related settings
-- Keys: 'op_margin', 'buffer_amount', 'saving_rate'
-- ----------------------------------------------------------------------------

CREATE TABLE treasury_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key VARCHAR(50) UNIQUE NOT NULL,
    config_value DECIMAL(15, 6) NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE treasury_config IS
    'Key-value treasury configuration. Principal writes, Principal+Finance read.';
COMMENT ON COLUMN treasury_config.config_key IS
    'Typed keys: op_margin (decimal), buffer_amount (RM), saving_rate (decimal)';

-- ----------------------------------------------------------------------------
-- TABLE: tier_config
-- Loan risk premium per tier (T1-T4)
-- ----------------------------------------------------------------------------

CREATE TABLE tier_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier company_tier UNIQUE NOT NULL,
    premium_rate DECIMAL(7, 6) NOT NULL,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT premium_rate_valid CHECK (premium_rate >= 0 AND premium_rate < 1)
);

COMMENT ON TABLE tier_config IS
    'Risk premium per company tier. T1=0%, T2=0.5%, T3=1.0%, T4=1.5% (defaults).';

-- ----------------------------------------------------------------------------
-- TABLE: overdue_config
-- Overdue stage definitions + penalty rates
-- ----------------------------------------------------------------------------

CREATE TABLE overdue_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage overdue_stage UNIQUE NOT NULL,
    days_from INTEGER NOT NULL,
    days_to INTEGER,  -- NULL for escalation (no upper bound)
    penalty_rate DECIMAL(7, 6) NOT NULL,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT days_valid CHECK (days_from >= 0),
    CONSTRAINT days_range_valid CHECK (days_to IS NULL OR days_to >= days_from),
    CONSTRAINT penalty_rate_valid CHECK (penalty_rate >= 0 AND penalty_rate < 1)
);

COMMENT ON TABLE overdue_config IS
    'Overdue stage thresholds and penalty rates. Defaults: grace 0-7/0%, late_1 8-30/0.5%, late_2 31-60/1.0%, escalation 60+/1.5%.';
