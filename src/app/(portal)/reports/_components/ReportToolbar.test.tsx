import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import ReportToolbar from './ReportToolbar'
import { ReportSearchProvider } from './ReportSearchProvider'

// 2026-10-09 — the month-by-month reports' control row (the Finance revamp
// handoff). A report opened on a month older than the To list reaches still
// shows that month as To, not the list's first.
// 2026-10-10 — the handoff's wording: "From to To", Find "· highlights only";
// a single month picks its month "vs" a month to compare; a balance reads
// "As at" one month.

const nav = vi.hoisted(() => ({ push: vi.fn(), params: '' }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push }),
  usePathname: () => '/reports/income-statement',
  useSearchParams: () => new URLSearchParams(nav.params),
}))

beforeEach(() => {
  nav.push.mockClear()
  nav.params = ''
})

const MONTHS = ['2026-10', '2026-09', '2026-08']

describe('the report control row', () => {
  it('keeps a To older than its list', () => {
    render(
      <ReportSearchProvider level={3}>
        <ReportToolbar from="2023-01" to="2023-05" fromOptions={['2023-01', '2023-02', '2023-03', '2023-04', '2023-05']} toOptions={['2026-10', '2026-09']} segment="" segments={[]} />
      </ReportSearchProvider>,
    )
    expect(screen.getByRole('combobox', { name: 'To' })).toHaveValue('2023-05')
  })

  // 2026-10-12 — the user: descriptions make the view messy. Find is named,
  // with no "· highlights only" hint beside it.
  it('reads the range From "to" To, and names Find without a hint', () => {
    render(
      <ReportSearchProvider level={3}>
        <ReportToolbar from="2026-01" to="2026-10" fromOptions={['2026-01']} toOptions={MONTHS} segment="" segments={[]} />
      </ReportSearchProvider>,
    )
    const row = screen.getByRole('group', { name: 'Report controls' })
    expect(row.querySelector('.rpt-range')).toHaveTextContent(/to/)
    expect(within(row).getByText('Find account')).toBeInTheDocument()
    expect(within(row).queryByText(/highlights only/)).toBeNull()
  })
})

describe('a single month', () => {
  const single = () =>
    render(
      <ReportSearchProvider level={3}>
        <ReportToolbar mode="single" period="2026-10" compare="" monthOptions={MONTHS} segment="" segments={[]} />
      </ReportSearchProvider>,
    )

  it('picks its month "vs" a month to compare', () => {
    single()
    const row = screen.getByRole('group', { name: 'Report controls' })
    expect(within(row).getByRole('combobox', { name: 'Period' })).toHaveValue('2026-10')
    const vs = within(row).getByRole('combobox', { name: 'Compare' })
    expect(vs).toHaveValue('')
    expect(Array.from((vs as HTMLSelectElement).options).map((o) => o.text)).toEqual(['No compare', 'Oct 2026', 'Sep 2026', 'Aug 2026'])
    expect(row.querySelector('.rpt-range')).toHaveTextContent('vs')
  })

  it('goes to the month asked, keeping the compare', () => {
    nav.params = 'period=2026-10&compare=2026-08'
    render(
      <ReportSearchProvider level={3}>
        <ReportToolbar mode="single" period="2026-10" compare="2026-08" monthOptions={MONTHS} segment="" segments={[]} />
      </ReportSearchProvider>,
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Period' }), { target: { value: '2026-09' } })
    expect(nav.push).toHaveBeenCalledWith('/reports/income-statement?period=2026-09&compare=2026-08')
  })

  it('compares with the month chosen, and drops it on No compare', () => {
    single()
    fireEvent.change(screen.getByRole('combobox', { name: 'Compare' }), { target: { value: '2026-09' } })
    expect(nav.push).toHaveBeenLastCalledWith('/reports/income-statement?period=2026-10&compare=2026-09')
    nav.params = 'period=2026-10&compare=2026-09'
    fireEvent.change(screen.getByRole('combobox', { name: 'Compare' }), { target: { value: '' } })
    expect(nav.push).toHaveBeenLastCalledWith('/reports/income-statement?period=2026-10')
  })
})

describe('a balance', () => {
  it('reads As at one month, with nothing to compare', () => {
    render(
      <ReportSearchProvider level={3}>
        <ReportToolbar mode="asat" period="2026-09" monthOptions={MONTHS} segment="" segments={[]} />
      </ReportSearchProvider>,
    )
    const row = screen.getByRole('group', { name: 'Report controls' })
    expect(within(row).getByText('As at')).toBeInTheDocument()
    expect(within(row).getByRole('combobox', { name: 'As at' })).toHaveValue('2026-09')
    expect(within(row).queryByRole('combobox', { name: 'Compare' })).toBeNull()
  })
})
