'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import { updatePayrollRow } from '../actions'
import type { PayrollRowData } from './PayrollGrid'

interface Props {
  row: PayrollRowData
  period: string
  expanded: boolean
  onToggleExpand: () => void
  selected: boolean
  onToggleSelect: () => void
  selectDisabled: boolean
}

export default function PayrollRow({
  row,
  period,
  expanded,
  onToggleExpand,
  selected,
  onToggleSelect,
  selectDisabled,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [edit, setEdit] = useState({
    basic_salary: row.basic_salary,
    statutory_allowance: row.statutory_allowance,
    non_statutory_allowance: row.non_statutory_allowance,
    ot_hours: row.ot_hours,
    ot_amount: row.ot_amount,
    commission_amount: row.commission_amount,
    unpaid_leave_days: row.unpaid_leave_days,
    deduction_amount: row.deduction_amount,
  })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty =
    edit.basic_salary !== row.basic_salary ||
    edit.statutory_allowance !== row.statutory_allowance ||
    edit.non_statutory_allowance !== row.non_statutory_allowance ||
    edit.ot_hours !== row.ot_hours ||
    edit.ot_amount !== row.ot_amount ||
    edit.commission_amount !== row.commission_amount ||
    edit.unpaid_leave_days !== row.unpaid_leave_days ||
    edit.deduction_amount !== row.deduction_amount

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        await updatePayrollRow(row.id, edit)
        setSaved(true)
        router.refresh()
        setTimeout(() => setSaved(false), 1500)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed')
      }
    })
  }

  const locked = row.status !== 'draft'

  // Narrow editable cell — minimal chrome
  const cell = (
    name: keyof typeof edit,
    value: number,
    step = '0.01',
  ) => (
    <input
      type="number"
      step={step}
      min="0"
      value={value}
      disabled={locked || isPending}
      onChange={e => setEdit({ ...edit, [name]: parseFloat(e.target.value) || 0 })}
      className="w-24 text-right font-mono tabular text-sm bg-transparent border-b border-transparent focus:border-accent-border focus:outline-none px-1 py-1 disabled:text-muted disabled:cursor-not-allowed"
    />
  )

  return (
    <>
      <tr className="border-b border-hairline last:border-0 hover:bg-surface-2/40 transition-colors">
        <td className="py-5 pl-2 pr-2 w-8">
          <input
            type="checkbox"
            aria-label={`Select ${row.staff_name}`}
            checked={selected}
            disabled={locked || selectDisabled}
            onChange={onToggleSelect}
            className="w-4 h-4 accent-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:outline-none"
            title={locked ? `Cannot delete — status is ${row.status}` : undefined}
          />
        </td>
        <td className="py-5 pr-4 font-serif text-md text-ink">{row.staff_name}</td>
        <td className="py-5 pr-4 font-serif italic text-graphite text-sm">{row.dept_name}</td>
        <td className="py-5 pr-4 text-right">{cell('basic_salary', edit.basic_salary)}</td>
        <td className="py-5 pr-4 text-right">{cell('statutory_allowance', edit.statutory_allowance)}</td>
        <td className="py-5 pr-4 text-right">{cell('non_statutory_allowance', edit.non_statutory_allowance)}</td>
        <td className="py-5 pr-4 text-right">{cell('ot_amount', edit.ot_amount)}</td>
        <td className="py-5 pr-4 text-right">{cell('commission_amount', edit.commission_amount)}</td>
        <td className="py-5 pr-4 text-right">{cell('unpaid_leave_days', edit.unpaid_leave_days, '0.5')}</td>
        <td className="py-5 pr-4 text-right">{cell('deduction_amount', edit.deduction_amount)}</td>
        <td className="py-5 pr-4 text-right font-mono tabular text-graphite">{formatMoneyBare(row.epf_er)}</td>
        <td className="py-5 pr-4 text-right font-mono tabular text-graphite">{formatMoneyBare(row.socso_er)}</td>
        <td className="py-5 pr-4 text-right font-mono tabular text-graphite">{formatMoneyBare(row.eis_er)}</td>
        <td className="py-5 pr-4 text-right font-mono tabular font-medium text-ink">{formatMoneyBare(row.gross)}</td>
        <td className="py-5 pr-4 text-right font-mono tabular font-semibold text-ink">{formatMoneyBare(row.net)}</td>
        <td className="py-5 pr-2 text-right">
          <div className="flex items-center gap-2 justify-end">
            {dirty && !locked && (
              <button
                onClick={handleSave}
                disabled={isPending}
                className="text-xs font-sans text-accent hover:text-accent-hover disabled:opacity-50"
              >
                {isPending ? '...' : 'Save'}
              </button>
            )}
            {saved && <span className="text-xs font-serif italic text-ledger">✓</span>}
            {error && <span className="text-xs font-serif italic text-danger" title={error}>!</span>}
            <a
              href={`/hr-costing/payroll/${period}/${row.staff_id}/payslip`}
              className="text-xs font-sans text-muted hover:text-accent"
              title="Open payslip"
            >
              Payslip
            </a>
            <button
              onClick={onToggleExpand}
              className="text-xs text-muted hover:text-accent"
              aria-label="Toggle details"
            >
              {expanded ? '▴' : '▾'}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-hairline bg-surface-2/30">
          <td colSpan={16} className="py-4 px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-8 gap-y-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted font-sans">Pro-rata</div>
                <div className="font-mono tabular text-ink mt-1">
                  {row.prorata_days_worked} / {row.prorata_days_in_month} days
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted font-sans">EPF ER / EE</div>
                <div className="font-mono tabular text-ink mt-1">
                  {formatMoney(row.epf_er)} / {formatMoney(row.epf_ee)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted font-sans">SOCSO ER / EE</div>
                <div className="font-mono tabular text-ink mt-1">
                  {formatMoney(row.socso_er)} / {formatMoney(row.socso_ee)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted font-sans">EIS ER / EE</div>
                <div className="font-mono tabular text-ink mt-1">
                  {formatMoney(row.eis_er)} / {formatMoney(row.eis_ee)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted font-sans">PCB</div>
                <div className="font-mono tabular text-ink mt-1">{formatMoney(row.pcb)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted font-sans">Status</div>
                <div className="font-serif italic text-ink mt-1 capitalize">{row.status}</div>
                <div className="font-serif italic text-muted text-xs">Source: {row.source}</div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
