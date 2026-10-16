import { describe, expect, it } from 'vitest'
import { UPLINE_REFUSED, UPLINE_WHY, uplineChoices, type UplinePerson } from './upline-choices'

// Reports to on a person's page (2026-10-16, the user: "it needs to be able to
// set report to an upline") offers what the company chart allows a drop on:
// nobody below them, nobody lower on the ladder, nobody across a commission
// department's edge, and inside one nobody whose title cannot lead.

const person = (id: string, over: Partial<UplinePerson> = {}): UplinePerson => ({
  id,
  name: id.toUpperCase(),
  code: null,
  title: 'Executive',
  department: 'Finance',
  commissionDept: false,
  isDepartmentHead: false,
  canRecruit: null,
  levelRank: 3,
  active: true,
  reportsTo: null,
  ...over,
})

const ids = (groups: ReturnType<typeof uplineChoices>) => groups.flatMap(g => g.choices.map(c => c.value))
const choice = (groups: ReturnType<typeof uplineChoices>, id: string) => groups.flatMap(g => g.choices).find(c => c.value === id)

describe('who a person may report to', () => {
  const roster = [
    person('ceo', { title: 'Chief Executive Officer', department: 'Director', levelRank: 9 }),
    person('cfo', { title: 'Chief Financial Officer', department: 'Director', levelRank: 8, reportsTo: 'ceo' }),
    person('manager', { title: 'Finance Manager', levelRank: 5, reportsTo: 'cfo' }),
    person('clerk', { title: 'Accounts Executive', levelRank: 3, reportsTo: 'manager' }),
    person('intern', { title: 'Intern', levelRank: 1, reportsTo: 'clerk' }),
    person('gone', { title: 'Finance Manager', levelRank: 5, active: false }),
    person('seller', { title: 'Revenue Specialist', department: 'Revenue', commissionDept: true, levelRank: 2 }),
  ]

  it('greys the people under them, however far down, and anybody lower on the ladder', () => {
    const groups = uplineChoices('manager', roster)
    expect(choice(groups, 'clerk')).toMatchObject({ disabled: true, label: `CLERK · Accounts Executive — ${UPLINE_WHY.below}` })
    expect(choice(groups, 'intern')).toMatchObject({ disabled: true })
    expect(choice(groups, 'cfo')).toMatchObject({ disabled: false, label: 'CFO · Chief Financial Officer' })
    const forClerk = uplineChoices('clerk', roster.map(p => (p.id === 'intern' ? { ...p, reportsTo: null } : p)))
    expect(choice(forClerk, 'intern')).toMatchObject({ disabled: true, label: `INTERN · Intern — ${UPLINE_WHY.ladder}` })
  })

  it('leaves out themselves, the inactive, and the far side of a commission department', () => {
    const offered = ids(uplineChoices('manager', roster))
    expect(offered).not.toContain('manager')
    expect(offered).not.toContain('gone')
    expect(offered).not.toContain('seller')
  })

  it('keeps the upline they have now, whatever it is today', () => {
    const groups = uplineChoices('clerk', roster.map(p => (p.id === 'clerk' ? { ...p, reportsTo: 'gone' } : p)))
    expect(choice(groups, 'gone')).toMatchObject({ disabled: true, label: `GONE · Finance Manager — ${UPLINE_WHY.inactive}` })
  })

  it('groups the open choices by department, theirs first, each in ladder order — the refused last', () => {
    const groups = uplineChoices('clerk', roster)
    expect(groups.map(g => g.name)).toEqual(['Finance', 'Director', UPLINE_REFUSED])
    expect(groups[0].choices.map(c => c.value)).toEqual(['manager'])
    expect(groups[1].choices.map(c => c.value)).toEqual(['ceo', 'cfo'])
    expect(groups[2].choices).toEqual([{ value: 'intern', label: `INTERN · Intern — ${UPLINE_WHY.below}`, disabled: true }])
  })

  it('a department with nobody open is no group of its own — somebody senior sees the few above them first', () => {
    const groups = uplineChoices('manager', roster)
    expect(groups.map(g => g.name)).toEqual(['Director', UPLINE_REFUSED])
    expect(groups[1].choices.map(c => c.value)).toEqual(['clerk', 'intern'])
    expect(groups[1].choices.every(c => c.disabled)).toBe(true)
  })

  describe('inside a commission department', () => {
    const revenue = [
      person('director', { title: 'Revenue Director', department: 'Revenue', commissionDept: true, isDepartmentHead: true, levelRank: 7, canRecruit: true }),
      person('leader', { title: 'Team Leader', department: 'Revenue', commissionDept: true, levelRank: 4, canRecruit: true }),
      person('peer', { title: 'Revenue Specialist', department: 'Revenue', commissionDept: true, levelRank: 2, canRecruit: false }),
      person('rs', { title: 'Revenue Specialist', department: 'Revenue', commissionDept: true, levelRank: 2, reportsTo: 'leader' }),
      person('hr', { title: 'HR Executive', department: 'HR', levelRank: 6 }),
    ]

    it('greys a colleague whose title cannot lead, and offers no head — under a head is the top of their tree', () => {
      const groups = uplineChoices('rs', revenue)
      expect(choice(groups, 'peer')).toMatchObject({ disabled: true, label: `PEER · Revenue Specialist — ${UPLINE_WHY.recruit}` })
      expect(choice(groups, 'leader')).toMatchObject({ disabled: false })
      expect(ids(groups)).not.toContain('director')
      expect(ids(groups)).not.toContain('hr')
    })

    it('a head reports anywhere — the company line, outside Revenue too', () => {
      const offered = ids(uplineChoices('director', [...revenue, person('ceo', { department: 'Director', levelRank: 9 })]))
      expect(offered).toContain('ceo')
      expect(offered).toContain('hr')
    })
  })

  it('answers nothing for somebody not on the roster', () => {
    expect(uplineChoices('nobody', roster)).toEqual([])
  })
})
