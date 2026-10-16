import type { Reach } from '@/lib/sub-department-reach'

// ─── Core ────────────────────────────────────────────────────────────────────

// `staff` (2026-10-08): an account whose access is wholly its title's
// permission template — the role every template that is not one of the old
// four hands out. Never shown; see permission_templates.base_role.
export type UserRole = 'principal' | 'finance' | 'hr' | 'dept_manager' | 'revenue_member' | 'staff'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  department_id?: string
  is_active: boolean
  created_at: string
  updated_at: string
  // Set only while a Principal is masked by the view-as switcher: `role`
  // carries the masked role driving gates/UI, `actualRole` the real one.
  actualRole?: UserRole
  // HR's or Finance's view worn over the account's own power (the LENS,
  // 2026-10-11 — lib/auth.ts). On Finance's, payroll is listed by department
  // as Finance reads it (2026-10-13, lib/roles.ts listsPayrollByPerson).
  lens?: 'hr' | 'finance'
  // The REAL account holds `view_switch` (Ultimate full access, and the
  // Principal account) — so the view switcher shows, masked or not. Full
  // access is everything else without it (2026-10-08).
  canSwitchView?: boolean
  // Every permission key this account holds, resolved by the database from
  // their title (or their role, while no title says otherwise). This is what
  // every gate in the portal reads; `role` survives only for the handful of
  // dept_manager row policies no scope can express.
  permissions: string[]
  // What they may DO, and how far (2026-10-08, PR2): `fn.action` → own / dept
  // / all, from `current_actions()` — a titled person's template cells, an
  // untitled account's keys as actions. A gate that writes asks this through
  // `canDo` / `requireAction` (lib/permission-actions.ts). Absent on a value
  // built before it existed: read as "no actions".
  actions?: Record<string, 'own' | 'dept' | 'all'>
  // Which of salary amounts, NRIC / IC and bank account numbers they may see
  // (2026-10-09, PR4): their template's Sensitive fields, or what their
  // account's kind always saw — `current_sensitive_fields()`. Everything else
  // shows as •••• (lib/sensitive.ts). Absent means nothing ticked.
  sensitive?: Array<'salary' | 'nric' | 'bank'>
  // The tabs they hold, `view.tab.action` (2026-10-11, HR revamp 8b): their
  // template's ticks with their own boxes over them, else what their cells and
  // keys give (lib/page-tabs.ts `userTabs`). Pages and the sidebars ask a tab's
  // View on top of their own gates. Absent on a value built before it existed:
  // read as "not asked".
  tabs?: string[]
  // The boxes somebody unticked for them (2026-10-11, lib/page-tabs.ts
  // `closedBoxes`): a page's writes follow its own tabs' boxes (`actionsOnPage`)
  // and the Revenue app hides the pages they close. Empty or absent: nothing.
  closed?: string[]
  // The Revenue Department's sub-departments they reach, area by area — the
  // CRM, Comm Cal, Sales Groups, Rules (2026-10-16, lib/sub-department-reach.ts):
  // what they handle, every one when they handle none, their own ticks over it.
  // Every sign-in carries it (NO_REACH when it could not be read); absent only
  // on a value built without it, which narrows nothing.
  reach?: Reach
  // Set while an account that may switch views sees the portal AS this person
  // (2026-10-11): everything above is theirs, `actualRole` the viewer's kind,
  // and the session reads only (lib/supabase/read-only.ts).
  viewingAs?: { id: string; name: string }
  // The login is a person's own — a People record names it — not a shared
  // account (2026-10-12): Change password is offered only then. Set by the
  // portal layout for its menus (lib/account/personal-login.ts), not by
  // getUser; absent reads as shared.
  personalLogin?: boolean
}

