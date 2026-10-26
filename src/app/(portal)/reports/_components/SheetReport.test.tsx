import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { SheetRow, SheetTxn } from '@/lib/report-sheet'
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

// 2026-10-24 — the user's drill-down ("我想要这样的概念"): a single month's account opens on its whole row onto a
// ledger of its lines. 2026-10-26 — the mockup's fifth round ("点开看 detail 可以那个 amount 在那个月份下面吗？… 然后加多一个
// L4"): a month-by-month account opens onto its lines as rows of the sheet, newest first, each figure under its own
// month; L4 opens every account in one read.
const txn = (key: string, date: string, debit: number, credit: number, ref: string, more: Partial<SheetTxn> = {}): SheetTxn => ({
  key, ref, date, text: 'Claude AI Claim', party: 'Tan Yong Hong', value: debit - credit, debit, credit,
  otherSide: '3000 · Cash & Bank - Hong Leong', ref2: 'HV-PV-202610-0520', ...more,
})
const cellsOf = (tr: HTMLElement) => within(tr).getAllByRole('cell').map((td) => td.textContent)

describe('a single month’s drill-down', () => {
  const single: SheetRow[] = [
    {
      key: '4100', label: '4100 Interest income', code: '4100', kind: 'account', depth: 1, values: [10, 4],
      txns: [txn('4100:t0', '2026-10-05', 0, 10, 'HV-JV-202610-0012', { text: 'Loan interest', party: 'HOUZS Century', ref2: null })],
    },
  ]
  const draw1 = (rows: SheetRow[]) =>
    render(
      <ReportSearchProvider level={3}>
        <SheetReport columns={[{ key: 'cur', label: 'October 2026', tone: 'now' }, { key: 'cmp', label: 'September 2026 · compare' }]} rows={rows} drill drillMonth="2026-10" />
      </ReportSearchProvider>,
    )

  it('opens an account onto its journal lines as a ledger, who first', () => {
    draw1(single)
    const toggle = within(row('group', 'Interest income')).getByRole('button', { name: /Interest income/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const ledger = within(row('drill', 'HV-JV-202610-0012')).getByRole('table')
    expect(within(ledger).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Date', 'Description', 'Other side', 'Ref. 1', 'Ref. 2', 'Debit', 'Credit',
    ])
    const [, line, foot] = within(ledger).getAllByRole('row')
    expect(cellsOf(line)).toEqual(['2026-10-05', 'HOUZS Century · Loan interest', '3000 · Cash & Bank - Hong Leong', 'HV-JV-202610-0012', '—', '—', '10.00'])
    expect(line.querySelector('.sr-dl-party')).toHaveTextContent(/^HOUZS Century$/)
    expect(foot).toHaveTextContent('1 line · Open in General Ledger ↗ · Oct 2026')
    expect(cellsOf(foot).slice(1)).toEqual(['0.00', '10.00'])
    expect(within(foot).getByRole('link', { name: /Open in General Ledger/ })).toHaveAttribute('href', '/reports/ledger?codes=4100&from=2026-10-01&to=2026-10-31')
    fireEvent.click(toggle)
    expect(row('drill', 'HV-JV-202610-0012')).toBeUndefined()
  })

  it('opens on its whole row, and the bridge’s own account has no General Ledger to open', () => {
    draw1([{ ...single[0], key: 'out:IB-XFER', code: 'IB-XFER', label: 'IB-XFER Internal transfers' }])
    fireEvent.click(row('group', 'Internal transfers').querySelectorAll('td')[1])
    const drill = row('drill', 'HV-JV-202610-0012')
    expect(within(drill).queryByRole('link')).toBeNull()
    expect(drill).toHaveTextContent('1 line · Oct 2026')
  })
})

function Level({ to }: { to: 1 | 2 | 3 | 4 }) {
  const ctx = useReportSearch()
  return (
    <button type="button" onClick={() => ctx?.setLevel(to)}>
      level {to}
    </button>
  )
}

describe('a month-by-month account opened', () => {
  const MONTHS: SheetColumn[] = [
    { key: 'acc', label: 'Accumulated', tone: 'acc' },
    { key: '2026-10', label: 'Oct 2026', tone: 'now' },
    { key: '2026-09', label: 'Sep 2026' },
    { key: '2026-08', label: 'Aug 2026' },
  ]
  // The P&L reads a cost negative; its lines come signed as it reads.
  const PNL: SheetRow[] = [
    { key: 'title:exp', label: 'Expenses', kind: 'title', depth: 0, values: [] },
    { key: 'exp:9020', label: '9020 Marketing Expense', code: '9020', kind: 'account', depth: 1, values: [-350, -350, 0, 0] },
    { key: 'exp:9087', label: '9087 Website & Software', code: '9087', kind: 'account', depth: 1, values: [-600, -400, -200, 0] },
    { key: 'cat:exp', label: 'Total Expenses', kind: 'total', depth: 0, values: [-950, -750, -200, 0] },
  ]
  const L9087 = [
    txn('a', '2026-09-12', 200, 0, 'JE-202609-0001', { value: -200 }),
    txn('b', '2026-10-04', 150, 0, 'JE-202610-0002', { value: -150, party: 'KHO WEI JIE', text: 'Outsource Design', ref2: 'HV-PV-202610-0447' }),
    txn('c', '2026-10-15', 250, 0, 'JE-202610-0003', { value: -250 }),
  ]
  const L9020 = [txn('d', '2026-10-04', 350, 0, 'JE-202610-0004', { value: -350, party: 'SIA JOSIAH', text: 'Outsource Design' })]
  const answer = (lines: Record<string, SheetTxn[]>) => vi.fn(async () => ({ ok: true, lines }))
  const drawM = (rows: SheetRow[], open: (ask: unknown) => Promise<unknown>, opts: { report?: 'pnl' | 'cash-flow'; variant?: 'dept' } = {}) =>
    render(
      <ReportSearchProvider level={3} levels={4}>
        <Level to={4} />
        <Level to={3} />
        <SheetReport columns={MONTHS} rows={rows} monthly={{ open: open as never, report: opts.report ?? 'pnl', segment: 'marketing' }} variant={opts.variant} />
      </ReportSearchProvider>,
    )
  const lineRows = () => Array.from(document.querySelectorAll('tr[data-kind="line"]')) as HTMLElement[]

  it('reads its lines when it opens and lists them as rows of the sheet, newest first, each figure under its month', async () => {
    const open = answer({ 'pnl:9087': L9087 })
    drawM(PNL, open)
    const toggle = within(row('group', 'Website')).getByRole('button', { name: /Website/ })
    fireEvent.click(toggle)
    expect(open).toHaveBeenCalledWith({ report: 'pnl', segment: 'marketing', from: '2026-08', to: '2026-10', rows: [{ code: '9087', side: null }] })
    expect(screen.getByRole('status')).toHaveTextContent('Reading the lines…')
    await waitFor(() => expect(lineRows()).toHaveLength(3))
    expect(lineRows().map((tr) => tr.querySelector('.sr-ln-date')?.textContent)).toEqual(['2026-10-15', '2026-10-04', '2026-09-12'])
    // "date · NAME · what it was · document", the name bold; its figure in the Total and its month, a dash elsewhere.
    const [, outsource] = lineRows()
    expect(outsource.querySelector('td')).toHaveTextContent('2026-10-04KHO WEI JIE · Outsource DesignHV-PV-202610-0447')
    expect(outsource.querySelector('.sr-ln-party')).toHaveTextContent(/^KHO WEI JIE$/)
    expect(cellsOf(outsource).slice(1)).toEqual(['(150.00)', '(150.00)', '—', '—'])
    expect(outsource.title).toContain('Ref. 1 JE-202610-0002 · Ref. 2 HV-PV-202610-0447')
    expect(outsource.title).toContain('Other side 3000 · Cash & Bank - Hong Leong')
    expect(outsource.title).toContain('Debit 150.00 · Credit 0.00')
    const foot = row('line-foot', 'lines')
    expect(foot).toHaveTextContent('3 lines · Open in General Ledger ↗ · Aug – Oct 2026')
    expect(within(foot).getByRole('link')).toHaveAttribute('href', '/reports/ledger?codes=9087&from=2026-08-01&to=2026-10-31')
    expect(document.querySelector('.sheet-rpt')).toHaveClass('has-lines')

    // Folded and opened again, it keeps what it read.
    fireEvent.click(toggle)
    expect(lineRows()).toHaveLength(0)
    expect(document.querySelector('.sheet-rpt')).not.toHaveClass('has-lines')
    fireEvent.click(toggle)
    expect(lineRows()).toHaveLength(3)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('opens every account at L4 in one read, a click closing one', async () => {
    const open = answer({ 'pnl:9020': L9020, 'pnl:9087': L9087 })
    drawM(PNL, open)
    fireEvent.click(screen.getByRole('button', { name: 'level 4' }))
    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ rows: [{ code: '9020', side: null }, { code: '9087', side: null }] }))
    await waitFor(() => expect(lineRows()).toHaveLength(4))
    fireEvent.click(row('group', 'Website'))
    expect(lineRows()).toHaveLength(1)
    expect(within(row('group', 'Website')).getByRole('button')).toHaveAttribute('aria-expanded', 'false')
    expect(open).toHaveBeenCalledTimes(1)
    // Back at L3 the accounts are folded again.
    fireEvent.click(screen.getByRole('button', { name: 'level 3' }))
    expect(lineRows()).toHaveLength(0)
  })

  it('says why it could not read the lines, and reads again on Try again', async () => {
    const open = vi.fn(async () => ({ ok: false, reason: 'These lines are not open to you.' }))
    drawM(PNL, open)
    fireEvent.click(within(row('group', 'Website')).getByRole('button', { name: /Website/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('These lines are not open to you.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(open).toHaveBeenCalledTimes(2))
  })

  it('opens the cash rows with their side, never the receivables under them', async () => {
    const open = answer({ 'in:5000': L9087.map((t) => ({ ...t, value: 0 - t.value })) })
    const cash: SheetRow[] = [
      { key: 'in:operating:5000', label: '5000 Service revenue', code: '5000', kind: 'account', depth: 1, values: [600, 400, 200, 0] },
      { key: 'AR_P_carres', label: 'Carres', code: '3033', kind: 'account', depth: 1, values: [80, 80, 0, 0] },
    ]
    drawM(cash, open, { report: 'cash-flow' })
    expect(within(row('group', 'Carres')).queryByRole('button')).toBeNull()
    fireEvent.click(row('group', 'Carres'))
    expect(open).not.toHaveBeenCalled()
    fireEvent.click(within(row('group', 'Service revenue')).getByRole('button'))
    expect(open).toHaveBeenCalledWith({ report: 'cash-flow', segment: 'marketing', from: '2026-08', to: '2026-10', rows: [{ code: '5000', side: 'in' }] })
    await waitFor(() => expect(lineRows()).toHaveLength(3))
  })

  it('reads money out positive on a department’s page, its lines with it', async () => {
    const out = [txn('e', '2026-10-04', 150, 0, 'JE-202610-0002', { value: -150 })]
    const open = answer({ 'out:9087': out })
    const dept: SheetRow[] = [
      { key: 'title:out', label: 'Money out', kind: 'title', depth: 0, values: [150, 150, 0, 0], side: 'out', pctBase: [150, 150, 0, 0] },
      { key: 'out:grp:9087', label: 'Website & Software', code: '9087', kind: 'account', depth: 1, values: [150, 150, 0, 0], side: 'out', pctBase: [150, 150, 0, 0] },
    ]
    drawM(dept, open, { report: 'cash-flow', variant: 'dept' })
    fireEvent.click(row('group', 'Website'))
    await waitFor(() => expect(lineRows()).toHaveLength(1))
    // The figure in its month, positive and not red; no % beside a line.
    const cells = Array.from(lineRows()[0].querySelectorAll('td.sr-num'))
    expect(cells.map((td) => td.textContent)).toEqual(['150.00', '150.00', '—', '—'])
    expect(cells[0]).not.toHaveClass('is-neg')
    expect(Array.from(lineRows()[0].querySelectorAll('td.sr-pct')).map((td) => td.textContent)).toEqual(['', '', '', ''])
  })
})

// 2026-10-25 — a department's page dresses the sheet as its charts (the mockup's rounds 11–12): each block opens on
// its side's total, a group keeps its figure on its own line, L2 opens a group by its ▶, a % of each row's own base.
describe('a department’s sheet', () => {
  const DEPT_COLUMNS: SheetColumn[] = [
    { key: 'acc', label: 'Total', tone: 'acc' },
    { key: '2026-10', label: 'Oct 2026 *', tone: 'now' },
    { key: '2026-09', label: 'Sep 2026' },
  ]
  const IN = [300, 200, 100]
  const DEPT_ROWS: SheetRow[] = [
    { key: 'OPENING_CASH', label: 'Opening cash', kind: 'total', depth: 0, values: [1000, 1040, 1000], pctBase: null },
    { key: 'title:in', label: 'Money in', kind: 'title', depth: 0, values: IN, side: 'in', pctBase: IN },
    { key: 'in:grp', label: 'Accounts Receivable - Subs', kind: 'account', depth: 1, isParent: true, values: IN, side: 'in', pctBase: IN },
    { key: 'in:grp:3033', label: 'AR - Carres', code: '3033', kind: 'account', depth: 2, values: [240, 200, 40], side: 'in', pctBase: IN, swatch: '#3f7a64' },
    { key: 'in:grp:3034', label: 'AR - Dream Crafter', code: '3034', kind: 'account', depth: 2, values: [60, 0, 60], side: 'in', pctBase: IN, swatch: '#5b7ba6' },
    { key: 'NET_CHANGE', label: 'Net change', kind: 'total', depth: 0, values: [180, 140, 40], pctBase: IN, strong: true },
  ]
  const drawDept = (level: 1 | 2 | 3) =>
    render(
      <ReportSearchProvider level={level}>
        <SheetReport columns={DEPT_COLUMNS} rows={DEPT_ROWS} variant="dept" />
      </ReportSearchProvider>,
    )
  const pcts = (tr: HTMLElement) => Array.from(tr.querySelectorAll('td.sr-pct')).map((td) => td.textContent)

  it('carries a block’s total on its title at every level, money in green', () => {
    drawDept(1)
    expect(kinds()).toEqual(['total', 'title', 'total'])
    expect(row('title', 'Money in')).toHaveClass('is-in')
    expect(row('title', 'Money in')).toHaveTextContent('300.00')
    expect(pcts(row('title', 'Money in'))).toEqual(['100.0%', '100.0%', '100.0%'])
  })

  it('opens a category by its ▶ at L2, its figure staying on its own line, no Subtotal', () => {
    drawDept(2)
    expect(kinds()).toEqual(['total', 'title', 'group', 'total'])
    fireEvent.click(within(row('group', 'Accounts Receivable')).getByRole('button'))
    expect(kinds()).toEqual(['total', 'title', 'group', 'item', 'item', 'total'])
    expect(row('group', 'Accounts Receivable')).toHaveTextContent('300.00')
  })

  it('has every category open at L3, each closed by hand', () => {
    drawDept(3)
    expect(kinds()).toEqual(['total', 'title', 'group', 'item', 'item', 'total'])
    fireEvent.click(within(row('group', 'Accounts Receivable')).getByRole('button'))
    expect(kinds()).toEqual(['total', 'title', 'group', 'total'])
  })

  it('reads each row’s % of its own base — 0.0% beside a nil figure, a dash with no base', () => {
    drawDept(3)
    expect(pcts(row('item', 'Dream Crafter'))).toEqual(['20.0%', '0.0%', '60.0%'])
    expect(pcts(row('total', 'Opening cash'))).toEqual(['—', '—', '—'])
    expect(pcts(row('total', 'Net change'))).toEqual(['60.0%', '70.0%', '40.0%'])
  })

  it('squares an account in its chart colour and names the Total first', () => {
    drawDept(3)
    const square = row('item', 'AR - Carres').querySelector<HTMLElement>('.sr-sw')
    expect(square?.style.background).toMatch(/#3f7a64|rgb\(63, 122, 100\)/)
    expect(Array.from(document.querySelectorAll('thead tr:first-child th')).slice(1).map((th) => th.textContent)).toEqual(['Total', 'Oct 2026 *', 'Sep 2026'])
  })
})
