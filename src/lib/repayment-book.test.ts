import { describe, expect, it } from 'vitest'
import { projected, selectedColumns } from '@/test/select-columns'
import { bookWindow, loadRepaymentBook, type BookDeal } from './repayment-book'
import type { PlanRow, RepaymentPlan } from './repayment-plan'

// 2026-10-09 — the Overview's "Overdue instalments" and "Coming up · next 14
// days" (the user's Claude Design handoff): every live deal's installments
// that still have something unpaid, before today or within the next 14 days.

const row = (no: number, due: string, installment: number, outstanding: number): PlanRow => ({
  no, ym: due.slice(0, 7), due, installment, principal: null, interest: installment, balance: 0, outstanding, remark: '', tone: '',
})
const plan = (rows: PlanRow[], months: number | null = rows.length): RepaymentPlan => ({
  kind: 'fixed', rows, months, paidCount: 0, outstandingDue: 0, firstDue: rows[0]?.due ?? null, firstInstallment: rows[0]?.installment ?? 0,
  totalInterest: 0, principalPaid: 0, interestPaid: 0, principalOwed: 0,
})

const deals: BookDeal[] = [
  {
    kind: 'collect', id: 'l1', name: 'HOUZS Bedding', href: '/fund-out/l1', companyId: 'co-hb',
    plan: plan([row(1, '2026-08-15', 1000, 0), row(2, '2026-09-15', 1000, 1000), row(3, '2026-10-15', 1000, 1000), row(4, '2026-11-15', 1000, 1000)]),
  },
  {
    kind: 'pay', id: 'f1', name: 'Kenanga Capital', href: '/fund-in/f1',
    plan: plan([row(1, '2026-10-09', 4400, 4400), row(2, '2026-10-23', 4400, 4400), row(3, '2026-10-24', 4400, 4400)]),
  },
  {
    kind: 'collect', id: 'l2', name: 'HOUZS Design', href: '/fund-out/l2',
    plan: plan([row(1, '2026-10-01', 500, 120.5), row(2, '2026-10-20', 500, 0)]),
  },
]

describe('the book around today', () => {
  it('lists what is unpaid before today as overdue, oldest first', () => {
    const { overdue } = bookWindow(deals, '2026-10-09')
    expect(overdue.map((e) => [e.name, e.due, e.no, e.outstanding])).toEqual([
      ['HOUZS Bedding', '2026-09-15', 2, 1000],
      ['HOUZS Design', '2026-10-01', 1, 120.5],
    ])
  })

  it('lists the next 14 days from today, today and the 14th day included', () => {
    const { upcoming } = bookWindow(deals, '2026-10-09')
    expect(upcoming.map((e) => [e.kind, e.name, e.due, e.no, e.months])).toEqual([
      ['pay', 'Kenanga Capital', '2026-10-09', 1, 3],
      ['collect', 'HOUZS Bedding', '2026-10-15', 3, 4],
      ['pay', 'Kenanga Capital', '2026-10-23', 2, 3],
    ])
    expect(upcoming[0].href).toBe('/fund-in/f1')
  })

  it('takes a different window', () => {
    expect(bookWindow(deals, '2026-10-09', 40).upcoming).toHaveLength(5)
  })

  it('carries each deal’s company onto its entries', () => {
    const { overdue } = bookWindow(deals, '2026-10-09')
    expect(overdue[0]).toMatchObject({ name: 'HOUZS Bedding', companyId: 'co-hb' })
  })
})

