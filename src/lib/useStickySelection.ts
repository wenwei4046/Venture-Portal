'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { readSelection, writeSelection } from './selection-store'

/**
 * Multi-select state that survives leaving the page for a detail view.
 *
 * `scope` is the list's own path (e.g. '/approvals') — it keys the store and
 * defines the drill-down boundary. `validIds` is every id currently on screen;
 * the returned set is always a subset of it, so a row that was approved while
 * the reader was on its detail page cannot keep inflating the count or the
 * bulk total on the way back.
 *
 * See lib/selection-store.ts for the lifetime rule.
 */
export function useStickySelection(scope: string, validIds: readonly string[]) {
  // Restored during the first render, not in an effect: the checkboxes are
  // right on the very first paint after Back, with no flash of empty boxes.
  const [stored, setStored] = useState<Set<string>>(() => readSelection(scope))

  const selected = useMemo(() => {
    const live = new Set<string>()
    for (const id of validIds) if (stored.has(id)) live.add(id)
    return live
  }, [stored, validIds])

  // Keep the raw set (not `selected`) so ids hidden by a filter aren't dropped
  // on the way through. They expire with the scope.
  useEffect(() => {
    writeSelection(scope, stored)
  }, [scope, stored])

  const toggle = useCallback((id: string) => {
    setStored((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const replace = useCallback((ids: readonly string[]) => {
    setStored(new Set(ids))
  }, [])

  const clear = useCallback(() => {
    setStored(new Set())
  }, [])

  return { selected, toggle, replace, clear }
}
