import { describe, it, expect } from 'vitest'
import {
  enrolPlan,
  forbiddenTargets,
  moveRefusal,
  refusalLabel,
  refusalSentence,
  sameSteps,
  shelfIds,
  treeGroups,
  type EnrolPlan,
  type MoveSubject,
} from './chart-moves'
import type { OrgNodeInput } from '@/lib/org-layout'

const subject = (over: Partial<MoveSubject> & { staffId: string }): MoveSubject => ({
  name: over.staffId.toUpperCase(),
  titleName: 'Team Leader',
  rankLabel: 'Rank A · 10%',
  placed: true,
  canRecruit: true,
  reportsTo: null,
  ...over,
})

// ANTHONY → HOWARD → ZACK, and LUIS placed under nobody.
const graph: OrgNodeInput[] = [
  { id: 'anthony', parentId: null, label: 'ANTHONY' },
  { id: 'howard', parentId: 'anthony', label: 'HOWARD' },
  { id: 'zack', parentId: 'howard', label: 'ZACK' },
  { id: 'luis', parentId: null, label: 'LUIS TEO' },
  { id: 'yuny', parentId: null, label: 'YUNY' },
  { id: 'chea', parentId: null, label: 'CHEA HUAN' },
  { id: 'kj', parentId: null, label: 'KAR JUN' },
]
const people: MoveSubject[] = [
  subject({ staffId: 'anthony' }),
  subject({ staffId: 'howard', titleName: 'Senior Revenue Specialist', rankLabel: 'Rank B · 8%' }),
  subject({ staffId: 'zack', titleName: 'Revenue Specialist', rankLabel: 'Rank C · 6%', canRecruit: false }),
  subject({ staffId: 'luis', titleName: 'Senior Revenue Specialist', rankLabel: 'Rank B · 8%' }),
  subject({ staffId: 'yuny', titleName: 'Team Assistant', rankLabel: null, placed: false, canRecruit: false }),
  // A leader with no position yet, and a report of theirs with none either.
  subject({ staffId: 'chea', name: 'CHEA HUAN', rankLabel: null, placed: false }),
  subject({
    staffId: 'kj',
    name: 'KAR JUN',
    titleName: 'Senior Revenue Specialist',
    rankLabel: null,
    placed: false,
    reportsTo: 'chea',
  }),
]
const none = new Set<string>()
const direct: EnrolPlan = { steps: [], blocked: null }
const planFor = (id: string) => enrolPlan(people, id)

describe('enrolPlan', () => {
  it('has nothing to do for somebody who holds a position', () => {
    expect(planFor('anthony')).toEqual({ steps: [], blocked: null })
  })

  it('puts an unplaced leader who reports to nobody at the top of their own tree', () => {
    expect(planFor('chea')).toEqual({ steps: [{ staffId: 'chea', uplineStaffId: null }], blocked: null })
  })

  it('follows the reporting line up, top-down, until it ends', () => {
    expect(planFor('kj')).toEqual({
      steps: [
        { staffId: 'chea', uplineStaffId: null },
        { staffId: 'kj', uplineStaffId: 'chea' },
      ],
      blocked: null,
    })
  })

  it('hangs the line from the first placed manager it meets', () => {
    const roster = [...people, subject({ staffId: 'mei', rankLabel: null, placed: false, reportsTo: 'howard' })]
    expect(enrolPlan(roster, 'mei')).toEqual({
      steps: [{ staffId: 'mei', uplineStaffId: 'howard' }],
      blocked: null,
    })
  })

  it('is blocked by an ancestor whose title may not hold downlines — the placed one included', () => {
    const roster = [
      ...people,
      subject({ staffId: 'mei', rankLabel: null, placed: false, reportsTo: 'zack' }),
      subject({ staffId: 'raj', rankLabel: null, placed: false, reportsTo: 'sam' }),
      subject({ staffId: 'sam', rankLabel: null, placed: false, canRecruit: false, reportsTo: null }),
    ]
    expect(enrolPlan(roster, 'mei')).toEqual({
      steps: [],
      blocked: 'MEI reports up to ZACK, whose title cannot hold downlines',
    })
    expect(enrolPlan(roster, 'raj')).toEqual({
      steps: [],
      blocked: 'RAJ reports up to SAM, whose title cannot hold downlines',
    })
    // The target's OWN title is not this plan's business: `moveRefusal` says
    // "no downlines" for them, in their own caption.
    expect(enrolPlan(roster, 'sam').blocked).toBeNull()
  })

  it('is blocked by a line that leaves the chart, or loops', () => {
    const roster = [
      ...people,
      subject({ staffId: 'out', rankLabel: null, placed: false, reportsTo: 'somebody-elsewhere' }),
      subject({ staffId: 'p', rankLabel: null, placed: false, reportsTo: 'q' }),
      subject({ staffId: 'q', rankLabel: null, placed: false, reportsTo: 'p' }),
    ]
    expect(enrolPlan(roster, 'out').blocked).toBe('OUT reports to somebody who is not on this chart')
    expect(enrolPlan(roster, 'p').blocked).toBe('P’s reporting line loops back on itself')
  })

  it('is empty for somebody who is not on the chart', () => {
    expect(planFor('ghost')).toEqual({ steps: [], blocked: null })
  })
})

