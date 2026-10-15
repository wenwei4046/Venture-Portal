import { describe, expect, it } from 'vitest'
import type { StatementRead, StatementRow } from '@/app/(portal)/statements/_lib/statement-read'
import { askedStatementMonth, statementHubModel, statementRecordModel, statementsPlace, statusMix } from './statement-model'

// Fund › Statements in the Finance phone app (2026-10-15, part 5c): the desktop
// page's cards for the month on show, a card's statements, a statement as its
// page with the step its status allows.

const row = (over: Partial<StatementRow> & { id: string }): StatementRow => ({
  period_month: '2026-09-01',
  company_id: 'car',
  status: 'draft',
  total_invoice: 0,
  total_contra: 0,
  net_amount: 0,
  created_at: '2026-09-22T02:00:00Z',
  ...over,
})
const COMPANIES = new Map([
  ['car', { name: 'Carres', code: 'CAR' }],
  ['hc', { name: 'HOUZS Century', code: 'HC' }],
])
const LIST = [
  row({ id: 'a', total_invoice: 22507.9, total_contra: 600, net_amount: 21907.9 }),
  row({ id: 'b', company_id: 'hc', total_contra: 15013.21, net_amount: -15013.21 }),
  row({ id: 'c', period_month: '2026-08-01', status: 'issued', total_invoice: 100, net_amount: 100 }),
]

describe('statementHubModel', () => {
  const m = statementHubModel(LIST, COMPANIES, '2026-09')
  it('the month’s net over the desktop page’s cards', () => {
    expect(m.hero).toEqual({ value: 'RM 6,894.69', label: 'Net · September 2026' })
    expect(m.chip).toEqual({ text: 'all draft', tone: 'def' })
    expect(m.cards.map((c) => [c.label, c.sub, c.value])).toEqual([
      ['Statements · September', 'invoice 22,507.90 − contra 15,613.21', '2 statements'],
      ['Draft', 'waiting to be issued', '2 statements'],
      ['All statements', '1 issued · 0 paid', '3 statements'],
    ])
  })
  it('a row is the company, its code · state · invoice − contra, the net (what HV owes with a minus)', () => {
    expect(m.lists.month[0].rows.map((r) => [r.title, r.desc, r.amount, r.tone])).toEqual([
      ['Carres', 'CAR · draft · invoice 22,507.90 − contra 600.00', '21,907.90', null],
      ['HOUZS Century', 'HC · draft · invoice 0.00 − contra 15,013.21', '−15,013.21', 'out'],
    ])
    expect(m.lists.all.map((g) => [g.title, g.rows.length])).toEqual([
      ['September 2026', 2],
      ['August 2026', 1],
    ])
  })
  it('a month with none says so; the statuses read as the desktop writes them', () => {
    expect(statementHubModel(LIST, COMPANIES, '2026-10').chip).toEqual({ text: 'None generated', tone: 'def' })
    expect(statusMix([{ status: 'issued' }, { status: 'paid' }, { status: 'paid' }])).toBe('1 issued · 2 paid')
  })
})

describe('the page’s month', () => {
  it('the asked month, else the newest with statements; the newest is the bare address', () => {
    expect(askedStatementMonth('2026-07', ['2026-09'], '2026-10')).toBe('2026-07')
    expect(askedStatementMonth(undefined, ['2026-09', '2026-08'], '2026-10')).toBe('2026-09')
    expect(askedStatementMonth(undefined, [], '2026-10')).toBe('2026-10')
    expect(statementsPlace('2026-09', '2026-09')).toMatchObject({ keep: '', period: { label: 'September 2026', prev: 'm=2026-08', next: 'm=2026-10' } })
  })
})

describe('statementRecordModel', () => {
  const read: StatementRead = {
    statement: { ...row({ id: 'a', total_invoice: 22507.9, total_contra: 600, net_amount: 21907.9 }), issued_at: null },
    company: { name: 'Carres', short_code: 'CAR' },
    invoiceLines: [{ id: 'i1', line_type: 'invoice', category_code: 'marketing_project', description: 'Marketing Project — Sep 2026', amount: 22507.9 }],
    contraLines: [{ id: 'c1', line_type: 'contra', category_code: 'loan_repayment', description: 'Loan interest', amount: 600 }],
  }
  it('its items, the net and who pays whom; a draft may be issued', () => {
    const r = statementRecordModel(read, { created: '22 Sep 2026', issued: null }, { edit: true })
    expect(r).toMatchObject({ company: 'Carres', period: 'September 2026', net: 'RM 21,907.90', direction: 'Carres pays HV', can: { issue: true, paid: false } })
    expect(r.invoiceLines).toEqual([{ key: 'i1', label: 'Marketing Project', sub: 'Marketing Project — Sep 2026', value: '22,507.90' }])
    expect(r.contraLines).toEqual([{ key: 'c1', label: 'Loan Repayment', sub: 'Loan interest', value: '−600.00' }])
  })
  it('an issued one may be marked paid; without Edit, neither', () => {
    const issued = { ...read, statement: { ...read.statement, status: 'issued', issued_at: '2026-10-01T01:00:00Z' } }
    expect(statementRecordModel(issued, { created: '22 Sep 2026', issued: '1 Oct 2026 09:00' }, { edit: true }).can).toEqual({ issue: false, paid: true })
    expect(statementRecordModel(issued, { created: '22 Sep 2026', issued: null }, { edit: false }).can).toEqual({ issue: false, paid: false })
    expect(statementRecordModel({ ...read, statement: { ...read.statement, net_amount: -5 } }, { created: '', issued: null }, { edit: true }).direction).toBe('HV owes Carres')
  })
})