export interface Company {
  id: string
  name: string
  short_code: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Department {
  id: string
  name: string
  created_at: string
}

export type ApprovalRequestType =
  | 'new_loan'
  | 'base_rate'
  | 'tier_change'
  | 'new_contract'
  | 'contract_change'
  | 'dept_expense'
  | 'advance'
  | 'escalation'
  | 'invoice_pool_release'
  | 'profit_withdrawal'
  | 'payment_voucher'
  | 'new_fund_source'
  | 'hr_costing'
  | 'payroll_run'
  | 'dept_payment_request'
  | 'loan_cancel'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface ApprovalRequest {
  id: string
  request_type: ApprovalRequestType
  reference_id?: string
  reference_table?: string
  submitted_by: string
  description?: string
  amount?: number
  status: ApprovalStatus
  approved_by?: string
  approved_at?: string
  notes?: string
  group_id?: string
  created_at: string
}

// ─── Treasury ─────────────────────────────────────────────────────────────────

export type FundSourceType = 'subsidiary' | 'director_loan' | 'department_pool' | 'director_saving' | 'outsource'
export type FundSourceStatus = 'pending_approval' | 'active' | 'matured' | 'repaid' | 'cancelled'

export interface FundSource {
  id: string
  source_type: FundSourceType
  capital_type: 'paid'
  from_company_id?: string
  from_director_id?: string
  from_department_id?: string
  from_freetext_name?: string
  amount: number
  cost_rate: number
  lock_in_months?: number
  effective_date: string
  maturity_date?: string
  early_withdrawal: boolean
  penalty_on_early?: number
  status: FundSourceStatus
  notes?: string
  created_by: string
  created_at: string
  updated_at: string
}

export type LoanStatus = 'pending_approval' | 'active' | 'fully_repaid' | 'cancelled'

export interface Loan {
  id: string
  company_id: string
  principal: number
  base_rate: number
  risk_premium: number
  effective_rate: number
  disbursement_date?: string
  tenure_months: number
  repayment_terms?: string
  status: LoanStatus
  approved_by?: string
  approved_at?: string
  created_by: string
  created_at: string
  updated_at: string
}

export type PaymentType = 'principal' | 'interest' | 'penalty' | 'netting'

export interface Repayment {
  id: string
  loan_id: string
  amount: number
  payment_type: PaymentType
  payment_date: string
  reference_id?: string
  notes?: string
  created_by: string
  created_at: string
}

export type OverdueStage = 'grace' | 'late_1' | 'late_2' | 'escalation'
export type OverdueStatus = 'pending' | 'paid' | 'escalated'

export interface OverdueRecord {
  id: string
  loan_id: string
  period_month: string
  overdue_days: number
  overdue_stage: OverdueStage
  penalty_rate?: number
  penalty_amount?: number
  status: OverdueStatus
  created_at: string
}

export interface BaseRateHistory {
  id: string
  quarter: string
  total_paid: number
  total_pool: number
  weighted_cost: number
  op_margin: number
  base_rate: number
  approved_by?: string
  approved_at?: string
  created_at: string
}

// ─── Service Billing ──────────────────────────────────────────────────────────

export type BillingMode =
  | 'marketing_project'
  | 'non_billable'
  | 'director_office_attribution'
  | 'director_attribution'
  | 'hr_attribution'
  | 'finance_attribution'

export type ContractStatus = 'active' | 'completed' | 'cancelled'

export interface ServiceContract {
  id: string
  department_id: string
  company_id: string
  billing_mode: BillingMode
  description?: string
  amount?: number
  split_pct?: number
  status: ContractStatus
  start_date?: string
  end_date?: string
  approved_by?: string
  created_by: string
  created_at: string
  updated_at: string
}

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'paid_via_netting'

export type BillableToKind = 'subsidiary' | 'director' | 'dept_pool' | 'freetext'

export interface Invoice {
  id: string
  invoice_no?: string
  contract_id?: string
  // Item 5: company_id is now nullable — only populated when billable_to_type='subsidiary'.
  company_id: string | null
  billable_to_type?: BillableToKind
  billable_to_department_id?: string | null
  billable_to_freetext_name?: string | null
  period_month: string
  billing_mode: BillingMode
  base_amount?: number
  total_amount?: number
  status: InvoiceStatus
  created_by: string
  created_at: string
}

export type StatementStatus = 'draft' | 'issued' | 'paid' | 'partial' | 'overdue'

export interface MonthlyStatement {
  id: string
  company_id: string
  period_month: string
  total_invoice: number
  total_contra: number
  net_amount: number
  status: StatementStatus
  issued_at?: string
  created_by?: string
  created_at: string
}

export type LineType = 'invoice' | 'contra'
export type LineDirection = 'receivable' | 'payable'
export type LineCategory =
  | 'hr_pool'
  | 'finance_staff'
  | 'marketing_project'
  | 'rent'
  | 'utility'
  | 'loan_repayment'
  | 'loan_interest'
  | 'loan_principal'
  | 'other'

export interface MonthlyStatementLine {
  id: string
  statement_id: string
  line_type: LineType
  direction: LineDirection
  category: LineCategory
  description?: string
  reference_id?: string
  amount: number
  created_at: string
}

// ─── Director Salary ──────────────────────────────────────────────────────────

export type PCBCategory = 'KA1' | 'KA2' | 'KA3'

export interface Director {
  id: string
  name: string
  code: string
  tax_ref_no?: string
  pcb_category?: PCBCategory
  children_count: number
  weightage: number
  min_payout: number
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export interface DirectorCTC {
  id: string
  director_id: string
  company_id: string
  period_month: string
  basic: number
  kpi: number
  allowance: number
  employer_epf?: number
  employer_socso?: number
  employer_eis?: number
  total_ctc?: number
  created_by: string
  created_at: string
}

export interface SalaryPool {
  id: string
  period_month: string
  total_ctc_in: number
  total_pool: number
  basic_ratio: number
  kpi_ratio: number
  allowance_ratio: number
  total_saving: number
  total_statutory_surplus: number
  created_at: string
}

export type PayoutStatus = 'draft' | 'confirmed' | 'paid'

export interface DirectorPayout {
  id: string
  director_id: string
  period_month: string
  gross_amount: number
  saving_amount: number
  after_saving: number
  payroll_calc: number
  advance_amount: number
  payroll_gross: number
  payroll_bk: number
  payroll_allow: number
  payroll_epf_er: number
  payroll_epf_ee: number
  payroll_socso_er: number
  payroll_socso_ee: number
  payroll_eis_er: number
  payroll_eis_ee: number
  payroll_pcb: number
  payroll_skbbk: number
  payroll_net: number
  invoice_base: number
  invoice_bk: number
  invoice_epf_er: number
  invoice_socso_er: number
  invoice_eis_er: number
  invoice_total: number
  statutory_er_in: number
  statutory_er_out: number
  statutory_surplus: number
  advance_repaid: number
  advance_balance: number
  status: PayoutStatus
  created_by?: string
  created_at: string
}

// ─── HR ───────────────────────────────────────────────────────────────────────

export interface HRPoolAllocation {
  id: string
  department_id: string
  company_id: string
  period_month: string
  split_pct: number
  created_by: string
  created_at: string
}

export interface HRStaffCost {
  id: string
  employee_name: string
  department_id: string
  basic_salary: number
  allowances: number
  epf_er?: number
  socso_er?: number
  eis_er?: number
  total_ctc?: number
  status: 'active' | 'inactive'
  created_by: string
  created_at: string
  updated_at: string
}

export interface HRStaffAllocation {
  id: string
  staff_id: string
  company_id: string
  period_month: string
  allocation_pct: number
  created_by: string
  created_at: string
}

export type ClaimType = 'project' | 'benefit'
export type ClaimStatus = 'pending' | 'approved' | 'rejected' | 'paid'

export interface Claim {
  id: string
  claim_type: ClaimType
  claimant_name: string
  department_id?: string
  company_id?: string
  amount: number
  description?: string
  receipt_url?: string
  status: ClaimStatus
  approved_by?: string
  approved_at?: string
  payroll_month?: string
  created_by: string
  created_at: string
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface TreasuryConfig {
  id: string
  config_key: string
  config_value: number
  description?: string
  updated_by?: string
  updated_at: string
}

// ─── API Helpers ──────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T | null
  error: string | null
}
