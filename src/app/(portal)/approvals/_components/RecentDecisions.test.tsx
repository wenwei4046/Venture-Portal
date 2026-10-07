import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { DecisionRow } from '@/lib/approval-queue'

// 2026-10-07 — Recent decisions as a table under the queue (the approved
// Approvals sample): number, text, type, the decision as a chip, who sent it,
// when it was decided, the amount.

const mocks = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
}))

import RecentDecisions from './RecentDecisions'

const at = (day: number, hour = 10) => new Date(2026, 9, day, hour, 0, 0).toISOString()
const rows: DecisionRow[] = [
  { id: 'r1', voucherNo: 'HV-PV-202610-0463', description: 'Payroll bank transfer — Sep 2026', typeLabel: 'Payment voucher', decision: 'approved', submitterName: 'Finance Manager', decidedAt: at(5, 14), amount: 105519.29, href: '/approvals/r1' },
  { id: 'r2', voucherNo: 'HV-PV-202610-0448', description: 'Hostel & Accommodation', typeLabel: 'Payment voucher', decision: 'rejected', submitterName: 'ONG MEI SHUANG', decidedAt: at(4, 9), amount: 3450, href: '/approvals/r2' },
  { id: 'r3', voucherNo: null, description: 'Fund in from Mr Liang', typeLabel: 'New fund source', decision: 'approved', submitterName: 'Finance Manager', decidedAt: at(3, 9), amount: 60000, href: '/approvals/r3' },
]

function desktop(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia
}
const bodyRows = () => Array.from(document.querySelectorAll('tbody tr:not(.lt-detail)')) as HTMLElement[]

beforeEach(() => {
  vi.clearAllMocks()
  desktop(true)
})

describe('recent decisions', () => {
  it('is a table headed with how many it lists, each decision a chip in its colour', () => {
    render(<RecentDecisions rows={rows} />)
    expect(document.querySelector('.sect-head')).toHaveTextContent('Recent decisions')
    expect(document.querySelector('.sect-head .count')).toHaveTextContent('LAST 3 RESOLVED')
    expect(Array.from(document.querySelectorAll('thead th')).map((th) => th.textContent?.replace(/[↕▲▼]/g, '').trim())).toEqual([
      'Voucher #', 'Description', 'Type', 'Decision', 'By', 'Decided', 'Amount', '',
    ])
    const first = bodyRows()[0]
    expect(within(first).getByRole('link', { name: 'HV-PV-202610-0463' })).toHaveAttribute('href', '/approvals/r1')
    expect(first).toHaveTextContent('Payroll bank transfer — Sep 2026')
    const decisionCell = (tr: HTMLElement) => tr.querySelectorAll('td')[3] as HTMLElement
    expect(within(decisionCell(first)).getByText('approved')).toHaveClass('chip', 'ledger')
    expect(first).toHaveTextContent('5 Oct')
    expect(first).toHaveTextContent('RM 105,519.29')
    expect(within(decisionCell(bodyRows()[1])).getByText('rejected')).toHaveClass('chip', 'danger')
    // A request without a voucher number shows a dash, not a blank link.
    expect(bodyRows()[2].querySelectorAll('td')[0]).toHaveTextContent('—')
  })

  it('opens a decision from its row on a phone', () => {
    desktop(false)
    render(<RecentDecisions rows={rows} />)
    const first = bodyRows()[0]
    // The small print under the description carries the number and the outcome.
    const description = first.querySelectorAll('td')[1]
    expect(description).toHaveTextContent('HV-PV-202610-0463')
    expect(within(description).getByText('approved')).toHaveClass('chip')
    fireEvent.click(within(first).getByRole('button', { name: '展开明细' }))
    fireEvent.click(screen.getByText('Open the voucher →'))
    expect(mocks.push).toHaveBeenCalledWith('/approvals/r1')
  })

  it('shows nothing at all when nothing has been decided', () => {
    const { container } = render(<RecentDecisions rows={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
