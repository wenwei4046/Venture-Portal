import { describe, expect, it } from 'vitest'
import { annotationPoint, annotationSize, markedFileName, strokeAnnotation, textAnnotation } from './annotation'

describe('a screenshot’s marked copy', () => {
  it('bounds large exports, preserves aspect ratio, and never enlarges a small image', () => {
    expect(annotationSize(4000, 8000)).toEqual({ width: 1200, height: 2400 })
    expect(annotationSize(8000, 4000)).toEqual({ width: 2400, height: 1200 })
    expect(annotationSize(390, 844)).toEqual({ width: 390, height: 844 })
    expect(annotationSize(0, 100)).toBeNull()
    expect(annotationSize(Infinity, 100)).toBeNull()
  })

  it('puts touch marks at the same image position on a scaled phone preview, clamping outside drags', () => {
    const rect = { left: 20, top: 100, width: 300, height: 600 }
    const size = { width: 1200, height: 2400 }
    expect(annotationPoint(170, 250, rect, size)).toEqual({ x: 600, y: 600 })
    expect(annotationPoint(-20, 900, rect, size)).toEqual({ x: 0, y: 2400 })
  })

  it('ignores a tap but keeps a real stroke, including a pen path returning to its start', () => {
    expect(strokeAnnotation('circle', [{ x: 4, y: 4 }, { x: 5, y: 5 }])).toBeNull()
    expect(strokeAnnotation('arrow', [{ x: 4, y: 4 }])).toBeNull()
    const points = [{ x: 4, y: 4 }, { x: 40, y: 40 }, { x: 4, y: 4 }]
    expect(strokeAnnotation('pen', points)).toEqual({ kind: 'pen', points })
    const mark = strokeAnnotation('pen', points)
    points[0].x = 100
    expect(mark).toMatchObject({ points: [{ x: 4 }, { x: 40 }, { x: 4 }] })
  })

  it('keeps text literal and refuses empty labels', () => {
    expect(textAnnotation({ x: 1, y: 2 }, '  ')).toBeNull()
    expect(textAnnotation({ x: 1, y: 2 }, ' <button>Fix here</button> ')).toEqual({
      kind: 'text', at: { x: 1, y: 2 }, text: '<button>Fix here</button>',
    })
  })

  it('creates a separate PNG name without keeping the original extension or path', () => {
    expect(markedFileName('Screen.2026.jpg')).toBe('Screen.2026-marked.png')
    expect(markedFileName('C:\\shots\\screen.webp')).toBe('screen-marked.png')
    expect(markedFileName('')).toBe('screenshot-marked.png')
  })
})
