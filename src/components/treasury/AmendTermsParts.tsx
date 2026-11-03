'use client'

import type { ReactNode } from 'react'
import dayjs from 'dayjs'
import { amendMonthWords, owedAtStart, wholeChoiceName, type AmendFacts, type AmendMode, type AmendWindow } from '@/lib/fund-amend'
import { REPAYMENT_CHOICES, money, openFromChoices, ymLong, type PreviewRow, type RepaymentChoice, type Words } from '@/lib/repayment-type'
import { formatMoneyBare } from '@/lib/utils'

export type { AmendFacts } from '@/lib/fund-amend'

// The pieces both Amend terms forms share (2026-10-27, the user's mockup terms-first-month-mockup.html — "照这个样稿做：
// 名字用 “From the first instalment” 和 “From a later month”，Finance 提交时不改 Repayment start"; the portal's text in
// English, "记得是要英文的"): the box that says whose deal it is and where its terms stand, the two ways to change them,
// and what the interest is charged on. Since the same day's second mockup (fund-forms-desktop-mockup.html — "分块 OK"),
// each part is a card of its own ("帮我把区域分开出来，别挤在一起"), the principal is a Repayment type — chosen first,
// its boxes opening under it — and the schedule stands beside the form.

const day = (d: string | null) => (d ? dayjs(d).format('D MMM YYYY') : '—')
const rm = (n: number) => `RM ${formatMoneyBare(n)}`

/** The form's text box, and a field's label (the portal's own). */
export const AMEND_FIELD =
  'w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border'
export const AMEND_LABEL = 'block text-sm font-sans font-medium text-graphite mb-1.5'

/** One part of the form: a card with its number, its title, a line under it — and, on its right, what acts on it. */
export function AmendSection({ no, title, note, tag, aside, children }: { no: number; title: string; note?: ReactNode; tag?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-surface border border-hairline rounded-md p-5 sm:p-6">
      <div className="flex items-start gap-3 mb-4">
        <span className="shrink-0 grid place-items-center w-6 h-6 rounded-full bg-accent-bg text-accent text-xs font-sans font-semibold" aria-hidden="true">
          {no}
        </span>
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-sans text-[15px] font-semibold text-ink">
            {title}
            {tag ? <span className="rounded-full bg-accent text-white text-[10.5px] font-semibold px-2 py-px">{tag}</span> : null}
          </h3>
          {note ? <p className="font-sans text-xs text-muted mt-0.5">{note}</p> : null}
        </div>
        {aside ? <div className="ml-auto shrink-0">{aside}</div> : null}
      </div>
      {children}
    </section>
  )
}

