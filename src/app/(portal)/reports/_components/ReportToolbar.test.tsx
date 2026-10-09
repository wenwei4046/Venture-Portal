import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ReportToolbar from './ReportToolbar'
import { ReportSearchProvider } from './ReportSearchProvider'

// 2026-10-09 — the month-by-month reports' control row (the Finance revamp
// handoff). A report opened on a month older than the To list reaches still
// shows that month as To, not the list's first.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/reports/monthly-pnl', useSearchParams: () => new URLSearchParams() }))

describe('the report control row', () => {
  it('keeps a To older than its list', () => {
    render(
      <ReportSearchProvider level={3}>
        <ReportToolbar from="2023-01" to="2023-05" fromOptions={['2023-01', '2023-02', '2023-03', '2023-04', '2023-05']} toOptions={['2026-10', '2026-09']} segment="" segments={[]} />
      </ReportSearchProvider>,
    )
    expect(screen.getByRole('combobox', { name: 'To' })).toHaveValue('2023-05')
  })
})
