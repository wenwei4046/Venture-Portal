import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

// 2026-10-09 — Settings' Chart of Accounts and Departments tables per the
// user's Claude Design handoff (Phase 4 of the Finance revamp). Accounts: one
// table, a band per account type, sub-accounts under their parent with the
// count beside it, the cash-flow category, a status chip, Search, Show
// inactive, + New account. Departments: Segment, Pool GL with its name, the
// billing mode in words, the Mode as a chip (a switch for whoever may
// switch), Bill back salary as a tick, + New department.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('../actions', () => ({
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  moveAccount: vi.fn(),
  addDepartment: vi.fn(),
  provisionDepartment: vi.fn(),
  setDepartmentBillback: vi.fn(),
}))
vi.mock('../department-mode-actions', () => ({ setDepartmentCostModel: vi.fn() }))

import AccountsSection from './AccountsSection'
import DepartmentsSection from './DepartmentsSection'

const acc = (code: string, name: string, type: string, parent_code: string | null, is_active = true) => ({
  code, name, type: type as 'asset', cash_flow_category: 'operating' as const, parent_code, is_active, sort_order: 0,
})
const ACCOUNTS = [
  acc('1000', 'Current assets', 'asset', null),
  acc('1010', 'Cash — Hong Leong', 'asset', '1000'),
  acc('1040', 'Cash — RHB (closed)', 'asset', '1000', false),
  acc('4100', 'Interest income', 'revenue', null),
  acc('4101', 'Loan interest', 'revenue', '4100'),
]

describe('the Chart of Accounts table', () => {
  it('bands the accounts by type in one table, sub-accounts under their parent', () => {
    render(<AccountsSection accounts={ACCOUNTS} />)
    const table = screen.getByRole('table')
    expect(within(table).getByText('Asset accounts').closest('tr')).toHaveClass('tb-block')
    expect(within(table).getByText('Revenue accounts').closest('tr')).toHaveClass('tb-block')
    const parent = within(table).getByText('Current assets').closest('tr') as HTMLElement
    expect(parent).toHaveTextContent('2 sub-accounts')
    const cash = within(table).getByText('Cash — Hong Leong').closest('tr') as HTMLElement
    expect(cash).toHaveTextContent('1010')
    expect(cash).toHaveTextContent('Operating')
    expect(within(cash).getByText('active').closest('.chip')).toHaveClass('ledger')
    expect(within(table).queryByText('Cash — RHB (closed)')).toBeNull()
    expect(screen.getByText('4 SHOWN')).toBeInTheDocument()
  })

  it('shows the inactive ones on request, and finds by code or name', () => {
    render(<AccountsSection accounts={ACCOUNTS} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show inactive' }))
    const closed = screen.getByText('Cash — RHB (closed)').closest('tr') as HTMLElement
    expect(within(closed).getByText('inactive').closest('.chip')).not.toHaveClass('ledger')

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search code or name' }), { target: { value: 'loan' } })
    expect(screen.getByText('Loan interest')).toBeInTheDocument()
    expect(screen.getByText('Interest income')).toBeInTheDocument() // its parent stays for the tree
    expect(screen.queryByText('Cash — Hong Leong')).toBeNull()
  })

  it('offers + New account', () => {
    render(<AccountsSection accounts={ACCOUNTS} />)
    expect(screen.getByRole('button', { name: '+ New account' })).toBeInTheDocument()
  })
})

const dept = (id: string, name: string, segment_key: string | null, pool_gl_code: string | null, billing_mode_key: string | null, own_share_billback = false, is_internal = false) => ({
  id, name, is_internal, created_at: null, segment_key, pool_gl_code, billing_mode_key, own_share_billback,
})
const mode = (id: string, name: string, costModel: 'cost_center' | 'centralized', canSwitch = false) => ({
  id, name, segmentKey: name.toLowerCase(), isInternal: false, costModel, openSplitPeople: 0, canSwitch,
})

describe('the Departments table', () => {
  const DEPTS = [
    dept('d1', 'Marketing', 'marketing', '3120', 'marketing_project', true),
    dept('d2', 'Finance', 'finance', '3140', 'finance_attribution'),
    dept('d3', 'Operations', null, null, null),
  ]

  it('names the pool account and the billing mode, the mode as a chip', () => {
    render(<DepartmentsSection departments={DEPTS} modes={[mode('d1', 'Marketing', 'centralized'), mode('d2', 'Finance', 'cost_center')]} poolNames={{ '3120': 'Marketing pool' }} />)
    expect(screen.getByText('3 ACTIVE')).toBeInTheDocument()
    const mk = screen.getByText('Marketing').closest('tr') as HTMLElement
    expect(mk).toHaveTextContent('3120 · Marketing pool')
    expect(mk).toHaveTextContent('Marketing project')
    expect(within(mk).getByText('centralized').closest('.chip')).toHaveClass('info')
    expect(within(mk).getByRole('checkbox')).toBeChecked()
    const fin = screen.getByText('Finance').closest('tr') as HTMLElement
    expect(within(fin).getByText('cost center').closest('.chip')).toHaveClass('accent')
    expect(within(fin).getByRole('checkbox')).not.toBeChecked()
    const ops = screen.getByText('Operations').closest('tr') as HTMLElement
    expect(within(ops).getByRole('button', { name: 'Provision' })).toBeInTheDocument()
  })

  it('keeps the switch for whoever may switch the mode', () => {
    render(<DepartmentsSection departments={DEPTS} modes={[mode('d1', 'Marketing', 'centralized', true)]} />)
    expect(screen.getByRole('switch', { name: 'Marketing is centralized' })).toBeInTheDocument()
  })

  it('opens + New department', () => {
    render(<DepartmentsSection departments={DEPTS} />)
    fireEvent.click(screen.getByRole('button', { name: '+ New department' }))
    expect(screen.getByLabelText('Department name')).toBeInTheDocument()
  })
})
