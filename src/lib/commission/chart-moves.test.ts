import { describe, it, expect } from 'vitest'
import {
  forbiddenTargets,
  moveRefusal,
  refusalLabel,
  refusalSentence,
  shelfIds,
  treeGroups,
  type MoveSubject,
} from './chart-moves'
import type { OrgNodeInput } from '@/lib/org-layout'

const subject = (over: Partial<MoveSubject> & { staffId: string }): MoveSubject => ({
  name: over.staffId.toUpperCase(),
  titleName: 'Team Leader',
  rankLabel: 'Rank A · 10%',
  placed: true,
  canRecruit: true,
  ...over,
})

// ANTHONY → HOWARD → ZACK, and LUIS placed under nobody.
const graph: OrgNodeInput[] = [
  { id: 'anthony', parentId: null, label: 'ANTHONY' },
  { id: 'howard', parentId: 'anthony', label: 'HOWARD' },
  { id: 'zack', parentId: 'howard', label: 'ZACK' },
  { id: 'luis', parentId: null, label: 'LUIS TEO' },
  { id: 'yuny', parentId: null, label: 'YUNY' },
]
const people: MoveSubject[] = [
  subject({ staffId: 'anthony' }),
  subject({ staffId: 'howard', titleName: 'Senior Revenue Specialist', rankLabel: 'Rank B · 8%' }),
  subject({ staffId: 'zack', titleName: 'Revenue Specialist', rankLabel: 'Rank C · 6%', canRecruit: false }),
  subject({ staffId: 'luis', titleName: 'Senior Revenue Specialist', rankLabel: 'Rank B · 8%' }),
  subject({ staffId: 'yuny', titleName: 'Team Assistant', rankLabel: null, placed: false, canRecruit: false }),
]

describe('moveRefusal', () => {
  const none = new Set<string>()

  it('lets somebody go under a placed title that may recruit', () => {
    expect(moveRefusal(people[3], people[0], none)).toBeNull()
  })

  it('refuses their own card first, whatever else is true', () => {
    expect(moveRefusal(people[0], people[0], none)).toBe('self')
  })

  it('refuses their own downline before anything about the target', () => {
    const downlines = new Set(['howard', 'zack'])
    expect(moveRefusal(people[0], people[1], downlines)).toBe('downline')
    // A downline who could not recruit anyway still reads as "their downline":
    // that is the reason that would survive promoting them.
    expect(moveRefusal(people[0], people[2], downlines)).toBe('downline')
  })

  it('refuses somebody with no position, then a title that may not recruit', () => {
    expect(moveRefusal(people[3], people[4], none)).toBe('not-placed')
    expect(moveRefusal(people[3], people[2], none)).toBe('no-downlines')
  })
})

describe('forbiddenTargets', () => {
  it('greys the mover, their commission downlines, the unplaced and the non-recruiters', () => {
    const out = forbiddenTargets(graph, people, 'anthony')
    expect(out.get('anthony')).toBe('self')
    expect(out.get('howard')).toBe('downline')
    expect(out.get('zack')).toBe('downline')
    expect(out.get('yuny')).toBe('not-placed')
    expect(out.has('luis')).toBe(false)
  })

  it('does not treat a borrowed reporting line as a downline', () => {
    // YUNY is drawn under ANTHONY on the reporting line, but the commission
    // graph knows nothing of it — so ANTHONY may still be dropped elsewhere
    // freely, and YUNY is greyed for being unplaced, not for being a downline.
    const out = forbiddenTargets(graph, people, 'anthony')
    expect(out.get('yuny')).toBe('not-placed')
  })

  it('is empty for somebody who is not on the chart', () => {
    expect(forbiddenTargets(graph, people, 'ghost').size).toBe(0)
  })
})

describe('refusal copy', () => {
  it('captions each kind in two words', () => {
    expect(refusalLabel('self')).toBe('that is them')
    expect(refusalLabel('downline')).toBe('their downline')
    expect(refusalLabel('not-placed')).toBe('not placed')
    expect(refusalLabel('no-downlines')).toBe('no downlines')
  })

  it('names the title when the target holds one, else the rank', () => {
    expect(refusalSentence('no-downlines', people[3], people[2])).toBe(
      'ZACK is a Revenue Specialist — that title cannot hold downlines.',
    )
    const untitled = subject({ staffId: 'zack', titleName: null, rankLabel: 'Rank C · 6%', canRecruit: false })
    expect(refusalSentence('no-downlines', people[3], untitled)).toBe(
      'ZACK is a Rank C · 6% — that rank cannot hold downlines.',
    )
    expect(refusalSentence('downline', people[0], people[1])).toBe(
      'That would put ANTHONY under their own downline.',
    )
    expect(refusalSentence('not-placed', people[3], people[4])).toBe(
      'YUNY holds no position yet — place them first.',
    )
  })
})

describe('shelfIds', () => {
  it('shelves the unplaced who stand under nobody with nobody under them', () => {
    const out = shelfIds([
      { staffId: 'anthony', placed: true, layoutParentId: null },
      { staffId: 'yuny', placed: false, layoutParentId: 'anthony' },
      { staffId: 'mei', placed: false, layoutParentId: null },
    ])
    expect([...out]).toEqual(['mei'])
  })

  it('keeps a placed leader with an empty team where the trees are', () => {
    const out = shelfIds([{ staffId: 'lawrence', placed: true, layoutParentId: null }])
    expect(out.size).toBe(0)
  })

  it('keeps an unplaced manager who has somebody drawn under them', () => {
    const out = shelfIds([
      { staffId: 'boss', placed: false, layoutParentId: null },
      { staffId: 'report', placed: false, layoutParentId: 'boss' },
    ])
    expect(out.size).toBe(0)
  })
})

describe('treeGroups', () => {
  it('lists each tree root first, depth-first, siblings by name', () => {
    const groups = treeGroups([
      { id: 'a', parentId: null, label: 'ANTHONY' },
      { id: 'z', parentId: 'a', label: 'ZACK' },
      { id: 'h', parentId: 'a', label: 'HOWARD' },
      { id: 'k', parentId: 'h', label: 'KAR JUN' },
      { id: 'c', parentId: null, label: 'CHEA HUAN' },
    ])
    expect(groups.map(g => g.rootId)).toEqual(['a', 'c'])
    expect(groups[0].members).toEqual([
      { id: 'a', depth: 0 },
      { id: 'h', depth: 1 },
      { id: 'k', depth: 2 },
      { id: 'z', depth: 1 },
    ])
  })

  it('makes a root of somebody whose parent is not on the chart, and cuts a loop', () => {
    const groups = treeGroups([
      { id: 'x', parentId: 'gone', label: 'X' },
      { id: 'p', parentId: 'q', label: 'P' },
      { id: 'q', parentId: 'p', label: 'Q' },
    ])
    const ids = groups.flatMap(g => g.members.map(m => m.id)).sort()
    expect(ids).toEqual(['p', 'q', 'x'])
    expect(groups.find(g => g.rootId === 'x')).toBeTruthy()
  })
})
