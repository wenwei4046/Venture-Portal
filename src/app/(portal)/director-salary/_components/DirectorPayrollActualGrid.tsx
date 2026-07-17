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
}

interface Props {
  rows: DirectorPayrollRowData[]
  period: string
}

interface RowApi {
  isDirty: () => boolean
  save: () => Promise<void>
}

export default function DirectorPayrollActualGrid({ rows, period }: Props) {
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
      {/* Summary band — same anatomy as the HR payroll page */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-6 mb-6 border-y border-hairline py-6">
        <div>
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">Total CTC</div>
          <div className="num text-num-ink text-xl tracking-[-0.01em] mt-1">{formatMoney(totalCtc)}</div>
        </div>
        <div>
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">Total Gross</div>
          <div className="num text-graphite text-md mt-1">{formatMoney(totals.gross)}</div>
        </div>
        <div>
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">Total Net</div>
          <div className="num text-graphite text-md mt-1">{formatMoney(totals.net)}</div>
        </div>
        <div>
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">EPF ER</div>
          <div className="num text-graphite text-md mt-1">{formatMoney(totals.epf_er)}</div>
        </div>
        <div>
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">SOCSO+EIS ER</div>
          <div className="num text-graphite text-md mt-1">
            {formatMoney(totals.socso_er + totals.eis_er)}
          </div>
        </div>
        <div>
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">Total PCB</div>
          <div className="num text-graphite text-md mt-1">{formatMoney(totals.pcb)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3 gap-4 min-h-[1.75rem]">
        {someSelected ? (
          <span className="font-serif italic text-graphite text-xs">{selected.size} selected</span>
        ) : (
          <p className="font-serif italic text-graphite text-xs">
            All values in RM · imported verbatim from InfoTech · click the row arrow for the EE
            breakdown.
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
                  aria-label="Select all rows"
                  checked={allChecked}
                  disabled={rows.length === 0 || isPending}
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
              <th className="text-right py-4 pr-4 font-medium">Deduct</th>
              <th className="text-right py-4 pr-4 font-medium" title="Net-only employee deduction — gross and statutory are unaffected">SKBBK</th>
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
      <p className="font-serif italic text-muted text-xs mt-4">
        Edit values inline — figures stick as typed (no recompute; the InfoTech file is the
        source of truth). Statutory, PCB, Gross and Net are edited in the expanded panel (▾).
      </p>

      {/* Staff-payroll-style flow: Save flushes every dirty row, then lands on
          the Submission tab where Submit to Finance is. */}
      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={handleSaveAll}
          disabled={isPending}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saveAllState === 'saving' ? 'Saving...' : 'Save'}
        </button>
        {saveAllError && (
          <span className="text-sm font-serif italic text-danger">{saveAllError}</span>
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

  const cell = (name: keyof DirectorPayrollUpdate, w = 'w-24') => (
    <input
      type="number"
      step="0.01"
      min="0"
      value={edit[name] ?? 0}
      disabled={isPending}
      onChange={e => setEdit({ ...edit, [name]: parseFloat(e.target.value) || 0 })}
      className={`${w} text-right font-mono tabular text-sm bg-transparent border-b border-transparent focus:border-accent-border focus:outline-none px-1 py-1 disabled:text-muted disabled:cursor-not-allowed`}
    />
  )

  return (
    <>
      <tr className="border-b border-hairline last:border-0 hover:bg-surface-2/40 transition-colors">
        <td className="py-5 pl-2 pr-2 w-8">
          <input
            type="checkbox"
            aria-label={`Select ${row.employee_name}`}
            checked={selected}
            disabled={selectDisabled}
            onChange={onToggleSelect}
            className="w-4 h-4 accent-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:outline-none"
          />
        </td>
        <td className="py-5 pr-4">
          <div className="font-serif text-md text-ink">{row.employee_name}</div>
          <div className="font-mono text-[11px] text-graphite mt-0.5">
            {row.director_code ?? (
              <span className="font-serif italic text-alert">unmatched</span>
            )}
            {row.source === 'manual' && (
              <span className="ml-2 font-serif italic text-alert not-italic">edited</span>
            )}
          </div>
        </td>
        <td className="py-5 pr-4 font-serif italic text-graphite text-sm">
          {row.dept_name || '—'}
        </td>
        <td className="py-5 pr-4 text-right">{cell('basic_salary')}</td>
        <td className="py-5 pr-4 text-right">{cell('statutory_allowance')}</td>
        <td className="py-5 pr-4 text-right">{cell('non_statutory_allowance')}</td>
        <td className="py-5 pr-4 text-right">{cell('ot_amount')}</td>
        <td className="py-5 pr-4 text-right">{cell('commission_amount')}</td>
        <td className="py-5 pr-4 text-right">{cell('no_pay_amount')}</td>
        <td className="py-5 pr-4 text-right">{cell('deduction_amount')}</td>
        <td className="py-5 pr-4 text-right">{cell('skbbk_amount')}</td>
        <td className="py-5 pr-4 text-right font-mono tabular text-graphite">
          {formatMoneyBare(row.epf_er)}
        </td>
        <td className="py-5 pr-4 text-right font-mono tabular text-graphite">
          {formatMoneyBare(row.socso_er)}
        </td>
        <td className="py-5 pr-4 text-right font-mono tabular text-graphite">
          {formatMoneyBare(row.eis_er)}
        </td>
        <td className="py-5 pr-4 text-right font-mono tabular font-medium text-ink">
          {formatMoneyBare(row.gross)}
        </td>
        <td className="py-5 pr-4 text-right font-mono tabular font-semibold text-ink">
          {formatMoneyBare(row.net)}
        </td>
        <td className="py-5 pr-2 text-right">
          <div className="flex items-center gap-2 justify-end">
            {dirty && (
              <button
                onClick={handleSave}
                disabled={isPending}
                className="text-xs font-sans text-accent hover:text-accent-hover disabled:opacity-50"
              >
                {isPending ? '...' : 'Save'}
              </button>
            )}
            {saved && <span className="text-xs font-serif italic text-ledger">✓</span>}
            {error && (
              <span className="text-xs font-serif italic text-danger" title={error}>
                !
              </span>
            )}
            <a
              href={`/director-salary/payslip/${row.id}`}
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
          <td colSpan={17} className="py-4 px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-8 gap-y-4 text-sm">
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
                  <div className="text-xs uppercase tracking-wide text-muted font-sans">
                    Director link
                  </div>
                  <div className="font-serif italic text-alert mt-1 text-xs">
                    Unmatched — fix the name in InfoTech (or Settings → Directors) and re-import
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
      <div className="text-xs uppercase tracking-wide text-muted font-sans">{label}</div>
      <div className="mt-1 flex items-center gap-1 font-mono tabular text-ink">{children}</div>
    </div>
  )
}

export function DirectorPayrollEmptyState({ period }: { period: string }) {
  return (
    <div className="py-8 text-center border border-hairline rounded-md bg-surface">
      <p className="font-serif italic text-muted mb-3">
        No director payroll imported for this month yet.
      </p>
      <Link
        href={`/director-salary/import?period=${dayjs(period).format('YYYY-MM')}`}
        className="inline-block bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
      >
        Import InfoTech →
      </Link>
    </div>
  )
}
