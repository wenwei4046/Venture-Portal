import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TeamData } from '../../../_components/config/types'
import type { SubDeptRequest } from '@/lib/commission/sales-group-requests'

// Sales Groups (2026-10-10, the HR revamp): Chart · Members N · Waiting list
// N · Replacement list N on one URL; the chart shows this sub-department
// alone until "Show … alongside"; the two lists only for whoever may read
// member requests.

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }))
const chart = vi.hoisted(() => ({ departments: [] as Array<{ name: string }> }))
vi.mock('next/navigation', () => ({ useSearchParams: () => nav.params, useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('./OrgChart', () => ({
  default: ({ departments, toolbarToggle }: { departments: Array<{ name: string }>; toolbarToggle?: React.ReactNode }) => {
    chart.departments = departments
    return (
      <div data-testid="chart">
        {toolbarToggle}
        {departments.map(d => d.name).join(',')}
      </div>
    )
  },
}))
vi.mock('../../../hierarchy-actions', () => ({}))
vi.mock('../../../employee-actions', () => ({}))
vi.mock('@/components/hrv/toast', () => ({ flash: vi.fn() }))

import SalesGroupsView, { salesGroupsTab } from './SalesGroupsView'

const team = {
  subDepartmentId: 'fair',
  homeStaffIds: [],
  ranks: [],
  people: [{ staff_id: 'a' }, { staff_id: 'b' }],
  titles: [],
  candidates: [],
  directors: [],
  directorCandidates: [],
} as unknown as TeamData

const dept = (id: string, name: string, schemeId: string, people: number) =>
  ({ id, name, slug: name.toLowerCase(), schemeId, isHome: id === 'fair', people: Array.from({ length: people }, (_, i) => ({ staffId: `${id}-${i}` })), ranks: [], directors: [] }) as never

const req = (over: Partial<SubDeptRequest>): SubDeptRequest =>
  ({ id: 'r', requestNo: 'RQ-2610-001', kind: 'waiting', status: 'waiting', createdAt: '2026-10-01T00:00:00Z', submittedAt: null, submittedBy: 'CHEA HUAN',
    newPerson: 'Amelia Tan', contact: '012-345 6789', start: '2026-10-20', signature: 'Amelia Tan', original: null, destination: null,
    replacementSource: null, effective: null, reason: null, target: null, acceptedAt: '2026-10-02T00:00:00Z', events: [], ...over })

function renderView(requests: Parameters<typeof SalesGroupsView>[0]['requests'] = { ok: true, rows: [req({}), req({ id: 'x', kind: 'replacement', status: 'submitted', original: 'LOUIS' })] }) {
  return render(
    <SalesGroupsView
      subDept={{ name: 'Fair', slug: 'fair', isHome: true }}
      schemeId="fair-scheme"
      team={team}
      departments={[dept('fair', 'Fair', 'fair-scheme', 25), dept('ir', 'IR', 'ir-scheme', 20)]}
      membershipDestinations={[]}
      canEdit
      requests={requests}
      head={<h1>Sales Groups</h1>}
    />,
  )
}

beforeEach(() => {
  nav.params = new URLSearchParams()
  vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('salesGroupsTab', () => {
  it('opens the tab the URL names, the old ?tab=team as Members, and the chart otherwise', () => {
    expect(salesGroupsTab(null, true)).toBe('chart')
    expect(salesGroupsTab('team', true)).toBe('members')
    expect(salesGroupsTab('waiting', true)).toBe('waiting')
    expect(salesGroupsTab('waiting', false)).toBe('chart')
    expect(salesGroupsTab('nonsense', true)).toBe('chart')
  })
})

describe('SalesGroupsView', () => {
  it('names the four tabs with their counts', () => {
    renderView()
    const tabs = within(screen.getByRole('tablist', { name: 'Sales Groups' })).getAllByRole('tab').map(t => t.textContent)
    expect(tabs).toEqual(['Chart', 'Members2', 'Waiting list1', 'Replacement list1'])
  })

  it('charts this sub-department alone until its siblings are shown alongside', () => {
    renderView()
    expect(chart.departments.map(d => d.name)).toEqual(['Fair'])
    fireEvent.click(screen.getByRole('switch', { name: 'Show IR alongside' }))
    expect(chart.departments.map(d => d.name)).toEqual(['Fair', 'IR'])
  })

  it('pushes the tab into the URL', () => {
    renderView()
    fireEvent.click(screen.getByRole('tab', { name: /Waiting list/ }))
    expect(window.history.pushState).toHaveBeenCalledWith(null, '', '?tab=waiting')
  })

  it('leaves the two lists out for an account that may not read member requests', () => {
    nav.params = new URLSearchParams('tab=waiting')
    renderView(null)
    expect(within(screen.getByRole('tablist', { name: 'Sales Groups' })).getAllByRole('tab').map(t => t.textContent)).toEqual(['Chart', 'Members2'])
    expect(screen.getByTestId('chart')).toBeInTheDocument()
  })

  it('says why the lists could not be read', () => {
    nav.params = new URLSearchParams('tab=replacement')
    renderView({ ok: false, reason: 'The requests could not be read. Please try again.' })
    expect(screen.getByRole('alert')).toHaveTextContent('The requests could not be read. Please try again.')
  })
})
