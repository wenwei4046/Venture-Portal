import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RolePerson, RoleRung, RoleTitle } from '@/lib/hierarchy-roles'
import PeopleRoles from './PeopleRoles'

// Hierarchy › People & roles (2026-10-10, the HR revamp): a band per title over
// the people holding it; Edit on the band, its template one click away.

const rungs: RoleRung[] = [{ id: 'l9', rank: 9, name: 'Management' }, { id: 'l7', rank: 7, name: 'Senior Manager' }]
const titles: RoleTitle[] = [
  { id: 'tl', name: 'Team Leader', departmentId: 'rev', departmentName: 'Revenue', levelId: 'l7', isActive: true, isDepartmentHead: false, templateId: 't1', templateName: 'Revenue Team' },
  { id: 'rd', name: 'Revenue Director', departmentId: 'rev', departmentName: 'Revenue', levelId: 'l9', isActive: true, isDepartmentHead: true, templateId: null, templateName: null },
  { id: 'old', name: 'Area Manager', departmentId: 'rev', departmentName: 'Revenue', levelId: null, isActive: false, isDepartmentHead: false, templateId: null, templateName: null },
]
const people: RolePerson[] = [
  { id: 'kris', name: 'Kris', titleId: 'rd', department: 'Revenue', reportsTo: null },
  { id: 'anthony', name: 'Anthony', titleId: 'tl', department: 'Revenue', reportsTo: 'kris' },
]

afterEach(cleanup)

describe('People & roles', () => {
  it('bands each title with its level, its count and its template, over who holds it', () => {
    render(<PeopleRoles titles={titles} rungs={rungs} people={people} canManage onEdit={vi.fn()} />)
    const rows = screen.getAllByRole('row').map(r => r.textContent)
    expect(rows).toEqual([
      'NameReports toDepartmentPermission template',
      'Revenue DirectorL9 · 1 person · heads its departmentEditNo template',
      'Kris—Revenue—',
      'Team LeaderL7 · 1 personEditTemplate: Revenue Team',
      'AnthonyKrisRevenueRevenue Team',
      'Area Manager— · 0 people · inactiveEditNo template',
    ])
    expect(screen.getByRole('link', { name: 'Template: Revenue Team' })).toHaveAttribute('href', '/team/people?tab=permissions&template=t1')
  })

  it('edits a title from its band — only for whoever manages the team', () => {
    const onEdit = vi.fn()
    render(<PeopleRoles titles={titles} rungs={rungs} people={people} canManage onEdit={onEdit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Team Leader' }))
    expect(onEdit).toHaveBeenCalledWith('tl')
    cleanup()
    render(<PeopleRoles titles={titles} rungs={rungs} people={people} canManage={false} onEdit={onEdit} />)
    expect(screen.queryByRole('button', { name: /^Edit/ })).toBeNull()
  })
})
