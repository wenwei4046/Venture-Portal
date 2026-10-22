import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { BulkBar, BulkButton, cardRowFit, HubCards, ItemList, MonthNav, type HubCardItem } from './Hub'

// The hub's parts Invoice added (2026-10-14, the Finance revamp v2 — D10): the
// month pill (its label opening the year's months — ours, kept from Service
// Billing's month control), the lists that are not the table's, and the dark
// bar of what is ticked.

describe('the cards', () => {
  // 2026-10-22 (the user: "可以帮我把finance 的这些card move 上去吗"): on a desktop the cards sit in a
  // row above the table, the stylesheet measuring their box in steps of 280px + 185px (hub-row-css.test.ts).
  it('say how many there are and the step a row needs, in a box of their own the row is measured on', () => {
    const cards: HubCardItem[] = (['all', 'draft', 'paid'] as const).map((k) => ({ key: k, tone: k, icon: 'doc', label: k, sub: '1 voucher', value: 'RM 1.00' }))
    render(<HubCards heroLabel="Total paid · October 2026" heroValue="RM 3.00" cards={cards} active="all" onSelect={vi.fn()} />)
    const row = screen.getByRole('button', { name: /draft/ }).parentElement
    expect(row).toHaveAttribute('data-one-row', '3')
    expect(row).toHaveAttribute('data-two-rows', '2')
    expect(row?.style.getPropertyValue('--n')).toBe('3')
    expect(row?.style.getPropertyValue('--half')).toBe('2')
    expect(row?.parentElement?.children).toHaveLength(1)
  })

  it('need a wider step for a figure a 175px card cannot hold (9px a character, 14px a side)', () => {
    // Payments' figures fit 175px: seven cards a row at step 7, four columns of two rows at step 4.
    expect(cardRowFit(['RM 6,818,165.79', 'RM 0.00', 'RM 34,502.60', 'RM 0.00', 'RM 6,486,252.88', 'RM 297,410.31', 'RM 484,543.72'], 'RM 805,786.16')).toEqual({ one: 7, two: 4 })
    // The Allocator's "RM 23,456.78 to bill" needs 208px: four a row from step 5 (1205px), two rows from step 3.
    expect(cardRowFit(['RM 23,456.78 to bill', 'RM 62,955.52 billed', '41 active', '6 / 9 companies'], 'RM 86,412.30')).toEqual({ one: 5, two: 3 })
    // The total's figure counts too (26px, 15.6px a character, 16px a side, 1.6 cards).
    expect(cardRowFit(['RM 1.00', 'RM 1.00', 'RM 1.00'], 'RM 1,234,567,890.00')).toEqual({ one: 4, two: 3 })
  })
})

describe('the month pill', () => {
  it('steps a month either way', () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    render(<MonthNav label="October 2026" onPrev={onPrev} onNext={onNext} />)
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(onPrev).toHaveBeenCalledTimes(1)
    expect(onNext).toHaveBeenCalledTimes(1)
    // Without a picker the label is words, not a button.
    expect(screen.queryByRole('button', { name: 'October 2026' })).toBeNull()
  })

  it('its label opens the year’s months: the month on show picked, this month ringed, the year stepped', () => {
    const onPick = vi.fn()
    render(<MonthNav label="October 2026" onPrev={vi.fn()} onNext={vi.fn()} month="2026-10" thisMonth="2026-11" onPick={onPick} />)
    fireEvent.click(screen.getByRole('button', { name: 'October 2026' }))
    const grid = screen.getByRole('group', { name: 'Months' })
    expect(within(grid).getByRole('button', { name: 'Oct' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(grid).getByRole('button', { name: 'Nov' })).toHaveAttribute('data-now', 'true')
    fireEvent.click(within(grid).getByRole('button', { name: 'Previous year' }))
    expect(grid).toHaveTextContent('2025')
    fireEvent.click(within(grid).getByRole('button', { name: 'Dec' }))
    expect(onPick).toHaveBeenCalledWith('2025-12')
    expect(screen.queryByRole('group', { name: 'Months' })).toBeNull()
  })

  it('This month comes home; Escape closes it', () => {
    const onPick = vi.fn()
    render(<MonthNav label="March 2026" onPrev={vi.fn()} onNext={vi.fn()} month="2026-03" thisMonth="2026-10" onPick={onPick} />)
    fireEvent.click(screen.getByRole('button', { name: 'March 2026' }))
    fireEvent.click(screen.getByRole('button', { name: 'This month' }))
    expect(onPick).toHaveBeenCalledWith('2026-10')
    fireEvent.click(screen.getByRole('button', { name: 'March 2026' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('group', { name: 'Months' })).toBeNull()
  })
})

describe('a list that is not the table’s', () => {
  it('bands its name and count, then a row an item: name, its line, the figure, one button', () => {
    const onOpen = vi.fn()
    const act = vi.fn()
    render(
      <ItemList
        title="Credit notes"
        count="2 credit notes"
        empty="No credit notes."
        items={[
          { key: 'a', label: 'HV-CN-202610-0002', sub: 'HOUZS Bedding (HB) · Overbilled', value: '−220.40', valueTone: 'danger', action: { label: 'Approve', onClick: act }, onOpen },
          { key: 'b', label: 'HV-CN-202609-0004', sub: 'HOUZS Century (HC)', value: '−1,500.00', action: { label: 'PDF', href: '/doc?id=b', newTab: true } },
        ]}
      />,
    )
    expect(screen.getByText('Credit notes').parentElement).toHaveTextContent('Credit notes2 credit notes')
    expect(screen.getByText('−220.40')).toHaveAttribute('data-tone', 'danger')
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(act).toHaveBeenCalled()
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('HV-CN-202610-0002'))
    expect(onOpen).toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'PDF' })).toHaveAttribute('target', '_blank')
  })

  it('says so when there is nothing', () => {
    render(<ItemList title="Marketing projects" count="0 projects" empty="No marketing projects yet." items={[]} />)
    expect(screen.getByText('No marketing projects yet.')).toBeInTheDocument()
  })
})

describe('the bar of what is ticked', () => {
  it('sits over the shell’s frame, saying how many and how much, the payer under it', () => {
    const frame = document.createElement('div')
    frame.setAttribute('data-hrv-overlay', '')
    document.body.appendChild(frame)
    const settle = vi.fn()
    render(
      <BulkBar text="2 selected · RM 4,204.00" sub="HOUZS Century (HC)">
        <BulkButton>Clear</BulkButton>
        <BulkButton primary off onClick={settle}>
          Settle 2 →
        </BulkButton>
      </BulkBar>,
    )
    const bar = screen.getByRole('region', { name: 'What is ticked' })
    expect(frame.contains(bar)).toBe(true)
    expect(bar).not.toHaveAttribute('data-fixed')
    expect(bar).toHaveTextContent('2 selected · RM 4,204.00HOUZS Century (HC)')
    const button = within(bar).getByRole('button', { name: 'Settle 2 →' })
    expect(button).toHaveAttribute('data-off', 'true')
    fireEvent.click(button)
    expect(settle).toHaveBeenCalled()
    frame.remove()
  })

  it('is fixed to the window where no shell is drawn', () => {
    render(
      <BulkBar text="1 selected · RM 300.00" sub="">
        <BulkButton>Clear</BulkButton>
      </BulkBar>,
    )
    expect(screen.getByRole('region', { name: 'What is ticked' })).toHaveAttribute('data-fixed', 'true')
  })
})
