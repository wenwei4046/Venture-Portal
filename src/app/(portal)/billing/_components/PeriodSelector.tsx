'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import MonthBar from './MonthBar'

interface Props {
  currentPeriod: string
}

// One selector instance per month. Changing the month is a query-string
// navigation (/statements?period=), which re-runs the Server Components but
// keeps this client subtree mounted — so the local `period` below only ever
// tracked the arrows, not the URL, and drifted after browser Back/Forward.
// Keyed on the month the server rendered, it restarts in sync. Same pattern
// as director-salary's CTCInputGrid (2026-09-11).
//
// 2026-10-10 — the handoff's month control: "← October 2026 ▾ →", the label
// opening the year's months (MonthBar). It goes to /statements, the page
// itself, rather than through the /billing redirect.
export default function PeriodSelector(props: Props) {
  return <PeriodSelectorBody key={props.currentPeriod} {...props} />
}

function PeriodSelectorBody({ currentPeriod }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // period is stored as YYYY-MM-01; navigate keeps that shape.
  const [period, setPeriod] = useState(currentPeriod)

  function go(month: string) {
    const next = `${month}-01`
    setPeriod(next)
    startTransition(() => {
      router.push(`/statements?period=${next}`)
    })
  }

  return <MonthBar month={period.slice(0, 7)} onGo={go} picker disabled={isPending} />
}