// 2026-10-12 — one side of the book: the Overdue page's Fund OUT, the Fund OUT
// list and the Overview's Subsidiaries read the loans alone, each with its
// borrower; a fund source carries the company it came from.
describe('loading one side of the book', () => {
  const TABLES: Record<string, Array<Record<string, unknown>>> = {
    loans: [{ id: 'l1', company_id: 'co-hb', principal: 12000, effective_rate: 0.01, tenure_months: 3, status: 'active', repayment_terms: 'EMI 分期 · 3期', compound_interest: false, disbursement_date: '2026-07-15', repayment_start_month: null, terms_effective_from: null }],
    fund_sources: [{ id: 'f1', status: 'active', amount: 30000, cost_rate: 0.01, lock_in_months: 3, compound_interest: false, effective_date: '2026-09-20', repayment_start_month: null, terms_effective_from: null, from_company_id: 'co-hc', from_department_id: null, from_freetext_name: null }],
    companies: [{ id: 'co-hb', name: 'HOUZS Bedding', short_code: 'HB' }, { id: 'co-hc', name: 'HOUZS Century', short_code: 'HC' }],
    departments: [],
    repayments: [],
    fund_source_repayments: [],
    treasury_terms_history: [],
  }
  function client(read: string[]) {
    return {
      from: (table: string) => {
        read.push(table)
        // Only the columns selected come back, as from PostgREST.
        let columns: string[] | null = null
        const q: Record<string, unknown> = {}
        for (const m of ['eq', 'in', 'order', 'range']) q[m] = () => q
        q.select = (c?: string) => ((columns = selectedColumns(c)), q)
        q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: projected(TABLES[table] ?? [], columns), error: null }).then(res)
        return q
      },
    }
  }

  it('reads only the loans for the collect side, each with its borrower', async () => {
    const read: string[] = []
    const deals = await loadRepaymentBook(client(read) as never, '2026-10-09', { only: 'collect' })
    expect(deals.map((d) => [d.kind, d.id, d.name, d.companyId])).toEqual([['collect', 'l1', 'HOUZS Bedding', 'co-hb']])
    expect(read).not.toContain('fund_sources')
    expect(read).not.toContain('fund_source_repayments')
  })

  it('reads only the fund sources for the pay side, each with the company it came from', async () => {
    const read: string[] = []
    const deals = await loadRepaymentBook(client(read) as never, '2026-10-09', { only: 'pay' })
    expect(deals.map((d) => [d.kind, d.id, d.name, d.companyId])).toEqual([['pay', 'f1', 'HOUZS Century', 'co-hc']])
    expect(read).not.toContain('loans')
    expect(read).not.toContain('repayments')
  })

  it('names a director’s fund source by the director (2026-10-12)', async () => {
    const saved = TABLES.fund_sources
    TABLES.fund_sources = [{ ...saved[0], from_company_id: null, from_director_id: 'd1' }]
    TABLES.directors = [{ id: 'd1', name: 'Chai Meng Keat' }]
    try {
      const deals = await loadRepaymentBook(client([]) as never, '2026-10-09', { only: 'pay' })
      expect(deals.map((d) => [d.name, d.companyId])).toEqual([['Chai Meng Keat', null]])
    } finally {
      TABLES.fund_sources = saved
      delete TABLES.directors
    }
  })

  it('reads both sides when asked for neither', async () => {
    const deals = await loadRepaymentBook(client([]) as never, '2026-10-09')
    expect(deals.map((d) => d.kind)).toEqual(['collect', 'pay'])
  })

  // 2026-10-12 (user: 现在只能选月份不能选日期): a deal's instalments fall on its
  // repayment start's day — the date Finance picked.
  it('puts each deal’s instalments on its repayment start’s day', async () => {
    const saved = { loans: TABLES.loans, fund_sources: TABLES.fund_sources }
    TABLES.loans = [{ ...saved.loans[0], repayment_start_month: '2026-08-01', repayment_start_date: '2026-08-25' }]
    TABLES.fund_sources = [{ ...saved.fund_sources[0], repayment_start_month: '2026-10-01', repayment_date: '2026-10-07' }]
    try {
      const deals = await loadRepaymentBook(client([]) as never, '2026-10-09')
      expect(deals.map((d) => d.plan.rows.map((r) => r.due))).toEqual([
        ['2026-08-25', '2026-09-25', '2026-10-25'],
        ['2026-10-07', '2026-11-07', '2026-12-07'],
      ])
    } finally {
      Object.assign(TABLES, saved)
    }
  })
})
