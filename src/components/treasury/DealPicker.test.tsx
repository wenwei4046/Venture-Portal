import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import DealPicker, { OwedCell, dealDate, dealMoney, dealRate, type DealPickerItem } from './DealPicker'

interface Loan extends DealPickerItem {
  ratePct: number
  source: string
}

const loans: Loan[] = [
  { id: 'c2', party: 'The Cont', date: '2026-01-02', principal: 40000, outstanding: 30000, ratePct: 2, source: 'WW-(King)' },
  { id: 'c1', party: 'The Cont', date: '2025-05-05', principal: 90000, outstanding: 64500, ratePct: 0.5, source: 'WS' },
  { id: 'k1', party: 'Hookka', date: '2026-03-26', principal: 52500, outstanding: 42500, ratePct: 0, source: 'LWS' },
  { id: 'r1', party: 'Carres', date: '2026-03-15', principal: 200000, outstanding: 175000, ratePct: 3, source: '2990' },
]

function Harness() {
  const [id, setId] = useState('')
  return (
    <>
      <DealPicker<Loan>
        items={loans}
        value={id}
        onChange={setId}
        partyLabel="谁还钱"
        dealLabel="还哪一笔"
        emptyHint="先在上面点一家公司"
        columns={[
          { label: '借出日期', width: '1.1fr', cell: (l) => dealDate(l.date) },
          { label: '本金', width: '1fr', align: 'right', cell: (l) => dealMoney(l.principal) },
          { label: '月息', width: '0.6fr', align: 'right', cell: (l) => dealRate(l.ratePct), dim: (l) => l.ratePct === 0 },
          { label: '尚欠', width: '1.1fr', align: 'right', cell: (l) => <OwedCell principal={l.principal} outstanding={l.outstanding} /> },
          { label: '资金来源', width: '1fr', cell: (l) => l.source },
        ]}
      />
      <output data-testid="picked">{id}</output>
    </>
  )
}

const partyGroup = () => screen.getByRole('radiogroup', { name: '谁还钱' })
const dealGroup = () => screen.getByRole('radiogroup', { name: '还哪一笔' })

describe('DealPicker', () => {
  it('offers one button per party, the largest balance first, with its count and total', () => {
    render(<Harness />)
    const buttons = within(partyGroup()).getAllByRole('radio')
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Carres1 笔欠 175,000.00',
      'The Cont2 笔欠 94,500.00',
      'Hookka1 笔欠 42,500.00',
    ])
    // Nothing is listed until a party is chosen.
    expect(screen.getByText('先在上面点一家公司')).toBeInTheDocument()
  })

  it('lists only that party, oldest first, and takes the row that is clicked', () => {
    render(<Harness />)
    fireEvent.click(within(partyGroup()).getByRole('radio', { name: /The Cont/ }))
    const rows = within(dealGroup()).getAllByRole('radio')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('05 May 2025')
    expect(rows[1]).toHaveTextContent('02 Jan 2026')
    expect(screen.getByTestId('picked')).toHaveTextContent('')

    fireEvent.click(rows[1])
    expect(screen.getByTestId('picked')).toHaveTextContent('c2')
    expect(rows[1]).toHaveAttribute('aria-checked', 'true')
  })

  it('selects outright when the party has a single deal', () => {
    render(<Harness />)
    fireEvent.click(within(partyGroup()).getByRole('radio', { name: /Hookka/ }))
    expect(screen.getByTestId('picked')).toHaveTextContent('k1')
  })

  it('drops a selection that belongs to another party', () => {
    render(<Harness />)
    fireEvent.click(within(partyGroup()).getByRole('radio', { name: /Hookka/ }))
    expect(screen.getByTestId('picked')).toHaveTextContent('k1')
    fireEvent.click(within(partyGroup()).getByRole('radio', { name: /The Cont/ }))
    expect(screen.getByTestId('picked')).toHaveTextContent('')
    expect(within(dealGroup()).getAllByRole('radio')).toHaveLength(2)
  })
})

describe('the picker formats', () => {
  it('prints a date at a fixed width', () => {
    expect(dealDate('2025-05-05')).toBe('05 May 2025')
    expect(dealDate(null)).toBe('—')
  })
  it('prints a rate without trailing zeros, and a dash for none', () => {
    expect(dealRate(0.5)).toBe('0.5%')
    expect(dealRate(4)).toBe('4%')
    expect(dealRate(0.556)).toBe('0.556%')
    expect(dealRate(0)).toBe('—')
  })
})
