import { act, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PayrollDraftProvider, usePayrollDraft } from './PayrollDraftContext'

let draft: ReturnType<typeof usePayrollDraft>
let renders = 0
function Probe() {
  draft = usePayrollDraft()
  renders++
  return null
}

// 2026-09-30: a row that re-reported the same figures used to hand the
// provider a new object each time; every report re-rendered all 56 rows, and a
// row whose `edit` React was re-deriving reported on every render — the grid
// froze in a loop and a Save's refresh never landed.
describe('PayrollDraftProvider', () => {
  it('keeps the same state when a row reports the figures it already reported', () => {
    render(<PayrollDraftProvider><Probe /></PayrollDraftProvider>)
    act(() => draft.setRowEdit('row-1', { basic_salary: 3000, epf_ee: 300 }))
    const edits = draft.edits
    const before = renders
    act(() => draft.setRowEdit('row-1', { basic_salary: 3000, epf_ee: 300 }))
    expect(draft.edits).toBe(edits)
    expect(renders).toBe(before)
  })

  it('still takes a change, a new field, or a cleared row', () => {
    render(<PayrollDraftProvider><Probe /></PayrollDraftProvider>)
    act(() => draft.setRowEdit('row-1', { basic_salary: 3000 }))
    act(() => draft.setRowEdit('row-1', { basic_salary: 3100 }))
    expect(draft.edits['row-1']).toEqual({ basic_salary: 3100 })
    act(() => draft.setRowEdit('row-1', { basic_salary: 3100, pcb: 25 }))
    expect(draft.edits['row-1']).toEqual({ basic_salary: 3100, pcb: 25 })
    act(() => draft.setRowEdit('row-1', { pcb: 25 }))
    expect(draft.edits['row-1']).toEqual({ pcb: 25 })
    expect(draft.dirtyCount).toBe(1)
    act(() => draft.setRowEdit('row-1', null))
    expect(draft.edits).toEqual({})
    expect(draft.dirtyCount).toBe(0)
  })
})
