import { describe, expect, it } from 'vitest'
import { buildTermsSegments, type PositionTerms } from './treasury-terms'
import { askLine, askOf, askWords, comparisonRows, figuresAt, termsAfterAsk, termsAskView, termsRequestNote, type TermsAsk, type TermsRequestRow } from './terms-change-request'

// A deal's terms change filed for the Principal (2026-10-24): what it asks, worked out as the amend RPC will apply it,
// beside the terms that month runs on now. BI#7 — Lim Wei Liang's 60,000 from 5 Apr 2025, 0.5% × 60, re-stated from
// January at 0.833% on the 51,000 owed then (51 months, 1,000 a month); Finance asks for no fixed term from October
// with the interest kept on that 51,000 — the change the user made by hand on 2026-10-24.

const PAID = ['2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
const BY_MONTH: Record<string, number> = Object.fromEntries(PAID.map((ym) => [ym, 1000]))
const BI7: PositionTerms = {
  principal: 60000,
  startYM: '2025-04',
  firstDueYM: '2025-05',
  current: { rate: 0.00833, months: 51, compounding: false, effectiveFrom: '2026-01' },
  history: [{ validFrom: '2025-05', validTo: '2025-12', rate: 0.005, months: 60, compounding: false }],
}
const OCTOBER: TermsAsk = { fromYM: '2026-10', rate: null, remainingMonths: null, compounding: null, noFixedTerm: true, interestOnOriginal: false, interestKeepsBase: true }

const row = (over: Partial<TermsRequestRow> = {}): TermsRequestRow => ({
  id: 'r1',
  record_kind: 'fund_source',
  record_id: 'bi7',
  effective_from: '2026-10-01',
  rate: null,
  remaining_months: null,
  compound_interest: null,
  no_fixed_term: true,
  interest_on_original: false,
  interest_keeps_base: true,
  reason: '10月起无固定期限，利息照1月的51,000算',
  status: 'pending',
  approval_id: 'a1',
  created_by: 'fin',
  created_at: '2026-10-24T07:40:00Z',
  decided_by: null,
  decided_at: null,
  decision_note: null,
  ...over,
})

describe('the terms once the change is applied', () => {
  it('closes January’s terms in September and runs October on with no fixed term — what the amend writes', () => {
    const after = termsAfterAsk('fund_source', BI7, OCTOBER)
    expect(after.history[1]).toMatchObject({ validFrom: '2026-01', validTo: '2026-09', rate: 0.00833, months: 51, nextInterestKeepsBase: true, nextInterestOnOriginal: false })
    expect(after.current).toEqual({ rate: 0.00833, months: null, compounding: false, effectiveFrom: '2026-10' })
    // The very segments BI#7 has since the user's own change (terms-interest-keeps-base.test.ts).
    expect(buildTermsSegments(after, BY_MONTH)[2]).toMatchObject({ fromYM: '2026-10', months: null, base: 42000, interestBase: 51000, interestKeepsBase: true, interestPerMonth: 424.83 })
  })

  it('keeps the end month when the months left are not asked; counts them from the month when they are', () => {
    const rate = termsAfterAsk('fund_source', BI7, { ...OCTOBER, noFixedTerm: false, interestKeepsBase: false, rate: 0.01 })
    // January + 51 − 1 = March 2030: 42 left counting October.
    expect(rate.current).toMatchObject({ rate: 0.01, months: 42 })
    expect(termsAfterAsk('fund_source', BI7, { ...OCTOBER, noFixedTerm: false, remainingMonths: 12 }).current.months).toBe(12)
  })

  it('a loan once without a fixed term stays so; a fund source without one may take one', () => {
    const open: PositionTerms = { ...BI7, current: { ...BI7.current, months: null } }
    expect(termsAfterAsk('loan', open, { ...OCTOBER, noFixedTerm: false, remainingMonths: 12 }).current.months).toBeNull()
    expect(termsAfterAsk('fund_source', open, { ...OCTOBER, noFixedTerm: false, remainingMonths: 12 }).current.months).toBe(12)
  })
})

describe('what the Principal is shown', () => {
  it('BI#7 now and as asked: 42 months at 1,424.83 → no fixed term at 424.83 on 51,000 as before', () => {
    const view = termsAskView('fund_source', BI7, BY_MONTH, OCTOBER, 'pending')
    expect(view.ok).toBe(true)
    if (!view.ok) return
    expect(comparisonRows(figuresAt(view.before, '2026-10'), figuresAt(view.after, '2026-10'))).toEqual([
      { label: 'Rate', now: '0.833% /mo', asked: '0.833% /mo', changed: false },
      { label: 'Term', now: '42 months left · to Mar 2030', asked: 'No fixed term', changed: true },
      { label: 'Principal a month', now: 'RM 1,000.00', asked: 'None falls due', changed: true },
      { label: 'Interest a month', now: 'RM 424.83 on RM 51,000.00', asked: 'RM 424.83 on RM 51,000.00 as before', changed: true },
      { label: 'Each month', now: 'RM 1,424.83', asked: 'RM 424.83', changed: true },
    ])
    expect(askLine(view.after)).toBe('0.833% /mo · no fixed term · interest RM 424.83 a month on RM 51,000.00 as before')
  })

  it('a rate on the original principal, the end month kept (HC’s Conts 60k: 3% from June on the whole 60,000)', () => {
    const hc: PositionTerms = { principal: 60000, startYM: '2025-12', firstDueYM: '2026-01', current: { rate: 0.035, months: 6, compounding: false, effectiveFrom: null }, history: [] }
    const paid = { '2026-01': 10000, '2026-02': 10000, '2026-03': 10000, '2026-04': 10000, '2026-05': 10000 }
    const view = termsAskView('fund_source', hc, paid, { fromYM: '2026-06', rate: 0.03, remainingMonths: null, compounding: null, noFixedTerm: false, interestOnOriginal: true, interestKeepsBase: false }, 'pending')
    if (!view.ok) throw new Error(view.why)
    expect(figuresAt(view.before, '2026-06')).toMatchObject({ rate: 0.035, months: 1, endYM: '2026-06', principalPerMonth: 10000, interestPerMonth: 2100 })
    expect(figuresAt(view.after, '2026-06')).toMatchObject({ rate: 0.03, months: 1, principalPerMonth: 10000, interestPerMonth: 1800, interestBase: 60000, basis: 'original' })
  })

  it('a month the deal has moved past is said, not worked out', () => {
    expect(termsAskView('fund_source', BI7, BY_MONTH, { ...OCTOBER, fromYM: '2026-01' }, 'pending')).toEqual({ ok: false, why: 'Its terms changed from Jan 2026 since — the month asked has to come after that.' })
  })

  it('approved, the two segments the change made; taken back since, said so', () => {
    const applied = termsAfterAsk('fund_source', BI7, OCTOBER)
    const view = termsAskView('fund_source', applied, BY_MONTH, OCTOBER, 'approved')
    expect(view.ok && [view.before.fromYM, view.after.fromYM, view.after.interestPerMonth]).toEqual(['2026-01', '2026-10', 424.83])
    expect(termsAskView('fund_source', BI7, BY_MONTH, OCTOBER, 'approved')).toEqual({ ok: false, why: 'The change was taken back since.' })
  })

  it('the ask in words, off the row alone', () => {
    expect(askWords(askOf(row()))).toBe('From Oct 2026 · no fixed term · interest on the principal it was on before')
    expect(askWords(askOf(row({ rate: '0.04', remaining_months: 12, no_fixed_term: false, interest_keeps_base: false, compound_interest: true })))).toBe('From Oct 2026 · 4.000% /mo · 12 months left · compounding')
  })
})

describe('what the deal’s page says', () => {
  const names: Record<string, string> = { fin: 'Finance Manager', pri: 'Principal' }
  const note = (r: TermsRequestRow | null, reader: { id: string; approves: boolean }, now = new Date('2026-10-25T00:00:00Z')) =>
    termsRequestNote({
      row: r,
      kind: 'fund_source',
      terms: BI7,
      principalByMonth: BY_MONTH,
      nameOf: (id) => (id ? (names[id] ?? null) : null),
      stamp: (iso) => iso.slice(0, 10),
      readerId: reader.id,
      readerApprovesAll: reader.approves,
      now,
    })

  it('waiting: what it asks in figures, who filed it — Withdraw for them, Approvals for the Principal', () => {
    expect(note(row(), { id: 'fin', approves: false })).toMatchObject({
      status: 'pending',
      fromYM: '2026-10',
      line: '0.833% /mo · no fixed term · interest RM 424.83 a month on RM 51,000.00 as before',
      by: 'Finance Manager',
      at: '2026-10-24',
      mayWithdraw: true,
      decides: false,
    })
    expect(note(row(), { id: 'other', approves: false })).toMatchObject({ mayWithdraw: false, decides: false })
    expect(note(row(), { id: 'pri', approves: true })).toMatchObject({ mayWithdraw: true, decides: true })
  })

  it('decided: for a month, with who decided and their words; withdrawn, nothing', () => {
    const rejected = row({ status: 'rejected', decided_by: 'pri', decided_at: '2026-10-24T09:00:00Z', decision_note: 'Wait for the agreement' })
    expect(note(rejected, { id: 'fin', approves: false })).toMatchObject({ status: 'rejected', decidedBy: 'Principal', decidedAt: '2026-10-24', note: 'Wait for the agreement', mayWithdraw: false })
    expect(note(rejected, { id: 'fin', approves: false }, new Date('2026-12-01T00:00:00Z'))).toBeNull()
    expect(note(row({ status: 'withdrawn' }), { id: 'fin', approves: false })).toBeNull()
    expect(note(null, { id: 'fin', approves: false })).toBeNull()
  })
})
