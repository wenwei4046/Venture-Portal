-- ============================================================================
-- 20261009080000_reads_ask_for_the_action.sql
-- PR3d of the People Management revamp: the database asks for the action on a
-- READ too.
-- ============================================================================
--
-- A table's SELECT policies opened it to whoever held ANY key of its domain
-- (`has_scope(ARRAY['hr'])`) — and a domain is wide. The hr domain is
-- Director Pool, Director Salary, HR Costing, Revenue, People and the Salary
-- tick together: a title given Revenue alone could read every director's
-- payout and everybody's payroll through the API with its own session, no
-- page needed. Product List (admin domain) read the payroll too; Billing
-- (treasury domain) read the loans, the bank reconciliations, the GL.
--
-- Like the writes (PR3a, 20261009020000):
--   permission_table_reads   table → the actions, any one of which lets a
--                            session read it at all
--   may_read(table)          does the caller hold one of them (plpgsql: planned
--                            once per connection, ~0.8 ms — see 20261009070000)
--   needs_action_select      a RESTRICTIVE policy on each registered table
--
-- A restrictive policy only takes away: whoever the old policies refused is
-- still refused, and whoever they let in must ALSO hold one of the listed
-- actions. The row policies still say WHICH rows (Own / Dept, PR3c).
--
-- Each list is the actions under which somebody reads that table under their
-- own session (src/test/read-paths.ts, src/lib/permission-table-reads.ts is
-- the twin): the gate of every page and action that reads it — directly,
-- embedded, through a security_invoker view or a SECURITY INVOKER function —
-- its own writers (an UPDATE … WHERE reads the rows), the writers of a table
-- whose INVOKER trigger reads it, and the readers of a table whose own policy
-- reads it. Not registered (READS_WITHOUT_ACTION): tables every signed-in
-- session reads (users, title_levels, title_permissions) or that each person
-- reads for their own rows (access_log, user_permissions,
-- user_permission_cells, audit_tables, member_requests, hr_import_templates).
--
-- Three OWNER-rights views were readable whole by every signed-in session,
-- past every policy: hr_monthly_payroll_summary (each department's payroll
-- totals per month — one person's pay in a one-person department; nothing in
-- the app reads it), dept_pool_balances and fund_source_outstanding. They now
-- read under the caller's own policies (security_invoker), which give every
-- page that reads them what it read.
--
-- Production, 2026-10-09 (rolled-back dry run, every active login, row by row
-- per registered table, each view, and the INVOKER functions the pages call):
-- every page reads what it read. What moves is reads no page of theirs makes.

CREATE TABLE IF NOT EXISTS public.permission_table_reads (
  table_name text PRIMARY KEY,
  actions    text[] NOT NULL CHECK (cardinality(actions) > 0)
);

COMMENT ON TABLE public.permission_table_reads IS
  'PR3d: the actions, any one of which lets a session read the table at all (needs_action_select asks may_read). Twin of lib/permission-table-reads.ts.';

INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('alloc_categories', ARRAY['billing.create', 'billing.edit', 'billing.view']),
  ('alloc_company_settings', ARRAY['billing.create', 'billing.edit', 'billing.view']),
  ('alloc_staff', ARRAY['billing.create', 'billing.edit', 'billing.view']),
  ('alloc_staff_history', ARRAY['billing.create', 'billing.edit', 'billing.view']),
  ('alloc_staff_splits', ARRAY['billing.create', 'billing.edit', 'billing.view']),
  ('alloc_template_splits', ARRAY['billing.create', 'billing.edit', 'billing.view']),
  ('alloc_templates', ARRAY['billing.create', 'billing.edit', 'billing.view']),
  ('alloc_txn_details', ARRAY['billing.create', 'billing.edit', 'billing.view']),
  ('alloc_txns', ARRAY['billing.create', 'billing.edit', 'billing.view']),
  ('approval_requests', ARRAY['approvals.approve', 'approvals.view', 'billing.create', 'billing.edit', 'claims.approve', 'dept_pool.view:dept', 'director_salary.approve', 'hr_costing.approve', 'hr_costing.create', 'hr_costing.edit', 'hr_costing.view:own', 'my_billing.create:dept', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view', 'treasury.void']),
  ('ba_attachments', ARRAY['treasury.create', 'treasury.edit', 'treasury.view', 'treasury.void']),
  ('ba_facilities', ARRAY['treasury.create', 'treasury.edit', 'treasury.view', 'treasury.void']),
  ('ba_limits', ARRAY['treasury.create', 'treasury.edit', 'treasury.view']),
  ('bank_accounts', ARRAY['approvals.approve', 'approvals.view', 'billing.create', 'billing.view', 'categories.view', 'claims.approve', 'dept_pool.view:dept', 'director_salary.approve', 'hr_costing.approve', 'hr_costing.export', 'hr_costing.view:own', 'reconciliation.create', 'reconciliation.view', 'reports.export', 'reports.view', 'settings.manage', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view', 'venture_pool.view']),
  ('bank_recon_lines', ARRAY['reconciliation.approve', 'reconciliation.create', 'reconciliation.edit', 'reconciliation.view']),
  ('bank_recon_matches', ARRAY['reconciliation.approve', 'reconciliation.create', 'reconciliation.edit', 'reconciliation.view']),
  ('bank_recon_sessions', ARRAY['reconciliation.approve', 'reconciliation.create', 'reconciliation.edit', 'reconciliation.view']),
  ('base_rate_history', ARRAY['approvals.approve', 'categories.view', 'reports.export', 'reports.view', 'settings.manage', 'treasury.approve', 'treasury.create', 'treasury.view']),
  ('catalogue_combo_prices', ARRAY['product_list.edit', 'product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage']),
  ('catalogue_combos', ARRAY['product_list.edit', 'product_list.view', 'revenue.edit']),
  ('catalogue_models', ARRAY['product_list.edit', 'product_list.view']),
  ('catalogue_option_prices', ARRAY['product_list.edit', 'product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage']),
  ('catalogue_skus', ARRAY['product_list.edit', 'product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('claims', ARRAY['claims.approve', 'claims.view:own', 'reconciliation.create', 'reconciliation.edit', 'reports.export', 'reports.view']),
  ('comm_agent_aliases', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('comm_brands', ARRAY['product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('comm_cost_ratios', ARRAY['product_list.edit', 'product_list.view', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('comm_cutovers', ARRAY['revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('comm_direct_line_entitlements', ARRAY['revenue.view:own']),
  ('comm_direct_line_expansion_awards', ARRAY['revenue.view:own']),
  ('comm_director_pay', ARRAY['revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('comm_double_claim_dismissals', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('comm_hierarchy', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own', 'team.view:own']),
  ('comm_ignored_agents', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('comm_item_groups', ARRAY['revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('comm_kpi_items', ARRAY['revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('comm_kpi_thresholds', ARRAY['revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('comm_margin_bands', ARRAY['revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('comm_open_bill_months', ARRAY['revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('comm_open_bill_rules', ARRAY['revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('comm_order_releases', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('comm_organisers', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('comm_products', ARRAY['product_list.edit', 'revenue.create', 'revenue.edit']),
  ('comm_promotion_rules', ARRAY['revenue.manage', 'revenue.view:own']),
  ('comm_rank_defs', ARRAY['revenue.manage', 'revenue.view:own']),
  ('comm_ranks', ARRAY['revenue.edit', 'revenue.manage', 'revenue.view:own', 'team.create', 'team.view:own']),
  ('comm_runs', ARRAY['hr_costing.view:own', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('comm_salesperson_closes', ARRAY['hr_costing.view:own', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('comm_schemes', ARRAY['accounts.view', 'product_list.edit', 'product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own', 'team.create', 'team.view:own']),
  ('comm_statement_brand_margins', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('comm_statement_lines', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('comm_statements', ARRAY['hr_costing.view:own', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('comm_sub_department_directors', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own', 'team.view:own']),
  ('comm_sub_departments', ARRAY['accounts.view', 'hr_costing.view:own', 'product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own', 'team.create', 'team.view:own']),
  ('comm_title_promotions', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_upsales', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('comm_venue_events', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('comm_venues', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('commission_inputs', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('commission_rules', ARRAY['revenue.manage']),
  ('config_audit_log', ARRAY['audit_log.view']),
  ('credit_notes', ARRAY['approvals.approve', 'billing.create', 'billing.edit', 'billing.export', 'billing.view', 'billing.void', 'claims.approve', 'dept_reports.export:dept', 'dept_reports.view:dept', 'reports.view', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.void']),
  ('dept_payment_requests', ARRAY['approvals.approve', 'dept_pool.view:dept', 'my_billing.create:dept', 'reconciliation.create', 'reconciliation.edit', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.view', 'treasury.void']),
  ('dept_pools', ARRAY['approvals.approve', 'billing.create', 'dept_pool.view:dept', 'dept_reports.export:dept', 'dept_reports.view:dept', 'my_billing.create:dept', 'reports.export', 'reports.view', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view', 'treasury.void']),
  ('director_advance_offsets', ARRAY['approvals.approve', 'director_salary.approve', 'director_salary.edit']),
  ('director_ctc', ARRAY['director_salary.edit', 'director_salary.view']),
  ('director_monthly_payroll', ARRAY['approvals.approve', 'director_salary.approve', 'director_salary.edit', 'director_salary.view', 'hr_costing.approve', 'hr_costing.create', 'hr_costing.export', 'hr_costing.view:own', 'reconciliation.create', 'reconciliation.edit', 'treasury.approve']),
  ('director_payouts', ARRAY['approvals.approve', 'approvals.view', 'director_salary.approve', 'director_salary.edit', 'director_salary.view', 'hr_costing.approve', 'hr_costing.view:own', 'reconciliation.create', 'reconciliation.edit', 'treasury.approve', 'treasury.view']),
  ('director_salary_submissions', ARRAY['billing.view', 'director_salary.view', 'hr_costing.create']),
  ('directors', ARRAY['approvals.approve', 'approvals.view', 'categories.view', 'director_salary.approve', 'director_salary.edit', 'director_salary.view', 'hr_costing.approve', 'hr_costing.create', 'hr_costing.export', 'hr_costing.view:own', 'reconciliation.create', 'reconciliation.edit', 'reports.export', 'reports.view', 'settings.manage', 'treasury.approve', 'treasury.edit', 'treasury.export', 'treasury.view']),
  ('dp_companies', ARRAY['director_pool.edit', 'director_pool.view']),
  ('dp_contra', ARRAY['director_pool.edit', 'director_pool.view']),
  ('dp_director_inputs', ARRAY['director_pool.edit', 'director_pool.view']),
  ('dp_directors', ARRAY['director_pool.edit', 'director_pool.view']),
  ('dp_fixed_overrides', ARRAY['director_pool.edit', 'director_pool.view']),
  ('dp_inputs', ARRAY['director_pool.edit', 'director_pool.view']),
  ('dp_months', ARRAY['director_pool.edit', 'director_pool.view']),
  ('dp_settings', ARRAY['director_pool.edit', 'director_pool.view', 'director_salary.view']),
  ('erp_fabrics', ARRAY['product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage']),
  ('erp_feed_closed_months', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('erp_feed_settings', ARRAY['revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('erp_links', ARRAY['revenue.manage', 'revenue.view:own']),
  ('erp_maintenance_options', ARRAY['product_list.view', 'revenue.manage', 'revenue.view:own']),
  ('erp_product_models', ARRAY['product_list.view']),
  ('erp_products', ARRAY['product_list.edit', 'product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('erp_sofa_combos', ARRAY['product_list.view']),
  ('erp_sync_events', ARRAY['product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('fund_source_repayments', ARRAY['reports.export', 'reports.view', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view', 'treasury.void']),
  ('fund_sources', ARRAY['approvals.approve', 'approvals.view', 'categories.view', 'dept_pool.view:dept', 'director_salary.approve', 'hr_costing.approve', 'reports.export', 'reports.view', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view', 'treasury.void']),
  ('hr_cost_submissions', ARRAY['hr_costing.create', 'hr_costing.edit', 'hr_costing.view:own', 'treasury.create', 'treasury.edit']),
  ('hr_monthly_payroll', ARRAY['approvals.approve', 'approvals.view', 'dept_pool.view:dept', 'director_salary.approve', 'hr_costing.approve', 'hr_costing.create', 'hr_costing.edit', 'hr_costing.export', 'hr_costing.view:own', 'reconciliation.create', 'reconciliation.edit', 'revenue.view:own', 'treasury.approve', 'treasury.view']),
  ('hr_pool_allocation', ARRAY['hr_costing.create', 'hr_costing.edit']),
  ('hr_staff_allocation', ARRAY['billing.edit', 'billing.view', 'hr_costing.create', 'hr_costing.edit', 'hr_costing.view:own']),
  ('hr_staff_costs', ARRAY['accounts.create', 'accounts.manage', 'accounts.view', 'approvals.approve', 'approvals.view', 'billing.edit', 'dept_pool.view:dept', 'director_salary.approve', 'hr_costing.approve', 'hr_costing.create', 'hr_costing.edit', 'hr_costing.export', 'hr_costing.view:own', 'reconciliation.create', 'reconciliation.edit', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own', 'team.create', 'team.edit', 'team.view:own', 'treasury.approve', 'treasury.view']),
  ('invoice_lines', ARRAY['billing.create', 'billing.edit', 'billing.export', 'billing.view', 'dept_pool.view:dept', 'treasury.create']),
  ('invoice_payout_pool', ARRAY['approvals.approve', 'billing.create', 'director_salary.approve', 'director_salary.edit', 'reports.export', 'reports.view', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.view', 'treasury.void']),
  ('invoice_submission_requests', ARRAY['billing.create', 'billing.edit', 'billing.view', 'billing.void', 'dept_pool.view:dept', 'my_billing.create:dept']),
  ('invoices', ARRAY['approvals.approve', 'billing.create', 'billing.edit', 'billing.export', 'billing.view', 'billing.void', 'claims.approve', 'dept_pool.view:dept', 'dept_reports.export:dept', 'dept_reports.view:dept', 'hr_costing.view:own', 'my_billing.create:dept', 'my_billing.view:dept', 'reconciliation.create', 'reconciliation.edit', 'reports.export', 'reports.view', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view', 'treasury.void']),
  ('journal_entries', ARRAY['billing.void', 'categories.manage', 'dept_pool.view:dept', 'dept_reports.export:dept', 'dept_reports.view:dept', 'hr_costing.view:own', 'my_billing.view:dept', 'reconciliation.create', 'reconciliation.edit', 'reconciliation.view', 'reports.export', 'reports.view', 'treasury.create', 'treasury.export', 'treasury.view', 'treasury.void', 'venture_pool.view']),
  ('journal_lines', ARRAY['billing.void', 'categories.manage', 'dept_pool.view:dept', 'dept_reports.export:dept', 'dept_reports.view:dept', 'hr_costing.view:own', 'my_billing.view:dept', 'reconciliation.create', 'reconciliation.edit', 'reconciliation.view', 'reports.export', 'reports.view', 'treasury.create', 'treasury.export', 'treasury.view', 'treasury.void', 'venture_pool.view']),
  ('loans', ARRAY['approvals.approve', 'approvals.view', 'dept_pool.view:dept', 'director_salary.approve', 'hr_costing.approve', 'reports.export', 'reports.view', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view', 'treasury.void']),
  ('monthly_headcounts', ARRAY['billing.create', 'billing.edit', 'treasury.create', 'treasury.edit']),
  ('monthly_statement_lines', ARRAY['treasury.create', 'treasury.edit', 'treasury.view']),
  ('monthly_statements', ARRAY['treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view']),
  ('overdue_config', ARRAY['categories.view', 'settings.manage']),
  ('overdue_records', ARRAY['treasury.create', 'treasury.edit', 'treasury.view']),
  ('payment_attachments', ARRAY['approvals.approve', 'approvals.view', 'director_salary.approve', 'hr_costing.approve', 'hr_costing.view:own', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.view']),
  ('payment_voucher_sources', ARRAY['approvals.approve', 'approvals.view', 'billing.create', 'claims.approve', 'dept_pool.view:dept', 'director_salary.approve', 'hr_costing.approve', 'hr_costing.export', 'hr_costing.view:own', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view']),
  ('payment_vouchers', ARRAY['approvals.approve', 'approvals.view', 'billing.create', 'billing.export', 'billing.view', 'billing.void', 'claims.approve', 'dept_pool.view:dept', 'dept_reports.export:dept', 'dept_reports.view:dept', 'director_salary.approve', 'hr_costing.approve', 'hr_costing.export', 'hr_costing.view:own', 'reconciliation.create', 'reconciliation.edit', 'reports.export', 'reports.view', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view', 'treasury.void']),
  ('payroll_batch_lines', ARRAY['hr_costing.create', 'hr_costing.view:own']),
  ('payroll_batches', ARRAY['hr_costing.create', 'hr_costing.edit', 'hr_costing.view:own', 'treasury.approve', 'treasury.view', 'treasury.void']),
  ('payroll_month_closes', ARRAY['hr_costing.view:own', 'treasury.view']),
  ('payroll_payment_requests', ARRAY['approvals.approve', 'director_salary.view', 'hr_costing.create', 'hr_costing.edit', 'hr_costing.view:own', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.view', 'treasury.void']),
  ('payroll_runs', ARRAY['approvals.approve', 'approvals.view', 'billing.view', 'director_salary.approve', 'director_salary.view', 'hr_costing.approve', 'hr_costing.create', 'hr_costing.edit', 'hr_costing.view:own', 'treasury.approve', 'treasury.create', 'treasury.view', 'treasury.void']),
  ('payroll_statutory_voucher_lines', ARRAY['hr_costing.export', 'hr_costing.view:own', 'treasury.edit', 'treasury.export', 'treasury.view']),
  ('payroll_voucher_lines', ARRAY['hr_costing.export', 'hr_costing.view:own', 'reconciliation.create', 'reconciliation.edit', 'treasury.edit', 'treasury.export', 'treasury.view']),
  ('period_locks', ARRAY['approvals.approve', 'billing.create', 'billing.edit', 'billing.void', 'categories.view', 'claims.approve', 'director_salary.approve', 'director_salary.edit', 'hr_costing.approve', 'hr_costing.create', 'hr_costing.edit', 'my_billing.create:dept', 'settings.manage', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.void']),
  ('rent_splits', ARRAY['categories.view', 'settings.manage']),
  ('repayments', ARRAY['dept_pool.view:dept', 'reports.export', 'reports.view', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view']),
  ('report_layouts', ARRAY['dept_reports.export:dept', 'dept_reports.view:dept', 'reports.export', 'reports.view']),
  ('revenue_pay_lines', ARRAY['hr_costing.view:own', 'revenue.view:own']),
  ('sales_import_batches', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('sales_order_brand_picks', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('sales_order_exclusions', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('sales_order_lines', ARRAY['product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('sales_order_open_bill_tags', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('sales_order_shares', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('sales_orders', ARRAY['product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own']),
  ('service_contracts', ARRAY['billing.create', 'billing.edit', 'billing.view', 'my_billing.create:dept', 'my_billing.view:dept']),
  ('treasury_config', ARRAY['approvals.approve', 'categories.view', 'director_salary.approve', 'director_salary.edit', 'hr_costing.approve', 'settings.manage', 'treasury.approve', 'treasury.view']),
  ('treasury_terms_history', ARRAY['reports.export', 'reports.view', 'treasury.create', 'treasury.view']),
  ('utility_splits', ARRAY['categories.view', 'settings.manage']),
  ('venture_pool', ARRAY['approvals.approve', 'billing.create', 'billing.view', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.view', 'treasury.void', 'venture_pool.create', 'venture_pool.edit'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;

-- Every action must be one its function has, at a reach it may take.
DO $valid$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(DISTINCT r.table_name || ' ' || a, ', ') INTO v_bad
    FROM public.permission_table_reads r
   CROSS JOIN LATERAL unnest(r.actions) AS a
   WHERE NOT EXISTS (
     SELECT 1 FROM public.permission_functions f
      WHERE f.key = split_part(split_part(a, ':', 1), '.', 1)
        AND split_part(split_part(a, ':', 1), '.', 2) = ANY (f.actions)
        AND coalesce(nullif(split_part(a, ':', 2), ''), 'all') IN ('own', 'dept', 'all')
        AND (split_part(a, ':', 2) = '' OR split_part(a, ':', 2) = ANY (f.scopes)));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'permission_table_reads names actions no function has: %', v_bad;
  END IF;
END $valid$;

ALTER TABLE public.permission_table_reads ENABLE ROW LEVEL SECURITY;
DO $read$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'permission_table_reads'
                  AND policyname = 'permission_table_reads_read') THEN
    CREATE POLICY permission_table_reads_read ON public.permission_table_reads FOR SELECT TO authenticated USING (true);
  END IF;
END $read$;
REVOKE ALL ON public.permission_table_reads FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.permission_table_reads TO authenticated;

SELECT public.audit_register('permission_table_reads', 'Table reads', 'People', '{permissions_manage}',
  p_keys => '{table_name}', p_labels => '{table_name}');

-- ─── The question ───────────────────────────────────────────────────────────
-- plpgsql, not sql: a SECURITY DEFINER sql function is planned again on every
-- call, and every read of a registered table asks this once.

CREATE OR REPLACE FUNCTION public.may_read(p_table text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  RETURN coalesce((SELECT public.has_any_action(r.actions)
                     FROM public.permission_table_reads r
                    WHERE r.table_name = p_table), false);
END
$fn$;

COMMENT ON FUNCTION public.may_read(text) IS
  'The needs_action_select restrictive policy''s question: may the caller read this table at all (permission_table_reads). No row = no.';

REVOKE ALL ON FUNCTION public.may_read(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.may_read(text) TO authenticated, service_role;

-- ─── The policies ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.permission_reads_guard(p_table text)
RETURNS integer
LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE
  v_ask text := format('(SELECT public.may_read(%L))', p_table);
BEGIN
  IF to_regclass('public.' || quote_ident(p_table)) IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.permission_table_reads WHERE table_name = p_table) THEN
    RETURN 0;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = p_table AND policyname = 'needs_action_select') THEN
    EXECUTE format('ALTER POLICY needs_action_select ON public.%I TO authenticated USING (%s)', p_table, v_ask);
  ELSE
    EXECUTE format('CREATE POLICY needs_action_select ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (%s)', p_table, v_ask);
  END IF;
  RETURN 1;
END
$fn$;

COMMENT ON FUNCTION public.permission_reads_guard(text) IS
  'Gives a table its needs_action_select restrictive policy from permission_table_reads. For migrations: a new table a domain policy lets somebody read gets its row there, then this.';

REVOKE ALL ON FUNCTION public.permission_reads_guard(text) FROM PUBLIC, anon, authenticated;

SELECT public.permission_reads_guard(r.table_name) FROM public.permission_table_reads r;

-- ─── The owner-rights views read under the caller's policies ────────────────

DO $views$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['hr_monthly_payroll_summary', 'dept_pool_balances', 'fund_source_outstanding'] LOOP
    IF to_regclass('public.' || v) IS NOT NULL THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
    END IF;
  END LOOP;
END $views$;

-- ─── Nothing a domain policy opens is left without an action ────────────────

DO $guard$
DECLARE
  v_missing text;
  v_views   text;
BEGIN
  SELECT string_agg(DISTINCT p.tablename::text, ', ') INTO v_missing
    FROM pg_policies p
   WHERE p.schemaname = 'public'
     AND p.permissive = 'PERMISSIVE'
     AND p.cmd IN ('SELECT', 'ALL')
     AND p.roles && ARRAY['public', 'authenticated']::name[]
     AND coalesce(p.qual, '') ~ '(has_scope|has_perm)\('
     -- READS_WITHOUT_ACTION (lib/permission-table-reads.ts).
     AND p.tablename NOT IN ('users', 'title_levels', 'title_permissions', 'access_log', 'audit_tables',
                             'user_permissions', 'user_permission_cells', 'member_requests', 'hr_import_templates')
     AND NOT (EXISTS (SELECT 1 FROM public.permission_table_reads r WHERE r.table_name = p.tablename)
              AND EXISTS (SELECT 1 FROM pg_policies x
                           WHERE x.schemaname = 'public' AND x.tablename = p.tablename
                             AND x.policyname = 'needs_action_select' AND x.permissive = 'RESTRICTIVE'));
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'A domain policy lets these be read without asking for an action: %', v_missing;
  END IF;

  -- A view in public reads under its owner unless told otherwise: past every policy.
  SELECT string_agg(c.relname, ', ') INTO v_views
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v'
     AND NOT coalesce(c.reloptions @> ARRAY['security_invoker=true'], false)
     AND has_table_privilege('authenticated', c.oid, 'SELECT');
  IF v_views IS NOT NULL THEN
    RAISE EXCEPTION 'Views a session reads past every policy: %', v_views;
  END IF;
END $guard$;

NOTIFY pgrst, 'reload schema';
