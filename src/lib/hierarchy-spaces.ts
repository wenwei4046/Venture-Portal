/** Canvas geometry only: moving a space never changes anyone's reporting line. */
export interface Point { x: number; y: number }
export interface Bounds extends Point { width: number; height: number }
export interface PolygonItem { id: string; points: readonly Point[] }

const EPSILON = 1e-7

function validatePoints(points: readonly Point[]): void {
  if (!Array.isArray(points) || points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    throw new TypeError('Expected finite {x,y} points.')
  }
}

function validateGap(gap: number): void {
  if (!Number.isFinite(gap) || gap < 0) throw new RangeError('Gap must be finite and nonnegative.')
}

/** A stable counterclockwise envelope, without duplicate or collinear vertices. */
export function convexHull(points: readonly Point[]): Point[] {
  validatePoints(points)
  const sorted = points.map(p => ({ ...p })).sort((a, b) => a.x - b.x || a.y - b.y)
    .filter((p, i, all) => i === 0 || p.x !== all[i - 1].x || p.y !== all[i - 1].y)
  if (sorted.length < 3) return sorted
  const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const lower: Point[] = [], upper: Point[] = []
  for (const p of sorted) {
    while (lower.length > 1 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    while (upper.length > 1 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

export function boundsOf(points: readonly Point[]): Bounds {
  validatePoints(points)
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function rectanglePoints(bounds: Bounds): Point[] {
  const { x, y, width, height } = bounds
  if (![x, y, width, height, x + width, y + height].every(Number.isFinite) || width < 0 || height < 0) {
    throw new RangeError('Expected finite bounds with nonnegative dimensions.')
  }
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }]
}

/** Rounded padded card corners produce an elastic team surface as cards move. */
export function envelopeOfRects(rectangles: readonly Bounds[], padding = 24): Point[] {
  validateGap(padding)
  const cloud: Point[] = []
  for (const rectangle of rectangles) {
    for (const corner of rectanglePoints(rectangle)) {
      if (padding === 0) cloud.push(corner)
      else for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6
        cloud.push({ x: corner.x + Math.cos(angle) * padding, y: corner.y + Math.sin(angle) * padding })
      }
    }
  }
  return convexHull(cloud)
}

/** SVG quadratic joins soften the envelope without an animated physics solver. */
export function roundedHullPath(points: readonly Point[], radius = 12): string {
  validateGap(radius)
  const hull = convexHull(points)
  const fmt = (n: number) => Number(n.toFixed(2))
  const xy = (p: Point) => `${fmt(p.x)} ${fmt(p.y)}`
  if (!hull.length) return ''
  if (hull.length < 3) return `M ${hull.map(xy).join(' L ')} Z`
  const joins = hull.map((p, i) => {
    const previous = hull[(i + hull.length - 1) % hull.length], next = hull[(i + 1) % hull.length]
    const before = Math.hypot(previous.x - p.x, previous.y - p.y), after = Math.hypot(next.x - p.x, next.y - p.y)
    const cut = Math.min(radius, before * .32, after * .32)
    return {
      p,
      start: { x: p.x + (previous.x - p.x) * cut / before, y: p.y + (previous.y - p.y) * cut / before },
      end: { x: p.x + (next.x - p.x) * cut / after, y: p.y + (next.y - p.y) * cut / after },
    }
  })
  return `M ${xy(joins[0].start)}${joins.map((join, i) => `${i ? ` L ${xy(join.start)}` : ''} Q ${xy(join.p)} ${xy(join.end)}`).join('')} Z`
}

function validatePolygon(points: readonly Point[]): void {
  validatePoints(points)
  if (points.length < 3) throw new TypeError('Expected a convex polygon with at least three finite {x,y} points.')
}

function separatingAxes(a: readonly Point[], b: readonly Point[]): Point[] {
  const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }]
  for (const points of [a, b]) {
    for (let i = 0; i < points.length; i++) {
      const p = points[i], q = points[(i + 1) % points.length]
      const dx = q.x - p.x, dy = q.y - p.y, length = Math.hypot(dx, dy)
      if (length < 1e-9) continue
      let x = -dy / length, y = dx / length
      if (x < -1e-9 || (Math.abs(x) <= 1e-9 && y < 0)) { x = -x; y = -y }
      if (!axes.some(axis => Math.abs(axis.x * x + axis.y * y) > 1 - 1e-9)) axes.push({ x, y })
    }
  }
  return axes
}

