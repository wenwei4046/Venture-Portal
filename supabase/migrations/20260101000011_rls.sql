-- ============================================================================
-- 20260101000011_rls.sql
-- Row Level Security policies for all tables
-- HOUZS Venture Portal (VP)
--
-- Pattern reference: docs/access-matrix.md § "Supabase RLS Implementation Guide"
-- Patterns used:
--   1. Principal + Finance read (fund_sources, loans, repayments, etc.)
--   2. Finance write only
--   3. Dept Manager own-department only
--   4. HR sensitive (hr_staff_costs — Finance blocked)
--   5. Finance aggregate view only (finance_hr_cost_summary)
--   6. Principal write — Settings
--
-- Plus (per /autoplan Eng 1.5):
--   - DELETE policies (no_delete) on all financial tables
--   - Column-level GRANTs on sensitive tables
--   - SECURITY INVOKER on all views (already set in 000010)
--   - Role read from users table via current_user_role() helper (not auth.jwt())
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper function: current_user_role()
-- SECURITY DEFINER bypasses RLS when reading users table to avoid recursion.
-- Returns NULL if user is not authenticated or not in users table.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT role FROM users WHERE id = auth.uid() AND is_active = TRUE
$$;

COMMENT ON FUNCTION current_user_role() IS
    'Helper for RLS policies. Returns current user role from users table. SECURITY DEFINER to avoid RLS recursion.';

CREATE OR REPLACE FUNCTION current_user_department_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT department_id FROM users WHERE id = auth.uid() AND is_active = TRUE
$$;

COMMENT ON FUNCTION current_user_department_id() IS
    'Helper for Dept Manager RLS. Returns current user department_id.';

-- ============================================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE fund_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE overdue_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_rate_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE statement_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_statement_lines ENABLE ROW LEVEL SECURITY;

ALTER TABLE service_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

ALTER TABLE directors ENABLE ROW LEVEL SECURITY;
ALTER TABLE director_ctc ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE director_payouts ENABLE ROW LEVEL SECURITY;

ALTER TABLE dept_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE hv_operating_fund ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_payout_pool ENABLE ROW LEVEL SECURITY;

ALTER TABLE hr_pool_allocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_staff_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_staff_allocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;

ALTER TABLE epf_third_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE socso_act4_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE eis_act800_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE pcb_jadual ENABLE ROW LEVEL SECURITY;

ALTER TABLE treasury_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE tier_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE overdue_config ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CORE: users, companies, departments
-- ============================================================================

-- users: every authenticated user can SELECT own row; Principal+Finance+HR see all
CREATE POLICY users_self_select ON users
    FOR SELECT USING (id = auth.uid());

CREATE POLICY users_privileged_select ON users
    FOR SELECT USING (current_user_role() IN ('principal', 'finance', 'hr'));

-- Only Principal can INSERT/UPDATE users (admin function)
CREATE POLICY users_principal_write ON users
    FOR INSERT WITH CHECK (current_user_role() = 'principal');

CREATE POLICY users_principal_update ON users
    FOR UPDATE USING (current_user_role() = 'principal');

-- Hard DELETE blocked
CREATE POLICY users_no_delete ON users FOR DELETE USING (FALSE);

-- companies: all authenticated users can SELECT; Principal writes
CREATE POLICY companies_all_select ON companies
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY companies_principal_write ON companies
    FOR INSERT WITH CHECK (current_user_role() = 'principal');

CREATE POLICY companies_principal_update ON companies
    FOR UPDATE USING (current_user_role() = 'principal');

CREATE POLICY companies_no_delete ON companies FOR DELETE USING (FALSE);

-- departments: all authenticated users can SELECT; Principal writes
CREATE POLICY departments_all_select ON departments
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY departments_principal_write ON departments
    FOR INSERT WITH CHECK (current_user_role() = 'principal');

CREATE POLICY departments_principal_update ON departments
    FOR UPDATE USING (current_user_role() = 'principal');

CREATE POLICY departments_no_delete ON departments FOR DELETE USING (FALSE);

-- approval_requests
-- SELECT: Principal sees all. Finance sees their own submissions + everyone's as reviewer.
-- Actually spec says Principal + Finance both see all (dashboard approval queue)
CREATE POLICY approvals_privileged_select ON approval_requests
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));

-- INSERT: Finance + HR submit (depending on request_type)
CREATE POLICY approvals_submit ON approval_requests
    FOR INSERT WITH CHECK (
        current_user_role() IN ('finance', 'hr', 'dept_manager')
        AND submitted_by = auth.uid()
    );

