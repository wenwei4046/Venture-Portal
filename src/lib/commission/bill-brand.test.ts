import { describe, expect, it } from 'vitest'
import { billBrandAction, brandOutcomeMessage } from './bill-brand'

// 2026-09-27: a bed-frame bill keyed after its fair closed (HC-SO-2609-127)
// reaches the portal with no brand at all; HR gives it one by right-click.
const month = { runLocked: false, closedReason: null, monthLabel: 'September 2026', hasOptions: true }

describe('billBrandAction', () => {
  it('offers a pick on a bill with no brand at all', () => {
    expect(billBrandAction({ brandCode: null, picked: null, cancelled: false }, month))
      .toEqual({ kind: 'pick', picked: null })
  })

  it('offers to change or take off a brand picked here', () => {
    expect(billBrandAction({ brandCode: 'ZANOTTI', picked: 'ZANOTTI', cancelled: false }, month))
      .toEqual({ kind: 'pick', picked: 'ZANOTTI' })
  })

  it('never offers a bill a brand of its own already decides', () => {
    expect(billBrandAction({ brandCode: 'AKEMI', picked: null, cancelled: false }, month)).toBeNull()
  })

  it('offers nothing on a bill that does not count, or where no brand has a ladder', () => {
    expect(billBrandAction({ brandCode: null, picked: null, cancelled: true }, month)).toBeNull()
    expect(billBrandAction({ brandCode: null, picked: null, cancelled: false }, { ...month, hasOptions: false })).toBeNull()
  })

  it('shows the row but locks it in a paid month, or for a closed salesperson', () => {
    expect(billBrandAction({ brandCode: null, picked: null, cancelled: false }, { ...month, runLocked: true }))
      .toEqual({ kind: 'locked', picked: null, reason: 'The run for September 2026 has paid — reopen it before changing a bill’s brand' })
    expect(billBrandAction({ brandCode: 'AKEMI', picked: 'AKEMI', cancelled: false }, { ...month, closedReason: 'LUIS TEO’s September 2026 is closed' }))
      .toEqual({ kind: 'locked', picked: 'AKEMI', reason: 'LUIS TEO’s September 2026 is closed' })
  })
})

describe('brandOutcomeMessage', () => {
  const nameOf = (code: string) => ({ AKEMI: 'Akemi', DUNLOP: 'Dunlopillo' } as Record<string, string>)[code] ?? code

  it('says which ladder the bill follows now', () => {
    expect(brandOutcomeMessage({ orderNo: 'HC-SO-2609-127', brandCode: 'AKEMI', picked: 'AKEMI' }, nameOf))
      .toBe('HC-SO-2609-127 now follows Akemi’s margin ladder.')
  })

  it('says what is left once the pick is off', () => {
    expect(brandOutcomeMessage({ orderNo: 'HC-SO-2609-127', brandCode: 'DUNLOP', picked: null }, nameOf))
      .toBe('HC-SO-2609-127’s pick is off — it follows Dunlopillo, from its own bill.')
    expect(brandOutcomeMessage({ orderNo: 'HC-SO-2609-062', brandCode: null, picked: null }, nameOf))
      .toBe('HC-SO-2609-062 has no brand again.')
  })
})