function projection(points: readonly Point[], axis: Point): { min: number; max: number } {
  let min = Infinity, max = -Infinity
  for (const p of points) {
    const value = p.x * axis.x + p.y * axis.y
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  return { min, max }
}

/**
 * Minimum separating-axis displacement to move B clear of A, or null if clear.
 * The gap is measured along a separating axis. For containment, displacement
 * reaches the outside edge; merely using the intersection width leaves overlap.
 */
export function collisionOffset(aPoints: readonly Point[], bPoints: readonly Point[], gap = 20): Point | null {
  validatePolygon(aPoints)
  validatePolygon(bPoints)
  validateGap(gap)
  let best: Point | null = null, bestDistance = Infinity
  for (const axis of separatingAxes(aPoints, bPoints)) {
    const a = projection(aPoints, axis), b = projection(bPoints, axis)
    if (b.min - a.max >= gap - EPSILON || a.min - b.max >= gap - EPSILON) return null
    const negative = a.min - gap - b.max, positive = a.max + gap - b.min
    let distance: number
    if (Math.abs(negative) < positive - EPSILON) distance = negative
    else if (positive < Math.abs(negative) - EPSILON) distance = positive
    else distance = b.min + b.max >= a.min + a.max ? positive : negative
    if (Math.abs(distance) < bestDistance - EPSILON) {
      bestDistance = Math.abs(distance)
      best = { x: axis.x * distance, y: axis.y * distance }
    }
  }
  return best
}

/**
 * Move rigid convex groups, prioritizing fixedId then the stable input order.
 * Clear groups stay exactly where they are. The bounded nearest-first search
 * resolves chains; its right-side fallback guarantees termination in dense layouts.
 */
export function packPolygons(items: readonly PolygonItem[], fixedId?: string, gap = 20): Record<string, Point> {
  if (!Array.isArray(items)) throw new TypeError('Expected an array of polygon items.')
  validateGap(gap)
  const offsets: Record<string, Point> = Object.create(null), seenIds = new Set<string>()
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || seenIds.has(item.id)) throw new TypeError('Polygon ids must be unique strings.')
    validatePolygon(item.points)
    seenIds.add(item.id)
    offsets[item.id] = { x: 0, y: 0 }
  }
  const ordered = items.slice(), fixedIndex = ordered.findIndex(item => item.id === fixedId)
  if (fixedIndex > 0) ordered.unshift(ordered.splice(fixedIndex, 1)[0])
  const placed: { points: Point[]; bounds: Bounds }[] = []
  const move = (points: readonly Point[], offset: Point) => points.map(p => ({ x: p.x + offset.x, y: p.y + offset.y }))
  for (const item of ordered) {
    const sourceBounds = boundsOf(item.points)
    const queue: (Point & { cost: number; order: number })[] = [], visited = new Set<string>()
    let sequence = 0, accepted: Point | null = null
    const enqueue = (x: number, y: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      const key = `${Math.round(x * 1e5)},${Math.round(y * 1e5)}`
      if (visited.has(key)) return
      visited.add(key)
      queue.push({ x, y, cost: x * x + y * y, order: sequence++ })
    }
    enqueue(0, 0)
    for (let attempt = 0; attempt < 128 && queue.length; attempt++) {
      queue.sort((a, b) => a.cost - b.cost || a.order - b.order)
      const candidate = queue.shift()!, points = move(item.points, candidate)
      const blockers: { obstacle: typeof placed[number]; push: Point }[] = []
      for (const obstacle of placed) {
        const push = collisionOffset(obstacle.points, points, gap)
        if (push) blockers.push({ obstacle, push })
      }
      if (!blockers.length) { accepted = { x: candidate.x, y: candidate.y }; break }
      for (const { obstacle, push } of blockers) {
        enqueue(candidate.x + push.x, candidate.y + push.y)
        const b = obstacle.bounds
        // Other sides avoid oscillation between tightly packed neighbours.
        enqueue(b.x + b.width + gap - sourceBounds.x, candidate.y)
        enqueue(b.x - gap - sourceBounds.x - sourceBounds.width, candidate.y)
        enqueue(candidate.x, b.y + b.height + gap - sourceBounds.y)
        enqueue(candidate.x, b.y - gap - sourceBounds.y - sourceBounds.height)
      }
    }
    if (!accepted) {
      const right = placed.reduce((maximum, obstacle) => Math.max(maximum, obstacle.bounds.x + obstacle.bounds.width), -Infinity)
      accepted = { x: right + gap + 1e-6 - sourceBounds.x, y: 0 }
    }
    offsets[item.id] = accepted
    const points = move(item.points, accepted)
    placed.push({ points, bounds: boundsOf(points) })
  }
  return offsets
}
