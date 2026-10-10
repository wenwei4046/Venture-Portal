import type { AllocMethod } from '@/lib/billing-allocator'
import type { AccountOption } from '@/components/AccountPicker'

export interface CoOpt {
  id: string
  label: string
}

export interface StaffRow {
  id: string
  name: string
  status: 'active' | 'inactive'
  /** Free team/function label, Finance-maintained. No effect on the math. */
  department: string
  /** ISO timestamp — when the person was added to the allocator list. */
  createdAt: string
  /** targetId: company uuid, `dept:<uuid>` for a department, null = HV own. */
  splits: { targetId: string | null; label: string; pct: number }[]
}

export interface CategoryRow {
  id: string
  name: string
  coaCode: string
}

export interface TemplateRow {
  id: string
  name: string
  method: AllocMethod
  amount: number
  categoryId: string | null
  status: string
  splits: { companyId: string; pct: number }[]
}

export interface TxnDetailRow {
  companyId: string | null
  companyLabel: string
  detail: string
  amount: number
  isOwnShare: boolean
}

export interface TxnRow {
  id: string
  txnNo: string
  description: string
  /** invoices.reference_no of the batch that billed it; null = not billed. */
  billedRef: string | null
  /** true while that batch still has live invoices — edit/delete disabled. */
  locked: boolean
  amount: number
  method: string
  categoryId: string | null
  categoryName: string
  hcPeriod: string | null
  /** ISO timestamp — when the allocation was recorded. */
  createdAt: string
  details: TxnDetailRow[]
}

export interface AllocInvoiceRow {
  id: string
  invoiceNo: string
  companyId: string
  companyLabel: string
  status: string
}

export interface AllocatorData {
  period: string
  /** ENABLED companies only — drives pickers, Equal splits and calc targets. */
  companies: CoOpt[]
  /** Every active company + its allocator on/off flag — Setup maintenance and
   *  label fallbacks for history that references a switched-off company. */
  companySettings: (CoOpt & { enabled: boolean; name?: string; code?: string })[]
  /** All departments, id encoded `dept:<uuid>` — staff-split picker options.
   *  Calc targets only include departments actually present in staff splits. */
  departments: CoOpt[]
  staff: StaffRow[]
  snapshotPeriods: string[]
  /** Months HR's hr_staff_allocation has data for — drives the import picker. */
  hrPeriods: string[]
  /** EVERY saved snapshot's active rows keyed by 'YYYY-MM' — the Calculate
   *  headcount picker can use ANY month's list (user 2026-08-13), and the
   *  preview always mirrors the rows the server will load. */
  snapshotSplitsByPeriod: Record<string, { targetId: string | null; pct: number }[]>
  /** Full COA for the category COA picker (AccountPicker filters itself). */
  coaAccounts: AccountOption[]
  categories: CategoryRow[]
  templates: TemplateRow[]
  txns: TxnRow[]
  invoices: AllocInvoiceRow[]
}
