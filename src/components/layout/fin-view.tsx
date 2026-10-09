'use client'

import { createContext, useContext, type ReactNode } from 'react'

// Whether what is on screen is the Finance view (2026-10-09, the user's
// Claude Design handoff — `lib/finance-view.ts` says which pages, for which
// roles). PortalFrame provides it; the shared components read it to speak
// English and take the revamp's styling, and leave every other view as it
// was (user: 只套 Finance 的页面).

const FinViewContext = createContext(false)

export function FinViewProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <FinViewContext.Provider value={value}>{children}</FinViewContext.Provider>
}

export function useFinView(): boolean {
  return useContext(FinViewContext)
}
