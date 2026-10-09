'use client'

import type { RefObject } from 'react'
import { useEntryScroll } from './useEntryScroll'

// A Finance list keeps its place (2026-10-09, the user's Claude Design
// handoff): opening a row's page and coming back puts the list — and any
// table box inside it — where it was. The remembering is `useEntryScroll`
// (Revenue's ledger had it first); this only mounts it on the Finance view.
export default function FinScrollMemory({ root, view }: { root: RefObject<HTMLElement | null>; view: string }) {
  useEntryScroll(root, view, '.st-box')
  return null
}
