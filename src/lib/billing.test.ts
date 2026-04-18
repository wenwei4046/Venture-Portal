import { describe, it, expect } from 'vitest'
import {
  normalizeToFirstOfMonth,
  isValidInvoiceNoFormat,
  billingModeToCategoryCode,
  billingModeLabel,
  BILLING_MODES,
  AUTO_GENERATED_BILLING_MODES,
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
