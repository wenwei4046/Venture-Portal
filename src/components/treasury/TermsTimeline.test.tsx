import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { TermsChangeComparison, TermsSegment } from '@/lib/treasury-terms'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(portal)/fund-in/actions', () => ({ revertTermsChange: vi.fn() }))

import TermsTimeline from './TermsTimeline'

// 2026-10-10 — Terms over time per the user's Claude Design handoff: the
// segments in one bordered box, the current one tagged green; each change a
// grey card that folds open onto Month / Old interest / New interest /
// Difference. What the design has no column for — the principal, the all-in
// difference, what was paid and the shortfall — folds away inside the card.

const SEGMENTS: TermsSegment[] = [
  { fromYM: '2026-03', toYM: '2026-06', rate: 0.005, compounding: false, months: 12, base: 1500000, principalPerMonth: 125000, interestPerMonth: 7500, scheduledEndYM: '2027-02', changed: false },
  { fromYM: '2026-07', toYM: null, rate: 0.00583, compounding: false, months: 12, base: 1500000, principalPerMonth: 125000, interestPerMonth: 8745, scheduledEndYM: '2027-02', changed: true },
]
const CHANGE: TermsChangeComparison = {
  fromYM: '2026-07',
  old: { rate: 0.005, months: 12, principalPerMonth: 125000, interestPerMonth: 7500, endYM: '2027-02', compounding: false },
  new: { rate: 0.00583, months: 12, principalPerMonth: 125000, interestPerMonth: 8745, endYM: '2027-02', compounding: false, base: 1500000 },
  reason: 'Base rate up',
  rows: [
    { ym: '2026-07', oldPrincipal: 125000, oldInterest: 7500, newPrincipal: 125000, newInterest: 8745, diffInterest: 1245, diffTotal: 1245, paidPrincipal: 125000, paidInterest: 7500, shortfall: 1245 },
    { ym: '2026-08', oldPrincipal: 125000, oldInterest: 7500, newPrincipal: 125000, newInterest: 8745, diffInterest: 1245, diffTotal: 1245 },
  ],
  totals: { oldInterest: 15000, newInterest: 17490, diffInterest: 2490, oldTotal: 265000, newTotal: 267490, diffTotal: 2490, shortfall: 1245 },
}

const view = (changes = [CHANGE]) => render(<TermsTimeline kind="fund_source" recordId="fs-1" segments={SEGMENTS} changes={changes} canRevert={false} />)
const section = () => screen.getByRole('heading', { name: 'Terms over time' }).closest('section') as HTMLElement

describe('Terms over time', () => {
  it('draws the segments in one box, the current one tagged', () => {
    view()
    expect(section().querySelector('.sect-head .count')).toHaveTextContent('1 CHANGE')
    const segs = section().querySelectorAll('.fund-segs .fund-seg')
    expect(segs).toHaveLength(2)
    expect(segs[0]).toHaveTextContent('2026-03 → 2026-06')
    expect(segs[0]).toHaveTextContent('0.500% /mo · 12mo · monthly RM 125,000.00 + 7,500.00')
    expect(segs[0].querySelector('.fund-seg-tag')).toBeNull()
    expect(segs[1]).toHaveClass('fund-current')
    expect(segs[1]).toHaveTextContent('2026-07 → 2027-02')
    expect(segs[1].querySelector('.fund-seg-tag')).toHaveTextContent('current')
    expect(segs[1]).toHaveTextContent('0.583% /mo · 12mo · monthly RM 125,000.00 + 8,745.00 on RM 1,500,000.00')
  })

  it('folds each change into a card of Month / Old interest / New interest / Difference', () => {
    view()
    const card = section().querySelector('details.fund-change') as HTMLDetailsElement
    expect(card.open).toBe(false)
    expect(card.querySelector('summary')).toHaveTextContent('From 2026-07 · rate 0.500% → 0.583% · difference +RM 1,245.00 /mo')
    const table = within(card).getByRole('table', { name: 'Interest from 2026-07' })
    expect(Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual(['Month', 'Old interest', 'New interest', 'Difference'])
    const first = table.querySelectorAll('tbody tr')[0] as HTMLElement
    expect(Array.from(first.querySelectorAll('td')).map((td) => td.textContent)).toEqual(['2026-07', '7,500.00', '8,745.00', '+1,245.00'])
    expect(first.querySelector('td:last-child')).toHaveClass('fund-diff')
  })

  it('keeps what the design has no column for inside the card', () => {
    view()
    const card = section().querySelector('details.fund-change') as HTMLElement
    expect(card.querySelector('.fund-change-note')).toHaveTextContent('base RM 1,500,000.00')
    expect(card.querySelector('.fund-change-note')).toHaveTextContent('remaining interest 15,000.00 → 17,490.00 (+2,490.00)')
    expect(card.querySelector('.fund-change-note')).toHaveTextContent('short RM 1,245.00 on months already due')
    expect(card.querySelector('.fund-change-note')).toHaveTextContent('Base rate up')
    const more = within(card).getByText('Principal, all-in and payments').closest('details') as HTMLDetailsElement
    expect(more.open).toBe(false)
    const table = within(more).getByRole('table')
    expect(Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual([
      'Month', 'Old principal', 'New principal', 'Difference all-in', 'Paid', 'Shortfall',
    ])
    expect(table.querySelectorAll('tbody tr')[0]).toHaveTextContent('132,500.00')
    expect(table.querySelector('tfoot')).toHaveTextContent('Total')
    expect(table.querySelector('tfoot')).toHaveTextContent('+2,490.00')
  })

  it('reads a compounding change without a table, and nothing at all for terms that never changed', () => {
    const { unmount } = view([{ ...CHANGE, rows: [], old: { ...CHANGE.old, compounding: true }, new: { ...CHANGE.new, compounding: true } }])
    const card = section().querySelector('details.fund-change') as HTMLElement
    expect(card.querySelector('summary')).toHaveTextContent('From 2026-07 · rate 0.500% → 0.583% · compounding')
    expect(card).toHaveTextContent('the balance rolls on at the new rate from 2026-07')
    expect(within(card).queryByRole('table')).toBeNull()
    unmount()
    render(<TermsTimeline kind="loan" recordId="l1" segments={[SEGMENTS[0]]} changes={[]} canRevert />)
    expect(screen.queryByRole('heading', { name: 'Terms over time' })).toBeNull()
  })
})
