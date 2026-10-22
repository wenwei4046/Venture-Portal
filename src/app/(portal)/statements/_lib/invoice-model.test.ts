import { describe, expect, it } from 'vitest'
import { invoicedTotal, settleSelection, statusCard, toHubInvoice, type InvoiceContext, type InvoiceRowIn } from './invoice-model'

// Invoice's hub (2026-10-14, the Finance revamp v2 — D10): every figure an
// invoice shows is worked out once, as its own page (`/invoices/[id]`) works
// it out — what came in, what credit notes took off, what is left — so the
// list, its cards, the drawer and the settle dialog all say the same.

const base: InvoiceRowIn = {
  id: 'i1',
  invoice_no: 'HV-INV-202610-0013',
  company_id: 'co-hc',
  period_month: '2026-10-01',
  billing_mode: 'hr_attribution',
  total_amount: 2204,
  status: 'issued',
  billable_to_type: 'subsidiary',
  billable_to_department_id: null,
  billable_to_freetext_name: null,
  billable_to_freetext_address: null,
  billable_to_freetext_address_parts: null,
  billable_to_freetext_phone: null,
  billable_to_freetext_email: null,
  description: 'HR shared service — Oct\nsecond line',
  invoice_date: '2026-10-07',
  due_date: '2026-11-06',
  reference_no: null,
  category_code: '5020',
  settlement_voucher_id: null,
  contract_id: null,
}

function ctx(over: Partial<InvoiceContext> = {}): InvoiceContext {
  return {
    companies: new Map([
      ['co-hc', { name: 'HOUZS Century', code: 'HC' }],
      ['co-hm', { name: 'HOUZS Mattress', code: 'HM' }],
    ]),
    departments: new Map([['d-mkt', 'Marketing']]),
    accounts: new Map([
      ['5020', 'Salary Income'],
      ['5021', 'Statutory Recharge'],
    ]),
    extraModes: [],
    lines: new Map(),
    receipts: new Map(),
    settlements: new Map(),
    creditNotes: new Map(),
    ...over,
  }
}

