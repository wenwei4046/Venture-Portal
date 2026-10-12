import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import CTCInputGrid from './CTCInputGrid'
import type { HvDepartment, HvShare } from '@/lib/director-hv-share'

/**
 * The Director Salary page reaches another month through ?period= — a
 * navigation that only changes the query string. Next re-runs the Server
 * Component with the new month's rows but keeps this client grid mounted, so
 * its useState seeds kept showing the month opened first until a full reload
 * (2026-09-11: ‹ › in the period picker moved the header, not the grid).
 * The grid now remounts per period and re-seeds from the new rows.
 */
const { push, refresh, rpc, batchSaveCTC } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  rpc: vi.fn().mockResolvedValue({ data: [{ employer: 0 }] }),
  batchSaveCTC: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock('../actions', () => ({ batchSaveCTC }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))

const directors = [{ id: 'dir-1', code: 'D1', name: 'Director One' }]
const companies = [
  { id: 'co-2990', name: '2990', short_code: '2990', director_heads: 1 },
  { id: 'co-hc', name: 'HOUZS Century', short_code: 'HC', director_heads: 2 },
]

function ctc(companyId: string, basic: number, allowance = 0) {
  return {
    director_id: 'dir-1',
    company_id: companyId,
    basic,
    kpi: 0,
    allowance,
    employer_epf: null,
    employer_socso: null,
    employer_eis: null,
    total_ctc: null,
    er_manual: false,
  }
}

function grid(period: string, existingCTC: ReturnType<typeof ctc>[]) {
  return (
    <CTCInputGrid directors={directors} companies={companies} existingCTC={existingCTC} period={period} />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  batchSaveCTC.mockResolvedValue({ ok: true, saved: 0, cleared: 0 })
})

describe('CTCInputGrid across periods', () => {
  it('re-seeds every cell from the new month when the period changes', () => {
    const { rerender } = render(grid('2026-09-01', [ctc('co-2990', 2500, 2611.5)]))
    expect(screen.getByLabelText('Basic — 2990')).toHaveValue(2500)
    expect(screen.getByLabelText('Allowance — 2990')).toHaveValue(2611.5)
    expect(screen.getByLabelText('Basic — HOUZS Century')).toHaveValue(null)

    // ‹ to August: a different company carries the CTC there.
    rerender(grid('2026-08-01', [ctc('co-hc', 22800)]))
    expect(screen.getByLabelText('Basic — 2990')).toHaveValue(null)
    expect(screen.getByLabelText('Allowance — 2990')).toHaveValue(null)
    expect(screen.getByLabelText('Basic — HOUZS Century')).toHaveValue(22800)
  })

  it('keeps unsaved edits while the period stays the same', () => {
    const { rerender } = render(grid('2026-09-01', [ctc('co-2990', 2500)]))
    fireEvent.change(screen.getByLabelText('Basic — 2990'), { target: { value: '3000' } })

    // A refresh of the same month (router.refresh after a row save elsewhere)
    // must not wipe what the user is typing.
    rerender(grid('2026-09-01', [ctc('co-2990', 2500)]))
    expect(screen.getByLabelText('Basic — 2990')).toHaveValue(3000)
  })
})

/**
 * HOUZS Venture's own row (2026-10-13 — the user: "i want add on houzs venture
 * itself in this as well. but when press save, once detech venture itself got
 * pay, will need to select the amount is deduct from which department … by
 * amount or percentage from the total amount. then confirm so that finance
 * will get the submittion").
 */
