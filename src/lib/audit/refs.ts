/**
 * The names behind the ids a change carries (2026-10-08, Audit Log › Changes).
 *
 * A row of the history is the row as it was saved, so it names other rows by
 * id — `staff_id`, `company_id`, `created_by`. The page loads the names for
 * the ids on screen (one query per kind, under the reader's own session, so a
 * name they may not read stays a short id) and the change is told in words.
 * Pure: which column points where, and which ids a page of changes needs.
 */

export type RefKind =
  | 'staff' | 'user' | 'company' | 'department' | 'director' | 'sub_department' | 'scheme' | 'title'
  | 'template' | 'voucher' | 'invoice' | 'order' | 'entry' | 'bank' | 'request' | 'memo' | 'rank'
  | 'rank_def' | 'brand' | 'erp_model' | 'erp_product' | 'region' | 'comm_product'
  | 'alloc_staff' | 'alloc_template' | 'alloc_txn' | 'alloc_category'
  | 'dp_director' | 'dp_company' | 'dp_month'

/** Where a kind's names live: the table, its key column, what to select and how to say it. */
export interface RefSource {
  table: string
  key: string
  select: string
  label: (row: Record<string, unknown>) => string
}

const text = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))
const both = (a: unknown, b: unknown): string => [text(a), text(b)].filter(Boolean).join(' · ')

export const REF_SOURCES: Record<RefKind, RefSource> = {
  staff: { table: 'hr_staff_costs', key: 'id', select: 'id, employee_code, employee_name', label: r => both(r.employee_code, r.employee_name) },
  user: { table: 'users', key: 'id', select: 'id, name, email', label: r => text(r.name) || text(r.email) },
  company: { table: 'companies', key: 'id', select: 'id, short_code, name', label: r => text(r.short_code) || text(r.name) },
  department: { table: 'departments', key: 'id', select: 'id, name', label: r => text(r.name) },
  director: { table: 'directors', key: 'id', select: 'id, code, name', label: r => text(r.name) || text(r.code) },
  sub_department: { table: 'comm_sub_departments', key: 'id', select: 'id, name', label: r => text(r.name) },
  scheme: { table: 'comm_schemes', key: 'id', select: 'id, scheme_name', label: r => text(r.scheme_name) },
  title: { table: 'titles', key: 'id', select: 'id, name', label: r => text(r.name) },
  template: { table: 'permission_templates', key: 'id', select: 'id, name', label: r => text(r.name) },
  voucher: { table: 'payment_vouchers', key: 'id', select: 'id, voucher_no', label: r => text(r.voucher_no) },
  invoice: { table: 'invoices', key: 'id', select: 'id, invoice_no', label: r => text(r.invoice_no) },
  order: { table: 'sales_orders', key: 'id', select: 'id, order_no', label: r => text(r.order_no) },
  entry: { table: 'journal_entries', key: 'id', select: 'id, entry_no', label: r => text(r.entry_no) },
  bank: { table: 'bank_accounts', key: 'id', select: 'id, bank_name, account_number', label: r => both(r.bank_name, r.account_number) },
  request: { table: 'member_requests', key: 'id', select: 'id, request_no', label: r => text(r.request_no) },
  memo: { table: 'member_memos', key: 'id', select: 'id, title', label: r => text(r.title) },
  rank: { table: 'comm_ranks', key: 'id', select: 'id, label', label: r => text(r.label) },
  rank_def: { table: 'comm_rank_defs', key: 'id', select: 'id, label', label: r => text(r.label) },
  brand: { table: 'comm_brands', key: 'id', select: 'id, code', label: r => text(r.code) },
  erp_model: { table: 'erp_product_models', key: 'erp_id', select: 'erp_id, model_code, name', label: r => text(r.model_code) || text(r.name) },
  erp_product: { table: 'erp_products', key: 'erp_id', select: 'erp_id, item_code', label: r => text(r.item_code) },
  region: { table: 'member_claim_regions', key: 'id', select: 'id, name', label: r => text(r.name) },
  comm_product: { table: 'comm_products', key: 'id', select: 'id, item_code', label: r => text(r.item_code) },
  alloc_staff: { table: 'alloc_staff', key: 'id', select: 'id, name', label: r => text(r.name) },
  alloc_template: { table: 'alloc_templates', key: 'id', select: 'id, name', label: r => text(r.name) },
  alloc_txn: { table: 'alloc_txns', key: 'id', select: 'id, txn_no', label: r => text(r.txn_no) },
  alloc_category: { table: 'alloc_categories', key: 'id', select: 'id, name', label: r => text(r.name) },
  dp_director: { table: 'dp_directors', key: 'id', select: 'id, code, name', label: r => text(r.name) || text(r.code) },
  dp_company: { table: 'dp_companies', key: 'id', select: 'id, name', label: r => text(r.name) },
  dp_month: { table: 'dp_months', key: 'id', select: 'id, month', label: r => text(r.month).slice(0, 7) },
}

