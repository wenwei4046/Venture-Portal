-- ============================================================================
-- 20260101000014_indexes.sql
-- Performance indexes
-- HOUZS Venture Portal (VP)
--
-- Per /autoplan Eng Section 4 — 18 indexes required for p95 < 200ms at
-- 3-year data volume. Partial indexes for status='pending' and status='active'
-- give the biggest win on Dashboard + list pages.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Users / companies
-- ----------------------------------------------------------------------------

CREATE INDEX idx_users_role_active ON users(role) WHERE is_active = TRUE;
CREATE INDEX idx_companies_active ON companies(is_active) WHERE is_active = TRUE;

-- ----------------------------------------------------------------------------
-- Treasury hot paths
-- ----------------------------------------------------------------------------

-- Loans
CREATE INDEX idx_loans_status_active ON loans(id) WHERE status = 'active';
CREATE INDEX idx_loans_status_pending ON loans(id) WHERE status = 'pending_approval';
CREATE INDEX idx_loans_company_status ON loans(company_id, status);
CREATE INDEX idx_loans_disbursement_date ON loans(disbursement_date DESC) WHERE status = 'active';

-- Fund sources
CREATE INDEX idx_fund_sources_status_active ON fund_sources(id) WHERE status = 'active';
CREATE INDEX idx_fund_sources_maturity
    ON fund_sources(maturity_date)
    WHERE status = 'active' AND maturity_date IS NOT NULL;
CREATE INDEX idx_fund_sources_from_company ON fund_sources(from_company_id) WHERE from_company_id IS NOT NULL;
CREATE INDEX idx_fund_sources_from_director ON fund_sources(from_director_id) WHERE from_director_id IS NOT NULL;

-- Repayments (critical for outstanding computation)
CREATE INDEX idx_repayments_loan_type ON repayments(loan_id, payment_type);
CREATE INDEX idx_repayments_loan_date ON repayments(loan_id, payment_date DESC);

-- Overdue records
CREATE INDEX idx_overdue_status_pending ON overdue_records(id) WHERE status = 'pending';
CREATE INDEX idx_overdue_loan ON overdue_records(loan_id);

-- Base rate history (gist index for period lookup)
-- Already created in 20260101000002_treasury.sql via EXCLUDE constraint
-- But add a simpler btree for common queries:
CREATE INDEX idx_base_rate_approved ON base_rate_history(approved_at DESC)
    WHERE approved_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Approvals (Principal's most-hit query)
-- ----------------------------------------------------------------------------

CREATE INDEX idx_approvals_status_pending ON approval_requests(created_at ASC)
    WHERE status = 'pending';
CREATE INDEX idx_approvals_submitted_by ON approval_requests(submitted_by, created_at DESC);
CREATE INDEX idx_approvals_workflow_state ON approval_requests(workflow_state)
    WHERE workflow_state IN ('submitted', 'under_review', 'needs_info');
CREATE INDEX idx_approvals_assigned_to ON approval_requests(assigned_to, due_at)
    WHERE assigned_to IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Statements
-- ----------------------------------------------------------------------------

CREATE INDEX idx_statements_company_period ON monthly_statements(company_id, period_month DESC);
CREATE INDEX idx_statements_status_draft ON monthly_statements(id) WHERE status = 'draft';
CREATE INDEX idx_statement_lines_statement ON monthly_statement_lines(statement_id, line_type);
CREATE INDEX idx_statement_lines_category ON monthly_statement_lines(category_code);

-- ----------------------------------------------------------------------------
-- Billing (Phase 2)
-- ----------------------------------------------------------------------------

CREATE INDEX idx_invoices_company_period ON invoices(company_id, period_month)
    WHERE status IN ('draft', 'issued');
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_service_contracts_active ON service_contracts(department_id, company_id)
    WHERE status = 'active';

-- ----------------------------------------------------------------------------
-- Directors (Phase 3)
-- ----------------------------------------------------------------------------

CREATE INDEX idx_director_ctc_period ON director_ctc(period_month, director_id);
CREATE INDEX idx_director_payouts_period ON director_payouts(period_month, director_id);
CREATE INDEX idx_directors_active ON directors(status) WHERE status = 'active';

-- ----------------------------------------------------------------------------
-- Pools
-- ----------------------------------------------------------------------------

CREATE INDEX idx_hv_fund_type_date ON hv_operating_fund(transaction_type, created_at DESC);
CREATE INDEX idx_invoice_pool_type ON invoice_payout_pool(transaction_type, created_at DESC);
CREATE INDEX idx_dept_pools_dept_type ON dept_pools(department_id, transaction_type, period_month);

-- ----------------------------------------------------------------------------
-- HR (Phase 3)
-- ----------------------------------------------------------------------------

CREATE INDEX idx_hr_staff_costs_dept ON hr_staff_costs(department_id) WHERE status = 'active';
CREATE INDEX idx_hr_pool_alloc_period ON hr_pool_allocation(period_month, department_id);
CREATE INDEX idx_hr_staff_alloc_staff ON hr_staff_allocation(staff_id, period_month);

-- ----------------------------------------------------------------------------
-- Statutory lookups (most critical for Phase 3 perf)
-- ----------------------------------------------------------------------------

CREATE INDEX idx_epf_wage_range ON epf_third_schedule(wage_from, wage_to, part, effective_from);
CREATE INDEX idx_socso_wage_range ON socso_act4_schedule(wage_from, wage_to, category, effective_from);
CREATE INDEX idx_eis_wage_range ON eis_act800_schedule(wage_from, wage_to, effective_from);
CREATE INDEX idx_pcb_lookup ON pcb_jadual(income_from, income_to, category, children, effective_from);

-- ----------------------------------------------------------------------------
-- Claims
-- ----------------------------------------------------------------------------

CREATE INDEX idx_claims_status_type ON claims(status, claim_type);
CREATE INDEX idx_claims_payroll_month ON claims(payroll_month)
    WHERE status = 'approved' AND payroll_month IS NOT NULL;
