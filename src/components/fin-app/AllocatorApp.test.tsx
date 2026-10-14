import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { AllocatorData, TxnRow } from '@/app/(portal)/billing-allocator/_components/types'
import type { PageAllocation } from '@/app/(portal)/billing-allocator/[id]/_components/AllocationPage'

// Daily › Billing in the Finance phone app (2026-10-15, M12): the hub's notice
// and four cards, Records, an allocation (the drawer's parts and its audit
// log, its steps), Calculate as a screen of its own, Staff's and Setup's
// lines — each write the allocator's own action, each window the desktop's.

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), flash: vi.fn(), openPage: vi.fn(), generate: vi.fn(), calc: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: mocks.replace }),
  usePathname: () => '/fin-app/daily/billing',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))
vi.mock('@/components/hrv/toast', async (orig) => ({ ...(await orig<object>()), flash: mocks.flash }))
vi.mock('@/app/(portal)/billing-allocator/page-actions', () => ({ openAllocationPage: mocks.openPage }))
vi.mock('@/app/(portal)/billing-allocator/actions', () => ({
  generateAllocatorInvoices: mocks.generate,
  deleteAllocTxn: vi.fn(),
  saveAllocSnapshot: vi.fn(),
  getAllocSnapshot: vi.fn(),
  setAllocCompanyEnabled: vi.fn(),
}))
vi.mock('@/app/(portal)/billing-allocator/_components/AllocationCalc', () => ({
  useAllocationCalc: (p: { edit: TxnRow | null }) => {
    mocks.calc(p.edit?.txnNo ?? null)
    return { busy: false, title: p.edit ? `Correct ${p.edit.txnNo}` : 'New allocation', steps: [{ key: 'save', label: 'Save allocation', primary: true, off: true, onClick: () => {} }], body: <div data-testid="calc-body" /> }
  },
}))
vi.mock('@/app/(portal)/billing-allocator/_components/StaffDialogs', async (orig) => ({
  ...(await orig<object>()),
  StaffDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="staff-dialog" /> : null),
  SnapshotDialog: () => null,
  ImportDialog: () => null,
}))
vi.mock('@/app/(portal)/billing-allocator/_components/SetupDialogs', () => ({ CategoryDialog: () => null, TemplateDialog: () => null }))

import FinAppFrame from './FinAppFrame'
import AllocatorApp from './AllocatorApp'
import { resetNav } from './nav'

const share = (companyId: string | null, label: string, amount: number, detail: string, own = false) => ({ companyId, companyLabel: label, detail, amount, isOwnShare: own })
const TXNS: TxnRow[] = [
  {
    id: 't1', txnNo: 'ALC-202610-001', description: 'Office Rental', billedRef: 'ALC-202610', locked: true, amount: 18980, method: 'headcount',
    categoryId: 'cat-rent', categoryName: 'Rental', hcPeriod: '2026-10', createdAt: '2026-10-01T02:00:00Z',
    details: [share('co-2990', '2990', 742.32, 'Head: 2.00/48.00'), share('co-car', 'CAR', 3681.57, 'Head: 9.31/48.00'), share(null, 'HOUZS Venture (own)', 366.59, 'Head: 0.93/48.00', true)],
  },
  {
    id: 't6', txnNo: 'ALC-202610-006', description: "AI TOOLS-SEP'2026", billedRef: null, locked: false, amount: 2149.2, method: 'percentage',
    categoryId: 'cat-web', categoryName: 'Website & Software', hcPeriod: null, createdAt: '2026-10-03T02:00:00Z',
    details: [share('co-2990', '2990', 429.84, '20%'), share('co-car', 'CAR', 859.68, '40%'), share(null, 'HOUZS Venture (own)', 859.68, '40% (own)', true)],
  },
]
const DATA: AllocatorData = {
  period: '2026-10',
  companies: [
    { id: 'co-2990', label: '2990' },
    { id: 'co-car', label: 'CAR' },
  ],
  companySettings: [
    { id: 'co-2990', label: '2990', name: '2990 Sdn Bhd', code: '2990', enabled: true },
    { id: 'co-car', label: 'CAR', name: 'Carres', code: 'CAR', enabled: false },
  ],
  departments: [],
  staff: [{ id: 's1', name: 'Carrie Ong', status: 'active', department: 'Finance', createdAt: '2026-09-04T02:00:00Z', splits: [{ targetId: 'co-2990', label: '2990', pct: 100 }] }],
  snapshotPeriods: ['2026-09'],
  hrPeriods: [],
  snapshotSplitsByPeriod: {},
  coaAccounts: [],
  categories: [
    { id: 'cat-rent', name: 'Rental', coaCode: '7012' },
    { id: 'cat-web', name: 'Website & Software', coaCode: '' },
  ],
  templates: [],
  txns: TXNS,
  invoices: [
    { id: 'i7', invoiceNo: 'HV-INV-202610-0007', companyId: 'co-2990', companyLabel: '2990', status: 'issued', ref: 'ALC-202610' },
    { id: 'i8', invoiceNo: 'HV-INV-202610-0008', companyId: 'co-car', companyLabel: 'CAR', status: 'paid', ref: 'ALC-202610' },
  ],
}
const PAGE = (id: string): PageAllocation => ({
  id,
  no: 'ALC-202610-006',
  period: '2026-10',
  description: "AI TOOLS-SEP'2026",
  amount: 2149.2,
  method: 'percentage',
  category: null,
  hcPeriod: null,
  billedRef: null,
  billed: false,
  createdAt: '2026-10-03T02:00:00Z',
  createdBy: 'Ong Mei Shuang',
  lines: [],
  invoices: [],
  audit: [{ at: '03 Oct 2026 · 10:00', who: 'Ong Mei Shuang', what: 'Created ALC-202610-006 · RM 2,149.20' }],
})

