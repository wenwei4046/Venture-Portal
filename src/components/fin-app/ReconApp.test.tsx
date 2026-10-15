import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReconSessionRead } from '@/app/(portal)/reconciliation/_lib/recon-read'
import { reconHubModel, reconSessionModel } from '@/lib/fin-app/recon-model'

// Daily › Reconciliation in the Finance phone app (2026-10-15, part 5c): a card
// opens its months, a month its page; Match lines ticks both sides until their
// sums agree and matches through the review page's own action; a match's window
// unmatches it; Upload statement opens the month it made.

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  flash: vi.fn(),
  openSession: vi.fn(),
  openReport: vi.fn(),
  manualMatch: vi.fn(),
  contraBookLines: vi.fn(),
  contraStatementLines: vi.fn(),
  dissolveGroup: vi.fn(),
  unmatchLine: vi.fn(),
  setLineIgnored: vi.fn(),
  setSessionStatus: vi.fn(),
  deleteSession: vi.fn(),
  uploadStatementInWords: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: mocks.replace }),
  usePathname: () => '/fin-app/page/recon',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))
vi.mock('@/components/hrv/toast', async (orig) => ({ ...(await orig<object>()), flash: mocks.flash }))
vi.mock('@/app/(portal)/reconciliation/page-actions', () => ({ openReconSession: mocks.openSession, openReconReport: mocks.openReport }))
vi.mock('@/app/(portal)/reconciliation/actions', () => ({
  manualMatch: mocks.manualMatch,
  contraBookLines: mocks.contraBookLines,
  contraStatementLines: mocks.contraStatementLines,
  dissolveGroup: mocks.dissolveGroup,
  unmatchLine: mocks.unmatchLine,
  setLineIgnored: mocks.setLineIgnored,
  setSessionStatus: mocks.setSessionStatus,
  deleteSession: mocks.deleteSession,
  uploadStatementInWords: mocks.uploadStatementInWords,
}))

import FinAppFrame from './FinAppFrame'
import ReconApp from './ReconApp'
import { resetNav } from './nav'

const BANKS = [{ id: 'hlb', bank_name: 'Hong Leong Bank', account_number: '123', current_balance: 1000, gl_account_code: '3000', is_primary: true, gl: 1000 }]
const SESSIONS = [{ id: 's2', bankId: 'hlb', bank: 'Hong Leong Bank', periodMonth: '2026-09-01', file: 'Sep.pdf', status: 'open', cleared: 1, total: 2 }]
const READ: ReconSessionRead = {
  session: { id: 's2', bank_account_id: 'hlb', period_month: '2026-09-01', source_filename: 'Sep.pdf', status: 'open', statement_opening: 900, statement_closing: 1000 },
  bank: { bank_name: 'Hong Leong Bank', gl_account_code: '3000' },
  statementLines: [
    { id: 'l1', date: '2026-09-03', description: 'Transfer in', amount: 300, matchKind: 'auto' },
    { id: 'l5', date: '2026-09-20', description: 'Payment out', amount: -200, matchKind: null },
  ],
  groups: [{ id: 'g1', statementLineIds: ['l1'], journalLineIds: ['j1'] }],
  contraGroups: [],
  statementContraGroups: [],
  unmatchedBook: [
    { id: 'j2', date: '2026-09-21', entryNo: 'JE-0002', description: 'Cheque', amount: -120 },
    { id: 'j3', date: '2026-09-21', entryNo: 'JE-0003', description: 'Supplier', amount: -80 },
  ],
  bookInfo: { j1: { id: 'j1', date: '2026-09-03', entryNo: 'JE-0001', description: 'Receipt', amount: 300 } },
  glClosing: 1000,
}
const RECORD = reconSessionModel(READ, { edit: true, approve: true })
const HUB = reconHubModel(BANKS, SESSIONS)

const draw = (search = '', record: typeof RECORD | null = null) =>
  render(
    <FinAppFrame platform="android" rows={['recon']}>
      <ReconApp hub={HUB} search={search} banks={[{ id: 'hlb', label: 'Hong Leong Bank — 123' }]} defaultMonth="2026-09" may={{ create: true }} record={record} refused={null} />
    </FinAppFrame>,
  )

beforeEach(() => {
  resetNav()
  window.history.replaceState(null, '', '/fin-app/page/recon')
  mocks.openSession.mockResolvedValue({ ok: true, record: RECORD })
})
afterEach(() => vi.clearAllMocks())

describe('Reconciliation on the phone', () => {
  it('a card opens its months, a month its page with Match lines, Report and the ⋯', async () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /^Monthly reconciliations/ }))
    expect(window.location.search).toBe('?f=sessions')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /September 2026/ }))
    })
    expect(mocks.openSession).toHaveBeenCalledWith('s2')
    expect(screen.getByText('Statement against the GL')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Match lines' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Report' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(within(await screen.findByRole('menu')).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Mark done', 'Delete reconciliationstatement lines and matches'])
  })

  it('Match lines: both sides ticked until their sums agree, then matched through the review page’s action', async () => {
    mocks.manualMatch.mockResolvedValue({})
    window.history.replaceState(null, '', '/fin-app/page/recon?id=s2&part=match')
    await act(async () => {
      draw('id=s2&part=match', RECORD)
    })
    const match = screen.getByRole('button', { name: /^Match/ })
    expect(match).toHaveAttribute('data-off', 'true')
    fireEvent.click(screen.getByRole('button', { name: /Payment out/ }))
    fireEvent.click(screen.getByRole('button', { name: /Cheque/ }))
    expect(screen.getByText('Statement Σ (1) −200.00 · Book Σ (1) −120.00 · off by 80.00')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Supplier/ }))
    expect(screen.getByText('Statement Σ (1) −200.00 · Book Σ (2) −200.00 ✓')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Match 1 ↔ 2' }))
    })
    expect(mocks.manualMatch).toHaveBeenCalledWith(['l5'], ['j2', 'j3'])
    expect(mocks.flash).toHaveBeenCalledWith('Matched')
  })

  it('a match’s window lists both sides and unmatches it', async () => {
    mocks.unmatchLine.mockResolvedValue({})
    window.history.replaceState(null, '', '/fin-app/page/recon?id=s2')
    await act(async () => {
      draw('id=s2', RECORD)
    })
    fireEvent.click(screen.getByRole('button', { name: /Transfer in/ }))
    const win = await screen.findByRole('dialog', { name: 'Matched' })
    expect(within(win).getByText('Receipt')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(within(win).getByRole('button', { name: 'Unmatch' }))
    })
    expect(mocks.unmatchLine).toHaveBeenCalledWith('l1')
    expect(mocks.flash).toHaveBeenCalledWith('Unmatched')
  })

  it('Upload statement sends the bank, the month and the file, then opens the month it made', async () => {
    mocks.uploadStatementInWords.mockResolvedValue({ ok: true, id: 's9' })
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Upload statement' }))
    const sheet = await screen.findByRole('dialog', { name: 'Upload statement' })
    const file = new File(['date,description,amount'], 'Oct.csv', { type: 'text/csv' })
    fireEvent.change(within(sheet).getByLabelText('Statement file'), { target: { files: [file] } })
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Upload & match' }))
    })
    const fd = mocks.uploadStatementInWords.mock.calls[0][0] as FormData
    expect([fd.get('bank_account_id'), fd.get('period_month'), (fd.get('file') as File).name]).toEqual(['hlb', '2026-09', 'Oct.csv'])
    expect(window.location.search).toBe('?id=s9')
  })
})
