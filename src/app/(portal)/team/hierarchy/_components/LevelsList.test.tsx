import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { RolePerson, RoleRung, RoleTitle } from '@/lib/hierarchy-roles'

// Hierarchy › Levels (2026-10-10, the HR revamp): the ladder top down with
// its titles as chips — and still edited there (the user's A).

const actions = vi.hoisted(() => ({ setTitleLevel: vi.fn(), insertLevel: vi.fn(), renameLevel: vi.fn(), deleteLevel: vi.fn() }))
vi.mock('../ladder-actions', () => actions)
const flash = vi.fn()
vi.mock('@/components/hrv/toast', () => ({ flash: (m: string) => flash(m) }))

import LevelsList from './LevelsList'

const rungs: RoleRung[] = [
  { id: 'l9', rank: 9, name: 'Management' },
  { id: 'l8', rank: 8, name: 'Head of Department' },
  { id: 'l7', rank: 7, name: 'Senior Manager' },
]
const t = (id: string, name: string, levelId: string | null): RoleTitle => ({
  id, name, levelId, departmentId: null, departmentName: 'Revenue', isActive: true, isDepartmentHead: false, templateId: null, templateName: null,
})
const titles = [t('rd', 'Revenue Director', 'l9'), t('tl', 'Team Leader', 'l7'), t('am', 'Area Manager', null)]
const people: RolePerson[] = [
  { id: 'a', name: 'A', titleId: 'tl', department: null, reportsTo: null },
  { id: 'b', name: 'B', titleId: 'tl', department: null, reportsTo: null },
]
const show = (canManage = true) => render(<LevelsList rungs={rungs} titles={titles} people={people} breaks={0} canManage={canManage} />)
const level = (name: string) => screen.getByRole('group', { name })

beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset().mockResolvedValue({ ok: true })
  flash.mockReset()
})
afterEach(cleanup)

describe('Levels', () => {
  it('reads the ladder top down, a chip per title with who holds it, and the titles on no level', () => {
    show()
    expect(level('L9 Management')).toHaveTextContent('Revenue Director · 0')
    expect(level('L8 Head of Department')).toHaveTextContent('No title on this level')
    expect(level('L7 Senior Manager')).toHaveTextContent('Team Leader · 2')
    expect(level('Not on the ladder')).toHaveTextContent('Area Manager · 0')
  })

  it('moves a title from its menu, and puts it back when the server refuses', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Team Leader · 2' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Move to L8 · Head of Department' }))
    })
    expect(actions.setTitleLevel).toHaveBeenCalledWith('tl', 'l8')
    expect(level('L8 Head of Department')).toHaveTextContent('Team Leader · 2')
    expect(flash).toHaveBeenCalledWith('Team Leader moved to L8')

    actions.setTitleLevel.mockResolvedValue({ ok: false, reason: 'A title that heads its department stands above the ladder.' })
    fireEvent.click(screen.getByRole('button', { name: 'Revenue Director · 0' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Take off the ladder' }))
    })
    expect(actions.setTitleLevel).toHaveBeenLastCalledWith('rd', null)
    expect(screen.getByRole('alert')).toHaveTextContent('A title that heads its department stands above the ladder.')
    expect(level('L9 Management')).toHaveTextContent('Revenue Director · 0')
  })

  it('moves a title dropped on another level', async () => {
    show()
    const chip = screen.getByRole('button', { name: 'Area Manager · 0' })
    const data = { value: '', setData: (_: string, v: string) => { data.value = v }, getData: () => data.value, effectAllowed: '' }
    fireEvent.dragStart(chip, { dataTransfer: data })
    await act(async () => {
      fireEvent.dragOver(level('L9 Management'), { dataTransfer: data })
      fireEvent.drop(level('L9 Management'), { dataTransfer: data })
    })
    expect(actions.setTitleLevel).toHaveBeenCalledWith('am', 'l9')
  })

  it('renames a level by its name, adds one on top, removes an empty one', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Senior Manager' }))
    const input = screen.getByLabelText('Rename L7')
    fireEvent.change(input, { target: { value: 'Senior Leaders' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    expect(actions.renameLevel).toHaveBeenCalledWith('l7', 'Senior Leaders')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Add level' }))
    })
    expect(actions.insertLevel).toHaveBeenCalledWith(10)
    await act(async () => {
      fireEvent.click(within(level('L8 Head of Department')).getByRole('button', { name: 'Remove' }))
    })
    expect(actions.deleteLevel).toHaveBeenCalledWith('l8')
    expect(within(level('L9 Management')).queryByRole('button', { name: 'Remove' })).toBeNull()
  })

  it('only reads for somebody who may not manage the team', () => {
    show(false)
    expect(screen.queryByRole('button', { name: '+ Add level' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Team Leader · 2' })).not.toHaveAttribute('draggable', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Team Leader · 2' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'Senior Manager' })).toBeDisabled()
  })
})
