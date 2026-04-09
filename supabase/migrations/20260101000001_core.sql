-- ============================================================================
-- 20260101000001_core.sql
-- Core tables: users, companies, departments, approval_requests
-- Phase 1 | HOUZS Venture Portal (VP)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMS (core)
-- ----------------------------------------------------------------------------

CREATE TYPE user_role AS ENUM ('principal', 'finance', 'hr', 'dept_manager');

CREATE TYPE company_tier AS ENUM ('T1', 'T2', 'T3', 'T4');

CREATE TYPE approval_request_type AS ENUM (
    'new_loan',
    'base_rate',
    'tier_change',
    'new_contract',
    'contract_change',
    'dept_expense',
    'advance',
    'escalation',
    'invoice_pool_release',
    'profit_withdrawal'
);

CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');

-- Workflow state extension (per /autoplan user challenge C3)
CREATE TYPE approval_workflow_state AS ENUM (
    'submitted',
    'under_review',
    'needs_info',
    'delegated',
    'approved',
    'rejected',
    'expired'
);

-- ----------------------------------------------------------------------------
-- TABLE: departments
-- ----------------------------------------------------------------------------

CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE departments IS 'Organizational departments: Marketing, Finance, HR';

-- ----------------------------------------------------------------------------
-- TABLE: companies
-- ----------------------------------------------------------------------------

CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    short_code VARCHAR(10) UNIQUE NOT NULL,
    tier company_tier NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE companies IS 'HOUZS subsidiaries (HC, CONTS, DC, CAR, HK, 2990, OHN, CMI)';

-- ----------------------------------------------------------------------------
-- TABLE: users
-- Links to Supabase auth.users. Role + department_id drive RLS.
-- ----------------------------------------------------------------------------

CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role user_role NOT NULL,
    department_id UUID REFERENCES departments(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- dept_manager MUST have a department assigned
    CONSTRAINT dept_manager_has_department
        CHECK (role <> 'dept_manager' OR department_id IS NOT NULL)
);

COMMENT ON TABLE users IS 'App user profile. Linked to Supabase auth.users via id.';
COMMENT ON CONSTRAINT dept_manager_has_department ON users IS
    'Dept Manager role requires a department assignment (see access-matrix.md)';

-- ----------------------------------------------------------------------------
-- TABLE: approval_requests
-- Extended with workflow state per /autoplan user challenge C3:
--   - workflow_state: rich state machine beyond pending/approved/rejected
--   - assigned_to: delegation target (Principal can delegate while away)
--   - due_at: SLA tracking
--   - escalation_chain: JSONB array of escalation targets
-- ----------------------------------------------------------------------------

CREATE TABLE approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_type approval_request_type NOT NULL,
    reference_id UUID NOT NULL,
    reference_table TEXT NOT NULL,
    submitted_by UUID NOT NULL REFERENCES users(id),
    description TEXT,
    amount DECIMAL(15, 2),
    status approval_status NOT NULL DEFAULT 'pending',
    workflow_state approval_workflow_state NOT NULL DEFAULT 'submitted',
    assigned_to UUID REFERENCES users(id),
    due_at TIMESTAMPTZ,
    escalation_chain JSONB DEFAULT '[]'::jsonb,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    notes TEXT,
    version INTEGER NOT NULL DEFAULT 1,  -- optimistic locking
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Security: cannot self-approve (per /autoplan CEO Sec 3.2)
    CONSTRAINT no_self_approval
        CHECK (approved_by IS NULL OR approved_by <> submitted_by),

    -- If approved, must have approved_by and approved_at
    CONSTRAINT approved_has_metadata
        CHECK (
            status <> 'approved'
            OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
        )
);

COMMENT ON TABLE approval_requests IS
    'Cross-cutting approval queue. All modules submit here; Principal approves.';
COMMENT ON COLUMN approval_requests.workflow_state IS
    'Rich workflow state: submitted → under_review → (needs_info | approved | rejected | delegated)';
COMMENT ON COLUMN approval_requests.assigned_to IS
    'Who is currently responsible. NULL = Principal by default; can be delegated.';
COMMENT ON COLUMN approval_requests.due_at IS
    'SLA deadline for this approval. Used for escalation and notifications.';
COMMENT ON COLUMN approval_requests.escalation_chain IS
    'JSONB array of escalation targets if due_at is missed.';
COMMENT ON CONSTRAINT no_self_approval ON approval_requests IS
    'Security: submitter cannot be the approver (prevents self-approval exploit)';
