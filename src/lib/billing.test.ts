import { describe, it, expect } from 'vitest'
import {
  normalizeToFirstOfMonth,
  isValidInvoiceNoFormat,
  billingModeToCategoryCode,
  billingModeLabel,
  invoiceJeDate,
  deptNameToSegment,
  fallbackRevenueGlCode,
  BILLING_MODES,
  AUTO_GENERATED_BILLING_MODES,
  directorBillingTarget,
} from './billing'

describe('normalizeToFirstOfMonth', () => {
  it('normalizes a mid-month date to the first of the month', () => {
    expect(normalizeToFirstOfMonth('2026-04-15')).toBe('2026-04-01')
  })

  it('leaves a first-of-month date unchanged', () => {
    expect(normalizeToFirstOfMonth('2026-04-01')).toBe('2026-04-01')
  })

  it('handles the last day of a month', () => {
    expect(normalizeToFirstOfMonth('2026-04-30')).toBe('2026-04-01')
  })

  it('normalizes across month boundaries', () => {
    expect(normalizeToFirstOfMonth('2026-05-01')).toBe('2026-05-01')
    expect(normalizeToFirstOfMonth('2026-12-31')).toBe('2026-12-01')
  })
})

describe('isValidInvoiceNoFormat — M5 format contract', () => {
  it('accepts the canonical HV-INV-YYYYMM-NNNN format', () => {
    expect(isValidInvoiceNoFormat('HV-INV-202604-0001')).toBe(true)
    expect(isValidInvoiceNoFormat('HV-INV-202612-9999')).toBe(true)
  })

  it('rejects missing segments', () => {
    expect(isValidInvoiceNoFormat('HV-INV-202604')).toBe(false)
    expect(isValidInvoiceNoFormat('INV-202604-0001')).toBe(false)
  })

  it('rejects wrong padding on the sequence', () => {
    expect(isValidInvoiceNoFormat('HV-INV-202604-1')).toBe(false)
    expect(isValidInvoiceNoFormat('HV-INV-202604-01')).toBe(false)
  })

  it('rejects null and empty', () => {
    expect(isValidInvoiceNoFormat(null)).toBe(false)
    expect(isValidInvoiceNoFormat(undefined)).toBe(false)
    expect(isValidInvoiceNoFormat('')).toBe(false)
  })
})

describe('BILLING_MODES enum contract', () => {
  it('matches the post-Stage-3b Postgres billing_mode enum', () => {
    expect(BILLING_MODES).toEqual([
      'marketing_project',
      'non_billable',
      'director_office_attribution',
      'director_attribution',
      'hr_attribution',
      'finance_attribution',
    ])
  })

  it('auto-generated subset is only marketing_project', () => {
    expect(AUTO_GENERATED_BILLING_MODES).toEqual(['marketing_project'])
  })
})

describe('billingModeToCategoryCode — Step 6 mapping contract', () => {
  it('maps marketing_project to marketing_project', () => {
    expect(billingModeToCategoryCode('marketing_project')).toBe('marketing_project')
  })

  it('maps director_office_attribution to director_office', () => {
    expect(billingModeToCategoryCode('director_office_attribution')).toBe('director_office')
  })

  it('maps director_attribution to director', () => {
    expect(billingModeToCategoryCode('director_attribution')).toBe('director')
  })

  it('returns null for non_billable (flows through venture_pool instead)', () => {
    expect(billingModeToCategoryCode('non_billable')).toBeNull()
  })
})

describe('billingModeLabel — UI display', () => {
  it('produces human-readable labels for all modes', () => {
    expect(billingModeLabel('marketing_project')).toBe('Marketing Project')
    expect(billingModeLabel('director_office_attribution')).toBe('Director Office OPEX')
    expect(billingModeLabel('director_attribution')).toBe('Director OPEX')
    expect(billingModeLabel('non_billable')).toBe('Non-billable')
  })
})

describe('invoiceJeDate', () => {
  // Regression 2026-06-11: 17 May invoices (dated 2026-05-31) were bulk-issued
  // on June 4/7 and their revenue JEs landed in JUNE's P&L.
  it('uses the invoice date even when issued in a later month', () => {
    expect(invoiceJeDate('2026-05-31', '2026-05-01', '2026-06-04')).toBe('2026-05-31')
  })
  it('falls back to period month-end for garbage dates (year-0005 typo)', () => {
    expect(invoiceJeDate('0005-05-31', '2026-05-01', '2026-06-04')).toBe('2026-05-31')
    expect(invoiceJeDate(null, '2026-02-01', '2026-06-04')).toBe('2026-02-28')
  })
  it('falls back to today when both are missing', () => {
    expect(invoiceJeDate(null, null, '2026-06-04')).toBe('2026-06-04')
  })
})

describe('fallbackRevenueGlCode', () => {
  it('routes salary-attribution modes to 5050 Salary Income', () => {
    expect(fallbackRevenueGlCode('hr_attribution')).toBe('5050')
    expect(fallbackRevenueGlCode('finance_attribution')).toBe('5050')
    expect(fallbackRevenueGlCode('director_office_attribution')).toBe('5050')
    expect(fallbackRevenueGlCode('director_attribution')).toBe('5050')
  })
  it('keeps service billing on 5011', () => {
    expect(fallbackRevenueGlCode('marketing_project')).toBe('5011')
    expect(fallbackRevenueGlCode('venture_attribution')).toBe('5011')
    expect(fallbackRevenueGlCode(null)).toBe('5011')
  })
})

describe('deptNameToSegment', () => {
  it('maps the five dept pools to their GL segments', () => {
    expect(deptNameToSegment('Marketing')).toBe('marketing')
    expect(deptNameToSegment('Director Office')).toBe('director_office')
    expect(deptNameToSegment('Director')).toBe('director')
    expect(deptNameToSegment('HR')).toBe('hr')
    expect(deptNameToSegment('Finance')).toBe('finance')
  })
  it('returns undefined for unknown names (JE falls back to derived segment)', () => {
    expect(deptNameToSegment('Ops')).toBeUndefined()
    expect(deptNameToSegment(null)).toBeUndefined()
  })
})

// 2026-10-06: the Director OPEX card read "over RM 19,396.25" against five
// correct drafts because it compared CTC invoices with the submission's
// total_gross — basic only, no employer statutory, no CTC allowance.
describe('directorBillingTarget', () => {
  it('is the sum of the per-company CTC the submission carries — what Finance bills', () => {
    expect(
      directorBillingTarget({
        total_gross: 57600,
        by_company: [{ total_ctc: '9642.13' }, { total_ctc: 15817.92 }, { total_ctc: 14452.05 }, { total_ctc: 25768.1 }, { total_ctc: 11316.05 }],
      }),
    ).toBe(76996.25)
  })

  it('falls back to the payroll gross for a legacy snapshot without per-company rows', () => {
    expect(directorBillingTarget({ total_gross: '57600', by_company: null })).toBe(57600)
    expect(directorBillingTarget({ total_gross: 57600, by_company: [] })).toBe(57600)
  })

  it('is zero with no submission', () => {
    expect(directorBillingTarget(null)).toBe(0)
  })
})
