import { describe, it, expect } from 'vitest'
import {
  compareByLadder,
  ladderAllows,
  ladderBreaks,
  ladderRefusal,
  nextRung,
  rungOf,
  type LadderTitle,
  type Rung,
} from './ladder'

const rungs: Rung[] = [
  { id: 'L1', rank: 1, name: 'Assistant' },
  { id: 'L2', rank: 2, name: 'Executive' },
  { id: 'L3', rank: 3, name: 'Senior Executive' },
  { id: 'L4', rank: 4, name: 'Assistant Manager' },
  { id: 'L5', rank: 5, name: 'Manager' },
]

const t = (id: string, name: string, departmentId: string | null, levelId: string | null): LadderTitle => ({
  id,
  name,
  departmentId,
  levelId,
})

// Finance climbs 1 → 2 → 3 → 4; Marketing has three Executives and skips 3.
const titles: LadderTitle[] = [
  t('acc-asst', 'ACCOUNTS ASSISTANT', 'fin', 'L1'),
  t('acc-exec', 'ACCOUNTS EXECUTIVE', 'fin', 'L2'),
  t('sr-acc-exec', 'SENIOR ACCOUNT EXECUTIVE', 'fin', 'L3'),
  t('afm', 'ASSISTANT FINANCE MANAGER', 'fin', 'L4'),
  t('telemarketer', 'TELEMARKETER', 'mkt', 'L1'),
  t('graphic', 'GRAPHIC DESIGNER', 'mkt', 'L2'),
  t('content', 'CONTENT CREATOR', 'mkt', 'L2'),
  t('video', 'VIDEOGRAPHER & VIDEO EDITOR', 'mkt', 'L2'),
  t('amm', 'ASSISTANT MARKETING MANAGER', 'mkt', 'L4'),
  t('mm', 'MARKETING MANAGER', 'mkt', 'L5'),
  t('it-exec', 'IT DEVELOPER EXECUTIVE', 'it', null),
  t('pa', 'PERSONAL ASSISTANT', null, 'L1'),
  t('pa-sr', 'SENIOR PERSONAL ASSISTANT', null, 'L3'),
]

describe('rungOf', () => {
  it('finds the rung a title stands on', () => {
    expect(rungOf(titles[1], rungs)?.name).toBe('Executive')
  })

  it('is null for an unplaced title, a missing title and an unknown rung', () => {
    expect(rungOf(t('x', 'X', 'fin', null), rungs)).toBeNull()
    expect(rungOf(null, rungs)).toBeNull()
    expect(rungOf(t('x', 'X', 'fin', 'L9'), rungs)).toBeNull()
  })
})

describe('nextRung', () => {
  it('offers the one title on the rung above, in the same department', () => {
    const next = nextRung(titles, rungs, 'acc-asst')
    expect(next?.rung.name).toBe('Executive')
    expect(next?.titles.map(x => x.name)).toEqual(['ACCOUNTS EXECUTIVE'])
  })

  it('offers every title on that rung, A→Z, when there are several', () => {
    const next = nextRung(titles, rungs, 'telemarketer')
    expect(next?.rung.rank).toBe(2)
    expect(next?.titles.map(x => x.name)).toEqual([
      'CONTENT CREATOR',
      'GRAPHIC DESIGNER',
      'VIDEOGRAPHER & VIDEO EDITOR',
    ])
  })

  it('skips a rung the department has nothing on', () => {
    // Marketing has no Senior Executive: an Executive climbs to Assistant Manager.
    const next = nextRung(titles, rungs, 'graphic')
    expect(next?.rung.name).toBe('Assistant Manager')
    expect(next?.titles.map(x => x.id)).toEqual(['amm'])
  })

  it('never crosses into another department', () => {
    // Finance's Assistant Manager has nothing above it in Finance, even though
    // Marketing has a Manager.
    expect(nextRung(titles, rungs, 'afm')).toBeNull()
  })

  it('treats "no department" as a department of its own', () => {
    expect(nextRung(titles, rungs, 'pa')?.titles.map(x => x.id)).toEqual(['pa-sr'])
  })

  it('has nothing to say for an unplaced or unknown title', () => {
    expect(nextRung(titles, rungs, 'it-exec')).toBeNull()
    expect(nextRung(titles, rungs, 'nobody')).toBeNull()
  })
})

