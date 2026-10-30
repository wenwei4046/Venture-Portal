'use client'

import MinPayInterestField from '@/components/treasury/MinPayInterestField'
import { setLoanMinPayInterest } from '../../actions'

// 最低还息单 (user 2026-09-04): flagged = "本金可以慢慢还，但每月利息一定要还".
// Finance self-service, editable anytime (旧单也能补设).
// 2026-10-09: a field of the page's Repayment settings panel (the handoff).
// 2026-10-30: from a month — the first instalment, or a later one (MinPayInterestField).
export default function MinPayInterestToggle({
  loanId,
  current,
  from,
  firstDueYM,
  today,
}: {
  loanId: string
  current: boolean
  from: string | null
  firstDueYM: string | null
  today: string
}) {
  return (
    <MinPayInterestField
      current={current}
      from={from}
      firstDueYM={firstDueYM}
      today={today}
      idPrefix="lo"
      onSave={(on, month) => setLoanMinPayInterest(loanId, on, month)}
    />
  )
}
