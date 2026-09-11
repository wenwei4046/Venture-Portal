import { describe, expect, it } from 'vitest'
import {
  boundsOf, collisionOffset, convexHull, envelopeOfRects, packPolygons,
  rectanglePoints, roundedHullPath, type Bounds, type Point,
} from './hierarchy-spaces'

const rectangle = (x: number, y: number, width = 100, height = 100) => rectanglePoints({ x, y, width, height })
const translated = (points: readonly Point[], by: Point) => points.map(p => ({ x: p.x + by.x, y: p.y + by.y }))
const separatedBoxes = (a: Bounds, b: Bounds, gap: number) =>
  b.x - a.x - a.width >= gap - 1e-6 || a.x - b.x - b.width >= gap - 1e-6 ||
  b.y - a.y - a.height >= gap - 1e-6 || a.y - b.y - b.height >= gap - 1e-6

function encloses(hull: Point[], point: Point): boolean {
  return hull.every((a, i) => {
    const b = hull[(i + 1) % hull.length]
    return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) >= -1e-6
  })
}

describe('team envelopes', () => {
  it('encloses every card corner, with padding around the outside of the group', () => {
    const cards = [
      { x: -90, y: 80, width: 150, height: 90 },
      { x: 200, y: -70, width: 150, height: 90 },
      { x: 350, y: 210, width: 150, height: 90 },
    ]
    const hull = envelopeOfRects(cards, 24)
    for (const card of cards) for (const corner of rectanglePoints(card)) expect(encloses(hull, corner)).toBe(true)
    expect(boundsOf(hull)).toEqual({ x: -114, y: -94, width: 638, height: 418 })
    expect(hull.length).toBeGreaterThan(4)
    const expanded = envelopeOfRects([...cards, { x: 1000, y: 80, width: 150, height: 90 }], 24)
    expect(boundsOf(expanded).width).toBeGreaterThan(boundsOf(hull).width)
  })

  it('does not mutate input and handles duplicate, collinear and empty points', () => {
    const points = [{ x: 2, y: 2 }, { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]
    const before = JSON.stringify(points)
    expect(convexHull(points)).toEqual([{ x: 0, y: 0 }, { x: 2, y: 2 }])
    expect(JSON.stringify(points)).toBe(before)
    expect(boundsOf([])).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    expect(envelopeOfRects([])).toEqual([])
    expect(roundedHullPath([])).toBe('')
    expect(roundedHullPath(points)).not.toMatch(/NaN|Infinity/)
  })

  it('produces a closed, finite rounded path at sharp corners', () => {
    const points = [{ x: 0, y: 0 }, { x: .0001, y: 200 }, { x: 500, y: 0 }]
    const path = roundedHullPath(points, 100)
    expect(path.startsWith('M ')).toBe(true)
    expect(path.endsWith(' Z')).toBe(true)
    expect(path.match(/ Q /g)).toHaveLength(3)
    expect(path).not.toMatch(/NaN|Infinity/)
  })
})

describe('collisionOffset', () => {
  it('moves a fully contained team all the way outside its neighbour plus the gap', () => {
    const outer = rectangle(0, 0), inner = rectangle(40, 40, 20, 20)
    const offset = collisionOffset(outer, inner, 10)!
    expect(offset).toEqual({ x: 70, y: 0 })
    expect(separatedBoxes(boundsOf(outer), boundsOf(translated(inner, offset)), 10)).toBe(true)
    expect(collisionOffset(outer, translated(inner, offset), 10)).toBeNull()
  })

  it('uses actual team polygons instead of treating empty bounding-box corners as overlap', () => {
    const a = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }]
    const b = translated(a, { x: 80, y: 80 })
    expect(separatedBoxes(boundsOf(a), boundsOf(b), 0)).toBe(false)
    expect(collisionOffset(a, b, 20)).toBeNull()
    const overlapping = translated(a, { x: 40, y: 40 })
    const offset = collisionOffset(a, overlapping, 0)!
    expect(offset.x).toBeCloseTo(10)
    expect(offset.y).toBeCloseTo(10)
    expect(collisionOffset(a, translated(overlapping, offset), 0)).toBeNull()
  })

  it('leaves exactly spaced boundaries alone and adds only the missing clearance', () => {
    expect(collisionOffset(rectangle(0, 0), rectangle(120, 0), 20)).toBeNull()
    expect(collisionOffset(rectangle(0, 0), rectangle(110, 0), 20)).toEqual({ x: 10, y: 0 })
    expect(collisionOffset(rectangle(0, 0), rectangle(100, 0), 0)).toBeNull()
  })
})

describe('packPolygons', () => {
  it('resolves an overlapping chain around the dropped group using rigid translations', () => {
    const items = [0, 60, 120, 180].map((x, i) => ({ id: `team-${i}`, points: rectangle(x, 0) }))
    items.push({ id: 'clear', points: rectangle(4000, 4000) })
    const original = JSON.stringify(items)
    const offsets = packPolygons(items, 'team-2', 24)
    expect(offsets['team-2']).toEqual({ x: 0, y: 0 })
    expect(offsets.clear).toEqual({ x: 0, y: 0 })
    const placed = items.map(item => translated(item.points, offsets[item.id]))
    for (let i = 0; i < placed.length; i++) {
      expect(boundsOf(placed[i]).width).toBe(100)
      expect(boundsOf(placed[i]).height).toBe(100)
      for (let j = i + 1; j < placed.length; j++) expect(separatedBoxes(boundsOf(placed[i]), boundsOf(placed[j]), 24)).toBe(true)
    }
    expect(JSON.stringify(items)).toBe(original)
  })

  it('is deterministic and does not drift after a dense layout has already been separated', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      id: `group-${i}`, points: rectangle(i % 3 * 20, Math.floor(i / 3) * 12, 80 + i % 4 * 20, 60 + i % 5 * 15),
    }))
    const offsets = packPolygons(items, 'group-9', 18)
    expect(packPolygons(items, 'group-9', 18)).toEqual(offsets)
    expect(offsets['group-9']).toEqual({ x: 0, y: 0 })
    const placed = items.map(item => ({ id: item.id, points: translated(item.points, offsets[item.id]) }))
    for (let i = 0; i < placed.length; i++) {
      expect(Object.values(offsets[placed[i].id]).every(Number.isFinite)).toBe(true)
      for (let j = i + 1; j < placed.length; j++) {
        expect(separatedBoxes(boundsOf(placed[i].points), boundsOf(placed[j].points), 18)).toBe(true)
      }
    }
    for (const offset of Object.values(packPolygons(placed, 'group-9', 18))) expect(offset).toEqual({ x: 0, y: 0 })
  })

  it('supports safe arbitrary ids and refuses invalid geometry before searching', () => {
    expect(packPolygons([{ id: '__proto__', points: rectangle(0, 0) }])['__proto__']).toEqual({ x: 0, y: 0 })
    expect(packPolygons([])).toEqual({})
    expect(() => packPolygons([{ id: 'a', points: rectangle(0, 0) }, { id: 'a', points: rectangle(20, 20) }])).toThrow(/unique/)
    expect(() => collisionOffset([{ x: NaN, y: 0 }], rectangle(0, 0))).toThrow(/finite/)
    expect(() => collisionOffset(rectangle(0, 0), rectangle(0, 0), -1)).toThrow(/nonnegative/)
    expect(() => envelopeOfRects([{ x: 0, y: 0, width: -1, height: 10 }])).toThrow(/dimensions/)
  })
})