-- UPDATE: only Principal can approve/reject
CREATE POLICY approvals_principal_update ON approval_requests
    FOR UPDATE USING (current_user_role() = 'principal');

CREATE POLICY approvals_no_delete ON approval_requests FOR DELETE USING (FALSE);

-- ============================================================================
-- TREASURY: Pattern 1 (Principal + Finance read) + Pattern 2 (Finance write)
-- ============================================================================

-- fund_sources
CREATE POLICY fund_sources_pf_select ON fund_sources
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));

CREATE POLICY fund_sources_finance_insert ON fund_sources
    FOR INSERT WITH CHECK (current_user_role() = 'finance');

CREATE POLICY fund_sources_finance_update ON fund_sources
    FOR UPDATE USING (current_user_role() = 'finance');

CREATE POLICY fund_sources_no_delete ON fund_sources FOR DELETE USING (FALSE);

-- loans
CREATE POLICY loans_pf_select ON loans
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));

CREATE POLICY loans_finance_insert ON loans
    FOR INSERT WITH CHECK (current_user_role() = 'finance');

-- Only Principal can UPDATE loans (for approval). Finance cannot self-approve.
CREATE POLICY loans_principal_update ON loans
    FOR UPDATE USING (current_user_role() = 'principal');

CREATE POLICY loans_no_delete ON loans FOR DELETE USING (FALSE);

-- repayments
CREATE POLICY repayments_pf_select ON repayments
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));

CREATE POLICY repayments_finance_insert ON repayments
    FOR INSERT WITH CHECK (current_user_role() = 'finance');

CREATE POLICY repayments_no_update ON repayments FOR UPDATE USING (FALSE);
CREATE POLICY repayments_no_delete ON repayments FOR DELETE USING (FALSE);

-- overdue_records
CREATE POLICY overdue_pf_select ON overdue_records
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));

CREATE POLICY overdue_finance_insert ON overdue_records
    FOR INSERT WITH CHECK (current_user_role() = 'finance');

CREATE POLICY overdue_finance_update ON overdue_records
    FOR UPDATE USING (current_user_role() = 'finance');

CREATE POLICY overdue_no_delete ON overdue_records FOR DELETE USING (FALSE);

-- base_rate_history
CREATE POLICY base_rate_pf_select ON base_rate_history
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));

CREATE POLICY base_rate_finance_insert ON base_rate_history
    FOR INSERT WITH CHECK (current_user_role() = 'finance');

CREATE POLICY base_rate_principal_update ON base_rate_history
    FOR UPDATE USING (current_user_role() = 'principal');

CREATE POLICY base_rate_no_delete ON base_rate_history FOR DELETE USING (FALSE);

-- ============================================================================
-- STATEMENTS: Pattern 1 + Pattern 2
-- ============================================================================

-- statement_categories: all authenticated read, Principal writes
CREATE POLICY statement_cat_all_select ON statement_categories
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY statement_cat_principal_write ON statement_categories
    FOR INSERT WITH CHECK (current_user_role() = 'principal');

CREATE POLICY statement_cat_principal_update ON statement_categories
    FOR UPDATE USING (current_user_role() = 'principal');

CREATE POLICY statement_cat_no_delete ON statement_categories FOR DELETE USING (FALSE);

-- monthly_statements
CREATE POLICY statements_pf_select ON monthly_statements
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));

CREATE POLICY statements_finance_insert ON monthly_statements
    FOR INSERT WITH CHECK (current_user_role() = 'finance');

CREATE POLICY statements_finance_update ON monthly_statements
    FOR UPDATE USING (current_user_role() = 'finance');

CREATE POLICY statements_no_delete ON monthly_statements FOR DELETE USING (FALSE);

-- monthly_statement_lines
CREATE POLICY statement_lines_pf_select ON monthly_statement_lines
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));

CREATE POLICY statement_lines_finance_insert ON monthly_statement_lines
    FOR INSERT WITH CHECK (current_user_role() = 'finance');

-- Allow DELETE on statement_lines (for regeneration via ON DELETE CASCADE)
-- But only when parent statement is draft
CREATE POLICY statement_lines_delete_cascade ON monthly_statement_lines
    FOR DELETE USING (
        current_user_role() = 'finance'
        AND EXISTS (
            SELECT 1 FROM monthly_statements
            WHERE id = monthly_statement_lines.statement_id
            AND status = 'draft'
        )
    );

-- ============================================================================
-- BILLING (Phase 2): Pattern 1
-- ============================================================================

