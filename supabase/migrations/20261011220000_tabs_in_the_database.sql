-- Plan C, the database side (2026-10-11 — the user's answer C, "现在就做完整的").
--
-- Every write gate in the app names the pages its action is offered on and narrows
-- the account to those pages' tab boxes (lib/auth.ts › requireActionOn,
-- lib/page-tabs.ts › actionsOnPages). The database only ever asked the CELL — and a
-- cell several tabs stand for stays held while one of their boxes is open, so a box
-- unticked on one page closed nothing to a request sent straight to its function.
--
-- This migration gives the database the tab registry: which tabs each page lists
-- (`permission_page_tabs`, the twin of PAGE_TABS) and which cells each box stands
-- for (`permission_tab_cells`, the twin of PERMISSION_TABS' `opens`) — seeded whole
-- here, and again by any migration that changes either registry
-- (src/lib/tab-write-guards.test.ts refuses a seed that is not the registry, row for
-- row). Then `tab_write_open(pages, wants)` answers what actionsOnPages answers, and
-- `tab_write_guard(pages, wants)` refuses when it says no. The next migration puts
-- the guard at the top of each DEFINER write a narrowing gate stands in front of.

CREATE TABLE IF NOT EXISTS public.permission_page_tabs (
  page   text NOT NULL,
  tab_id text NOT NULL,
  PRIMARY KEY (page, tab_id)
);
CREATE TABLE IF NOT EXISTS public.permission_tab_cells (
  tab_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('view', 'create', 'edit', 'approve')),
  cell   text NOT NULL,
  PRIMARY KEY (tab_id, action, cell)
);
CREATE INDEX IF NOT EXISTS permission_tab_cells_cell_idx ON public.permission_tab_cells (cell);

ALTER TABLE public.permission_page_tabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_tab_cells ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.permission_page_tabs, public.permission_tab_cells FROM anon, authenticated;

SELECT public.audit_register('permission_page_tabs', 'Pages and their tabs', 'Settings', '{}', 'none',
  p_reason => 'The app''s tab registry (PAGE_TABS), written only by migrations; read by the write guards.');
SELECT public.audit_register('permission_tab_cells', 'Tab boxes and their cells', 'Settings', '{}', 'none',
  p_reason => 'The app''s tab registry (PERMISSION_TABS), written only by migrations; read by the write guards.');

-- ── The registry, whole (src/test/tab-guards-scan.ts › pageTabRows / tabCellRows) ──

