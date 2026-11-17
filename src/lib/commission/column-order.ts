/**
 * The Commission Workbench's order table: its middle columns are dragged into
 * any order by their headers, and Backspace puts them back (user 2026-11-17:
 * "拖表头换栏位顺序 … back space 就可以回复原有的排法"). Sales order stays
 * first and Total commission last — they are not in the list.
 */

/** A stored order made to fit the columns there are today: unknown keys and
 *  repeats dropped, columns it does not name (added since) put back where the
 *  default has them. */
export function normaliseOrder<K extends string>(stored: unknown, defaults: readonly K[]): K[] {
  if (!Array.isArray(stored)) return [...defaults]
  const known = new Set<string>(defaults)
  const kept: K[] = []
  for (const key of stored) {
    if (typeof key === 'string' && known.has(key) && !kept.includes(key as K)) kept.push(key as K)
  }
  defaults.forEach((key, i) => {
    if (kept.includes(key)) return
    // After the default neighbour on its left, or first when it has none.
    const left = defaults.slice(0, i).reverse().find(k => kept.includes(k))
    kept.splice(left ? kept.indexOf(left) + 1 : 0, 0, key)
  })
  return kept
}

/** `dragged` dropped on `target`: it takes the target's place, the columns
 *  between shifting one step towards where it came from. */
export function moveColumn<K extends string>(order: readonly K[], dragged: K, target: K): K[] {
  const from = order.indexOf(dragged)
  const to = order.indexOf(target)
  if (from < 0 || to < 0 || from === to) return [...order]
  const next = order.filter(k => k !== dragged)
  next.splice(to, 0, dragged)
  return next
}

export function isDefaultOrder<K extends string>(order: readonly K[], defaults: readonly K[]): boolean {
  return order.length === defaults.length && order.every((k, i) => k === defaults[i])
}

/** Backspace restores the order only when it is not typing: in a field, a
 *  select or an editable cell it deletes text as it always has. */
export function backspaceResetsColumns(event: { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; target: EventTarget | null }): boolean {
  if (event.key !== 'Backspace' || event.altKey || event.ctrlKey || event.metaKey) return false
  const el = event.target as { tagName?: string; isContentEditable?: boolean } | null
  if (!el) return true
  const tag = (el.tagName ?? '').toUpperCase()
  return !(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable)
}
