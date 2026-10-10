import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { inTimeZoneAsync } from '@/test/time-zone'

// 2026-10-08: /daily-bank opened on the SERVER's today. Vercel keeps UTC, so
// from midnight until 08:00 in the office the board (and its PDF) opened on
// yesterday, and "Today" pointed there too.

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  createClient: vi.fn(),
  fetchDailyBank: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission, requireAction: mocks.requirePermission, requireAnyAction: mocks.requirePermission, requirePayrollPayoutsAction: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/daily-bank-data', () => ({ fetchDailyBank: mocks.fetchDailyBank }))
vi.mock('./_components/DailyBankView', () => ({
  default: (p: { data: { date: string }; today: string }) => <p data-testid="view" data-day={p.data.date} data-today={p.today} />,
}))

import DailyBankPage from './page'
import { GET as exportPdf } from './export/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 'f', role: 'finance', permissions: ['treasury'] })
  mocks.createClient.mockResolvedValue({})
  mocks.fetchDailyBank.mockImplementation(async (_: unknown, date: string) => ({ date, banks: [], totals: {}, columns: [] }))
  vi.useFakeTimers({ now: new Date('2026-10-08T16:30:00Z'), toFake: ['Date'] }) // 00:30 on 9 Oct in the office
})
afterEach(() => vi.useRealTimers())

describe('Daily Bank on the office calendar', () => {
  it("opens on the office's today when drawn by a server that keeps UTC", async () => {
    const page = await inTimeZoneAsync('UTC', () => DailyBankPage({ searchParams: Promise.resolve({}) }))
    render(page)
    expect(mocks.fetchDailyBank).toHaveBeenCalledWith(expect.anything(), '2026-10-09', expect.anything())
    expect(screen.getByTestId('view')).toHaveAttribute('data-today', '2026-10-09')
    expect(screen.getByTestId('view')).toHaveAttribute('data-day', '2026-10-09')
  })

  it('still opens on the day asked for', async () => {
    const page = await inTimeZoneAsync('UTC', () => DailyBankPage({ searchParams: Promise.resolve({ date: '2026-10-01' }) }))
    render(page)
    expect(screen.getByTestId('view')).toHaveAttribute('data-day', '2026-10-01')
    expect(screen.getByTestId('view')).toHaveAttribute('data-today', '2026-10-09')
  })

  it("exports the office's today when the PDF is asked for no day", async () => {
    await inTimeZoneAsync('UTC', () => exportPdf(new Request('https://portal.test/daily-bank/export')))
    expect(mocks.fetchDailyBank).toHaveBeenCalledWith(expect.anything(), '2026-10-09', expect.anything())
  })
})
