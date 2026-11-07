import { EditError } from './edits'

/**
 * Product List › GWP's Save (2026-11-08): one gift with purchase, as the page sends it — only what changed on one
 * already saved (a page open on another computer never writes back a field it did not touch; the user's rule:
 * save only the fields changed), everything on a new one. No dates (the user: "gwp no need got set date
 * funtion"). The database asks again (`catalogue_save_gwp`).
 */

/** A GWP as saved: its SKUs by their SKU Master id. */
export interface GwpSaved {
  buy: readonly string[]
  gift: readonly string[]
  perUnit: number
}

/** What the page holds while it is edited: the box as typed. */
export interface GwpDraft {
  buy: readonly string[]
  gift: readonly string[]
  perUnit: string
}

/** What is sent: only what changed on a GWP saved, everything on a new one. */
export interface GwpChanges {
  qty?: number
  buy?: string[]
  gift?: string[]
}

/** A GWP's two sides. */
export type GwpSide = 'buy' | 'gift'

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every(x => b.includes(x))

const QTY = 'Free per unit is a whole number from 1 to 100'

/**
 * The changes to send, or an `EditError` in the words the page shows. `codeOf` names a SKU in a refusal.
 * `stale`: the sides holding a SKU the ERP renamed since — a bill matches a GWP by the code its lines carry, so such
 * a side is sent as it stands even unchanged, and the Save follows the SKU to its new code.
 */
export function gwpChangesOf(
  saved: GwpSaved | null,
  draft: GwpDraft,
  codeOf: (erpId: string) => string = id => id,
  stale: readonly GwpSide[] = [],
): GwpChanges {
  const buy = [...new Set(draft.buy)]
  const gift = [...new Set(draft.gift)]
  if (buy.length === 0) throw new EditError('Pick the SKUs bought')
  if (gift.length === 0) throw new EditError('Pick the gifts')
  const both = buy.find(id => gift.includes(id))
  if (both) throw new EditError(`${codeOf(both)} is both bought and given`)

  const perUnitText = draft.perUnit.trim()
  const perUnit = Number(perUnitText)
  if (!/^\d+$/.test(perUnitText) || !Number.isInteger(perUnit) || perUnit < 1 || perUnit > 100) throw new EditError(QTY)

  if (saved === null) return { qty: perUnit, buy, gift }

  const changes: GwpChanges = {}
  if (perUnit !== saved.perUnit) changes.qty = perUnit
  if (!sameSet(buy, saved.buy) || stale.includes('buy')) changes.buy = buy
  if (!sameSet(gift, saved.gift) || stale.includes('gift')) changes.gift = gift
  if (Object.keys(changes).length === 0) throw new EditError('Nothing to save')
  return changes
}

/**
 * The changes as the server takes them from the page: each key only when it is the right shape, else an
 * `EditError`. What they mean is the database's to judge again (`catalogue_save_gwp`).
 */
export function cleanGwpChanges(raw: unknown, isNew: boolean): GwpChanges {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new EditError('Nothing to save')
  const r = raw as Record<string, unknown>
  const out: GwpChanges = {}
  const ids = (v: unknown, what: string): string[] => {
    if (!Array.isArray(v) || v.some(x => typeof x !== 'string' || !x.trim())) throw new EditError(`${what} is a list of SKUs`)
    return [...new Set(v as string[])]
  }
  if ('qty' in r) {
    const n = Number(r.qty)
    if (!Number.isInteger(n) || n < 1 || n > 100) throw new EditError(QTY)
    out.qty = n
  }
  if ('buy' in r) out.buy = ids(r.buy, 'Bought')
  if ('gift' in r) out.gift = ids(r.gift, 'Gifts')
  if (isNew && (out.qty === undefined || !out.buy?.length || !out.gift?.length)) {
    throw new EditError('A new GWP needs what is bought, the gifts and how many a unit')
  }
  if (Object.keys(out).length === 0) throw new EditError('Nothing to save')
  return out
}

/** Whether a draft differs from what it was opened on — the tab's unsaved dot. */
export function gwpDraftChanged(saved: GwpSaved | null, draft: GwpDraft): boolean {
  if (saved === null) return draft.buy.length > 0 || draft.gift.length > 0 || draft.perUnit.trim() !== ''
  return (
    !sameSet(draft.buy, saved.buy) ||
    !sameSet(draft.gift, saved.gift) ||
    draft.perUnit.trim() !== String(saved.perUnit)
  )
}
