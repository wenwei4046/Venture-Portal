import { combosCollide } from '@/lib/catalogue/combos'
import { heightKey } from '@/lib/catalogue/keys'
import { TIERS, type PriceCell } from '@/lib/catalogue/pricing'
import type { CatalogueSku, ComboRow } from '../load'

/**
 * Combo Pricing › Add combo (2026-10-08) — the window's rules, kept out of the
 * window so they can be read and tested on their own. The database checks
 * every one of them again (`catalogue_add_combo`); these are for answering as
 * the Principal types.
 */

export interface ComboModel {
  /** The ERP's base model — what a combo is keyed on. */
  code: string
  /** `CODE · name`, as the select and the title write it. */
  label: string
}

export interface ComboPiece {
  /** What the draft counts it under: the module code, or `either:<module>` for a left-or-right piece. */
  key: string
  /** The card's size: the module code (`erp_products.module_code`), or a left/right pair's own name. */
  module: string
  /** Under it: the SKU's full code, or `LHF or RHF`. */
  code: string
  /** The modules one piece of it may be: one, or the left and the right of a pair. */
  modules: string[]
  /** A left-or-right piece (2026-10-08, user: 我需要左右都算的 function) — the ERP's own "1A(LHF) or 1A(RHF)" slot. */
  either?: boolean
  grid: PriceCell[] | null
}

/** Every sofa model the SKU Master has modules for, A→Z (numbers by value). */
export function comboModels(skus: readonly CatalogueSku[]): ComboModel[] {
  const byCode = new Map<string, ComboModel>()
  for (const s of skus) {
    const code = (s.baseModel ?? s.modelCode ?? '').trim()
    if (!code || !s.moduleCode || byCode.has(code)) continue
    const name = s.modelName && s.modelName !== code && s.modelName !== s.modelCode ? s.modelName : null
    byCode.set(code, { code, label: name ? `${code} · ${name}` : code })
  }
  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
}

/**
 * The side a module faces, when its code says one: `1A(R)(LHF)`, `2A-LHF`,
 * `L RHF`. `pair` is the code with the side taken out — the name both sides
 * share — and `twin` the same code facing the other way.
 */
export function moduleSide(code: string): { pair: string; side: 'LHF' | 'RHF'; twin: string } | null {
  const m = /^(.+?)(\((LHF|RHF)\)|-(LHF|RHF)|\s+(LHF|RHF))$/.exec(code.trim())
  if (!m) return null
  const side = (m[3] ?? m[4] ?? m[5]) as 'LHF' | 'RHF'
  const other = side === 'LHF' ? 'RHF' : 'LHF'
  return { pair: m[1].trim(), side, twin: m[1] + m[2].replace(side, other) }
}

/** A left-or-right piece is costed at the dearer side wherever the two differ, so a set price copied from it never under-books. */
function dearerGrid(a: PriceCell[] | null, b: PriceCell[] | null): PriceCell[] | null {
  if (!a && !b) return null
  const out = new Map<string, PriceCell>()
  for (const cell of [...(a ?? []), ...(b ?? [])]) {
    const k = `${heightKey(cell.height)}|${cell.tier}`
    const prev = out.get(k)
    if (!prev || (typeof cell.price === 'number' && (typeof prev.price !== 'number' || cell.price > prev.price))) out.set(k, cell)
  }
  return [...out.values()]
}

/**
 * A model's compartments: one card per module code, in the SKU Master's order —
 * and, right after a module whose other side the model also has, one more for
 * the pair: a piece that may be either side (2026-10-08), as the ERP's combos
 * write "1A(R)(LHF) or 1A(R)(RHF)".
 */
export function comboPieces(skus: readonly CatalogueSku[], model: string): ComboPiece[] {
  const seen = new Set<string>()
  const singles: ComboPiece[] = []
  for (const s of skus) {
    if ((s.baseModel ?? s.modelCode ?? '').trim() !== model || !s.moduleCode || seen.has(s.moduleCode)) continue
    seen.add(s.moduleCode)
    singles.push({ key: s.moduleCode, module: s.moduleCode, code: s.code, modules: [s.moduleCode], grid: s.grid })
  }
  const out: ComboPiece[] = []
  const paired = new Set<string>()
  for (const p of singles) {
    out.push(p)
    const side = moduleSide(p.module)
    if (!side || paired.has(side.pair)) continue
    const twin = singles.find(t => t.module === side.twin)
    // The pair joins the list after whichever of its two sides comes second.
    if (!twin || singles.indexOf(twin) > singles.indexOf(p)) continue
    paired.add(side.pair)
    const [left, right] = side.side === 'LHF' ? [p, twin] : [twin, p]
    out.push({ key: `either:${side.pair}`, module: side.pair, code: 'LHF or RHF', modules: [left.module, right.module], either: true, grid: dearerGrid(left.grid, right.grid) })
  }
  return out
}

