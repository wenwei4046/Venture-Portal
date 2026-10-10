import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

// 2026-10-09 — the Repayment Schedule's calendar (the user's Claude Design
// handoff): the month's installments on their days, money we collect (↓,
// Fund OUT) and money we pay (↑, Fund IN), each tinted by where it stands —
// paid, due, part paid, overdue; a card on hover, the record on a click, and
// "+N more" when a day holds more than four.

const mocks = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))

import RepayCalendar, { type CalendarEvent } from './RepayCalendar'

const ev = (date: string, kind: 'collect' | 'pay', name: string, amount: number, status: CalendarEvent['status'], over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  date, kind, name, amount, status, outstanding: status === 'paid' ? 0 : amount, no: 3, months: 6, rate: 0.04, principal: 60000,
  href: `/fund-${kind === 'collect' ? 'out' : 'in'}/${name}`, ...over,
})

const EVENTS: CalendarEvent[] = [
  ev('2026-10-02', 'collect', 'CAR', 12400, 'overdue'),
  ev('2026-10-02', 'pay', 'HC', 8333.33, 'paid'),
  ev('2026-10-15', 'collect', 'HK', 12200, 'partial', { outstanding: 2200 }),
  ...['A', 'B', 'C', 'D', 'E', 'F'].map((n) => ev('2026-10-20', 'collect', n, 1000, 'due')),
]

beforeEach(() => vi.clearAllMocks())

