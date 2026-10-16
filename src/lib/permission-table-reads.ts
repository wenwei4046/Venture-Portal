/**
 * What the DATABASE asks of a read (2026-10-09 — PR3d of the People
 * Management revamp: reads ask for the action too).
 *
 * Until now a table's SELECT policies opened it to whoever held ANY key of its
 * domain (`has_scope(ARRAY['hr'])`) — and a domain is wide: the hr domain is
 * Director Pool, Director Salary, HR Costing, Revenue, People and the Salary
 * tick together, so a title given Revenue alone could read every director's
 * payout and everybody's payroll through the API, no page needed; Product List
 * (admin domain) read the payroll too.
 *
 * Every table a domain policy opens now has a RESTRICTIVE policy
 * `needs_action_select` that asks `may_read(table)`: does the caller hold one
 * of the actions listed here for it (`permission_table_reads`, migration
 * 20261009080000 — this is its twin, held equal by
 * permission-table-reads.test.ts). A restrictive policy only takes away:
 * whoever the old policies refused is still refused, and whoever they let in
 * must ALSO hold one of these. Row policies still say WHICH rows (Own / Dept,
 * PR3c).
 *
 * Each list is the actions under which somebody reads that table under their
 * own session (src/test/read-paths.ts): the gate of every page and action that
 * reads it — directly, embedded in another read, through a security_invoker
 * view or a SECURITY INVOKER function — every write of it (an UPDATE … WHERE
 * reads the rows), the writers of a table whose INVOKER trigger reads it, and
 * the readers of a table whose own policy reads it. A page key counts as its
 * function's View at the least reach (`claims.view:own`): whoever holds the
 * key holds that View at some reach. Tables no page reads (config_audit_log,
 * erp_sofa_combos, payroll_month_closes, comm_direct_line_expansion_awards)
 * answer to their own module's View.
 */

import type { Want } from '@/lib/permission-table-writes'

