import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ByCompany, { ByCompanyCards } from './ByCompany'
import type { Company } from '@/lib/schedule-by-company'

// 2026-11-13 — the user: "我不能自己拖着排？" — a heading dragged onto another moves there, and the order is kept.

const companies: Company[] = [
  {
    key: 'co:car',
    name: 'CAR',
    both: true,
    position: 1000,
    deals: [
      { id: 'l1', side: 'collect', tag: 'LO#1', words: 'RM 1', href: '/fund-out/l1', due: 100, dueInterest: 10, earlier: 0, got: 50, gotInterest: 5, open: 50, next: null, last: null, owe: 2000, pending: false },
      { id: 'f1', side: 'pay', tag: 'BI#1', words: 'RM 1', href: '/fund-in/f1', due: 80, dueInterest: 8, earlier: 0, got: 0, gotInterest: 0, open: 80, next: null, last: null, owe: 1000, pending: false },
    ],
  },
]
const heads = () => Array.from(document.querySelectorAll('thead th')).map((th) => th.textContent?.replace(/[↕▲▼]/g, '').trim()).filter(Boolean)

beforeEach(() => window.localStorage.clear())

describe('By company’s headings', () => {
  it('move when one is dragged onto another, and keep the order', () => {
    const { unmount } = render(<ByCompany companies={companies} basis="act" monthLong="November 2026" />)
    expect(heads()).toEqual(['Company', 'Received', 'Collect · overdue', 'Paid', 'Pay · overdue', 'Net', 'Interest + penalty'])
    const th = (name: string) => Array.from(document.querySelectorAll('thead th')).find((el) => el.textContent?.startsWith(name)) as HTMLElement
    fireEvent.dragStart(th('Net'))
    fireEvent.dragOver(th('Received'))
    fireEvent.drop(th('Received'))
    expect(heads()).toEqual(['Company', 'Net', 'Received', 'Collect · overdue', 'Paid', 'Pay · overdue', 'Interest + penalty'])
    // The company's figures follow their heading.
    const row = screen.getByText('CAR').closest('tr') as HTMLElement
    expect(row.querySelectorAll('td')[1]).toHaveTextContent('+50.00')
    unmount()
    render(<ByCompany companies={companies} basis="act" monthLong="November 2026" />)
    expect(heads()[1]).toBe('Net')
    // Columns › Reset order puts it back.
    fireEvent.click(screen.getByRole('button', { name: /Columns/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset order' }))
    expect(heads()[1]).toBe('Received')
  })

  it('keeps an order saved before overdue was split, both sides in its place', () => {
    window.localStorage.setItem('repayment.by-company.order', JSON.stringify(['net', 'earlier', 'collect', 'pay', 'profit']))
    render(<ByCompany companies={companies} basis="act" monthLong="November 2026" />)
    expect(heads()).toEqual(['Company', 'Net', 'Collect · overdue', 'Pay · overdue', 'Received', 'Paid', 'Interest + penalty'])
  })
})

// 2026-11-16 — the user: "要如何区分这个月钱是之前overdue 的呢还是这个本来就该收的？" → C.
describe('By company by right', () => {
  const late: Company[] = [
    {
      key: 'co:hk',
      name: 'HK',
      both: true,
      position: 0,
      deals: [
        { id: 'l1', side: 'collect', tag: 'LO#1', words: 'RM 1', href: '/fund-out/l1', due: 1700, dueInterest: 300, earlier: 600, got: 0, gotInterest: 0, open: 1700, next: null, last: null, owe: 5000, pending: false },
        { id: 'f1', side: 'pay', tag: 'BI#1', words: 'RM 1', href: '/fund-in/f1', due: 800, dueInterest: 80, earlier: 300, got: 0, gotInterest: 0, open: 800, next: null, last: null, owe: 1000, pending: false },
      ],
    },
  ]
  it('splits each side into this month and overdue, and the cards say both', () => {
    render(<ByCompany companies={late} basis="due" monthLong="November 2026" />)
    expect(heads()).toEqual(['Company', 'Collect · this month', 'Collect · overdue', 'Pay · this month', 'Pay · overdue', 'Net', 'Interest profit'])
    const row = screen.getByText('HK').closest('tr') as HTMLElement
    const td = row.querySelectorAll('td')
    expect([td[1], td[2], td[3], td[4]].map((c) => c.textContent)).toEqual(['1,100.00', '600.00', '500.00', '300.00'])
    // Net is all of each side: 1,700 − 800.
    expect(td[5]).toHaveTextContent('+900.00')
    render(<ByCompanyCards companies={late} basis="due" month="2026-11" />)
    expect(screen.getByText('This month RM 1,100.00 + overdue RM 600.00')).toBeInTheDocument()
    expect(screen.getByText('This month RM 500.00 + overdue RM 300.00')).toBeInTheDocument()
  })
})
