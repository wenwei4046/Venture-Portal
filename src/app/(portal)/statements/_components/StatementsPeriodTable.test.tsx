import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
// The saved column layout is fetched from the browser client; here it has none.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
}))

import StatementsPeriodTable, { type StatementRow } from './StatementsPeriodTable'

const statement: StatementRow = {
  id: 'st-1',
  companyName: 'Carres',
  companyCode: 'CAR',
  totalInvoice: 5000,
  totalContra: 1200,
  netAmount: 3800,
  status: 'issued',
}

beforeEach(() => vi.clearAllMocks())

// 2026-10-02 (user: "view … 可以 remove,我希望双击点开").
describe('StatementsPeriodTable', () => {
  it('has no View column; a double-click opens the statement', () => {
    render(<StatementsPeriodTable rows={[statement]} />)
    expect(screen.queryByText('View')).toBeNull()
    expect(document.querySelector('thead th[data-col="action"]')).toBeNull()
    fireEvent.doubleClick(screen.getByText('Carres'))
    expect(push).toHaveBeenCalledWith('/statements/st-1')
  })

  it('a right-click offers opening it, here or in a new tab', () => {
    render(<StatementsPeriodTable rows={[statement]} />)
    fireEvent.contextMenu(screen.getByText('Carres').closest('tr')!)
    const menu = screen.getByRole('menu', { name: 'Actions for Carres · issued' })
    expect(within(menu).getAllByRole('menuitem').map((b) => b.firstChild?.textContent)).toEqual(['打开', '在新分页打开'])
  })
})
