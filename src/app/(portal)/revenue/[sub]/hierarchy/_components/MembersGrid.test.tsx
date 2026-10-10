import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectorRow, MemberCandidate, RankRow, SalespersonRow, TitleRow } from '../../../_components/config/types'
import type { MembershipDestination } from '../../../_lib/membership-destinations'

// Sales Groups › Members (2026-10-10, the HR revamp): Rank, Rate mode and
// Withholding edited where they stand, a changed cell peach, one bar that
// saves them all; who it reports to as chips; + Add member; a person's
// memberships on their right-click menu.

const actions = vi.hoisted(() => ({
  addMember: vi.fn(),
  changeMemberTitle: vi.fn(),
  removeMember: vi.fn(),
  setStaffRank: vi.fn(),
  saveStaffTax: vi.fn(),
  addDirector: vi.fn(),
  removeDirector: vi.fn(),
}))
const toast = vi.hoisted(() => ({ flash: vi.fn() }))
vi.mock('../../../hierarchy-actions', () => actions)
vi.mock('../../../employee-actions', () => ({ moveEmployee: vi.fn(), removeEmployeeMembership: vi.fn(), terminateEmployee: vi.fn() }))
vi.mock('@/components/hrv/toast', () => toast)

import MembersGrid from './MembersGrid'

const rung = (id: string, label: string, rate: number, titleId: string, sort: number): RankRow =>
  ({
    id,
    title_id: titleId,
    rank_def_id: `def-${id}`,
    rank_key: id,
    label,
    product_rate: rate,
    group_incentive_amount: 0,
    group_subsidy_cap: 0,
    sort_order: sort,
    can_recruit: true,
    group_sales_threshold: null,
    personal_sales_threshold: null,
    consecutive_months: null,
  }) as RankRow
const ranks = [rung('r-b', 'Rank B', 0.09, 't-tl', 40), rung('r-d', 'Rank D', 0.07, 't-ta', 30), rung('r-f', 'Rank F', 0.05, 't-rs', 10)]
const titles: TitleRow[] = [
  { id: 't-tl', name: 'Team Leader' },
  { id: 't-ta', name: 'Team Assistant' },
  { id: 't-rs', name: 'Revenue Specialist' },
]

const person = (over: Partial<SalespersonRow>): SalespersonRow => ({
  staff_id: 'x',
  employee_name: 'X',
  employee_code: null,
  title_id: 't-rs',
  title_name: 'Revenue Specialist',
  title_level_rank: 3,
  title_level_name: 'Executive',
  company_title_name: 'Revenue Specialist',
  hierarchy_id: 'h',
  based_here: true,
  upline_staff_id: null,
  reports_to: null,
  rank_id: 'r-f',
  rank_key: 'r-f',
  rank_label: 'Rank F',
  rate_mode: null,
  placed_since: null,
  tax_mode: 'pcb',
  withholding_rate: 0.02,
  ...over,
})

// Fair on 2026-10-10, three of them.
const anthony = person({ staff_id: 'anthony', employee_name: 'ANTHONY', employee_code: 'HV008', title_id: 't-tl', title_name: 'Team Leader', title_level_rank: 7, rank_id: 'r-b' })
const chea = person({ staff_id: 'chea', employee_name: 'CHEA HUAN', title_id: 't-tl', title_name: 'Team Leader', title_level_rank: 7, rank_id: 'r-b', tax_mode: 'withholding' })
const lim = person({ staff_id: 'lim', employee_name: 'LIM YAU WEI', title_id: 't-ta', title_name: 'Team Assistant', title_level_rank: 4, rank_id: 'r-d', upline_staff_id: 'chea' })
const directors: DirectorRow[] = [
  { staff_id: 'kris', employee_name: 'KRIS', employee_code: 'HV006', title_name: 'Revenue Director' },
  { staff_id: 'peter', employee_name: 'PETER', employee_code: 'HV007', title_name: 'Revenue Director' },
]
const candidates: MemberCandidate[] = [{ staff_id: 'ir-amy', employee_name: 'AMY', employee_code: null, company_title_name: 'Revenue Specialist' }]
const ir: MembershipDestination = {
  subDepartmentId: 'ir', name: 'IR', slug: 'ir', departmentId: 'revenue', departmentName: 'Revenue', schemeId: 'ir-scheme',
  createdAt: '2026-09-10T00:00:00Z', isHome: false,
  titles: [{ id: 't-rs', name: 'Revenue Specialist' }, { id: 't-tl', name: 'Team Leader' }],
  homeStaffIds: [], memberStaffIds: [], eligibleStaffIds: ['lim'], unavailableReason: null,
}

