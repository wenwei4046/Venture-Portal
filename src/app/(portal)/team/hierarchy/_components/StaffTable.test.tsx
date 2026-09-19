import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StaffTable from './StaffTable'
import type { ChartPerson } from './TeamOrgChart'

const adapters = vi.hoisted(() => ({
  setReportsTo: vi.fn(), undoHierarchyMove: vi.fn(), router: { refresh: vi.fn() },
}))
vi.mock('next/navigation', () => ({ useRouter: () => adapters.router }))
vi.mock('../actions', () => ({
  setReportsTo: adapters.setReportsTo, undoHierarchyMove: adapters.undoHierarchyMove,
}))

function person(id: string, levelRank: number, extra: Partial<ChartPerson> = {}): ChartPerson {
  return {
    id, name: id.toUpperCase(), code: null, title: 'Manager', department: 'Director',
    commissionDept: false, canRecruit: null, isDepartmentHead: false, leadIds: [],
    levelRank, levelName: `Level ${levelRank}`, reportsTo: null, ...extra,
  }
}

function roster(): ChartPerson[] {
  const revenue = { department: 'Revenue Department', commissionDept: true, canRecruit: true }
  const director = { ...revenue, isDepartmentHead: true, title: 'Revenue Director' }
  return [
    person('kris', 8, director), person('peter', 8, director),
    person('ceo', 10), person('gm', 9), person('junior', 7),
    person('descendant', 9, { reportsTo: 'kris' }),
    person('anthony', 6, { ...revenue, title: 'Team Leader', leadIds: ['kris', 'peter'] }),
    person('specialist', 6, { ...revenue, canRecruit: false, title: 'Revenue Specialist' }),
  ]
}

function options(name: string) {
  const select = screen.getByRole('combobox', { name: `${name} reports to` }) as HTMLSelectElement
  return Array.from(select.options, option => option.value)
}

beforeEach(() => {
  vi.clearAllMocks()
  adapters.setReportsTo.mockImplementation(async (_id: string, reportsTo: string | null) => ({ ok: true, reportsTo }))
  adapters.undoHierarchyMove.mockResolvedValue({ undone: true, note: 'Previous reporting line restored.' })
})
afterEach(cleanup)

describe('Revenue Director company reporting', () => {
  it('offers senior company managers while filtering Revenue rows, retaining ladder, cycle and member guards', () => {
    render(<StaffTable people={roster()} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by department' }), {
      target: { value: 'Revenue Department' },
    })

    expect(screen.queryByRole('combobox', { name: 'CEO reports to' })).toBeNull()
    expect(options('KRIS')).toEqual(['', 'ceo', 'gm', 'peter'])
    expect(options('ANTHONY')).toEqual(['', 'kris', 'peter'])
  })

  it('saves a director company manager and can undo without announcing a commission change', async () => {
    render(<StaffTable people={roster()} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'KRIS reports to' }), { target: { value: 'ceo' } })
    await waitFor(() => expect(adapters.setReportsTo).toHaveBeenCalledWith('kris', 'ceo'))
    const message = await screen.findByText('KRIS now reports to CEO.')
    expect(message.textContent).not.toMatch(/override|sales|month/i)
    const undo = screen.getByRole('button', { name: 'Undo' })
    await waitFor(() => expect(undo).toBeEnabled())
    fireEvent.click(undo)
    await waitFor(() => expect(adapters.undoHierarchyMove).toHaveBeenCalledWith({
      staffId: 'kris', reportsTo: null, movedTo: 'ceo',
    }))
    expect(await screen.findByText('Previous reporting line restored.')).toBeTruthy()
  })

  it('excludes derived reports of either director even when the report has no L rank', () => {
    const people = roster().map(p => p.id === 'anthony' ? { ...p, levelRank: null } : p)
    render(<StaffTable people={people} />)
    expect(options('KRIS')).not.toContain('anthony')
    expect(options('PETER')).not.toContain('anthony')
  })
})
