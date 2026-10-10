'use client'

import type { ReactNode } from 'react'
import { useFinView } from '@/components/layout/fin-view'

// One of two server-rendered pieces, by whether the page is on the Finance
// view (2026-10-10). The Statements pages are read by whoever holds Treasury
// · View — a Director too, who is not on the Finance view and keeps the page
// as it was; Finance and the Principal get the handoff's version.
export default function FinSwitch({ fin, other }: { fin: ReactNode; other: ReactNode }) {
  return <>{useFinView() ? fin : other}</>
}