DELETE FROM public.permission_page_tabs;
INSERT INTO public.permission_page_tabs (page, tab_id) VALUES
  ('/admin/guest-link', 'hr.guest_link'),
  ('/admin/rooms', 'dept.meeting_rooms'),
  ('/admin/rooms', 'fin.meeting_rooms'),
  ('/admin/rooms', 'hr.meeting_rooms'),
  ('/admin/rooms', 'pri.meeting_rooms'),
  ('/approvals', 'fin.approvals'),
  ('/approvals', 'fin.payments'),
  ('/approvals', 'hr.director_salary'),
  ('/approvals', 'hr.payroll'),
  ('/approvals', 'pri.approvals'),
  ('/approvals/payroll-run/[id]/director-report', 'hr.director_salary'),
  ('/audit-log', 'fin.audit_log'),
  ('/audit-log', 'hr.audit_log'),
  ('/audit-log', 'pri.audit_log'),
  ('/audit-log/access', 'pri.audit_log'),
  ('/ba', 'fin.invoice_financing'),
  ('/ba/[id]', 'fin.invoice_financing'),
  ('/billing-allocator', 'fin.billing_allocator'),
  ('/billing-allocator/[id]', 'fin.billing_allocator'),
  ('/billing/contracts/[id]/edit', 'dept.my_billing'),
  ('/billing/contracts/[id]/edit', 'fin.billing_allocator'),
  ('/billing/contracts/[id]/edit', 'fin.invoice'),
  ('/billing/contracts/[id]/edit', 'pri.my_billing'),
  ('/billing/contracts/new', 'dept.my_billing'),
  ('/billing/contracts/new', 'fin.billing_allocator'),
  ('/billing/contracts/new', 'fin.invoice'),
  ('/billing/contracts/new', 'pri.my_billing'),
  ('/billing/requests', 'fin.billing_allocator'),
  ('/billing/requests', 'fin.invoice'),
  ('/claims', 'dept.claims'),
  ('/claims', 'dept.my_claims'),
  ('/claims', 'fin.claims'),
  ('/daily-bank', 'fin.daily_bank'),
  ('/dept-pool', 'dept.dept_pool'),
  ('/dept-pool', 'fin.dept_pool'),
  ('/dept-pool', 'pri.dept_pool'),
  ('/dept-pool/[slug]', 'dept.dept_pool'),
  ('/dept-pool/[slug]', 'fin.dept_pool'),
  ('/dept-pool/[slug]', 'pri.dept_pool'),
  ('/dept-pool/contracts/new', 'dept.dept_pool'),
  ('/dept-pool/contracts/new', 'dept.my_billing'),
  ('/dept-pool/contracts/new', 'fin.billing_allocator'),
  ('/dept-pool/contracts/new', 'fin.dept_pool'),
  ('/dept-pool/contracts/new', 'fin.invoice'),
  ('/dept-pool/contracts/new', 'pri.dept_pool'),
  ('/dept-pool/contracts/new', 'pri.my_billing'),
  ('/dept-pool/marketing', 'dept.dept_pool'),
  ('/dept-pool/marketing', 'fin.dept_pool'),
  ('/dept-pool/marketing', 'pri.dept_pool'),
  ('/dept-pool/statements/[seg]', 'dept.dept_pool'),
  ('/dept-pool/statements/[seg]', 'fin.dept_pool'),
  ('/dept-pool/statements/[seg]', 'fin.reports'),
  ('/dept-pool/statements/[seg]', 'pri.dept_pool'),
  ('/dept-pool/statements/[seg]', 'pri.reports'),
  ('/dept-pool/submissions', 'dept.dept_pool'),
  ('/dept-pool/submissions', 'fin.dept_pool'),
  ('/dept-pool/submissions', 'pri.dept_pool'),
  ('/director-pool', 'hr.director_pool'),
  ('/director-pool/import', 'hr.director_pool'),
  ('/director-salary', 'hr.director_salary'),
  ('/director-salary/[directorId]', 'hr.director_salary'),
  ('/director-salary/[directorId]/print', 'hr.director_salary'),
  ('/director-salary/import', 'hr.director_salary'),
  ('/director-salary/payslip/[id]', 'hr.director_salary'),
  ('/fund-in', 'fin.fund_in'),
  ('/fund-in/[id]', 'fin.fund_in'),
  ('/fund-in/[id]/edit', 'fin.fund_in'),
  ('/fund-in/new', 'fin.fund_in'),
  ('/fund-out', 'fin.fund_out'),
  ('/fund-out/[id]', 'fin.fund_out'),
  ('/fund-out/[id]/edit', 'fin.fund_out'),
  ('/fund-out/new', 'fin.fund_out'),
  ('/hiring/insights', 'hr.hiring_insights'),
  ('/hiring/requests', 'hr.hiring_requests'),
  ('/hiring/requests/[id]', 'hr.hiring_requests'),
  ('/hiring/talent', 'hr.talent_bank'),
  ('/hiring/talent/[id]', 'hr.talent_bank'),
  ('/hr-costing', 'hr.hr_costing'),
  ('/hr-costing/allocation', 'hr.hr_costing'),
  ('/hr-costing/allocation/[period]', 'hr.hr_costing'),
  ('/hr-costing/payment', 'hr.payment'),
  ('/hr-costing/payroll', 'hr.payroll'),
  ('/hr-costing/payroll/[period]', 'hr.payroll'),
  ('/hr-costing/payroll/[period]/[staffId]/payslip', 'hr.payroll'),
  ('/hr-costing/payroll/[period]/import', 'hr.payroll'),
  ('/invoice-pool', 'fin.payments'),
  ('/invoices/[id]', 'fin.invoice'),
  ('/member-admin', 'hr.member_services'),
  ('/my-billing', 'dept.my_billing'),
  ('/my-billing', 'pri.my_billing'),
  ('/opex', 'dept.opex'),
  ('/opex', 'pri.opex'),
  ('/overdue', 'fin.overdue'),
  ('/payments', 'fin.payments'),
  ('/payments/[id]', 'fin.payments'),
  ('/payments/[id]', 'hr.payment'),
  ('/payments/[id]', 'hr.payroll'),
  ('/payments/[id]/edit', 'fin.payments'),
  ('/payments/claim-requests', 'fin.claims'),
  ('/payments/claim-requests', 'fin.payments'),
  ('/payments/dept-requests', 'fin.payments'),
  ('/payments/new', 'fin.payments'),
  ('/payments/payroll-requests', 'fin.payments'),
  ('/receipts', 'fin.receipt'),
  ('/reconciliation', 'fin.reconciliation'),
  ('/reconciliation/[sessionId]', 'fin.reconciliation'),
  ('/reconciliation/[sessionId]/report', 'fin.reconciliation'),
  ('/reconciliation/journal', 'fin.journal_entries'),
  ('/reconciliation/journal-entries', 'fin.journal_entries'),
  ('/reconciliation/journal-entries/[id]', 'fin.journal_entries'),
  ('/reconciliation/journal-entries/[id]/edit', 'fin.journal_entries'),
  ('/reconciliation/journal-entries/new', 'fin.journal_entries'),
  ('/repayment-schedule', 'fin.repayment_schedule'),
  ('/reports', 'dept.reports'),
  ('/reports', 'fin.dept_reports'),
  ('/reports', 'fin.reports'),
  ('/reports', 'hr.hr_costing'),
  ('/reports', 'pri.reports'),
  ('/reports/balance-sheet', 'fin.reports'),
  ('/reports/balance-sheet', 'pri.reports'),
  ('/reports/base-rate', 'fin.reports'),
  ('/reports/base-rate', 'pri.reports'),
  ('/reports/cash-flow', 'dept.reports'),
  ('/reports/cash-flow', 'fin.dept_reports'),
  ('/reports/cash-flow', 'fin.reports'),
  ('/reports/cash-flow', 'pri.reports'),
  ('/reports/cash-flow/layout', 'fin.reports'),
  ('/reports/cash-flow/layout', 'pri.reports'),
  ('/reports/claims', 'dept.claims'),
  ('/reports/claims', 'fin.claims'),
  ('/reports/claims', 'fin.reports'),
  ('/reports/claims', 'pri.reports'),
  ('/reports/company-statement', 'fin.reports'),
  ('/reports/company-statement', 'pri.reports'),
  ('/reports/debtor-aging', 'dept.reports'),
  ('/reports/debtor-aging', 'fin.dept_reports'),
  ('/reports/debtor-aging', 'fin.reports'),
  ('/reports/debtor-aging', 'pri.reports'),
  ('/reports/fund-summary', 'fin.reports'),
  ('/reports/fund-summary', 'pri.reports'),
  ('/reports/income-statement', 'dept.reports'),
  ('/reports/income-statement', 'fin.dept_reports'),
  ('/reports/income-statement', 'fin.reports'),
  ('/reports/income-statement', 'pri.reports'),
  ('/reports/ledger', 'fin.reports'),
  ('/reports/ledger', 'pri.reports'),
  ('/reports/loan-aging', 'fin.reports'),
  ('/reports/loan-aging', 'pri.reports'),
  ('/reports/monthly-cash-flow', 'dept.reports'),
  ('/reports/monthly-cash-flow', 'fin.dept_reports'),
  ('/reports/monthly-cash-flow', 'fin.reports'),
  ('/reports/monthly-cash-flow', 'pri.reports'),
  ('/reports/monthly-pnl', 'dept.reports'),
  ('/reports/monthly-pnl', 'fin.dept_reports'),
  ('/reports/monthly-pnl', 'fin.reports'),
  ('/reports/monthly-pnl', 'pri.reports'),
  ('/reports/monthly-pnl/layout', 'fin.reports'),
  ('/reports/monthly-pnl/layout', 'pri.reports'),
  ('/reports/monthly-receipt-payment', 'dept.reports'),
  ('/reports/monthly-receipt-payment', 'fin.dept_reports'),
  ('/reports/monthly-receipt-payment', 'fin.reports'),
  ('/reports/monthly-receipt-payment', 'pri.reports'),
  ('/reports/receipt-payment', 'dept.reports'),
  ('/reports/receipt-payment', 'fin.dept_reports'),
  ('/reports/receipt-payment', 'fin.reports'),
  ('/reports/receipt-payment', 'pri.reports'),
  ('/reports/trial-balance', 'fin.reports'),
  ('/reports/trial-balance', 'pri.reports'),
  ('/revenue', 'hr.comm_cal'),
  ('/revenue', 'hr.rules'),
  ('/revenue', 'hr.sales_groups'),
  ('/revenue/[sub]', 'hr.comm_cal'),
  ('/revenue/[sub]/[period]', 'hr.comm_cal'),
  ('/revenue/[sub]/[period]/import', 'hr.comm_cal'),
  ('/revenue/[sub]/[period]/open-bill', 'hr.comm_cal'),
  ('/revenue/[sub]/[period]/orders', 'hr.comm_cal'),
  ('/revenue/[sub]/[period]/orders/[orderId]', 'hr.comm_cal'),
  ('/revenue/[sub]/[period]/pay', 'hr.comm_cal'),
  ('/revenue/[sub]/[period]/pay/[staffId]', 'hr.comm_cal'),
  ('/revenue/[sub]/[period]/statement/[staffId]', 'hr.comm_cal'),
  ('/revenue/[sub]/hierarchy', 'hr.sales_groups'),
  ('/revenue/[sub]/rules', 'hr.rules'),
  ('/revenue/department', 'hr.rules'),
  ('/settings', 'fin.chart_of_account'),
  ('/settings', 'pri.settings'),
  ('/statements', 'fin.invoice'),
  ('/statements/[id]', 'fin.statements'),
  ('/statements/[id]/print', 'fin.statements'),
  ('/statements/monthly', 'fin.statements'),
  ('/team/accounts/[id]', 'hr.permissions'),
  ('/team/documentation', 'hr.documentation'),
  ('/team/hierarchy', 'dept.people'),
  ('/team/hierarchy', 'hr.hierarchy'),
  ('/team/people', 'dept.people'),
  ('/team/people', 'hr.people'),
  ('/team/people', 'hr.permissions'),
  ('/team/people/[id]', 'dept.people'),
  ('/team/people/[id]', 'hr.people'),
  ('/team/people/[id]', 'hr.permissions'),
  ('/team/people/[id]/edit', 'hr.people'),
  ('/team/people/import', 'hr.people'),
  ('/team/people/new', 'hr.people'),
  ('/venture-pool', 'fin.venture_pool'),
  ('/venture-pool', 'pri.venture_pool');

