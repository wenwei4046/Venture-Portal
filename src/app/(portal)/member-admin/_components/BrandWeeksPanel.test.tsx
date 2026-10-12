import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrandWeeksAdminSnapshot } from '@/lib/member/brand-weeks-admin'

// Member services › Brand weeks, read only since 2026-10-12: the ERP's Sales
// Attending says where each member works a fair weekend (a solid chip); a
// weekend it lists them nowhere counts the booth with the most of their bills
// (dashed). Nothing is picked or saved here.

const actions = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('../brand-weeks-actions', () => ({ fetchBrandWeeksAdmin: actions.fetch }))

import BrandWeeksPanel from './BrandWeeksPanel'

const fair = '71709f7e-9f7c-4e28-80cf-ce21be336995'
const ir = 'ff85d03e-59f6-4738-a4f2-09643c54f622'
const departments = [{ id: ir, name: 'IR' }, { id: fair, name: 'Fair' }]
const person = (id: string, name: string, extra: Partial<BrandWeeksAdminSnapshot['people'][number]> = {}) =>
  ({ id, name, title: 'Revenue Specialist', hasLogin: false, ...extra })
const row = (id: string, name: string, orders: number, sales: number, scoring: boolean, source: 'erp' | 'auto' = 'auto') =>
  ({ id, name, sales, held: 0, orders, source, scoring })

const snapshot: BrandWeeksAdminSnapshot = {
  period: '2026-09', subDepartmentId: fair, asOf: '2026-10-12T15:00:00Z', erpReceivedAt: '2026-10-12T07:46:03Z',
  weeks: [
    { week: '2026-09-04', closesOn: '2026-09-13', locked: true },
    { week: '2026-09-11', closesOn: '2026-09-20', locked: true },
    { week: '2026-09-18', closesOn: '2026-09-27', locked: true },
    { week: '2026-09-25', closesOn: '2026-10-06', locked: true },
  ],
  people: [person('james', 'JAMES SEOW'), person('kar', 'KAR JUN'), person('lawrence', 'LAWRENCE', { title: 'Team Leader', hasLogin: true })],
  erp: {
    james: { '2026-09-25': { brand: 'AKEMI', venue: 'PENANG WATERFRONT CONVENTION CENTRE', organizer: 'MLE', start: '2026-09-25', end: '2026-09-27', booths: 1, fairId: 'f4' } },
    kar: { '2026-09-25': { brand: 'DUNLOP', venue: 'SUNWAY CARNIVAL', organizer: 'MALL MGMT', start: '2026-09-25', end: '2026-09-29', booths: 1, fairId: 'f5' } },
  },
  unlisted: ['NG PENG CHUEN'],
  events: [
    { id: 'f1|AKEMI', fairId: 'f1', brand: 'AKEMI', venue: 'SUNWAY PYRAMID CONVENTION CENTRE', start: '2026-09-04', end: '2026-09-06',
      week: '2026-09-04', periodMonth: '2026-09', people: [row('lawrence', 'LAWRENCE', 3, 12_000, true)] },
    { id: 'f4|AKEMI', fairId: 'f4', brand: 'AKEMI', venue: 'PENANG WATERFRONT CONVENTION CENTRE', start: '2026-09-25', end: '2026-09-27',
      week: '2026-09-25', periodMonth: '2026-09',
      people: [row('james', 'JAMES SEOW', 5, 30_000, true, 'erp'), row('kar', 'KAR JUN', 2, 9_000, false, 'erp')] },
  ],
}

const chip = (name: string, week: string) => screen.getByLabelText(new RegExp(`^${name}, week of ${week}: `))

beforeEach(() => {
  actions.fetch.mockReset().mockResolvedValue({ ok: true, data: structuredClone(snapshot) })
})
afterEach(cleanup)

describe('BrandWeeksPanel', () => {
  it('opens on Fair: every Friday, and where each member works it', async () => {
    render(<BrandWeeksPanel departments={departments} />)
    await screen.findByRole('row', { name: /JAMES SEOW/ })
    expect(actions.fetch).toHaveBeenCalledWith(fair, expect.stringMatching(/^\d{4}-\d{2}$/))
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Member', 'Fri 4', 'Fri 11', 'Fri 18', 'Fri 25'])
    // The ERP's booth: a solid chip with the venue under it.
    const james = chip('JAMES SEOW', '2026-09-25')
    expect(james).toHaveTextContent('Akemi')
    expect(james).not.toHaveAttribute('data-guess')
    expect(james).toHaveAccessibleName(/the ERP’s Sales Attending/)
    expect(james.title).toContain("The ERP's Sales Attending lists them at Akemi · PENANG WATERFRONT CONVENTION CENTRE (25 Sep – 27 Sep)")
    expect(james.title).toContain('Akemi · PENANG WATERFRONT CONVENTION CENTRE — 5 bills, RM 30,000.00 · earns the points')
    // Listed at a booth none of their bills is at: says so.
    expect(chip('KAR JUN', '2026-09-25').title).toContain('None of their bills is at that booth')
    expect(screen.getByText('No bills · SUNWAY CARNIVAL')).toBeInTheDocument()
    // Nobody listed: auto-located, dashed.
    const auto = chip('LAWRENCE', '2026-09-04')
    expect(auto).toHaveTextContent('Akemi')
    expect(auto).toHaveAttribute('data-guess', 'true')
    expect(auto.title).toContain('The ERP lists them at no booth — auto-located at Akemi')
    expect(chip('JAMES SEOW', '2026-09-04')).toHaveTextContent('No fair')
    expect(screen.getByText('LAWRENCE')).toHaveAttribute('title', 'Team Leader')
    expect(screen.getByText('JAMES SEOW')).toHaveAttribute('title', 'Revenue Specialist · No member login')
  })

  it('offers nothing to change — no buttons in the grid, no save bar', async () => {
    render(<BrandWeeksPanel departments={departments} />)
    const table = await screen.findByRole('table')
    await within(table).findByRole('row', { name: /LAWRENCE/ })
    expect(within(table).queryAllByRole('button')).toEqual([])
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.getByText(/change who attends a booth there/)).toBeInTheDocument()
  })

  it('says when the ERP last sent it, and whom it lists that no member matches', async () => {
    render(<BrandWeeksPanel departments={departments} />)
    await screen.findByRole('row', { name: /LAWRENCE/ })
    expect(screen.getByText(/Last sent by the ERP 12 Oct/)).toBeInTheDocument()
    expect(screen.getByText(/not matched to a member here: NG PENG CHUEN/)).toBeInTheDocument()
  })

  it('says when the ERP has not sent its Sales Attending yet', async () => {
    actions.fetch.mockResolvedValue({ ok: true, data: { ...structuredClone(snapshot), erpReceivedAt: null, erp: {}, unlisted: [] } })
    render(<BrandWeeksPanel departments={departments} />)
    await screen.findByRole('row', { name: /LAWRENCE/ })
    expect(screen.getByText(/The ERP has not sent its Sales Attending yet/)).toBeInTheDocument()
    expect(chip('JAMES SEOW', '2026-09-25')).toHaveTextContent('Akemi')
    expect(chip('JAMES SEOW', '2026-09-25')).toHaveAttribute('data-guess', 'true')
  })

  it('steps months freely, never past this one', async () => {
    render(<BrandWeeksPanel departments={departments} />)
    await screen.findByRole('row', { name: /LAWRENCE/ })
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await waitFor(() => expect(actions.fetch).toHaveBeenCalledTimes(2))
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
