import { describe, expect, it } from 'vitest'
import { withActions } from '@/test/with-actions'
import { decidableCount, type WaitingRow } from './approvals-waiting'

// 2026-10-17 — what waits for one reader's decision: the Principal's Overview line ("7 requests waiting for your
// approval"), its Approvals tile and the phone's Approvals tab count the queue's items as the queue lists them —
// a combined approval one — and only those the reader may decide (lib/approval-domains.ts).

const row = (id: string, more: Partial<WaitingRow> = {}): WaitingRow => ({ id, group_id: null, request_type: 'payment_voucher', submitted_by: 'finance', ...more })

const principal = withActions({ id: 'p', role: 'principal', permissions: ['approvals', 'treasury', 'view_switch'] })

describe('decidableCount', () => {
  it('counts a request once and a combined approval once, however many it holds', () => {
    const pending = [
      row('a'),
      row('b'),
      // A payroll batch: three vouchers, one item.
      row('c1', { group_id: 'g1' }),
      row('c2', { group_id: 'g1' }),
      row('c3', { group_id: 'g1' }),
      // A loan and its disbursement, approved together.
      row('d1', { group_id: 'g2', request_type: 'new_loan' }),
      row('d2', { group_id: 'g2' }),
    ]
    expect(decidableCount(pending, principal)).toBe(4)
  })

  it('counts the Principal’s own requests too — the owner kind decides what it raised (2026-08-06)', () => {
    expect(decidableCount([row('a', { submitted_by: 'p' })], principal)).toBe(1)
  })

  it('leaves out what the reader may not decide: a kind their Approve does not reach, their own as a checker', () => {
    // Treasury · Approve (the `override` key) — a checker, not the owner kind.
    const checker = withActions({ id: 'f', role: 'finance', permissions: ['treasury', 'override'] })
    const pending = [row('a'), row('b', { submitted_by: 'f' }), row('c', { request_type: 'new_contract' })]
    // Only `a`: `b` is theirs, `c` (a contract) only the queue's own Approve decides.
    expect(decidableCount(pending, checker)).toBe(1)
  })

  it('is nothing for nobody, and nothing for an empty queue', () => {
    expect(decidableCount([row('a')], null)).toBe(0)
    expect(decidableCount([], principal)).toBe(0)
  })
})