export function AmendIntro({ side, facts, direct }: { side: 'in' | 'out'; facts: AmendFacts; direct: boolean }) {
  const w = facts.window
  return (
    <div className="border border-accent-border rounded-md bg-accent-bg p-4">
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
    <fieldset className="mb-5">
      <legend className="sr-only">How it applies</legend>
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
      <span className={AMEND_LABEL}>Starts from</span>
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

/** Words with their bold parts, as lib/repayment-type writes them. */
export function WordsLine({ words, className }: { words: Words; className?: string }) {
  return (
    <span className={className}>
      {words.map((w, i) => (typeof w === 'string' ? <span key={i}>{w}</span> : <b key={i} className="font-semibold text-ink">{w.b}</b>))}
    </span>
  )
}

/**
 * Repayment type (2026-10-27, the user: "我希望是我选了repayment type 才跳出来给我填这些资料"): three cards, none chosen at
 * first; the chosen one opens its boxes under it — the amount a month, or the months — with what they work out to, and
 * (changing the terms) the month the fixed term may end. Its fields keep the names the actions read.
 */
export function RepaymentTypeField(props: {
  choice: RepaymentChoice | null
  onChoice: (c: RepaymentChoice) => void
  amount: string
  onAmount: (v: string) => void
  months: string
  onMonths: (v: string) => void
  /** Where the months box is sent: a later month's months left, a whole-terms periods / tenure. */
  monthsName: string
  monthsLabel: string
  monthsHint?: string
  /** What the chosen box works out to — or what it still waits for. */
  worked: { words: Words; late: string | null } | { wait: string } | null
  /** The month the terms start, `YYYY-MM` — the fixed term may end from a later one. */
  startYM: string
  /** Offer “No fixed term from” (changing the terms). */
  withOpenFrom: boolean
  openFrom: string
  onOpenFrom: (v: string) => void
  /** Why “None” cannot be chosen here, when it cannot. */
  noneOff?: string | null
}) {
  const { choice, worked } = props
  return (
    <div role="radiogroup" aria-label="Repayment type" data-testid="repayment-type">
      {REPAYMENT_CHOICES.map((c, i) => {
        const on = choice === c.value
        const off = c.value === 'none' && !!props.noneOff
        return (
          <div key={c.value} className={`border rounded-md bg-surface ${i > 0 ? 'mt-2' : ''} ${on ? 'border-accent' : 'border-hairline'} ${off ? 'opacity-60' : ''}`}>
            <label className={`flex items-start gap-2.5 px-3 py-2.5 ${off ? 'cursor-default' : 'cursor-pointer'} ${on ? 'bg-accent-bg/50 rounded-t-md' : ''}`}>
              <input
                type="radio"
                name="repayment_type"
                value={c.value}
                checked={on}
                disabled={off}
                onChange={() => props.onChoice(c.value)}
                className="mt-1 shrink-0 accent-[var(--accent)]"
              />
              <span className="text-sm font-sans text-ink">
                {c.label}
                <span className="block text-xs text-muted mt-0.5">{off ? props.noneOff : c.note}</span>
              </span>
            </label>
            {on ? (
              <div className="px-3.5 pb-3.5 pt-3 sm:pl-9 border-t border-dashed border-hairline">
                {c.value === 'none' ? (
                  <p className="font-sans text-sm text-graphite">No principal falls due each month — repay any amount, any time.</p>
                ) : (
                  <>
                    <label htmlFor={c.value === 'amount' ? 'principal_per_month' : props.monthsName} className={AMEND_LABEL}>
                      {c.value === 'amount' ? 'Principal a month (RM)' : props.monthsLabel}
                    </label>
                    {c.value === 'amount' ? (
                      <input
                        id="principal_per_month"
                        name="principal_per_month"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="e.g. 1,000.00"
                        value={props.amount}
                        onChange={(e) => props.onAmount(e.target.value)}
                        onBlur={() => {
                          const n = Number(props.amount.replace(/[,\s]/g, ''))
                          if (props.amount.trim() && n > 0) props.onAmount(money(Math.round(n * 100) / 100))
                        }}
                        className={`${AMEND_FIELD} max-w-[280px]`}
                      />
                    ) : (
                      <input
                        id={props.monthsName}
                        name={props.monthsName}
                        type="number"
                        step="1"
                        min="1"
                        max="120"
                        placeholder="e.g. 12"
                        value={props.months}
                        onChange={(e) => props.onMonths(e.target.value)}
                        className={`${AMEND_FIELD} max-w-[280px]`}
                      />
                    )}
                    {c.value === 'months' && props.monthsHint ? <p className="font-serif italic text-muted text-xs mt-1.5">{props.monthsHint}</p> : null}
                    {worked ? (
                      'wait' in worked ? (
                        <p className="font-sans text-xs italic text-muted mt-2" data-testid="repayment-worked">{worked.wait}</p>
                      ) : (
                        <p className="font-sans text-[13px] text-graphite mt-2" data-testid="repayment-worked">
                          <WordsLine words={worked.words} />
                          {worked.late ? <span className="block mt-1 text-accent">{worked.late}</span> : null}
                        </p>
                      )
                    ) : null}
                    {props.withOpenFrom ? (
                      <div className="mt-4 pt-3 border-t border-dashed border-hairline">
                        <label htmlFor="open_from" className={AMEND_LABEL}>
                          No fixed term from <span className="text-muted font-normal">— optional</span>
                        </label>
                        <select id="open_from" name="open_from" value={props.openFrom} onChange={(e) => props.onOpenFrom(e.target.value)} className={`${AMEND_FIELD} max-w-[280px]`}>
                          <option value="">—</option>
                          {openFromChoices(props.startYM).map((ym) => (
                            <option key={ym} value={ym}>
                              {ymLong(ym)}
                            </option>
                          ))}
                        </select>
                        <p className="font-serif italic text-muted text-xs mt-1.5">
                          From that month no principal falls due; interest stays on the same amount. Leave it blank and the principal falls due to the end.
                        </p>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/** The schedule beside the form: what the terms make, month by month — or why there is none to show yet. */
export function SchedulePreviewCard({ head, rows, foot, empty }: { head: string; rows: PreviewRow[]; foot: string; empty: string | null }) {
  const cell = (n: number | null) => (n == null ? '—' : formatMoneyBare(n))
  return (
    <div className="bg-surface border border-hairline rounded-md p-4" data-testid="schedule-preview">
      <h4 className="font-sans text-[11.5px] font-semibold tracking-[0.06em] uppercase text-muted mb-1.5">Schedule preview</h4>
      <p className="font-sans text-xs text-graphite mb-2">{head}</p>
      {empty ? (
        <p className="font-sans text-[13px] italic text-muted mt-3">{empty}</p>
      ) : (
        <>
          <table className="w-full text-[12.5px] font-sans">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-[0.04em] text-muted">
                <th className="text-left font-semibold py-1.5 pr-1 border-b border-hairline">Months</th>
                <th className="text-right font-semibold py-1.5 px-1 border-b border-hairline">Principal</th>
                <th className="text-right font-semibold py-1.5 px-1 border-b border-hairline">Interest</th>
                <th className="text-right font-semibold py-1.5 pl-1 border-b border-hairline">Due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.months} className={r.last ? 'bg-accent-bg' : ''}>
                  <td className="py-2 pr-1 border-b border-hairline align-top">{r.months}</td>
                  <td className="py-2 px-1 border-b border-hairline text-right font-mono tabular whitespace-nowrap">{cell(r.principal)}</td>
                  <td className="py-2 px-1 border-b border-hairline text-right font-mono tabular whitespace-nowrap">{cell(r.interest)}</td>
                  <td className="py-2 pl-1 border-b border-hairline text-right font-mono tabular whitespace-nowrap">{cell(r.due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="font-sans text-xs text-graphite mt-2">{foot}</p>
        </>
      )}
    </div>
  )
}

export type InterestBasis = 'owed' | 'original' | 'kept'

/**
 * What the interest from the month is charged on (the user, 2026-10-27: "这个按钮是不是说一直照着51000 去算利息？"). Three
 * amounts — what is owed when the change starts, the original amount, the amount in force (BI#7's 51,000) — and since the
 * second mockup, amounts that come to the same figure are one choice, each saying the interest a month it makes. The form
 * sends the database's two switches; the first amount is neither.
 */
export function InterestBasisChoice({
  value,
  onChange,
  facts,
  fromYM,
  compound,
  rate,
}: {
  value: InterestBasis
  onChange: (b: InterestBasis) => void
  facts: AmendFacts
  fromYM: string
  compound: boolean
  /** The monthly rate typed (0.00833), or NaN — each choice then says its interest a month. */
  rate: number
}) {
  const owedWords = `What is still owed on 1 ${amendMonthWords(fromYM)}`
  const amounts: Array<{ key: InterestBasis; amount: number }> = [
    { key: 'owed', amount: owedAtStart(facts, fromYM) },
    { key: 'original', amount: facts.principal },
    { key: 'kept', amount: facts.currentBase },
  ]
  // Amounts the same are one choice; it sends the first of its keys (owed, then the original, then as now).
  const groups: Array<{ keys: InterestBasis[]; amount: number }> = []
  for (const a of amounts) {
    const g = groups.find((x) => Math.abs(x.amount - a.amount) < 0.005)
    if (g) g.keys.push(a.key)
    else groups.push({ keys: [a.key], amount: a.amount })
  }
  const labelOf = (keys: InterestBasis[]): string => {
    if (keys.length === 3) return 'What is owed — the same as the original amount and the amount now'
    const has = (k: InterestBasis) => keys.includes(k)
    if (has('owed') && has('original')) return `${owedWords} — the original amount`
    if (has('owed') && has('kept')) return `${owedWords}, as now`
    if (has('original') && has('kept')) return 'The original amount, as now'
    return has('owed') ? owedWords : has('original') ? 'The original amount' : 'The same amount as now'
  }
  const chosen = groups.find((g) => g.keys.includes(value)) ?? groups[0]
  const sends = chosen.keys[0]
  return (
    <fieldset disabled={compound} data-testid="interest-basis">
      <legend className="sr-only">Interest is charged on</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {groups.map((g) => {
          const on = g === chosen
          return (
            <label key={g.keys.join('+')} className={`flex items-start gap-2 border rounded-md p-3 ${on ? 'border-accent bg-accent-bg/40' : 'border-hairline'} ${compound ? 'opacity-50' : 'cursor-pointer'}`}>
              <input type="radio" name="interest_basis" value={g.keys[0]} checked={on} onChange={() => onChange(g.keys[0])} className="mt-1 shrink-0 accent-[var(--accent)]" />
              <span className="text-sm font-sans text-graphite">
                {labelOf(g.keys)}
                <span className="block font-mono text-xs text-muted">
                  {rm(g.amount)}
                  {Number.isFinite(rate) && rate >= 0 ? ` → ${rm(Math.round(g.amount * rate * 100) / 100)} a month` : ''}
                </span>
              </span>
            </label>
          )
        })}
      </div>
      {!compound && sends === 'original' ? <input type="hidden" name="interest_on_original" value="on" /> : null}
      {!compound && sends === 'kept' ? <input type="hidden" name="interest_keeps_base" value="on" /> : null}
      <p className="font-serif italic text-muted text-xs mt-2">
        {compound
          ? 'Not used with compound interest — compounding charges interest on everything owed.'
          : 'Interest then stays on that amount every month — repaying principal later does not lower it, after the term ends too.'}
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
