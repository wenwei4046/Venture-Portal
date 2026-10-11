/**
 * What the DATABASE asks of a write (2026-10-09 — PR3a of the People
 * Management revamp: the database asks for the action too).
 *
 * Since PR2 every write in the app asks for the action it is
 * (`requireActionOn('/payments', 'treasury', 'create')`, lib/auth.ts). The
 * database did not: a table's row policies still opened it to whoever held ANY
 * key of its domain (`has_scope(ARRAY['treasury'])`), and a key is opened by a
 * View cell. So somebody whose template only READS Treasury could still raise
 * a payment voucher by calling the API with their own session, and a
 * Finance · Checker could edit the vouchers they approve.
 *
 * Every table a domain policy lets somebody write now has a RESTRICTIVE policy
 * per command, `needs_action_insert / _update / _delete`, which asks
 * `may_write(table, command)`: does the caller hold one of the actions listed
 * here for it (`permission_table_writes`, migration 20261009020000 — this is
 * its twin, held equal by permission-table-writes.test.ts). A restrictive
 * policy only ever takes away: whoever the old policies refused is still
 * refused, and whoever they let in must ALSO hold one of these actions.
 *
 * Each list is the actions under which the app writes that table under the
 * caller's own session — the gate of every server action that writes it
 * directly, of every SECURITY INVOKER function it calls (the Revenue and
 * catalogue RPCs), and of every write an INVOKER trigger makes on its behalf (a
 * payment voucher marks its invoice paid). Writes inside SECURITY DEFINER
 * functions never meet a row policy: those functions ask for their own action.
 *
 * `fn.action:dept` / `:own` asks for at least that reach — the department
 * manager's own billing writes; the row policies still say WHICH rows.
 */

import type { FunctionKey } from '@/lib/permission-actions'
import type { Action } from '@/lib/permission-matrix'

export type WriteCommand = 'INSERT' | 'UPDATE' | 'DELETE'
export type Want = `${FunctionKey}.${Action}` | `${FunctionKey}.${Action}:${'own' | 'dept'}`
export type TableWrites = Readonly<Partial<Record<WriteCommand, readonly Want[]>>>

const each = (wants: readonly Want[], commands: readonly WriteCommand[] = ['INSERT', 'UPDATE', 'DELETE']): TableWrites =>
  Object.fromEntries(commands.map(c => [c, wants]))

// Deciding a request in the queue (lib/approval-domains.ts): the request's
// domain Approve, or the queue's own.
const APPROVE_TREASURY = ['treasury.approve', 'approvals.approve'] as const satisfies readonly Want[]
const ALL_APPROVE = [...APPROVE_TREASURY, 'hr_costing.approve', 'director_salary.approve'] as const satisfies readonly Want[]

// Whoever writes a payment voucher: an INVOKER trigger on it marks its invoice
// paid, so invoices must let each of them in too.
const VOUCHER_WRITERS = [
  'treasury.create', 'treasury.edit', 'treasury.void', ...APPROVE_TREASURY, 'billing.create', 'claims.approve',
] as const satisfies readonly Want[]

// Revenue: the month's working (orders, closes, the hierarchy, the ERP feed)
// is Create / Edit; the scheme's rules are Manage.
const REVENUE_WORK = ['revenue.create', 'revenue.edit', 'revenue.manage'] as const satisfies readonly Want[]
const REVENUE_RULES = ['revenue.manage'] as const satisfies readonly Want[]

const BILLING_WORK = ['billing.create', 'billing.edit'] as const satisfies readonly Want[]
const TREASURY_WORK = ['treasury.create', 'treasury.edit'] as const satisfies readonly Want[]
const RECON = ['reconciliation.create', 'reconciliation.edit', 'reconciliation.approve'] as const satisfies readonly Want[]
const SETTINGS = ['settings.manage'] as const satisfies readonly Want[]

