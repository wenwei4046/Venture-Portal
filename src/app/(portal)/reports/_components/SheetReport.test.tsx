import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { SheetRow } from '@/lib/report-sheet'
import { ReportSearchProvider, useReportSearch } from './ReportSearchProvider'
import SheetReport, { type SheetColumn } from './SheetReport'

// 2026-10-10 — the reports' table per the user's Claude Design handoff
// (rptSection): a two-row head, RM and % under every month, the current month
// peach with an orange bar, Accumulated a shade darker; a blue block title,
// groups and items, an open group's figure on a Subtotal row under its items,
// tinted totals; negatives red in brackets, nil as a dash; L1 totals only, L2
// the groups, L3 every item; a single month's items drill into their lines.

const COLUMNS: SheetColumn[] = [
  { key: 'acc', label: 'Accumulated', tone: 'acc' },
  { key: '2026-10', label: 'Oct 2026', tone: 'now' },
  { key: '2026-09', label: 'Sep 2026' },
]
const ROWS: SheetRow[] = [
  { key: 'title:rev', label: 'Revenue', kind: 'title', depth: 0, values: [] },
  { key: '4000', label: '4000 Service fees', code: '4000', kind: 'account', depth: 1, isParent: true, values: [300, 200, 100] },
  { key: '4010', label: '4010 Marketing fees', code: '4010', kind: 'account', depth: 2, values: [250, 150, 100] },
  { key: '4020', label: '4020 Design fees', code: '4020', kind: 'account', depth: 2, values: [50, 50, 0] },
  { key: '4100', label: '4100 Interest income', code: '4100', kind: 'account', depth: 1, values: [-20, 0, -20] },
  { key: 'cat:revenue', label: 'Total Revenue', kind: 'total', depth: 0, values: [280, 200, 80] },
  { key: 'NET', label: 'Net profit', kind: 'total', depth: 0, values: [280, 200, 80], strong: true },
]

function Find({ q }: { q: string }) {
  const ctx = useReportSearch()
  return (
    <button type="button" onClick={() => ctx?.setSearch(q)}>
      find {q}
    </button>
  )
}

const draw = (level: 1 | 2 | 3, props: Partial<Parameters<typeof SheetReport>[0]> = {}) =>
  render(
    <ReportSearchProvider level={level}>
      <Find q="interest" />
      <SheetReport columns={COLUMNS} rows={ROWS} pctBase={[280, 200, 80]} {...props} />
    </ReportSearchProvider>,
  )
const row = (kind: string, text: string) =>
  Array.from(document.querySelectorAll(`tr[data-kind="${kind}"]`)).find((tr) => tr.textContent?.includes(text)) as HTMLElement
const kinds = () => Array.from(document.querySelectorAll('tbody tr')).map((tr) => (tr as HTMLElement).dataset.kind)

describe('the head', () => {
  it('names each month over its RM and % columns', () => {
    draw(3)
    const [top, second] = Array.from(document.querySelectorAll('thead tr'))
    const heads = Array.from(top.querySelectorAll('th')).slice(1)
    expect(heads.map((th) => th.textContent)).toEqual(['Accumulated', 'Oct 2026', 'Sep 2026'])
    expect(heads.map((th) => th.getAttribute('colspan'))).toEqual(['2', '2', '2'])
    expect(Array.from(second.querySelectorAll('th')).map((th) => th.textContent)).toEqual(['RM', '%', 'RM', '%', 'RM', '%'])
  })

  it('marks the current month and the Accumulated', () => {
    draw(3)
    const heads = Array.from(document.querySelectorAll('thead tr:first-child th')).slice(1)
    expect(heads[0]).toHaveClass('is-acc')
    expect(heads[1]).toHaveClass('is-now')
    expect(heads[2]).not.toHaveClass('is-now')
  })

  it('has one RM column a month without a % base', () => {
    draw(3, { pctBase: undefined })
    expect(Array.from(document.querySelectorAll('thead tr:first-child th')).slice(1).map((th) => th.getAttribute('colspan'))).toEqual(['1', '1', '1'])
    expect(Array.from(document.querySelectorAll('thead tr:nth-child(2) th')).map((th) => th.textContent)).toEqual(['RM', 'RM', 'RM'])
  })
})

