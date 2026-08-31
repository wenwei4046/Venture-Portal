import { describe, it, expect } from 'vitest'
import { descendantsOf, layoutTree, wouldCycle, NODE_WIDTH } from './org-layout'
import type { OrgNodeInput } from './org-layout'

const n = (id: string, parentId: string | null, label = id): OrgNodeInput => ({ id, parentId, label })

describe('layoutTree', () => {
  it('puts a parent above the centre of its children', () => {
    const { positions } = layoutTree([n('top', null), n('a', 'top'), n('b', 'top')])
    const a = positions.get('a')!
    const b = positions.get('b')!
    const top = positions.get('top')!
    expect(top.x).toBe((a.x + b.x) / 2)
    expect(top.y).toBeLessThan(a.y)
    expect(a.depth).toBe(1)
  })

  it('spaces siblings a node width apart, left to right by name', () => {
    const { positions } = layoutTree([n('top', null), n('z', 'top', 'Zed'), n('a', 'top', 'Ann')])
    expect(positions.get('a')!.x).toBe(0)
    expect(positions.get('z')!.x).toBeGreaterThanOrEqual(NODE_WIDTH)
  })

  it('stacks three levels by depth', () => {
    const { positions } = layoutTree([n('stl', null), n('tl', 'stl'), n('rs', 'tl')])
    expect(positions.get('stl')!.depth).toBe(0)
    expect(positions.get('tl')!.depth).toBe(1)
    expect(positions.get('rs')!.depth).toBe(2)
  })

  it('lays out several trees side by side', () => {
    const { roots, positions } = layoutTree([n('r1', null), n('r2', null), n('c', 'r1')])
    expect(roots).toHaveLength(2)
    expect(positions.size).toBe(3)
  })

  it('places somebody whose upline is missing rather than dropping them', () => {
    const { positions, detached } = layoutTree([n('orphan', 'ghost')])
    expect(positions.has('orphan')).toBe(true)
    expect(detached).toContain('orphan')
  })

  it('survives a cycle and reports it', () => {
    const { positions, detached } = layoutTree([n('a', 'b'), n('b', 'a')])
    expect(positions.size).toBe(2)
    expect(detached.length).toBeGreaterThan(0)
  })

  it('reports a canvas size that covers every node', () => {
    const { width, height, positions } = layoutTree([n('top', null), n('a', 'top'), n('b', 'top')])
    for (const p of positions.values()) {
      expect(p.x + NODE_WIDTH).toBeLessThanOrEqual(width)
      expect(p.y).toBeLessThan(height)
    }
  })
})

describe('wouldCycle', () => {
  const tree = [n('stl', null), n('tl', 'stl'), n('rs', 'tl')]

  it('refuses a self-parent', () => {
    expect(wouldCycle(tree, 'tl', 'tl')).toBe(true)
  })

  it('refuses putting a manager under their own downline', () => {
    expect(wouldCycle(tree, 'stl', 'rs')).toBe(true)
  })

  it('allows a legitimate move', () => {
    expect(wouldCycle(tree, 'rs', 'stl')).toBe(false)
  })

  it('allows detaching to the top', () => {
    expect(wouldCycle(tree, 'rs', null)).toBe(false)
  })
})

describe('descendantsOf', () => {
  it('collects the whole subtree', () => {
    const tree = [n('stl', null), n('tl', 'stl'), n('ta', 'tl'), n('rs', 'ta'), n('other', null)]
    expect([...descendantsOf(tree, 'stl')].sort()).toEqual(['rs', 'ta', 'tl'])
    expect([...descendantsOf(tree, 'rs')]).toEqual([])
  })
})
