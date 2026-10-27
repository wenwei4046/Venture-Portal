'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import { amendFundSource, amendFundSourceFrom } from '../../../actions'
import { amendFormData, amendMonthWords, draftOfForm, laterYM, wholeChoiceName, type AmendMode, type AmendTerms } from '@/lib/fund-amend'
import {
  AmendCheck,
  AmendIntro,
  AmendModeChoice,
  EarliestHint,
  InterestBasisChoice,
  WholeStartsFrom,
  amendButtonLabel,
  type AmendFacts,
  type InterestBasis,
} from '@/components/treasury/AmendTermsParts'

interface Props {
  id: string
  ratePct: string
  lockInMonths: string
  repaymentDate: string
  compound: boolean
  notes: string
  /** Default effective month for a later-month change (next month, 'YYYY-MM'). */
  nextMonth: string
  facts: AmendFacts
  /** Treasury · Approve: the change applies now. Without it (Treasury · Edit) either change is filed for the Principal. */
  direct?: boolean
}

// Two ways to change an active fund source (user 2026-09-21; named and opened to Finance 2026-10-27, the mockup
// terms-first-month-mockup.html — "照这个样稿做"):
//   From the first instalment   the terms in force recalculated from when they began (the first instalment unless they
//                               were changed before) — the Principal saves it at once, Finance files it for approval
//   From a later month          months before the chosen one keep their old terms; from that month the new rate /
//                               months left apply, on the amount the interest is charged on (lib/treasury-terms)
export default function AmendFundSourceForm({ id, ratePct, lockInMonths, repaymentDate, compound, notes, nextMonth, facts, direct = true }: Props) {
  const w = facts.window
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<AmendMode>('from')
  const fromMode = mode === 'from'
  const [effectiveFrom, setEffectiveFrom] = useState(laterYM(nextMonth, w.earliestYM))
  // 改成无固定期限 from the month (user 2026-09-22): no monthly principal from then, repayments in any size.
  const [noFixedTerm, setNoFixedTerm] = useState(false)
  const [compounding, setCompounding] = useState(compound)
  // What the interest from the month is on (2026-10-23 / 24): the principal owed then, the original, or the amount in force.
  const [interestBasis, setInterestBasis] = useState<InterestBasis>('owed')

  const field =
    'w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border'
  const label = 'block text-sm font-sans font-medium text-graphite mb-1.5'
  // What the form opened with: only what is changed from it is sent (lib/fund-amend, 2026-10-16).
  const was: AmendTerms = { ratePct, months: lockInMonths, start: repaymentDate, compound, text: notes, termsFrom: w.changed ? w.termsFromYM : null, nextMonth }

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
          const sent = amendFormData('in', id, was, draftOfForm('in', fd, mode, was))
          const r = fromMode ? await amendFundSourceFrom(sent) : await amendFundSource(sent)
          if (r?.error) setError(r.error)
        })
      }
      className="bg-surface border border-hairline rounded-md p-8 max-w-2xl"
    >
      <input type="hidden" name="fund_source_id" value={id} />

      <AmendIntro side="in" facts={facts} direct={direct} />
      <AmendModeChoice mode={mode} onMode={setMode} window={w} />

      {fromMode ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
            <div>
              <label htmlFor="effective_from" className={label}>Effective from</label>
              <input
                id="effective_from"
                name="effective_from"
                type="month"
                value={effectiveFrom}
                min={w.earliestYM}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                required
                className={field}
              />
              <EarliestHint window={w} />
            </div>
            <div>
              <label htmlFor="cost_rate_percent" className={label}>Rate (% a month)</label>
              <input id="cost_rate_percent" name="cost_rate_percent" type="number" step="0.001" min="0" defaultValue={ratePct} className={field} />
            </div>
            <div>
              <label htmlFor="remaining_months" className={label}>
                Months left <span className="text-muted font-normal">— blank = keep the end month</span>
              </label>
              <input id="remaining_months" name="remaining_months" type="number" step="1" min="1" max="120" className={field} disabled={noFixedTerm} />
              <p className="font-serif italic text-muted text-xs mt-1.5">
                {noFixedTerm ? 'Not used with no fixed term.' : 'Counted from the effective month. Principal a month = principal owed at the start of that month ÷ months left.'}
              </p>
            </div>
          </div>
          <div className="mb-6 pb-4 border-b border-dashed border-hairline space-y-3">
            <AmendCheck name="no_fixed_term" label="No fixed term from then" note="No principal falls due each month — repay any amount, any time." checked={noFixedTerm} onChange={setNoFixedTerm} />
            <AmendCheck name="compound_interest" label="Compound interest" note="Unpaid interest is added to what is owed and earns interest too." checked={compounding} onChange={setCompounding} />
          </div>
          <InterestBasisChoice value={interestBasis} onChange={setInterestBasis} facts={facts} fromYM={effectiveFrom} compound={compounding} />
          <div className="mb-6">
            <label htmlFor="reason" className={label}>Reason</label>
            <input id="reason" name="reason" type="text" className={`${field} font-sans`} placeholder="e.g. rate renegotiated / term extended" />
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
            <WholeStartsFrom facts={facts} />
            <div>
              <label htmlFor="cost_rate_percent" className={label}>Rate (% a month)</label>
              <input id="cost_rate_percent" name="cost_rate_percent" type="number" step="0.001" min="0" defaultValue={ratePct} className={field} />
            </div>
            <div>
              <label htmlFor="lock_in_months" className={label}>
                Periods (months) <span className="text-muted font-normal">— blank = no fixed term</span>
              </label>
              <input id="lock_in_months" name="lock_in_months" type="number" step="1" min="1" max="120" defaultValue={lockInMonths} className={field} />
            </div>
            {direct ? (
              <div>
                <label htmlFor="repayment_date" className={label}>Repayment start</label>
                <input id="repayment_date" name="repayment_date" type="date" defaultValue={repaymentDate} className={field} />
                <p className="font-serif italic text-muted text-xs mt-1.5">Compounding rolls from this month.</p>
              </div>
            ) : (
              <div>
                <span className={label}>Repayment start</span>
                <div className="px-3 py-2 border border-dashed border-hairline rounded-md bg-paper text-sm font-sans text-graphite">
                  As set under Repayment settings (first instalment {facts.firstDue ? dayjs(facts.firstDue).format('D MMM YYYY') : '—'})
                </div>
                <p className="font-serif italic text-muted text-xs mt-1.5">Change it under Repayment settings on the deal&apos;s page — it needs no approval.</p>
              </div>
            )}
          </div>
          <div className="mb-6 pb-4 border-b border-dashed border-hairline space-y-3">
            <AmendCheck name="compound_interest" label="Compound interest" note="Unpaid interest is added to what is owed and earns interest too." checked={compounding} onChange={setCompounding} />
          </div>
          <div className="mb-6">
            {direct ? (
              <>
                <label htmlFor="notes" className={label}>Notes</label>
                <textarea id="notes" name="notes" rows={2} defaultValue={notes} className={`${field} font-sans`} />
              </>
            ) : (
              <>
                <label htmlFor="reason" className={label}>Reason</label>
                <input id="reason" name="reason" type="text" className={`${field} font-sans`} placeholder="e.g. the rate was agreed from the start but not recorded" />
              </>
            )}
          </div>
        </>
      )}

      {error ? <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-6 text-sm font-sans">{error}</div> : null}

      <div className="flex items-center gap-4 pt-4 border-t border-hairline">
        <button
          type="submit"
          disabled={isPending}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50"
        >
          {amendButtonLabel(direct, mode, isPending)}
        </button>
        <Link href={`/fund-in/${id}`} className="text-sm text-graphite hover:text-ink font-sans transition-colors">
          Cancel
        </Link>
      </div>
    </form>
  )
}
