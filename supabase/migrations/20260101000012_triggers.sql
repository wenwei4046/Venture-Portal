-- ============================================================================
-- 20260101000012_triggers.sql
-- Triggers: updated_at auto-update, loan status transitions, repayment blockers
-- HOUZS Venture Portal (VP)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Generic updated_at trigger function
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION set_updated_at() IS 'Generic trigger to auto-update updated_at column on row modification.';

-- Apply to all tables with updated_at column
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_approval_requests_updated_at BEFORE UPDATE ON approval_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_fund_sources_updated_at BEFORE UPDATE ON fund_sources
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_loans_updated_at BEFORE UPDATE ON loans
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_monthly_statements_updated_at BEFORE UPDATE ON monthly_statements
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_service_contracts_updated_at BEFORE UPDATE ON service_contracts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_directors_updated_at BEFORE UPDATE ON directors
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_hr_staff_costs_updated_at BEFORE UPDATE ON hr_staff_costs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_treasury_config_updated_at BEFORE UPDATE ON treasury_config
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tier_config_updated_at BEFORE UPDATE ON tier_config
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_overdue_config_updated_at BEFORE UPDATE ON overdue_config
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- Version auto-increment trigger (for optimistic locking)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION bump_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION bump_version() IS
    'Auto-increment version column for optimistic locking. Application MUST include version in WHERE clause.';

CREATE TRIGGER trg_loans_bump_version BEFORE UPDATE ON loans
    FOR EACH ROW WHEN (OLD.version = NEW.version) EXECUTE FUNCTION bump_version();

CREATE TRIGGER trg_fund_sources_bump_version BEFORE UPDATE ON fund_sources
    FOR EACH ROW WHEN (OLD.version = NEW.version) EXECUTE FUNCTION bump_version();

CREATE TRIGGER trg_approval_requests_bump_version BEFORE UPDATE ON approval_requests
    FOR EACH ROW WHEN (OLD.version = NEW.version) EXECUTE FUNCTION bump_version();

CREATE TRIGGER trg_base_rate_history_bump_version BEFORE UPDATE ON base_rate_history
    FOR EACH ROW WHEN (OLD.version = NEW.version) EXECUTE FUNCTION bump_version();

CREATE TRIGGER trg_monthly_statements_bump_version BEFORE UPDATE ON monthly_statements
    FOR EACH ROW WHEN (OLD.version = NEW.version) EXECUTE FUNCTION bump_version();

-- ----------------------------------------------------------------------------
-- Loan status auto-transition to fully_repaid
-- Fires AFTER INSERT on repayments. Computes outstanding and updates loan status.
-- (per /autoplan Eng 2.4)
-- ----------------------------------------------------------------------------

-- SECURITY DEFINER required: Finance inserts repayments but RLS blocks them
-- from UPDATE on loans (Principal-only). The trigger runs as the function owner
-- (migration runner = admin with BYPASSRLS) to allow the status transition.
CREATE OR REPLACE FUNCTION check_loan_fully_repaid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_outstanding DECIMAL(15, 2);
    v_current_status loan_status;
BEGIN
    -- Only react to principal repayments
    IF NEW.payment_type <> 'principal' THEN
        RETURN NEW;
    END IF;

    -- Compute new outstanding
    SELECT l.principal - COALESCE(SUM(r.amount) FILTER (WHERE r.payment_type = 'principal'), 0),
           l.status
    INTO v_outstanding, v_current_status
    FROM loans l
    LEFT JOIN repayments r ON r.loan_id = l.id
    WHERE l.id = NEW.loan_id
    GROUP BY l.id, l.principal, l.status;

    -- If outstanding reached zero (or less, safety), mark as fully_repaid
    IF v_outstanding <= 0 AND v_current_status = 'active' THEN
        UPDATE loans
        SET status = 'fully_repaid',
            updated_at = NOW()
        WHERE id = NEW.loan_id;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION check_loan_fully_repaid() IS
    'Auto-transition loan to fully_repaid when outstanding reaches zero. SECURITY DEFINER to bypass Finance RLS on loans UPDATE.';