const PEOPLE = ['staff_id', 'reports_to', 'upline_staff_id', 'source_staff_id', 'allocated_staff_id'] as const
const ACCOUNTS = [
  'user_id', 'actor_id', 'created_by', 'updated_by', 'approved_by', 'submitted_by', 'requested_by', 'executed_by',
  'closed_by', 'reopened_by', 'decided_by', 'completed_by', 'topup_opened_by', 'applied_by', 'computed_by',
  'promoted_by', 'picked_by', 'excluded_by', 'dismissed_by', 'linked_by', 'set_by', 'changed_by', 'uploaded_by',
  'cancelled_by', 'rejected_by', 'generated_by', 'repaid_by', 'release_approved_by', 'statutory_overridden_by',
  'manual_margin_by', 'reviewed_by', 'sent_back_by', 'assigned_to', 'earned_by', 'commission_adjusted_by',
  'removed_by', 'open_bill_tagged_by', 'tagged_by', 'adjusted_by',
] as const

/** Column → kind, wherever the column appears. */
const BY_COLUMN: Record<string, RefKind> = {
  ...Object.fromEntries(PEOPLE.map(c => [c, 'staff' as const])),
  ...Object.fromEntries(ACCOUNTS.map(c => [c, 'user' as const])),
  company_id: 'company', payee_company_id: 'company', borrower_company_id: 'company', from_company_id: 'company',
  department_id: 'department', from_department_id: 'department', billable_to_department_id: 'department', base_dept_id: 'department',
  director_id: 'director', from_director_id: 'director',
  sub_department_id: 'sub_department', home_sub_department_id: 'sub_department',
  scheme_id: 'scheme',
  title_id: 'title', from_title_id: 'title', to_title_id: 'title', promotes_to_title_id: 'title', rank_title_id: 'title',
  template_id: 'template',
  voucher_id: 'voucher', pv_id: 'voucher', settlement_voucher_id: 'voucher', payment_voucher_id: 'voucher',
  invoice_id: 'invoice',
  order_id: 'order',
  entry_id: 'entry', journal_entry_id: 'entry',
  bank_account_id: 'bank', source_bank_id: 'bank', pay_from_account_id: 'bank',
  request_id: 'request',
  memo_id: 'memo',
  rank_id: 'rank', rank_def_id: 'rank_def',
  brand_id: 'brand',
  erp_model_id: 'erp_model', model_erp_id: 'erp_model',
  erp_product_id: 'erp_product',
  region_id: 'region',
  category_id: 'alloc_category',
  txn_id: 'alloc_txn',
  month_id: 'dp_month',
}

/** Where one table's column means something else than everywhere else. */
const BY_TABLE: Record<string, Record<string, RefKind>> = {
  alloc_staff_splits: { staff_id: 'alloc_staff' },
  alloc_staff_history: { staff_id: 'alloc_staff' },
  alloc_template_splits: { template_id: 'alloc_template' },
  dp_contra: { director_id: 'dp_director' },
  dp_director_inputs: { director_id: 'dp_director' },
  dp_fixed_overrides: { director_id: 'dp_director' },
  dp_inputs: { company_id: 'dp_company' },
  member_product_options: { product_id: 'comm_product' },
}

/** What kind of row a column of this table points at, if any. */
export function refKindOf(table: string, column: string): RefKind | null {
  return BY_TABLE[table]?.[column] ?? BY_COLUMN[column] ?? null
}

/** The key a loaded name is kept under. */
export const refKey = (kind: RefKind, id: string): string => `${kind}:${id}`

/** Every id a page of changes points at, by kind — what to load names for. */
export function refsWanted(
  changes: ReadonlyArray<{ table_name: string; actor_id?: string | null; old_row: Record<string, unknown> | null; new_row: Record<string, unknown> | null }>,
): Map<RefKind, Set<string>> {
  const wanted = new Map<RefKind, Set<string>>()
  const add = (kind: RefKind, id: unknown) => {
    if (typeof id !== 'string' || id === '') return
    let ids = wanted.get(kind)
    if (!ids) wanted.set(kind, (ids = new Set()))
    ids.add(id)
  }
  for (const change of changes) {
    for (const row of [change.old_row, change.new_row]) {
      if (!row) continue
      for (const [column, value] of Object.entries(row)) {
        const kind = refKindOf(change.table_name, column)
        if (kind) add(kind, value)
      }
    }
  }
  return wanted
}
