import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import StatementView from './StatementView'
import { buildPositionRow, groupStatement, type PositionInput, type PositionRow } from '@/lib/counterparty-statement'
import type { TermsChangeComparison } from '@/lib/treasury-terms'

// 2026-10-26 — the Company Statement as the samples left it: Sort and Show over the counterparties; one opens into ONE
// table — a green To collect row with its totals, its positions newest first, the red To repay row the same, a Net row;
// Left and Payoff in two columns; a no-fixed-term deal's interest a month in Interest due; a terms change under its deal.

const base: PositionInput = {
  id: 'l1',
  side: 'collect',
  counterparty: 'The Cont',
  principal: 60000,
  monthlyRate: 0.04,
  tenureMonths: 6,
  compounding: false,
  unscheduled: false,
  startDate: '2025-09-02',
  startMonth: '2026-05',
  principalPaid: 50000,
  outstanding: 10000,
  paymentsByMonth: {},
}
const pos = (over: Partial<PositionInput>) => buildPositionRow({ ...base, ...over }, '2026-10') as PositionRow
const change: TermsChangeComparison = {
  fromYM: '2026-01',
  old: { rate: 0.04, months: 6, principalPerMonth: 10000, interestPerMonth: 2400, endYM: '2025-12', compounding: false },
  new: { rate: 0.04, months: null, principalPerMonth: 0, interestPerMonth: 0, endYM: null, compounding: true, base: 51000 },
  reason: null,
  rows: [],
  totals: { oldInterest: 0, newInterest: 0, diffInterest: 0, oldTotal: 0, newTotal: 0, diffTotal: 0, shortfall: 0 },
}

const flat = pos({})
const compound = { ...pos({ id: 'l2', principal: 10000, outstanding: 10000, principalPaid: 0, compounding: true, startDate: '2026-07-05', startMonth: null }), termsFrom: '2026-01', termsChanges: [change] }
const fund = pos({ id: 'f1', side: 'repay', outstanding: 60000, principalPaid: 0, tenureMonths: null, startDate: '2026-07-24', startMonth: null })
const hc = pos({ id: 'f2', side: 'repay', counterparty: 'HOUZS Century', principal: 220000, outstanding: 220000, principalPaid: 0, tenureMonths: null, monthlyRate: 0.02, startDate: '2026-08-05', startMonth: null })
const { rows, totals } = groupStatement([flat, compound, fund, hc])

const names = () => [...document.querySelectorAll('table.cs-sheet tr.cs-cp td.c-name .font-semibold')].map((n) => n.textContent)

describe('the counterparty table', () => {
  it('gives each side its principal, interest and total, the net worded, how many deals each side has', () => {
    render(<StatementView rows={rows} totals={totals} />)
    const sheet = document.querySelector('table.cs-sheet') as HTMLElement
    expect(sheet.querySelector('th.cs-collect')).toHaveTextContent('To collect')
    expect(sheet.querySelector('th.cs-repay')).toHaveTextContent('To repay')
    const cont = screen.getByText('The Cont').closest('tr') as HTMLElement
    expect(cont).toHaveTextContent('2 to collect · 1 to repay')
    expect(cont.querySelector('td.c-net')).toHaveClass('is-repay')
    expect(cont.querySelector('td.c-net')?.textContent).toMatch(/^Repay \d/)
    const hcRow = screen.getByText('HOUZS Century').closest('tr') as HTMLElement
    expect([...hcRow.querySelectorAll('td')].map((td) => td.textContent).slice(1)).toEqual(['—', '—', '—', '220,000.00', '—', '220,000.00', 'Repay 220,000.00'])
  })

  it('sorts by size, net or name, and shows one side', () => {
    render(<StatementView rows={rows} totals={totals} />)
    expect(names()).toEqual(['HOUZS Century', 'The Cont'])
    fireEvent.click(within(screen.getByRole('group', { name: 'Sort' })).getByRole('button', { name: 'Net' }))
    expect(names()).toEqual(['The Cont', 'HOUZS Century'])
    fireEvent.click(within(screen.getByRole('group', { name: 'Sort' })).getByRole('button', { name: 'A–Z' }))
    expect(names()).toEqual(['HOUZS Century', 'The Cont'])
    fireEvent.click(within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'To collect' }))
    expect(names()).toEqual(['The Cont'])
    expect(document.querySelector('tr.cs-total')).toHaveTextContent('Total · 1 shown')
    expect(document.querySelector('.sect-head .count')).toHaveTextContent('1 / 2 SHOWN')
  })
})

