import { EditError } from './edits'

/**
 * Product List › GWP's Save (2026-11-08): one gift with purchase, as the page sends it — only what changed on one
 * already saved (a page open on another computer never writes back a field it did not touch; the user's rule:
 * save only the fields changed), everything on a new one. No dates (the user: "gwp no need got set date
 * funtion"). Each gift carries its own quantity a unit bought (the user: "换成就是 Quantity，就可以加 1、加 2、加 3
 * 这样子"). The database asks again (`catalogue_save_gwp`).
 */

/** A gift picked: its SKU Master id and how many of it a unit bought earns. */
export interface GwpGiftPick {
  erpId: string
  qty: number
}

/** A GWP as saved: its SKUs by their SKU Master id. */
export interface GwpSaved {
  buy: readonly string[]
  gifts: readonly GwpGiftPick[]
}

/** What the page holds while it is edited (the gifts' quantities come from a stepper). */
export interface GwpDraft {
  buy: readonly string[]
  gifts: readonly GwpGiftPick[]
}

/** What is sent: only what changed on a GWP saved, everything on a new one — each side as its whole set. */
export interface GwpChanges {
  buy?: string[]
  gifts?: { id: string; qty: number }[]
}

/** A GWP's two sides. */
export type GwpSide = 'buy' | 'gift'

/** The most of one gift a unit bought may earn. */
export const GWP_MAX_QTY = 100

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every(x => b.includes(x))

/** One entry per gift (the last quantity given for it), those at 0 left out. */
function giftsOf(gifts: readonly GwpGiftPick[]): GwpGiftPick[] {
  const byId = new Map<string, number>()
  for (const g of gifts) byId.set(g.erpId, g.qty)
  return [...byId].filter(([, qty]) => qty !== 0).map(([erpId, qty]) => ({ erpId, qty }))
}

const sameGifts = (a: readonly GwpGiftPick[], b: readonly GwpGiftPick[]) => {
  const x = giftsOf(a)
  const y = new Map(giftsOf(b).map(g => [g.erpId, g.qty]))
  return x.length === y.size && x.every(g => y.get(g.erpId) === g.qty)
}

const qtyOk = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= GWP_MAX_QTY

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
  const gifts = giftsOf(draft.gifts)
  if (buy.length === 0) throw new EditError('Pick the SKUs bought')
  if (gifts.length === 0) throw new EditError('Pick the gifts')
  const both = buy.find(id => gifts.some(g => g.erpId === id))
  if (both) throw new EditError(`${codeOf(both)} is both bought and given`)
  const bad = gifts.find(g => !qtyOk(g.qty))
  if (bad) throw new EditError(`${codeOf(bad.erpId)}: a whole number from 1 to ${GWP_MAX_QTY}`)

  const sent = gifts.map(g => ({ id: g.erpId, qty: g.qty }))
  if (saved === null) return { buy, gifts: sent }

  const changes: GwpChanges = {}
  if (!sameSet(buy, saved.buy) || stale.includes('buy')) changes.buy = buy
  if (!sameGifts(gifts, saved.gifts) || stale.includes('gift')) changes.gifts = sent
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
  // The shape before each gift had its quantity (one number for every gift): a page opened before then.
  if ('qty' in r || 'gift' in r) throw new EditError('This page is out of date: reload it')
  const out: GwpChanges = {}
  if ('buy' in r) {
    const v = r.buy
    if (!Array.isArray(v) || v.some(x => typeof x !== 'string' || !x.trim())) throw new EditError('Bought is a list of SKUs')
    out.buy = [...new Set(v as string[])]
  }
  if ('gifts' in r) {
    const v = r.gifts
    if (!Array.isArray(v)) throw new EditError('Gifts is a list of SKUs, each with how many')
    const byId = new Map<string, number>()
    for (const g of v) {
      const id = g && typeof g === 'object' ? (g as Record<string, unknown>).id : undefined
      const qty = g && typeof g === 'object' ? (g as Record<string, unknown>).qty : undefined
      if (typeof id !== 'string' || !id.trim()) throw new EditError('Gifts is a list of SKUs, each with how many')
      if (!qtyOk(qty)) throw new EditError(`Each gift is a whole number from 1 to ${GWP_MAX_QTY}`)
      byId.set(id, qty as number)
    }
    out.gifts = [...byId].map(([id, qty]) => ({ id, qty }))
  }
  if (isNew && (!out.buy?.length || !out.gifts?.length)) throw new EditError('A new GWP needs what is bought and its gifts')
  if (Object.keys(out).length === 0) throw new EditError('Nothing to save')
  return out
}

/** Whether a draft differs from what it was opened on — the tab's unsaved dot. */
export function gwpDraftChanged(saved: GwpSaved | null, draft: GwpDraft): boolean {
  if (saved === null) return draft.buy.length > 0 || giftsOf(draft.gifts).length > 0
  return !sameSet([...new Set(draft.buy)], saved.buy) || !sameGifts(draft.gifts, saved.gifts)
}
