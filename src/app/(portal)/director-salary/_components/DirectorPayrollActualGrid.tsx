'use client'

// Director actual payroll grid — InfoTech-imported figures for the 4
// directors, styled after the HR Costing payroll grid. Verbatim record:
// every numeric field is editable inline (no recompute). This table is the
// payroll source the Submission tab sends to Finance (v2 flow, 2026-07-17).

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dayjs from 'dayjs'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import {
  updateDirectorPayrollRow,
  deleteDirectorPayrollRows,
  type DirectorPayrollUpdate,
} from '../payroll-actions'

export interface DirectorPayrollRowData {
  id: string
  director_id: string | null
  director_code: string | null
  employee_code: string
  employee_name: string
  dept_name: string
  basic_salary: number
  statutory_allowance: number
  non_statutory_allowance: number
  ot_amount: number
  commission_amount: number
  no_pay_amount: number
  deduction_amount: number
  skbbk_amount: number
  epf_er: number
  epf_ee: number
  socso_er: number
  socso_ee: number
  eis_er: number
  eis_ee: number
  pcb: number
  gross: number
  net: number
  source: string
  /**
   * draft → completed (Complete on the Submission tab) → submitted (a batch on
   * HR › Payroll) → paid. Only a draft can be edited (unified Payroll).
   */
  status?: string
}

interface Props {
  rows: DirectorPayrollRowData[]
  period: string
}

interface RowApi {
  isDirty: () => boolean
  save: () => Promise<void>
}

// One grid instance per month — see CTCInputGrid for the why. A query-string
// navigation keeps this subtree mounted, so the selection / expanded row /
// error strip would otherwise carry over from the previous month (the delete
// action is period-scoped, but "Delete 3" over another month's ids is still
// wrong on screen).
export default function DirectorPayrollActualGrid(props: Props) {
  return <DirectorPayrollActualGridBody key={props.period} {...props} />
}