describe('CTCInputGrid · HOUZS Venture’s row', () => {
  const departments: HvDepartment[] = [
    { id: 'dep-dir', name: 'Director', internal: false },
    { id: 'dep-mkt', name: 'Marketing', internal: false },
    { id: 'dep-rev', name: 'Revenue Department', internal: false },
    { id: 'dep-vo', name: 'Venture Office', internal: true },
  ]
  const share = (over: Partial<HvShare> = {}): HvShare => ({
    id: 'share-1',
    periodMonth: '2026-10-01',
    totalCtc: 6000,
    splitMode: 'percent',
    status: 'open',
    submittedAt: '2026-10-13T01:00:00+00:00',
    submittedBy: 'HR Manager',
    batchId: null,
    batchNo: null,
    batchSubmittedAt: null,
    lines: [
      { departmentId: 'dep-mkt', department: 'Marketing', stays: false, amount: 3600, pct: 60 },
      { departmentId: 'dep-rev', department: 'Revenue Department', stays: false, amount: 2400, pct: 40 },
    ],
    components: { basic: 5000, kpi: 0, allowance: 1000, employerEpf: 0, employerSocso: 0, employerEis: 0, erManual: false },
    ...over,
  })
  const hvGrid = (hvShare: HvShare | null, directorsSent = false) => (
    <CTCInputGrid
      directors={directors}
      companies={companies}
      existingCTC={[ctc('co-2990', 2500)]}
      period="2026-10-01"
      hv={{ departments, share: hvShare, directorsSent }}
    />
  )
  const dialog = () => screen.getByRole('dialog', { name: "HOUZS Venture's share" })

  it('is the first row, and its figures are in the Director Pool Total', () => {
    render(hvGrid(share()))
    expect(screen.getByLabelText('Basic — HOUZS Venture')).toHaveValue(5000)
    expect(screen.getByLabelText('Allowance — HOUZS Venture')).toHaveValue(1000)
    const rows = screen.getAllByRole('row')
    expect(within(rows[1]).getByText('HOUZS Venture')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Waits for payroll')).toBeInTheDocument()
    // 2,500 (2990) + 5,000 (HV) basic; the grand total 8,500.
    const foot = rows[rows.length - 1]
    expect(within(foot).getByText('7,500.00')).toBeInTheDocument()
    expect(within(foot).getByText('8,500.00')).toBeInTheDocument()
  })

  it('Save asks which departments pay first, and sends the split once it adds up', async () => {
    render(hvGrid(null))
    fireEvent.change(screen.getByLabelText('Basic — HOUZS Venture'), { target: { value: '4000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(dialog()).toBeInTheDocument())
    expect(batchSaveCTC).not.toHaveBeenCalled()
    expect(within(dialog()).getByText('RM 4,000.00')).toBeInTheDocument()

    // Every department can be picked.
    const pick = within(dialog()).getByLabelText('Department 1')
    expect(within(pick).getAllByRole('option').map(o => o.textContent)).toEqual([
      'Pick a department', 'Director', 'Marketing', 'Revenue Department', 'Venture Office',
    ])
    const confirm = within(dialog()).getByRole('button', { name: 'Confirm' })
    expect(confirm).toBeDisabled()

    fireEvent.change(pick, { target: { value: 'dep-mkt' } })
    fireEvent.change(within(dialog()).getByLabelText('Amount — Marketing'), { target: { value: '2500' } })
    expect(within(dialog()).getByText('RM 1,500.00 left to place')).toBeInTheDocument()
    expect(confirm).toBeDisabled()

    // A second department starts with what is left.
    fireEvent.click(within(dialog()).getByRole('button', { name: '+ Add department' }))
    fireEvent.change(within(dialog()).getByLabelText('Department 2'), { target: { value: 'dep-vo' } })
    expect(within(dialog()).getByLabelText('Amount — Venture Office')).toHaveValue('1500.00')
    expect(confirm).toBeEnabled()

    await act(async () => fireEvent.click(confirm))
    expect(batchSaveCTC).toHaveBeenCalledTimes(1)
    const [period, records, hv] = batchSaveCTC.mock.calls[0]
    expect(period).toBe('2026-10-01')
    expect(records.map((r: { companyId: string }) => r.companyId)).toEqual(['co-2990', 'co-hc'])
    expect(hv).toEqual({
      basic: 4000, kpi: 0, allowance: 0, erManual: false, splitMode: 'amount',
      lines: [{ departmentId: 'dep-mkt', amount: 2500 }, { departmentId: 'dep-vo', amount: 1500 }],
    })
    expect(push).toHaveBeenCalledWith('/director-salary?period=2026-10&tab=submission')
  })

  it('splits by percentage too, showing what each will pay', async () => {
    render(hvGrid(share()))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(dialog()).toBeInTheDocument())
    // It opens on the split HR sent last.
    expect(within(dialog()).getByRole('button', { name: 'By %' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog()).getByLabelText('Percentage — Marketing')).toHaveValue('60')
    expect(within(dialog()).getByTestId('hv-line-amount-0')).toHaveTextContent('RM 3,600.00')

    fireEvent.change(within(dialog()).getByLabelText('Percentage — Marketing'), { target: { value: '50' } })
    expect(within(dialog()).getByText('90% placed — 10% left')).toBeInTheDocument()
    fireEvent.change(within(dialog()).getByLabelText('Percentage — Revenue Department'), { target: { value: '50' } })
    await act(async () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Confirm' })))
    expect(batchSaveCTC.mock.calls[0][2]).toMatchObject({
      splitMode: 'percent',
      lines: [{ departmentId: 'dep-mkt', pct: 50 }, { departmentId: 'dep-rev', pct: 50 }],
    })
  })

  it('shows the database’s refusal in the window and keeps it open', async () => {
    batchSaveCTC.mockResolvedValueOnce({ ok: false, reason: 'The accounting period October 2026 is locked' })
    render(hvGrid(share()))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(dialog()).toBeInTheDocument())
    await act(async () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Confirm' })))
    expect(within(dialog()).getByText('The accounting period October 2026 is locked')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('saves with no window when HOUZS Venture pays nothing, and clears a share it had sent', async () => {
    const { unmount } = render(hvGrid(null))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(batchSaveCTC.mock.calls[0][2]).toBeNull()
    unmount()

    render(hvGrid(share()))
    fireEvent.change(screen.getByLabelText('Basic — HOUZS Venture'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Allowance — HOUZS Venture'), { target: { value: '' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(batchSaveCTC.mock.calls[1][2]).toEqual({ basic: 0, kpi: 0, allowance: 0, erManual: false, splitMode: 'amount', lines: [] })
  })

  // The user, 2026-10-13: "应该是直接转出去，就是 payout 出去 payroll 才对" — the
  // share goes with the directors' payroll batch, and is fixed while it is there.
  it('locks the row once the directors’ payroll batch carries it, and saves the subsidiaries alone', async () => {
    render(hvGrid(share({ status: 'in_payroll', batchId: 'batch-7', batchNo: 7, batchSubmittedAt: '2026-10-14T02:00:00+00:00' }), true))
    expect(screen.getByLabelText('Basic — HOUZS Venture')).toBeDisabled()
    expect(screen.getByText('In payroll #7')).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(batchSaveCTC.mock.calls[0][2]).toBeNull()
  })

  it('locks it too once the directors went to Finance without it — no batch would carry it', async () => {
    render(hvGrid(null, true))
    expect(screen.getByLabelText('Basic — HOUZS Venture')).toBeDisabled()
    expect(screen.getByText('Directors sent')).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(batchSaveCTC.mock.calls[0][2]).toBeNull()
  })
})