CREATE TRIGGER trg_loan_auto_repaid AFTER INSERT ON repayments
    FOR EACH ROW EXECUTE FUNCTION check_loan_fully_repaid();

-- ----------------------------------------------------------------------------
-- Repayment blocker for fully_repaid or cancelled loans
-- (per /autoplan Eng 2.4)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION block_repayment_on_inactive_loan()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_status loan_status;
BEGIN
    SELECT status INTO v_status FROM loans WHERE id = NEW.loan_id;

    IF v_status NOT IN ('active') THEN
        RAISE EXCEPTION 'Cannot record repayment on loan with status %. Loan must be active.', v_status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION block_repayment_on_inactive_loan() IS
    'Blocks repayments on fully_repaid, cancelled, or pending_approval loans. Data integrity guard.';

CREATE TRIGGER trg_block_repayment_inactive BEFORE INSERT ON repayments
    FOR EACH ROW EXECUTE FUNCTION block_repayment_on_inactive_loan();

-- ----------------------------------------------------------------------------
-- Fund source auto-maturity
-- When effective_date + lock_in_months passes, mark as matured.
-- This is computed at query time; we add a helper function for manual trigger.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION mark_matured_fund_sources()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE fund_sources
    SET status = 'matured',
        updated_at = NOW()
    WHERE status = 'active'
      AND maturity_date IS NOT NULL
      AND maturity_date <= CURRENT_DATE;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION mark_matured_fund_sources() IS
    'Manual function to mark fund sources as matured after their lock-in period. Call from cron or button.';

-- ----------------------------------------------------------------------------
-- Auto-compute total_ctc on director_ctc insert/update
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION compute_director_ctc_total()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.total_ctc = NEW.basic + NEW.kpi + NEW.allowance
                    + COALESCE(NEW.employer_epf, 0)
                    + COALESCE(NEW.employer_socso, 0)
                    + COALESCE(NEW.employer_eis, 0);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_director_ctc_total BEFORE INSERT OR UPDATE ON director_ctc
    FOR EACH ROW EXECUTE FUNCTION compute_director_ctc_total();

-- ----------------------------------------------------------------------------
-- Maturity date auto-compute on fund source insert
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_fund_source_maturity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.lock_in_months IS NOT NULL AND NEW.maturity_date IS NULL THEN
        NEW.maturity_date = NEW.effective_date + (NEW.lock_in_months || ' months')::INTERVAL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_fund_source_maturity BEFORE INSERT ON fund_sources
    FOR EACH ROW EXECUTE FUNCTION set_fund_source_maturity();

-- ----------------------------------------------------------------------------
-- Statement totals recompute trigger
-- When lines change, recompute parent statement totals.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION recompute_statement_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_statement_id UUID;
BEGIN
    v_statement_id := COALESCE(NEW.statement_id, OLD.statement_id);

    UPDATE monthly_statements ms
    SET
        total_invoice = COALESCE((
            SELECT SUM(amount) FROM monthly_statement_lines
            WHERE statement_id = v_statement_id AND line_type = 'invoice'
        ), 0),
        total_contra = COALESCE((
            SELECT SUM(amount) FROM monthly_statement_lines
            WHERE statement_id = v_statement_id AND line_type = 'contra'
        ), 0),
        net_amount = COALESCE((
            SELECT SUM(amount) FROM monthly_statement_lines
            WHERE statement_id = v_statement_id AND line_type = 'invoice'
        ), 0) - COALESCE((
            SELECT SUM(amount) FROM monthly_statement_lines
            WHERE statement_id = v_statement_id AND line_type = 'contra'
        ), 0),
        updated_at = NOW()
    WHERE ms.id = v_statement_id;

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_statement_lines_recompute
    AFTER INSERT OR UPDATE OR DELETE ON monthly_statement_lines
    FOR EACH ROW EXECUTE FUNCTION recompute_statement_totals();

COMMENT ON FUNCTION recompute_statement_totals() IS
    'Auto-recompute monthly_statements totals when lines change. Keeps totals consistent.';
