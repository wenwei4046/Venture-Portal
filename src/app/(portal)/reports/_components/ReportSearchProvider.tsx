'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

// The reports keep their controls in a row (ReportToolbar) that is a SIBLING
// of the sheet (SheetReport), so the Find box and the detail level (in the
// row) and the rows they act on (in the sheet) can't share component state.
// This tiny client context bridges them.
//
// Deliberately NOT the URL: a ?q= would round-trip the server on every
// keystroke.

interface ReportSearchValue {
  search: string
  setSearch: (s: string) => void
  /** Published by the sheet once it knows how many rows matched. */
  hitCount: number
  setHitCount: (n: number) => void
  activeHit: number
  step: (delta: number) => void
  /** Bumped on every step(). With a single match the index cannot move, so the
   *  scroll effect would never re-fire and Enter looked dead (user 2026-07-31);
   *  watching this too makes every Enter jump, however many matches there are. */
  jump: number
  /** The detail level, when the page's control row holds it (2026-10-09, the
   *  Finance revamp handoff); null = no level buttons, the sheet opens at L3. */
  level: 1 | 2 | 3 | null
  setLevel: (level: 1 | 2 | 3) => void
}

const Ctx = createContext<ReportSearchValue | null>(null)

export function ReportSearchProvider({ children, level: initialLevel }: { children: React.ReactNode; level?: 1 | 2 | 3 }) {
  const [level, setLevelRaw] = useState<1 | 2 | 3 | null>(initialLevel ?? null)
  const setLevel = useCallback((l: 1 | 2 | 3) => setLevelRaw(l), [])
  const [search, setSearchRaw] = useState('')
  const [hitCount, setHitCount] = useState(0)
  const [activeHit, setActiveHit] = useState(0)
  const [jump, setJump] = useState(0)

  // A new query starts from the first hit again — and still counts as a jump, so
  // typing straight to a single match scrolls to it without touching Enter.
  const setSearch = useCallback((s: string) => {
    setSearchRaw(s)
    setActiveHit(0)
    setJump((j) => j + 1)
  }, [])

  const step = useCallback(
    (delta: number) => {
      setActiveHit((i) => (hitCount === 0 ? 0 : (i + delta + hitCount) % hitCount))
      setJump((j) => j + 1)
    },
    [hitCount],
  )

  const value = useMemo(
    () => ({ search, setSearch, hitCount, setHitCount, activeHit, step, jump, level, setLevel }),
    [search, setSearch, hitCount, activeHit, step, jump, level, setLevel],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** null when there is no provider above — callers render no search UI then. */
export function useReportSearch(): ReportSearchValue | null {
  return useContext(Ctx)
}
