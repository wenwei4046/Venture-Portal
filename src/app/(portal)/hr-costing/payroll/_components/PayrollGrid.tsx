'use client'

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoneyBare } from '@/lib/utils'
import {
  columnTotals,
  formatAmount,
  groupByDepartment,
  neighbourId,
} from '@/lib/payroll-grid'
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
  deduction_amount: number
  skbbk_amount: number
  prorata_days_worked: number
  prorata_days_in_month: number
  epf_er: number
  epf_ee: number
  socso_er: number
  socso_ee: number
  eis_er: number
  eis_ee: number
  pcb: number
  withholding_tax: number
  gross: number
  net: number
  /**
   * True for a salesperson in a `payroll_source = 'commission'` department.
   * Their Commission is DERIVED by the commission run, so the cell is read
   * only — a hand edit would be silently overwritten by the next Apply after
   * diverging from the statement that explains it.
   */
  commission_is_derived: boolean
  /** Link to this month's statement, when a run has computed one. */
  commission_statement_href: string | null
}

interface Props {
  rows: PayrollRowData[]
  period: string
}

/** Column order, left to right — the <colgroup> that fixes the widths. */
const COLUMNS = [
  'chk',
  'name',
  'gross',
  'net',
  'act',
  'basic',
  'stat',
  'ns',
  'ot',
  'comm',
  'unpaid',
  'ded',
  'skbbk',
  'epf',
  'socso',
  'eis',
] as const

const TOTAL_KEYS = [
  'gross',
  'net',
  'basic_salary',
  'statutory_allowance',
  'non_statutory_allowance',
  'ot_amount',
  'commission_amount',
  'unpaid_leave_days',
  'deduction_amount',
  'skbbk_amount',
  'epf_er',
  'socso_er',
  'eis_er',
] as const

/**
 * The payroll grid — redesigned 2026-09-05 ("C · Window", chosen out of
 * three mockups). One line per person inside a well; ✓ · Name · Gross · Net
 * frozen on the left with the eleven working columns scrolling under them;
 * rows grouped by department under a band that carries the subtotal; the
 * nine editable figures typed straight into the row, or into the person's
 * paycheck window (▾ or the name) which is a second view of the same
 * figures. The old table sat bare on the page with four-line names, ~130px
 * a row, and pushed Gross and Net off the right edge.
 */
