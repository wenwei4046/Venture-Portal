import dayjs from 'dayjs'

/**
 * Normalizes any date-like input to the first day of its month in ISO format
 * (`YYYY-MM-DD`). All Phase 2 billing math operates on period_month values
 * that are first-of-month.
 */
export function normalizeToFirstOfMonth(input: string | Date): string {
  return dayjs(input).startOf('month').format('YYYY-MM-DD')
}

/**
 * Regex matching the canonical invoice_no format used by
 * `format_invoice_no()` Postgres helper in migration 19:
 *
 *   HV-INV-YYYYMM-NNNN
 *
 * where NNNN is a zero-padded 4-digit sequence value from invoice_no_seq.
 */
export const INVOICE_NO_PATTERN = /^HV-INV-\d{6}-\d{4}$/

export function isValidInvoiceNoFormat(invoiceNo: string | null | undefined): boolean {
  if (!invoiceNo) return false
  return INVOICE_NO_PATTERN.test(invoiceNo)
}

/**
 * Valid billing modes. Must match the `billing_mode` Postgres enum.
 * Used by UI labels + invoice generation tests.
 */
export const BILLING_MODES = [
  'marketing_project',
  'non_billable',
  'director_office_attribution',
  'director_attribution',
  'hr_attribution',
  'finance_attribution',
] as const

export type BillingMode = (typeof BILLING_MODES)[number]

/**
 * Modes currently handled by generate_monthly_invoices.
 * Post-Stage-3b: only marketing_project auto-generates.
 * Director modes come from the manual ManualOpexSection / Create Invoice form.
 */
export const AUTO_GENERATED_BILLING_MODES: readonly BillingMode[] = [
  'marketing_project',
] as const

/**
 * Maps an invoice `billing_mode` (enum) to the corresponding
 * `monthly_statement_lines.category_code` (lookup table FK) used by the
 * statement generation flow in Phase 2 Step 6.
 *
 * Returns `null` for modes that do not produce a billable statement line
 * (currently `non_billable` — those flow through venture_pool instead).
 *
 * Categories are seeded in `20260101000003_statements.sql`.
 */
export function billingModeToCategoryCode(mode: BillingMode): string | null {
  switch (mode) {
    case 'marketing_project':
      return 'marketing_project'
    case 'director_office_attribution':
      return 'director_office'
    case 'director_attribution':
      return 'director'
    case 'hr_attribution':
      return 'hr_pool'
    case 'finance_attribution':
      return 'finance_staff'
    case 'non_billable':
      return null
  }
}

/**
 * Human-readable label for a billing mode — used in statement line
 * descriptions and billing preview cards.
 */
export function billingModeLabel(mode: BillingMode): string {
  switch (mode) {
    case 'marketing_project':
      return 'Marketing Project'
    case 'director_office_attribution':
      return 'Director Office OPEX'
    case 'director_attribution':
      return 'Director OPEX'
    case 'hr_attribution':
      return 'HR OPEX'
    case 'finance_attribution':
      return 'Finance OPEX'
    case 'non_billable':
      return 'Non-billable'
  }
}

/**
 * The transaction date for an invoice-issue journal entry: revenue belongs to
 * the INVOICE date, not the day Finance happened to click Issue. A May-31
 * invoice issued on June 4 must land in May's P&L (user 2026-06-11).
 * Falls back to the period month-end for missing/garbage invoice dates
 * (e.g. a year-0005 typo), then to today.
 */
export function invoiceJeDate(
  invoiceDate: string | null | undefined,
  periodMonth: string | null | undefined,
  today: string,
): string {
  const valid = (d: string | null | undefined): d is string => {
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
    const year = Number(d.slice(0, 4))
    return year >= 2000 && year <= 2100
  }
  if (valid(invoiceDate)) return invoiceDate
  if (valid(periodMonth)) {
    const [y, m] = periodMonth.split('-').map(Number)
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return `${periodMonth.slice(0, 7)}-${String(last).padStart(2, '0')}`
  }
  return today
}

/**
 * Fallback revenue GL code when an invoice carries no explicit category:
 * the four *_attribution billing modes ARE salary recharges by definition →
 * 5020 Salary Income; everything else stays on 5000 Service Revenue — Subs.
 * (user 2026-06-11: salary invoices were landing under Service Revenue.)
 */
export function fallbackRevenueGlCode(billingMode: string | null): string {
  switch (billingMode) {
    case 'hr_attribution':
    case 'finance_attribution':
    case 'director_office_attribution':
    case 'director_attribution':
      return '5020'
    default:
      return '5000'
  }
}

/**
 * Department name → GL segment, for tagging inter-billing EXPENSE JEs with the
 * PAYING department (user 2026-06-11: Marketing's inter-billed utilities were
 * landing in Venture's P&L because the JE inherited the invoice's
 * billing_mode segment instead of the payer's).
 */
export function deptNameToSegment(name: string | null | undefined): string | undefined {
  switch (name) {
    case 'Marketing': return 'marketing'
    case 'HR': return 'hr'
    case 'Finance': return 'finance'
    case 'Director Office': return 'director_office'
    case 'Director': return 'director'
    default: return undefined
  }
}