export const TABLE_WRITES: Readonly<Record<string, TableWrites>> = {
  // ── Treasury ────────────────────────────────────────────────────────────
  approval_requests: {
    INSERT: ['billing.create', 'my_billing.create:dept', 'claims.approve', 'treasury.create', 'treasury.void', 'hr_costing.create'],
    // The decision (any domain's Approve), and a submitter's own pending request.
    UPDATE: [...ALL_APPROVE, 'treasury.create', 'treasury.edit', 'treasury.void', 'billing.create', 'billing.edit',
      'my_billing.create:dept', 'hr_costing.create', 'hr_costing.edit'],
  },
  ba_attachments: each(TREASURY_WORK),
  ba_facilities: {
    INSERT: TREASURY_WORK,
    UPDATE: [...TREASURY_WORK, 'treasury.void'],
    DELETE: ['treasury.edit', 'treasury.void'],
  },
  ba_limits: each(TREASURY_WORK),
  bank_accounts: { INSERT: SETTINGS, UPDATE: [...APPROVE_TREASURY, ...SETTINGS] },
  base_rate_history: each([...SETTINGS, ...APPROVE_TREASURY], ['INSERT', 'UPDATE']),
  dept_payment_requests: {
    INSERT: ['my_billing.create:dept', 'treasury.create'],
    UPDATE: ['treasury.create', 'treasury.edit', 'treasury.void', ...APPROVE_TREASURY, 'my_billing.create:dept'],
    DELETE: ['treasury.edit', 'treasury.void', 'my_billing.create:dept'],
  },
  dept_pools: {
    INSERT: ['treasury.create', 'treasury.edit', 'treasury.void', ...APPROVE_TREASURY, 'billing.create', 'my_billing.create:dept'],
  },
  fund_source_repayments: { INSERT: ['treasury.create', 'treasury.edit', 'treasury.void'] },
  fund_sources: {
    INSERT: ['treasury.create'],
    UPDATE: ['treasury.create', 'treasury.edit', 'treasury.void', ...APPROVE_TREASURY],
  },
  loans: {
    INSERT: ['treasury.create'],
    UPDATE: ['treasury.create', 'treasury.edit', 'treasury.void', ...APPROVE_TREASURY],
  },
  monthly_headcounts: each([...TREASURY_WORK, ...BILLING_WORK], ['INSERT', 'UPDATE']),
  monthly_statement_lines: each(TREASURY_WORK, ['INSERT', 'DELETE']),
  monthly_statements: each(TREASURY_WORK, ['INSERT', 'UPDATE']),
  overdue_records: each(TREASURY_WORK, ['INSERT', 'UPDATE']),
  payment_attachments: { INSERT: TREASURY_WORK },
  payment_voucher_sources: {
    INSERT: [...TREASURY_WORK, 'billing.create', 'claims.approve'],
    UPDATE: TREASURY_WORK,
    DELETE: TREASURY_WORK,
  },
  payment_vouchers: {
    INSERT: ['treasury.create', 'billing.create', 'claims.approve'],
    UPDATE: ['treasury.create', 'treasury.edit', 'treasury.void', ...APPROVE_TREASURY],
  },
  repayments: { INSERT: TREASURY_WORK },
  venture_pool: {
    INSERT: ['treasury.create', 'treasury.edit', 'treasury.void', ...APPROVE_TREASURY, 'billing.create',
      'venture_pool.create', 'venture_pool.edit'],
  },

  // ── Billing ─────────────────────────────────────────────────────────────
  alloc_categories: each(BILLING_WORK),
  alloc_company_settings: each(BILLING_WORK),
  alloc_staff: each(BILLING_WORK),
  alloc_staff_history: each(BILLING_WORK),
  alloc_staff_splits: each(BILLING_WORK),
  alloc_template_splits: each(BILLING_WORK),
  alloc_templates: each(BILLING_WORK),
  alloc_txn_details: each(BILLING_WORK),
  alloc_txns: each(BILLING_WORK),
  credit_notes: {
    INSERT: ['billing.create'],
    // Treasury · Approve approves a credit note (PR2's choice).
    UPDATE: [...BILLING_WORK, 'billing.void', 'treasury.approve'],
    DELETE: BILLING_WORK,
  },
  invoice_lines: each(BILLING_WORK),
  invoice_payout_pool: {
    // Accumulated by billing and vouchers; released when Director Salary's
    // Approve (or the queue's) decides an Invoice Pool release.
    INSERT: ['treasury.create', 'treasury.edit', 'treasury.void', ...APPROVE_TREASURY, 'billing.create',
      'director_salary.approve', 'director_salary.edit'],
  },
  invoice_submission_requests: {
    INSERT: ['my_billing.create:dept', 'billing.create'],
    UPDATE: [...BILLING_WORK, 'billing.void', 'my_billing.create:dept'],
    DELETE: ['billing.edit', 'billing.void', 'my_billing.create:dept'],
  },
  invoices: {
    INSERT: ['billing.create', 'my_billing.create:dept'],
    UPDATE: [...BILLING_WORK, 'billing.void', 'my_billing.create:dept', ...VOUCHER_WRITERS],
    DELETE: [...BILLING_WORK, 'my_billing.create:dept'],
  },
  service_contracts: {
    INSERT: ['billing.create', 'my_billing.create:dept'],
    UPDATE: BILLING_WORK,
  },

  // ── Chart of accounts, reconciliation, reports ─────────────────────────
  chart_of_accounts: each(['categories.manage'], ['INSERT', 'UPDATE']),
  departments: each(['categories.manage', ...SETTINGS], ['INSERT', 'UPDATE']),
  statement_categories: each([...SETTINGS, 'categories.manage'], ['INSERT', 'UPDATE']),
  bank_recon_lines: each(RECON),
  bank_recon_matches: each(RECON),
  bank_recon_sessions: each(RECON),
  // Posting goes through post_journal_entry_as_caller (DEFINER); straight in,
  // only a reconciliation writer.
  journal_entries: { INSERT: ['reconciliation.create', 'reconciliation.edit'] },
  journal_lines: { INSERT: ['reconciliation.create', 'reconciliation.edit'] },
  report_layouts: each(['reports.view', 'reports.export']),

  // ── Settings ────────────────────────────────────────────────────────────
  companies: each(SETTINGS, ['INSERT', 'UPDATE']),
  eis_act800_schedule: each(SETTINGS, ['INSERT', 'UPDATE']),
  epf_third_schedule: each(SETTINGS, ['INSERT', 'UPDATE']),
  overdue_config: each(SETTINGS, ['INSERT', 'UPDATE']),
  pcb_jadual: each(SETTINGS, ['INSERT', 'UPDATE']),
  period_locks: each(SETTINGS, ['INSERT', 'UPDATE']),
  rent_splits: each(SETTINGS),
  socso_act4_schedule: each(SETTINGS, ['INSERT', 'UPDATE']),
  treasury_config: each(SETTINGS, ['INSERT', 'UPDATE']),
  utility_splits: each(SETTINGS),

  // ── HR Costing ──────────────────────────────────────────────────────────
  hr_cost_submissions: {
    INSERT: ['hr_costing.create', 'hr_costing.edit'],
    // Finance marks a submission processed.
    UPDATE: ['hr_costing.create', 'hr_costing.edit', ...TREASURY_WORK],
  },
  hr_import_templates: each(['hr_costing.create', 'hr_costing.edit', 'team.create', 'team.edit']),
  hr_monthly_payroll: each(['hr_costing.create', 'hr_costing.edit']),
  hr_pool_allocation: each(['hr_costing.create', 'hr_costing.edit'], ['INSERT', 'UPDATE']),
  hr_staff_allocation: each(['hr_costing.create', 'hr_costing.edit']),
  payroll_payment_requests: {
    INSERT: ['hr_costing.create'],
    // HR edits its request; Finance pays it out or sends it back.
    UPDATE: ['hr_costing.create', 'hr_costing.edit', 'treasury.create', 'treasury.edit', 'treasury.void', ...APPROVE_TREASURY],
    DELETE: ['hr_costing.edit'],
  },
  payroll_runs: {
    INSERT: ['hr_costing.create', 'hr_costing.edit'],
    UPDATE: ['hr_costing.create', 'hr_costing.edit', 'hr_costing.approve', 'approvals.approve', 'treasury.void', 'treasury.approve'],
    DELETE: ['hr_costing.edit'],
  },

  // ── Director Salary, Director Pool ──────────────────────────────────────
  director_advance_offsets: { INSERT: ['director_salary.edit', 'director_salary.approve', 'approvals.approve'] },
  director_ctc: each(['director_salary.edit']),
  director_monthly_payroll: each(['director_salary.edit']),
  director_payouts: {
    INSERT: ['director_salary.edit'],
    UPDATE: ['director_salary.edit', 'director_salary.approve', 'approvals.approve'],
  },
  directors: each(['director_salary.edit', ...SETTINGS], ['INSERT', 'UPDATE']),
  dp_companies: each(['director_pool.edit']),
  dp_contra: each(['director_pool.edit']),
  dp_director_inputs: each(['director_pool.edit']),
  dp_directors: each(['director_pool.edit']),
  dp_fixed_overrides: each(['director_pool.edit']),
  dp_inputs: each(['director_pool.edit']),
  dp_months: each(['director_pool.edit']),
  dp_settings: each(['director_pool.edit']),

  // ── Team: the roster, titles, the ladder, logins ────────────────────────
  hr_staff_costs: {
    INSERT: ['team.create'],
    // A person's own fields (Edit), an import (Create), a move on either
    // chart (Team or Revenue Edit), a login linked to them (Logins · Create).
    UPDATE: ['team.create', 'team.edit', 'revenue.edit', 'accounts.create'],
    DELETE: ['team.edit'],
  },
  title_levels: each(['team.manage']),
  title_permissions: each(['accounts.manage']),
  titles: {
    INSERT: ['team.manage'],
    UPDATE: ['team.manage', 'accounts.manage'],
    DELETE: ['team.manage', 'accounts.manage'],
  },
  user_permissions: each(['accounts.manage']),
  users: each(['accounts.create', 'accounts.manage'], ['INSERT', 'UPDATE']),

  // ── Revenue ─────────────────────────────────────────────────────────────
  comm_agent_aliases: each(REVENUE_WORK),
  comm_double_claim_dismissals: each(REVENUE_WORK),
  comm_hierarchy: each(REVENUE_WORK),
  comm_ignored_agents: each(REVENUE_WORK),
  comm_order_releases: each(REVENUE_WORK),
  comm_organisers: each(REVENUE_WORK),
  comm_runs: each(REVENUE_WORK),
  comm_salesperson_closes: each(REVENUE_WORK, ['INSERT', 'UPDATE']),
  comm_statement_brand_margins: each(REVENUE_WORK),
  comm_statement_lines: each(REVENUE_WORK),
  comm_statements: each(REVENUE_WORK),
  comm_sub_department_directors: each(REVENUE_WORK),
  comm_title_promotions: each(REVENUE_WORK),
  comm_upsales: each(REVENUE_WORK),
  comm_venue_events: each(REVENUE_WORK),
  comm_venues: each(REVENUE_WORK),
  commission_inputs: each(REVENUE_WORK),
  erp_feed_closed_months: each(REVENUE_WORK),
  erp_sync_events: each(REVENUE_WORK),
  sales_import_batches: each(REVENUE_WORK),
  sales_order_brand_picks: each(REVENUE_WORK),
  sales_order_exclusions: each(REVENUE_WORK),
  sales_order_lines: each(REVENUE_WORK),
  sales_order_open_bill_tags: each(REVENUE_WORK),
  sales_order_shares: each(REVENUE_WORK),
  sales_orders: each(REVENUE_WORK),

  comm_brands: each(REVENUE_RULES),
  comm_cutovers: each(REVENUE_RULES),
  comm_director_pay: each(REVENUE_RULES),
  comm_item_groups: each(REVENUE_RULES),
  comm_kpi_items: each(REVENUE_RULES),
  comm_kpi_thresholds: each(REVENUE_RULES),
  comm_margin_bands: each(REVENUE_RULES),
  comm_open_bill_months: each(REVENUE_RULES),
  comm_open_bill_rules: each(REVENUE_RULES),
  comm_promotion_rules: each(REVENUE_RULES),
  comm_rank_defs: each(REVENUE_RULES),
  comm_ranks: each(REVENUE_RULES),
  comm_sub_departments: each(REVENUE_RULES),
  commission_rules: each(REVENUE_RULES),
  erp_feed_settings: each(REVENUE_RULES),
  erp_links: each(REVENUE_RULES),
  // The Product List's Costing Setting writes the scheme's divisor and the
  // per-SKU ratios.
  comm_cost_ratios: each([...REVENUE_RULES, 'product_list.edit']),
  comm_schemes: each([...REVENUE_RULES, 'product_list.edit']),

  // ── Product List ────────────────────────────────────────────────────────
  catalogue_combo_prices: each(['product_list.edit']),
  catalogue_combos: each(['product_list.edit']),
  catalogue_models: each(['product_list.edit']),
  catalogue_option_prices: each(['product_list.edit']),
  catalogue_skus: each(['product_list.edit']),
  comm_products: each(['product_list.edit']),

  // ── Claims ──────────────────────────────────────────────────────────────
  claims: { UPDATE: ['claims.approve'] },
}

/**
 * Tables a domain policy lets somebody write that stay without an action of
 * their own, and why. Anything else such a policy covers must be in
 * TABLE_WRITES — the migration refuses to finish otherwise.
 */
export const WRITES_WITHOUT_ACTION: Readonly<Record<string, string>> = {
  table_layout_defaults: 'The default column layout of a table — what a page looks like, not what it holds.',
}

/** The registry as rows, the way `permission_table_writes` holds it. */
export function tableWriteRows(): Array<{ table: string; command: WriteCommand; actions: Want[] }> {
  return Object.entries(TABLE_WRITES).flatMap(([table, writes]) =>
    (Object.entries(writes) as Array<[WriteCommand, readonly Want[]]>).map(([command, actions]) => ({
      table,
      command,
      actions: [...new Set(actions)],
    })))
}
