import { compareHeights, heightKey } from '@/lib/catalogue/keys'
import type { ComboPriceEdit } from '@/lib/catalogue/edits'
import type { ComboRow } from '../load'

export type ComboDrafts = Map<string, Record<string, { height: string; value: string }>>

export function comboKey(c: Pick<ComboRow, 'baseModel' | 'slotsKey' | 'tier'>): string {
  return `${c.baseModel}\u0000${c.slotsKey}\u0000${c.tier ?? ''}`
}

export function comboSlotLabel(slots: string[][]): string {
  return slots.map(slot => slot.join(' or ')).join(' + ')
}

/** Keep ERP order/spelling, followed by historical priced sizes. */
export function comboHeightColumns(combos: readonly ComboRow[]): string[] {
  const columns = new Map<string, string>()
  for (const combo of combos) for (const height of combo.heights) {
    const key = heightKey(height)
    if (key !== null && !columns.has(key)) columns.set(key, height)
  }
  const historical = new Map<string, string>()
  for (const combo of combos) for (const height of Object.keys(combo.prices)) {
    const key = heightKey(height)
    if (key !== null && !columns.has(key) && !historical.has(key)) historical.set(key, height)
  }
  return [...columns.values(), ...[...historical.values()].sort(compareHeights)]
}

export function comboPriceAt(combo: ComboRow, height: string): number | null {
  const key = heightKey(height)
  if (key === null) return null
  const raw = Object.keys(combo.prices).find(h => heightKey(h) === key)
  return raw === undefined ? null : combo.prices[raw]
}

/** Save the whole price map without losing hidden combos, sizes or raw labels. */
export function buildComboPriceEdits(combos: readonly ComboRow[], drafts: ComboDrafts): ComboPriceEdit[] {
  const byKey = new Map(combos.map(c => [comboKey(c), c]))
  return [...drafts].map(([key, cells]) => {
    const combo = byKey.get(key)
    if (!combo) throw new Error('A changed combo is no longer available. Reload the catalogue before saving.')
    const allowed = new Set(comboHeightColumns([combo]).map(heightKey))
    const prices: Record<string, string | null> = Object.fromEntries(Object.entries(combo.prices).map(([h, price]) => [h, String(price)]))
    for (const { height, value } of Object.values(cells)) {
      const heightId = heightKey(height)
      if (heightId === null || !allowed.has(heightId)) throw new Error(`Seat size ${height} is not available for ${combo.label ?? combo.baseModel}.`)
      // ERP 24 and saved 24" are one price. Keep the stored key when editing it.
      const raw = Object.keys(prices).find(h => heightKey(h) === heightId) ?? height
      prices[raw] = value
    }
    return { baseModel: combo.baseModel, slotsKey: combo.slotsKey, tier: combo.tier, prices }
  })
}
