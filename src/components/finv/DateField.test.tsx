import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

// Where the calendar opens (2026-11-03, the user's *Settle 1 invoice*: it opened over Received date
// inside the form's scroll, and its month and first weeks were cut off under the window's head —
// 显示bug). It is fixed to the window, so nothing cuts it: under the field when it fits below, else
// over it when there is more room above, never past the window's edges — counted from wherever the
// window's corner is drawn (a dialog's transform moves it). Its side holds while its months are walked,
// it follows its field as the form scrolls, and it closes once the field has left the form.

const box = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect

/** happy-dom draws nothing: the field, the form's scroll and the window's corner where a test puts them; the calendar 38px a week. */
function lay(at: { field: () => DOMRect; scope?: DOMRect; corner?: () => [number, number] }) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.matches('[aria-haspopup]')) return at.field()
    if (this.matches('[data-cal-scope]')) return at.scope ?? box(0, 0, 1024, 768)
    if (this.matches('[data-cal-origin]')) return box(...(at.corner?.() ?? [0, 0]), 0, 0)
    return box(0, 0, 0, 0)
  })
  const calendar = (el: HTMLElement) => el.getAttribute('aria-label') === 'Calendar'
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return calendar(this) ? 116 + 38 * Math.ceil(this.querySelectorAll('button[aria-pressed], button[aria-hidden="true"]').length / 7) : 0
  })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return calendar(this) ? 318 : 0
  })
}

describe('where the calendar opens', () => {
  afterEach(() => vi.restoreAllMocks())
  const open = (name: string) => {
    fireEvent.click(screen.getByRole('button', { name }))
    return screen.getByRole('group', { name: 'Calendar' })
  }

  it('the user’s Settle: no room under Received date, so over it — whole, fixed to the window, counted from the dialog’s corner', () => {
    expect([window.innerWidth, window.innerHeight]).toEqual([1024, 768])
    // November 2026 has six weeks (344px); 286px below the field, 414px above it.
    lay({ field: () => box(403, 428, 476, 40), scope: box(380, 241, 520, 311), corner: () => [381, 181] })
    render(
      <div data-cal-scope="">
        <DateField value="2026-11-03" onChange={() => {}} today="2026-11-03" label="Received date" />
      </div>,
    )
    const cal = open('Received date: Tue, 3 Nov 2026')
    expect(cal).toHaveAttribute('data-side', 'up')
    expect(cal.style.top).toBe(`${428 - 6 - 344 - 181}px`)
    expect(cal.style.left).toBe(`${403 - 381}px`)
    expect(within(cal).getByText('November 2026')).toBeInTheDocument()
  })

  it('under the field when it fits there; kept inside the window’s right edge', () => {
    lay({ field: () => box(900, 200, 300, 40) })
    render(<DateField value="2026-10-14" onChange={() => {}} today="2026-10-14" label="Payment date" />)
    const cal = open('Payment date: Wed, 14 Oct 2026')
    expect(cal).toHaveAttribute('data-side', 'down')
    expect(cal.style.top).toBe(`${240 + 6}px`)
    expect(cal.style.left).toBe(`${1024 - 318 - 8}px`)
  })

  it('walking the months keeps its side: over the field, its foot stays 6px above it as the weeks change', () => {
    lay({ field: () => box(100, 600, 300, 40) })
    render(<DateField value="2026-11-03" onChange={() => {}} today="2026-11-03" label="Received date" />)
    const cal = open('Received date: Tue, 3 Nov 2026')
    expect(cal).toHaveAttribute('data-side', 'up')
    expect(cal.style.top).toBe(`${600 - 6 - 344}px`)
    fireEvent.click(within(cal).getByRole('button', { name: 'Next month' }))
    // December 2026 has five weeks (306px).
    expect(within(cal).getByText('December 2026')).toBeInTheDocument()
    expect(cal).toHaveAttribute('data-side', 'up')
    expect(cal.style.top).toBe(`${600 - 6 - 306}px`)
  })

  it('follows its field as the form scrolls, and closes once the field has left the form', () => {
    let top = 200
    lay({ field: () => box(100, top, 300, 40), scope: box(0, 100, 1024, 500) })
    render(
      <div data-cal-scope="">
        <DateField value="2026-10-14" onChange={() => {}} today="2026-10-14" label="Payment date" />
      </div>,
    )
    const cal = open('Payment date: Wed, 14 Oct 2026')
    expect(cal.style.top).toBe('246px')
    top = 150
    fireEvent.scroll(document.querySelector('[data-cal-scope]')!)
    expect(cal.style.top).toBe('196px')
    top = 60
    fireEvent.scroll(document.querySelector('[data-cal-scope]')!)
    expect(screen.queryByRole('group', { name: 'Calendar' })).toBeNull()
  })

  it('opened while the phone’s sheet still rises, it is placed again once the sheet stops — its corner has moved', () => {
    // Mid-rise the sheet's transform holds the calendar (corner 300px down); risen, the window does.
    let corner: [number, number] = [0, 300]
    lay({ field: () => box(20, 500, 300, 40), corner: () => corner })
    render(<DateField value="2026-10-14" onChange={() => {}} today="2026-10-14" label="Payment date" />)
    const cal = open('Payment date: Wed, 14 Oct 2026')
    expect(cal.style.top).toBe(`${500 - 6 - 306 - 300}px`)
    corner = [0, 0]
    fireEvent.transitionEnd(document.body)
    expect(cal.style.top).toBe(`${500 - 6 - 306}px`)
  })

  it('the stylesheet fixes it to the window and leaves its place to the field — no top, bottom or right of its own', () => {
    const css = readFileSync(resolve(__dirname, 'date.module.css'), 'utf8')
    expect(/\n\.pop \{([^}]*)\}/.exec(css)?.[1]).toMatch(/position: fixed;/)
    expect(css).not.toMatch(/\.pop(\[[^\]]*\])? \{[^}]*\b(top|bottom|right):/)
    // On the phone the card is its field's width, as it was (right: 0 would now be the window's edge).
    expect(css).toMatch(/\[data-sheet\] \.pop,\s+\[data-fin-app\] \.pop \{ box-sizing: border-box; width: var\(--date-field-w\); \}/)
  })

  it('tells the card its field’s width (the phone’s sheets draw it that wide)', () => {
    lay({ field: () => box(20, 300, 460, 46) })
    render(<DateField value="2026-10-14" onChange={() => {}} today="2026-10-14" label="Payment date" />)
    expect(open('Payment date: Wed, 14 Oct 2026').style.getPropertyValue('--date-field-w')).toBe('460px')
  })
})