describe('an invoice on the hub', () => {
  it('names its party with the kind, its mode in words, and stands as one line when it has none stored', () => {
    const inv = toHubInvoice(base, ctx())
    expect(inv.party).toEqual({ name: 'HOUZS Century (HC)', kind: 'Subsidiary' })
    expect(inv.mode).toBe('HR attribution')
    expect(inv.summary).toBe('HR shared service — Oct')
    expect(inv.lines).toEqual([{ description: 'HR shared service — Oct', account: 'Salary Income', code: '5020', amount: 2204 }])
    expect(inv.category).toBe('Salary Income')
    expect(inv.gl).toEqual({ name: 'Salary Income', code: '5020' })
    expect(inv.editLines).toEqual([])
  })

  it('reads its stored lines, and its category from them when the header has none', () => {
    const inv = toHubInvoice(
      { ...base, category_code: null },
      ctx({
        lines: new Map([
          [
            'i1',
            [
              { description: 'Salary recharge', amount: 1807.28, category_code: '5020' },
              { description: 'Statutory recharge', amount: 396.72, category_code: '5021' },
            ],
          ],
        ]),
      }),
    )
    expect(inv.lines.map((l) => [l.description, l.code, l.amount])).toEqual([
      ['Salary recharge', '5020', 1807.28],
      ['Statutory recharge', '5021', 396.72],
    ])
    expect(inv.category).toBe('Salary Income + Statutory Recharge')
    expect(inv.gl).toEqual({ name: 'Salary Income + Statutory Recharge', code: '5020 + 5021' })
    expect(inv.editLines).toHaveLength(2)
  })

  it('an issued invoice part-paid and credited still owes the rest, and can be settled but not voided', () => {
    const inv = toHubInvoice(
      base,
      ctx({
        receipts: new Map([['i1', [{ voucher_no: 'HV-OR-202610-0031', payment_date: '2026-10-10', amount: 1000 }]]]),
        creditNotes: new Map([
          [
            'i1',
            [
              { id: 'cn1', no: 'HV-CN-202610-0001', amount: 204, status: 'approved', reason: 'Overbilled' },
              { id: 'cn2', no: null, amount: 50, status: 'draft', reason: null },
            ],
          ],
        ]),
      }),
    )
    expect(inv.received).toBe(1000)
    expect(inv.credited).toBe(204)
    expect(inv.remaining).toBe(1000)
    expect(inv.settleable).toBe(true)
    expect(inv.voidable).toBe(false)
    expect(inv.receipts).toEqual([{ no: 'HV-OR-202610-0031', date: '2026-10-10', amount: 1000, batchTotal: null }])
    expect(inv.creditNotes).toHaveLength(2)
  })

  it('an untouched issued invoice may be voided; a department pool’s settles by netting, not here', () => {
    expect(toHubInvoice(base, ctx()).voidable).toBe(true)
    const pool = toHubInvoice({ ...base, company_id: null, billable_to_type: 'dept_pool', billable_to_department_id: 'd-mkt' }, ctx())
    expect(pool.party).toEqual({ name: 'Marketing', kind: 'Dept pool' })
    expect(pool.settleable).toBe(false)
    expect(pool.voidable).toBe(true)
  })

  it('a paid invoice settled on a consolidated receipt shows its own part of it', () => {
    const inv = toHubInvoice(
      { ...base, status: 'paid', settlement_voucher_id: 'v9' },
      ctx({ settlements: new Map([['v9', { voucher_no: 'HV-OR-202610-0040', payment_date: '2026-10-12', amount: 5000 }]]) }),
    )
    expect(inv.received).toBe(2204)
    expect(inv.remaining).toBe(0)
    expect(inv.receipts).toEqual([{ no: 'HV-OR-202610-0040', date: '2026-10-12', amount: 2204, batchTotal: 5000 }])
    expect(inv.settleable).toBe(false)
  })

  it('one receipt per payer: a director or anybody else is keyed by name', () => {
    const a = toHubInvoice({ ...base, id: 'a', company_id: null, billable_to_type: 'director', billable_to_freetext_name: 'Loo K.W.' }, ctx())
    const b = toHubInvoice({ ...base, id: 'b', company_id: null, billable_to_type: 'director', billable_to_freetext_name: 'Loo K.W.' }, ctx())
    const c = toHubInvoice({ ...base, id: 'c' }, ctx())
    expect(a.payee).toBe(b.payee)
    expect(a.payee).not.toBe(c.payee)
  })
})

describe('the cards and the selection', () => {
  const inv = (id: string, status: string, total: number, company = 'co-hc') =>
    toHubInvoice({ ...base, id, status, total_amount: total, company_id: company }, ctx())
  const month = [inv('a', 'issued', 2204), inv('b', 'paid', 1250), inv('c', 'paid_via_netting', 880.75), inv('d', 'draft', 500), inv('e', 'voided', 300)]

  it('the total beside the month counts what went out as invoices — never a draft or a voided one', () => {
    expect(invoicedTotal(month)).toEqual({ count: 3, amount: 4334.75 })
  })

  it('a card counts and sums what its list holds; Paid takes paid via netting too', () => {
    expect(statusCard(month, 'all')).toEqual({ count: 5, amount: 5134.75 })
    expect(statusCard(month, 'paid')).toEqual({ count: 2, amount: 2130.75 })
    expect(statusCard(month, 'draft')).toEqual({ count: 1, amount: 500 })
    expect(statusCard(month, 'voided')).toEqual({ count: 1, amount: 300 })
  })

  it('settles one payer’s invoices at what they still owe, and says when two payers are ticked', () => {
    const one = settleSelection([inv('x', 'issued', 100), inv('y', 'issued', 50.5)])
    expect(one).toMatchObject({ total: 150.5, payees: 1, payer: 'HOUZS Century (HC)' })
    expect(one.settleable).toHaveLength(2)
    const two = settleSelection([inv('x', 'issued', 100), inv('z', 'issued', 20, 'co-hm')])
    expect(two).toMatchObject({ payees: 2, payer: null })
  })
})