describe('sameSteps', () => {
  it('compares people, uplines and order', () => {
    const a = planFor('kj').steps
    expect(sameSteps(a, [...a])).toBe(true)
    expect(sameSteps(a, [...a].reverse())).toBe(false)
    expect(sameSteps(a, a.slice(1))).toBe(false)
    expect(sameSteps(a, [a[0], { ...a[1], uplineStaffId: null }])).toBe(false)
  })
})

describe('moveRefusal', () => {
  it('lets somebody go under a placed title that may recruit', () => {
    expect(moveRefusal(people[3], people[0], none, direct)).toBeNull()
  })

  it('lets somebody go under an unplaced title that may recruit — the plan places them first', () => {
    expect(moveRefusal(people[3], people[5], none, planFor('chea'))).toBeNull()
    expect(moveRefusal(people[3], people[6], none, planFor('kj'))).toBeNull()
  })

  it('refuses their own card first, whatever else is true', () => {
    expect(moveRefusal(people[0], people[0], none, direct)).toBe('self')
  })

  it('refuses their own downline before anything about the target', () => {
    const downlines = new Set(['howard', 'zack'])
    expect(moveRefusal(people[0], people[1], downlines, direct)).toBe('downline')
    // A downline who could not recruit anyway still reads as "their downline":
    // that is the reason that would survive promoting them.
    expect(moveRefusal(people[0], people[2], downlines, direct)).toBe('downline')
  })

  it('refuses a line that runs through the mover, or hangs from somebody below them', () => {
    // CHEA HUAN under KAR JUN: KAR JUN’s line is CHEA HUAN → KAR JUN.
    expect(moveRefusal(people[5], people[6], none, planFor('kj'))).toBe('downline')
    // ANTHONY under MEI, who reports to HOWARD, who is ANTHONY’s downline.
    const mei = subject({ staffId: 'mei', rankLabel: null, placed: false, reportsTo: 'howard' })
    const plan = enrolPlan([...people, mei], 'mei')
    expect(moveRefusal(people[0], mei, new Set(['howard', 'zack']), plan)).toBe('downline')
    // HOWARD under MEI directly: the line hangs from HOWARD himself.
    expect(moveRefusal(people[1], mei, none, plan)).toBe('downline')
  })

  it('refuses a title that may not recruit before saying anything about placement', () => {
    expect(moveRefusal(people[3], people[2], none, direct)).toBe('no-downlines')
    // YUNY holds no position AND may not recruit: placing them would change
    // nothing, so the title is the reason given.
    expect(moveRefusal(people[3], people[4], none, planFor('yuny'))).toBe('no-downlines')
  })

  it('refuses somebody with no position only when no plan can place them', () => {
    const blocked: EnrolPlan = { steps: [], blocked: 'CHEA HUAN reports to somebody who is not on this chart' }
    expect(moveRefusal(people[3], people[5], none, blocked)).toBe('not-placed')
  })
})

describe('forbiddenTargets', () => {
  it('greys the mover, their commission downlines, the non-recruiters and the unplaceable', () => {
    const out = forbiddenTargets(graph, people, 'anthony')
    expect(out.get('anthony')).toBe('self')
    expect(out.get('howard')).toBe('downline')
    expect(out.get('zack')).toBe('downline')
    expect(out.get('yuny')).toBe('no-downlines')
    expect(out.has('luis')).toBe(false)
    // Unplaced, but their line can be placed: not greyed.
    expect(out.has('chea')).toBe(false)
    expect(out.has('kj')).toBe(false)
  })

  it('does not treat a borrowed reporting line as a downline', () => {
    // KAR JUN is drawn under CHEA HUAN on the reporting line, but the
    // commission graph knows nothing of it — so CHEA HUAN may still be
    // dropped elsewhere freely, and only KAR JUN is refused, for the loop
    // their own line would close.
    const out = forbiddenTargets(graph, people, 'chea')
    expect(out.get('kj')).toBe('downline')
    expect(out.has('anthony')).toBe(false)
    expect(out.has('luis')).toBe(false)
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

  it('says why a plan could not be built, when it could not', () => {
    expect(
      refusalSentence('not-placed', people[3], people[5], 'CHEA HUAN reports to somebody who is not on this chart'),
    ).toBe(
      'CHEA HUAN holds no position yet and cannot be placed from here — CHEA HUAN reports to somebody who is not on this chart. Place them first.',
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
