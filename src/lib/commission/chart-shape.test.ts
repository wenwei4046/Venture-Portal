import { describe, it, expect } from 'vitest'
import { layoutParent, isBorrowed, type ChartPlacement } from './chart-shape'

function person(over: Partial<ChartPlacement> = {}): ChartPlacement {
  return { uplineStaffId: null, rankId: null, reportsTo: null, ...over }
}

describe('layoutParent', () => {
  it('uses the commission upline when there is one', () => {
    expect(layoutParent(person({ uplineStaffId: 'u1', rankId: 'r1', reportsTo: 'm1' }))).toBe('u1')
  })

  it('prefers the commission upline over the reporting line when they differ', () => {
    // The whole point of the second graph: earning under one person while
    // reporting to another is legal, and the chart must draw the money.
    expect(layoutParent(person({ uplineStaffId: 'u1', rankId: 'r1', reportsTo: 'm2' }))).toBe('u1')
  })

  it('borrows the reporting line for somebody holding no position', () => {
    expect(layoutParent(person({ reportsTo: 'm1' }))).toBe('m1')
  })

  it('leaves a PLACED person at the top when their upline is null', () => {
    // A position with no upline is somebody deliberately at the top of their
    // tree. Borrowing here would invent a manager the money does not know.
    expect(layoutParent(person({ rankId: 'r1', reportsTo: 'm1' }))).toBeNull()
  })

  it('returns null for somebody unplaced who reports to nobody', () => {
    expect(layoutParent(person())).toBeNull()
  })
})

describe('isBorrowed', () => {
  it('is true only when the line came from the company chart', () => {
    expect(isBorrowed(person({ reportsTo: 'm1' }))).toBe(true)
  })

  it('is false for a placed person, even one whose upline is their manager', () => {
    expect(isBorrowed(person({ uplineStaffId: 'm1', rankId: 'r1', reportsTo: 'm1' }))).toBe(false)
  })

  it('is false for a placed person sitting at the top of their tree', () => {
    expect(isBorrowed(person({ rankId: 'r1', reportsTo: 'm1' }))).toBe(false)
  })

  it('is false when there is no reporting line to borrow', () => {
    expect(isBorrowed(person())).toBe(false)
  })

  it('agrees with layoutParent about which line was used', () => {
    // The dashed edge is drawn from one of these and positioned by the other,
    // so a disagreement paints a line between two cards that are not there.
    const cases: ChartPlacement[] = [
      person({ reportsTo: 'm1' }),
      person({ uplineStaffId: 'u1', rankId: 'r1', reportsTo: 'm2' }),
      person({ uplineStaffId: 'm1', rankId: 'r1', reportsTo: 'm1' }),
      person({ rankId: 'r1', reportsTo: 'm1' }),
      person(),
    ]
    for (const p of cases) {
      if (isBorrowed(p)) {
        expect(layoutParent(p)).toBe(p.reportsTo)
      } else {
        // Not borrowed means the answer came from the commission side alone:
        // their upline, or null. Never the reporting line on its own account.
        expect(layoutParent(p)).toBe(p.uplineStaffId)
      }
    }
  })
})