export const TABLE_READS: Readonly<Record<string, readonly Want[]>> = {
  alloc_categories: ['billing.create', 'billing.edit', 'billing.view'],
  alloc_company_settings: ['billing.create', 'billing.edit', 'billing.view'],
  alloc_staff: ['billing.create', 'billing.edit', 'billing.view'],
  alloc_staff_history: ['billing.create', 'billing.edit', 'billing.view'],
  alloc_staff_splits: ['billing.create', 'billing.edit', 'billing.view'],
  alloc_template_splits: ['billing.create', 'billing.edit', 'billing.view'],
  alloc_templates: ['billing.create', 'billing.edit', 'billing.view'],
  alloc_txn_details: ['billing.create', 'billing.edit', 'billing.view'],
  alloc_txns: ['billing.create', 'billing.edit', 'billing.view'],
  approval_requests: ['approvals.approve', 'approvals.view', 'billing.create', 'billing.edit', 'claims.approve', 'dept_pool.view:dept', 'director_salary.approve', 'hr_costing.approve', 'hr_costing.create', 'hr_costing.edit', 'hr_costing.view:own', 'my_billing.create:dept', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view', 'treasury.void'],
  ba_attachments: ['treasury.create', 'treasury.edit', 'treasury.view', 'treasury.void'],
  ba_facilities: ['treasury.create', 'treasury.edit', 'treasury.view', 'treasury.void'],
  ba_limits: ['treasury.create', 'treasury.edit', 'treasury.view'],
  bank_accounts: ['approvals.approve', 'approvals.view', 'billing.create', 'billing.view', 'categories.view', 'claims.approve', 'dept_pool.view:dept', 'director_salary.approve', 'hr_costing.approve', 'hr_costing.export', 'hr_costing.view:own', 'reconciliation.create', 'reconciliation.view', 'reports.export', 'reports.view', 'settings.manage', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view', 'venture_pool.view'],
  bank_recon_lines: ['reconciliation.approve', 'reconciliation.create', 'reconciliation.edit', 'reconciliation.view'],
  bank_recon_matches: ['reconciliation.approve', 'reconciliation.create', 'reconciliation.edit', 'reconciliation.view'],
  bank_recon_sessions: ['reconciliation.approve', 'reconciliation.create', 'reconciliation.edit', 'reconciliation.view'],
  base_rate_history: ['approvals.approve', 'categories.view', 'reports.export', 'reports.view', 'settings.manage', 'treasury.approve', 'treasury.create', 'treasury.view'],
  catalogue_combo_prices: ['product_list.edit', 'product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage'],
  catalogue_combos: ['product_list.edit', 'product_list.view', 'revenue.edit'],
  catalogue_models: ['product_list.edit', 'product_list.view'],
  catalogue_option_prices: ['product_list.edit', 'product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage'],
  catalogue_skus: ['product_list.edit', 'product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  claims: ['claims.approve', 'claims.view:own', 'reconciliation.create', 'reconciliation.edit', 'reports.export', 'reports.view'],
  comm_agent_aliases: ['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  comm_brands: ['product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  comm_cost_ratios: ['product_list.edit', 'product_list.view', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  comm_cutovers: ['revenue.edit', 'revenue.manage', 'revenue.view:own'],
  comm_direct_line_entitlements: ['revenue.view:own'],
  comm_direct_line_expansion_awards: ['revenue.view:own'],
  comm_director_pay: ['revenue.edit', 'revenue.manage', 'revenue.view:own'],
  comm_double_claim_dismissals: ['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  comm_hierarchy: ['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own', 'team.view:own'],
  comm_ignored_agents: ['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  comm_item_groups: ['revenue.edit', 'revenue.manage', 'revenue.view:own'],
  comm_kpi_items: ['revenue.edit', 'revenue.manage', 'revenue.view:own'],
  comm_kpi_thresholds: ['revenue.edit', 'revenue.manage', 'revenue.view:own'],
  comm_margin_bands: ['revenue.edit', 'revenue.manage', 'revenue.view:own'],
  comm_open_bill_months: ['revenue.edit', 'revenue.manage', 'revenue.view:own'],
  comm_open_bill_rules: ['revenue.edit', 'revenue.manage', 'revenue.view:own'],
  comm_order_releases: ['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  comm_organisers: ['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  comm_products: ['product_list.edit', 'revenue.create', 'revenue.edit'],
  comm_promotion_rules: ['revenue.manage', 'revenue.view:own'],
  comm_rank_defs: ['revenue.manage', 'revenue.view:own'],
  comm_ranks: ['revenue.edit', 'revenue.manage', 'revenue.view:own', 'team.create', 'team.view:own'],
  comm_runs: ['hr_costing.view:own', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  comm_salesperson_closes: ['hr_costing.view:own', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  comm_schemes: ['accounts.view', 'product_list.edit', 'product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own', 'team.create', 'team.view:own'],
  comm_statement_brand_margins: ['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  comm_statement_lines: ['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  comm_statements: ['hr_costing.view:own', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  comm_sub_department_directors: ['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own', 'team.view:own'],
  comm_sub_departments: ['accounts.view', 'hr_costing.view:own', 'product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own', 'team.create', 'team.view:own'],
  comm_title_promotions: ['revenue.create', 'revenue.edit', 'revenue.manage'],
  comm_upsales: ['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  comm_venue_events: ['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  comm_venues: ['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  commission_inputs: ['revenue.create', 'revenue.edit', 'revenue.manage'],
  commission_rules: ['revenue.manage'],
  config_audit_log: ['audit_log.view'],
  credit_notes: ['approvals.approve', 'billing.create', 'billing.edit', 'billing.export', 'billing.view', 'billing.void', 'claims.approve', 'dept_reports.export:dept', 'dept_reports.view:dept', 'reports.view', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.void'],
  dept_payment_requests: ['approvals.approve', 'dept_pool.view:dept', 'my_billing.create:dept', 'reconciliation.create', 'reconciliation.edit', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.view', 'treasury.void'],
  dept_pools: ['approvals.approve', 'billing.create', 'dept_pool.view:dept', 'dept_reports.export:dept', 'dept_reports.view:dept', 'my_billing.create:dept', 'reports.export', 'reports.view', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view', 'treasury.void'],
  director_advance_offsets: ['approvals.approve', 'director_salary.approve', 'director_salary.edit'],
  director_ctc: ['director_salary.edit', 'director_salary.view'],
  director_monthly_payroll: ['approvals.approve', 'director_salary.approve', 'director_salary.edit', 'director_salary.view', 'hr_costing.approve', 'hr_costing.create', 'hr_costing.export', 'hr_costing.view:own', 'reconciliation.create', 'reconciliation.edit', 'treasury.approve'],
  director_payouts: ['approvals.approve', 'approvals.view', 'director_salary.approve', 'director_salary.edit', 'director_salary.view', 'hr_costing.approve', 'hr_costing.view:own', 'reconciliation.create', 'reconciliation.edit', 'treasury.approve', 'treasury.view'],
  director_salary_submissions: ['billing.view', 'director_salary.view', 'hr_costing.create'],
  directors: ['approvals.approve', 'approvals.view', 'categories.view', 'director_salary.approve', 'director_salary.edit', 'director_salary.view', 'hr_costing.approve', 'hr_costing.create', 'hr_costing.export', 'hr_costing.view:own', 'reconciliation.create', 'reconciliation.edit', 'reports.export', 'reports.view', 'settings.manage', 'treasury.approve', 'treasury.edit', 'treasury.export', 'treasury.view'],
  dp_companies: ['director_pool.edit', 'director_pool.view'],
  dp_contra: ['director_pool.edit', 'director_pool.view'],
  dp_director_inputs: ['director_pool.edit', 'director_pool.view'],
  dp_directors: ['director_pool.edit', 'director_pool.view'],
  dp_fixed_overrides: ['director_pool.edit', 'director_pool.view'],
  dp_inputs: ['director_pool.edit', 'director_pool.view'],
  dp_months: ['director_pool.edit', 'director_pool.view'],
  dp_settings: ['director_pool.edit', 'director_pool.view', 'director_salary.view'],
  erp_fabrics: ['product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage'],
  erp_feed_closed_months: ['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  erp_feed_settings: ['revenue.edit', 'revenue.manage', 'revenue.view:own'],
  erp_links: ['revenue.manage', 'revenue.view:own'],
  erp_maintenance_options: ['product_list.view', 'revenue.manage', 'revenue.view:own'],
  erp_product_models: ['product_list.view'],
  erp_products: ['product_list.edit', 'product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  erp_sofa_combos: ['product_list.view'],
  erp_sync_events: ['product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  fund_source_repayments: ['reports.export', 'reports.view', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view', 'treasury.void'],
  fund_sources: ['approvals.approve', 'approvals.view', 'categories.view', 'dept_pool.view:dept', 'director_salary.approve', 'hr_costing.approve', 'reports.export', 'reports.view', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view', 'treasury.void'],
  hr_cost_submissions: ['hr_costing.create', 'hr_costing.edit', 'hr_costing.view:own', 'treasury.create', 'treasury.edit'],
  hr_monthly_payroll: ['approvals.approve', 'approvals.view', 'dept_pool.view:dept', 'director_salary.approve', 'hr_costing.approve', 'hr_costing.create', 'hr_costing.edit', 'hr_costing.export', 'hr_costing.view:own', 'reconciliation.create', 'reconciliation.edit', 'revenue.view:own', 'treasury.approve', 'treasury.view'],
  hr_pool_allocation: ['hr_costing.create', 'hr_costing.edit'],
  hr_staff_allocation: ['billing.edit', 'billing.view', 'hr_costing.create', 'hr_costing.edit', 'hr_costing.view:own'],
  hr_staff_costs: ['accounts.create', 'accounts.manage', 'accounts.view', 'approvals.approve', 'approvals.view', 'billing.edit', 'dept_pool.view:dept', 'director_salary.approve', 'hr_costing.approve', 'hr_costing.create', 'hr_costing.edit', 'hr_costing.export', 'hr_costing.view:own', 'reconciliation.create', 'reconciliation.edit', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own', 'team.create', 'team.edit', 'team.view:own', 'treasury.approve', 'treasury.view'],
  invoice_lines: ['billing.create', 'billing.edit', 'billing.export', 'billing.view', 'dept_pool.view:dept', 'treasury.create'],
  invoice_payout_pool: ['approvals.approve', 'billing.create', 'director_salary.approve', 'director_salary.edit', 'reports.export', 'reports.view', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.view', 'treasury.void'],
  invoice_submission_requests: ['billing.create', 'billing.edit', 'billing.view', 'billing.void', 'dept_pool.view:dept', 'my_billing.create:dept'],
  invoices: ['approvals.approve', 'billing.create', 'billing.edit', 'billing.export', 'billing.view', 'billing.void', 'claims.approve', 'dept_pool.view:dept', 'dept_reports.export:dept', 'dept_reports.view:dept', 'hr_costing.view:own', 'my_billing.create:dept', 'my_billing.view:dept', 'reconciliation.create', 'reconciliation.edit', 'reports.export', 'reports.view', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view', 'treasury.void'],
  journal_entries: ['billing.void', 'categories.manage', 'dept_pool.view:dept', 'dept_reports.export:dept', 'dept_reports.view:dept', 'hr_costing.view:own', 'my_billing.view:dept', 'reconciliation.create', 'reconciliation.edit', 'reconciliation.view', 'reports.export', 'reports.view', 'treasury.create', 'treasury.export', 'treasury.view', 'treasury.void', 'venture_pool.view'],
  journal_lines: ['billing.void', 'categories.manage', 'dept_pool.view:dept', 'dept_reports.export:dept', 'dept_reports.view:dept', 'hr_costing.view:own', 'my_billing.view:dept', 'reconciliation.create', 'reconciliation.edit', 'reconciliation.view', 'reports.export', 'reports.view', 'treasury.create', 'treasury.export', 'treasury.view', 'treasury.void', 'venture_pool.view'],
  loans: ['approvals.approve', 'approvals.view', 'dept_pool.view:dept', 'director_salary.approve', 'hr_costing.approve', 'reports.export', 'reports.view', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view', 'treasury.void'],
  monthly_headcounts: ['billing.create', 'billing.edit', 'treasury.create', 'treasury.edit'],
  monthly_statement_lines: ['treasury.create', 'treasury.edit', 'treasury.view'],
  monthly_statements: ['treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view'],
  overdue_config: ['categories.view', 'settings.manage'],
  overdue_records: ['treasury.create', 'treasury.edit', 'treasury.view'],
  payment_attachments: ['approvals.approve', 'approvals.view', 'director_salary.approve', 'hr_costing.approve', 'hr_costing.view:own', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.view'],
  payment_voucher_sources: ['approvals.approve', 'approvals.view', 'billing.create', 'claims.approve', 'dept_pool.view:dept', 'director_salary.approve', 'hr_costing.approve', 'hr_costing.export', 'hr_costing.view:own', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view'],
  payment_vouchers: ['approvals.approve', 'approvals.view', 'billing.create', 'billing.export', 'billing.view', 'billing.void', 'claims.approve', 'dept_pool.view:dept', 'dept_reports.export:dept', 'dept_reports.view:dept', 'director_salary.approve', 'hr_costing.approve', 'hr_costing.export', 'hr_costing.view:own', 'reconciliation.create', 'reconciliation.edit', 'reports.export', 'reports.view', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view', 'treasury.void'],
  payroll_batch_lines: ['hr_costing.create', 'hr_costing.view:own'],
  payroll_batches: ['hr_costing.create', 'hr_costing.edit', 'hr_costing.view:own', 'treasury.approve', 'treasury.view', 'treasury.void'],
  payroll_month_closes: ['hr_costing.view:own', 'treasury.view'],
  payroll_payment_requests: ['approvals.approve', 'director_salary.view', 'hr_costing.create', 'hr_costing.edit', 'hr_costing.view:own', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.view', 'treasury.void'],
  payroll_runs: ['approvals.approve', 'approvals.view', 'billing.view', 'director_salary.approve', 'director_salary.view', 'hr_costing.approve', 'hr_costing.create', 'hr_costing.edit', 'hr_costing.view:own', 'treasury.approve', 'treasury.create', 'treasury.view', 'treasury.void'],
  payroll_statutory_voucher_lines: ['hr_costing.export', 'hr_costing.view:own', 'treasury.edit', 'treasury.export', 'treasury.view'],
  payroll_voucher_lines: ['hr_costing.export', 'hr_costing.view:own', 'reconciliation.create', 'reconciliation.edit', 'treasury.edit', 'treasury.export', 'treasury.view'],
  period_locks: ['approvals.approve', 'billing.create', 'billing.edit', 'billing.void', 'categories.view', 'claims.approve', 'director_salary.approve', 'director_salary.edit', 'hr_costing.approve', 'hr_costing.create', 'hr_costing.edit', 'my_billing.create:dept', 'settings.manage', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.void'],
  rent_splits: ['categories.view', 'settings.manage'],
  repayments: ['dept_pool.view:dept', 'reports.export', 'reports.view', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view'],
  report_layouts: ['dept_reports.export:dept', 'dept_reports.view:dept', 'reports.export', 'reports.view'],
  revenue_pay_lines: ['hr_costing.view:own', 'revenue.view:own'],
  sales_import_batches: ['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  sales_order_brand_picks: ['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  // The ERP audit trail (mig 20261013010000): whoever reads a month's bills.
  sales_order_erp_changes: ['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  sales_order_exclusions: ['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  sales_order_reassignments: ['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  sales_order_lines: ['product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  sales_order_open_bill_tags: ['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  sales_order_shares: ['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  sales_orders: ['product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
  service_contracts: ['billing.create', 'billing.edit', 'billing.view', 'my_billing.create:dept', 'my_billing.view:dept'],
  treasury_config: ['approvals.approve', 'categories.view', 'director_salary.approve', 'director_salary.edit', 'hr_costing.approve', 'settings.manage', 'treasury.approve', 'treasury.view'],
  treasury_terms_history: ['reports.export', 'reports.view', 'treasury.create', 'treasury.view'],
  // A person's boxes (mig 20261011010100): People › Permissions and the person window.
  user_permission_tabs: ['accounts.manage', 'accounts.view', 'team.view:own'],
  // A person's sub-department ticks (mig 20261016180000): read as their boxes are.
  user_sub_department_reach: ['accounts.manage', 'accounts.view', 'team.view:own'],
  // A person's Salary / NRIC / Bank ticks (mig 20261016210000): read as their boxes are.
  user_permission_sensitive: ['accounts.manage', 'accounts.view', 'team.view:own'],
  utility_splits: ['categories.view', 'settings.manage'],
  venture_pool: ['approvals.approve', 'billing.create', 'billing.view', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.view', 'treasury.void', 'venture_pool.create', 'venture_pool.edit'],
}

/**
 * Tables a domain policy opens that are NOT registered, and why — each is read
 * by every signed-in session, or by each person for their own rows.
 */
export const READS_WITHOUT_ACTION: Readonly<Record<string, string>> = {
  users: 'Every page reads the signed-in person’s own row (loadUser), and names beside records.',
  title_levels: 'Open to every signed-in session (auth.uid() IS NOT NULL) — the ladder every chart reads.',
  title_permissions: 'Open to every signed-in session (auth.uid() IS NOT NULL).',
  access_log: 'Each person’s own rows (row policy), and the audit pages.',
  audit_tables: 'Its own rule: Audit log, or the read_keys it lists.',
  user_permissions: 'Each person’s own rows, and the permissions pages.',
  user_permission_cells: 'Each person’s own cells, and the permissions pages.',
  member_requests: 'The member app’s own rule (member_requests / member_requests_manage).',
  hr_import_templates: 'Each person’s own saved import mappings.',
}

export function tableReadRows(): Array<{ table: string; actions: Want[] }> {
  return Object.entries(TABLE_READS).map(([table, actions]) => ({ table, actions: [...actions] }))
}
