import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { AuditTableLine, ChangeFilters } from '@/lib/audit/changes'
import { auditModel } from '@/lib/fin-app/audit-model'

// Profile › Admin › Audit Log in the Finance phone app (2026-10-15, part E3):
// the desktop's filters in the kit's sheet, Older / Newest through its pages,
// back to Profile — each a new address the server reads.

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: mocks.replace }),
  usePathname: () => '/fin-app/page/audit',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))

import FinAppFrame from './FinAppFrame'
import AuditApp from './AuditApp'
import { resetNav } from './nav'

const NONE: ChangeFilters = { area: null, table: null, who: null, from: null, to: null, row: null, before: null }
const LINES: AuditTableLine[] = [
  { table_name: 'titles', label: 'Titles', area: 'People', mode: 'all', label_columns: ['name'], reason: null },
  { table_name: 'payment_vouchers', label: 'Payment vouchers', area: 'Payments', mode: 'all', label_columns: ['voucher_no'], reason: null },
]
const OVERVIEW = { saves_today: 3, changes_week: 12, people_week: 2, last_at: '2026-10-15T11:17:00Z' }

const draw = (filters: ChangeFilters = NONE, olderBefore: number | null = 900) =>
  render(
    <FinAppFrame platform="android" rows={[]}>
      <AuditApp
        model={auditModel({ overview: OVERVIEW, saves: [], records: 0, lines: LINES, filters, rowName: null, filterWords: '' })}
        search=""
        filters={filters}
        lines={LINES}
        actors={[{ id: '9d2a3b4c-1111-4222-8333-444455556666', name: 'Carrie' }]}
        today="2026-10-15"
        olderBefore={olderBefore}
      />
    </FinAppFrame>,
  )

beforeEach(() => {
  resetNav()
  window.history.replaceState(null, '', '/fin-app/page/audit')
})
afterEach(() => vi.clearAllMocks())

describe('Audit Log on the phone', () => {
  it('opens on today’s saves; its back goes to Profile', () => {
    draw()
    expect(screen.getByText('Saves today · last 15 Oct 19:17')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Back to Profile/ }))
    expect(mocks.replace).toHaveBeenCalledWith('/fin-app/profile')
  })

  it('Filter asks the desktop’s filters and shows what they find', async () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    const sheet = await screen.findByRole('dialog', { name: 'Filter changes' })
    fireEvent.change(within(sheet).getByLabelText('Area'), { target: { value: 'Payments' } })
    fireEvent.change(within(sheet).getByLabelText('Who'), { target: { value: 'system' } })
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Show' }))
    })
    expect(mocks.replace).toHaveBeenCalledWith('/fin-app/page/audit?area=Payments&who=system&f=saves', { scroll: false })
  })

  it('a record’s history keeps its record through the filters; Clear drops everything', async () => {
    draw({ ...NONE, table: 'titles', row: 'abc' })
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    const sheet = await screen.findByRole('dialog', { name: 'Filter changes' })
    expect(within(sheet).getByLabelText('Record')).toHaveValue('titles')
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Show' }))
    })
    expect(mocks.replace).toHaveBeenLastCalledWith('/fin-app/page/audit?table=titles&row=abc&f=saves', { scroll: false })
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    await act(async () => {
      fireEvent.click(within(await screen.findByRole('dialog', { name: 'Filter changes' })).getByRole('button', { name: 'Clear' }))
    })
    expect(mocks.replace).toHaveBeenLastCalledWith('/fin-app/page/audit?f=saves', { scroll: false })
  })

  it('Older goes past the page’s last change; Newest comes back', async () => {
    const { unmount } = draw({ ...NONE, area: 'Payments' }, 900)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Older' }))
    })
    expect(mocks.replace).toHaveBeenCalledWith('/fin-app/page/audit?area=Payments&before=900&f=saves', { scroll: false })
    unmount()
    draw({ ...NONE, area: 'Payments', before: 900 }, null)
    expect(screen.queryByRole('button', { name: 'Older' })).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Newest' }))
    })
    expect(mocks.replace).toHaveBeenLastCalledWith('/fin-app/page/audit?area=Payments&f=saves', { scroll: false })
  })
})
