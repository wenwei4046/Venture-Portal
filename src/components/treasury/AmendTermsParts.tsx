'use client'

import dayjs from 'dayjs'
import { amendMonthWords, owedAtStart, wholeChoiceName, type AmendFacts, type AmendMode, type AmendWindow } from '@/lib/fund-amend'
import { formatMoneyBare } from '@/lib/utils'

export type { AmendFacts } from '@/lib/fund-amend'

// The pieces both Amend terms forms share (2026-10-27, the user's mockup terms-first-month-mockup.html — "照这个样稿做：
// 名字用 “From the first instalment” 和 “From a later month”，Finance 提交时不改 Repayment start"; the portal's text in
// English, "记得是要英文的"): the box that says whose deal it is and where its terms stand, the two ways to change them,
// and what the interest is charged on — three amounts, one of them.

const day = (d: string | null) => (d ? dayjs(d).format('D MMM YYYY') : '—')
const rm = (n: number) => `RM ${formatMoneyBare(n)}`

export function AmendIntro({ side, facts, direct }: { side: 'in' | 'out'; facts: AmendFacts; direct: boolean }) {
  const w = facts.window
  return (
    <div className="mb-6 border border-accent-border rounded-md bg-accent-bg p-4">
      <div className="font-serif italic text-accent text-sm">Amend terms · {side === 'in' ? 'Fund in' : 'Fund out'}</div>
      <p className="font-serif text-sm text-graphite mt-1">
        {side === 'in' ? 'Source' : 'Borrower'}: <span className="text-ink">{facts.party}</span>.{' '}
        {direct
          ? 'You approve terms changes, so this applies at once.'
          : 'Your change goes to the Principal in Approvals and applies once approved — until then the terms stay as they are.'}
      </p>
      <p className="font-sans text-xs text-graphite mt-2 pt-2 border-t border-dashed border-accent-border" data-testid="amend-facts">
        {side === 'in' ? 'Received' : 'Disbursed'} <b className="text-ink">{day(facts.moneyDate)}</b> · first instalment{' '}
        <b className="text-ink">{day(facts.firstDue)}</b> ·{' '}
        {w.changed ? (
          <>
            the terms in force began <b className="text-ink">{amendMonthWords(w.termsFromYM)}</b>, when they were last changed.
          </>
        ) : (
          <>
            the terms in force run from the first instalment (<b className="text-ink">{amendMonthWords(w.termsFromYM)}</b>) and have never been changed.
          </>
        )}
      </p>
    </div>
  )
}

/** The two ways — the terms in force recalculated from when they began, or new terms from a later month. */
export function AmendModeChoice({ mode, onMode, window: w }: { mode: AmendMode; onMode: (m: AmendMode) => void; window: AmendWindow }) {
  const card = (on: boolean) => `relative border rounded-md p-3 cursor-pointer ${on ? 'border-accent bg-accent-bg/40' : 'border-hairline'}`
  return (
    <fieldset className="mb-6">
      <legend className="block text-sm font-sans font-medium text-graphite mb-2">How it applies</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className={card(mode === 'whole')}>
          <span className="flex items-center gap-2 text-sm font-sans text-ink">
            <input type="radio" name="mode" value="whole" checked={mode === 'whole'} onChange={() => onMode('whole')} className="shrink-0 accent-[var(--accent)]" />
            {wholeChoiceName(w)}
          </span>
          <span className="block font-serif italic text-muted text-xs mt-1 ml-5">
            {w.changed
              ? `The terms in force are recalculated from ${amendMonthWords(w.termsFromYM)}, when they began; the months before keep theirs. Payments recorded stay as they are.`
              : `The whole deal is recalculated on the new terms from the first instalment (${amendMonthWords(w.termsFromYM)}), months already passed included. Payments recorded stay as they are.`}
          </span>
        </label>
        <label className={card(mode === 'from')}>
          <span className="flex items-center gap-2 text-sm font-sans text-ink">
            <input type="radio" name="mode" value="from" checked={mode === 'from'} onChange={() => onMode('from')} className="shrink-0 accent-[var(--accent)]" />
            From a later month
          </span>
          <span className="block font-serif italic text-muted text-xs mt-1 ml-5">
            Months before keep the current terms; the new terms apply from the month you choose. Earliest for this deal: {amendMonthWords(w.earliestYM)}.
          </span>
        </label>
      </div>
    </fieldset>
  )
}

