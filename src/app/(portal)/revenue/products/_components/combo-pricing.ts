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

/** One set of modules: the same (base model, slots) across its fabric tiers. */
export interface ComboSet {
  key: string
  baseModel: string
  modelName: string | null
  label: string | null
  slots: string[][]
  isNew: boolean
  /** One ERP row per tier; `null` = any tier. */
  byTier: Map<string | null, ComboRow>
}

/** P2 and P3 of one set have the same modules, so the sheet shows them on one row. */
export function comboSets(combos: readonly ComboRow[]): ComboSet[] {
  const sets = new Map<string, ComboSet>()
  for (const c of combos) {
    const key = `${c.baseModel}\u0000${c.slotsKey}`
    let set = sets.get(key)
    if (!set) {
      set = { key, baseModel: c.baseModel, modelName: c.modelName, label: c.label, slots: c.slots, isNew: false, byTier: new Map() }
      sets.set(key, set)
    }
    set.byTier.set(c.tier, c)
    set.isNew ||= c.isNew
    set.label ??= c.label
  }
  return [...sets.values()]
}

export interface SlotGroup {
  /** The module, or its shared base when the choice is only the side it faces. */
  code: string
  /** "either side" for LHF/RHF, else the other alternatives. */
  alternatives: string | null
  count: number
}

/** Collapse identical slots (×4) and read "X(LHF) or X(RHF)" as one module, either side. */
export function slotGroups(slots: readonly string[][]): SlotGroup[] {
  const groups: (SlotGroup & { id: string })[] = []
  for (const slot of slots) {
    const id = slot.join('\u0000')
    const existing = groups.find(g => g.id === id)
    if (existing) { existing.count++; continue }
    const sides = slot.map(code => /^(.*)\((LHF|RHF)\)$/.exec(code))
    const sameBase = slot.length > 1 && sides.every(Boolean) && new Set(sides.map(m => m![1])).size === 1
    groups.push({
      id,
      code: sameBase ? sides[0]![1] : slot[0] ?? '',
      alternatives: sameBase ? 'LHF / RHF' : slot.length > 1 ? `or ${slot.slice(1).join(' / ')}` : null,
      count: 1,
    })
  }
  return groups.map(({ code, alternatives, count }) => ({ code, alternatives, count }))
}

/** A spreadsheet clipboard: rows of tab-separated cells, money formatting stripped. */
export function parsePastedGrid(text: string): string[][] | null {
  const lines = text.replace(/\r/g, '').split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  if (lines.length < 2 && !lines[0]?.includes('\t')) return null
  return lines.map(line => line.split('\t').map(v => v.replace(/[^0-9.\-]/g, '')))
}
