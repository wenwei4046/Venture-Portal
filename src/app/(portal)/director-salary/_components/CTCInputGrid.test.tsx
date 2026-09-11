import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import CTCInputGrid from './CTCInputGrid'

/**
 * The Director Salary page reaches another month through ?period= — a
 * navigation that only changes the query string. Next re-runs the Server
 * Component with the new month's rows but keeps this client grid mounted, so
 * its useState seeds kept showing the month opened first until a full reload
 * (2026-09-11: ‹ › in the period picker moved the header, not the grid).
 * The grid now remounts per period and re-seeds from the new rows.
 */
const { push, refresh, rpc } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  rpc: vi.fn().mockResolvedValue({ data: [{ employer: 0 }] }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock('../actions', () => ({ batchSaveCTC: vi.fn().mockResolvedValue(undefined) }))
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

beforeEach(() => vi.clearAllMocks())

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
