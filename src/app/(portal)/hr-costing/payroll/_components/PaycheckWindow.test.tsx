import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import PaycheckWindow from './PaycheckWindow'
import { editFromRow } from '@/lib/payroll-grid'
import type { PayrollRowData } from './PayrollGrid'

const row: PayrollRowData = {
  id: 'r1',
  staff_id: 's1',
  staff_name: 'NUR AIN MASTURINA BINTI MOHD JUSAIDI',
  dept_name: 'Finance',
  status: 'draft',
  source: 'infotech',
  basic_salary: 3000,
  statutory_allowance: 0,
  non_statutory_allowance: 127,
  ot_hours: 0,
  ot_amount: 0,
  commission_amount: 0,
  unpaid_leave_days: 0,
  deduction_amount: 0,
  skbbk_amount: 22.15,
  prorata_days_worked: 31,
  prorata_days_in_month: 31,
  epf_er: 390,
  epf_ee: 330,
  socso_er: 52.65,
  socso_ee: 15,
  eis_er: 6,
  eis_ee: 6,
  pcb: 0,
  withholding_tax: 0,
  gross: 3127,
  net: 2753.85,
  commission_is_derived: false,
  commission_statement_href: null,
}

function setup(over: Partial<React.ComponentProps<typeof PaycheckWindow>> = {}) {
  const props = {
    row,
    period: '2026-08-01',
    index: 1,
    count: 22,
    edit: editFromRow(row),
    dirtyList: [],
    locked: false,
    isPending: false,
    saved: false,
    error: null,
    onField: vi.fn(),
    onSave: vi.fn(),
    onClose: vi.fn(),
    onStep: vi.fn(),
    ...over,
  }
  const utils = render(<PaycheckWindow {...props} />)
  return { ...utils, props }
}

describe('PaycheckWindow', () => {
  it('names the person, the month and the place in the list', () => {
    setup()
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(row.staff_name)
    expect(dialog.textContent).toContain('2/22')
    expect(dialog.textContent).toContain('PAYCHECK · AUGUST 2026 · FINANCE')
  })

  it('shows the nine editable figures as fields on a draft row', () => {
    const { container } = setup()
    expect(container.querySelectorAll).toBeDefined()
    const fields = document.querySelectorAll('.pg-win input.pg-in')
    expect(fields.length).toBe(9)
    expect((screen.getByLabelText('Basic salary') as HTMLInputElement).value).toBe('3,000.00')
    expect((screen.getByLabelText('Unpaid leave days') as HTMLInputElement).value).toBe('0.0')
  })

  it('writes a typed figure to the row state — the row is the one source of truth', () => {
    const { props } = setup()
    fireEvent.focus(screen.getByLabelText('Overtime'))
    fireEvent.change(screen.getByLabelText('Overtime'), { target: { value: '120' } })
    expect(props.onField).toHaveBeenLastCalledWith('ot_amount', 120)
  })

  it('only offers Save once something differs from what is saved', () => {
    const { props, rerender } = setup()
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    expect(screen.getByText('No unsaved changes')).toBeDefined()

    rerender(
      <PaycheckWindow
        {...props}
        edit={{ ...props.edit, ot_amount: 120 }}
        dirtyList={['ot_amount']}
      />,
    )
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByLabelText('Overtime').classList.contains('dirty')).toBe(true)
    expect(screen.getByText('Unsaved changes')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(props.onSave).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape and on the scrim, steps with ‹ ›', () => {
    const { props } = setup()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(document.querySelector('.pg-scrim')!)
    expect(props.onClose).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Next person' }))
    expect(props.onStep).toHaveBeenLastCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: 'Previous person' }))
    expect(props.onStep).toHaveBeenLastCalledWith(-1)
  })

  it('disables ‹ at the first person and › at the last', () => {
    setup({ index: 0, count: 3 })
    expect((screen.getByRole('button', { name: 'Previous person' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Next person' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows the computed side and the payslip link', () => {
    setup()
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('390.00 / 330.00')
    expect(dialog.textContent).toContain('3,575.65') // cost to company: gross + ER
    expect(dialog.textContent).toContain('2,753.85')
    expect((screen.getByRole('link', { name: 'Payslip ↗' }) as HTMLAnchorElement).getAttribute('href')).toBe(
      '/hr-costing/payroll/2026-08-01/s1/payslip',
    )
  })

  it('is read only once the month has been submitted', () => {
    setup({ row: { ...row, status: 'submitted' }, locked: true })
    expect(document.querySelectorAll('.pg-win input.pg-in').length).toBe(0)
    expect(document.querySelectorAll('.pg-win .ro').length).toBe(9)
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.getByText('submitted · read only')).toBeDefined()
  })

  it('links a derived commission to its statement instead of offering a field', () => {
    setup({
      row: {
        ...row,
        dept_name: 'Revenue',
        commission_is_derived: true,
        commission_amount: 4250,
        commission_statement_href: '/revenue/fair/2026-08-01/statement/s1',
      },
    })
    expect(screen.queryByLabelText('Commission')).toBeNull()
    const link = screen.getByText('4,250.00') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/revenue/fair/2026-08-01/statement/s1')
    expect(document.querySelectorAll('.pg-win input.pg-in').length).toBe(8)
  })

  it('names Withholding tax rather than PCB when that is what applies', () => {
    setup({ row: { ...row, pcb: 0, withholding_tax: 85 } })
    expect(screen.getByRole('dialog').textContent).toContain('Withholding tax')
    expect(screen.getByRole('dialog').textContent).not.toContain('PCB')
  })
})
