'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import { amendFormData, amendMonthWords, draftOfForm, laterYM, owedAtStart, wholeChoiceName, type AmendMode, type AmendTerms, type DealSide } from '@/lib/fund-amend'
import { money, previewRows, readRepayment, repaymentWords, ymShort, type RepaymentChoice } from '@/lib/repayment-type'
import {
  AMEND_FIELD,
  AMEND_LABEL,
  AmendCheck,
  AmendIntro,
  AmendModeChoice,
  AmendSection,
  EarliestHint,
  InterestBasisChoice,
  RepaymentTypeField,
  SchedulePreviewCard,
  WholeStartsFrom,
  amendButtonLabel,
  type AmendFacts,
  type InterestBasis,
} from './AmendTermsParts'

type AmendResult = { error: string } | undefined

// Amend terms, both deals (2026-10-27 — the mockup fund-forms-desktop-mockup.html: "照这个样稿做：分块 OK … 连同 Repayment
// type 一起"; the parts in cards, "帮我把区域分开出来，别挤在一起"):
//   1 When the new terms start   From the first instalment (the terms in force recalculated from when they began) or
//                                From a later month (the months before keep their terms)
//   2 Rate                       the rate a month and compounding
//   3 Repayment type             a fixed amount a month · over a number of months · none — none chosen keeps the
//                                principal as it is; with an amount or months, the fixed term may end from a later month
//                                (BI#7's two changes as one: 1,000 a month from January, no fixed term from October)
//   4 Interest is charged on     a later month's: the amounts, those that come to the same figure as one choice
//   5 Reason                     (the Principal's whole terms: the deal's notes / its repayment terms' words)
// and the schedule the terms make beside it. Only what is changed is sent (lib/fund-amend).

const SIDES = {
  in: {
    kind: 'Fund in',
    idName: 'fund_source_id',
    rateName: 'cost_rate_percent',
    wholeMonthsName: 'lock_in_months',
    wholeMonthsLabel: 'Number of months',
    startName: 'repayment_date',
    startLabel: 'Repayment start',
    textName: 'notes',
    textLabel: 'Notes',
  },
  out: {
    kind: 'Fund out',
    idName: 'loan_id',
    rateName: 'effective_rate_percent',
    wholeMonthsName: 'tenure_months',
    wholeMonthsLabel: 'Tenure (months)',
    startName: 'disbursement_date',
    startLabel: 'Disbursement date',
    textName: 'repayment_terms',
    textLabel: 'Repayment terms (words)',
  },
} as const

export interface AmendTermsFormProps {
  side: DealSide
  id: string
  ratePct: string
  /** The periods / tenure the deal holds ('' = no fixed term). */
  months: string
  /** The deal's fixed principal a month ('' = equal parts). */
  principalPerMonth: string
  /** A fund source's repayment start, a loan's disbursement — `YYYY-MM-DD`. */
  start: string
  /** A fund source's notes, a loan's repayment terms (words). */
  text: string
  compound: boolean
  /** Default effective month for a later-month change (next month, 'YYYY-MM'). */
  nextMonth: string
  facts: AmendFacts
  /** Treasury · Approve: the change applies now. Without it (Treasury · Edit) either change is filed for the Principal. */
  direct: boolean
  whole: (fd: FormData) => Promise<AmendResult>
  from: (fd: FormData) => Promise<AmendResult>
  cancelHref: string
}

