import { describe, expect, it } from 'vitest'
import { placeMenu } from './Menu'

// A card's menu opened by a right-click (2026-10-14): where the pointer was, kept inside the window.
describe('placeMenu', () => {
  const view = { width: 1000, height: 700 }
  const size = { width: 220, height: 300 }

  it('opens at the pointer when it fits', () => {
    expect(placeMenu({ x: 100, y: 120 }, size, view)).toEqual({ left: 100, top: 120 })
  })

  it('moves left of the window’s edge, and above the pointer near the foot', () => {
    expect(placeMenu({ x: 950, y: 500 }, size, view)).toEqual({ left: 1000 - 220 - 8, top: 200 })
  })

  it('never off the top or the left', () => {
    expect(placeMenu({ x: -20, y: 650 }, { width: 220, height: 900 }, view)).toEqual({ left: 8, top: 8 })
  })
})
