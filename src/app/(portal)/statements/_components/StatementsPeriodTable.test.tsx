import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
// The saved column layout is fetched from the browser client; here it has none.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
}))

import StatementsPeriodTable, { type StatementRow } from './StatementsPeriodTable'
import { FinViewProvider } from '@/components/layout/fin-view'

const statement: StatementRow = {
  id: 'st-1',
  companyName: 'Carres',
  companyCode: 'CAR',
  totalInvoice: 5000,
  totalContra: 1200,
  netAmount: 3800,
  status: 'issued',
}
const negative: StatementRow = { id: 'st-2', companyName: '2990', companyCode: '2990', totalInvoice: 0, totalContra: 4400, netAmount: -4400, status: 'draft' }

function desktop(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  vi.clearAllMocks()
  desktop(true)
})

// 2026-10-02 (user: "view … 可以 remove,我希望双击点开").
describe('StatementsPeriodTable', () => {
  it('has no View column; a double-click opens the statement', () => {
    render(<StatementsPeriodTable rows={[statement]} />)
    expect(screen.queryByText('View')).toBeNull()
    expect(document.querySelector('thead th[data-col="action"]')).toBeNull()
    fireEvent.doubleClick(screen.getByText('Carres'))
    expect(push).toHaveBeenCalledWith('/statements/st-1')
  })

  it('a right-click offers opening it, here or in a new tab', () => {
    render(<StatementsPeriodTable rows={[statement]} />)
    fireEvent.contextMenu(screen.getByText('Carres').closest('tr')!)
    const menu = screen.getByRole('menu', { name: 'Actions for Carres · issued' })
    expect(within(menu).getAllByRole('menuitem').map((b) => b.firstChild?.textContent)).toEqual(['打开', '在新分页打开'])
  })
})

// 2026-10-07 — on the sheet (the approved Invoice / Statements sample): the
// company's code with its name under it, the decision as a chip, an Open →
// at the end, the period's totals in the footer; on a phone the row is the
// company and the net, the small print the chip and the code.
describe('the statements table on the sheet', () => {
  it('shows the code over the name, the status as a chip, Open → at the end, and totals the period', () => {
    render(<StatementsPeriodTable rows={[statement, negative]} />)
    expect(Array.from(document.querySelectorAll('thead th[data-col]')).map((th) => (th as HTMLElement).dataset.col)).toEqual([
      'companyName', 'totalInvoice', 'totalContra', 'netAmount', 'status', 'open',
    ])
    const first = screen.getByText('Carres').closest('tr') as HTMLElement
    expect(within(first).getByText('CAR')).toBeInTheDocument()
    expect(within(first.querySelectorAll('td')[4] as HTMLElement).getByText('issued')).toHaveClass('chip', 'alert')
    expect(within(first).getByRole('link', { name: 'Open →' })).toHaveAttribute('href', '/statements/st-1')
    expect(document.querySelector('tfoot')).toHaveTextContent('2 companies')
    expect(document.querySelector('tfoot')).toHaveTextContent('RM 5,000.00')
    expect(document.querySelector('tfoot')).toHaveTextContent('Net RM (600.00)') // 3,800 − 4,400
  })

  it('on a phone the row is the company and the net; the arrow opens the rest, and the statement', () => {
    desktop(false)
    render(<StatementsPeriodTable rows={[statement]} />)
    const row = screen.getByText('Carres').closest('tr') as HTMLElement
    // The status column stays in the DOM (hidden by CSS); the small print carries the chip too.
    expect(within(row).getAllByText('issued')[0]).toHaveClass('chip')
    fireEvent.click(within(row).getByRole('button', { name: '展开明细' }))
    const panel = document.querySelector('tr.lt-detail') as HTMLElement
    expect(panel).toHaveTextContent('Invoice')
    expect(panel).toHaveTextContent('RM 5,000.00')
    expect(panel).toHaveTextContent('Contra')
    fireEvent.click(within(panel).getByText('Open the statement →'))
    expect(push).toHaveBeenCalledWith('/statements/st-1')
  })
})

// 2026-10-10 — the handoff's month table, as Finance and the Principal see it
// (a Director reading treasury keeps the table above): Company / Total
// invoice / Total contra / Net / Status, no Open column, ▽ filters with a
// Range on the figures, the list in a scroll box, an "All companies" foot row
// summing each column under it, negatives in red, and on a phone "Invoice x −
// contra y" under the company.
describe('the statements table on the Finance view', () => {
  const fin = (rows: StatementRow[]) =>
    render(
      <FinViewProvider value={true}>
        <StatementsPeriodTable rows={rows} />
      </FinViewProvider>,
    )
  const heads = () => Array.from(document.querySelectorAll('thead th[data-col]')) as HTMLElement[]

  it('heads the columns the handoff’s way, with no Open column, and filters every one', () => {
    fin([statement, negative])
    expect(heads().map((th) => th.dataset.col)).toEqual(['companyName', 'totalInvoice', 'totalContra', 'netAmount', 'status'])
    expect(heads().map((th) => th.textContent?.replace(/[▲▼↕]/g, '').trim())).toEqual(['Company', 'Total invoice', 'Total contra', 'Net', 'Status'])
    expect(screen.queryByRole('link', { name: 'Open →' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Filter Company' })).toBeInTheDocument()
    for (const col of ['Total invoice', 'Total contra', 'Net']) {
      fireEvent.click(screen.getByRole('button', { name: `Filter ${col}` }))
      expect(within(screen.getByRole('dialog', { name: `Filter ${col}` })).getByRole('button', { name: 'Range' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: `Filter ${col}` }))
    }
    expect(document.querySelector('.st-box table')).not.toBeNull()
  })

  it('ends on an All companies row with each total under its column, negatives red', () => {
    fin([statement, negative])
    const foot = Array.from(document.querySelectorAll('tfoot td')) as HTMLElement[]
    const at = (col: string) => heads().findIndex((th) => th.dataset.col === col)
    expect(foot[at('companyName')]).toHaveTextContent('All companies')
    expect(foot[at('totalInvoice')]).toHaveTextContent('RM 5,000.00')
    expect(foot[at('totalContra')]).toHaveTextContent('RM (5,600.00)')
    expect(foot[at('netAmount')]).toHaveTextContent('RM (600.00)')
    expect(within(foot[at('netAmount')]).getByText('RM (600.00)')).toHaveClass('text-danger')
    const row = screen.getByText('2990 (2990)').closest('tr') as HTMLElement
    // Its contra and its net, both below zero, both red.
    expect(within(row).getAllByText('RM (4,400.00)', { selector: '.text-danger' })).toHaveLength(2)
  })

  it('on a phone reads "Invoice x − contra y" under the company', () => {
    fin([statement])
    const cell = screen.getByText('Carres (CAR)').closest('td') as HTMLElement
    expect(cell.querySelector('.q-sub')).toHaveTextContent('Invoice 5,000.00 − contra 1,200.00')
  })
})
