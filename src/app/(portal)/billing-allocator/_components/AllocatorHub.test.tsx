import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { AllocatorData, TxnRow } from './types'

// The Billing Allocator's hub (2026-10-14, the Finance revamp v2 — D11): the
// head's Generate invoices and + New allocation, the month's total with its
// pill, the notice of what is still to bill, the four cards and the list each
// opens, the record's drawer with the system's steps (Generate invoices bills
// the month's unbilled allocations together; Correct loads the record into
// Calculate; a billed one shows its invoices), and Staff's and Setup's own
// buttons — each write the allocator's own action, each refusal said.

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  flash: vi.fn(),
  generate: vi.fn(),
  del: vi.fn(),
  snapshot: vi.fn(),
  getSnapshot: vi.fn(),
  enable: vi.fn(),
  dialog: vi.fn(),
}))
const { marker } = vi.hoisted(() => ({
  marker: (name: string) =>
    function Marker(props: Record<string, unknown>) {
      mocks.dialog(name, props)
      return <div data-testid={`dialog-${name}`} />
    },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock('@/components/hrv/toast', () => ({ flash: mocks.flash }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }), upsert: async () => ({ error: null }), delete: () => ({ eq: async () => ({ error: null }) }) }
      return q
    },
  }),
}))
vi.mock('../actions', () => ({
  generateAllocatorInvoices: mocks.generate,
  deleteAllocTxn: mocks.del,
  saveAllocSnapshot: mocks.snapshot,
  getAllocSnapshot: mocks.getSnapshot,
  setAllocCompanyEnabled: mocks.enable,
}))
vi.mock('./AllocationCalc', () => ({ default: marker('calc') }))
vi.mock('./StaffDialogs', async (orig) => ({
  ...(await orig<typeof import('./StaffDialogs')>()),
  StaffDialog: marker('staff'),
  SnapshotDialog: marker('snapshot'),
  ImportDialog: marker('import'),
}))
vi.mock('./SetupDialogs', () => ({ CategoryDialog: marker('category'), TemplateDialog: marker('template') }))

import AllocatorHub from './AllocatorHub'

const head = (companyId: string | null, label: string, amount: number, detail: string, own = false) => ({ companyId, companyLabel: label, detail, amount, isOwnShare: own })
const TXNS: TxnRow[] = [
  {
    id: 't1', txnNo: 'ALC-202609-001', description: 'Office Rental', billedRef: 'ALC-202609', locked: true, amount: 18980, method: 'headcount',
    categoryId: 'cat-rent', categoryName: 'Rental', hcPeriod: '2026-09', createdAt: '2026-09-01T02:00:00Z',
    details: [
      head('co-2990', '2990', 742.32, 'Head: 2.00/48.00 (2026-09)'),
      head('co-car', 'CAR', 3681.57, 'Head: 9.31/48.00 (2026-09)'),
      head('dept:mkt', 'Marketing (dept)', 4745, 'Head: 12.00/48.00 (2026-09)'),
      head(null, 'HOUZS Venture (own)', 366.59, 'Head: 0.93/48.00 (2026-09)', true),
    ],
  },
  {
    id: 't5', txnNo: 'ALC-202609-005', description: 'AI TOOLS - JUL26', billedRef: 'ALC-202609-3', locked: true, amount: 1863.18, method: 'percentage',
    categoryId: 'cat-web', categoryName: 'Website & Software', hcPeriod: null, createdAt: '2026-09-02T02:00:00Z',
    details: [head('co-2990', '2990', 372.64, '20%'), head('co-car', 'CAR', 745.27, '40%'), head(null, 'HOUZS Venture (own)', 745.27, '40% (own)', true)],
  },
  {
    id: 't6', txnNo: 'ALC-202609-006', description: "AI TOOLS-SEP'2026", billedRef: 'ALC-202609-4', locked: false, amount: 2149.2, method: 'percentage',
    categoryId: 'cat-web', categoryName: 'Website & Software', hcPeriod: null, createdAt: '2026-09-03T02:00:00Z',
    details: [head('co-2990', '2990', 429.84, '20%'), head('co-car', 'CAR', 859.68, '40%'), head(null, 'HOUZS Venture (own)', 859.68, '40% (own)', true)],
  },
]
const inv = (id: string, no: string, companyId: string, label: string, status: string, ref: string) => ({ id, invoiceNo: no, companyId, companyLabel: label, status, ref })
const DATA: AllocatorData = {
  period: '2026-09',
  companies: [
    { id: 'co-2990', label: '2990' },
    { id: 'co-car', label: 'CAR' },
  ],
  companySettings: [
    { id: 'co-2990', label: '2990', name: '2990 Sdn Bhd', code: '2990', enabled: true },
    { id: 'co-car', label: 'CAR', name: 'Carres', code: 'CAR', enabled: true },
    { id: 'co-hk', label: 'HK', name: 'Hookka', code: 'HK', enabled: false },
  ],
  departments: [{ id: 'dept:mkt', label: 'Marketing (dept)' }],
  staff: [
    { id: 's1', name: 'Carrie Ong', status: 'active', department: 'Finance', createdAt: '2026-09-04T02:00:00Z', splits: [{ targetId: null, label: 'HOUZS Venture (own)', pct: 30 }, { targetId: 'co-2990', label: '2990', pct: 70 }] },
    { id: 's2', name: 'Ah Kow', status: 'inactive', department: '', createdAt: '2026-08-01T02:00:00Z', splits: [] },
  ],
  snapshotPeriods: ['2026-09', '2026-08'],
  hrPeriods: ['2026-09'],
  snapshotSplitsByPeriod: {},
  coaAccounts: [{ code: '7012', name: 'Rental Income', type: 'other_income', parent_code: null, is_active: true }],
  categories: [
    { id: 'cat-rent', name: 'Rental', coaCode: '7012' },
    { id: 'cat-web', name: 'Website & Software', coaCode: '' },
  ],
  templates: [{ id: 'tp1', name: 'Office Rental', method: 'headcount', amount: 18980, categoryId: 'cat-rent', status: 'active', splits: [] }],
  txns: TXNS,
  invoices: [
    inv('i7', 'HV-INV-202609-0007', 'co-2990', '2990', 'issued', 'ALC-202609'),
    inv('i8', 'HV-INV-202609-0008', 'co-car', 'CAR', 'paid', 'ALC-202609'),
    inv('i13', 'HV-INV-202609-0013', 'dept:mkt', 'Marketing (dept)', 'paid_via_netting', 'ALC-202609'),
    inv('i30', 'HV-INV-202609-0030', 'co-2990', '2990', 'issued', 'ALC-202609-3'),
  ],
}

