import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { dailyBankModel } from '@/lib/fin-app/daily-bank-model'
import type { DailyBankData } from '@/lib/daily-bank-data'

// Daily › Daily Bank in the Finance phone app (2026-10-15, part 5): the day's
// total available under the day between its arrows, a card per bank opening
// its list; another day is the server's to read; the PDF for whoever exports.

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: mocks.replace }),
  usePathname: () => '/fin-app/page/daily-bank',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))

import FinAppFrame from './FinAppFrame'
import DailyBankApp from './DailyBankApp'
import { resetNav } from './nav'

const DATA: DailyBankData = {
  date: '2026-10-15',
  columns: [{ key: 'venture', label: 'Venture' }],
  totals: { available: { venture: 0 }, grand: 0 },
  banks: [
    {
      bankId: 'hlb',
      bankName: 'Hong Leong Bank',
      glCode: '1100-01',
      bf: { venture: 50000 },
      inToday: { venture: 0 },
      outToday: { venture: 0 },
      current: { venture: 50000 },
      pending: [],
      pendingTotal: { venture: 0 },
      available: { venture: 50000 },
      receipts: [],
      otherInToday: 0,
    },
  ],
}

const draw = (over: { date?: string; canExport?: boolean; search?: string } = {}) =>
  render(
    <FinAppFrame platform="android" rows={['daily-bank']}>
      <DailyBankApp model={dailyBankModel({ ...DATA, date: over.date ?? '2026-10-15' }, '2026-10-15')} search={over.search ?? ''} today="2026-10-15" canExport={over.canExport ?? true} />
    </FinAppFrame>,
  )

beforeEach(() => {
  resetNav()
  window.history.replaceState(null, '', '/fin-app/page/daily-bank')
})
afterEach(() => vi.clearAllMocks())

describe('Daily Bank on the phone', () => {
  it('opens on today: the total available, no later day to go to, a card per bank', () => {
    draw()
    expect(screen.getByText('Total available · Today · 15 Oct 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Hong Leong Bank B\/F 50,000\.00 RM 50,000\.00$/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument()
  })

  it('the day before is the server’s to read', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(mocks.replace).toHaveBeenCalledWith('/fin-app/page/daily-bank?date=2026-10-14', { scroll: false })
  })

  it('a bank’s card opens its list; on another day Today goes back', () => {
    draw({ date: '2026-10-14', search: 'date=2026-10-14' })
    fireEvent.click(screen.getByRole('button', { name: /^Hong Leong Bank/ }))
    expect(window.location.search).toBe('?date=2026-10-14&f=bank%3Ahlb')
    expect(screen.getByRole('heading', { name: 'Hong Leong Bank' })).toBeInTheDocument()
    expect(screen.getByText('The day')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(mocks.replace).toHaveBeenCalledWith('/fin-app/page/daily-bank?f=bank%3Ahlb', { scroll: false })
  })

  it('the PDF only for whoever may export', () => {
    draw({ canExport: false })
    expect(screen.queryByRole('button', { name: 'Export PDF' })).not.toBeInTheDocument()
  })
})