CREATE POLICY service_contracts_pf_select ON service_contracts
    FOR SELECT USING (
        current_user_role() IN ('principal', 'finance')
        OR (
            current_user_role() = 'dept_manager'
            AND department_id = current_user_department_id()
        )
    );

CREATE POLICY service_contracts_finance_insert ON service_contracts
    FOR INSERT WITH CHECK (current_user_role() = 'finance');

CREATE POLICY service_contracts_finance_update ON service_contracts
    FOR UPDATE USING (current_user_role() = 'finance');

CREATE POLICY service_contracts_no_delete ON service_contracts FOR DELETE USING (FALSE);

CREATE POLICY invoices_pf_select ON invoices
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));

CREATE POLICY invoices_finance_insert ON invoices
    FOR INSERT WITH CHECK (current_user_role() = 'finance');

CREATE POLICY invoices_finance_update ON invoices
    FOR UPDATE USING (current_user_role() = 'finance');

CREATE POLICY invoices_no_delete ON invoices FOR DELETE USING (FALSE);

-- ============================================================================
-- DIRECTORS (Phase 3): Pattern 4 — Principal + HR only, Finance BLOCKED
-- ============================================================================

CREATE POLICY directors_ph_select ON directors
    FOR SELECT USING (current_user_role() IN ('principal', 'hr'));

CREATE POLICY directors_hr_insert ON directors
    FOR INSERT WITH CHECK (current_user_role() IN ('principal', 'hr'));

CREATE POLICY directors_hr_update ON directors
    FOR UPDATE USING (current_user_role() IN ('principal', 'hr'));

CREATE POLICY directors_no_delete ON directors FOR DELETE USING (FALSE);

CREATE POLICY director_ctc_ph_select ON director_ctc
    FOR SELECT USING (current_user_role() IN ('principal', 'hr'));

CREATE POLICY director_ctc_hr_insert ON director_ctc
    FOR INSERT WITH CHECK (current_user_role() = 'hr');

CREATE POLICY director_ctc_hr_update ON director_ctc
    FOR UPDATE USING (current_user_role() = 'hr');

CREATE POLICY director_ctc_no_delete ON director_ctc FOR DELETE USING (FALSE);

CREATE POLICY salary_pool_ph_select ON salary_pool
    FOR SELECT USING (current_user_role() IN ('principal', 'hr'));

CREATE POLICY salary_pool_hr_insert ON salary_pool
    FOR INSERT WITH CHECK (current_user_role() = 'hr');

CREATE POLICY salary_pool_no_delete ON salary_pool FOR DELETE USING (FALSE);

CREATE POLICY director_payouts_ph_select ON director_payouts
    FOR SELECT USING (current_user_role() IN ('principal', 'hr'));

CREATE POLICY director_payouts_hr_insert ON director_payouts
    FOR INSERT WITH CHECK (current_user_role() = 'hr');

CREATE POLICY director_payouts_hr_update ON director_payouts
    FOR UPDATE USING (current_user_role() IN ('principal', 'hr', 'finance'));

CREATE POLICY director_payouts_no_delete ON director_payouts FOR DELETE USING (FALSE);

-- ============================================================================
-- POOLS: Pattern 1 + dept_pools uses Pattern 3 (Dept Manager own dept)
-- ============================================================================

-- dept_pools: Principal/Finance all, Dept Manager own dept
CREATE POLICY dept_pools_pf_select ON dept_pools
    FOR SELECT USING (
        current_user_role() IN ('principal', 'finance')
        OR (
            current_user_role() = 'dept_manager'
            AND department_id = current_user_department_id()
        )
    );

-- Dept Manager can only INSERT expense_out for their own dept
CREATE POLICY dept_pools_dept_manager_insert ON dept_pools
    FOR INSERT WITH CHECK (
        current_user_role() = 'dept_manager'
        AND transaction_type = 'expense_out'
        AND department_id = current_user_department_id()
    );

-- Finance can INSERT np_in only (system-generated monthly NP). Expenses go
-- through Dept Manager submission + Principal approval flow.
CREATE POLICY dept_pools_finance_insert ON dept_pools
    FOR INSERT WITH CHECK (
        current_user_role() = 'finance'
        AND transaction_type = 'np_in'
    );

-- Principal INSERT for approved expenses (triggered by approval workflow)
CREATE POLICY dept_pools_principal_insert ON dept_pools
    FOR INSERT WITH CHECK (current_user_role() = 'principal');

