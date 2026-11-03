import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MovedIntoCard from './MovedIntoCard'

// What moved into a cost-center department this month, and the companies it bills that on to (2026-11-03 — the
// user: "也有可能是 hr pool 要承担": what it does not bill stays with it).

const actions = vi.hoisted(() => ({ saveDeptBillTo: vi.fn() }))
vi.mock('../actions', () => actions)
const refresh = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))

const companies = [
  { id: 'co-2990', name: '2990 Sdn Bhd', short_code: '2990' },
  { id: 'co-car', name: 'Carres', short_code: 'CAR' },
  { id: 'co-conts', name: 'The Conts', short_code: 'CONTS' },
]
const VIVIAN = { name: 'VIVIAN', fromDept: 'Director Office', amount: 3000, parts: { salary: 2450, allowance: 150, epf: 338, socso: 52.05, eis: 9.95 } }

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const draw = (over: Partial<Parameters<typeof MovedIntoCard>[0]> = {}) =>
  render(
    <MovedIntoCard
      period="2026-11-01"
      department={{ id: 'd-hr', name: 'HR' }}
      incoming={[VIVIAN]}
      billTo={[{ companyId: 'co-2990', pct: 30 }, { companyId: 'co-car', pct: 30 }, { companyId: 'co-conts', pct: 20 }]}
      lastMonthBillTo={[{ companyId: 'co-2990', pct: 50 }]}
      companies={companies}
      readOnly={false}
      locked={false}
      {...over}
    />,
  )

describe('MovedIntoCard', () => {
  it('MovedIntoCard lists incoming and its Bill to rows; “Stays in HR” is the remainder', () => {
    draw()
    const c = within(screen.getByRole('region', { name: 'Moved into HR' }))
    expect(c.getByText('Received')).toHaveTextContent('Received')
    expect(c.getByTestId('received')).toHaveTextContent('RM 3,000.00')
    expect(c.getByRole('listitem')).toHaveTextContent('VIVIAN · Director OfficeRM 3,000.00Salary 2,450.00 · Allowance 150.00 · EPF 338.00 · SOCSO 52.05 · EIS 9.95')
    expect(c.getAllByRole('spinbutton').map((i) => (i as HTMLInputElement).value)).toEqual(['30', '30', '20'])
    expect(c.getAllByText('RM 900.00')).toHaveLength(2)
    const stays = within(c.getByRole('group', { name: 'Stays in HR' }))
    expect(stays.getByText('20.00')).toBeInTheDocument()
    expect(stays.getByText('RM 600.00')).toBeInTheDocument()
    expect(c.getByText(/Billed to subsidiaries/)).toHaveTextContent('Billed to subsidiaries RM 2,400.00')
  })

  it('Save calls saveDeptBillTo', async () => {
    actions.saveDeptBillTo.mockResolvedValue({ ok: true })
    draw()
    const c = within(screen.getByRole('region', { name: 'Moved into HR' }))
    fireEvent.change(c.getAllByRole('spinbutton')[2], { target: { value: '40' } })
    fireEvent.click(c.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(actions.saveDeptBillTo).toHaveBeenCalledWith('d-hr', '2026-11-01', [
        { companyId: 'co-2990', pct: 30 }, { companyId: 'co-car', pct: 30 }, { companyId: 'co-conts', pct: 40 },
      ]),
    )
    expect(refresh).toHaveBeenCalled()
  })

  it('Copy last month’s % fills the rows; a refusal is said', async () => {
    actions.saveDeptBillTo.mockResolvedValue({ ok: false, reason: 'Payroll for November 2026 is closed for good — its billing splits cannot change' })
    draw({ billTo: [] })
    const c = within(screen.getByRole('region', { name: 'Moved into HR' }))
    expect(within(c.getByRole('group', { name: 'Stays in HR' })).getByText('100.00')).toBeInTheDocument()
    fireEvent.click(c.getByRole('button', { name: 'Copy last month’s %' }))
    expect(c.getAllByRole('spinbutton').map((i) => (i as HTMLInputElement).value)).toEqual(['50'])
    fireEvent.click(c.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(c.getByText('Payroll for November 2026 is closed for good — its billing splits cannot change')).toBeInTheDocument())
  })

  it('a month closed for good reads only', () => {
    draw({ locked: true })
    const c = within(screen.getByRole('region', { name: 'Moved into HR' }))
    expect(c.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(c.queryByRole('button', { name: '+ Company' })).toBeNull()
    expect(c.getAllByRole('spinbutton')[0]).toBeDisabled()
  })
})
