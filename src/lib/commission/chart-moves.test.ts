import { describe, it, expect } from 'vitest'
import {
  forbiddenTargets,
  effectiveDirectLineLimit,
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
  canRecruit: true,
  levelRank: 5,
  levelName: 'Manager',
  ...over,
})

// ANTHONY → HOWARD → ZACK, LUIS under nobody, YUNY under nobody.
const graph: OrgNodeInput[] = [
  { id: 'anthony', parentId: null, label: 'ANTHONY' },
  { id: 'howard', parentId: 'anthony', label: 'HOWARD' },
  { id: 'zack', parentId: 'howard', label: 'ZACK' },
  { id: 'luis', parentId: null, label: 'LUIS TEO' },
  { id: 'yuny', parentId: null, label: 'YUNY' },
]
const people: MoveSubject[] = [
  subject({ staffId: 'anthony' }),
  subject({ staffId: 'howard', titleName: 'Senior Revenue Specialist', levelRank: 3, levelName: 'Senior Executive' }),
  subject({ staffId: 'zack', titleName: 'Revenue Specialist', canRecruit: false, levelRank: 2, levelName: 'Executive' }),
  subject({ staffId: 'luis', titleName: 'Senior Revenue Specialist', levelRank: 3, levelName: 'Senior Executive' }),
  subject({ staffId: 'yuny', titleName: null, canRecruit: false, levelRank: null, levelName: null }),
]
const none = new Set<string>()

