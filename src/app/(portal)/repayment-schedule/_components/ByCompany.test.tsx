import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ByCompany from './ByCompany'
import type { Company } from '@/lib/schedule-by-company'

// 2026-11-13 — the user: "我不能自己拖着排？" — a heading dragged onto another moves there, and the order is kept.

const companies: Company[] = [
  {
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
    expect(heads()).toEqual(['Company', 'Received', 'Paid', 'Net', 'Interest profit', 'Earlier unpaid'])
    const th = (name: string) => Array.from(document.querySelectorAll('thead th')).find((el) => el.textContent?.startsWith(name)) as HTMLElement
    fireEvent.dragStart(th('Net'))
    fireEvent.dragOver(th('Received'))
    fireEvent.drop(th('Received'))
    expect(heads()).toEqual(['Company', 'Net', 'Received', 'Paid', 'Interest profit', 'Earlier unpaid'])
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
})
