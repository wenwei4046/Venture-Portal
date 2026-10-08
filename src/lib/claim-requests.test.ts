import { describe, expect, it } from 'vitest'
import { checkRaiseClaimVoucher, claimReference, readClaimQueueRow, splitClaimQueue } from './claim-requests'

const CLAIM = '11111111-0000-4000-8000-000000000001'
const BANK = '22222222-0000-4000-8000-000000000002'

describe('readClaimQueueRow', () => {
  it('reads claim_payment_queue’s NUMERIC amount and its blanks', () => {
    expect(readClaimQueueRow({
      claim_id: CLAIM, claim_type: 'benefit', claimant_name: 'ANTHONY', department: 'Revenue Department',
      amount: '450.00', description: 'Plane ticket', source_pool: 'venture_pool', request_no: 'RQ-2610-001',
      approved_by_name: 'HR Manager', approved_at: '2026-10-08T09:00:00Z', voucher_id: null, voucher_no: null, voucher_status: null,
    })).toEqual({
      claimId: CLAIM, claimType: 'benefit', claimantName: 'ANTHONY', department: 'Revenue Department',
      amount: 450, description: 'Plane ticket', sourcePool: 'venture_pool', requestNo: 'RQ-2610-001',
      approvedByName: 'HR Manager', approvedAt: '2026-10-08T09:00:00Z', voucherId: null, voucherNo: null, voucherStatus: null,
    })
  })
})

describe('splitClaimQueue', () => {
  it('separates what waits for Finance from what waits for the Principal', () => {
    const waiting = readClaimQueueRow({ claim_id: CLAIM, claim_type: 'benefit', amount: '1' })
    const raised = readClaimQueueRow({ claim_id: CLAIM, claim_type: 'project', amount: '1', voucher_id: BANK, voucher_status: 'pending_approval' })
    expect(splitClaimQueue([waiting, raised])).toEqual({ toRaise: [waiting], withPrincipal: [raised] })
  })
})

describe('claimReference', () => {
  it('quotes the member’s request number, else says what kind of claim it is', () => {
    expect(claimReference({ requestNo: 'RQ-2610-001', claimType: 'benefit' })).toBe('RQ-2610-001')
    expect(claimReference({ requestNo: null, claimType: 'project' })).toBe('Pool claim')
  })
})

describe('checkRaiseClaimVoucher', () => {
  it('passes a claim, a bank and a method', () => {
    expect(checkRaiseClaimVoucher({ claimId: CLAIM, bankId: BANK, method: 'cheque' }))
      .toEqual({ ok: true, input: { claimId: CLAIM, bankId: BANK, method: 'cheque' } })
  })

  it('names what is missing instead of sending it', () => {
    expect(checkRaiseClaimVoucher({ claimId: CLAIM, bankId: '', method: 'cheque' }))
      .toEqual({ ok: false, reason: 'Choose the bank account to pay from.' })
    expect(checkRaiseClaimVoucher({ claimId: CLAIM, bankId: BANK, method: 'netting' }))
      .toEqual({ ok: false, reason: 'Choose how the claim is paid: bank transfer, cheque or cash.' })
    expect(checkRaiseClaimVoucher({ claimId: 'x', bankId: BANK, method: 'cash' }).ok).toBe(false)
  })
})