DELETE FROM public.permission_tab_cells;
INSERT INTO public.permission_tab_cells (tab_id, action, cell) VALUES
  ('dept.claims', 'approve', 'claims.approve'),
  ('dept.claims', 'approve', 'claims.void'),
  ('dept.claims', 'view', 'claims.view'),
  ('dept.dept_pool', 'view', 'dept_pool.export'),
  ('dept.dept_pool', 'view', 'dept_pool.view'),
  ('dept.meeting_rooms', 'create', 'rooms.create'),
  ('dept.meeting_rooms', 'edit', 'rooms.edit'),
  ('dept.meeting_rooms', 'view', 'rooms.view'),
  ('dept.my_billing', 'create', 'my_billing.create'),
  ('dept.my_billing', 'view', 'my_billing.view'),
  ('dept.my_claims', 'create', 'claims.create'),
  ('dept.my_claims', 'edit', 'claims.edit'),
  ('dept.my_claims', 'view', 'claims.view'),
  ('dept.opex', 'view', 'opex.export'),
  ('dept.opex', 'view', 'opex.view'),
  ('dept.overview', 'view', 'dashboard.view'),
  ('dept.people', 'view', 'team.view'),
  ('dept.reports', 'view', 'dept_reports.export'),
  ('dept.reports', 'view', 'dept_reports.view'),
  ('fin.approvals', 'approve', 'approvals.approve'),
  ('fin.approvals', 'view', 'approvals.view'),
  ('fin.billing_allocator', 'approve', 'billing.void'),
  ('fin.billing_allocator', 'create', 'billing.create'),
  ('fin.billing_allocator', 'edit', 'billing.edit'),
  ('fin.billing_allocator', 'view', 'billing.export'),
  ('fin.billing_allocator', 'view', 'billing.view'),
  ('fin.chart_of_account', 'edit', 'categories.manage'),
  ('fin.chart_of_account', 'view', 'categories.view'),
  ('fin.claims', 'approve', 'claims.approve'),
  ('fin.claims', 'approve', 'claims.void'),
  ('fin.claims', 'create', 'claims.create'),
  ('fin.claims', 'edit', 'claims.edit'),
  ('fin.claims', 'view', 'claims.view'),
  ('fin.daily_bank', 'approve', 'treasury.approve'),
  ('fin.daily_bank', 'approve', 'treasury.void'),
  ('fin.daily_bank', 'create', 'treasury.create'),
  ('fin.daily_bank', 'edit', 'treasury.edit'),
  ('fin.daily_bank', 'view', 'treasury.export'),
  ('fin.daily_bank', 'view', 'treasury.view'),
  ('fin.dept_pool', 'view', 'dept_pool.export'),
  ('fin.dept_pool', 'view', 'dept_pool.view'),
  ('fin.dept_reports', 'view', 'dept_reports.export'),
  ('fin.dept_reports', 'view', 'dept_reports.view'),
  ('fin.fund_in', 'approve', 'treasury.approve'),
  ('fin.fund_in', 'approve', 'treasury.void'),
  ('fin.fund_in', 'create', 'treasury.create'),
  ('fin.fund_in', 'edit', 'treasury.edit'),
  ('fin.fund_in', 'view', 'treasury.export'),
  ('fin.fund_in', 'view', 'treasury.view'),
  ('fin.fund_out', 'approve', 'treasury.approve'),
  ('fin.fund_out', 'approve', 'treasury.void'),
  ('fin.fund_out', 'create', 'treasury.create'),
  ('fin.fund_out', 'edit', 'treasury.edit'),
  ('fin.fund_out', 'view', 'treasury.export'),
  ('fin.fund_out', 'view', 'treasury.view'),
  ('fin.invoice', 'approve', 'billing.void'),
  ('fin.invoice', 'create', 'billing.create'),
  ('fin.invoice', 'edit', 'billing.edit'),
  ('fin.invoice', 'view', 'billing.export'),
  ('fin.invoice', 'view', 'billing.view'),
  ('fin.invoice_financing', 'approve', 'treasury.approve'),
  ('fin.invoice_financing', 'approve', 'treasury.void'),
  ('fin.invoice_financing', 'create', 'treasury.create'),
  ('fin.invoice_financing', 'edit', 'treasury.edit'),
  ('fin.invoice_financing', 'view', 'treasury.export'),
  ('fin.invoice_financing', 'view', 'treasury.view'),
  ('fin.journal_entries', 'approve', 'reconciliation.approve'),
  ('fin.journal_entries', 'create', 'reconciliation.create'),
  ('fin.journal_entries', 'edit', 'reconciliation.edit'),
  ('fin.journal_entries', 'view', 'reconciliation.view'),
  ('fin.meeting_rooms', 'create', 'rooms.create'),
  ('fin.meeting_rooms', 'edit', 'rooms.edit'),
  ('fin.meeting_rooms', 'view', 'rooms.view'),
  ('fin.overdue', 'approve', 'treasury.approve'),
  ('fin.overdue', 'approve', 'treasury.void'),
  ('fin.overdue', 'create', 'treasury.create'),
  ('fin.overdue', 'edit', 'treasury.edit'),
  ('fin.overdue', 'view', 'treasury.export'),
  ('fin.overdue', 'view', 'treasury.view'),
  ('fin.overview', 'view', 'dashboard.view'),
  ('fin.payments', 'approve', 'treasury.approve'),
  ('fin.payments', 'approve', 'treasury.void'),
  ('fin.payments', 'create', 'treasury.create'),
  ('fin.payments', 'edit', 'treasury.edit'),
  ('fin.payments', 'view', 'treasury.export'),
  ('fin.payments', 'view', 'treasury.view'),
  ('fin.receipt', 'approve', 'treasury.approve'),
  ('fin.receipt', 'approve', 'treasury.void'),
  ('fin.receipt', 'create', 'treasury.create'),
  ('fin.receipt', 'edit', 'treasury.edit'),
  ('fin.receipt', 'view', 'treasury.export'),
  ('fin.receipt', 'view', 'treasury.view'),
  ('fin.reconciliation', 'approve', 'reconciliation.approve'),
  ('fin.reconciliation', 'create', 'reconciliation.create'),
  ('fin.reconciliation', 'edit', 'reconciliation.edit'),
  ('fin.reconciliation', 'view', 'reconciliation.view'),
  ('fin.repayment_schedule', 'approve', 'treasury.approve'),
  ('fin.repayment_schedule', 'approve', 'treasury.void'),
  ('fin.repayment_schedule', 'create', 'treasury.create'),
  ('fin.repayment_schedule', 'edit', 'treasury.edit'),
  ('fin.repayment_schedule', 'view', 'treasury.export'),
  ('fin.repayment_schedule', 'view', 'treasury.view'),
  ('fin.reports', 'view', 'reports.export'),
  ('fin.reports', 'view', 'reports.view'),
  ('fin.statements', 'approve', 'treasury.approve'),
  ('fin.statements', 'approve', 'treasury.void'),
  ('fin.statements', 'create', 'treasury.create'),
  ('fin.statements', 'edit', 'treasury.edit'),
  ('fin.statements', 'view', 'treasury.export'),
  ('fin.statements', 'view', 'treasury.view'),
  ('fin.venture_pool', 'create', 'venture_pool.create'),
  ('fin.venture_pool', 'edit', 'venture_pool.edit'),
  ('fin.venture_pool', 'view', 'venture_pool.export'),
  ('fin.venture_pool', 'view', 'venture_pool.view'),
  ('hr.comm_cal', 'approve', 'revenue.approve'),
  ('hr.comm_cal', 'create', 'revenue.create'),
  ('hr.comm_cal', 'edit', 'revenue.edit'),
  ('hr.comm_cal', 'view', 'revenue.export'),
  ('hr.comm_cal', 'view', 'revenue.view'),
  ('hr.director_pool', 'edit', 'director_pool.edit'),
  ('hr.director_pool', 'view', 'director_pool.view'),
  ('hr.director_salary', 'approve', 'director_salary.approve'),
  ('hr.director_salary', 'edit', 'director_salary.edit'),
  ('hr.director_salary', 'view', 'director_salary.view'),
  ('hr.documentation', 'create', 'documentation.create'),
  ('hr.documentation', 'edit', 'documentation.edit'),
  ('hr.documentation', 'view', 'documentation.view'),
  ('hr.guest_link', 'edit', 'guest_link.edit'),
  ('hr.guest_link', 'view', 'guest_link.view'),
  ('hr.hierarchy', 'edit', 'team.edit'),
  ('hr.hierarchy', 'edit', 'team.manage'),
  ('hr.hierarchy', 'view', 'team.view'),
  ('hr.hiring_insights', 'view', 'hiring.view'),
  ('hr.hiring_requests', 'approve', 'hiring.approve'),
  ('hr.hiring_requests', 'create', 'hiring.create'),
  ('hr.hiring_requests', 'edit', 'hiring.edit'),
  ('hr.hiring_requests', 'view', 'hiring.view'),
  ('hr.hr_costing', 'approve', 'hr_costing.approve'),
  ('hr.hr_costing', 'create', 'hr_costing.create'),
  ('hr.hr_costing', 'edit', 'hr_costing.edit'),
  ('hr.hr_costing', 'view', 'hr_costing.export'),
  ('hr.hr_costing', 'view', 'hr_costing.view'),
  ('hr.meeting_rooms', 'create', 'rooms.create'),
  ('hr.meeting_rooms', 'edit', 'rooms.edit'),
  ('hr.meeting_rooms', 'view', 'rooms.view'),
  ('hr.member_services', 'edit', 'member.manage'),
  ('hr.member_services', 'view', 'member.view'),
  ('hr.overview', 'view', 'dashboard.view'),
  ('hr.payment', 'approve', 'hr_costing.approve'),
  ('hr.payment', 'create', 'hr_costing.create'),
  ('hr.payment', 'edit', 'hr_costing.edit'),
  ('hr.payment', 'view', 'hr_costing.export'),
  ('hr.payment', 'view', 'hr_costing.view'),
  ('hr.payroll', 'approve', 'hr_costing.approve'),
  ('hr.payroll', 'create', 'hr_costing.create'),
  ('hr.payroll', 'edit', 'hr_costing.edit'),
  ('hr.payroll', 'view', 'hr_costing.export'),
  ('hr.payroll', 'view', 'hr_costing.view'),
  ('hr.people', 'create', 'team.create'),
  ('hr.people', 'edit', 'team.edit'),
  ('hr.people', 'view', 'team.view'),
  ('hr.permissions', 'create', 'accounts.create'),
  ('hr.permissions', 'edit', 'accounts.manage'),
  ('hr.permissions', 'view', 'accounts.view'),
  ('hr.rules', 'approve', 'revenue.approve'),
  ('hr.rules', 'create', 'revenue.create'),
  ('hr.rules', 'edit', 'revenue.edit'),
  ('hr.rules', 'edit', 'revenue.manage'),
  ('hr.rules', 'view', 'revenue.export'),
  ('hr.rules', 'view', 'revenue.view'),
  ('hr.sales_groups', 'approve', 'revenue.approve'),
  ('hr.sales_groups', 'create', 'revenue.create'),
  ('hr.sales_groups', 'edit', 'revenue.edit'),
  ('hr.sales_groups', 'view', 'revenue.export'),
  ('hr.sales_groups', 'view', 'revenue.view'),
  ('hr.talent_bank', 'create', 'hiring.create'),
  ('hr.talent_bank', 'edit', 'hiring.edit'),
  ('hr.talent_bank', 'view', 'hiring.view'),
  ('pri.approvals', 'approve', 'approvals.approve'),
  ('pri.approvals', 'view', 'approvals.view'),
  ('pri.audit_log', 'view', 'audit_log.export'),
  ('pri.audit_log', 'view', 'audit_log.view'),
  ('pri.dept_pool', 'view', 'dept_pool.export'),
  ('pri.dept_pool', 'view', 'dept_pool.view'),
  ('pri.meeting_rooms', 'create', 'rooms.create'),
  ('pri.meeting_rooms', 'edit', 'rooms.edit'),
  ('pri.meeting_rooms', 'view', 'rooms.view'),
  ('pri.my_billing', 'create', 'my_billing.create'),
  ('pri.my_billing', 'view', 'my_billing.view'),
  ('pri.opex', 'view', 'opex.export'),
  ('pri.opex', 'view', 'opex.view'),
  ('pri.overview', 'view', 'dashboard.view'),
  ('pri.reports', 'view', 'reports.export'),
  ('pri.reports', 'view', 'reports.view'),
  ('pri.settings', 'edit', 'settings.manage'),
  ('pri.settings', 'view', 'settings.view'),
  ('pri.switch_views', 'view', 'view_switch.view'),
  ('pri.venture_pool', 'create', 'venture_pool.create'),
  ('pri.venture_pool', 'edit', 'venture_pool.edit'),
  ('pri.venture_pool', 'view', 'venture_pool.export'),
  ('pri.venture_pool', 'view', 'venture_pool.view'),
  ('rev.arena', 'view', 'revenue_app.view'),
  ('rev.crm_team', 'edit', 'crm.edit'),
  ('rev.crm_team', 'edit', 'crm.manage'),
  ('rev.crm_team', 'view', 'crm.view'),
  ('rev.documentation', 'view', 'revenue_app.view'),
  ('rev.income', 'view', 'revenue_app.view'),
  ('rev.insight', 'view', 'revenue_app.view'),
  ('rev.leads', 'edit', 'crm.edit'),
  ('rev.leads', 'view', 'crm.view'),
  ('rev.product_list', 'edit', 'product_list.edit'),
  ('rev.product_list', 'view', 'product_list.view'),
  ('rev.quote', 'create', 'revenue_app.create'),
  ('rev.quote', 'view', 'revenue_app.view'),
  ('rev.requests', 'create', 'revenue_app.create'),
  ('rev.requests', 'view', 'revenue_app.view'),
  ('rev.rooms', 'create', 'revenue_app.create'),
  ('rev.rooms', 'view', 'revenue_app.view'),
  ('rev.team', 'view', 'revenue_app.view'),
  ('rev.today', 'view', 'revenue_app.view'),
  ('rev.track', 'create', 'revenue_app.create'),
  ('rev.track', 'view', 'revenue_app.view');

