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
  dirtyCount: number
  setRowEdit: (id: string, edit: PayrollRowUpdate | null) => void
}

const PayrollDraftContext = createContext<PayrollDraftContextValue>({
  edits: {},
  dirtyCount: 0,
  setRowEdit: () => {},
})

export function usePayrollDraft() {
  return useContext(PayrollDraftContext)
}

export function PayrollDraftProvider({ children }: { children: ReactNode }) {
  const [edits, setEdits] = useState<Record<string, PayrollRowUpdate>>({})

  const setRowEdit = useCallback((id: string, edit: PayrollRowUpdate | null) => {
    setEdits(prev => {
      if (edit === null) {
        if (!(id in prev)) return prev
        const next = { ...prev }
        delete next[id]
        return next
      }
      return { ...prev, [id]: edit }
    })
  }, [])

  const value = useMemo(
    () => ({ edits, dirtyCount: Object.keys(edits).length, setRowEdit }),
    [edits, setRowEdit],
  )

  return (
    <PayrollDraftContext.Provider value={value}>
      {children}
    </PayrollDraftContext.Provider>
  )
}
