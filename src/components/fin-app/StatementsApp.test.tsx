import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { StatementRead, StatementRow } from '@/app/(portal)/statements/_lib/statement-read'
import { statementHubModel, statementRecordModel, statementsPlace } from '@/lib/fin-app/statement-model'

// Fund › Statements in the Finance phone app (2026-10-15, part 5c): a card opens
// its statements, a statement its page with the step its status allows; Issue
// goes through the page's own action and a refusal stays on the statement in
// words; Generate statements answers how many it made.

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  flash: vi.fn(),
  open: vi.fn(),
  generate: vi.fn(),
  issue: vi.fn(),
  paid: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: mocks.replace }),
  usePathname: () => '/fin-app/page/statements',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))
vi.mock('@/components/hrv/toast', async (orig) => ({ ...(await orig<object>()), flash: mocks.flash }))
vi.mock('@/app/(portal)/statements/[id]/page-actions', () => ({ openStatement: mocks.open }))
vi.mock('@/app/(portal)/statements/actions', () => ({
  generateStatementsInWords: mocks.generate,
  issueStatementInWords: mocks.issue,
  markStatementPaidInWords: mocks.paid,
}))

import FinAppFrame from './FinAppFrame'
import StatementsApp from './StatementsApp'
import { resetNav } from './nav'

const ROW: StatementRow = { id: 'a', period_month: '2026-09-01', company_id: 'car', status: 'draft', total_invoice: 22507.9, total_contra: 600, net_amount: 21907.9, created_at: '2026-09-22T02:00:00Z' }
const READ: StatementRead = {
  statement: { ...ROW, issued_at: null },
  company: { name: 'Carres', short_code: 'CAR' },
  invoiceLines: [{ id: 'i1', line_type: 'invoice', category_code: 'marketing_project', description: 'Marketing Project — Sep 2026', amount: 22507.9 }],
  contraLines: [],
}
const RECORD = statementRecordModel(READ, { created: '22 Sep 2026', issued: null }, { edit: true })
const HUB = statementHubModel([ROW], new Map([['car', { name: 'Carres', code: 'CAR' }]]), '2026-09')

const draw = (search = '', record: typeof RECORD | null = null) =>
  render(
    <FinAppFrame platform="android" rows={['statements']}>
      <StatementsApp place={statementsPlace('2026-09', '2026-09')} month="2026-09" hub={HUB} search={search} canGenerate record={record} refused={null} />
    </FinAppFrame>,
  )

beforeEach(() => {
  resetNav()
  window.history.replaceState(null, '', '/fin-app/page/statements')
  mocks.open.mockResolvedValue({ ok: true, record: RECORD })
})
afterEach(() => vi.clearAllMocks())

describe('Statements on the phone', () => {
  it('a card opens its statements, a statement its page with Issue and Print', async () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /^Statements · September/ }))
    expect(window.location.search).toBe('?f=month')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Carres/ }))
    })
    expect(mocks.open).toHaveBeenCalledWith('a')
    expect(screen.getAllByText('Carres pays HV').length).toBeGreaterThan(0)
    expect(screen.getByText('No contra items.')).toBeInTheDocument()
    expect(screen.queryByText('No invoice items for this period.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Issue to subsidiary' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Print statement' })).toBeInTheDocument()
  })

  it('Issue goes one way, so it is asked first; a refusal stays in the question in words', async () => {
    mocks.issue.mockResolvedValue({ ok: false, reason: 'Period 2026-09 is closed.' })
    window.history.replaceState(null, '', '/fin-app/page/statements?id=a')
    await act(async () => {
      draw('id=a', RECORD)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Issue to subsidiary' }))
    expect(mocks.issue).not.toHaveBeenCalled()
    const ask = await screen.findByRole('dialog', { name: 'Issue to Carres?' })
    expect(within(ask).getByText(/This cannot be undone/)).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Issue statement' }))
    })
    expect(mocks.issue).toHaveBeenCalledWith('a')
    expect(within(ask).getByText('Period 2026-09 is closed.')).toBeInTheDocument()
    mocks.issue.mockResolvedValue({ ok: true })
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Issue statement' }))
    })
    expect(mocks.flash).toHaveBeenCalledWith('Statement issued')
  })

  it('Mark as paid is asked first too', async () => {
    mocks.paid.mockResolvedValue({ ok: true })
    const issued = statementRecordModel({ ...READ, statement: { ...READ.statement, status: 'issued', issued_at: '2026-10-01T01:00:00Z' } }, { created: '22 Sep 2026', issued: '1 Oct 2026 09:00' }, { edit: true })
    window.history.replaceState(null, '', '/fin-app/page/statements?id=a')
    await act(async () => {
      draw('id=a', issued)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Mark as paid' }))
    const ask = await screen.findByRole('dialog', { name: 'Mark Carres paid?' })
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Mark as paid' }))
    })
    expect(mocks.paid).toHaveBeenCalledWith('a')
    expect(mocks.flash).toHaveBeenCalledWith('Statement marked paid')
  })

  it('Cancel leaves the statement as it was', async () => {
    window.history.replaceState(null, '', '/fin-app/page/statements?id=a')
    await act(async () => {
      draw('id=a', RECORD)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Issue to subsidiary' }))
    const ask = await screen.findByRole('dialog', { name: 'Issue to Carres?' })
    fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }))
    expect(mocks.issue).not.toHaveBeenCalled()
  })

  it('Generate statements answers how many it made, and goes to the month it made them for', async () => {
    mocks.generate.mockResolvedValue({ ok: true, generated: 8, skipped: 0, errors: [], period: '2026-10-01' })
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Generate statements' }))
    const sheet = await screen.findByRole('dialog', { name: 'Generate statements' })
    fireEvent.change(within(sheet).getByLabelText('Period'), { target: { value: '2026-10' } })
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Yes, generate' }))
    })
    expect(mocks.generate).toHaveBeenCalledWith('2026-10')
    expect(mocks.flash).toHaveBeenCalledWith('8 generated · 0 skipped')
    expect(mocks.replace).toHaveBeenCalledWith('/fin-app/page/statements?m=2026-10', { scroll: false })
  })
})