describe('a counterparty opened', () => {
  const open = () => {
    render(<StatementView rows={rows} totals={totals} />)
    fireEvent.click(screen.getByText('The Cont'))
    return document.querySelector('table.cs-pos') as HTMLElement
  }

  it('is one table: To collect then To repay, each opened by its totals, the newest deal first, a Net row closing it', () => {
    const table = open()
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Date', 'Terms', 'Original', 'Total interest', 'Principal due', 'Interest due', 'Total due', 'Left', 'Payoff', 'Open'])
    expect([...table.querySelectorAll('tbody > tr')].map((r) => r.className.split(' ')[0])).toEqual(['cs-sec', 'cs-pos-row', 'cs-terms-row', 'cs-pos-row', 'cs-sec', 'cs-pos-row', 'cs-net'])
    const collect = within(table).getByText('To collect · 2').closest('tr') as HTMLElement
    expect(collect).toHaveClass('is-collect')
    expect(collect.querySelector('td.c-orig')).toHaveTextContent('70,000.00')
    expect(collect.querySelector('td.c-ti')).toHaveTextContent('14,400.00')
    expect(collect.querySelector('td.c-p')).toHaveTextContent('20,000.00')
    expect(within(table).getByText('To repay · 1').closest('tr')).toHaveClass('is-repay')
    const net = table.querySelector('tr.cs-net') as HTMLElement
    expect(net).toHaveTextContent('Net · repay')
    expect(net.querySelector('td.c-p')).toHaveTextContent('−40,000.00')
  })

  it('reads a fixed-term deal as its date, terms, installments left and payoff month', () => {
    const table = open()
    const row = within(table).getByText('4%/mo · 6 mo · from May 2026').closest('tr') as HTMLElement
    expect(row.querySelector('td.c-date')).toHaveTextContent('02 Sep 2025')
    expect(row.querySelector('td.c-orig')).toHaveTextContent('60,000.00')
    expect(row.querySelector('td.c-ti')).toHaveTextContent('14,400.00')
    expect(row.querySelector('td.c-t')).toHaveTextContent('12,400.00')
    expect(row.querySelector('td.c-left')).toHaveTextContent('1 of 6')
    expect(row.querySelector('td.c-pay')).toHaveTextContent('Oct 2026')
    expect(within(row).getByRole('link')).toHaveAttribute('href', '/fund-out/l1')
  })

  it('gives a deal with no schedule no date, a no-fixed-term deal its interest a month, a terms change its comparison', () => {
    const table = open()
    const comp = within(table).getByText('4%/mo · compounding').closest('tr') as HTMLElement
    expect(comp.querySelector('td.c-left')).toHaveTextContent('—')
    expect(comp.querySelector('td.c-pay')).toHaveTextContent('No fixed date')
    expect(within(comp).getByText('Terms from 2026-01')).toBeInTheDocument()
    expect((comp.nextElementSibling as HTMLElement).querySelector('summary')).toHaveTextContent('2026-01 onward')
    const loan = within(table).getByText('4%/mo · no fixed term').closest('tr') as HTMLElement
    expect(loan.querySelector('td.c-i')).toHaveTextContent('2,400.00/mo')
    expect(loan.querySelector('td.c-pay')).toHaveTextContent('No fixed date')
    expect(within(loan).getByRole('link')).toHaveAttribute('href', '/fund-in/f1')
  })
})
