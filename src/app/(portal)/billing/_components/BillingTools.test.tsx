import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

// 2026-10-10 — the handoff's Service Billing head: the month control, then
// "From payroll ▾" (Generate payroll invoices / Reconcile payroll / Own-share),
// "Export ▾" (Excel / PDF · list / PDF · per invoice) and "+ Create Invoice ▾"
// (Single invoice / Multi-line invoice / Generate Marketing invoices). A pick
// closes the menu and mounts its dialog already open, without a trigger of
// its own (the old menu unmounted the dialog with itself).

type DialogProps = { autoOpen?: boolean; hideTrigger?: boolean; currentPeriod?: string; modes?: string[] }
const { dialog } = vi.hoisted(() => ({
  dialog: (name: string) =>
    function Dialog(p: DialogProps) {
      return (
        <div
          data-testid={name}
          data-auto={String(!!p.autoOpen)}
          data-hide={String(!!p.hideTrigger)}
          data-period={p.currentPeriod ?? ''}
          data-modes={(p.modes ?? []).join(',')}
        />
      )
    },
}))
vi.mock('./PeriodSelector', () => ({ default: (p: { currentPeriod: string }) => <span data-testid="month">{p.currentPeriod}</span> }))
vi.mock('./CreateInvoiceButton', () => ({ default: dialog('single') }))
vi.mock('./CreateMultiLineInvoiceButton', () => ({ default: dialog('multi') }))
vi.mock('./GenerateInvoicesButton', () => ({ default: dialog('marketing') }))
vi.mock('./GenerateConsolidatedInvoicesButton', () => ({ default: dialog('payroll') }))
vi.mock('./ReconcilePayrollBillingButton', () => ({ default: dialog('reconcile') }))
vi.mock('./GenerateOwnShareInvoiceButton', () => ({ default: dialog('own-share') }))

import BillingTools from './BillingTools'

const props = { period: '2026-09-01', companies: [], departments: [], categories: [], extraModes: [] }
const menuButton = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name.replace('+', '\\+')}`) })
const open = (name: string) => {
  fireEvent.click(menuButton(name))
  return screen.getByRole('menu', { name })
}
const items = (menu: HTMLElement) => within(menu).getAllByRole('menuitem').map((m) => m.textContent)

beforeEach(() => vi.clearAllMocks())

describe('Service Billing’s tools', () => {
  it('lays out the month, From payroll, Export, then + Create Invoice', () => {
    render(<BillingTools {...props} canCreate />)
    const row = document.querySelector('.bil-tools') as HTMLElement
    expect(within(row).getByTestId('month')).toHaveTextContent('2026-09-01')
    expect(Array.from(row.querySelectorAll('.act-menu-btn')).map((b) => b.textContent?.replace('▼', '').trim())).toEqual([
      'From payroll',
      'Export',
      '+ Create Invoice',
    ])
    expect(menuButton('+ Create Invoice')).toHaveClass('primary')
  })

  it('holds the payroll actions, the exports and the three ways to create', () => {
    render(<BillingTools {...props} canCreate />)
    expect(items(open('From payroll'))).toEqual(['Generate payroll invoices', 'Reconcile payroll', 'Own-share → Venture (Office)'])
    fireEvent.click(menuButton('From payroll'))
    const exp = open('Export')
    expect(within(exp).getByRole('menuitem', { name: 'Excel' })).toHaveAttribute('href', '/statements/export?format=xlsx&period=2026-09')
    expect(within(exp).getByRole('menuitem', { name: 'PDF · list' })).toHaveAttribute('href', '/statements/export?format=pdf&period=2026-09')
    expect(within(exp).getByRole('menuitem', { name: 'PDF · per invoice' })).toHaveAttribute('href', '/billing/invoice-doc?period=2026-09')
    fireEvent.click(menuButton('Export'))
    expect(items(open('+ Create Invoice'))).toEqual(['Single invoice', 'Multi-line invoice', 'Generate Marketing invoices'])
  })

  it('a pick closes the menu and opens its dialog — open already, no trigger of its own, on the page’s month', () => {
    render(<BillingTools {...props} canCreate />)
    fireEvent.click(within(open('+ Create Invoice')).getByRole('menuitem', { name: 'Single invoice' }))
    expect(screen.queryByRole('menu')).toBeNull()
    const single = screen.getByTestId('single')
    expect(single.dataset).toMatchObject({ auto: 'true', hide: 'true', period: '2026-09-01' })

    fireEvent.click(within(open('+ Create Invoice')).getByRole('menuitem', { name: 'Generate Marketing invoices' }))
    expect(screen.queryByTestId('single')).toBeNull()
    expect(screen.getByTestId('marketing').dataset).toMatchObject({ auto: 'true', hide: 'true', modes: 'marketing_project' })

    fireEvent.click(within(open('From payroll')).getByRole('menuitem', { name: 'Reconcile payroll' }))
    expect(screen.getByTestId('reconcile').dataset).toMatchObject({ auto: 'true', hide: 'true' })
  })

  it('without Billing · Create offers the month and the exports only', () => {
    render(<BillingTools {...props} canCreate={false} />)
    expect(screen.getByTestId('month')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^From payroll/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^\+ Create Invoice/ })).toBeNull()
    expect(menuButton('Export')).toBeInTheDocument()
  })

  it('closes a menu on Escape', () => {
    render(<BillingTools {...props} canCreate />)
    open('Export')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
