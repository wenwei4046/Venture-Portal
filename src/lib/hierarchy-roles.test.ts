import { describe, expect, it } from 'vitest'
import { levelLabel, levelRows, roleBands, titleTone, type RolePerson, type RoleRung, type RoleTitle } from './hierarchy-roles'

// Hierarchy › People & roles and Levels (2026-10-10, the HR revamp).

const rungs: RoleRung[] = [
  { id: 'l9', rank: 9, name: 'Management' },
  { id: 'l7', rank: 7, name: 'Senior Manager' },
  { id: 'l3', rank: 3, name: 'Executive' },
]
const title = (over: Partial<RoleTitle> & { id: string; name: string }): RoleTitle => ({
  departmentId: 'rev', departmentName: 'Revenue', levelId: null, isActive: true, isDepartmentHead: false, templateId: null, templateName: null, ...over,
})
const titles = [
  title({ id: 'rs', name: 'Revenue Specialist', levelId: 'l3' }),
  title({ id: 'tl', name: 'Team Leader', levelId: 'l7', templateId: 't1', templateName: 'Revenue Team' }),
  title({ id: 'rd', name: 'Revenue Director', levelId: 'l9', isDepartmentHead: true }),
  title({ id: 'stl', name: 'Senior Team Leader', levelId: 'l7' }),
  title({ id: 'new', name: 'Area Manager' }),
]
const people: RolePerson[] = [
  { id: 'kris', name: 'KRIS', titleId: 'rd', department: 'Revenue', reportsTo: null },
  { id: 'stanley', name: 'STANLEY', titleId: 'tl', department: 'Revenue', reportsTo: 'kris' },
  { id: 'anthony', name: 'ANTHONY', titleId: 'tl', department: 'Revenue', reportsTo: 'gone' },
  { id: 'adrian', name: 'ADRIAN', titleId: 'rs', department: 'Revenue', reportsTo: 'stanley' },
]

describe('titleTone and levelLabel', () => {
  it('colours the handoff’s four titles its way and every other one blue', () => {
    expect(titleTone('Team Leader')).toEqual(['240 232 250', '110 70 160'])
    expect(titleTone(' TEAM ASSISTANT ')).toEqual(['253 232 233', '170 60 70'])
    expect(titleTone('Revenue Director')).toEqual(['232 239 247', '46 92 138'])
    expect(levelLabel(9)).toBe('L9')
    expect(levelLabel(null)).toBe('—')
  })
})

describe('People & roles', () => {
  it('bands the titles most senior first, A→Z on a rung, no rung last, each with its holders and their managers', () => {
    const bands = roleBands(titles, rungs, people)
    expect(bands.map(b => [b.title.name, b.rank, b.people.map(p => `${p.name}>${p.manager ?? '-'}`)])).toEqual([
      ['Revenue Director', 9, ['KRIS>-']],
      ['Senior Team Leader', 7, []],
      ['Team Leader', 7, ['ANTHONY>-', 'STANLEY>KRIS']],
      ['Revenue Specialist', 3, ['ADRIAN>STANLEY']],
      ['Area Manager', null, []],
    ])
  })
})

describe('Levels', () => {
  it('lists every level top down with its titles and holders, then the titles on none', () => {
    const rows = levelRows(rungs, titles, people)
    expect(rows.map(r => [r.rung?.rank ?? null, r.titles.map(t => `${t.title.name}·${t.people}`)])).toEqual([
      [9, ['Revenue Director·1']],
      [7, ['Senior Team Leader·0', 'Team Leader·2']],
      [3, ['Revenue Specialist·1']],
      [null, ['Area Manager·0']],
    ])
  })

  it('leaves out the unplaced row when every title stands somewhere, and keeps empty levels', () => {
    const rows = levelRows([...rungs, { id: 'l5', rank: 5, name: 'Assistant' }], titles.filter(t => t.levelId), people)
    expect(rows.map(r => r.rung?.rank)).toEqual([9, 7, 5, 3])
    expect(rows[2].titles).toEqual([])
  })
})
