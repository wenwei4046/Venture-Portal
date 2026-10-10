import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

// 2026-10-09 — Settings' Chart of Accounts and Departments tables per the
// user's Claude Design handoff (Phase 4 of the Finance revamp). Accounts: one
// table, a band per account type, sub-accounts under their parent with the
// count beside it, the cash-flow category, a status chip, Search, Show
// inactive, + New account. Departments: Segment, Pool GL with its name, the
// billing mode in words, the Mode as a chip (a switch for whoever may
// switch), Bill back salary as a tick, + New department.

// 2026-10-10 — the audit's fixes: Show inactive, + New account and + New
// department sit in the page head beside the title (they were in the band
// over the table), and the Departments table is a sheet table (▽ filters,
// widths, a default arrangement) with every control kept in it.

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
// The saved column layout is fetched from the browser client; here it has none.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
}))

import AccountsSection from './AccountsSection'
import DepartmentsSection from './DepartmentsSection'

const HEAD = <h1 className="page-title">Settings page</h1>

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
    fireEvent.click(screen.getByRole('button', { name: '+ New account' }))
    expect(screen.getByRole('dialog', { name: 'New account' })).toBeInTheDocument()
  })

  it('puts Show inactive and + New account in the page head, beside the title, and what the page puts under it', () => {
    render(<AccountsSection accounts={ACCOUNTS} head={HEAD} intro={<div data-testid="cards" />} />)
    const head = screen.getByRole('heading', { level: 1, name: 'Settings page' }).closest('.page-head') as HTMLElement
    expect(within(head).getByRole('button', { name: 'Show inactive' })).toBeInTheDocument()
    expect(within(head).getByRole('button', { name: '+ New account' })).toBeInTheDocument()
    expect(head.nextElementSibling).toBe(screen.getByTestId('cards'))
    // The band over the table keeps the search and the folding.
    const band = screen.getByRole('searchbox', { name: 'Search code or name' }).closest('.gl-toolbar') as HTMLElement
    expect(within(band).getByRole('button', { name: 'Collapse all' })).toBeInTheDocument()
    expect(within(band).queryByRole('button', { name: 'Show inactive' })).toBeNull()
    fireEvent.click(within(head).getByRole('button', { name: 'Show inactive' }))
    expect(within(head).getByRole('button', { name: 'Hide inactive' })).toBeInTheDocument()
    expect(screen.getByText('Cash — RHB (closed)')).toBeInTheDocument()
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

  it('puts + New department in the page head, beside the title', () => {
    render(<DepartmentsSection departments={DEPTS} head={HEAD} intro={<div data-testid="cards" />} />)
    const head = screen.getByRole('heading', { level: 1, name: 'Settings page' }).closest('.page-head') as HTMLElement
    fireEvent.click(within(head).getByRole('button', { name: '+ New department' }))
    expect(within(head).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByLabelText('Department name')).toBeInTheDocument()
    expect(head.nextElementSibling).toBe(screen.getByTestId('cards'))
  })

  it('is a sheet table: ▽ filters on every column but Actions, in a scroll box', () => {
    render(<DepartmentsSection departments={DEPTS} modes={[mode('d1', 'Marketing', 'centralized'), mode('d2', 'Finance', 'cost_center')]} />)
    expect(screen.getByRole('table').closest('.st-box')).not.toBeNull()
    for (const name of ['Name', 'Segment', 'Pool GL', 'Billing mode', 'Mode', 'Bill back salary']) {
      expect(screen.getByRole('button', { name: `Filter ${name}` })).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: 'Filter Actions' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Filter Mode' }))
    const pick = screen.getByRole('dialog', { name: 'Filter Mode' })
    expect(within(pick).getByText('cost center')).toBeInTheDocument()
    expect(within(pick).getByText('centralized')).toBeInTheDocument()
  })

  it('keeps the provision flow and the bill-back tick in the table', async () => {
    const actions = await import('../actions')
    render(<DepartmentsSection departments={DEPTS} />)
    const ops = screen.getByText('Operations').closest('tr') as HTMLElement
    fireEvent.click(within(ops).getByRole('button', { name: 'Provision' }))
    expect(within(ops).getByLabelText('Segment key')).toHaveValue('operations')
    expect(within(ops).getByRole('button', { name: 'Confirm' })).toBeEnabled()
    fireEvent.click(within(ops).getByRole('button', { name: 'Cancel' }))
    expect(within(ops).getByRole('button', { name: 'Provision' })).toBeInTheDocument()
    expect(screen.getByText('Marketing').closest('tr')).toHaveTextContent('Full department')

    fireEvent.click(within(screen.getByText('Finance').closest('tr') as HTMLElement).getByRole('checkbox'))
    await vi.waitFor(() => expect(actions.setDepartmentBillback).toHaveBeenCalledTimes(1))
    const fd = vi.mocked(actions.setDepartmentBillback).mock.calls[0][0] as FormData
    expect(fd.get('id')).toBe('d2')
    expect(fd.get('own_share_billback')).toBe('true')
  })

  it('lets the arrangement be kept as the default by whoever may', () => {
    render(<DepartmentsSection departments={DEPTS} canSetDefault />)
    fireEvent.click(screen.getByRole('button', { name: /Columns/ }))
    expect(screen.getByRole('button', { name: '设为预设' })).toBeInTheDocument()
  })
})
