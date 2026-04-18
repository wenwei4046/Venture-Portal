'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deletePayrollRows } from '../actions'
import PayrollRow from './PayrollRow'

export interface PayrollRowData {
  id: string
  staff_id: string
  staff_name: string
  dept_name: string
  status: string
  source: string
  basic_salary: number
  statutory_allowance: number
  non_statutory_allowance: number
  ot_hours: number
  ot_amount: number
  commission_amount: number
  unpaid_leave_days: number
  prorata_days_worked: number
  prorata_days_in_month: number
  epf_er: number
  epf_ee: number
  socso_er: number
  socso_ee: number
  eis_er: number
  eis_ee: number
  pcb: number
  gross: number
  net: number
}

interface Props {
  rows: PayrollRowData[]
  period: string
}

export default function PayrollGrid({ rows, period }: Props) {
  const router = useRouter()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Only draft rows can be selected (and thus deleted). Non-draft rows
  // live in an approved/submitted/paid payroll_run and must stay.
  const selectableIds = useMemo(
    () => rows.filter(r => r.status === 'draft').map(r => r.id),
    [rows],
  )
  const allSelectableChecked =
    selectableIds.length > 0 && selectableIds.every(id => selected.has(id))
  const someSelected = selected.size > 0

  function toggleRow(id: string) {
    setDeleteError(null)
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setDeleteError(null)
    if (allSelectableChecked) {
      setSelected(new Set())
    } else {
      setSelected(new Set(selectableIds))
    }
  }

  function handleDelete() {
    if (selected.size === 0) return
    const count = selected.size
    const label = count === 1 ? 'row' : 'rows'
    if (
      !window.confirm(
        `Delete ${count} payroll ${label}? These staff won't appear in this month's payroll. You can re-add them with Import InfoTech or a new period.`,
      )
    ) {
      return
    }

    setDeleteError(null)
    const ids = Array.from(selected)
    startTransition(async () => {
      try {
        await deletePayrollRows(ids, period)
        setSelected(new Set())
        router.refresh()
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : 'Delete failed')
      }
    })
  }

  return (
    <div className="mb-12">
      <div className="flex items-center justify-between mb-3 gap-4 min-h-[1.75rem]">
        {someSelected ? (
          <span className="font-serif italic text-graphite text-xs">
            {selected.size} selected
          </span>
        ) : (
          <p className="font-serif italic text-graphite text-xs">
            All values in RM. Click the row arrow for pro-rata + EE breakdown.
          </p>
        )}
        {someSelected && (
          <div className="flex items-center gap-3">
            {deleteError && (
              <span className="font-serif italic text-danger text-xs">{deleteError}</span>
            )}
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="text-xs font-sans font-medium text-danger bg-danger/10 hover:bg-danger/15 px-2.5 py-1 rounded transition-colors disabled:opacity-50"
            >
              {isPending ? 'Deleting…' : `Delete ${selected.size}`}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              disabled={isPending}
              className="text-xs font-sans text-muted hover:text-ink disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
              <th className="py-4 pl-2 pr-2 w-8">
                <input
                  type="checkbox"
                  aria-label="Select all draft rows"
                  checked={allSelectableChecked}
                  disabled={selectableIds.length === 0 || isPending}
                  onChange={toggleAll}
                  className="w-4 h-4 accent-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:outline-none"
                />
              </th>
              <th className="text-left py-4 pr-4 font-medium">Name</th>
              <th className="text-left py-4 pr-4 font-medium">Dept</th>
              <th className="text-right py-4 pr-4 font-medium">Basic</th>
              <th className="text-right py-4 pr-4 font-medium">Stat.</th>
              <th className="text-right py-4 pr-4 font-medium">Non-Stat.</th>
              <th className="text-right py-4 pr-4 font-medium">OT</th>
              <th className="text-right py-4 pr-4 font-medium">Comm.</th>
              <th className="text-right py-4 pr-4 font-medium">Unpaid</th>
              <th className="text-right py-4 pr-4 font-medium">EPF&nbsp;ER</th>
              <th className="text-right py-4 pr-4 font-medium">SOCSO&nbsp;ER</th>
              <th className="text-right py-4 pr-4 font-medium">EIS&nbsp;ER</th>
              <th className="text-right py-4 pr-4 font-medium">Gross</th>
              <th className="text-right py-4 pr-4 font-medium">Net</th>
              <th className="text-right py-4 pr-2 font-medium w-14"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <PayrollRow
                key={r.id}
                row={r}
                period={period}
                expanded={expandedId === r.id}
                onToggleExpand={() => setExpandedId(expandedId === r.id ? null : r.id)}
                selected={selected.has(r.id)}
                onToggleSelect={() => toggleRow(r.id)}
                selectDisabled={isPending}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="font-serif italic text-muted text-xs mt-4">
        Edit values inline, click Save on the row. Statutory re-computes automatically.
        Tick draft rows and <em>Delete</em> to drop staff who shouldn&apos;t be on this month&apos;s payroll.
      </p>
    </div>
  )
}
