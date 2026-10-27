import { describe, expect, it } from 'vitest'
import {
  amendDraftOf,
  amendFormData,
  amendWindow,
  amendsNothing,
  compoundSent,
  draftOfForm,
  explainAmendRefusal,
  laterYM,
  owedAtStart,
  wholeChoiceName,
  type AmendTerms,
} from './fund-amend'

// Amend terms sends only what changed (2026-10-16 — the user's rule of
// 2026-10-14: shared logins open one deal on two screens, and a form sent
// whole puts back what the other changed). The four RPCs keep whatever is
// not sent, so an untouched field must not be sent at all.

const LOAN: AmendTerms = { ratePct: '2', months: '12', start: '2026-03-15', compound: false, text: 'EMI · 资金来源: King', termsFrom: null, nextMonth: '2026-11' }
const SOURCE: AmendTerms = { ratePct: '0.85', months: '', start: '2025-07-31', compound: true, text: 'lent to: CMI', termsFrom: '2026-09', nextMonth: '2026-11' }
const entries = (fd: FormData) => Object.fromEntries(fd.entries())

describe('Amend terms — what is sent', () => {
  it('from a month on: the month always, the rest only when changed', () => {
    const d = amendDraftOf(LOAN)
    expect(entries(amendFormData('out', 'l1', LOAN, d))).toEqual({ loan_id: 'l1', effective_from: '2026-11' })
    expect(entries(amendFormData('out', 'l1', LOAN, { ...d, ratePct: '2.5', remaining: '24', reason: ' renegotiated ' }))).toEqual({
      loan_id: 'l1',
      effective_rate_percent: '2.5',
      effective_from: '2026-11',
      remaining_months: '24',
      reason: 'renegotiated',
    })
  })

  it('no fixed term from then drops the months left', () => {
    const d = { ...amendDraftOf(SOURCE), remaining: '12', noFixedTerm: true }
    expect(entries(amendFormData('in', 's1', SOURCE, d))).toEqual({ fund_source_id: 's1', effective_from: '2026-11', no_fixed_term: 'on' })
  })

  it('a rate typed the same way it is stored is no change', () => {
    const d = { ...amendDraftOf(SOURCE), mode: 'whole' as const, ratePct: '0.850' }
    expect(amendsNothing(amendFormData('in', 's1', SOURCE, d))).toBe(true)
  })

  it('the whole deal again: each field under the form’s own name, only when changed', () => {
    const d = { ...amendDraftOf(LOAN), mode: 'whole' as const, months: '24', start: '2026-04-01', compound: true }
    expect(entries(amendFormData('out', 'l1', LOAN, d))).toEqual({ loan_id: 'l1', compound_interest: 'on', tenure_months: '24', disbursement_date: '2026-04-01' })
    const s = { ...amendDraftOf(SOURCE), mode: 'whole' as const, months: '36', compound: false, text: 'lent to: CMI · HC' }
    expect(entries(amendFormData('in', 's1', SOURCE, s))).toEqual({ fund_source_id: 's1', compound_interest: 'off', lock_in_months: '36', notes: 'lent to: CMI · HC' })
  })

  it('a fund source’s periods cleared says so — blank is no fixed term', () => {
    const was = { ...SOURCE, months: '60' }
    const d = { ...amendDraftOf(was), mode: 'whole' as const, months: '' }
    expect(entries(amendFormData('in', 's1', was, d))).toEqual({ fund_source_id: 's1', lock_in_months: '' })
  })

  it('the compound switch: on, off, or — not sent — as it is', () => {
    const fd = new FormData()
    expect(compoundSent(fd)).toBeNull()
    fd.set('compound_interest', 'off')
    expect(compoundSent(fd)).toBe(false)
    fd.set('compound_interest', 'on')
    expect(compoundSent(fd)).toBe(true)
  })

  it('the desktop form read back: an untouched form sends nothing but the deal', () => {
    const fd = new FormData()
    fd.set('loan_id', 'l1')
    fd.set('effective_rate_percent', '2')
    fd.set('tenure_months', '12')
    fd.set('disbursement_date', '2026-03-15')
    fd.set('repayment_terms', 'EMI · 资金来源: King')
    // An unticked checkbox is not in the form at all.
    const d = draftOfForm('out', fd, 'whole', LOAN)
    expect(amendsNothing(amendFormData('out', 'l1', LOAN, d))).toBe(true)
    fd.set('compound_interest', 'on')
    expect(entries(amendFormData('out', 'l1', LOAN, draftOfForm('out', fd, 'whole', LOAN)))).toEqual({ loan_id: 'l1', compound_interest: 'on' })
  })
})

// Where a change can start (2026-10-27, the user: "表格也写清楚最早能选哪个月"; Chai Meng Keat's 5,000 received
// 26 Mar 2026 — its first instalment April, so a change from a later month starts May at the earliest).
describe('Amend terms — where a change can start', () => {
  it('a deal never changed: its terms run from the first instalment; a later month starts the month after', () => {
    const w = amendWindow('2026-04', null)
    expect(w).toEqual({ firstDueYM: '2026-04', termsFromYM: '2026-04', changed: false, earliestYM: '2026-05' })
    expect(wholeChoiceName(w)).toBe('From the first instalment')
  })

  it('a deal changed before: from the month it was changed, across the year end', () => {
    const w = amendWindow('2025-05', '2025-12-01')
    expect(w).toEqual({ firstDueYM: '2025-05', termsFromYM: '2025-12', changed: true, earliestYM: '2026-01' })
    expect(wholeChoiceName(w)).toBe('From when these terms began')
  })

  it('the form starts on next month, never before the earliest', () => {
    expect(laterYM('2026-11', '2026-05')).toBe('2026-11')
    expect(laterYM('2026-03', '2026-05')).toBe('2026-05')
  })

  it('the database’s refusal of a month too early, in words a reader can act on', () => {
    expect(explainAmendRefusal('Effective month 2026-04 must be after the month the current terms took effect (2026-04)')).toBe(
      'Apr 2026 is when the terms in force began, so a change from a later month can start May 2026 at the earliest. To change from Apr 2026 itself, choose the option that recalculates the terms in force.',
    )
    expect(explainAmendRefusal('Rate must be between 0 and 100%')).toBeNull()
  })

  it('what is owed when a month starts: the amount less what was repaid in the months before it', () => {
    const f = { principal: 60000, paidByMonth: { '2025-04': 1000, '2026-09': 1000, '2026-10': 1000 } }
    expect(owedAtStart(f, '2026-10')).toBe(58000)
    expect(owedAtStart(f, '2025-04')).toBe(60000)
  })
})

describe('Amend terms — the whole terms filed by Finance', () => {
  it('leaves the start and the words alone when the form does not show them, and says why', () => {
    const fd = new FormData()
    fd.set('cost_rate_percent', '0.833')
    fd.set('lock_in_months', '')
    fd.set('compound_interest', 'on')
    fd.set('reason', 'agreed from the start ')
    const d = draftOfForm('in', fd, 'whole', SOURCE)
    expect(d.start).toBe(SOURCE.start)
    expect(d.text).toBe(SOURCE.text)
    expect(entries(amendFormData('in', 's1', SOURCE, d))).toEqual({ fund_source_id: 's1', cost_rate_percent: '0.833', reason: 'agreed from the start' })
  })
})