const both = { create: true, edit: true }
const show = (props: Partial<Parameters<typeof AllocatorHub>[0]> = {}) =>
  render(<AllocatorHub data={DATA} can={both} canSetDefault thisMonth="2026-10" initialCard="records" {...props} />)
const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0))
})
const card = (name: RegExp) => screen.getAllByRole('button').find((b) => name.test(b.textContent ?? '') && b.getAttribute('aria-pressed') !== null)!
const drawer = () => document.querySelector('[data-fin-drawer] [role="dialog"]') as HTMLElement
const dialog = () => [...document.querySelectorAll('[data-fin-dialog] [role="dialog"]')].pop() as HTMLElement
const rowOf = (text: string) => screen.getAllByRole('row').find((r) => r.textContent?.includes(text))!

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/billing-allocator?period=2026-09')
})

describe('the Billing Allocator’s hub', () => {
  it('heads the page the design’s way: Generate invoices first while something is to bill, the month’s total, the notice', () => {
    show()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Billing Allocator')
    expect(screen.getByText('Daily · Billing Allocator')).toBeInTheDocument()
    const gen = screen.getByRole('button', { name: 'Generate invoices' })
    const add = screen.getByRole('button', { name: '+ New allocation' })
    expect(gen).toHaveAttribute('data-kind', 'primary')
    expect(add).not.toHaveAttribute('data-kind')
    expect(screen.getByText('Allocated · September 2026')).toBeInTheDocument()
    expect(screen.getByText('RM 22,992.38')).toBeInTheDocument()
    expect(screen.getByText('To bill RM 1,289.52 across 2 companies — Generate invoices bills every company’s share in one go.')).toBeInTheDocument()
  })

  it('counts each card the design’s way: Records, By company, Staff, Setup', () => {
    show()
    expect(card(/^Records/)).toHaveTextContent('Records3 expenses · 1 to billRM 1,289.52 to bill')
    expect(card(/^By company/)).toHaveTextContent('By company3 companies · 2 with a balanceRM 10,286.80 billed')
    expect(card(/^Staff/)).toHaveTextContent('Staff2 people1 active')
    expect(card(/^Setup/)).toHaveTextContent('Setup1 template · 2 categories2 / 3 companies')
    expect(card(/^Records/)).toHaveAttribute('aria-pressed', 'true')
  })

  it('with nothing to bill, + New allocation is the primary; a reader who may not create sees neither', () => {
    const allBilled = { ...DATA, txns: TXNS.slice(0, 2) }
    const { unmount } = render(<AllocatorHub data={allBilled} can={both} canSetDefault thisMonth="2026-10" initialCard="records" />)
    expect(screen.queryByRole('button', { name: 'Generate invoices' })).toBeNull()
    expect(screen.getByRole('button', { name: '+ New allocation' })).toHaveAttribute('data-kind', 'primary')
    expect(screen.queryByText(/^To bill RM/)).toBeNull()
    unmount()
    show({ can: { create: false, edit: true } })
    expect(screen.queryByRole('button', { name: 'Generate invoices' })).toBeNull()
    expect(screen.queryByRole('button', { name: '+ New allocation' })).toBeNull()
  })

  it('lists the records as Name · Description · Amount, the month counted, and searches them', () => {
    show()
    expect(screen.getByText('3 expenses · Sep 2026')).toBeInTheDocument()
    expect(rowOf('Office Rental')).toHaveTextContent('Office RentalHeadcount split · ALC-202609RM 18,980.00')
    expect(rowOf("AI TOOLS-SEP'2026")).toHaveTextContent('Percentage split · not billed')
    fireEvent.change(screen.getByPlaceholderText('Search txn / description…'), { target: { value: '005' } })
    expect(screen.getAllByRole('row').filter((r) => r.textContent?.includes('split'))).toHaveLength(1)
  })

  it('opens a billed record in the drawer: what it was, its split, its invoices', () => {
    show()
    fireEvent.click(rowOf('Office Rental'))
    const d = drawer()
    expect(d).toHaveTextContent('Allocation · ALC-202609')
    expect(d).toHaveTextContent('billed')
    expect(d).toHaveTextContent('Office Rental · 01 Sep 2026')
    expect(d).toHaveTextContent('Billed — each company’s invoice carries its share. Delete or void those invoices on Invoice to undo.')
    expect(d).toHaveTextContent('Category7012 · Rental')
    expect(d).toHaveTextContent('Headcount fromSep 2026 snapshot')
    expect(d).toHaveTextContent('Companies3')
    expect(d).toHaveTextContent('Invoices3 invoices')
    expect(d).toHaveTextContent('MarketingRM 4,745.0012 staff · 25.0% · billed · HV-INV-202609-0013')
    expect(d).toHaveTextContent('HV own (not billed)RM 366.590.93 staff · 1.9% · kept')
    expect(d).toHaveTextContent('Billable totalRM 9,168.89')
    expect(within(d).getByRole('link', { name: 'View full page ↗' })).toHaveAttribute('href', '/billing-allocator/t1')
    expect(within(d).queryByRole('button', { name: 'Correct' })).toBeNull()
    fireEvent.click(within(d).getByRole('button', { name: 'View invoices · 3' }))
    const menu = dialog()
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'HV-INV-202609-00072990 · issued',
      'HV-INV-202609-0008CAR · paid',
      'HV-INV-202609-0013Marketing · paid via netting',
    ])
    fireEvent.click(within(menu).getAllByRole('menuitem')[1])
    expect(mocks.push).toHaveBeenCalledWith('/invoices/i8')
  })

  it('a billed record with one invoice links straight to it', () => {
    show()
    fireEvent.click(rowOf('AI TOOLS - JUL26'))
    expect(within(drawer()).getByRole('link', { name: 'View invoice HV-INV-202609-0030' })).toHaveAttribute('href', '/invoices/i30')
  })

  it('an unbilled record: Generate invoices asks first, bills the month’s unbilled allocations and says what it made', async () => {
    mocks.generate.mockResolvedValue({ created: [{ company: '2990', invoiceNo: 'HV-INV-202609-0041' }, { company: 'CAR', invoiceNo: 'HV-INV-202609-0042' }], skipped: [] })
    show()
    fireEvent.click(rowOf("AI TOOLS-SEP'2026"))
    const d = drawer()
    expect(d).toHaveTextContent('Allocation · not billed')
    expect(d).toHaveTextContent('Not billed yet. Correcting reloads it in Calculate; deleting removes it before any invoice is made.')
    fireEvent.click(within(d).getByRole('button', { name: 'Generate invoices' }))
    expect(dialog()).toHaveTextContent('Generate invoices?')
    expect(dialog()).toHaveTextContent('Bills RM 1,289.52 across 2 companies as one draft invoice each. 1 allocation becomes billed.')
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Generate invoices' }))
    await flush()
    expect(mocks.generate).toHaveBeenCalledWith('2026-09')
    expect(mocks.flash).toHaveBeenCalledWith('Invoices generated · HV-INV-202609-0041 + 1 more')
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('says why when Generate invoices is refused, in its question', async () => {
    mocks.generate.mockResolvedValue({ created: [], skipped: [], error: 'Every allocation of 2026-09 is billed — add a new expense, or delete a batch’s drafts to bill it again.' })
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Generate invoices' }))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Generate invoices' }))
    await flush()
    expect(dialog()).toHaveTextContent('Every allocation of 2026-09 is billed')
    expect(mocks.flash).not.toHaveBeenCalled()
  })

  it('Correct loads the record into Calculate; ⋯ deletes it, asked first', async () => {
    mocks.del.mockResolvedValue({})
    show()
    fireEvent.click(rowOf("AI TOOLS-SEP'2026"))
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Correct' }))
    expect(screen.getByTestId('dialog-calc')).toBeInTheDocument()
    expect(mocks.dialog).toHaveBeenLastCalledWith('calc', expect.objectContaining({ open: true, edit: expect.objectContaining({ id: 't6' }) }))
    fireEvent.click(rowOf("AI TOOLS-SEP'2026"))
    fireEvent.click(within(drawer()).getByRole('button', { name: 'More' }))
    fireEvent.click(within(dialog()).getByRole('menuitem', { name: 'Delete allocation' }))
    expect(dialog()).toHaveTextContent('Delete ALC-202609-006?')
    expect(dialog()).toHaveTextContent('Removes the allocation before any invoice is made.')
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }))
    await flush()
    expect(mocks.del).toHaveBeenCalledWith('t6')
    expect(mocks.flash).toHaveBeenCalledWith('Allocation deleted')
  })

  it('+ New allocation opens Calculate empty; a record sent back from its page opens it loaded, a billed one does not', () => {
    const { unmount } = show()
    fireEvent.click(screen.getByRole('button', { name: '+ New allocation' }))
    expect(mocks.dialog).toHaveBeenLastCalledWith('calc', expect.objectContaining({ open: true, edit: null }))
    unmount()
    mocks.dialog.mockClear()
    const second = show({ editId: 't6' })
    expect(mocks.dialog).toHaveBeenLastCalledWith('calc', expect.objectContaining({ edit: expect.objectContaining({ id: 't6' }) }))
    second.unmount()
    mocks.dialog.mockClear()
    show({ editId: 't1' })
    expect(mocks.dialog).not.toHaveBeenCalled()
  })

  it('a right-click on a record offers Open, a new tab, Correct and Delete — shut on a billed one', () => {
    show()
    fireEvent.contextMenu(rowOf('Office Rental'))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: /Correct/ })).toBeDisabled()
    expect(within(menu).getByRole('menuitem', { name: /Delete allocation/ })).toBeDisabled()
  })
})