describe('moveRefusal', () => {
  it('lets somebody go under a title that may recruit and stands at or above theirs', () => {
    expect(moveRefusal(people[3], people[0], none)).toBeNull()
    // Same level is fine: a senior can lead other seniors.
    expect(moveRefusal(people[3], people[1], none)).toBeNull()
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

  it('refuses a title configured not to recruit on this ladder', () => {
    expect(moveRefusal(people[3], people[2], none)).toBe('no-downlines')
    expect(moveRefusal(people[3], people[4], none)).toBe('no-downlines')
  })

  it('refuses a title the ladder ranks below the mover’s', () => {
    // ANTHONY (Manager) under HOWARD (Senior Executive).
    expect(moveRefusal(people[0], people[1], none)).toBe('lower-title')
  })

  it('refuses a fourth direct until the server permits opening it this month', () => {
    const mover = subject({ staffId: 'new', uplineStaffId: null })
    const target = subject({ staffId: 'leader', directLineCount: 3, directLineLimit: effectiveDirectLineLimit(3, null) })
    expect(moveRefusal(mover, target, none)).toBe('direct-limit')
    const expanded = { ...target, directLineLimit: effectiveDirectLineLimit(3, 4) }
    expect(moveRefusal(mover, expanded, none)).toBeNull()
    expect(moveRefusal(mover, { ...expanded, directLineCount: 4 }, none)).toBe('direct-limit')
    expect(refusalSentence('direct-limit', mover, target))
      .toBe('LEADER has reached the limit of 3 direct lines.')
  })

  it.each([4, 5, 6])('allows the next direct only within the current server limit of %i', currentLimit => {
    const mover = subject({ staffId: 'new', uplineStaffId: null })
    const target = subject({
      staffId: 'leader',
      directLineCount: currentLimit - 1,
      directLineLimit: effectiveDirectLineLimit(3, currentLimit),
    })
    expect(target.directLineLimit).toBe(currentLimit)
    expect(moveRefusal(mover, target, none)).toBeNull()
    expect(moveRefusal(mover, { ...target, directLineCount: currentLimit }, none)).toBe('direct-limit')
  })

  it('uses the scheme base when no current server limit was supplied and never lowers a larger base', () => {
    expect(effectiveDirectLineLimit(3, undefined)).toBe(3)
    expect(effectiveDirectLineLimit(3, null)).toBe(3)
    expect(effectiveDirectLineLimit(6, 4)).toBe(6)
  })

  it('keeps existing direct lines legal when the parent is full', () => {
    const mover = subject({ staffId: 'existing', uplineStaffId: 'leader' })
    const target = subject({ staffId: 'leader', directLineCount: 3, directLineLimit: 3 })
    expect(moveRefusal(mover, target, none)).toBeNull()
  })

  it('keeps uncapped schemes unlimited with or without a current server limit', () => {
    for (const currentLimit of [undefined, null, 4, 5, 6]) {
      expect(effectiveDirectLineLimit(null, currentLimit)).toBeNull()
      expect(effectiveDirectLineLimit(undefined, currentLimit)).toBeNull()
      expect(moveRefusal(people[3], { ...people[0], directLineCount: 20, directLineLimit: effectiveDirectLineLimit(null, currentLimit) }, none)).toBeNull()
    }
  })
})

describe('forbiddenTargets', () => {
  it('greys the mover, their downlines, the non-recruiters and the lower titles', () => {
    const out = forbiddenTargets(graph, people, 'anthony')
    expect(out.get('anthony')).toBe('self')
    expect(out.get('howard')).toBe('downline')
    expect(out.get('zack')).toBe('downline')
    expect(out.get('yuny')).toBe('no-downlines')
    expect(out.get('luis')).toBe('lower-title')
  })

  it('offers a senior every leader and senior, and nobody below', () => {
    const out = forbiddenTargets(graph, people, 'luis')
    expect(out.has('anthony')).toBe(false)
    expect(out.has('howard')).toBe(false)
    expect(out.get('zack')).toBe('no-downlines')
  })

  it('is empty for somebody who is not on the chart', () => {
    expect(forbiddenTargets(graph, people, 'ghost').size).toBe(0)
  })

  it('uses the same capacity refusal for the drag target and picker lists', () => {
    const capped = people.map(p => p.staffId === 'anthony'
      ? { ...p, directLineLimit: 3, directLineCount: 3 } : p)
    expect(forbiddenTargets(graph, capped, 'luis').get('anthony')).toBe('direct-limit')
    expect(refusalLabel('direct-limit')).toBe('direct lines full')
  })
})

describe('refusal copy', () => {
  it('captions each kind in two words', () => {
    expect(refusalLabel('self')).toBe('that is them')
    expect(refusalLabel('downline')).toBe('their downline')
    expect(refusalLabel('no-downlines')).toBe('no downlines')
    expect(refusalLabel('lower-title')).toBe('lower title')
  })

  it('names the title, or says there is none', () => {
    expect(refusalSentence('no-downlines', people[3], people[2])).toBe(
      'ZACK is a Revenue Specialist — that title cannot hold downlines.',
    )
    expect(refusalSentence('no-downlines', people[3], people[4])).toBe(
      'YUNY holds no title on the commission ladder — nobody can earn under them.',
    )
    expect(refusalSentence('downline', people[0], people[1])).toBe(
      'That would put ANTHONY under their own downline.',
    )
    expect(refusalSentence('lower-title', people[0], people[1])).toBe(
      'ANTHONY cannot report to HOWARD: Team Leader (Manager) stands above Senior Revenue Specialist (Senior Executive) on the ladder',
    )
  })
})

describe('shelfIds', () => {
  it('shelves those on no line whose title cannot lead', () => {
    const out = shelfIds([
      { staffId: 'anthony', parentId: null, canRecruit: true },
      { staffId: 'yuny', parentId: 'anthony', canRecruit: false },
      { staffId: 'mei', parentId: null, canRecruit: false },
    ])
    expect([...out]).toEqual(['mei'])
  })

  it('keeps a leader with an empty team where the trees are', () => {
    const out = shelfIds([{ staffId: 'lawrence', parentId: null, canRecruit: true }])
    expect(out.size).toBe(0)
  })

  it('keeps somebody who has a report, whatever their title says', () => {
    const out = shelfIds([
      { staffId: 'boss', parentId: null, canRecruit: false },
      { staffId: 'report', parentId: 'boss', canRecruit: false },
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
