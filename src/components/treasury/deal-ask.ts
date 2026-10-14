'use client'

import { useState } from 'react'

// A deal's undo windows' one behaviour (2026-10-15): busy while the write is
// out, its refusal said in the window, closed and answered when it goes
// through. Kept apart from the windows themselves, which each import only
// their own Server Action — a page's screens name exactly the writes they use
// (`src/lib/write-pages.test.ts`).

type Answer = { error: string } | undefined

export function useDealAsk(onDone: () => void, onClose: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => {
    if (busy) return
    setError(null)
    onClose()
  }
  const run = async (work: () => Promise<Answer>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await work()
      if (res?.error) {
        setError(res.error)
        return
      }
      onClose()
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, close, run }
}
