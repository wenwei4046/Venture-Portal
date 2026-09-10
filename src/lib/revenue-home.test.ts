import { describe, it, expect } from 'vitest'
import { pickHomeSubDepartments } from './revenue'

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