describe('ladderAllows', () => {
  it('lets anybody report to somebody higher', () => {
    expect(ladderAllows(1, 5)).toBe(true)
  })

  it('lets equals report to each other', () => {
    expect(ladderAllows(3, 3)).toBe(true)
  })

  it('refuses a manager who stands lower', () => {
    expect(ladderAllows(5, 2)).toBe(false)
  })

  it('stays out of it when either side is not on the ladder', () => {
    expect(ladderAllows(null, 2)).toBe(true)
    expect(ladderAllows(5, null)).toBe(true)
    expect(ladderAllows(null, null)).toBe(true)
  })
})

describe('ladderRefusal', () => {
  it('reads the way the database trigger does', () => {
    const msg = ladderRefusal(
      { name: 'TAMMY KHOO KHIM LING', title: 'HR MANAGER', level: 'Manager' },
      { name: 'BOON YEW FENG', title: 'GRAPHIC DESIGNER', level: 'Executive' },
    )
    expect(msg).toBe(
      'TAMMY KHOO KHIM LING cannot report to BOON YEW FENG: HR MANAGER (Manager) stands above GRAPHIC DESIGNER (Executive) on the ladder',
    )
  })
})

describe('ladderBreaks', () => {
  const people = [
    { id: 'tammy', reportsTo: 'boon', rank: 5 }, // manager below her
    { id: 'boon', reportsTo: 'chew', rank: 2 }, // fine
    { id: 'chew', reportsTo: null, rank: 4 },
    { id: 'tan', reportsTo: 'boon', rank: null }, // unplaced: no rule
    { id: 'siti', reportsTo: 'low', rank: 2 }, // equal: fine
    { id: 'low', reportsTo: 'ghost', rank: 2 }, // manager not on the chart
  ]

  it('names the lines whose manager stands lower', () => {
    expect(ladderBreaks(people)).toEqual([{ id: 'tammy', managerId: 'boon' }])
  })

  it('is empty when the chart obeys the ladder', () => {
    expect(ladderBreaks(people.filter(p => p.id !== 'tammy'))).toEqual([])
  })
})

describe('compareByLadder', () => {
  const p = (name: string, title: string | null, levelRank: number | null) => ({
    name,
    title,
    levelRank,
  })

  it('reads a department top down — same title together, names A→Z on a rung', () => {
    // The Revenue Department roster as the user drew it (2026-09-05): the two
    // L6 titles stay apart from each other, then L3, then L2.
    const roster = [
      p('ETHAN', 'Revenue Specialist', 2),
      p('ANTHONY', 'Team Leader', 6),
      p('LUCAS', 'Senior Team Leader', 6),
      p('ESTHER', 'Revenue Specialist', 2),
      p('CHEA HUAN', 'Team Leader', 6),
      p('KAR JUN', 'Senior Revenue Specialist', 3),
    ]
    expect([...roster].sort(compareByLadder).map(x => x.name)).toEqual([
      'LUCAS',
      'ANTHONY',
      'CHEA HUAN',
      'KAR JUN',
      'ESTHER',
      'ETHAN',
    ])
  })

  it('puts an unplaced title after every placed one, and no title last of all', () => {
    const roster = [
      p('NO TITLE', null, null),
      p('UNPLACED', 'IT DEVELOPER EXECUTIVE', null),
      p('PLACED', 'ACCOUNTS ASSISTANT', 1),
    ]
    expect([...roster].sort(compareByLadder).map(x => x.name)).toEqual([
      'PLACED',
      'UNPLACED',
      'NO TITLE',
    ])
  })

  it('is a total order: antisymmetric, and zero only for the same row', () => {
    const a = p('A', 'X', 2)
    const b = p('B', 'X', 2)
    expect(Math.sign(compareByLadder(a, b))).toBe(-Math.sign(compareByLadder(b, a)))
    expect(compareByLadder(a, { ...a })).toBe(0)
    expect(compareByLadder(p('Z', null, null), p('A', 'T', null))).toBeGreaterThan(0)
  })

  it('orders one title by employee code, the number the user gave (2026-09-12)', () => {
    // The Director group as the user set it: LIM WEI SIANG 002, CHAI MENG
    // KEAT 003, LIM WEI LIANG 004 — names A→Z would read 003, 004, 002.
    const c = (name: string, title: string | null, levelRank: number | null, code: string | null) => ({
      ...p(name, title, levelRank),
      code,
    })
    const board = [
      c('CHAI MENG KEAT', 'DIRECTOR', null, 'HV003'),
      c('LIM WEI LIANG', 'DIRECTOR', null, 'HV004'),
      c('LOO WEN WEI', 'CHIEF EXECUTIVE OFFICER', null, 'HV001'),
      c('LIM WEI SIANG', 'DIRECTOR', null, 'HV002'),
    ]
    expect([...board].sort(compareByLadder).map(x => x.code)).toEqual(['HV001', 'HV002', 'HV003', 'HV004'])

    // The title still comes first; the code only settles a tie inside one.
    expect(compareByLadder(c('B', 'A TITLE', 2, 'HV099'), c('A', 'B TITLE', 2, 'HV001'))).toBeLessThan(0)
    // Ten sorts after two — a number, not a string.
    expect(compareByLadder(c('A', 'X', 2, 'HV010'), c('B', 'X', 2, 'HV2'))).toBeGreaterThan(0)
    // No HV number reads after those with one; names settle the rest.
    expect(compareByLadder(c('A', 'X', 2, 'TEST-SEP26-B01'), c('B', 'X', 2, 'HV050'))).toBeGreaterThan(0)
    expect(compareByLadder(c('B', 'X', 2, null), c('A', 'X', 2, null))).toBeGreaterThan(0)
    // A caller without codes at all is exactly what it was.
    expect(compareByLadder(p('B', 'X', 2), p('A', 'X', 2))).toBeGreaterThan(0)
  })
})

