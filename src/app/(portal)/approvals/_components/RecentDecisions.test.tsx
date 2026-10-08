import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import type { DecisionRow } from '@/lib/approval-queue'
import { inTimeZone } from '@/test/time-zone'

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

// A moment in the office (UTC+8) — what the table prints, whatever zone runs the suite.
const at = (day: number, hour = 10) => `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+08:00`
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

// 2026-10-08: the day a decision was taken came from the MACHINE's clock, so
// one taken after midnight in the office was the day before on the server
// (UTC) and that day in the browser (UTC+8) — two different tables, and React
// threw the server's away.
describe('on the office clock', () => {
  it('the server (UTC) and the browser (UTC+8) render the same table, on the office day', () => {
    // 17:10 UTC on the 4th is ten past one on the 5th in the office.
    const late: DecisionRow[] = [{ ...rows[0], id: 'late', decidedAt: '2026-10-04T17:10:00Z' }]
    const html = (zone: string) => inTimeZone(zone, () => renderToString(<RecentDecisions rows={late} />))
    const server = html('UTC')
    expect(html('Asia/Kuala_Lumpur')).toBe(server)
    const page = document.createElement('div')
    page.innerHTML = server
    expect(page.querySelector('.q-sub .on')).toHaveTextContent('5 Oct')
    expect(server).not.toContain('4 Oct')
  })
})
