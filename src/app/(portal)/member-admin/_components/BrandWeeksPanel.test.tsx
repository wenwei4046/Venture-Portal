import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrandWeeksAdminSnapshot } from '@/lib/member/brand-weeks-admin'

// Member services › Brand weeks (2026-10-10, the HR revamp; the back office of
// My brand weeks since 2026-10-03): one chip per member-week, a click cycles
// the brand, a changed chip is peach, the bar saves them — closed weeks too.

const actions = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn() }))
vi.mock('../brand-weeks-actions', () => ({ fetchBrandWeeksAdmin: actions.fetch, saveBrandWeeksAdmin: actions.save }))
const flash = vi.fn()
vi.mock('@/components/hrv/toast', () => ({ flash: (m: string) => flash(m) }))

import BrandWeeksPanel from './BrandWeeksPanel'

const fair = '71709f7e-9f7c-4e28-80cf-ce21be336995'
const ir = 'ff85d03e-59f6-4738-a4f2-09643c54f622'
const departments = [{ id: ir, name: 'IR' }, { id: fair, name: 'Fair' }]
const person = (id: string, name: string, extra: Partial<BrandWeeksAdminSnapshot['people'][number]> = {}) =>
  ({ id, name, title: 'Revenue Specialist', hasLogin: false, savedAt: null, savedBy: null, savedBySelf: false, ...extra })
const row = (id: string, name: string, orders: number, sales: number, scoring: boolean, held = 0) => ({ id, name, sales, held, orders, scoring })

// September 2026 on 3 October: three weekends closed, the last open until 6 October.
const snapshot: BrandWeeksAdminSnapshot = {
  period: '2026-09', subDepartmentId: fair, asOf: '2026-10-03T15:00:00Z',
  weeks: [
    { week: '2026-09-04', closesOn: '2026-09-13', locked: true },
    { week: '2026-09-11', closesOn: '2026-09-20', locked: true },
    { week: '2026-09-18', closesOn: '2026-09-27', locked: true },
    { week: '2026-09-25', closesOn: '2026-10-06', locked: false },
  ],
  people: [
    person('james', 'JAMES SEOW', { savedAt: '2026-10-03T06:00:00Z', savedBy: 'HR Manager' }),
    person('kar', 'KAR JUN'),
    person('lawrence', 'LAWRENCE', { title: 'Team Leader', hasLogin: true }),
  ],
  picks: { james: { '2026-09-25': 'ZANOTTI' }, kar: { '2026-09-25': 'DUNLOP' } },
  events: [
    { id: 'f1|AKEMI', fairId: 'f1', brand: 'AKEMI', venue: 'SUNWAY PYRAMID CONVENTION CENTRE', start: '2026-09-04', end: '2026-09-06',
      week: '2026-09-04', periodMonth: '2026-09', people: [row('lawrence', 'LAWRENCE', 3, 12_000, true)] },
    { id: 'f4|AKEMI', fairId: 'f4', brand: 'AKEMI', venue: 'PENANG WATERFRONT CONVENTION CENTRE', start: '2026-09-25', end: '2026-09-27',
      week: '2026-09-25', periodMonth: '2026-09',
      people: [row('james', 'JAMES SEOW', 5, 30_000, false), row('kar', 'KAR JUN', 2, 9_000, false), row('lawrence', 'LAWRENCE', 1, 4_000, false)] },
    { id: 'f4|ZANOTTI', fairId: 'f4', brand: 'ZANOTTI', venue: 'PENANG WATERFRONT CONVENTION CENTRE', start: '2026-09-25', end: '2026-09-27',
      week: '2026-09-25', periodMonth: '2026-09', people: [row('james', 'JAMES SEOW', 2, 8_000, true), row('lawrence', 'LAWRENCE', 1, 5_000, true)] },
  ],
}

const chip = (name: string, week: string) => screen.getByRole('button', { name: new RegExp(`^${name}, week of ${week}: `) })

beforeEach(() => {
  actions.fetch.mockReset().mockResolvedValue({ ok: true, data: structuredClone(snapshot) })
  actions.save.mockReset().mockResolvedValue({ ok: true, saved: 1 })
  flash.mockReset()
})
afterEach(cleanup)