export default function PayrollGrid({ rows, period }: Props) {
  const router = useRouter()
  const [openId, setOpenId] = useState<string | null>(null)
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const groups = useMemo(() => groupByDepartment(rows), [rows])
  // Display order — what ‹ › in the paycheck window step through.
  const order = useMemo(() => groups.flatMap(g => g.rows.map(r => r.id)), [groups])
  const totals = useMemo(() => columnTotals(rows, TOTAL_KEYS), [rows])

  // The frozen edge casts a shadow only once something has scrolled under it.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => el.classList.toggle('scrolled', el.scrollLeft > 0)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

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

  function toggleFold(dept: string) {
    setFolded(prev => {
      const next = new Set(prev)
      if (next.has(dept)) next.delete(dept)
      else next.add(dept)
      return next
    })
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-3 min-h-[1.75rem]">
        {someSelected ? (
          <span className="font-serif italic text-graphite text-xs">
            {selected.size} selected
          </span>
        ) : (
          <p className="font-serif italic text-graphite text-xs">
            All values in RM · edit in the row, or open a name for the paycheck ·
            Name and the payout stay put, the working scrolls.
          </p>
        )}
        {someSelected ? (
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
        ) : (
          <span className="pg-legend">
            <span>
              <i className="in" aria-hidden />
              editable
            </span>
            <span>
              <i className="ro" aria-hidden />
              computed
            </span>
            <span>
              <i className="dv" aria-hidden />
              from commission run
            </span>
          </span>
        )}
      </div>

      <div className="pg-well">
        <div ref={scrollRef} className="pg-scroll table-scroll">
          <table className="ledger-table payroll-grid">
            {/* Fixed layout reads its column widths from the first row — the
                group header with its colspans — so the widths live on the
                <col>s (globals.css → col.col-*), not on the <th>s. */}
            <colgroup>
              {COLUMNS.map(c => (
                <col key={c} className={`col-${c}`} />
              ))}
            </colgroup>
            <thead>
              <tr className="pg-grp">
                <th className="pg-st l0" colSpan={2} />
                <th className="pg-st l2" colSpan={3}>
                  Payout
                </th>
                <th className="g1" colSpan={5}>
                  Earnings
                </th>
                <th className="g1" colSpan={3}>
                  Deductions
                </th>
                <th className="g1" colSpan={3}>
                  Employer
                </th>
              </tr>
              <tr className="pg-cols">
                <th className="pg-st l0 col-chk">
                  <input
                    type="checkbox"
                    aria-label="Select all draft rows"
                    checked={allSelectableChecked}
                    disabled={selectableIds.length === 0 || isPending}
                    onChange={toggleAll}
                    className="w-3.5 h-3.5 accent-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:outline-none"
                  />
                </th>
                <th className="pg-st l1 col-name">Name</th>
                <th className="num pg-st l2 col-gross">Gross</th>
                <th className="num pg-st l3 col-net">Net</th>
                <th className="pg-st l4 col-act" />
                <th className="num g1 col-basic">Basic</th>
                <th className="num col-stat">Stat.</th>
                <th className="num col-ns">Non-stat.</th>
                <th className="num col-ot">OT</th>
                <th className="num col-comm">Comm.</th>
                <th className="num g1 col-unpaid">
                  Unpaid <i>days</i>
                </th>
                <th className="num col-ded">Deduct</th>
                <th
                  className="num col-skbbk"
                  title="Net-only employee deduction — gross and statutory are unaffected"
                >
                  SKBBK
                </th>
                <th className="num g1 col-epf">EPF ER</th>
                <th className="num col-socso">SOCSO ER</th>
                <th className="num col-eis">EIS ER</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => {
                const isFolded = folded.has(g.dept)
                const commissionDept = g.rows.some(r => r.commission_is_derived)
                return (
                  <Fragment key={g.dept}>
                    <tr className="pg-band">
                      <td className="pg-st l0 group-cell" colSpan={2}>
                        <button
                          type="button"
                          className="group-btn"
                          aria-expanded={!isFolded}
                          onClick={() => toggleFold(g.dept)}
                        >
                          <span className="chev" aria-hidden>
                            ▾
                          </span>
                          {g.dept}
                          {commissionDept && <span className="tag">commission</span>}
                          <span className="count">{g.rows.length}</span>
                        </button>
                      </td>
                      <td className="pg-st l2 sub">{formatMoneyBare(g.gross)}</td>
                      <td className="pg-st l3 sub">{formatMoneyBare(g.net)}</td>
                      <td className="pg-st l4" />
                      <td colSpan={11} />
                    </tr>
                    {g.rows.map((r, i) => (
                      <PayrollRow
                        key={r.id}
                        row={r}
                        period={period}
                        index={order.indexOf(r.id)}
                        count={order.length}
                        alt={i % 2 === 1}
                        hidden={isFolded}
                        open={openId === r.id}
                        onOpen={() => setOpenId(r.id)}
                        onClose={() => setOpenId(null)}
                        onStep={dir => {
                          const next = neighbourId(order, r.id, dir)
                          if (next) setOpenId(next)
                        }}
                        selected={selected.has(r.id)}
                        onToggleSelect={() => toggleRow(r.id)}
                        selectDisabled={isPending}
                      />
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="pg-st l0" colSpan={2} style={{ paddingLeft: 12 }}>
                  Total · {rows.length} staff
                </td>
                <td className="num pg-st l2">{formatMoneyBare(totals.gross)}</td>
                <td className="num pg-st l3">{formatMoneyBare(totals.net)}</td>
                <td className="pg-st l4" />
                <td className="num g1">{formatMoneyBare(totals.basic_salary)}</td>
                <td className="num sub">{formatMoneyBare(totals.statutory_allowance)}</td>
                <td className="num sub">{formatMoneyBare(totals.non_statutory_allowance)}</td>
                <td className="num sub">{formatMoneyBare(totals.ot_amount)}</td>
                <td className="num sub">{formatMoneyBare(totals.commission_amount)}</td>
                <td className="num g1 sub">{formatAmount(totals.unpaid_leave_days, 1)}</td>
                <td className="num sub">{formatMoneyBare(totals.deduction_amount)}</td>
                <td className="num sub">{formatMoneyBare(totals.skbbk_amount)}</td>
                <td className="num g1 sub">{formatMoneyBare(totals.epf_er)}</td>
                <td className="num sub">{formatMoneyBare(totals.socso_er)}</td>
                <td className="num sub">{formatMoneyBare(totals.eis_er)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <p className="font-serif italic text-muted text-xs mt-4">
        Edit values in the row and click Save, or open a name for the paycheck — same
        figures either way. Statutory re-computes automatically. Tick draft rows and{' '}
        <em>Delete</em> to drop staff who shouldn&apos;t be on this month&apos;s payroll.
      </p>
    </div>
  )
}
