import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { DeptChartData } from '@/lib/dept-charts'
import DeptCharts from './DeptCharts'

// 2026-10-25 — a department's charts (the mockup's twelfth round): a Month — Total first — and its two donuts beside
// the months' bars, then the two ranked cards; pointing at a month lists every source and use.

const DATA: DeptChartData = {
  months: ['2026-08', '2026-09', '2026-10'],
  in: {
    total: 690,
    months: [100, 290, 300],
    pieces: [
      { code: '3033', name: 'AR - Carres', total: 600, months: [100, 200, 300], color: '#3f7a64' },
      { code: '3034', name: 'AR - Dream Crafter', total: 90, months: [0, 90, 0], color: '#5b7ba6' },
    ],
  },
  out: {
    total: 480,
    months: [160, 160, 160],
    pieces: [
      { code: '4070', name: 'Accrual - Salary', total: 450, months: [150, 150, 150], color: '#e99a53' },
      { code: '9094', name: 'Office Rental', total: 30, months: [10, 10, 10], color: '#2f6e7c' },
    ],
  },
  net: { total: 210, months: [-60, 130, 140] },
}

const month = () => screen.getByRole('group', { name: 'Month' })
const legend = (side: string) => within(screen.getByRole('list', { name: side })).getAllByRole('listitem').map((li) => li.textContent)

describe('a department’s charts', () => {
  it('open on the Total: the period’s donuts and ranked bars', () => {
    render(<DeptCharts view="cash-flow" data={DATA} running="2026-10" />)
    expect(within(month()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Total', 'Aug', 'Sep', 'Oct *'])
    expect(within(month()).getByRole('button', { name: 'Total' })).toHaveAttribute('aria-pressed', 'true')
    expect(legend('Money in')).toEqual(['AR - Carres600', 'AR - Dream Crafter90'])
    const sources = screen.getByRole('group', { name: 'Money in · by source' })
    expect(sources).toHaveTextContent('600.00')
    expect(sources).toHaveTextContent('87.0%')
    expect(screen.getByRole('group', { name: 'Money out · by use' })).toHaveTextContent('Accrual - Salary')
  })

  it('look at one month when it is picked, above or by its bars', () => {
    render(<DeptCharts view="cash-flow" data={DATA} running="2026-10" />)
    fireEvent.click(within(month()).getByRole('button', { name: 'Sep' }))
    expect(legend('Money in')).toEqual(['AR - Carres200', 'AR - Dream Crafter90'])
    fireEvent.click(document.querySelector('g.mcol[data-month="2026-10"]')!)
    expect(within(month()).getByRole('button', { name: 'Oct *' })).toHaveAttribute('aria-pressed', 'true')
    expect(legend('Money in')).toEqual(['AR - Carres300'])
  })

  it('list each source and use, and the net, of a month pointed at', () => {
    render(<DeptCharts view="cash-flow" data={DATA} running="2026-10" />)
    fireEvent.mouseEnter(document.querySelector('g.mcol[data-month="2026-09"]')!)
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('Sep 2026')
    expect(tip).toHaveTextContent('AR - Dream Crafter90.0031.0%')
    expect(tip).toHaveTextContent('Accrual - Salary150.0093.8%')
    expect(tip).toHaveTextContent('— Net change130.00')
    fireEvent.mouseLeave(document.querySelector('g.mcol[data-month="2026-09"]')!)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('name the P&L’s sides', () => {
    render(<DeptCharts view="pnl" data={DATA} running={null} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Income vs Expenses' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'What came in and what was spent' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Expenses · by type' })).toBeInTheDocument()
    expect(within(month()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Total', 'Aug', 'Sep', 'Oct'])
  })
})
