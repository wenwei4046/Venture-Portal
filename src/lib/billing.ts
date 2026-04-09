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
  'finance_mgmt_fee',
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
  'finance_mgmt_fee',
  'marketing_project',
] as const
