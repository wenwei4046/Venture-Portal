'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

// Monthly P&L / Monthly Cash Flow keep their controls in a left rail that is a
// SIBLING of the matrix, so the search box (in the rail) and the rows it
// searches (in the matrix) can't share component state. This tiny client
// context bridges them.
//
// Deliberately NOT the URL: a ?q= would round-trip the server on every
// keystroke. The GL statements need none of this — GlReportView owns its own
// rail, so its search is plain local state.

interface ReportSearchValue {
  search: string
  setSearch: (s: string) => void
  /** Published by the matrix once it knows how many rows matched. */
  hitCount: number
  setHitCount: (n: number) => void
  activeHit: number
  step: (delta: number) => void
}

const Ctx = createContext<ReportSearchValue | null>(null)

export function ReportSearchProvider({ children }: { children: React.ReactNode }) {
  const [search, setSearchRaw] = useState('')
  const [hitCount, setHitCount] = useState(0)
  const [activeHit, setActiveHit] = useState(0)

  // A new query starts from the first hit again.
  const setSearch = useCallback((s: string) => {
    setSearchRaw(s)
    setActiveHit(0)
  }, [])

  const step = useCallback(
    (delta: number) =>
      setActiveHit((i) => (hitCount === 0 ? 0 : (i + delta + hitCount) % hitCount)),
    [hitCount],
  )

  const value = useMemo(
    () => ({ search, setSearch, hitCount, setHitCount, activeHit, step }),
    [search, setSearch, hitCount, activeHit, step],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** null when there is no provider above — callers render no search UI then. */
export function useReportSearch(): ReportSearchValue | null {
  return useContext(Ctx)
}
