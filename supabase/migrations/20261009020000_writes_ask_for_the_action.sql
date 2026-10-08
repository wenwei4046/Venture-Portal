-- ============================================================================
-- 20261009020000_writes_ask_for_the_action.sql
-- The database asks for the action too (PR3a of the People Management revamp).
-- ============================================================================
--
-- PR2 (20261008200000) made every write in the app ask for the action it is —
-- requireAction('treasury', 'create') — but the database kept asking for a
-- DOMAIN: a table's row policies let in whoever held any key of it
-- (`has_scope(ARRAY['treasury'])`), and a key is opened by a View cell. So with
-- their own session and the API, somebody whose template only reads Treasury
-- could still raise a payment voucher, a Finance · Checker could edit the
-- vouchers they approve, and a Director who sees the roster could rewrite the
-- payroll (user: every cell must truly take effect).
--
-- Now every table such a policy lets somebody write asks, per command, for one
-- of the actions under which the app writes it:
--
--   permission_table_writes      table × command → the actions that may write
--                                it ('fn.action', or 'fn.action:dept' / ':own'
--                                for at least that reach). Twin:
--                                TABLE_WRITES in lib/permission-table-writes.ts.
--   has_any_action(wants)        does the caller hold one of them (has_action's
--                                rule: the action at least that far, and one of
--                                the keys that open the function's pages).
--   may_write(table, command)    has_any_action of that row; no row = no.
--   needs_action_insert/_update/_delete
--                                one RESTRICTIVE policy per registered command,
--                                asking may_write — so it can only take away:
--                                whoever the old policies refused is still
--                                refused, and whoever they let in must also
--                                hold one of the actions.
--
-- The lists are the gates of every way the app writes each table under the
-- caller's own session: server actions writing it straight, the SECURITY
-- INVOKER functions they call (Revenue, the Product List, the ladder), and the
-- INVOKER triggers that write on their behalf (a payment voucher marks its
-- invoice paid, so whoever may write a voucher may write that). Writes inside
-- SECURITY DEFINER functions meet no row policy — those ask for their own
-- action (the next step).
--
-- NOBODY'S ACCESS IN THE APP MOVES. The four shared accounts hold what their
-- keys allowed (permission_key_actions), which covers every gate the app has;
-- what they lose is only the API's reach past their own pages (Finance writing
-- Director Salary's payouts, HR the Venture Pool ledger). Titled people get
-- exactly their cells, here as in the app.
--
-- And the end of this file refuses to finish while any table a domain policy
-- lets somebody write is left without a registered action
-- (WRITES_WITHOUT_ACTION names the one exception).

-- ─── The registry ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.permission_table_writes (
  table_name text NOT NULL,
  command    text NOT NULL CHECK (command IN ('INSERT', 'UPDATE', 'DELETE')),
  actions    text[] NOT NULL CHECK (cardinality(actions) > 0),
  PRIMARY KEY (table_name, command)
);

COMMENT ON TABLE public.permission_table_writes IS
  'What the database asks of a write (2026-10-09): table × command → the actions (fn.action[:dept|:own]) one of which the caller must hold. Read by may_write() in the needs_action_* restrictive policies. Twin: TABLE_WRITES in lib/permission-table-writes.ts.';

INSERT INTO public.permission_table_writes (table_name, command, actions) VALUES
  ('alloc_categories', 'INSERT', ARRAY['billing.create', 'billing.edit']),
  ('alloc_categories', 'UPDATE', ARRAY['billing.create', 'billing.edit']),
  ('alloc_categories', 'DELETE', ARRAY['billing.create', 'billing.edit']),
  ('alloc_company_settings', 'INSERT', ARRAY['billing.create', 'billing.edit']),
  ('alloc_company_settings', 'UPDATE', ARRAY['billing.create', 'billing.edit']),
  ('alloc_company_settings', 'DELETE', ARRAY['billing.create', 'billing.edit']),
  ('alloc_staff', 'INSERT', ARRAY['billing.create', 'billing.edit']),
  ('alloc_staff', 'UPDATE', ARRAY['billing.create', 'billing.edit']),
  ('alloc_staff', 'DELETE', ARRAY['billing.create', 'billing.edit']),
  ('alloc_staff_history', 'INSERT', ARRAY['billing.create', 'billing.edit']),
  ('alloc_staff_history', 'UPDATE', ARRAY['billing.create', 'billing.edit']),
  ('alloc_staff_history', 'DELETE', ARRAY['billing.create', 'billing.edit']),
  ('alloc_staff_splits', 'INSERT', ARRAY['billing.create', 'billing.edit']),
  ('alloc_staff_splits', 'UPDATE', ARRAY['billing.create', 'billing.edit']),
  ('alloc_staff_splits', 'DELETE', ARRAY['billing.create', 'billing.edit']),
  ('alloc_template_splits', 'INSERT', ARRAY['billing.create', 'billing.edit']),
  ('alloc_template_splits', 'UPDATE', ARRAY['billing.create', 'billing.edit']),
  ('alloc_template_splits', 'DELETE', ARRAY['billing.create', 'billing.edit']),
  ('alloc_templates', 'INSERT', ARRAY['billing.create', 'billing.edit']),
  ('alloc_templates', 'UPDATE', ARRAY['billing.create', 'billing.edit']),
  ('alloc_templates', 'DELETE', ARRAY['billing.create', 'billing.edit']),
  ('alloc_txn_details', 'INSERT', ARRAY['billing.create', 'billing.edit']),
  ('alloc_txn_details', 'UPDATE', ARRAY['billing.create', 'billing.edit']),
  ('alloc_txn_details', 'DELETE', ARRAY['billing.create', 'billing.edit']),
  ('alloc_txns', 'INSERT', ARRAY['billing.create', 'billing.edit']),
  ('alloc_txns', 'UPDATE', ARRAY['billing.create', 'billing.edit']),
  ('alloc_txns', 'DELETE', ARRAY['billing.create', 'billing.edit']),
  ('approval_requests', 'INSERT', ARRAY['billing.create', 'my_billing.create:dept', 'claims.approve', 'treasury.create', 'treasury.void', 'hr_costing.create']),
  ('approval_requests', 'UPDATE', ARRAY['treasury.approve', 'approvals.approve', 'hr_costing.approve', 'director_salary.approve', 'treasury.create', 'treasury.edit', 'treasury.void', 'billing.create', 'billing.edit', 'my_billing.create:dept', 'hr_costing.create', 'hr_costing.edit']),
  ('ba_attachments', 'INSERT', ARRAY['treasury.create', 'treasury.edit']),
  ('ba_attachments', 'UPDATE', ARRAY['treasury.create', 'treasury.edit']),
  ('ba_attachments', 'DELETE', ARRAY['treasury.create', 'treasury.edit']),
  ('ba_facilities', 'INSERT', ARRAY['treasury.create', 'treasury.edit']),
  ('ba_facilities', 'UPDATE', ARRAY['treasury.create', 'treasury.edit', 'treasury.void']),
  ('ba_facilities', 'DELETE', ARRAY['treasury.edit', 'treasury.void']),
  ('ba_limits', 'INSERT', ARRAY['treasury.create', 'treasury.edit']),
  ('ba_limits', 'UPDATE', ARRAY['treasury.create', 'treasury.edit']),
  ('ba_limits', 'DELETE', ARRAY['treasury.create', 'treasury.edit']),
  ('bank_accounts', 'INSERT', ARRAY['settings.manage']),
  ('bank_accounts', 'UPDATE', ARRAY['treasury.approve', 'approvals.approve', 'settings.manage']),
  ('bank_recon_lines', 'INSERT', ARRAY['reconciliation.create', 'reconciliation.edit', 'reconciliation.approve']),
  ('bank_recon_lines', 'UPDATE', ARRAY['reconciliation.create', 'reconciliation.edit', 'reconciliation.approve']),
  ('bank_recon_lines', 'DELETE', ARRAY['reconciliation.create', 'reconciliation.edit', 'reconciliation.approve']),
  ('bank_recon_matches', 'INSERT', ARRAY['reconciliation.create', 'reconciliation.edit', 'reconciliation.approve']),
  ('bank_recon_matches', 'UPDATE', ARRAY['reconciliation.create', 'reconciliation.edit', 'reconciliation.approve']),
  ('bank_recon_matches', 'DELETE', ARRAY['reconciliation.create', 'reconciliation.edit', 'reconciliation.approve']),
  ('bank_recon_sessions', 'INSERT', ARRAY['reconciliation.create', 'reconciliation.edit', 'reconciliation.approve']),
  ('bank_recon_sessions', 'UPDATE', ARRAY['reconciliation.create', 'reconciliation.edit', 'reconciliation.approve']),
  ('bank_recon_sessions', 'DELETE', ARRAY['reconciliation.create', 'reconciliation.edit', 'reconciliation.approve']),
  ('base_rate_history', 'INSERT', ARRAY['settings.manage', 'treasury.approve', 'approvals.approve']),
  ('base_rate_history', 'UPDATE', ARRAY['settings.manage', 'treasury.approve', 'approvals.approve']),
  ('catalogue_combo_prices', 'INSERT', ARRAY['product_list.edit']),
  ('catalogue_combo_prices', 'UPDATE', ARRAY['product_list.edit']),
  ('catalogue_combo_prices', 'DELETE', ARRAY['product_list.edit']),
  ('catalogue_combos', 'INSERT', ARRAY['product_list.edit']),
  ('catalogue_combos', 'UPDATE', ARRAY['product_list.edit']),
  ('catalogue_combos', 'DELETE', ARRAY['product_list.edit']),
  ('catalogue_models', 'INSERT', ARRAY['product_list.edit']),
  ('catalogue_models', 'UPDATE', ARRAY['product_list.edit']),
  ('catalogue_models', 'DELETE', ARRAY['product_list.edit']),
  ('catalogue_option_prices', 'INSERT', ARRAY['product_list.edit']),
  ('catalogue_option_prices', 'UPDATE', ARRAY['product_list.edit']),
  ('catalogue_option_prices', 'DELETE', ARRAY['product_list.edit']),
  ('catalogue_skus', 'INSERT', ARRAY['product_list.edit']),
  ('catalogue_skus', 'UPDATE', ARRAY['product_list.edit']),
  ('catalogue_skus', 'DELETE', ARRAY['product_list.edit']),
  ('chart_of_accounts', 'INSERT', ARRAY['categories.manage']),
  ('chart_of_accounts', 'UPDATE', ARRAY['categories.manage']),
  ('claims', 'UPDATE', ARRAY['claims.approve']),
  ('comm_agent_aliases', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_agent_aliases', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_agent_aliases', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_brands', 'INSERT', ARRAY['revenue.manage']),
  ('comm_brands', 'UPDATE', ARRAY['revenue.manage']),
  ('comm_brands', 'DELETE', ARRAY['revenue.manage']),
  ('comm_cost_ratios', 'INSERT', ARRAY['revenue.manage', 'product_list.edit']),
  ('comm_cost_ratios', 'UPDATE', ARRAY['revenue.manage', 'product_list.edit']),
  ('comm_cost_ratios', 'DELETE', ARRAY['revenue.manage', 'product_list.edit']),
  ('comm_cutovers', 'INSERT', ARRAY['revenue.manage']),
  ('comm_cutovers', 'UPDATE', ARRAY['revenue.manage']),
  ('comm_cutovers', 'DELETE', ARRAY['revenue.manage']),
  ('comm_director_pay', 'INSERT', ARRAY['revenue.manage']),
  ('comm_director_pay', 'UPDATE', ARRAY['revenue.manage']),
  ('comm_director_pay', 'DELETE', ARRAY['revenue.manage']),
  ('comm_double_claim_dismissals', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_double_claim_dismissals', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_double_claim_dismissals', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_hierarchy', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_hierarchy', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_hierarchy', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_ignored_agents', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_ignored_agents', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_ignored_agents', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_item_groups', 'INSERT', ARRAY['revenue.manage']),
  ('comm_item_groups', 'UPDATE', ARRAY['revenue.manage']),
  ('comm_item_groups', 'DELETE', ARRAY['revenue.manage']),
  ('comm_kpi_items', 'INSERT', ARRAY['revenue.manage']),
  ('comm_kpi_items', 'UPDATE', ARRAY['revenue.manage']),
  ('comm_kpi_items', 'DELETE', ARRAY['revenue.manage']),
  ('comm_kpi_thresholds', 'INSERT', ARRAY['revenue.manage']),
  ('comm_kpi_thresholds', 'UPDATE', ARRAY['revenue.manage']),
  ('comm_kpi_thresholds', 'DELETE', ARRAY['revenue.manage']),
  ('comm_margin_bands', 'INSERT', ARRAY['revenue.manage']),
  ('comm_margin_bands', 'UPDATE', ARRAY['revenue.manage']),
  ('comm_margin_bands', 'DELETE', ARRAY['revenue.manage']),
  ('comm_open_bill_months', 'INSERT', ARRAY['revenue.manage']),
  ('comm_open_bill_months', 'UPDATE', ARRAY['revenue.manage']),
  ('comm_open_bill_months', 'DELETE', ARRAY['revenue.manage']),
  ('comm_open_bill_rules', 'INSERT', ARRAY['revenue.manage']),
  ('comm_open_bill_rules', 'UPDATE', ARRAY['revenue.manage']),
  ('comm_open_bill_rules', 'DELETE', ARRAY['revenue.manage']),
  ('comm_order_releases', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_order_releases', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_order_releases', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_organisers', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_organisers', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_organisers', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_products', 'INSERT', ARRAY['product_list.edit']),
  ('comm_products', 'UPDATE', ARRAY['product_list.edit']),
  ('comm_products', 'DELETE', ARRAY['product_list.edit']),
  ('comm_promotion_rules', 'INSERT', ARRAY['revenue.manage']),
  ('comm_promotion_rules', 'UPDATE', ARRAY['revenue.manage']),
  ('comm_promotion_rules', 'DELETE', ARRAY['revenue.manage']),
  ('comm_rank_defs', 'INSERT', ARRAY['revenue.manage']),
  ('comm_rank_defs', 'UPDATE', ARRAY['revenue.manage']),
  ('comm_rank_defs', 'DELETE', ARRAY['revenue.manage']),
  ('comm_ranks', 'INSERT', ARRAY['revenue.manage']),
  ('comm_ranks', 'UPDATE', ARRAY['revenue.manage']),
  ('comm_ranks', 'DELETE', ARRAY['revenue.manage']),
  ('comm_runs', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_runs', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_runs', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_salesperson_closes', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_salesperson_closes', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_schemes', 'INSERT', ARRAY['revenue.manage', 'product_list.edit']),
  ('comm_schemes', 'UPDATE', ARRAY['revenue.manage', 'product_list.edit']),
  ('comm_schemes', 'DELETE', ARRAY['revenue.manage', 'product_list.edit']),
  ('comm_statement_brand_margins', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_statement_brand_margins', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_statement_brand_margins', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_statement_lines', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_statement_lines', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_statement_lines', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_statements', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_statements', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_statements', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_sub_department_directors', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_sub_department_directors', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_sub_department_directors', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_sub_departments', 'INSERT', ARRAY['revenue.manage']),
  ('comm_sub_departments', 'UPDATE', ARRAY['revenue.manage']),
  ('comm_sub_departments', 'DELETE', ARRAY['revenue.manage']),
  ('comm_title_promotions', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_title_promotions', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_title_promotions', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_upsales', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_upsales', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_upsales', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_venue_events', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_venue_events', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_venue_events', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_venues', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_venues', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('comm_venues', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('commission_inputs', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('commission_inputs', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('commission_inputs', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('commission_rules', 'INSERT', ARRAY['revenue.manage']),
  ('commission_rules', 'UPDATE', ARRAY['revenue.manage']),
  ('commission_rules', 'DELETE', ARRAY['revenue.manage']),
  ('companies', 'INSERT', ARRAY['settings.manage']),
  ('companies', 'UPDATE', ARRAY['settings.manage']),
  ('credit_notes', 'INSERT', ARRAY['billing.create']),
  ('credit_notes', 'UPDATE', ARRAY['billing.create', 'billing.edit', 'billing.void', 'treasury.approve']),
  ('credit_notes', 'DELETE', ARRAY['billing.create', 'billing.edit']),
  ('departments', 'INSERT', ARRAY['categories.manage', 'settings.manage']),
  ('departments', 'UPDATE', ARRAY['categories.manage', 'settings.manage']),
  ('dept_payment_requests', 'INSERT', ARRAY['my_billing.create:dept', 'treasury.create']),
  ('dept_payment_requests', 'UPDATE', ARRAY['treasury.create', 'treasury.edit', 'treasury.void', 'treasury.approve', 'approvals.approve', 'my_billing.create:dept']),
  ('dept_payment_requests', 'DELETE', ARRAY['treasury.edit', 'treasury.void', 'my_billing.create:dept']),
  ('dept_pools', 'INSERT', ARRAY['treasury.create', 'treasury.edit', 'treasury.void', 'treasury.approve', 'approvals.approve', 'billing.create', 'my_billing.create:dept']),
  ('director_advance_offsets', 'INSERT', ARRAY['director_salary.edit', 'director_salary.approve', 'approvals.approve']),
  ('director_ctc', 'INSERT', ARRAY['director_salary.edit']),
  ('director_ctc', 'UPDATE', ARRAY['director_salary.edit']),
  ('director_ctc', 'DELETE', ARRAY['director_salary.edit']),
  ('director_monthly_payroll', 'INSERT', ARRAY['director_salary.edit']),
  ('director_monthly_payroll', 'UPDATE', ARRAY['director_salary.edit']),
  ('director_monthly_payroll', 'DELETE', ARRAY['director_salary.edit']),
  ('director_payouts', 'INSERT', ARRAY['director_salary.edit']),
  ('director_payouts', 'UPDATE', ARRAY['director_salary.edit', 'director_salary.approve', 'approvals.approve']),
  ('directors', 'INSERT', ARRAY['director_salary.edit', 'settings.manage']),
  ('directors', 'UPDATE', ARRAY['director_salary.edit', 'settings.manage']),
  ('dp_companies', 'INSERT', ARRAY['director_pool.edit']),
  ('dp_companies', 'UPDATE', ARRAY['director_pool.edit']),
  ('dp_companies', 'DELETE', ARRAY['director_pool.edit']),
  ('dp_contra', 'INSERT', ARRAY['director_pool.edit']),
  ('dp_contra', 'UPDATE', ARRAY['director_pool.edit']),
  ('dp_contra', 'DELETE', ARRAY['director_pool.edit']),
  ('dp_director_inputs', 'INSERT', ARRAY['director_pool.edit']),
  ('dp_director_inputs', 'UPDATE', ARRAY['director_pool.edit']),
  ('dp_director_inputs', 'DELETE', ARRAY['director_pool.edit']),
  ('dp_directors', 'INSERT', ARRAY['director_pool.edit']),
  ('dp_directors', 'UPDATE', ARRAY['director_pool.edit']),
  ('dp_directors', 'DELETE', ARRAY['director_pool.edit']),
  ('dp_fixed_overrides', 'INSERT', ARRAY['director_pool.edit']),
  ('dp_fixed_overrides', 'UPDATE', ARRAY['director_pool.edit']),
  ('dp_fixed_overrides', 'DELETE', ARRAY['director_pool.edit']),
  ('dp_inputs', 'INSERT', ARRAY['director_pool.edit']),
  ('dp_inputs', 'UPDATE', ARRAY['director_pool.edit']),
  ('dp_inputs', 'DELETE', ARRAY['director_pool.edit']),
  ('dp_months', 'INSERT', ARRAY['director_pool.edit']),
  ('dp_months', 'UPDATE', ARRAY['director_pool.edit']),
  ('dp_months', 'DELETE', ARRAY['director_pool.edit']),
  ('dp_settings', 'INSERT', ARRAY['director_pool.edit']),
  ('dp_settings', 'UPDATE', ARRAY['director_pool.edit']),
  ('dp_settings', 'DELETE', ARRAY['director_pool.edit']),
  ('eis_act800_schedule', 'INSERT', ARRAY['settings.manage']),
  ('eis_act800_schedule', 'UPDATE', ARRAY['settings.manage']),
  ('epf_third_schedule', 'INSERT', ARRAY['settings.manage']),
  ('epf_third_schedule', 'UPDATE', ARRAY['settings.manage']),
  ('erp_feed_closed_months', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('erp_feed_closed_months', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('erp_feed_closed_months', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('erp_feed_settings', 'INSERT', ARRAY['revenue.manage']),
  ('erp_feed_settings', 'UPDATE', ARRAY['revenue.manage']),
  ('erp_feed_settings', 'DELETE', ARRAY['revenue.manage']),
  ('erp_links', 'INSERT', ARRAY['revenue.manage']),
  ('erp_links', 'UPDATE', ARRAY['revenue.manage']),
  ('erp_links', 'DELETE', ARRAY['revenue.manage']),
  ('erp_sync_events', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('erp_sync_events', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('erp_sync_events', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('fund_source_repayments', 'INSERT', ARRAY['treasury.create', 'treasury.edit', 'treasury.void']),
  ('fund_sources', 'INSERT', ARRAY['treasury.create']),
  ('fund_sources', 'UPDATE', ARRAY['treasury.create', 'treasury.edit', 'treasury.void', 'treasury.approve', 'approvals.approve']),
  ('hr_cost_submissions', 'INSERT', ARRAY['hr_costing.create', 'hr_costing.edit']),
  ('hr_cost_submissions', 'UPDATE', ARRAY['hr_costing.create', 'hr_costing.edit', 'treasury.create', 'treasury.edit']),
  ('hr_import_templates', 'INSERT', ARRAY['hr_costing.create', 'hr_costing.edit', 'team.create', 'team.edit']),
  ('hr_import_templates', 'UPDATE', ARRAY['hr_costing.create', 'hr_costing.edit', 'team.create', 'team.edit']),
  ('hr_import_templates', 'DELETE', ARRAY['hr_costing.create', 'hr_costing.edit', 'team.create', 'team.edit']),
  ('hr_monthly_payroll', 'INSERT', ARRAY['hr_costing.create', 'hr_costing.edit']),
  ('hr_monthly_payroll', 'UPDATE', ARRAY['hr_costing.create', 'hr_costing.edit']),
  ('hr_monthly_payroll', 'DELETE', ARRAY['hr_costing.create', 'hr_costing.edit']),
  ('hr_pool_allocation', 'INSERT', ARRAY['hr_costing.create', 'hr_costing.edit']),
  ('hr_pool_allocation', 'UPDATE', ARRAY['hr_costing.create', 'hr_costing.edit']),
  ('hr_staff_allocation', 'INSERT', ARRAY['hr_costing.create', 'hr_costing.edit']),
  ('hr_staff_allocation', 'UPDATE', ARRAY['hr_costing.create', 'hr_costing.edit']),
  ('hr_staff_allocation', 'DELETE', ARRAY['hr_costing.create', 'hr_costing.edit']),
  ('hr_staff_costs', 'INSERT', ARRAY['team.create']),
  ('hr_staff_costs', 'UPDATE', ARRAY['team.create', 'team.edit', 'revenue.edit', 'accounts.create']),
  ('hr_staff_costs', 'DELETE', ARRAY['team.edit']),
  ('invoice_lines', 'INSERT', ARRAY['billing.create', 'billing.edit']),
  ('invoice_lines', 'UPDATE', ARRAY['billing.create', 'billing.edit']),
  ('invoice_lines', 'DELETE', ARRAY['billing.create', 'billing.edit']),
  ('invoice_payout_pool', 'INSERT', ARRAY['treasury.create', 'treasury.edit', 'treasury.void', 'treasury.approve', 'approvals.approve', 'billing.create', 'director_salary.approve', 'director_salary.edit']),
  ('invoice_submission_requests', 'INSERT', ARRAY['my_billing.create:dept', 'billing.create']),
  ('invoice_submission_requests', 'UPDATE', ARRAY['billing.create', 'billing.edit', 'billing.void', 'my_billing.create:dept']),
  ('invoice_submission_requests', 'DELETE', ARRAY['billing.edit', 'billing.void', 'my_billing.create:dept']),
  ('invoices', 'INSERT', ARRAY['billing.create', 'my_billing.create:dept']),
  ('invoices', 'UPDATE', ARRAY['billing.create', 'billing.edit', 'billing.void', 'my_billing.create:dept', 'treasury.create', 'treasury.edit', 'treasury.void', 'treasury.approve', 'approvals.approve', 'claims.approve']),
  ('invoices', 'DELETE', ARRAY['billing.create', 'billing.edit', 'my_billing.create:dept']),
  ('journal_entries', 'INSERT', ARRAY['reconciliation.create', 'reconciliation.edit']),
  ('journal_lines', 'INSERT', ARRAY['reconciliation.create', 'reconciliation.edit']),
  ('loans', 'INSERT', ARRAY['treasury.create']),
  ('loans', 'UPDATE', ARRAY['treasury.create', 'treasury.edit', 'treasury.void', 'treasury.approve', 'approvals.approve']),
  ('monthly_headcounts', 'INSERT', ARRAY['treasury.create', 'treasury.edit', 'billing.create', 'billing.edit']),
  ('monthly_headcounts', 'UPDATE', ARRAY['treasury.create', 'treasury.edit', 'billing.create', 'billing.edit']),
  ('monthly_statement_lines', 'INSERT', ARRAY['treasury.create', 'treasury.edit']),
  ('monthly_statement_lines', 'DELETE', ARRAY['treasury.create', 'treasury.edit']),
  ('monthly_statements', 'INSERT', ARRAY['treasury.create', 'treasury.edit']),
  ('monthly_statements', 'UPDATE', ARRAY['treasury.create', 'treasury.edit']),
  ('overdue_config', 'INSERT', ARRAY['settings.manage']),
  ('overdue_config', 'UPDATE', ARRAY['settings.manage']),
  ('overdue_records', 'INSERT', ARRAY['treasury.create', 'treasury.edit']),
  ('overdue_records', 'UPDATE', ARRAY['treasury.create', 'treasury.edit']),
  ('payment_attachments', 'INSERT', ARRAY['treasury.create', 'treasury.edit']),
  ('payment_voucher_sources', 'INSERT', ARRAY['treasury.create', 'treasury.edit', 'billing.create', 'claims.approve']),
  ('payment_voucher_sources', 'UPDATE', ARRAY['treasury.create', 'treasury.edit']),
  ('payment_voucher_sources', 'DELETE', ARRAY['treasury.create', 'treasury.edit']),
  ('payment_vouchers', 'INSERT', ARRAY['treasury.create', 'billing.create', 'claims.approve']),
  ('payment_vouchers', 'UPDATE', ARRAY['treasury.create', 'treasury.edit', 'treasury.void', 'treasury.approve', 'approvals.approve']),
  ('payroll_payment_requests', 'INSERT', ARRAY['hr_costing.create']),
  ('payroll_payment_requests', 'UPDATE', ARRAY['hr_costing.create', 'hr_costing.edit', 'treasury.create', 'treasury.edit', 'treasury.void', 'treasury.approve', 'approvals.approve']),
  ('payroll_payment_requests', 'DELETE', ARRAY['hr_costing.edit']),
  ('payroll_runs', 'INSERT', ARRAY['hr_costing.create', 'hr_costing.edit']),
  ('payroll_runs', 'UPDATE', ARRAY['hr_costing.create', 'hr_costing.edit', 'hr_costing.approve', 'approvals.approve', 'treasury.void', 'treasury.approve']),
  ('payroll_runs', 'DELETE', ARRAY['hr_costing.edit']),
  ('pcb_jadual', 'INSERT', ARRAY['settings.manage']),
  ('pcb_jadual', 'UPDATE', ARRAY['settings.manage']),
  ('period_locks', 'INSERT', ARRAY['settings.manage']),
  ('period_locks', 'UPDATE', ARRAY['settings.manage']),
  ('rent_splits', 'INSERT', ARRAY['settings.manage']),
  ('rent_splits', 'UPDATE', ARRAY['settings.manage']),
  ('rent_splits', 'DELETE', ARRAY['settings.manage']),
  ('repayments', 'INSERT', ARRAY['treasury.create', 'treasury.edit']),
  ('report_layouts', 'INSERT', ARRAY['reports.view', 'reports.export']),
  ('report_layouts', 'UPDATE', ARRAY['reports.view', 'reports.export']),
  ('report_layouts', 'DELETE', ARRAY['reports.view', 'reports.export']),
  ('sales_import_batches', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_import_batches', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_import_batches', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_order_brand_picks', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_order_brand_picks', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_order_brand_picks', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_order_exclusions', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_order_exclusions', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_order_exclusions', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_order_lines', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_order_lines', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_order_lines', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_order_open_bill_tags', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_order_open_bill_tags', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_order_open_bill_tags', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_order_shares', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_order_shares', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_order_shares', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_orders', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_orders', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_orders', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('service_contracts', 'INSERT', ARRAY['billing.create', 'my_billing.create:dept']),
  ('service_contracts', 'UPDATE', ARRAY['billing.create', 'billing.edit']),
  ('socso_act4_schedule', 'INSERT', ARRAY['settings.manage']),
  ('socso_act4_schedule', 'UPDATE', ARRAY['settings.manage']),
  ('statement_categories', 'INSERT', ARRAY['settings.manage', 'categories.manage']),
  ('statement_categories', 'UPDATE', ARRAY['settings.manage', 'categories.manage']),
  ('title_levels', 'INSERT', ARRAY['team.manage']),
  ('title_levels', 'UPDATE', ARRAY['team.manage']),
  ('title_levels', 'DELETE', ARRAY['team.manage']),
  ('title_permissions', 'INSERT', ARRAY['accounts.manage']),
  ('title_permissions', 'UPDATE', ARRAY['accounts.manage']),
  ('title_permissions', 'DELETE', ARRAY['accounts.manage']),
  ('titles', 'INSERT', ARRAY['team.manage']),
  ('titles', 'UPDATE', ARRAY['team.manage', 'accounts.manage']),
  ('titles', 'DELETE', ARRAY['team.manage', 'accounts.manage']),
  ('treasury_config', 'INSERT', ARRAY['settings.manage']),
  ('treasury_config', 'UPDATE', ARRAY['settings.manage']),
  ('user_permissions', 'INSERT', ARRAY['accounts.manage']),
  ('user_permissions', 'UPDATE', ARRAY['accounts.manage']),
  ('user_permissions', 'DELETE', ARRAY['accounts.manage']),
  ('users', 'INSERT', ARRAY['accounts.create', 'accounts.manage']),
  ('users', 'UPDATE', ARRAY['accounts.create', 'accounts.manage']),
  ('utility_splits', 'INSERT', ARRAY['settings.manage']),
  ('utility_splits', 'UPDATE', ARRAY['settings.manage']),
  ('utility_splits', 'DELETE', ARRAY['settings.manage']),
  ('venture_pool', 'INSERT', ARRAY['treasury.create', 'treasury.edit', 'treasury.void', 'treasury.approve', 'approvals.approve', 'billing.create', 'venture_pool.create', 'venture_pool.edit'])
ON CONFLICT (table_name, command) DO UPDATE SET actions = EXCLUDED.actions;

-- Every action must be one its function has, at a reach it may take.
DO $valid$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(DISTINCT w.table_name || ' ' || w.command || ' ' || a, ', ') INTO v_bad
    FROM public.permission_table_writes w
   CROSS JOIN LATERAL unnest(w.actions) AS a
   WHERE NOT EXISTS (
     SELECT 1 FROM public.permission_functions f
      WHERE f.key = split_part(split_part(a, ':', 1), '.', 1)
        AND split_part(split_part(a, ':', 1), '.', 2) = ANY (f.actions)
        AND coalesce(nullif(split_part(a, ':', 2), ''), 'all') IN ('own', 'dept', 'all')
        AND (split_part(a, ':', 2) = '' OR split_part(a, ':', 2) = ANY (f.scopes)));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'permission_table_writes names actions no function has: %', v_bad;
  END IF;
END $valid$;

ALTER TABLE public.permission_table_writes ENABLE ROW LEVEL SECURITY;
DO $read$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'permission_table_writes'
                  AND policyname = 'permission_table_writes_read') THEN
    CREATE POLICY permission_table_writes_read ON public.permission_table_writes FOR SELECT TO authenticated USING (true);
  END IF;
END $read$;
REVOKE ALL ON public.permission_table_writes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.permission_table_writes TO authenticated;

SELECT public.audit_register('permission_table_writes', 'Table writes', 'People', '{permissions_manage}',
  p_keys => '{table_name,command}', p_labels => '{table_name,command}');

-- ─── The question ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.has_any_action(p_wants text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH me AS (
    SELECT public.current_actions() AS acts, public.current_permissions() AS perms
  ), wants AS (
    SELECT split_part(w, ':', 1) AS fa,
           split_part(split_part(w, ':', 1), '.', 1) AS fn,
           coalesce(nullif(split_part(w, ':', 2), ''), 'all') AS scope
      FROM unnest(coalesce(p_wants, '{}'::text[])) AS w
  )
  SELECT EXISTS (
    SELECT 1
      FROM wants, me
     WHERE array_position(ARRAY['own', 'dept', 'all'], me.acts ->> wants.fa)
             >= array_position(ARRAY['own', 'dept', 'all'], wants.scope)
       AND (NOT EXISTS (SELECT 1 FROM public.permission_key_actions k
                         WHERE k.function_key = wants.fn AND k.action = 'view')
            OR EXISTS (SELECT 1 FROM public.permission_key_actions k
                        WHERE k.function_key = wants.fn AND k.action = 'view'
                          AND k.legacy_key = ANY (me.perms))));
$fn$;

COMMENT ON FUNCTION public.has_any_action(text[]) IS
  'Does the caller hold one of these actions (fn.action, or fn.action:dept / :own for at least that reach) — has_action''s rule, each read once.';

CREATE OR REPLACE FUNCTION public.may_write(p_table text, p_command text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT coalesce((SELECT public.has_any_action(w.actions)
                     FROM public.permission_table_writes w
                    WHERE w.table_name = p_table AND w.command = p_command), false);
$fn$;

COMMENT ON FUNCTION public.may_write(text, text) IS
  'The needs_action_* restrictive policies'' question: may the caller write this table this way (permission_table_writes). No row = no.';

REVOKE ALL ON FUNCTION public.has_any_action(text[]), public.may_write(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_any_action(text[]), public.may_write(text, text) TO authenticated, service_role;

-- ─── The policies ───────────────────────────────────────────────────────────
-- One per registered command, asked once per statement. A refused INSERT or
-- UPDATE is an error; a refused DELETE finds nothing, as a row policy does.

CREATE OR REPLACE FUNCTION public.permission_writes_guard(p_table text)
RETURNS integer
LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE
  w      record;
  v_name text;
  v_ask  text;
  v_n    integer := 0;
BEGIN
  IF to_regclass('public.' || quote_ident(p_table)) IS NULL THEN
    RETURN 0;
  END IF;
  FOR w IN SELECT command FROM public.permission_table_writes WHERE table_name = p_table ORDER BY command LOOP
    v_name := 'needs_action_' || lower(w.command);
    v_ask := format('(SELECT public.may_write(%L, %L))', p_table, w.command);
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = p_table AND policyname = v_name) THEN
      EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated %s', v_name, p_table,
        CASE w.command WHEN 'DELETE' THEN format('USING (%s)', v_ask) ELSE format('WITH CHECK (%s)', v_ask) END);
    ELSE
      EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO authenticated %s', v_name, p_table, w.command,
        CASE w.command WHEN 'DELETE' THEN format('USING (%s)', v_ask) ELSE format('WITH CHECK (%s)', v_ask) END);
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$fn$;

COMMENT ON FUNCTION public.permission_writes_guard(text) IS
  'Gives a table its needs_action_* restrictive policies, one per command it has in permission_table_writes. For migrations: a new table a domain policy lets somebody write gets its rows there, then this.';

REVOKE ALL ON FUNCTION public.permission_writes_guard(text) FROM PUBLIC, anon, authenticated;

SELECT public.permission_writes_guard(t.table_name)
  FROM (SELECT DISTINCT table_name FROM public.permission_table_writes) t;

-- ─── Nothing a domain policy opens is left without an action ────────────────

DO $guard$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(x.tablename || ' ' || x.command, ', ' ORDER BY x.tablename, x.command) INTO v_missing
    FROM (
      SELECT DISTINCT p.tablename::text AS tablename, c.command
        FROM pg_policies p
       CROSS JOIN LATERAL unnest(CASE WHEN p.cmd = 'ALL' THEN ARRAY['INSERT', 'UPDATE', 'DELETE'] ELSE ARRAY[p.cmd] END) AS c(command)
       WHERE p.schemaname = 'public'
         AND p.permissive = 'PERMISSIVE'
         AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
         AND p.roles && ARRAY['public', 'authenticated']::name[]
         AND (coalesce(p.qual, '') || coalesce(p.with_check, '')) ~ '(has_scope|has_perm|current_user_role|has_action|approvable_types)\('
         -- WRITES_WITHOUT_ACTION (lib/permission-table-writes.ts).
         AND p.tablename NOT IN ('table_layout_defaults')
    ) x
   WHERE NOT EXISTS (SELECT 1 FROM public.permission_table_writes w
                      WHERE w.table_name = x.tablename AND w.command = x.command)
      OR NOT EXISTS (SELECT 1 FROM pg_policies r
                      WHERE r.schemaname = 'public' AND r.tablename = x.tablename AND r.permissive = 'RESTRICTIVE'
                        AND r.policyname = 'needs_action_' || lower(x.command));
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'A domain policy lets these be written without asking for an action: %', v_missing;
  END IF;
END $guard$;

NOTIFY pgrst, 'reload schema';
