'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import { amendLoan, amendLoanFrom } from '../../actions'
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
  loanId: string
  ratePct: string
  tenureMonths: string
  disbursementDate: string
  repaymentTerms: string
  compound: boolean
  /** Default effective month for a later-month change (next month, 'YYYY-MM'). */
  nextMonth: string
  facts: AmendFacts
  /** Treasury · Approve: the change applies now. Without it (Treasury · Edit) either change is filed for the Principal. */
  direct?: boolean
}

// Two ways to change an active loan (user 2026-09-21; named and opened to Finance 2026-10-27, the mockup
// terms-first-month-mockup.html — "照这个样稿做"):
//   From the first instalment   the terms in force recalculated from when they began — the Principal saves it at once
//                               (the disbursement and the terms' words with it), Finance files the rate, the tenure and
//                               compounding for approval
//   From a later month          months before the chosen one keep their old terms; from that month the new rate /
//                               months left apply, on the amount the interest is charged on (lib/treasury-terms)
export default function LoanAmendForm({ loanId, ratePct, tenureMonths, disbursementDate, repaymentTerms, compound, nextMonth, facts, direct = true }: Props) {
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
  const was: AmendTerms = { ratePct, months: tenureMonths, start: disbursementDate, compound, text: repaymentTerms, termsFrom: w.changed ? w.termsFromYM : null, nextMonth }

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
          const sent = amendFormData('out', loanId, was, draftOfForm('out', fd, mode, was))
          const r = fromMode ? await amendLoanFrom(sent) : await amendLoan(sent)
          if (r?.error) setError(r.error)
        })
      }
      className="bg-surface border border-hairline rounded-md p-8 max-w-2xl"
    >
      <input type="hidden" name="loan_id" value={loanId} />

      <AmendIntro side="out" facts={facts} direct={direct} />
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
              <label htmlFor="effective_rate_percent" className={label}>Rate (% a month)</label>
              <input id="effective_rate_percent" name="effective_rate_percent" type="number" step="0.001" min="0" defaultValue={ratePct} className={field} />
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
              <label htmlFor="effective_rate_percent" className={label}>Rate (% a month)</label>
              <input id="effective_rate_percent" name="effective_rate_percent" type="number" step="0.001" min="0" defaultValue={ratePct} className={field} />
            </div>
            <div>
              <label htmlFor="tenure_months" className={label}>Tenure (months)</label>
              <input id="tenure_months" name="tenure_months" type="number" step="1" min="1" max="120" defaultValue={tenureMonths} className={field} />
            </div>
            {direct ? (
              <div>
                <label htmlFor="disbursement_date" className={label}>Disbursement date</label>
                <input id="disbursement_date" name="disbursement_date" type="date" defaultValue={disbursementDate} className={field} />
                <p className="font-serif italic text-muted text-xs mt-1.5">Compounding rolls from this month.</p>
              </div>
            ) : (
              <div>
                <span className={label}>Repayment start</span>
                <div className="px-3 py-2 border border-dashed border-hairline rounded-md bg-paper text-sm font-sans text-graphite">
                  As set under Repayment settings (first instalment {facts.firstDue ? dayjs(facts.firstDue).format('D MMM YYYY') : '—'})
                </div>
                <p className="font-serif italic text-muted text-xs mt-1.5">Change it under Repayment settings on the loan&apos;s page — it needs no approval.</p>
              </div>
            )}
          </div>
          <div className="mb-6 pb-4 border-b border-dashed border-hairline space-y-3">
            <AmendCheck name="compound_interest" label="Compound interest" note="Unpaid interest is added to what is owed and earns interest too." checked={compounding} onChange={setCompounding} />
          </div>
          <div className="mb-6">
            {direct ? (
              <>
                <label htmlFor="repayment_terms" className={label}>Repayment terms (words)</label>
                <textarea id="repayment_terms" name="repayment_terms" rows={2} defaultValue={repaymentTerms} className={`${field} font-sans`} />
                <p className="font-serif italic text-muted text-xs mt-1.5">
                  Words with “未定” or “无还款方式” read as no fixed term (nothing falls due this month). Keep the [LO#…] tag to trace it; “· 资金来源: XXX” shows
                  the SC badge in the loan list.
                </p>
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
        <Link href={`/fund-out/${loanId}`} className="text-sm text-graphite hover:text-ink font-sans transition-colors">
          Cancel
        </Link>
      </div>
    </form>
  )
}