-- ── One box, over an account's tabs as current_tabs() reads them ──────────────
-- The twin of tab_box_closed (mig 20261011150000) handed the tabs instead of
-- reading them, so a guard asking many boxes reads current_tabs() once. Held to
-- closedBoxes by tests/member-sql/tab-box-closed.json, as tab_box_closed is.
CREATE OR REPLACE FUNCTION public.tab_box_closed_in(p_v jsonb, p_tab text, p_action text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_boxes jsonb;
  v_box   boolean;
  v_view  boolean;
BEGIN
  IF p_v IS NULL THEN
    RETURN false;
  END IF;
  v_boxes := coalesce(p_v->'boxes', '[]'::jsonb);
  IF jsonb_array_length(v_boxes) = 0 AND coalesce((p_v->>'cells')::boolean, false) THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(p_v->'ticks') = 'array' THEN
    SELECT (b->>'granted')::boolean INTO v_box FROM jsonb_array_elements(v_boxes) b
     WHERE b->>'tab' = p_tab AND b->>'action' = p_action LIMIT 1;
    v_box := coalesce(v_box, (p_v->'ticks') ? (p_tab || '.' || p_action));
    IF p_action = 'view' THEN
      RETURN NOT v_box;
    END IF;
    SELECT (b->>'granted')::boolean INTO v_view FROM jsonb_array_elements(v_boxes) b
     WHERE b->>'tab' = p_tab AND b->>'action' = 'view' LIMIT 1;
    v_view := coalesce(v_view, (p_v->'ticks') ? (p_tab || '.view'));
    RETURN NOT (v_box AND v_view);
  END IF;
  RETURN EXISTS (SELECT 1 FROM jsonb_array_elements(v_boxes) b
                  WHERE b->>'tab' = p_tab AND b->>'action' IN (p_action, 'view') AND NOT (b->>'granted')::boolean);
END
$fn$;

-- ── May the caller make this write through any of the gates in front of it? ───
-- The twin of the app's gates (lib/auth.ts › requireActionOn, lib/page-tabs.ts ›
-- actionsOnPages). Each site is one gate, 'page,page|want,want': a write its
-- pages' tabs stand for counts on a page while one of those boxes is still open;
-- a page with no box for it keeps it as held; a write offered on several pages
-- counts while any of them keeps it, and one reached through several gates while
-- any of them lets it through. True when nobody unticked a box for them (every
-- account on 2026-10-11), when they hold none of the actions asked (the
-- function's own check decides), and for a View; false only when every action
-- they hold of those asked is closed on every page of every gate. Held to the
-- app's answer by tests/member-sql/tab-write-open.json (src/lib/tab-write-open.test.ts
-- asks the app the same).
CREATE OR REPLACE FUNCTION public.tab_writes_open(p_sites text[])
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v       jsonb := public.current_tabs();
  v_site  text;
  v_want  text;
  v_cell  text;
  v_page  text;
  v_boxes integer;
  v_open  integer;
  v_held  boolean := false;
