import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

// 2026-10-25 — a department's period row: the switch, From → To reaching back across the year, 6 / 12 months.

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push }),
  usePathname: () => '/dept-pool/statements/marketing',
  useSearchParams: () => new URLSearchParams('view=pnl'),
}))

import DeptPeriodBar from './DeptPeriodBar'

const bar = (from: string, to: string) =>
  render(<DeptPeriodBar view="pnl" links={{ pnl: '/dept-pool/statements/marketing?view=pnl', 'cash-flow': '/dept-pool/statements/marketing' }} from={from} to={to} toOptions={['2026-10', '2026-09']} />)
const At = '/dept-pool/statements/marketing?view=pnl'

beforeEach(() => nav.push.mockClear())

describe('a department’s period row', () => {
  it('holds the switch, and From back across the year — twelve months at most', () => {
    bar('2026-01', '2026-10')
    expect(within(screen.getByRole('group', { name: 'Statement' })).getByRole('link', { name: 'P&L' })).toHaveAttribute('aria-current', 'page')
    const from = screen.getByRole('combobox', { name: 'From' })
    const options = within(from).getAllByRole('option').map((o) => o.textContent)
    expect(options).toHaveLength(12)
    expect(options[0]).toBe('Nov 2025')
    expect(screen.getByText('* = month still running')).toBeInTheDocument()
  })

  it('takes 6 or 12 months up to To, and marks the span on show', () => {
    bar('2026-05', '2026-10')
    expect(screen.getByRole('button', { name: '6 months' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '12 months' }))
    expect(nav.push).toHaveBeenLastCalledWith(`${At}&period=2026-10&from=2025-11`)
  })

  it('keeps a year to date a year to date when To moves, January out of the address', () => {
    bar('2026-01', '2026-10')
    fireEvent.change(screen.getByRole('combobox', { name: 'To' }), { target: { value: '2026-09' } })
    expect(nav.push).toHaveBeenLastCalledWith(`${At}&period=2026-09`)
  })

  it('keeps any other span its length when To moves', () => {
    bar('2026-05', '2026-10')
    fireEvent.change(screen.getByRole('combobox', { name: 'To' }), { target: { value: '2026-09' } })
    expect(nav.push).toHaveBeenLastCalledWith(`${At}&period=2026-09&from=2026-04`)
  })
})
