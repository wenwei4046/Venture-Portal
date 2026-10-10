'use client'

import { usePathname, useRouter } from 'next/navigation'
import MonthBar from '../../billing/_components/MonthBar'

// The month beside the page title (2026-10-07, the allocator on the sheet;
// 2026-10-10, the handoff's "← October 2026 →"). It navigates by ?period=
// only; the tabs below restart for the month the server then renders
// (AllocatorTabs is keyed on it).
export default function AllocatorPeriod({ period }: { period: string }) {
  const router = useRouter()
  const pathname = usePathname()
  return <MonthBar month={period} compact onGo={(month) => router.push(`${pathname}?period=${month}`)} />
}