describe('the hub’s other lists', () => {
  it('By company: each company’s share — what is still to bill in gold, else its share in green — and its invoices', () => {
    show({ initialCard: 'company' })
    expect(screen.getByText('Share by company')).toBeInTheDocument()
    const car = screen.getByText('CAR').parentElement!
    expect(car).toHaveTextContent('billed 4,426.84 · HV-INV-202609-0008')
    expect(within(car).getByText('to bill 859.68')).toHaveAttribute('data-tone', 'alert')
    const mkt = screen.getByText('Marketing').parentElement!
    expect(within(mkt).getByText('4,745.00')).toHaveAttribute('data-tone', 'ledger')
    expect(screen.queryByText('HV own')).toBeNull()
  })

  it('Staff: a row a person — name and department, splits and the day added, active or not — and the list’s own buttons', async () => {
    mocks.snapshot.mockResolvedValue({})
    mocks.getSnapshot.mockResolvedValue({ rows: [{ staffName: 'Carrie Ong', status: 'active', department: 'Finance', targetId: null, pct: 30 }], savedAt: '2026-09-30T06:00:00Z' })
    show({ initialCard: 'staff' })
    const carrie = screen.getByText('Carrie Ong · Finance').parentElement!
    expect(carrie).toHaveTextContent('HV own 30% · 2990 70% · added 04 Sep 2026')
    expect(within(carrie).getByText('active')).toHaveAttribute('data-tone', 'ledger')
    expect(within(screen.getByText('Ah Kow').parentElement!).getByText('inactive')).toHaveAttribute('data-tone', 'muted')
    fireEvent.click(within(carrie).getByRole('button', { name: 'Edit' }))
    expect(mocks.dialog).toHaveBeenLastCalledWith('staff', expect.objectContaining({ person: expect.objectContaining({ id: 's1' }) }))
    fireEvent.click(screen.getByRole('button', { name: '+ Add staff' }))
    expect(mocks.dialog).toHaveBeenLastCalledWith('staff', expect.objectContaining({ person: null }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Sep snapshot' }))
    await flush()
    expect(mocks.snapshot).toHaveBeenCalledWith('2026-09')
    expect(mocks.flash).toHaveBeenCalledWith('September 2026 snapshot saved · 2 people')
    fireEvent.click(screen.getByRole('button', { name: 'Import from HR' }))
    expect(mocks.dialog).toHaveBeenLastCalledWith('import', expect.objectContaining({ hrPeriods: ['2026-09'] }))
    fireEvent.click(screen.getByRole('button', { name: /Snapshots/ }))
    fireEvent.click(within(dialog()).getByRole('menuitem', { name: 'August 2026 snapshot' }))
    await flush()
    expect(mocks.getSnapshot).toHaveBeenCalledWith('2026-08')
    expect(mocks.dialog).toHaveBeenLastCalledWith('snapshot', expect.objectContaining({ period: '2026-08', savedAt: '2026-09-30T06:00:00Z' }))
  })

  it('Staff: searches by name, department or company', () => {
    show({ initialCard: 'staff' })
    fireEvent.change(screen.getByPlaceholderText('Search name / department / company…'), { target: { value: 'finance' } })
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    expect(screen.queryByText('Ah Kow')).toBeNull()
  })

  it('Setup: the companies switched on or off, the categories and templates, each edited in its dialog', async () => {
    mocks.enable.mockResolvedValue({})
    show({ initialCard: 'setup' })
    expect(screen.getByText('2 / 3 enabled')).toBeInTheDocument()
    const hookka = screen.getByText('Hookka').parentElement!
    expect(within(hookka).getByText('off')).toHaveAttribute('data-tone', 'muted')
    fireEvent.click(within(hookka).getByRole('button', { name: 'Turn on' }))
    await flush()
    expect(mocks.enable).toHaveBeenCalledWith('co-hk', true)
    expect(mocks.flash).toHaveBeenCalledWith('Hookka back in the allocation')
    expect(screen.getByText('Rental').parentElement!).toHaveTextContent('7012 · Rental Income')
    expect(screen.getByText('Website & Software').parentElement!).toHaveTextContent('the invoice’s default account')
    const tpl = screen.getByText('Office Rental').parentElement!
    expect(tpl).toHaveTextContent('Headcount · Rental18,980.00')
    fireEvent.click(within(tpl).getByRole('button', { name: 'Edit' }))
    expect(mocks.dialog).toHaveBeenLastCalledWith('template', expect.objectContaining({ template: expect.objectContaining({ id: 'tp1' }) }))
    fireEvent.click(screen.getByRole('button', { name: '+ Add category' }))
    expect(mocks.dialog).toHaveBeenLastCalledWith('category', expect.objectContaining({ category: null }))
  })

  it('a refused switch says why as the toast', async () => {
    mocks.enable.mockResolvedValue({ error: 'Not allowed' })
    show({ initialCard: 'setup' })
    fireEvent.click(within(screen.getByText('Carres').parentElement!).getByRole('button', { name: 'Turn off' }))
    await flush()
    expect(mocks.flash).toHaveBeenCalledWith('Not allowed')
  })

  it('a reader who may only look: no Edit, no switches, no list buttons but the snapshots', () => {
    const { unmount } = show({ initialCard: 'setup', can: { create: false, edit: false } })
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Turn (on|off)/ })).toBeNull()
    expect(screen.queryByRole('button', { name: '+ Add category' })).toBeNull()
    unmount()
    show({ initialCard: 'staff', can: { create: false, edit: false } })
    expect(screen.queryByRole('button', { name: '+ Add staff' })).toBeNull()
    expect(screen.getByRole('button', { name: /Snapshots/ })).toBeInTheDocument()
  })

  it('keeps the list in the address, and another month keeps it too', () => {
    show()
    fireEvent.click(card(/^Staff/))
    expect(window.location.search).toBe('?period=2026-09&card=staff')
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(mocks.push).toHaveBeenCalledWith('/billing-allocator?period=2026-10&card=staff')
  })
})
