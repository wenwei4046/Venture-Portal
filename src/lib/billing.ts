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
