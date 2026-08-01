import type { AllocMethod } from '@/lib/billing-allocator'

export interface CoOpt {
  id: string
  label: string
}

export interface StaffRow {
  id: string
  name: string
  status: 'active' | 'inactive'
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
  amount: number
  method: string
  categoryName: string
  hcPeriod: string | null
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
  companies: CoOpt[]
  /** All departments, id encoded `dept:<uuid>` — staff-split picker options.
   *  Calc targets only include departments actually present in staff splits. */
  departments: CoOpt[]
  staff: StaffRow[]
  snapshotPeriods: string[]
  /** Months HR's hr_staff_allocation has data for — drives the import picker. */
  hrPeriods: string[]
  categories: CategoryRow[]
  templates: TemplateRow[]
  txns: TxnRow[]
  invoices: AllocInvoiceRow[]
}
