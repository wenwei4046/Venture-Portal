import { describe, it, expect } from 'vitest'
import { eliminateInterBilling, type InterBillingElimination } from './consolidation'
import type { GlLine } from './gl-reports'

function line(account_code: string, opts: Partial<GlLine> = {}): GlLine {
  return {
    account_code,
    debit: 0,
    credit: 100,
    description: null,
    entry_id: 'e1',
    date: '2026-06-30',
    entry_no: null,
    entry_description: null,
    segment: 'hr',
    ref_type: null,
    ref_id: null,
    ...opts,
  }
}

const elim: InterBillingElimination = {
  internalInvoiceIds: new Set(['inv-internal']),
  interBillingCodes: new Set(['9050', '9051', '9056']),
}

describe('eliminateInterBilling', () => {
  it('drops every line of an internally-billed invoice (income + AR legs)', () => {
    const kept = eliminateInterBilling(
      [
        line('5020', { ref_id: 'inv-internal' }), // internal recharge income
        line('3030', { ref_id: 'inv-internal', debit: 100, credit: 0 }),
        line('5020', { ref_id: 'inv-external' }), // real external income stays
      ],
      elim,
    )
    expect(kept.map((l) => l.ref_id)).toEqual(['inv-external'])
  })

  it('drops 905x lines regardless of reference (belt for other paths)', () => {
    const kept = eliminateInterBilling(
      [line('9051', { ref_id: null, debit: 50, credit: 0 }), line('9094')],
      elim,
    )
    expect(kept.map((l) => l.account_code)).toEqual(['9094'])
  })

  it('keeps ordinary lines untouched', () => {
    const src = [line('5000'), line('9094'), line('3000', { debit: 100, credit: 0 })]
    expect(eliminateInterBilling(src, elim)).toHaveLength(3)
  })
})
