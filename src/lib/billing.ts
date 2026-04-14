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
 * Formats an HR pool split invoice amount: department total CTC × allocation %.
 * Purely illustrative — the same formula runs inside generate_monthly_invoices
 * via set-based SQL (ROUND(x * y, 2)). Kept here so the UI and tests share one
 * source of truth for the rounding behaviour.
 */
export function computeHRPoolInvoiceAmount(
  deptTotalCtc: number,
  splitPct: number
): number {
  return Math.round(deptTotalCtc * splitPct * 100) / 100
}

/**
 * Valid billing modes. Must match the `billing_mode` Postgres enum.
 * Used by UI labels + invoice generation tests.
 */
export const BILLING_MODES = [
  'hr_pool_split',
  'finance_attribution',
  'marketing_project',
  'fixed_split',
  'non_billable',
] as const

export type BillingMode = (typeof BILLING_MODES)[number]

/**
 * Modes currently handled by generate_monthly_invoices (Phase 2 Step 5).
 * fixed_split and non_billable land in Step 8 with the Rent/Utility settings.
 */
export const AUTO_GENERATED_BILLING_MODES: readonly BillingMode[] = [
  'hr_pool_split',
  'finance_attribution',
  'marketing_project',
] as const

/**
 * Maps an invoice `billing_mode` (enum) to the corresponding
 * `monthly_statement_lines.category_code` (lookup table FK) used by the
 * statement generation flow in Phase 2 Step 6.
 *
 * Returns `null` for modes that do not produce a billable statement line
 * (currently `non_billable` — those flow through hv_operating_fund instead).
 *
 * Categories are seeded in `20260101000003_statements.sql`.
 */
export function billingModeToCategoryCode(mode: BillingMode): string | null {
  switch (mode) {
    case 'hr_pool_split':
      return 'hr_pool'
    case 'finance_attribution':
      return 'finance_staff'
    case 'marketing_project':
      return 'marketing_project'
    case 'fixed_split':
      // Fixed split lines are keyed by sub-type at insert time — the invoice
      // generator knows whether the row is rent or utility. For now, Step 5
      // does not generate fixed_split invoices (Step 8 adds them with the
      // sub-type stored on the invoice), so this branch is unreachable.
      return 'rent'
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
    case 'hr_pool_split':
      return 'HR Pool Split'
    case 'finance_attribution':
      return 'Finance Attribution'
    case 'marketing_project':
      return 'Marketing Project'
    case 'fixed_split':
      return 'Fixed Split'
    case 'non_billable':
      return 'Non-billable'
  }
}
