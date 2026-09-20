import { describe, it, expect } from 'vitest'
import { homeSubDepartmentOf, pickHomeSubDepartments } from './revenue'

describe('pickHomeSubDepartments', () => {
  it('picks the oldest active sub-department of each department', () => {
    const home = pickHomeSubDepartments([
      { id: 'ir', departmentId: 'rev', createdAt: '2026-09-10T14:35:40Z' },
      { id: 'fair', departmentId: 'rev', createdAt: '2026-08-31T09:56:37Z' },
      { id: 'x', departmentId: 'other', createdAt: '2026-09-01T00:00:00Z' },
    ])
    expect([...home].sort()).toEqual(['fair', 'x'])
  })

  it('breaks a tie on id, so two rows created in one statement still yield one home', () => {
    const home = pickHomeSubDepartments([
      { id: 'b', departmentId: 'rev', createdAt: '2026-09-01T00:00:00Z' },
      { id: 'a', departmentId: 'rev', createdAt: '2026-09-01T00:00:00Z' },
    ])
    expect([...home]).toEqual(['a'])
  })

  it('is empty for no sub-departments', () => {
    expect(pickHomeSubDepartments([]).size).toBe(0)
  })
})

describe('homeSubDepartmentOf — whose home, not the department’s (2026-09-20)', () => {
  const subs = [
    { id: 'fair', departmentId: 'revenue', isHome: true },
    { id: 'ir', departmentId: 'revenue', isHome: false },
    { id: 'roadshow', departmentId: 'events', isHome: true },
  ]

  it('falls back to the department’s default for everybody who has not chosen', () => {
    expect(homeSubDepartmentOf({ departmentId: 'revenue', homeSubDepartmentId: null }, subs)).toBe('fair')
    expect(homeSubDepartmentOf({ departmentId: 'revenue' }, subs)).toBe('fair')
  })

  it('honours a choice inside their own department', () => {
    expect(homeSubDepartmentOf({ departmentId: 'revenue', homeSubDepartmentId: 'ir' }, subs)).toBe('ir')
  })

  it('ignores a choice that belongs to another department, the way the database does', () => {
    expect(homeSubDepartmentOf({ departmentId: 'revenue', homeSubDepartmentId: 'roadshow' }, subs)).toBe('fair')
  })

  it('has no answer for somebody with no department, or a department with none', () => {
    expect(homeSubDepartmentOf({ departmentId: null, homeSubDepartmentId: 'ir' }, subs)).toBeNull()
    expect(homeSubDepartmentOf({ departmentId: 'marketing', homeSubDepartmentId: null }, subs)).toBeNull()
  })
})
