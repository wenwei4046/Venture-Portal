import { describe, expect, it } from 'vitest'
import type { ReconSessionRead } from '@/app/(portal)/reconciliation/_lib/recon-read'
import { matchState, reconHubModel, reconReportModel, reconSessionModel } from './recon-model'

// Daily › Reconciliation in the Finance phone app (2026-10-15, part 5c): the
// desktop page's banks against the GL and its months as a hub; a month's review
// as its page; the ticked lines' sums; the month's report.

const BANKS = [
  { id: 'hlb', bank_name: 'Hong Leong Bank', account_number: '123', current_balance: 1000, gl_account_code: '3000', is_primary: true, gl: 1000 },
  { id: 'abb', bank_name: 'Alliance Bank', account_number: '987', current_balance: 500, gl_account_code: '3001', is_primary: false, gl: 450 },
]
const SESSIONS = [
  { id: 's2', bankId: 'hlb', bank: 'Hong Leong Bank', periodMonth: '2026-09-01', file: 'Sep.pdf', status: 'open', cleared: 40, total: 47 },
  { id: 's1', bankId: 'hlb', bank: 'Hong Leong Bank', periodMonth: '2026-08-01', file: 'Aug.pdf', status: 'done', cleared: 61, total: 61 },
]

describe('reconHubModel', () => {
  const m = reconHubModel(BANKS, SESSIONS)
  it('each bank against the GL a card, the months a card; the hero says what is off', () => {
    expect(m.hero).toEqual({ value: 'RM 50.00', label: 'Off · bank vs GL · 1 bank' })
    expect(m.chip).toEqual({ text: '1 bank off', tone: 'danger' })
    expect(m.cards.map((c) => [c.label, c.sub, c.value])).toEqual([
      ['Hong Leong Bank · bank vs GL', 'Cache 1,000.00 · GL 1,000.00', '✓ Ties to GL'],
      ['Alliance Bank · bank vs GL', 'Cache 500.00 · GL 450.00', 'RM 50.00'],
      ['Monthly reconciliations', '1 open · 1 done', '2 sessions'],
    ])
  })
  it('a card’s months, open first — the month, the bank, its state and file, how much is cleared', () => {
    expect(m.lists.sessions.groups.map((g) => [g.title, g.rows.map((r) => [r.title, r.desc, r.amount])])).toEqual([
      ['Open', [['September 2026', 'Hong Leong Bank · Open · Sep.pdf', '40/47']]],
      ['Done', [['August 2026', 'Hong Leong Bank · Done · Aug.pdf', '61/61']]],
    ])
    expect(m.lists.abb.groups).toEqual([{ title: 'Open', rows: [] }])
  })
  it('every bank tying says so', () => {
    expect(reconHubModel([BANKS[0]], []).hero).toEqual({ value: '✓ Ties to GL', label: 'Bank vs GL · 1 bank' })
  })
})

const READ: ReconSessionRead = {
  session: { id: 's2', bank_account_id: 'hlb', period_month: '2026-09-01', source_filename: 'Sep.pdf', status: 'open', statement_opening: 900, statement_closing: 1000 },
  bank: { bank_name: 'Hong Leong Bank', gl_account_code: '3000' },
  statementLines: [
    { id: 'l1', date: '2026-09-03', description: 'Transfer in', amount: 300, matchKind: 'auto' },
    { id: 'l2', date: '2026-09-04', description: 'Charge', amount: -10, matchKind: 'contra' },
    { id: 'l3', date: '2026-09-04', description: 'Charge reversed', amount: 10, matchKind: 'contra' },
    { id: 'l4', date: '2026-09-09', description: 'Fee', amount: -5, matchKind: 'ignored' },
    { id: 'l5', date: '2026-09-20', description: 'Payment out', amount: -200, matchKind: null },
  ],
  groups: [{ id: 'g1', statementLineIds: ['l1'], journalLineIds: ['j1'] }],
  contraGroups: [],
  statementContraGroups: [{ id: 'g2', statementLineIds: ['l2', 'l3'] }],
  unmatchedBook: [
    { id: 'j2', date: '2026-08-28', entryNo: 'JE-0002', description: 'Cheque', amount: -120 },
    { id: 'j3', date: '2026-09-21', entryNo: 'JE-0003', description: 'Supplier', amount: -80 },
  ],
  bookInfo: { j1: { id: 'j1', date: '2026-09-03', entryNo: 'JE-0001', description: 'Receipt', amount: 300 } },
  glClosing: 1000,
}

