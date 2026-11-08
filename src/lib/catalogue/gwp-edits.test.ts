import { describe, expect, it } from 'vitest'
import { EditError } from './edits'
import { cleanGwpChanges, gwpChangesOf, gwpDraftChanged, type GwpDraft, type GwpSaved } from './gwp-edits'

const saved: GwpSaved = { buy: ['eco-q', 'eco-k'], gifts: [{ erpId: 'mf', qty: 2 }] }
const draft = (over: Partial<GwpDraft> = {}): GwpDraft => ({ buy: ['eco-q', 'eco-k'], gifts: [{ erpId: 'mf', qty: 2 }], ...over })
const codes: Record<string, string> = { 'eco-q': 'ECOBLISS (Q)', mf: 'MF PILLOW' }

const refusal = (fn: () => unknown): string | null => {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(EditError)
    return (e as Error).message
  }
  return null
}

describe('gwpChangesOf — Product List › GWP Save', () => {
  it('sends everything for a new GWP, each gift with its quantity', () => {
    expect(gwpChangesOf(null, draft({ gifts: [{ erpId: 'mf', qty: 2 }, { erpId: 'mp-k', qty: 1 }] })))
      .toEqual({ buy: ['eco-q', 'eco-k'], gifts: [{ id: 'mf', qty: 2 }, { id: 'mp-k', qty: 1 }] })
  })

  it('sends only the side that changed, as its whole set', () => {
    expect(gwpChangesOf(saved, draft({ gifts: [{ erpId: 'mf', qty: 3 }] }))).toEqual({ gifts: [{ id: 'mf', qty: 3 }] })
    // A set in another order is the same set.
    expect(gwpChangesOf(saved, draft({ buy: ['eco-k', 'eco-q'], gifts: [{ erpId: 'mf', qty: 2 }, { erpId: 'latex', qty: 1 }] })))
      .toEqual({ gifts: [{ id: 'mf', qty: 2 }, { id: 'latex', qty: 1 }] })
    expect(gwpChangesOf(saved, draft({ buy: ['eco-q'] }))).toEqual({ buy: ['eco-q'] })
    // A gift stepped down to 0 is off the list: nothing else changed, nothing to save.
    expect(refusal(() => gwpChangesOf(saved, draft({ gifts: [{ erpId: 'mf', qty: 2 }, { erpId: 'latex', qty: 0 }] })))).toBe('Nothing to save')
  })

  it('sends a side holding a SKU the ERP renamed, unchanged, so the Save follows it to its new code', () => {
    expect(gwpChangesOf(saved, draft(), id => id, ['gift'])).toEqual({ gifts: [{ id: 'mf', qty: 2 }] })
    expect(gwpChangesOf(saved, draft({ gifts: [{ erpId: 'mf', qty: 1 }] }), id => id, ['buy']))
      .toEqual({ buy: ['eco-q', 'eco-k'], gifts: [{ id: 'mf', qty: 1 }] })
  })

  it("refuses what the database would, in the page's words", () => {
    const refuse = (d: GwpDraft, s: GwpSaved | null = null) => refusal(() => gwpChangesOf(s, d, id => codes[id] ?? id))
    expect(refuse(draft({ buy: [] }))).toBe('Pick the SKUs bought')
    expect(refuse(draft({ gifts: [] }))).toBe('Pick the gifts')
    expect(refuse(draft({ gifts: [{ erpId: 'mf', qty: 0 }] }))).toBe('Pick the gifts')
    expect(refuse(draft({ gifts: [{ erpId: 'eco-q', qty: 1 }] }))).toBe('ECOBLISS (Q) is both bought and given')
    for (const qty of [101, 1.5, -1]) {
      expect(refuse(draft({ gifts: [{ erpId: 'mf', qty }] }))).toBe('MF PILLOW: a whole number from 1 to 100')
    }
    expect(refuse(draft(), saved)).toBe('Nothing to save')
  })
})

describe('cleanGwpChanges — what the server takes from the page', () => {
  it('keeps the right shapes', () => {
    expect(cleanGwpChanges({ buy: ['a', 'a', 'b'], gifts: [{ id: 'c', qty: 2 }, { id: 'c', qty: 3 }] }, true))
      .toEqual({ buy: ['a', 'b'], gifts: [{ id: 'c', qty: 3 }] })
    expect(cleanGwpChanges({ gifts: [{ id: 'c', qty: 1 }] }, false)).toEqual({ gifts: [{ id: 'c', qty: 1 }] })
  })

  it('refuses the rest', () => {
    expect(refusal(() => cleanGwpChanges(null, false))).toBe('Nothing to save')
    expect(refusal(() => cleanGwpChanges({}, false))).toBe('Nothing to save')
    expect(refusal(() => cleanGwpChanges({ buy: 'a' }, false))).toBe('Bought is a list of SKUs')
    expect(refusal(() => cleanGwpChanges({ gifts: ['c'] }, false))).toBe('Gifts is a list of SKUs, each with how many')
    expect(refusal(() => cleanGwpChanges({ gifts: [{ id: 'c', qty: 0 }] }, false))).toBe('Each gift is a whole number from 1 to 100')
    expect(refusal(() => cleanGwpChanges({ gifts: [{ id: 'c', qty: '2' }] }, false))).toBe('Each gift is a whole number from 1 to 100')
    expect(refusal(() => cleanGwpChanges({ buy: ['a'] }, true))).toBe('A new GWP needs what is bought and its gifts')
  })

  it('tells a page opened before each gift had its quantity to reload', () => {
    expect(refusal(() => cleanGwpChanges({ qty: 2, buy: ['a'], gift: ['c'] }, true))).toBe('This page is out of date: reload it')
    expect(refusal(() => cleanGwpChanges({ gift: ['c'] }, false))).toBe('This page is out of date: reload it')
  })
})

describe('gwpDraftChanged — the unsaved dot', () => {
  it('reads a new GWP as changed once anything is picked', () => {
    expect(gwpDraftChanged(null, { buy: [], gifts: [] })).toBe(false)
    expect(gwpDraftChanged(null, { buy: [], gifts: [{ erpId: 'mf', qty: 1 }] })).toBe(true)
  })

  it('reads one saved as changed only when it differs', () => {
    expect(gwpDraftChanged(saved, draft())).toBe(false)
    expect(gwpDraftChanged(saved, draft({ buy: ['eco-k', 'eco-q'] }))).toBe(false)
    expect(gwpDraftChanged(saved, draft({ gifts: [{ erpId: 'mf', qty: 3 }] }))).toBe(true)
    expect(gwpDraftChanged(saved, draft({ gifts: [{ erpId: 'mf', qty: 2 }, { erpId: 'mp', qty: 1 }] }))).toBe(true)
  })
})
