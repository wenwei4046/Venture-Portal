'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { PayrollRowUpdate } from '../actions'

// Rows report their unsaved edits here so the page-level Save button can
// batch-save them and Submit to Finance can refuse while edits are pending.
interface PayrollDraftContextValue {
  edits: Record<string, PayrollRowUpdate>
  commissionReviews: Record<string, () => Promise<boolean>>
  dirtyCount: number
  setRowEdit: (id: string, edit: PayrollRowUpdate | null) => void
  setCommissionReview: (id: string, review: (() => Promise<boolean>) | null) => void
}

const PayrollDraftContext = createContext<PayrollDraftContextValue>({
  edits: {},
  commissionReviews: {},
  dirtyCount: 0,
  setRowEdit: () => {},
  setCommissionReview: () => {},
})

export function usePayrollDraft() {
  return useContext(PayrollDraftContext)
}

/** Same fields, same values — a row reporting what it already reported. */
function sameEdit(a: PayrollRowUpdate | undefined, b: PayrollRowUpdate): boolean {
  if (!a) return false
  const keys = Object.keys(b) as (keyof PayrollRowUpdate)[]
  return keys.length === Object.keys(a).length && keys.every(k => Object.is(a[k], b[k]))
}

export function PayrollDraftProvider({ children }: { children: ReactNode }) {
  const [edits, setEdits] = useState<Record<string, PayrollRowUpdate>>({})
  const [commissionReviews, setCommissionReviews] = useState<Record<string, () => Promise<boolean>>>({})

  const setRowEdit = useCallback((id: string, edit: PayrollRowUpdate | null) => {
    setEdits(prev => {
      if (edit === null) {
        if (!(id in prev)) return prev
        const next = { ...prev }
        delete next[id]
        return next
      }
      // The same figures reported again change nothing. Without this every
      // report was a new object, re-rendering all 56 rows, and a row whose
      // `edit` React was re-deriving (fast typing, 2026-09-30) reported again
      // on every render — a loop that froze the grid and never let a Save's
      // refresh land.
      if (sameEdit(prev[id], edit)) return prev
      return { ...prev, [id]: edit }
    })
  }, [])

  const setCommissionReview = useCallback((id: string, review: (() => Promise<boolean>) | null) => {
    setCommissionReviews(prev => {
      if (review === null) {
        if (!(id in prev)) return prev
        const next = { ...prev }
        delete next[id]
        return next
      }
      if (prev[id] === review) return prev
      return { ...prev, [id]: review }
    })
  }, [])

  const value = useMemo(
    () => ({
      edits,
      commissionReviews,
      dirtyCount: new Set([...Object.keys(edits), ...Object.keys(commissionReviews)]).size,
      setRowEdit,
      setCommissionReview,
    }),
    [edits, commissionReviews, setRowEdit, setCommissionReview],
  )

  return (
    <PayrollDraftContext.Provider value={value}>
      {children}
    </PayrollDraftContext.Provider>
  )
}
