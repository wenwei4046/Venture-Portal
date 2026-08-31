/**
 * Tidy tree layout for the commission org chart.
 *
 * Hand-rolled rather than pulling in a graph-layout library: this is always a
 * forest of small trees (one node per salesperson, a handful of levels), and
 * the rules that matter — a stable left-to-right order, orphans and cycles
 * placed rather than dropped — are easier to guarantee in twenty lines than to
 * coax out of a general-purpose layout engine.
 *
 * Pure so the canvas can stay dumb and this can be tested on its own.
 */

export interface OrgNodeInput {
  id: string
  parentId: string | null
  /** Sorted on, so the chart does not reshuffle between renders. */
  label: string
}

export interface OrgPosition {
  id: string
  x: number
  y: number
  depth: number
}

export interface OrgLayout {
  positions: Map<string, OrgPosition>
  /** Roots in the order they were laid out, left to right. */
  roots: string[]
  /** Nodes whose parent is missing or cyclic — placed as roots, and flagged. */
  detached: string[]
  width: number
  height: number
}

export const NODE_WIDTH = 220
export const NODE_HEIGHT = 92
const X_GAP = 44
const Y_GAP = 78

/**
 * Leaves get consecutive slots left to right; a parent sits above the centre of
 * its children. Depth drives y.
 *
 * A parent that does not exist, or a chain that loops back on itself, makes the
 * node a root of its own rather than vanishing — an org chart that silently
 * omits somebody is worse than one that shows them adrift.
 */
export function layoutTree(nodes: OrgNodeInput[]): OrgLayout {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const detached: string[] = []

  const effectiveParent = (n: OrgNodeInput): string | null => {
    if (!n.parentId) return null
    if (!byId.has(n.parentId)) {
      detached.push(n.id)
      return null
    }
    // Walk up; if we come back to ourselves the chain is cyclic.
    const seen = new Set<string>([n.id])
    let cursor: string | null = n.parentId
    for (let i = 0; cursor && i < 50; i++) {
      if (seen.has(cursor)) {
        detached.push(n.id)
        return null
      }
      seen.add(cursor)
      cursor = byId.get(cursor)?.parentId ?? null
    }
    return n.parentId
  }

  const children = new Map<string, string[]>()
  const roots: string[] = []

  const sorted = [...nodes].sort((a, b) => a.label.localeCompare(b.label))
  for (const n of sorted) {
    const parent = effectiveParent(n)
    if (parent === null) {
      roots.push(n.id)
      continue
    }
    const list = children.get(parent)
    if (list) list.push(n.id)
    else children.set(parent, [n.id])
  }

  const positions = new Map<string, OrgPosition>()
  let nextSlot = 0

  const place = (id: string, depth: number, guard: Set<string>): number => {
    if (guard.has(id)) return nextSlot
    guard.add(id)

    const kids = children.get(id) ?? []
    let x: number

    if (kids.length === 0) {
      x = nextSlot * (NODE_WIDTH + X_GAP)
      nextSlot++
    } else {
      const xs = kids.map(k => place(k, depth + 1, guard))
      x = (Math.min(...xs) + Math.max(...xs)) / 2
    }

    positions.set(id, { id, x, y: depth * (NODE_HEIGHT + Y_GAP), depth })
    return x
  }

  const guard = new Set<string>()
  for (const root of roots) place(root, 0, guard)

  // Anything still unplaced (only reachable through a cycle) goes on the end.
  for (const n of sorted) {
    if (positions.has(n.id)) continue
    detached.push(n.id)
    positions.set(n.id, { id: n.id, x: nextSlot * (NODE_WIDTH + X_GAP), y: 0, depth: 0 })
    nextSlot++
  }

  let width = 0
  let height = 0
  for (const p of positions.values()) {
    width = Math.max(width, p.x + NODE_WIDTH)
    height = Math.max(height, p.y + NODE_HEIGHT)
  }

  return { positions, roots, detached: [...new Set(detached)], width, height }
}

/**
 * Would making `parentId` the upline of `childId` create a loop?
 * The canvas asks before it lets a drop happen, so the refusal is instant
 * rather than a round trip to the server.
 */
export function wouldCycle(
  nodes: OrgNodeInput[],
  childId: string,
  parentId: string | null,
): boolean {
  if (!parentId) return false
  if (childId === parentId) return true
  const byId = new Map(nodes.map(n => [n.id, n]))
  let cursor: string | null = parentId
  for (let i = 0; cursor && i < 50; i++) {
    if (cursor === childId) return true
    cursor = byId.get(cursor)?.parentId ?? null
  }
  return false
}

/** Every descendant of `id`, so the canvas can grey out illegal drop targets. */
export function descendantsOf(nodes: OrgNodeInput[], id: string): Set<string> {
  const children = new Map<string, string[]>()
  for (const n of nodes) {
    if (!n.parentId) continue
    const list = children.get(n.parentId)
    if (list) list.push(n.id)
    else children.set(n.parentId, [n.id])
  }
  const out = new Set<string>()
  const stack = [...(children.get(id) ?? [])]
  while (stack.length) {
    const next = stack.pop()!
    if (out.has(next)) continue
    out.add(next)
    stack.push(...(children.get(next) ?? []))
  }
  return out
}
