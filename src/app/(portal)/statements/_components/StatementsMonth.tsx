'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import MonthBar from '../../billing/_components/MonthBar'

interface Props {
  /** The month the page shows, `YYYY-MM`. */
  month: string
  /** The months that have statements — `YYYY-MM` → "8 statements". */
  marked: Readonly<Record<string, string>>
}

// The month the Statements page shows (2026-10-14, user: 在上面能够选择月份 —
// one month at a time, not every month in one list): Service Billing's
// "← September 2026 ▾ →", its grid dotting the months that have statements.
// Changing it is a query-string navigation, which keeps this mounted — so it
// is keyed on the month the server rendered and restarts with it (Service
// Billing's PeriodSelector did the same): after Back / Forward it never names
// a month the page is not on.
export default function StatementsMonth(props: Props) {
  return <StatementsMonthBody key={props.month} {...props} />
}

function StatementsMonthBody({ month, marked }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [shown, setShown] = useState(month)

  function go(next: string) {
    setShown(next)
    startTransition(() => {
      router.push(`/statements/monthly?period=${next}`)
    })
  }

  return <MonthBar month={shown} onGo={go} picker marked={marked} disabled={isPending} />
}