BEGIN
  IF v IS NULL
     OR (jsonb_array_length(coalesce(v->'boxes', '[]'::jsonb)) = 0
         AND (coalesce((v->>'cells')::boolean, false) OR jsonb_typeof(v->'ticks') IS DISTINCT FROM 'array')) THEN
    RETURN true;
  END IF;
  FOREACH v_site IN ARRAY coalesce(p_sites, '{}'::text[]) LOOP
    FOREACH v_want IN ARRAY string_to_array(split_part(v_site, '|', 2), ',') LOOP
      v_cell := split_part(v_want, ':', 1);
      CONTINUE WHEN NOT public.has_any_action(ARRAY[v_cell || ':own']);
      v_held := true;
      IF split_part(v_cell, '.', 2) NOT IN ('create', 'edit', 'approve', 'void', 'manage') THEN
        RETURN true;
      END IF;
      FOREACH v_page IN ARRAY string_to_array(split_part(v_site, '|', 1), ',') LOOP
        SELECT count(*), count(*) FILTER (WHERE NOT public.tab_box_closed_in(v, c.tab_id, c.action))
          INTO v_boxes, v_open
          FROM public.permission_page_tabs p
          JOIN public.permission_tab_cells c ON c.tab_id = p.tab_id
         WHERE p.page = v_page AND c.cell = v_cell;
        IF v_boxes = 0 OR v_open > 0 THEN
          RETURN true;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN NOT v_held;