// ─── Roster ordering (2026-09-07) ────────────────────────────────────────────

import { NO_DEPARTMENT, orderRoster } from './ladder'

interface Row {
  name: string
  title: string | null
  levelRank: number | null
  department: string | null
}

const r = (
  name: string,
  title: string | null,
  levelRank: number | null,
  department: string | null,
): Row => ({ name, title, levelRank, department })

const ROSTER: Row[] = [
  r('Zara', 'EXECUTIVE', 2, 'Marketing'),
  r('Adam', 'HEAD OF DEPARTMENT', 5, 'Finance'),
  r('Mila', 'EXECUTIVE', 2, 'Finance'),
  r('Bea', 'EXECUTIVE', 2, 'Marketing'),
  r('Cass', 'ASSISTANT', 1, null),
  r('Dev', 'HEAD OF DEPARTMENT', 5, 'Marketing'),
]

describe('orderRoster · rank', () => {
  it('is one list, not one per department', () => {
    const groups = orderRoster(ROSTER, 'rank')
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBeNull()
    expect(groups[0].rows).toHaveLength(ROSTER.length)
  })

  it('reads rank first, then title, then name ascending', () => {
    // The brief, verbatim: "rank order, title first name later (same title
    // then by name ascending)". Two Heads of Department from DIFFERENT
    // departments sort together — the thing department grouping hid.
    expect(orderRoster(ROSTER, 'rank')[0].rows.map(x => x.name)).toEqual([
      'Adam',
      'Dev',
      'Bea',
      'Mila',
      'Zara',
      'Cass',
    ])
  })

  it('does not mutate the array it is given', () => {
    const input = [...ROSTER]
    orderRoster(input, 'rank')
    expect(input.map(x => x.name)).toEqual(ROSTER.map(x => x.name))
  })
})

describe('orderRoster · department', () => {
  it('groups A→Z with the unassigned last', () => {
    expect(orderRoster(ROSTER, 'department').map(g => g.key)).toEqual([
      'Finance',
      'Marketing',
      NO_DEPARTMENT,
    ])
  })

  it('reads the ladder top down inside each group', () => {
    const groups = orderRoster(ROSTER, 'department')
    expect(groups[0].rows.map(x => x.name)).toEqual(['Adam', 'Mila'])
    expect(groups[1].rows.map(x => x.name)).toEqual(['Dev', 'Bea', 'Zara'])
  })

  it('keeps every person exactly once across the groups', () => {
    const seen = orderRoster(ROSTER, 'department').flatMap(g => g.rows.map(x => x.name))
    expect(seen.sort()).toEqual(ROSTER.map(x => x.name).sort())
  })
})
