import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { DateField } from './DateField'

// The kit's date field (2026-10-14, the Finance revamp v2 — D08): the day
// written out on a button, a calendar under it. A day that may be left out
// (an invoice's due date) says so while empty and offers *Clear*.

describe('the date field', () => {
  it('writes the day out; a day in the calendar picks it, Today picks the office’s', () => {
    const onChange = vi.fn()
    render(<DateField value="2026-10-14" onChange={onChange} today="2026-10-14" label="Payment date" />)
    const button = screen.getByRole('button', { name: 'Payment date: Wed, 14 Oct 2026' })
    fireEvent.click(button)
    const cal = screen.getByRole('group', { name: 'Calendar' })
    expect(within(cal).getByRole('button', { name: '14 October 2026' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(cal).getByRole('button', { name: '20 October 2026' }))
    expect(onChange).toHaveBeenCalledWith('2026-10-20')
    expect(within(screen.queryByRole('group', { name: 'Calendar' }) ?? document.body).queryByRole('button', { name: 'Clear' })).toBeNull()
  })

  it('a day left out: its words, nothing picked, the calendar on this month — and Clear once a day is set', () => {
    const onChange = vi.fn()
    const onClear = vi.fn()
    const { rerender } = render(<DateField value="" onChange={onChange} today="2026-10-14" label="Due date" emptyText="No due date" onClear={onClear} />)
    const button = screen.getByRole('button', { name: 'Due date: No due date' })
    expect(button.querySelector('[data-empty="true"]')).toHaveTextContent('No due date')
    fireEvent.click(button)
    const cal = screen.getByRole('group', { name: 'Calendar' })
    expect(within(cal).getByText('October 2026')).toBeInTheDocument()
    expect(within(cal).getByRole('button', { name: '14 October 2026' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(cal).queryByRole('button', { name: 'Clear' })).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    rerender(<DateField value="2026-11-13" onChange={onChange} today="2026-10-14" label="Due date" emptyText="No due date" onClear={onClear} />)
    fireEvent.click(screen.getByRole('button', { name: 'Due date: Fri, 13 Nov 2026' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Calendar' })).getByRole('button', { name: 'Clear' }))
    expect(onClear).toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: 'Calendar' })).toBeNull()
  })
})