function DirectorPayrollActualGridBody({ rows, period }: Props) {
  const router = useRouter()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Rows register their save handles here so the section-level Save button
  // can flush every dirty row before jumping to the Submission tab —
  // mirrors the Pool Breakdown flow.
  const rowApisRef = useRef(new Map<string, RowApi>())
  const registerRow = useCallback((id: string, api: RowApi) => {
    rowApisRef.current.set(id, api)
    return () => {
      rowApisRef.current.delete(id)
    }
  }, [])
  const [saveAllState, setSaveAllState] = useState<'idle' | 'saving'>('idle')
  const [saveAllError, setSaveAllError] = useState<string | null>(null)

  function handleSaveAll() {
    setSaveAllError(null)
    setSaveAllState('saving')
    startTransition(async () => {
      try {
        for (const api of rowApisRef.current.values()) {
          if (api.isDirty()) await api.save()
        }
        router.push(`/director-salary?period=${period.slice(0, 7)}&tab=submission`)
        router.refresh()
      } catch (err) {
        setSaveAllError(err instanceof Error ? err.message : 'Save failed')
        setSaveAllState('idle')
      }
    })
  }

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          gross: acc.gross + r.gross,
          net: acc.net + r.net,
          epf_er: acc.epf_er + r.epf_er,
          socso_er: acc.socso_er + r.socso_er,
          eis_er: acc.eis_er + r.eis_er,
          pcb: acc.pcb + r.pcb,
        }),
        { gross: 0, net: 0, epf_er: 0, socso_er: 0, eis_er: 0, pcb: 0 },
      ),
    [rows],
  )
  const totalCtc = totals.gross + totals.epf_er + totals.socso_er + totals.eis_er

  const allChecked = rows.length > 0 && rows.every(r => selected.has(r.id))
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
    setSelected(allChecked ? new Set() : new Set(rows.map(r => r.id)))
  }

  function handleDelete() {
    if (selected.size === 0) return
    const count = selected.size
    if (
      !window.confirm(
        `Delete ${count} director payroll row${count === 1 ? '' : 's'} for ${dayjs(period).format('MMMM YYYY')}? Re-import the InfoTech file to restore.`,
      )
    ) {
      return
    }
    setDeleteError(null)
    const ids = Array.from(selected)
    startTransition(async () => {
      try {
        await deleteDirectorPayrollRows(ids, period)
        setSelected(new Set())
        router.refresh()
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : 'Delete failed')
      }
    })
  }

  return (
    <div>
      {/* Summary cards — same anatomy as the HR payroll page. Total CTC is
          the row's walnut card: gross + employer statutory, what the
          directors cost HV this month. */}
      <StatCards label="Director payroll totals">
        <StatCard label="Total CTC" value={formatMoney(totalCtc)} icon="coin" tone="primary" note="Gross + employer statutory" />
        <StatCard
          label="Total gross"
          value={formatMoney(totals.gross)}
          icon="wallet"
          note={`${rows.length} director${rows.length === 1 ? '' : 's'}`}
        />
        <StatCard label="Total net" value={formatMoney(totals.net)} icon="bank" note="To the directors" />
        <StatCard label="EPF ER" value={formatMoney(totals.epf_er)} icon="shield" note="Employer" />
        <StatCard label="SOCSO + EIS ER" value={formatMoney(totals.socso_er + totals.eis_er)} icon="layers" note="Employer" />
        <StatCard label="Total PCB" value={formatMoney(totals.pcb)} icon="receipt" note="Tax withheld" />
      </StatCards>

      <div className="flex flex-wrap items-center justify-between mb-3 gap-x-4 gap-y-2 min-h-[1.75rem]">
        {someSelected ? (
          <span className="text-xs font-medium">{selected.size} selected</span>
        ) : (
          <p className="text-xs">
            All values in RM · imported verbatim from InfoTech · click the row arrow for the EE
            breakdown.
          </p>
        )}
        {someSelected && (
          <div className="flex items-center gap-2">
            {deleteError && (
              <span className="text-danger text-xs">{deleteError}</span>
            )}
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="text-xs font-medium text-danger bg-danger-bg border border-danger/40 hover:bg-danger/15 px-3 py-1.5 rounded-control transition-colors disabled:opacity-50"
            >
              {isPending ? 'Deleting…' : `Delete ${selected.size}`}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              disabled={isPending}
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-xs px-3 py-1.5 rounded-control transition-colors disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      <div className="table-frame">
        <div className="table-frame-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th className="w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all rows"
                    checked={allChecked}
                    disabled={rows.length === 0 || isPending}
                    onChange={toggleAll}
                    className="w-4 h-4 accent-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:outline-none"
                  />
                </th>
                <th>Name</th>
                <th>Dept</th>
                <th className="right">Basic</th>
                <th className="right">Stat.</th>
                <th className="right">Non-Stat.</th>
                <th className="right">OT</th>
                <th className="right">Comm.</th>
                <th className="right">Unpaid</th>
                <th className="right">Deduct</th>
                <th className="right" title="Net-only employee deduction — gross and statutory are unaffected">SKBBK</th>
                <th className="right">EPF&nbsp;ER</th>
                <th className="right">SOCSO&nbsp;ER</th>
                <th className="right">EIS&nbsp;ER</th>
                <th className="right">Gross</th>
                <th className="right">Net</th>
                <th className="right w-14"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <DirectorPayrollRow
                  key={r.id}
                  row={r}
                  period={period}
                  registerRow={registerRow}
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
        <div className="table-frame-foot">
          <span>
            Edit values inline — figures stick as typed (no recompute; the InfoTech file is the
            source of truth). Statutory, PCB, Gross and Net are edited in the expanded panel (▾).
          </span>
        </div>
      </div>

      {/* Staff-payroll-style flow: Save flushes every dirty row, then lands on
          the Submission tab where Submit to Finance is. */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          onClick={handleSaveAll}
          disabled={isPending}
          className="bg-accent hover:bg-accent-hover text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saveAllState === 'saving' ? 'Saving...' : 'Save'}
        </button>
        {saveAllError && (
          <span className="text-sm text-danger">{saveAllError}</span>
        )}
      </div>
    </div>
  )
}

// ─── Row ───────────────────────────────────────────────────────────────────

function DirectorPayrollRow({
  row,
  registerRow,
  expanded,
  onToggleExpand,
  selected,
  onToggleSelect,
  selectDisabled,
}: {
  row: DirectorPayrollRowData
  period: string
  registerRow: (id: string, api: RowApi) => () => void
  expanded: boolean
  onToggleExpand: () => void
  selected: boolean
  onToggleSelect: () => void
  selectDisabled: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [edit, setEdit] = useState<DirectorPayrollUpdate>({
    basic_salary: row.basic_salary,
    statutory_allowance: row.statutory_allowance,
    non_statutory_allowance: row.non_statutory_allowance,
    ot_amount: row.ot_amount,
    commission_amount: row.commission_amount,
    no_pay_amount: row.no_pay_amount,
    deduction_amount: row.deduction_amount,
    skbbk_amount: row.skbbk_amount,
    epf_er: row.epf_er,
    epf_ee: row.epf_ee,
    socso_er: row.socso_er,
    socso_ee: row.socso_ee,
    eis_er: row.eis_er,
    eis_ee: row.eis_ee,
    pcb: row.pcb,
    gross: row.gross,
    net: row.net,
  })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = (Object.keys(edit) as Array<keyof DirectorPayrollUpdate>).some(
    k => edit[k] !== (row as unknown as Record<string, number>)[k],
  )

  // Expose live dirty/save handles to the section-level Save button. Refs are
  // refreshed every render so the registry always sees the latest edit state.
  const dirtyRef = useRef(dirty)
  const editRef = useRef(edit)
  dirtyRef.current = dirty
  editRef.current = edit
  useEffect(
    () =>
      registerRow(row.id, {
        isDirty: () => dirtyRef.current,
        save: () => updateDirectorPayrollRow(row.id, editRef.current),
      }),
    [registerRow, row.id],
  )

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        await updateDirectorPayrollRow(row.id, edit)
        setSaved(true)
        router.refresh()
        setTimeout(() => setSaved(false), 1500)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed')
      }
    })
  }

  const locked = (row.status ?? 'draft') !== 'draft'
  const cell = (name: keyof DirectorPayrollUpdate, w = 'w-24') => (
    <input
      type="number"
      step="0.01"
      min="0"
      value={edit[name] ?? 0}
      disabled={isPending || locked}
      title={locked ? `${row.employee_name} is ${row.status} — reopen (or Resubmit / Second payroll on HR › Payroll) to change` : undefined}
      onChange={e => setEdit({ ...edit, [name]: parseFloat(e.target.value) || 0 })}
      className={`${w} text-right font-mono tabular text-[12px] bg-transparent border-b border-transparent focus:border-accent-border focus:outline-none px-1 py-1 disabled:opacity-50 disabled:cursor-not-allowed`}
    />
  )

  return (
    <>
      <tr>
        <td className="w-8">
          <input
            type="checkbox"
            aria-label={`Select ${row.employee_name}`}
            checked={selected}
            disabled={selectDisabled || locked}
            onChange={onToggleSelect}
            className="w-4 h-4 accent-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:outline-none"
          />
        </td>
        <td>
          <div className="font-medium">{row.employee_name}</div>
          <div className="text-[11px] mt-0.5 flex flex-wrap items-center gap-1.5">
            {row.director_code ? (
              <span className="font-mono">{row.director_code}</span>
            ) : (
              <span className="chip alert"><span className="dot" />unmatched</span>
            )}
            {row.source === 'manual' && (
              <span className="chip alert"><span className="dot" />edited</span>
            )}
            {row.status && row.status !== 'draft' && (
              <span className={`chip ${row.status === 'paid' ? 'ledger' : row.status === 'submitted' ? 'alert' : 'accent'}`}>
                <span className="dot" />{row.status === 'completed' ? 'completed' : row.status === 'submitted' ? 'with Finance' : 'paid'}
              </span>
            )}
          </div>
        </td>
        <td>{row.dept_name || '—'}</td>
        <td className="right">{cell('basic_salary')}</td>
        <td className="right">{cell('statutory_allowance')}</td>
        <td className="right">{cell('non_statutory_allowance')}</td>
        <td className="right">{cell('ot_amount')}</td>
        <td className="right">{cell('commission_amount')}</td>
        <td className="right">{cell('no_pay_amount')}</td>
        <td className="right">{cell('deduction_amount')}</td>
        <td className="right">{cell('skbbk_amount')}</td>
        <td className="num">{formatMoneyBare(row.epf_er)}</td>
        <td className="num">{formatMoneyBare(row.socso_er)}</td>
        <td className="num">{formatMoneyBare(row.eis_er)}</td>
        <td className="num">{formatMoneyBare(row.gross)}</td>
        <td className="num font-bold">{formatMoneyBare(row.net)}</td>
        <td className="right">
          <div className="flex items-center gap-2 justify-end">
            {dirty && (
              <button
                onClick={handleSave}
                disabled={isPending}
                className="bg-accent hover:bg-accent-hover text-xs font-medium px-2.5 py-1 rounded-control transition-colors disabled:opacity-50"
              >
                {isPending ? '...' : 'Save'}
              </button>
            )}
            {saved && <span className="text-xs text-ledger">✓</span>}
            {error && (
              <span className="text-xs font-semibold text-danger" title={error}>
                !
              </span>
            )}
            <a
              href={`/director-salary/payslip/${row.id}`}
              className="text-xs"
              title="Open payslip"
            >
              Payslip
            </a>
            <button
              onClick={onToggleExpand}
              className="text-xs px-1 hover:bg-surface-2 rounded-control"
              aria-label="Toggle details"
            >
              {expanded ? '▴' : '▾'}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          {/* The panel's wash sits on the cell, so the zebra and the row
              hover underneath do not change it. */}
          <td colSpan={17} className="bg-surface-2">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-8 gap-y-4">
              <ExpandedPair label="EPF ER / EE">
                {cell('epf_er', 'w-20')} / {cell('epf_ee', 'w-20')}
              </ExpandedPair>
              <ExpandedPair label="SOCSO ER / EE">
                {cell('socso_er', 'w-20')} / {cell('socso_ee', 'w-20')}
              </ExpandedPair>
              <ExpandedPair label="EIS ER / EE">
                {cell('eis_er', 'w-20')} / {cell('eis_ee', 'w-20')}
              </ExpandedPair>
              <ExpandedPair label="PCB">{cell('pcb', 'w-24')}</ExpandedPair>
              <ExpandedPair label="Gross / Net">
                {cell('gross', 'w-24')} / {cell('net', 'w-24')}
              </ExpandedPair>
              {!row.director_id && (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.06em]">
                    Director link
                  </div>
                  <div className="mt-1 text-xs">
                    <span className="chip alert"><span className="dot" />Unmatched</span>{' '}
                    fix the name in InfoTech (or Settings → Directors) and re-import
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function ExpandedPair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-[0.06em]">{label}</div>
      <div className="mt-1 flex items-center gap-1 font-mono tabular text-ink">{children}</div>
    </div>
  )
}

export function DirectorPayrollEmptyState({ period }: { period: string }) {
  return (
    <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
      <p className="text-sm mb-3">
        No director payroll imported for this month yet.
      </p>
      <Link
        href={`/director-salary/import?period=${dayjs(period).format('YYYY-MM')}`}
        className="inline-block bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors"
      >
        Import InfoTech →
      </Link>
    </div>
  )
}
