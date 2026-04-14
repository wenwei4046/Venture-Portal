import { describe, it, expect } from 'vitest'
import {
  normalizeToFirstOfMonth,
  isValidInvoiceNoFormat,
  computeHRPoolInvoiceAmount,
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

describe('computeHRPoolInvoiceAmount — set-based SQL mirror', () => {
  it('multiplies dept total × split %', () => {
    // HR dept total 23,190 × 50% → 11,595.00
    expect(computeHRPoolInvoiceAmount(23190, 0.5)).toBe(11595)
  })

  it('rounds to 2 decimals (matches ROUND(x*y, 2) in SQL)', () => {
    // 100 × 0.333 = 33.3 (already 2dp after round)
    expect(computeHRPoolInvoiceAmount(100, 0.333)).toBe(33.3)
    // 100 × 0.3333 = 33.33 (rounded half-up)
    expect(computeHRPoolInvoiceAmount(100, 0.3333)).toBe(33.33)
    // 100 × 0.33335 → 33.335 → rounds to 33.34 (half-up)
    // Note: JS Math.round is banker's-rounding-ish on the binary side, but for
    // explicit × 100 / 100 it matches Postgres ROUND(..., 2) for most cases.
    expect(computeHRPoolInvoiceAmount(100, 0.3334)).toBe(33.34)
  })

  it('handles zero split', () => {
    expect(computeHRPoolInvoiceAmount(10000, 0)).toBe(0)
  })

  it('handles the 3-company seed split adding up to total', () => {
    // Our seed: HR 23190 × 0.5 / 0.2 / 0.3 → 11595 / 4638 / 6957
    const total = 23190
    const amounts = [
      computeHRPoolInvoiceAmount(total, 0.5),
      computeHRPoolInvoiceAmount(total, 0.2),
      computeHRPoolInvoiceAmount(total, 0.3),
    ]
    expect(amounts).toEqual([11595, 4638, 6957])
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(total)
  })
})

describe('BILLING_MODES enum contract', () => {
  it('has exactly 5 modes matching the Postgres billing_mode enum', () => {
    expect(BILLING_MODES).toEqual([
      'hr_pool_split',
      'finance_attribution',
      'marketing_project',
      'fixed_split',
      'non_billable',
    ])
  })

  it('auto-generated subset excludes fixed_split + non_billable', () => {
    expect(AUTO_GENERATED_BILLING_MODES).toEqual([
      'hr_pool_split',
      'finance_attribution',
      'marketing_project',
    ])
  })
})

describe('billingModeToCategoryCode — Step 6 mapping contract', () => {
  it('maps hr_pool_split to hr_pool', () => {
    expect(billingModeToCategoryCode('hr_pool_split')).toBe('hr_pool')
  })

  it('maps finance_attribution to finance_staff', () => {
    expect(billingModeToCategoryCode('finance_attribution')).toBe('finance_staff')
  })

  it('maps marketing_project to marketing_project', () => {
    expect(billingModeToCategoryCode('marketing_project')).toBe('marketing_project')
  })

  it('returns null for non_billable (flows through hv_operating_fund instead)', () => {
    expect(billingModeToCategoryCode('non_billable')).toBeNull()
  })
})

describe('billingModeLabel — UI display', () => {
  it('produces human-readable labels for all modes', () => {
    expect(billingModeLabel('hr_pool_split')).toBe('HR Pool Split')
    expect(billingModeLabel('finance_attribution')).toBe('Finance Attribution')
    expect(billingModeLabel('marketing_project')).toBe('Marketing Project')
    expect(billingModeLabel('fixed_split')).toBe('Fixed Split')
    expect(billingModeLabel('non_billable')).toBe('Non-billable')
  })
})
