'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import type { AllocTab } from './landing-tab'

// The allocator's open tab, shared by the tabs and the page head (2026-10-10,
// the handoff: Generate invoices sits in the head while Records is open).
// The page keys the shell on its month, so a new month starts on its own
// landing tab, as the tabs always did.

interface Shell {
  tab: AllocTab
  setTab: (tab: AllocTab) => void
}

const ShellContext = createContext<Shell | null>(null)

export function AllocatorShell({ initialTab, children }: { initialTab: AllocTab; children: ReactNode }) {
  const [tab, setTab] = useState<AllocTab>(initialTab)
  return <ShellContext.Provider value={{ tab, setTab }}>{children}</ShellContext.Provider>
}

/** The shell's tab, or null outside one (a tab rendered on its own). */
export function useAllocatorShell(): Shell | null {
  return useContext(ShellContext)
}