function renderGrid(over: { canEdit?: boolean; directorCandidates?: DirectorRow[] } = {}) {
  return render(
    <MembersGrid
      people={[lim, chea, anthony]}
      ranks={ranks}
      titles={titles}
      candidates={candidates}
      directors={directors}
      directorCandidates={over.directorCandidates ?? []}
      subDepartmentId="fair"
      schemeId="fair-scheme"
      subDeptName="Fair"
      membershipDestinations={[ir]}
      canEdit={over.canEdit ?? true}
    />,
  )
}

const rowOf = (name: string) => screen.getAllByRole('row').find(r => r.textContent?.includes(name))!
const rank = (name: string) => within(rowOf(name)).getByLabelText(`${name} rank`) as HTMLSelectElement

beforeEach(() => {
  actions.setStaffRank.mockResolvedValue({ ok: true, note: null })
  actions.saveStaffTax.mockResolvedValue({ ok: true, note: null })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('MembersGrid', () => {
  it('lists the members top of the ladder first, with who each earns under', () => {
    renderGrid()
    const names = screen.getAllByRole('row').slice(1).map(r => r.querySelector('b')?.textContent)
    expect(names).toEqual(['ANTHONY', 'CHEA HUAN', 'LIM YAU WEI'])
    expect(rowOf('ANTHONY')).toHaveTextContent('Team Leader · L7')
    expect(rowOf('ANTHONY')).toHaveTextContent('KRIS · PETER (top)')
    expect(rowOf('LIM YAU WEI')).toHaveTextContent('CHEA HUAN')
    expect(rank('ANTHONY').selectedOptions[0].textContent).toBe('B · 9%')
    expect((within(rowOf('CHEA HUAN')).getByLabelText('CHEA HUAN withholding') as HTMLSelectElement).selectedOptions[0].textContent).toBe('2%')
  })

  it('turns a changed cell peach and names the change on the save bar; Discard takes it back', () => {
    renderGrid()
    fireEvent.change(rank('ANTHONY'), { target: { value: 'r-d' } })
    expect(rank('ANTHONY')).toHaveAttribute('data-dirty', 'true')
    expect(screen.getByRole('region', { name: 'Unsaved changes' })).toHaveTextContent('1 unsaved change · ANTHONY')
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(rank('ANTHONY')).toHaveAttribute('data-dirty', 'false')
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull()
  })

  it('saves every changed row in one go — rank with its rate mode, withholding on its own', async () => {
    renderGrid()
    fireEvent.change(rank('ANTHONY'), { target: { value: 'r-d' } })
    fireEvent.change(within(rowOf('LIM YAU WEI')).getByLabelText('LIM YAU WEI rate mode'), { target: { value: 'fixed' } })
    fireEvent.change(within(rowOf('CHEA HUAN')).getByLabelText('CHEA HUAN withholding'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save 3 changes' }))
    await waitFor(() => expect(toast.flash).toHaveBeenCalledWith('Saved 3 changes — a new effective-dated position'))
    const ranked = actions.setStaffRank.mock.calls.map(([fd]) => Object.fromEntries((fd as FormData).entries()))
    expect(ranked).toEqual([
      { staff_id: 'anthony', scheme_id: 'fair-scheme', rank_id: 'r-d', rate_mode: '' },
      { staff_id: 'lim', scheme_id: 'fair-scheme', rank_id: 'r-d', rate_mode: 'fixed' },
    ])
    expect(Object.fromEntries((actions.saveStaffTax.mock.calls[0][0] as FormData).entries())).toEqual({ staff_id: 'chea' })
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull()
  })

  it('keeps a refused row peach and says why, saving the rest', async () => {
    actions.setStaffRank.mockImplementation(async (fd: FormData) =>
      fd.get('staff_id') === 'lim' ? { ok: false, note: 'That rank belongs to another sub-department’s scheme.' } : { ok: true, note: null },
    )
    renderGrid()
    fireEvent.change(rank('ANTHONY'), { target: { value: 'r-d' } })
    fireEvent.change(rank('LIM YAU WEI'), { target: { value: 'r-f' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save 2 changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('LIM YAU WEI: That rank belongs to another sub-department’s scheme.')
    expect(toast.flash).toHaveBeenCalledWith('Saved 1 change — a new effective-dated position')
    expect(screen.getByRole('region', { name: 'Unsaved changes' })).toHaveTextContent('1 unsaved change · LIM YAU WEI')
  })

  it('takes a director off the Reports to line after asking, and adds one from the menu', async () => {
    actions.removeDirector.mockResolvedValue({ ok: true, note: null })
    actions.addDirector.mockResolvedValue({ ok: true, note: null })
    // happy-dom has no confirm(); the grid asks before taking a director off.
    Object.defineProperty(window, 'confirm', { value: vi.fn(() => true), configurable: true, writable: true })
    renderGrid({ directorCandidates: [{ staff_id: 'mei', employee_name: 'MEI', employee_code: null, title_name: 'Revenue Director' }] })
    fireEvent.click(screen.getByRole('button', { name: 'Fair no longer reports to PETER' }))
    await waitFor(() => expect(actions.removeDirector).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries((actions.removeDirector.mock.calls[0][0] as FormData).entries())).toEqual({ sub_department_id: 'fair', staff_id: 'peter' })
    await waitFor(() => expect(toast.flash).toHaveBeenCalledWith('PETER removed from Reports to'))
    fireEvent.click(screen.getByRole('button', { name: '+ Add director' }))
    fireEvent.click(within(screen.getByRole('menu', { name: 'Add a director' })).getByRole('menuitem', { name: /MEI/ }))
    await waitFor(() => expect(actions.addDirector).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(toast.flash).toHaveBeenCalledWith('Fair now reports to MEI'))
  })

  it('adds a member with the title they hold here', async () => {
    actions.addMember.mockResolvedValue({ ok: true, note: null })
    renderGrid()
    fireEvent.click(screen.getByRole('button', { name: '+ Add member' }))
    const dialog = screen.getByRole('dialog', { name: 'Add a member to Fair' })
    fireEvent.change(within(dialog).getByLabelText('Person to add'), { target: { value: 'ir-amy' } })
    fireEvent.change(within(dialog).getByLabelText('Title held in Fair'), { target: { value: 't-rs' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add member' }))
    await waitFor(() => expect(actions.addMember).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries((actions.addMember.mock.calls[0][0] as FormData).entries())).toEqual({ staff_id: 'ir-amy', scheme_id: 'fair-scheme', title_id: 't-rs' })
    await waitFor(() => expect(toast.flash).toHaveBeenCalledWith('AMY joined Fair'))
  })

  it('opens a person’s memberships on right-click — add them to another sub-department with a title', async () => {
    actions.addMember.mockResolvedValue({ ok: true, note: null })
    renderGrid()
    fireEvent.contextMenu(rowOf('LIM YAU WEI'), { clientX: 200, clientY: 300 })
    fireEvent.click(screen.getByRole('menuitem', { name: /Add to department/ }))
    fireEvent.click(within(screen.getByRole('menu', { name: 'Add LIM YAU WEI to department' })).getByRole('menuitem', { name: 'IR' }))
    fireEvent.click(within(screen.getByRole('menu', { name: 'Add LIM YAU WEI to IR as' })).getByRole('menuitem', { name: 'Team Leader' }))
    await waitFor(() => expect(actions.addMember).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries((actions.addMember.mock.calls[0][0] as FormData).entries())).toEqual({ staff_id: 'lim', scheme_id: 'ir-scheme', title_id: 't-tl' })
    expect(await screen.findByRole('status')).toHaveTextContent('LIM YAU WEI added to Revenue / IR as Team Leader.')
  })

  it('is read-only for whoever may not edit Revenue', () => {
    renderGrid({ canEdit: false })
    expect(rank('ANTHONY')).toBeDisabled()
    expect(screen.queryByRole('button', { name: '+ Add member' })).toBeNull()
    expect(screen.queryByRole('button', { name: '+ Add director' })).toBeNull()
    expect(screen.queryByRole('button', { name: /no longer reports to/ })).toBeNull()
  })
})