describe('the repayment calendar', () => {
  it('lays the month out Monday to Sunday with each installment on its day', () => {
    render(<RepayCalendar month="2026-10" today="2026-10-09" events={EVENTS} />)
    expect(Array.from(document.querySelectorAll('.cal-head > div')).map((d) => d.textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    // 1 Oct 2026 is a Thursday: three blank days lead the month.
    const cells = Array.from(document.querySelectorAll('.cal-grid .cal-day'))
    expect(cells.slice(0, 3).every((c) => c.classList.contains('blank'))).toBe(true)
    expect(cells[3]).toHaveTextContent('1')
    const today = document.querySelector('.cal-day.today') as HTMLElement
    expect(today.querySelector('.cal-num')).toHaveTextContent('9')
    const second = document.querySelector('[data-day="2026-10-02"]') as HTMLElement
    const items = within(second).getAllByRole('link')
    expect(items.map((i) => i.textContent)).toEqual(['↓CAR12,400.00', '↑HC8,333.33'])
    expect(items[0]).toHaveClass('overdue')
    expect(items[1]).toHaveClass('paid')
    expect(items[0]).toHaveAttribute('href', '/fund-out/CAR')
  })

  it('shows four on a day and the rest behind "+N more"', () => {
    render(<RepayCalendar month="2026-10" today="2026-10-09" events={EVENTS} />)
    const day = document.querySelector('[data-day="2026-10-20"]') as HTMLElement
    expect(within(day).getAllByRole('link')).toHaveLength(4)
    fireEvent.click(within(day).getByRole('button', { name: '+2 more' }))
    expect(within(day).getAllByRole('link')).toHaveLength(6)
    fireEvent.click(within(day).getByRole('button', { name: 'Show less' }))
    expect(within(day).getAllByRole('link')).toHaveLength(4)
  })

  it('shows an installment’s card on hover', () => {
    render(<RepayCalendar month="2026-10" today="2026-10-09" events={EVENTS} />)
    const item = within(document.querySelector('[data-day="2026-10-15"]') as HTMLElement).getByRole('link')
    fireEvent.mouseEnter(item)
    const card = screen.getByRole('tooltip')
    expect(card).toHaveTextContent('↓ We collect · Fund OUT')
    expect(card).toHaveTextContent('HK')
    expect(card).toHaveTextContent('15 Oct 2026')
    expect(card).toHaveTextContent('Instalment3 of 6')
    expect(card).toHaveTextContent('Amount dueRM 12,200.00')
    expect(card).toHaveTextContent('Still shortRM 2,200.00')
    expect(card).toHaveTextContent('Rate4.000%/mo')
    expect(card).toHaveTextContent('part paid')
    fireEvent.mouseLeave(item)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('lists the month by day for a phone, with each day’s net', () => {
    render(<RepayCalendar month="2026-10" today="2026-10-09" events={EVENTS} />)
    const agenda = document.querySelector('.cal-agenda') as HTMLElement
    // 2026-10-10 — the handoff's day list: the day's line, then its items in one box.
    const days = Array.from(agenda.querySelectorAll('.sch-agenda-day'))
    expect(days).toHaveLength(3)
    expect(days[0]).toHaveTextContent('2 Oct 2026')
    expect(days[0]).toHaveTextContent('+12,400.00')
    expect(days[0]).toHaveTextContent('−8,333.33')
  })
})

// 2026-10-10 — the handoff, more closely: a section head counting the month's
// instalments, the legend in words with swatches, each item on two lines, the
// hover card's status at its top right with "Due …" and a line on what a
// click does, and on a phone each item saying what it is and where it stands.
describe('the repayment calendar, per the handoff', () => {
  it('heads the calendar with the month’s instalments', () => {
    render(<RepayCalendar month="2026-10" today="2026-10-09" events={EVENTS} />)
    const head = document.querySelector('.sect-head') as HTMLElement
    expect(within(head).getByRole('heading', { level: 2 })).toHaveTextContent('Calendar')
    expect(head).toHaveTextContent('9 INSTALMENTS · OCTOBER 2026')
  })

  it('names the legend the handoff’s way, each with a swatch', () => {
    render(<RepayCalendar month="2026-10" today="2026-10-09" events={EVENTS} />)
    const legend = Array.from(document.querySelectorAll('.cal-legend > span'))
    expect(legend.map((s) => s.textContent)).toEqual(['↓ We collect (Fund OUT)', '↑ We pay (Fund IN)', 'Paid', 'Due', 'Part paid', 'Overdue'])
    expect(legend.every((s) => s.querySelector('.sch-swatch'))).toBe(true)
  })

  it('puts who on one line and the amount on the next', () => {
    render(<RepayCalendar month="2026-10" today="2026-10-09" events={EVENTS} />)
    const item = within(document.querySelector('[data-day="2026-10-02"]') as HTMLElement).getAllByRole('link')[0]
    expect(item.querySelector('.sch-cal-who')).toHaveTextContent('↓CAR')
    expect(item.querySelector('.sch-cal-who')?.nextElementSibling).toHaveTextContent('12,400.00')
  })

  it('shows the status at the card’s top right, the day it is due, and what a click does', () => {
    render(<RepayCalendar month="2026-10" today="2026-10-09" events={EVENTS} />)
    fireEvent.mouseEnter(within(document.querySelector('[data-day="2026-10-15"]') as HTMLElement).getByRole('link'))
    const card = screen.getByRole('tooltip')
    const top = card.querySelector('.sch-card-top') as HTMLElement
    expect(top).toHaveTextContent('↓ We collect · Fund OUT')
    expect(top.lastElementChild).toHaveTextContent('part paid')
    expect(card).toHaveTextContent('Due 15 Oct 2026')
    expect(card).toHaveTextContent('Click to open the full record')
  })

  it('says on a phone what each item is, how short it is, and where it stands', () => {
    render(<RepayCalendar month="2026-10" today="2026-10-09" events={EVENTS} />)
    const items = Array.from(document.querySelectorAll('.cal-agenda .sch-agenda-item')) as HTMLElement[]
    const hk = items.find((i) => i.textContent?.includes('HK')) as HTMLElement
    expect(hk).toHaveTextContent('Collect · instalment 3 of 6 · short 2,200.00')
    expect(hk.querySelector('.cal-card-status')).toHaveTextContent('part paid')
    const hc = items.find((i) => i.textContent?.includes('HC')) as HTMLElement
    expect(hc).toHaveTextContent('Pay · instalment 3 of 6')
    expect(hc).not.toHaveTextContent('short')
    expect(hc.querySelector('.cal-card-status')).toHaveTextContent('paid')
    expect(hc).toHaveAttribute('href', '/fund-in/HC')
  })
})
