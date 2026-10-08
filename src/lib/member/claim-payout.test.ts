import { describe, expect, it } from 'vitest'
import { claimPayoutLine, payrollMonthLabel, readClaimPayout } from './claim-payout'

describe('readClaimPayout', () => {
  it('reads the payout member_request_json sends', () => {
    expect(readClaimPayout({ route: 'payroll', payrollMonth: '2026-09-01', voucherNo: null, voucherStatus: null }))
      .toEqual({ route: 'payroll', payrollMonth: '2026-09-01', voucherNo: null, voucherStatus: null })
    expect(readClaimPayout({ route: 'payment', payrollMonth: null, voucherNo: 'HV-PV-202610-0480', voucherStatus: 'pending_approval' }))
      .toEqual({ route: 'payment', payrollMonth: null, voucherNo: 'HV-PV-202610-0480', voucherStatus: 'pending_approval' })
  })

  it('is null for a claim not yet decided, or anything else', () => {
    expect(readClaimPayout(null)).toBeNull()
    expect(readClaimPayout(undefined)).toBeNull()
    expect(readClaimPayout({ route: 'cash' })).toBeNull()
    expect(readClaimPayout('payroll')).toBeNull()
  })
})

describe('claimPayoutLine', () => {
  const payroll = { route: 'payroll' as const, payrollMonth: '2026-09-01', voucherNo: null, voucherStatus: null }
  const requested = { route: 'payment' as const, payrollMonth: null, voucherNo: null, voucherStatus: null }
  const raised = { ...requested, voucherNo: 'HV-PV-202610-0480', voucherStatus: 'pending_approval' }

  it('a month is three letters, never "Sept"', () => {
    expect(payrollMonthLabel('2026-09-01')).toBe('Sep 2026')
  })

  it('says which payroll a claim went into, to HR and to the member', () => {
    expect(claimPayoutLine(payroll, 'approved', 'hr')).toBe('Added to the Sep 2026 payroll as a special claim')
    expect(claimPayoutLine(payroll, 'approved', 'member')).toBe('Comes with your Sep 2026 salary')
    expect(claimPayoutLine(payroll, 'paid', 'member')).toBe('Paid with the Sep 2026 salary')
  })

  it('follows a payment request through Finance to paid', () => {
    expect(claimPayoutLine(requested, 'approved', 'hr')).toBe('Payment requested — waiting for Finance')
    expect(claimPayoutLine(requested, 'approved', 'member')).toBe('Finance is arranging the payment')
    expect(claimPayoutLine(raised, 'approved', 'hr')).toBe('HV-PV-202610-0480 is waiting for approval')
    expect(claimPayoutLine({ ...raised, voucherStatus: 'paid' }, 'paid', 'member')).toBe('Paid by HV-PV-202610-0480')
  })

  it('says nothing for a claim not decided', () => {
    expect(claimPayoutLine(null, 'submitted', 'hr')).toBeNull()
  })
})