export default function AmendTermsForm(p: AmendTermsFormProps) {
  const { side, facts, direct } = p
  const cfg = SIDES[side]
  const w = facts.window
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<AmendMode>('from')
  const fromMode = mode === 'from'
  const [effectiveFrom, setEffectiveFrom] = useState(laterYM(p.nextMonth, w.earliestYM))
  const [rate, setRate] = useState(p.ratePct)
  const [compounding, setCompounding] = useState(p.compound)
  // What the interest from the month is on (2026-10-23 / 24): the principal owed then, the original, or the amount in force.
  const [basis, setBasis] = useState<InterestBasis>('owed')
  // The Repayment type: none chosen keeps the principal as it is.
  const [choice, setChoice] = useState<RepaymentChoice | null>(null)
  const [amount, setAmount] = useState('')
  const [monthsBox, setMonthsBox] = useState('')
  const [openFrom, setOpenFrom] = useState('')

  // What the form opened with: only what is changed from it is sent (lib/fund-amend, 2026-10-16).
  const was: AmendTerms = { ratePct: p.ratePct, months: p.months, start: p.start, compound: p.compound, text: p.text, termsFrom: w.changed ? w.termsFromYM : null, nextMonth: p.nextMonth }

  const switchMode = (m: AmendMode) => {
    // The months box counts differently each way (months left from the month, or the terms' own months): it starts again.
    setMode(m)
    setChoice(null)
    setAmount('')
    setMonthsBox('')
    setOpenFrom('')
  }
  const choose = (c: RepaymentChoice) => {
    setChoice(c)
    // Recalculating the terms in force, the box opens on what the deal has now.
    if (!fromMode && c === 'amount' && !amount && p.principalPerMonth) setAmount(money(Number(p.principalPerMonth)))
    if (!fromMode && c === 'months' && !monthsBox && p.months && !p.principalPerMonth) setMonthsBox(p.months)
  }
  const clear = () => {
    setChoice(null)
    setOpenFrom('')
  }

  // What the terms make, beside the form.
  const startYM = fromMode ? effectiveFrom : w.termsFromYM
  const owed = fromMode ? owedAtStart(facts, effectiveFrom) : w.changed ? owedAtStart(facts, w.termsFromYM) : facts.principal
  const rateN = rate.trim() === '' ? NaN : Number(rate) / 100
  const base = fromMode ? (basis === 'original' ? facts.principal : basis === 'kept' ? facts.currentBase : owed) : owed
  const interest = compounding || !Number.isFinite(rateN) ? null : Math.round(base * rateN * 100) / 100
  const read = choice === 'amount' ? readRepayment('amount', amount, owed) : choice === 'months' ? readRepayment('months', monthsBox, owed) : null
  const worked = read && choice !== 'none' && choice ? (read.ok ? repaymentWords(choice, read.plan, owed, startYM, openFrom || null) : { wait: read.wait }) : null
  const preview =
    choice && (choice === 'none' || read?.ok)
      ? previewRows({ choice, plan: read?.ok ? read.plan : null, startYM, interest, interestBase: compounding ? null : base, openFromYM: openFrom || null })
      : null
  const empty = !choice ? 'No repayment type chosen — the principal stays as it is now.' : read && !read.ok ? read.wait : null
  const head = `${cfg.kind} · RM ${money(owed)} owed from ${ymShort(startYM)} · ${Number.isFinite(rateN) ? `${(rateN * 100).toFixed(3)}% a month` : 'no rate yet'} · ${
    compounding ? 'compounding' : `interest on RM ${money(base)}`
  }`
  // A loan without a fixed term says so in its terms' words, from a later month (amend_loan_from).
  const noneOff = side === 'out' && !fromMode ? 'A loan’s fixed term ends from a later month — choose “From a later month”.' : null

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          setError(null)
          if (fromMode && effectiveFrom < w.earliestYM) {
            setError(
              `A change from a later month starts ${amendMonthWords(w.earliestYM)} at the earliest. To change from ${amendMonthWords(w.termsFromYM)}, choose “${wholeChoiceName(w)}”.`,
            )
            return
          }
          if (read && !read.ok) {
            setError(read.wait)
            return
          }
          const sent = amendFormData(side, p.id, was, draftOfForm(side, fd, mode, was))
          const r = fromMode ? await p.from(sent) : await p.whole(sent)
          if (r?.error) setError(r.error)
        })
      }
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] items-start"
    >
      <input type="hidden" name={cfg.idName} value={p.id} />

      <div className="space-y-4 min-w-0">
        <AmendIntro side={side} facts={facts} direct={direct} />

        <AmendSection no={1} title="When the new terms start" note="Recalculate from the first instalment, or change from a later month.">
          <AmendModeChoice mode={mode} onMode={switchMode} window={w} />
          {fromMode ? (
            <div>
              <div className="max-w-[300px]">
                <label htmlFor="effective_from" className={AMEND_LABEL}>
                  Effective from
                </label>
                <input
                  id="effective_from"
                  name="effective_from"
                  type="month"
                  value={effectiveFrom}
                  min={w.earliestYM}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  required
                  className={AMEND_FIELD}
                />
              </div>
              <EarliestHint window={w} />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <WholeStartsFrom facts={facts} />
              {direct ? (
                <div>
                  <label htmlFor={cfg.startName} className={AMEND_LABEL}>
                    {cfg.startLabel}
                  </label>
                  <input id={cfg.startName} name={cfg.startName} type="date" defaultValue={p.start} className={AMEND_FIELD} />
                  <p className="font-serif italic text-muted text-xs mt-1.5">Compounding rolls from this month.</p>
                </div>
              ) : (
                <div>
                  <span className={AMEND_LABEL}>Repayment start</span>
                  <div className="px-3 py-2 border border-dashed border-hairline rounded-md bg-paper text-sm font-sans text-graphite">
                    As set under Repayment settings (first instalment {facts.firstDue ? dayjs(facts.firstDue).format('D MMM YYYY') : '—'})
                  </div>
                  <p className="font-serif italic text-muted text-xs mt-1.5">
                    Change it under Repayment settings on the {side === 'in' ? 'deal' : 'loan'}&apos;s page — it needs no approval.
                  </p>
                </div>
              )}
            </div>
          )}
        </AmendSection>

        <AmendSection no={2} title="Rate" note={fromMode ? 'The rate a month from the effective month.' : 'The rate a month of the terms recalculated.'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
            <div>
              <label htmlFor={cfg.rateName} className={AMEND_LABEL}>
                Rate (% a month)
              </label>
              <input id={cfg.rateName} name={cfg.rateName} type="number" step="0.001" min="0" value={rate} onChange={(e) => setRate(e.target.value)} className={AMEND_FIELD} />
            </div>
            <div className="sm:pt-7">
              <AmendCheck name="compound_interest" label="Compound interest" note="Unpaid interest is added to what is owed and earns interest too." checked={compounding} onChange={setCompounding} />
            </div>
          </div>
        </AmendSection>

        <AmendSection
          no={3}
          title="Repayment type"
          tag="New"
          note="How the principal is repaid. Choose one and what to fill in opens under it."
          aside={
            choice ? (
              <button type="button" onClick={clear} className="font-sans text-[13px] text-accent underline hover:text-ink">
                Clear
              </button>
            ) : null
          }
        >
          <RepaymentTypeField
            choice={choice}
            onChoice={choose}
            amount={amount}
            onAmount={setAmount}
            months={monthsBox}
            onMonths={setMonthsBox}
            monthsName={fromMode ? 'remaining_months' : cfg.wholeMonthsName}
            monthsLabel={fromMode ? 'Number of months' : cfg.wholeMonthsLabel}
            monthsHint={fromMode ? `Counted from ${amendMonthWords(effectiveFrom)}.` : `Counted from ${amendMonthWords(w.termsFromYM)}.`}
            worked={worked}
            startYM={startYM}
            withOpenFrom
            openFrom={openFrom}
            onOpenFrom={setOpenFrom}
            noneOff={noneOff}
          />
          {choice ? null : <p className="font-serif italic text-muted text-xs mt-2">Leave it unchosen to keep the principal as it is now.</p>}
        </AmendSection>

        {fromMode ? (
          <AmendSection no={4} title="Interest is charged on" note="The amount the flat interest is worked out on from the effective month.">
            <InterestBasisChoice value={basis} onChange={setBasis} facts={facts} fromYM={effectiveFrom} compound={compounding} rate={rateN} />
          </AmendSection>
        ) : null}

        {fromMode || !direct ? (
          <AmendSection no={fromMode ? 5 : 4} title="Reason" note={direct ? 'Kept with the change on the deal’s terms history.' : 'The Principal reads it with the request.'}>
            <label htmlFor="reason" className={AMEND_LABEL}>
              Reason
            </label>
            <input
              id="reason"
              name="reason"
              type="text"
              className={`${AMEND_FIELD} font-sans`}
              placeholder={fromMode ? 'e.g. 0.833% from January, 1,000 a month until September' : 'e.g. the rate was agreed from the start but not recorded'}
            />
          </AmendSection>
        ) : (
          <AmendSection no={4} title={cfg.textLabel} note={side === 'in' ? 'The deal’s own notes.' : 'The loan’s repayment terms, in words.'}>
            <label htmlFor={cfg.textName} className={AMEND_LABEL}>
              {cfg.textLabel}
            </label>
            <textarea id={cfg.textName} name={cfg.textName} rows={2} defaultValue={p.text} className={`${AMEND_FIELD} font-sans`} />
            {side === 'out' ? (
              <p className="font-serif italic text-muted text-xs mt-1.5">
                Words with “未定” or “无还款方式” read as no fixed term (nothing falls due this month). Keep the [LO#…] tag to trace it; “· 资金来源: XXX” shows the SC badge in the loan list.
              </p>
            ) : null}
          </AmendSection>
        )}

        {error ? <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 text-sm font-sans">{error}</div> : null}

        <div className="flex items-center gap-4 bg-surface border border-hairline rounded-md px-5 py-4">
          <button
            type="submit"
            disabled={isPending}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50"
          >
            {amendButtonLabel(direct, mode, isPending)}
          </button>
          <Link href={p.cancelHref} className="text-sm text-graphite hover:text-ink font-sans transition-colors">
            Cancel
          </Link>
        </div>
      </div>

      <aside className="lg:sticky lg:top-6">
        <SchedulePreviewCard head={head} rows={preview?.rows ?? []} foot={preview?.foot ?? ''} empty={empty} />
      </aside>
    </form>
  )
}