describe('reconSessionModel', () => {
  const m = reconSessionModel(READ, { edit: true, approve: true })
  it('where the statement stands against the GL, and what it has cleared', () => {
    expect(m).toMatchObject({ month: 'September 2026', status: 'open', hero: { amount: 'RM 1,000.00', note: '✓ Ties to GL 1,000.00', light: 'ledger' } })
    expect(m.summary.map((x) => [x.label, x.value, x.sub ?? null])).toEqual([
      ['Statement', '900.00 → 1,000.00', null],
      ['GL at month-end', '1,000.00', '✓ tie'],
      ['In · out', '310.00 · 215.00', null],
      ['Cleared', '4 / 5', '1 matched · 2 contra · 1 ignored'],
      ['Statement unmatched', '1', null],
      ['Book unmatched', '1', '+1 earlier'],
      ['Statement file', 'Sep.pdf', null],
    ])
  })
  it('its matches with their book entries, the contras, the ignored and the open lines', () => {
    expect(m.matched[0]).toMatchObject({ id: 'g1', lineId: 'l1', label: 'Transfer in', sub: '3 Sep · auto · 1 book entry', amount: 300 })
    expect(m.matched[0].books[0]).toMatchObject({ entryNo: 'JE-0001' })
    expect(m.contra[0]).toMatchObject({ id: 'g2', lineId: null, label: 'Charge + 1 more', amount: 0 })
    expect(m.ignored.map((l) => l.id)).toEqual(['l4'])
    expect(m.open.map((l) => l.id)).toEqual(['l5'])
    expect(m.book.map((b) => [b.id, b.earlier])).toEqual([
      ['j2', true],
      ['j3', false],
    ])
  })
  it('a statement with no closing on file, or one off from the GL, says so', () => {
    expect(reconSessionModel({ ...READ, session: { ...READ.session, statement_closing: null } }, { edit: true, approve: true }).hero).toMatchObject({ amount: '—', light: 'def' })
    expect(reconSessionModel({ ...READ, glClosing: 940 }, { edit: true, approve: true }).hero).toMatchObject({ note: 'Off by 60.00 · GL 940.00', light: 'danger' })
  })
})

describe('matchState — the review page’s rule', () => {
  const open = [
    { id: 'a', date: '2026-09-01', description: '', amount: -200 },
    { id: 'b', date: '2026-09-01', description: '', amount: 50 },
    { id: 'c', date: '2026-09-01', description: '', amount: -50 },
  ]
  const book = [
    { id: 'x', date: '2026-09-01', description: '', amount: -120 },
    { id: 'y', date: '2026-09-01', description: '', amount: -80 },
    { id: 'z', date: '2026-09-01', description: '', amount: 80 },
  ]
  it('N statement lines ↔ M book lines whose sums agree: Match', () => {
    const s = matchState(open, book, new Set(['a']), new Set(['x', 'y']))
    expect(s).toMatchObject({ canMatch: true, words: 'Statement Σ (1) −200.00 · Book Σ (2) −200.00 ✓' })
    expect(matchState(open, book, new Set(['a']), new Set(['x'])).words).toBe('Statement Σ (1) −200.00 · Book Σ (1) −120.00 · off by 80.00')
  })
  it('one side alone, two or more summing to nothing: contra; statement lines alone: ignore', () => {
    expect(matchState(open, book, new Set(), new Set(['y', 'z']))).toMatchObject({ canContraBook: true, canMatch: false })
    expect(matchState(open, book, new Set(['b', 'c']), new Set())).toMatchObject({ canContraStatement: true, canIgnore: true })
    expect(matchState(open, book, new Set(), new Set()).words).toBe('Nothing ticked')
  })
})

describe('reconReportModel', () => {
  it('the walk from the bank’s closing to the GL, the verdict, the items, the files', () => {
    const v = reconReportModel({
      sessionId: 's2',
      bankName: 'Hong Leong Bank',
      accountNumber: '123',
      glCode: '3000',
      periodMonth: '2026-09-01',
      status: 'open',
      sourceFilename: 'Sep.pdf',
      model: {
        periodMonth: '2026-09-01',
        monthEnd: '2026-09-30',
        statementOpening: 900,
        statementClosing: 1000,
        glClosing: 880,
        outstandingReceipts: [],
        outstandingPayments: [{ date: '2026-09-21', ref: 'JE-0003', description: 'Supplier', amount: -120 }],
        stmtReceiptsNotInBooks: [],
        stmtPaymentsNotInBooks: [],
        sums: { bookReceipts: 0, bookPayments: -120, stmtReceipts: 0, stmtPayments: 0 },
        adjustedBank: 880,
        diff: 0,
        tie: true,
      },
    })
    expect(v.walk[0]).toEqual({ label: 'Balance per bank statement (30 Sep 2026)', value: '1,000.00' })
    expect(v.walk[2]).toEqual({ label: 'Less · outstanding payments not yet presented (1)', value: '(120.00)' })
    expect(v.verdict).toEqual({ text: '✓ Reconciled — statement ties to GL', tone: 'ledger' })
    expect(v.parts).toEqual([{ title: 'Outstanding payments — in books, not yet presented', rows: [{ label: 'Supplier', sub: '21 Sep 2026 · JE-0003', value: '(120.00)', tone: 'out' }] }])
    expect(v.files.map((f) => f.href)).toEqual(['/reconciliation/s2/report/export?format=pdf', '/reconciliation/s2/report/export?format=xlsx'])
  })
})