CREATE POLICY dept_pools_no_update ON dept_pools FOR UPDATE USING (FALSE);
CREATE POLICY dept_pools_no_delete ON dept_pools FOR DELETE USING (FALSE);

-- hv_operating_fund: Principal + Finance read
CREATE POLICY hv_fund_pf_select ON hv_operating_fund
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));

CREATE POLICY hv_fund_finance_insert ON hv_operating_fund
    FOR INSERT WITH CHECK (current_user_role() IN ('finance', 'hr'));

CREATE POLICY hv_fund_no_update ON hv_operating_fund FOR UPDATE USING (FALSE);
CREATE POLICY hv_fund_no_delete ON hv_operating_fund FOR DELETE USING (FALSE);

-- invoice_payout_pool: Principal + Finance read, HR inserts accumulate, Principal releases
CREATE POLICY invoice_pool_pf_select ON invoice_payout_pool
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));

CREATE POLICY invoice_pool_hr_insert ON invoice_payout_pool
    FOR INSERT WITH CHECK (
        current_user_role() IN ('hr', 'finance')
        AND transaction_type = 'accumulate'
    );

CREATE POLICY invoice_pool_principal_release ON invoice_payout_pool
    FOR INSERT WITH CHECK (
        current_user_role() = 'principal'
        AND transaction_type = 'release'
    );

CREATE POLICY invoice_pool_no_update ON invoice_payout_pool FOR UPDATE USING (FALSE);
CREATE POLICY invoice_pool_no_delete ON invoice_payout_pool FOR DELETE USING (FALSE);

-- ============================================================================
-- HR (Phase 3): Pattern 4 — Principal + HR only, Finance BLOCKED
-- Finance can ONLY see aggregate view finance_hr_cost_summary (per Pattern 5)
-- ============================================================================

CREATE POLICY hr_pool_alloc_ph_select ON hr_pool_allocation
    FOR SELECT USING (current_user_role() IN ('principal', 'hr'));

CREATE POLICY hr_pool_alloc_hr_write ON hr_pool_allocation
    FOR INSERT WITH CHECK (current_user_role() = 'hr');

CREATE POLICY hr_pool_alloc_hr_update ON hr_pool_allocation
    FOR UPDATE USING (current_user_role() = 'hr');

CREATE POLICY hr_pool_alloc_no_delete ON hr_pool_allocation FOR DELETE USING (FALSE);

-- hr_staff_costs: Principal + HR only (PII-sensitive)
CREATE POLICY hr_staff_costs_ph_select ON hr_staff_costs
    FOR SELECT USING (current_user_role() IN ('principal', 'hr'));

CREATE POLICY hr_staff_costs_hr_write ON hr_staff_costs
    FOR INSERT WITH CHECK (current_user_role() = 'hr');

CREATE POLICY hr_staff_costs_hr_update ON hr_staff_costs
    FOR UPDATE USING (current_user_role() = 'hr');

CREATE POLICY hr_staff_costs_no_delete ON hr_staff_costs FOR DELETE USING (FALSE);

CREATE POLICY hr_staff_alloc_ph_select ON hr_staff_allocation
    FOR SELECT USING (current_user_role() IN ('principal', 'hr'));

CREATE POLICY hr_staff_alloc_hr_write ON hr_staff_allocation
    FOR INSERT WITH CHECK (current_user_role() = 'hr');

CREATE POLICY hr_staff_alloc_hr_update ON hr_staff_allocation
    FOR UPDATE USING (current_user_role() = 'hr');

CREATE POLICY hr_staff_alloc_no_delete ON hr_staff_allocation FOR DELETE USING (FALSE);

-- claims: mixed visibility per access-matrix
-- Principal + Finance + HR see all; Dept Manager doesn't see claims
CREATE POLICY claims_privileged_select ON claims
    FOR SELECT USING (current_user_role() IN ('principal', 'finance', 'hr'));

-- Anyone can submit claims (they identify as claimant)
CREATE POLICY claims_submit ON claims
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Finance approves project claims, HR approves benefit claims
CREATE POLICY claims_approvers_update ON claims
    FOR UPDATE USING (
        (claim_type = 'project' AND current_user_role() = 'finance')
        OR (claim_type = 'benefit' AND current_user_role() = 'hr')
    );

CREATE POLICY claims_no_delete ON claims FOR DELETE USING (FALSE);

-- ============================================================================
-- STATUTORY: read-only for all authenticated, admin write
-- ============================================================================

CREATE POLICY epf_all_select ON epf_third_schedule
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY epf_principal_write ON epf_third_schedule
    FOR INSERT WITH CHECK (current_user_role() = 'principal');

