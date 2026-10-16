import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { AttConfig, AttLedger, AttPerson } from '@/lib/attendance/types'

// Leave balances' People list by department (2026-10-16, the user, circling the
// list: "i need can be select by department, might be drop down") — Records'
// own dropdown, the pills counting inside the department picked.

vi.mock('@/lib/attendance/actions', () => ({}))
vi.mock('./LedgerPanel', () => ({ LedgerPanel: () => null }))

import BalancesView from './BalancesView'

const person = (id: string, name: string, departmentId: string, department: string): AttPerson => ({
  id, name, code: null, titleId: null, title: null, level: null, levelName: null, departmentId, department,
  hireDate: null, hasLogin: false, uplineId: null, upline: null, uplineHasLogin: null, templateId: null,
})

const config = {
  today: '2026-10-16', now: '2026-10-16T05:00:00Z', canCreate: true, canEdit: true, canApprove: true, me: '',
  people: [
    person('p1', 'ANTHONY', 'd-rev', 'Revenue Department'),
    person('p2', 'BOON YEW FENG', 'd-mkt', 'Marketing'),
    person('p3', 'CHIN YEE RU', 'd-mkt', 'Marketing'),
  ],
  titles: [], levels: [],
  departments: [{ id: 'd-mkt', name: 'Marketing' }, { id: 'd-rev', name: 'Revenue Department' }],
  schedules: [], locations: [], holidays: [], assignments: [], leaveTypes: [], otRates: [], policies: [], routes: [],
} as unknown as AttConfig

const ledger: AttLedger = { year: 2026, entries: [], leave: [], marks: [] }

afterEach(cleanup)

describe('Leave balances › People by department', () => {
  it('offers every department, and lists only the one picked — the pills counting inside it', () => {
    render(<BalancesView config={config} ledger={ledger} />)
    const select = screen.getByLabelText('Department') as HTMLSelectElement
    expect(Array.from(select.options).map(o => o.text)).toEqual(['All departments', 'Marketing', 'Revenue Department'])
    expect(screen.getByText('ANTHONY')).toBeInTheDocument()
    expect(screen.getByText('BOON YEW FENG')).toBeInTheDocument()

    fireEvent.change(select, { target: { value: 'd-mkt' } })
    expect(screen.queryByText('ANTHONY')).toBeNull()
    expect(screen.getByText('BOON YEW FENG')).toBeInTheDocument()
    expect(screen.getByText('CHIN YEE RU')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^All\s*2$/ })).toBeInTheDocument()

    fireEvent.change(select, { target: { value: 'all' } })
    expect(screen.getByText('ANTHONY')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^All\s*3$/ })).toBeInTheDocument()
  })

  it('searches inside the department', () => {
    render(<BalancesView config={config} ledger={ledger} />)
    fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'd-mkt' } })
    fireEvent.change(screen.getByPlaceholderText('Search name'), { target: { value: 'chin' } })
    expect(screen.getByText('CHIN YEE RU')).toBeInTheDocument()
    expect(screen.queryByText('BOON YEW FENG')).toBeNull()
  })
})