describe('BrandWeeksPanel', () => {
  it('opens on Fair: every Friday, closed ones marked, and what each member’s week is', async () => {
    render(<BrandWeeksPanel departments={departments} />)
    await screen.findByRole('row', { name: /JAMES SEOW/ })
    expect(actions.fetch).toHaveBeenCalledWith(fair, expect.stringMatching(/^\d{4}-\d{2}$/))
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Member', 'Fri 4closed', 'Fri 11closed', 'Fri 18closed', 'Fri 25'])
    // Closed and nobody picked: the board's brand, dashed, with its bills in the tooltip.
    const auto = chip('LAWRENCE', '2026-09-04')
    expect(auto).toHaveTextContent('Akemi')
    expect(auto).toHaveAttribute('data-guess', 'true')
    expect(auto.title).toContain('Nobody picked — auto-located at Akemi')
    expect(auto.title).toContain('Akemi · SUNWAY PYRAMID CONVENTION CENTRE — 3 bills, RM 12,000.00 · earns the points')
    // Picked.
    expect(chip('JAMES SEOW', '2026-09-25')).toHaveTextContent('Zanotti')
    expect(chip('JAMES SEOW', '2026-09-25')).not.toHaveAttribute('data-guess')
    // A pick with no booth of its brand that week scores nowhere, and says so.
    expect(chip('KAR JUN', '2026-09-25').title).toContain('Picked Dunlopillo — no booth of it this week, so no place scores')
    expect(chip('JAMES SEOW', '2026-09-04')).toHaveTextContent('Not picked')
    expect(screen.getByText('JAMES SEOW')).toHaveAttribute('title', 'Revenue Specialist · No member login · Saved 3 Oct · HR Manager')
  })

  it('cycles a closed week, marks it, and saves only what changed', async () => {
    render(<BrandWeeksPanel departments={departments} />)
    await screen.findByRole('row', { name: /LAWRENCE/ })
    fireEvent.click(chip('LAWRENCE', '2026-09-04'))
    expect(chip('LAWRENCE', '2026-09-04')).toHaveAttribute('data-changed', 'true')
    expect(screen.getByRole('region', { name: 'Unsaved brand weeks' })).toHaveTextContent('1 week changed')
    // Switching month or sub-department would drop the change.
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Sub-department' })).toBeDisabled()
    fireEvent.click(chip('LAWRENCE', '2026-09-04'))
    expect(chip('LAWRENCE', '2026-09-04')).toHaveTextContent('Dunlopillo')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(actions.save).toHaveBeenCalledWith(fair, '2026-09', { lawrence: { '2026-09-04': 'DUNLOP' } })
    expect(flash).toHaveBeenCalledWith('Saved 1 brand week')
    await waitFor(() => expect(actions.fetch).toHaveBeenCalledTimes(2))
  })

  it('clears a pick through the cycle and discards', async () => {
    render(<BrandWeeksPanel departments={departments} />)
    await screen.findByRole('row', { name: /JAMES SEOW/ })
    fireEvent.click(chip('JAMES SEOW', '2026-09-25')) // Zanotti → Ergotex
    fireEvent.click(chip('JAMES SEOW', '2026-09-25')) // Ergotex → not picked
    expect(chip('JAMES SEOW', '2026-09-25')).toHaveTextContent('Not picked')
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(chip('JAMES SEOW', '2026-09-25')).toHaveTextContent('Zanotti')
    fireEvent.click(chip('JAMES SEOW', '2026-09-25'))
    fireEvent.click(chip('JAMES SEOW', '2026-09-25'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(actions.save).toHaveBeenCalledWith(fair, '2026-09', { james: {} })
  })

  it('keeps the change and shows why when the save is refused', async () => {
    actions.save.mockResolvedValue({ ok: false, error: 'Brand weeks need HR request management access.' })
    render(<BrandWeeksPanel departments={departments} />)
    await screen.findByRole('row', { name: /LAWRENCE/ })
    fireEvent.click(chip('LAWRENCE', '2026-09-25'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Brand weeks need HR request management access.')
    expect(chip('LAWRENCE', '2026-09-25')).toHaveAttribute('data-changed', 'true')
    expect(actions.fetch).toHaveBeenCalledTimes(1)
  })

  it('reads another sub-department when one is chosen, and says when it cannot', async () => {
    render(<BrandWeeksPanel departments={departments} />)
    await screen.findByRole('row', { name: /LAWRENCE/ })
    actions.fetch.mockResolvedValueOnce({ ok: false, error: 'Choose a department with an active commission scheme' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Sub-department' }), { target: { value: ir } })
    await waitFor(() => expect(actions.fetch).toHaveBeenLastCalledWith(ir, expect.stringMatching(/^\d{4}-\d{2}$/)))
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a department with an active commission scheme')
    expect(within(screen.getByRole('table')).queryByRole('row', { name: /LAWRENCE/ })).toBeNull()
  })
})