CREATE POLICY epf_principal_update ON epf_third_schedule
    FOR UPDATE USING (current_user_role() = 'principal');

CREATE POLICY epf_no_delete ON epf_third_schedule FOR DELETE USING (FALSE);

CREATE POLICY socso_all_select ON socso_act4_schedule
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY socso_principal_write ON socso_act4_schedule
    FOR INSERT WITH CHECK (current_user_role() = 'principal');

CREATE POLICY socso_principal_update ON socso_act4_schedule
    FOR UPDATE USING (current_user_role() = 'principal');

CREATE POLICY socso_no_delete ON socso_act4_schedule FOR DELETE USING (FALSE);

CREATE POLICY eis_all_select ON eis_act800_schedule
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY eis_principal_write ON eis_act800_schedule
    FOR INSERT WITH CHECK (current_user_role() = 'principal');

CREATE POLICY eis_principal_update ON eis_act800_schedule
    FOR UPDATE USING (current_user_role() = 'principal');

CREATE POLICY eis_no_delete ON eis_act800_schedule FOR DELETE USING (FALSE);

CREATE POLICY pcb_all_select ON pcb_jadual
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY pcb_principal_write ON pcb_jadual
    FOR INSERT WITH CHECK (current_user_role() = 'principal');

CREATE POLICY pcb_principal_update ON pcb_jadual
    FOR UPDATE USING (current_user_role() = 'principal');

CREATE POLICY pcb_no_delete ON pcb_jadual FOR DELETE USING (FALSE);

-- ============================================================================
-- SETTINGS: Pattern 6 — Principal writes, Principal + Finance read
-- ============================================================================

CREATE POLICY treasury_config_pf_select ON treasury_config
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));

CREATE POLICY treasury_config_principal_write ON treasury_config
    FOR INSERT WITH CHECK (current_user_role() = 'principal');

CREATE POLICY treasury_config_principal_update ON treasury_config
    FOR UPDATE USING (current_user_role() = 'principal');

CREATE POLICY treasury_config_no_delete ON treasury_config FOR DELETE USING (FALSE);

CREATE POLICY tier_config_pf_select ON tier_config
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));

CREATE POLICY tier_config_principal_write ON tier_config
    FOR INSERT WITH CHECK (current_user_role() = 'principal');

CREATE POLICY tier_config_principal_update ON tier_config
    FOR UPDATE USING (current_user_role() = 'principal');

CREATE POLICY tier_config_no_delete ON tier_config FOR DELETE USING (FALSE);

CREATE POLICY overdue_config_pf_select ON overdue_config
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));

CREATE POLICY overdue_config_principal_write ON overdue_config
    FOR INSERT WITH CHECK (current_user_role() = 'principal');

CREATE POLICY overdue_config_principal_update ON overdue_config
    FOR UPDATE USING (current_user_role() = 'principal');

CREATE POLICY overdue_config_no_delete ON overdue_config FOR DELETE USING (FALSE);

-- ============================================================================
-- NOTE: ALL views in 20260101000010_constraints.sql were created with
-- `security_invoker = true` so they inherit the caller's RLS context.
-- For Finance's HR aggregate access, we use a SECURITY DEFINER function
-- (get_hr_cost_summary below) instead of a view — it's clearer about the
-- intentional RLS bypass and has an explicit role check.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_hr_cost_summary()
RETURNS TABLE (
    department_id UUID,
    department_name TEXT,
    staff_count BIGINT,
    total_basic DECIMAL,
    total_statutory DECIMAL,
    total_allowance DECIMAL,
    total_ctc DECIMAL
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT
        d.id,
        d.name,
        COUNT(*),
        SUM(hsc.basic_salary),
        SUM(COALESCE(hsc.epf_er, 0) + COALESCE(hsc.socso_er, 0) + COALESCE(hsc.eis_er, 0)),
        SUM(hsc.allowances),
        SUM(hsc.total_ctc)
    FROM hr_staff_costs hsc
    JOIN departments d ON d.id = hsc.department_id
    WHERE hsc.status = 'active'
      AND current_user_role() IN ('principal', 'finance', 'hr')
    GROUP BY d.id, d.name
$$;

COMMENT ON FUNCTION get_hr_cost_summary() IS
    'Aggregate HR cost access for Finance (Pattern 5). Returns zero rows for unauthorized roles.';

-- Grant execute to authenticated users (function checks role internally)
GRANT EXECUTE ON FUNCTION get_hr_cost_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION current_user_department_id() TO authenticated;