/** Where the recalculated terms start — no month to choose. */
export function WholeStartsFrom({ facts }: { facts: AmendFacts }) {
  const w = facts.window
  return (
    <div>
      <span className="block text-sm font-sans font-medium text-graphite mb-1.5">Starts from</span>
      <div className="px-3 py-2 border border-dashed border-hairline rounded-md bg-paper text-sm font-sans text-graphite">
        {w.changed ? 'When these terms began' : 'First instalment'} · <span className="font-mono text-ink">{amendMonthWords(w.termsFromYM)}</span>
        {!w.changed && facts.firstDue ? ` (${day(facts.firstDue)})` : ''}
      </div>
      <p className="font-serif italic text-muted text-xs mt-1.5">The terms in force take the new terms from there, so there is no month to choose.</p>
    </div>
  )
}

/** The earliest month a later-month change may take, said under its field. */
export function EarliestHint({ window: w }: { window: AmendWindow }) {
  return (
    <p className="font-sans text-xs text-accent bg-accent-bg rounded-md px-2.5 py-1.5 mt-1.5" data-testid="amend-earliest">
      Earliest <b className="text-ink">{amendMonthWords(w.earliestYM)}</b>. {amendMonthWords(w.termsFromYM)} is{' '}
      {w.changed ? 'when these terms began' : 'the first instalment'} — to change from there, choose “{wholeChoiceName(w)}” above.
    </p>
  )
}

/** A switch with its line of words under it. */
export function AmendCheck({
  name,
  label,
  note,
  checked,
  onChange,
}: {
  name: string
  label: string
  note: string
  checked: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input id={name} name={name} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 mt-0.5 shrink-0 accent-[var(--accent)]" />
      <span className="text-sm font-sans text-graphite">
        {label}
        <span className="block font-serif italic text-muted text-xs mt-0.5">{note}</span>
      </span>
    </label>
  )
}

export type InterestBasis = 'owed' | 'original' | 'kept'

/**
 * What the interest from the month is charged on — one of three amounts, each said (the user, 2026-10-27: "这个按钮是不是
 * 说一直照着51000 去算利息？" — the third keeps the amount in force, BI#7's 51,000). The form sends the database's two
 * switches; the first is neither.
 */
export function InterestBasisChoice({
  value,
  onChange,
  facts,
  fromYM,
  compound,
}: {
  value: InterestBasis
  onChange: (b: InterestBasis) => void
  facts: AmendFacts
  fromYM: string
  compound: boolean
}) {
  const owed = owedAtStart(facts, fromYM)
  const amounts: Array<{ key: InterestBasis; label: string; note: string; amount: number }> = [
    { key: 'owed', label: 'What is still owed when it starts', note: `the principal still owed on 1 ${amendMonthWords(fromYM)}`, amount: owed },
    { key: 'original', label: 'The original amount', note: 'the full amount borrowed', amount: facts.principal },
    { key: 'kept', label: 'The same amount as now', note: 'keeps the amount interest is worked out on today', amount: facts.currentBase },
  ]
  const same = amounts.every((a) => Math.abs(a.amount - amounts[0].amount) < 0.005)
  return (
    <fieldset className="mb-6" disabled={compound} data-testid="interest-basis">
      <legend className="block text-sm font-sans font-medium text-graphite mb-2">Interest is charged on</legend>
      <div className="space-y-2.5">
        {amounts.map((a) => (
          <label key={a.key} className={`flex items-start gap-2 ${compound ? 'opacity-50' : 'cursor-pointer'}`}>
            <input type="radio" name="interest_basis" value={a.key} checked={value === a.key} onChange={() => onChange(a.key)} className="mt-1 shrink-0 accent-[var(--accent)]" />
            <span className="text-sm font-sans text-graphite">
              {a.label}
              <span className="block font-mono text-xs text-muted">
                {rm(a.amount)} — {a.note}
              </span>
            </span>
          </label>
        ))}
      </div>
      {value === 'original' ? <input type="hidden" name="interest_on_original" value="on" /> : null}
      {value === 'kept' ? <input type="hidden" name="interest_keeps_base" value="on" /> : null}
      <p className="font-serif italic text-muted text-xs mt-2">
        {compound
          ? 'Not used with compound interest — compounding charges interest on everything owed.'
          : `Interest then stays on that amount every month — repaying principal later does not lower it.${same ? ` On this deal all three are ${rm(amounts[0].amount)}.` : ''}`}
      </p>
    </fieldset>
  )
}

/** The form's button: filed for the Principal, or applied at once. */
export function amendButtonLabel(direct: boolean, mode: AmendMode, pending: boolean): string {
  if (pending) return direct ? 'Saving…' : 'Submitting…'
  if (!direct) return 'Submit to the Principal'
  return mode === 'from' ? 'Apply from that month' : 'Save'
}
