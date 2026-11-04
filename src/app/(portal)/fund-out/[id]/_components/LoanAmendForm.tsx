'use client'

import { amendLoan, amendLoanFrom } from '../../actions'
import type { RateBasis } from '@/lib/rate-basis'
import AmendTermsForm from '@/components/treasury/AmendTermsForm'
import type { AmendFacts } from '@/lib/fund-amend'

interface Props {
  loanId: string
  ratePct: string
  /** How the loan's rate was agreed (2026-11-04). */
  rateBasis?: RateBasis
  tenureMonths: string
  /** A fixed principal a month the loan has ('' = equal parts). */
  principalPerMonth?: string
  disbursementDate: string
  repaymentTerms: string
  compound: boolean
  /** Default effective month for a later-month change (next month, 'YYYY-MM'). */
  nextMonth: string
  facts: AmendFacts
  /** Treasury · Approve: the change applies now. Without it (Treasury · Edit) either change is filed for the Principal. */
  direct?: boolean
}

// An active loan's Amend terms — the form both deals share (components/treasury/AmendTermsForm, 2026-10-27). The
// Principal's whole terms carry the disbursement and the terms' words; Finance files the rate, the repayment and
// compounding.
export default function LoanAmendForm({ loanId, ratePct, rateBasis = 'month', tenureMonths, principalPerMonth = '', disbursementDate, repaymentTerms, compound, nextMonth, facts, direct = true }: Props) {
  return (
    <AmendTermsForm
      side="out"
      id={loanId}
      ratePct={ratePct}
      rateBasis={rateBasis}
      months={tenureMonths}
      principalPerMonth={principalPerMonth}
      start={disbursementDate}
      text={repaymentTerms}
      compound={compound}
      nextMonth={nextMonth}
      facts={facts}
      direct={direct}
      whole={amendLoan}
      from={amendLoanFrom}
      cancelHref={`/fund-out/${loanId}`}
    />
  )
}