describe('the rows at L3', () => {
  it('titles the block, opens each group onto its items and closes it on a Subtotal', () => {
    draw(3)
    expect(kinds()).toEqual(['title', 'group', 'item', 'item', 'subtotal', 'group', 'total', 'total'])
    expect(row('title', 'Revenue')).toHaveTextContent(/^Revenue$/)
    // The open group's own line carries no figure; its Subtotal does.
    expect(row('group', 'Service fees')).not.toHaveTextContent('300.00')
    const subtotal = row('subtotal', 'Subtotal')
    expect(subtotal).toHaveTextContent('300.00')
    expect(subtotal).toHaveTextContent('107.1%')
    expect(row('total', 'Total Revenue')).toHaveTextContent('280.00')
  })

  it('folds a group back onto one line with its figure', () => {
    draw(3)
    fireEvent.click(within(row('group', 'Service fees')).getByRole('button', { name: /Service fees/ }))
    expect(kinds()).toEqual(['title', 'group', 'group', 'total', 'total'])
    expect(row('group', 'Service fees')).toHaveTextContent('300.00')
    expect(within(row('group', 'Service fees')).getByRole('button', { name: /Service fees/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('reads a % of each month’s base, and writes a loss red in brackets and nil as a dash', () => {
    draw(3)
    const interest = row('group', 'Interest income')
    const cells = Array.from(interest.querySelectorAll('td')).slice(1)
    expect(cells.map((td) => td.textContent)).toEqual(['(20.00)', '-7.1%', '—', '0.0%', '(20.00)', '-25.0%'])
    expect(cells[0]).toHaveClass('is-neg')
    expect(cells[2]).toHaveClass('is-nil')
    expect(cells[2]).toHaveClass('is-now')
  })
})

describe('the levels', () => {
  it('L2 shows the groups folded, without arrows', () => {
    draw(2)
    expect(kinds()).toEqual(['title', 'group', 'group', 'total', 'total'])
    expect(row('group', 'Service fees')).toHaveTextContent('300.00')
    expect(within(row('group', 'Service fees')).queryByRole('button')).toBeNull()
  })

  it('L1 shows the totals alone', () => {
    draw(1)
    expect(kinds()).toEqual(['total', 'total'])
  })

  it('finds an account at any level and marks it', () => {
    draw(1)
    fireEvent.click(screen.getByRole('button', { name: 'find interest' }))
    expect(kinds()).toEqual(['group', 'total', 'total'])
    expect(row('group', 'Interest income')).toHaveClass('is-hit')
  })
})

describe('a single month’s drill-down', () => {
  const single: SheetRow[] = [
    {
      key: '4100', label: '4100 Interest income', code: '4100', kind: 'account', depth: 1, values: [10, 4],
      txns: [{ key: '4100:t0', ref: 'HV-JV-202610-0012', date: '2026-10-05', text: 'Loan interest · HOUZS Century', value: 10 }],
    },
  ]

  it('opens an account onto its journal lines', () => {
    render(
      <ReportSearchProvider level={3}>
        <SheetReport columns={[{ key: 'cur', label: 'October 2026', tone: 'now' }, { key: 'cmp', label: 'September 2026 · compare' }]} rows={single} drill />
      </ReportSearchProvider>,
    )
    const toggle = within(row('group', 'Interest income')).getByRole('button', { name: /Interest income/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    const line = row('txn', 'HV-JV-202610-0012')
    expect(line).toHaveTextContent('HV-JV-202610-0012 · 05 Oct')
    expect(line).toHaveTextContent('Loan interest · HOUZS Century')
    expect(Array.from(line.querySelectorAll('td')).slice(1).map((td) => td.textContent)).toEqual(['10.00', ''])
  })
})
