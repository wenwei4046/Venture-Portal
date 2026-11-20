import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ByCompany, { ByCompanyCards } from './ByCompany'
import type { CoDeal, Company } from '@/lib/schedule-by-company'

// 2026-11-13 — the user: "我不能自己拖着排？" — a heading dragged onto another moves there, and the order is kept.

const deal = (over: Partial<CoDeal> & Pick<CoDeal, 'id' | 'side'>): CoDeal => ({
  tag: 'LO#1', words: 'RM 1', href: `/x/${over.id}`, now: 0, bf: 0, earlier: 0, settled: 0, got: 0, gotInterest: 0, open: 0, next: null, last: null, owe: 0, pending: false,
  ...over,
})
const companies: Company[] = [
  {
    key: 'co:car',
    name: 'CAR',
    both: true,
    position: 1000,
    deals: [
      deal({ id: 'l1', side: 'collect', now: 100, settled: 50, got: 50, gotInterest: 5, open: 50, owe: 2000 }),
      deal({ id: 'f1', side: 'pay', tag: 'BI#1', now: 80, open: 80, owe: 1000 }),
    ],
  },
]
const heads = () => Array.from(document.querySelectorAll('thead th[data-col]')).map((th) => th.textContent?.replace(/[↕▲▼]/g, '').trim()).filter(Boolean)
const groups = () => Array.from(document.querySelectorAll('thead th[data-group]')).map((th) => [th.textContent, Number(th.getAttribute('colspan'))])
const ALL = ['Company', 'Collect', 'Pay', 'Collect', 'Pay', 'Received', 'Paid', 'Collect', 'Pay', 'Net', 'Interest + penalty']

beforeEach(() => window.localStorage.clear())

describe('By company’s headings', () => {
  it('move when one is dragged onto another, and keep the order', () => {
    const { unmount } = render(<ByCompany companies={companies} month="2026-11" monthLong="November 2026" />)
    expect(heads()).toEqual(ALL)
    const th = (key: string) => document.querySelector(`thead th[data-col="${key}"]`) as HTMLElement
    fireEvent.dragStart(th('net'))
    fireEvent.dragOver(th('nowCollect'))
    fireEvent.drop(th('nowCollect'))
    expect(heads().slice(0, 3)).toEqual(['Company', 'Net', 'Collect'])
    // The company's figures follow their heading.
    const row = screen.getByText('CAR').closest('tr') as HTMLElement
    expect(row.querySelectorAll('td')[1]).toHaveTextContent('+50.00')
    unmount()
    render(<ByCompany companies={companies} month="2026-11" monthLong="November 2026" />)
    expect(heads()[1]).toBe('Net')
    // Columns › Reset order puts it back.
    fireEvent.click(screen.getByRole('button', { name: /Columns/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset order' }))
    expect(heads()).toEqual(ALL)
  })

  // 2026-11-19 — the user: "有点乱，分不清什么是什么" → A + B; 2026-11-20 — one reading, in the order they add up.
  it('stand in named groups, collect tinted apart from pay', () => {
    window.localStorage.setItem('repayment.by-company.order.v2', JSON.stringify(['net', 'earlierCollect', 'collect']))
    render(<ByCompany companies={companies} month="2026-11" monthLong="November 2026" />)
    // An order kept before is not read: this one shows.
    expect(groups()).toEqual([
      ['This month', 2],
      ['Overdue at 1 Nov', 2],
      ['Settled so far', 2],
      ['Still to settle', 2],
      ['Cash this month', 2],
    ])
    const row = screen.getByText('CAR').closest('tr') as HTMLElement
    const td = row.querySelectorAll('td')
    expect([1, 2, 3, 4, 9].map((i) => td[i].getAttribute('data-dir'))).toEqual(['in', 'out', 'in', 'out', null])
    // A rule at each group's first column.
    expect([1, 3, 5, 7, 9].map((i) => td[i].getAttribute('data-start'))).toEqual(['true', 'true', 'true', 'true', 'true'])
    expect(td[2].hasAttribute('data-start')).toBe(false)
  })
})

// 2026-11-20 — the user: "This month (这个月要还和收的), Overdue (这个月之前的overdue，不扣这个月还的), settle so far, still to
// settle, 然后多一个net".
describe('By company adds up', () => {
  const hk: Company[] = [
    {
      key: 'co:hk',
      name: 'HK',
      both: true,
      position: 0,
      deals: [
        // 1,100 this month + 1,000 overdue at the 1st; 400 came in → 1,700 still to collect.
        deal({ id: 'l1', side: 'collect', now: 1100, bf: 1000, earlier: 600, settled: 400, got: 400, gotInterest: 100, open: 1700, owe: 5000 }),
        // 800 this month, nothing overdue; 800 paid by contra → nothing still to pay, and no cash.
        deal({ id: 'f1', side: 'pay', tag: 'BI#1', now: 800, settled: 800, open: 0, owe: 1000 }),
      ],
    },
  ]
  it('shows each side’s four figures and the cash net', () => {
    render(<ByCompany companies={hk} month="2026-11" monthLong="November 2026" />)
    const td = (screen.getByText('HK').closest('tr') as HTMLElement).querySelectorAll('td')
    expect(Array.from(td).slice(1, 9).map((c) => c.textContent)).toEqual(['1,100.00', '800.00', '1,000.00', '—', '400.00', '800.00', '1,700.00', '—'])
    // Net is the cash only: 400 in, the contra none.
    expect(td[9]).toHaveTextContent('+400.00')
    expect(td[10]).toHaveTextContent('+100.00')
  })

  it('says the four on the cards', () => {
    render(<ByCompanyCards companies={hk} month="2026-11" />)
    const card = (name: string) => screen.getByRole('group', { name })
    expect(card('This month · Nov')).toHaveTextContent('1,100.00 / 800.00')
    expect(card('Overdue at 1 Nov')).toHaveTextContent('1,000.00 / 0.00')
    expect(card('Settled so far · Nov')).toHaveTextContent('400.00 / 800.00')
    expect(card('Still to settle · Nov')).toHaveTextContent('1,700.00 / 0.00')
  })

  it('filters what is still overdue now', () => {
    render(<ByCompany companies={[...hk, ...companies]} month="2026-11" monthLong="November 2026" />)
    fireEvent.click(screen.getByRole('button', { name: /^Still overdue · 1$/ }))
    expect(screen.getByText('HK')).toBeInTheDocument()
    expect(screen.queryByText('CAR')).toBeNull()
  })
})
