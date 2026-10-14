'use client'

import { createContext, useContext } from 'react'

// Where the Finance kit is drawn (2026-10-15, the Finance revamp v2's phone):
// on a computer its windows are the desktop dialog (D07); inside the Finance
// phone app (`/fin-app`) the same windows rise as the design's bottom sheets
// (M05–M08, M18) — one window, every feature of it, in each place. The app's
// frame says so, and which phone it is (the native details differ).

export type FinPlatform = 'ios' | 'android'

export const FinSurface = createContext<{ platform: FinPlatform } | null>(null)

/** The phone app's platform, or null on a computer's page. */
export function useFinSurface(): { platform: FinPlatform } | null {
  return useContext(FinSurface)
}
