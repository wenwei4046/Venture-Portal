import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SalespersonRow } from '../../../_components/config/types'
import type { MembershipDestination } from '../../../_lib/membership-destinations'
import TeamTable from './TeamTable'

const actions = vi.hoisted(() => ({
  addMember: vi.fn(), addMemberWithCurrentTitle: vi.fn(), removeMember: vi.fn(), setStaffRank: vi.fn(), updateStaffTax: vi.fn(),
  addDirector: vi.fn(), removeDirector: vi.fn(),
}))
vi.mock('../../../hierarchy-actions', () => actions)

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

describe('TeamTable membership actions', () => {
  it('adds an existing row member with their current title and source membership without a dialog', async () => {
    actions.addMemberWithCurrentTitle.mockResolvedValueOnce({ ok: true, note: null })
    const person: SalespersonRow = {
      staff_id: 'mei', employee_name: 'Mei Ting', employee_code: 'HV015',
      title_id: 'specialist', title_name: 'Revenue Specialist', title_level_rank: 2,
      title_level_name: 'Executive', company_title_name: 'Revenue Specialist',
      hierarchy_id: 'fair-membership-mei', upline_staff_id: null, reports_to: null,
      rank_id: null, rank_key: null, rank_label: null, rate_mode: null,
      placed_since: null, tax_mode: 'none', withholding_rate: 0,
    }
    const destination: MembershipDestination = {
      subDepartmentId: 'ir', name: 'IR', slug: 'ir', departmentId: 'revenue',
      departmentName: 'Revenue', schemeId: 'ir-scheme', isHome: false,
      titles: [{ id: 'specialist', name: 'Revenue Specialist' }, { id: 'leader', name: 'Team Leader' }],
      memberStaffIds: [], eligibleStaffIds: ['mei'], unavailableReason: null,
    }
    render(<TeamTable people={[person]} ranks={[]} titles={[]} candidates={[]}
      directors={[]} directorCandidates={[]} subDepartmentId="fair" schemeId="fair-scheme"
      subDeptName="Fair" isHome membershipDestinations={[destination]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add Mei Ting to department' }))
    const destinations = screen.getByRole('menu', { name: 'Add Mei Ting to department' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Team Leader' })).not.toBeInTheDocument()
    expect(within(destinations).getByRole('menuitem', { name: 'IR' })).toHaveTextContent('Revenue Specialist')
    fireEvent.click(within(destinations).getByRole('menuitem', { name: 'IR' }))

    await waitFor(() => expect(actions.addMemberWithCurrentTitle).toHaveBeenCalledOnce())
    const payload = actions.addMemberWithCurrentTitle.mock.calls[0][0] as FormData
    expect(Object.fromEntries(payload.entries())).toEqual({
      staff_id: 'mei', source_scheme_id: 'fair-scheme', scheme_id: 'ir-scheme',
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Mei Ting added to Revenue / IR. Existing memberships are kept.')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Mei Ting to department' })).toBeInTheDocument()
    expect(actions.removeMember).not.toHaveBeenCalled()
    expect(actions.setStaffRank).not.toHaveBeenCalled()
    expect(actions.addMember).not.toHaveBeenCalled()
  })
})
