/**
 * Where the reader arranged cards and department sections, in localStorage.
 * The combined Revenue canvas uses a namespace for its set of schemes and
 * identifies each card by scheme plus staff ID, so somebody's positions in
 * different sub-departments remain independent. Empty sections also store
 * their own origin.
 *
 * Blank-space card drops and department-heading drags change this reading
 * layout. A targeted drop armed by a 450ms hover, an Upline action or a
 * connector writes the validated reporting line separately. Transfers keep
 * the subtree's internal arrangement; failed or cancelled transfers restore
 * its starting positions. Blank-space drops never detach an upline.
 * On release, overlap resolution shifts teams or departments as whole groups.
 * Tidy repeats that spacing without resetting or clearing this memory.
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