const draw = (search = '', can = { create: true, edit: true }) =>
  render(
    <FinAppFrame platform="android" rows={['payments', 'receipts', 'invoices', 'billing']}>
      <AllocatorApp data={DATA} can={can} search={search} thisMonth="2026-10" record={null} refused={null} />
    </FinAppFrame>,
  )

beforeEach(() => {
  resetNav()
  window.history.replaceState(null, '', '/fin-app/daily/billing')
  mocks.openPage.mockImplementation(async (id: string) => ({ ok: true, page: PAGE(id) }))
})
afterEach(() => vi.clearAllMocks())

describe('Daily › Billing on the phone', () => {
  it('opens on the hub: the month allocated, the notice of what is to bill, four cards, the design’s two steps', () => {
    draw()
    expect(screen.getByRole('link', { name: 'Billing' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('RM 21,129.20')).toBeInTheDocument()
    expect(screen.getByText('Allocated · October 2026')).toBeInTheDocument()
    expect(screen.getByText(/To bill RM 1,289\.52 across 2 companies/)).toBeInTheDocument()
    for (const name of [/^Records/, /^By company/, /^Staff/, /^Setup/]) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate invoices' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ New allocation' })).toBeInTheDocument()
  })

  it('Generate invoices asks first, with the month’s figures', async () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Generate invoices' }))
    expect(await screen.findByText(/Bills RM 1,289\.52 across 2 companies as one draft invoice each/)).toBeInTheDocument()
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it('Records opens an allocation: the drawer’s parts, its audit log, Generate · Correct · ⋯', async () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /^Records/ }))
    expect(window.location.search).toBe('?f=records')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /AI TOOLS-SEP'2026/ }))
    })
    expect(window.location.search).toBe('?id=t6&from=records')
    expect(mocks.openPage).toHaveBeenCalledWith('t6')
    expect(screen.getByText('Split by company')).toBeInTheDocument()
    expect(screen.getByText('Created ALC-202610-006 · RM 2,149.20')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Correct' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Delete allocation' })).toBeInTheDocument()
  })

  it('Correct is Calculate, a screen of its own, the record loaded into it', async () => {
    window.history.replaceState(null, '', '/fin-app/daily/billing?id=t6&from=records')
    await act(async () => {
      draw('id=t6&from=records')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Correct' }))
    expect(window.location.search).toBe('?f=calc&edit=t6')
    expect(mocks.calc).toHaveBeenLastCalledWith('ALC-202610-006')
    expect(screen.getByTestId('calc-body')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Correct ALC-202610-006' })).toBeInTheDocument()
  })

  it('a billed allocation opens its invoice in the app', async () => {
    window.history.replaceState(null, '', '/fin-app/daily/billing?id=t1&from=records')
    await act(async () => {
      draw('id=t1&from=records')
    })
    fireEvent.click(screen.getByRole('button', { name: 'View invoices · 2' }))
    const menu = await screen.findByRole('menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: /HV-INV-202610-0008/ }))
    expect(mocks.push).toHaveBeenCalledWith('/fin-app/daily/invoices?id=i8')
  })

  it('Setup: each company with its state and the step to turn it, the reader may edit', () => {
    window.history.replaceState(null, '', '/fin-app/daily/billing?f=setup')
    draw('f=setup')
    expect(screen.getByText('1 / 2 enabled')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add category' })).toBeInTheDocument()
  })

  it('a reader who may not edit sees Staff without its steps', () => {
    window.history.replaceState(null, '', '/fin-app/daily/billing?f=staff')
    draw('f=staff', { create: false, edit: false })
    expect(screen.getByText('Carrie Ong · Finance')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Add staff' })).not.toBeInTheDocument()
  })
})
