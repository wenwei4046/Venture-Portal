/**
 * Where somebody's card was left.
 *
 * The chart lays a tree out for itself, and until 2026-09-09 that was the only
 * place a card could be: a card dropped on empty ground snapped back, which
 * the user read as the chart refusing to be moved at all ("我并不能自由地拉动
 * 它们"). Now a card stays where it is put, and this is the memory of that —
 * per browser, per scheme, in `localStorage`. It is a reading convenience,
 * not a fact about the company: nothing in the database changes, a Tidy
 * clears it, and so does any move, because a moved tree has a new shape and
 * the old arrangement described the old one.
 *
 * Kept behind a `StorageLike` so the parsing can be tested with a Map and the
 * component never touches `window` during a server render.
 */

export interface XY {
  x: number
  y: number
}

export type ManualLayout = Map<string, XY>

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function layoutKey(schemeId: string): string {
  return `vp.org-layout.${schemeId}`
}

/**
 * Anything that is not a finite pair of numbers under a string key is dropped
 * — a corrupt entry loses one card's position, never the whole arrangement.
 */
export function parseManualLayout(raw: string | null): ManualLayout {
  const out: ManualLayout = new Map()
  if (!raw) return out
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return out
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const { x, y } = value as { x?: unknown; y?: unknown }
    if (typeof x !== 'number' || typeof y !== 'number') continue
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    out.set(id, { x, y })
  }
  return out
}

export function serializeManualLayout(layout: ManualLayout): string {
  const obj: Record<string, XY> = {}
  for (const [id, xy] of layout) obj[id] = { x: Math.round(xy.x), y: Math.round(xy.y) }
  return JSON.stringify(obj)
}

/** Never throws: private mode and a full quota both just mean "no memory today". */
export function readManualLayout(storage: StorageLike | null | undefined, schemeId: string): ManualLayout {
  if (!storage) return new Map()
  try {
    return parseManualLayout(storage.getItem(layoutKey(schemeId)))
  } catch {
    return new Map()
  }
}

export function writeManualLayout(
  storage: StorageLike | null | undefined,
  schemeId: string,
  layout: ManualLayout,
): void {
  if (!storage) return
  try {
    if (layout.size === 0) storage.removeItem(layoutKey(schemeId))
    else storage.setItem(layoutKey(schemeId), serializeManualLayout(layout))
  } catch {
    // Nothing to do — the chart still works, it just forgets on reload.
  }
}