/**
 * "1A + 2 × 2A-LHF": the set as a default name reads it — a left-or-right piece
 * by its pair's name ("1A(R) + 1NA"). `sides` spells it out ("1A(R) (LHF or RHF)").
 */
export function setLine(picked: ReadonlyArray<{ module: string; n: number; either?: boolean }>, times = '×', sides = false): string {
  return picked.map(p => (p.n > 1 ? `${p.n}${times}` : '') + p.module + (sides && p.either ? ' (LHF or RHF)' : '')).join(' + ')
}

/** One piece per slot, as the ERP writes a combo's modules: [["1A"], ["2A-LHF", "2A-RHF"], ["CNR"]]. */
export function comboModules(picked: ReadonlyArray<{ modules: readonly string[]; n: number }>): string[][] {
  return picked.flatMap(p => Array.from({ length: p.n }, () => [...p.modules]))
}

/** The module total at one tier and seat height, or null when a piece has no price there ("Not sold"). */
export function moduleSum(pieces: ReadonlyArray<ComboPiece & { n: number }>, tier: string, height: string): number | null {
  if (pieces.length === 0) return null
  const want = heightKey(height)
  let total = 0
  for (const p of pieces) {
    const cell = p.grid?.find(c => heightKey(c.height) === want && c.tier === tier)
    if (!cell || typeof cell.price !== 'number') return null
    total += cell.price * p.n
  }
  return Math.round(total * 100) / 100
}

/** A combo's slots as a multiset, order-free: two combos with the same are the same compartments. */
function slotSignature(slots: readonly (readonly string[])[]): string {
  return slots.map(s => [...s].map(code => code.trim()).sort().join('|')).sort().join('+')
}

export function sameCompartments(combo: Pick<ComboRow, 'slots'>, modules: readonly (readonly string[])[]): boolean {
  return slotSignature(combo.slots) === slotSignature(modules)
}

/** A typed amount: null when blank, NaN when it is not a number. */
export function readAmount(text: string | undefined): number | null {
  const s = String(text ?? '').trim().replace(/,/g, '')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : Number.NaN
}

export interface ComboDraft {
  model: string
  label: string
  /** Pieces per card (`ComboPiece.key`). */
  pcs: Record<string, number>
  /** `${tier}#${height}` → what was typed. */
  prices: Record<string, string>
}

export function draftDirty(d: ComboDraft): boolean {
  return !!d.model || !!d.label.trim() || Object.values(d.pcs).some(n => n > 0) || Object.values(d.prices).some(v => String(v).trim() !== '')
}

export interface ComboCheck {
  /** The first thing in the way, in the window's order — or null. */
  problem: string | null
  /** The name it will be saved under: what was typed, else the compartments. */
  label: string
  pieces: number
  /** Positive prices, by tier then height. */
  prices: Record<string, Record<string, number>>
  filled: number
  modules: string[][]
}

/** The window's checks, in its order (README › Add combo › Validation). */
export function checkCombo(d: ComboDraft, pieces: readonly ComboPiece[], heights: readonly string[], combos: readonly ComboRow[]): ComboCheck {
  const picked = pieces.filter(p => (d.pcs[p.key] ?? 0) > 0).map(p => ({ ...p, n: d.pcs[p.key] }))
  const count = picked.reduce((n, p) => n + p.n, 0)
  const label = d.label.trim() || setLine(picked)
  const modules = comboModules(picked)
  const prices: Record<string, Record<string, number>> = {}
  let bad = false
  let filled = 0
  for (const tier of TIERS) {
    for (const h of heights) {
      const v = readAmount(d.prices[`${tier}#${h}`])
      if (Number.isNaN(v)) bad = true
      else if (v !== null && v > 0) {
        filled++
        prices[tier] = { ...(prices[tier] ?? {}), [h]: v }
      }
    }
  }
  const mine = combos.filter(c => c.baseModel.trim().toUpperCase() === d.model.trim().toUpperCase())
  const dup = !!d.model && picked.length > 0 && mine.some(c => c.slots.length > 0 && sameCompartments(c, modules))
  // One bill, one combo (2026-10-08): a set one bill could match as well as an existing one.
  const clash = !!d.model && picked.length > 0 && !dup ? mine.find(c => c.slots.length > 0 && combosCollide(modules, c.slots)) : undefined
  const nameTaken = !!d.model && mine.some(c => (c.label ?? '').trim().toLowerCase() === label.toLowerCase())
  const problem = !d.model ? 'Pick a sofa model.'
    : count < 2 ? 'Add at least two compartments.'
    : bad ? 'A price is not a number.'
    : !filled ? 'Fill at least one price.'
    : dup ? 'This model already has a combo with these compartments.'
    : clash ? `Model ${d.model} already has a combo for these pieces: "${clash.label ?? ''}".`
    : nameTaken ? `Model ${d.model} already has a set called "${label}".`
    : null
  return { problem, label, pieces: count, prices, filled, modules }
}
