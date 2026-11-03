'use client'

import { amendFundSource, amendFundSourceFrom } from '../../../actions'
import AmendTermsForm from '@/components/treasury/AmendTermsForm'
import type { AmendFacts } from '@/lib/fund-amend'

interface Props {
  id: string
  ratePct: string
  lockInMonths: string
  /** A fixed principal a month the source has ('' = equal parts). */
  principalPerMonth?: string
  repaymentDate: string
  compound: boolean
  notes: string
  /** Default effective month for a later-month change (next month, 'YYYY-MM'). */
  nextMonth: string
  facts: AmendFacts
  /** Treasury · Approve: the change applies now. Without it (Treasury · Edit) either change is filed for the Principal. */
  direct?: boolean
}

// An active fund source's Amend terms — the form both deals share (components/treasury/AmendTermsForm, 2026-10-27):
// From the first instalment / From a later month, the parts in cards, the Repayment type, the schedule beside it.
export default function AmendFundSourceForm({ id, ratePct, lockInMonths, principalPerMonth = '', repaymentDate, compound, notes, nextMonth, facts, direct = true }: Props) {
  return (
    <AmendTermsForm
      side="in"
      id={id}
      ratePct={ratePct}
      months={lockInMonths}
      principalPerMonth={principalPerMonth}
      start={repaymentDate}
      text={notes}
      compound={compound}
      nextMonth={nextMonth}
      facts={facts}
      direct={direct}
      whole={amendFundSource}
      from={amendFundSourceFrom}
      cancelHref={`/fund-in/${id}`}
    />
  )
}