END
$fn$;

-- One gate: these pages, these actions.
CREATE OR REPLACE FUNCTION public.tab_write_open(p_pages text[], p_wants text[])
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN public.tab_writes_open(ARRAY[array_to_string(p_pages, ',') || '|' || array_to_string(p_wants, ',')]);
END
$fn$;

-- ── The guard a DEFINER write asks first ──────────────────────────────────────
-- Only when it is the call itself: one step inside another function (an approval
-- carrying out what it approved, a run reopened batch by batch) the outer
-- function's own gate stood for it.
CREATE OR REPLACE FUNCTION public.tab_write_guard_sites(p_sites text[])
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_stack text;
BEGIN
  -- The functions on the stack: this one, the write it guards, and whatever called that. A DO
  -- block is nobody's caller (only the database's own scripts run one).
  GET DIAGNOSTICS v_stack = PG_CONTEXT;
  IF (SELECT count(*) FROM regexp_matches(v_stack, '(^|\n)(PL/pgSQL|SQL) function (?!inline_code_block)', 'g')) > 2 THEN
    RETURN;
  END IF;
  IF NOT public.tab_writes_open(p_sites) THEN
    RAISE EXCEPTION 'Not open to you on this page — a box in your permissions is unticked'
      USING ERRCODE = '42501';
  END IF;
END
$fn$;

-- The same, for a write behind one gate (most of them): these pages, these actions.
CREATE OR REPLACE FUNCTION public.tab_write_guard(p_pages text[], p_wants text[])
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_stack text;
BEGIN
  -- The functions on the stack: this one, the write it guards, and whatever called that. A DO
  -- block is nobody's caller (only the database's own scripts run one).
  GET DIAGNOSTICS v_stack = PG_CONTEXT;
  IF (SELECT count(*) FROM regexp_matches(v_stack, '(^|\n)(PL/pgSQL|SQL) function (?!inline_code_block)', 'g')) > 2 THEN
    RETURN;
  END IF;
  IF NOT public.tab_write_open(p_pages, p_wants) THEN
    RAISE EXCEPTION 'Not open to you on this page — a box in your permissions is unticked'
      USING ERRCODE = '42501';
  END IF;
END
$fn$;

REVOKE ALL ON FUNCTION public.tab_box_closed_in(jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tab_writes_open(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tab_write_open(text[], text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tab_write_guard_sites(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tab_write_guard(text[], text[]) FROM PUBLIC, anon, authenticated;
