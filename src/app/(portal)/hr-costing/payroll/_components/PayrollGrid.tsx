'use client'

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoneyBare } from '@/lib/utils'
import { calculateRevenuePayrollSplit } from '@/lib/revenue-payroll'
import {
  columnTotals,
  formatAmount,
  groupByDepartment,
  neighbourId,
  type PayrollStatutoryField,
  type PayrollTaxMode,
} from '@/lib/payroll-grid'
import { round2 } from '@/lib/payroll-funding'
import { isTopupKind, rowActions, rowStatusView, type LifecycleRow, type RowStatus } from '@/lib/payroll-lifecycle'
import { completePayrollRows, deletePayrollRows, unlockPayrollRows } from '../actions'
import PayrollRow from './PayrollRow'
import PayrollRowMenu, { type RowMenuAnchor } from './PayrollRowMenu'

export interface PayrollRowData {
  id: string
  staff_id: string
  staff_name: string
  dept_name: string
  status: string
  source: string
  /** staff = hr_monthly_payroll; directors = director_monthly_payroll (read-only here). */
  scope: 'staff' | 'directors'
  /** Where the pay is worked out, and so where it is Completed. */
  origin: 'staff' | 'revenue' | 'director'
  completed_at: string | null
  topup_opened_at: string | null
  /** While unlocked: a correction (resubmit) or a planned second payment (second_payroll). */
  topup_kind?: string | null
  /** Standing batches that carried this person, oldest first. */
  batch_nos: number[]
  /** CTC those batches already sent — a resubmit sends the rest. */
  submitted_ctc: number
  /** Revenue: their ledger on Comm Cal, where they are closed / reopened. */
  comm_cal_href?: string | null
  /** Directors: Director Salary, where they are keyed and Completed. */
  director_href?: string | null
  basic_salary: number
  statutory_allowance: number
  non_statutory_allowance: number
  ot_hours: number
  ot_amount: number
  commission_amount: number
  commission_synced_amount?: number | null
  /** Current confirmed source, used to review/repair a missed payroll sync. */
  commission_confirmed_amount?: number | null
  commission_adjustment_amount?: number
  commission_adjustment_reason?: string | null
  commission_adjusted_at?: string | null
  unpaid_leave_days: number
  deduction_amount: number
  skbbk_amount: number
  /** Revenue rows: the pay lines added on Comm Cal (2026-09-27). Read-only here. */
  pay_line_earnings?: number
  pay_line_deductions?: number
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
  /** Statutory figures somebody typed — they stay until Reset to JADUAL (2026-09-30). */
  statutory_typed?: PayrollStatutoryField[]
  /** Set by a typed figure or the InfoTech import: the row's statutory is not all JADUAL's. */
  statutory_overridden_at?: string | null
  /** From their People record: PCB is typed only for somebody on PCB. */
  tax_mode?: PayrollTaxMode
  gross: number
  net: number
  /**
   * True for a salesperson in a `payroll_source = 'commission'` department.
   * The source commission belongs to Comm Cal. Gross changes use the
   * separate adjustment action; ordinary payroll saves cannot replace it.
   */
  commission_is_derived: boolean
  /** Link to this month's statement, when a run has computed one. */
  commission_statement_href: string | null
  /** Source-linked Revenue payroll; imported rows retain their own payroll treatment. */
  revenue_payroll?: boolean
  commission_balance?: number | null
  payout_split_version?: number | null
  basic_pay_net?: number | null
  pcb_override_amount?: number | null
  commission_statements?: { label: string; href: string }[]
}

interface Props {
  rows: PayrollRowData[]
  period: string
  /** Total Close: nothing on the grid can change. */
  monthClosed?: boolean
}

/** Column order, left to right — the <colgroup> that fixes the widths. */
const COLUMNS = [
  'chk',
  'name',
  'status',
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
  'epf-ee',
  'socso-ee',
  'eis-ee',
  'pcb',
  'epf-er',
  'socso-er',
  'eis-er',
] as const

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`

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
  'epf_ee',
  'socso_ee',
  'eis_ee',
  'pcb',
  'epf_er',
  'socso_er',
  'eis_er',
] as const

export function lifecycleOf(r: PayrollRowData): LifecycleRow {
  return {
    id: r.id,
    scope: r.scope,
    origin: r.origin,
    status: r.status as RowStatus,
    name: r.staff_name,
    dept: r.dept_name,
    ctc: round2(r.gross + r.epf_er + r.socso_er + r.eis_er),
    submittedCtc: r.submitted_ctc,
    batchNos: r.batch_nos,
    completedAt: r.completed_at,
    topupOpenedAt: r.topup_opened_at,
    topupKind: isTopupKind(r.topup_kind) ? r.topup_kind : null,
    sourceLinked: r.source === 'commission' && Boolean(r.commission_statements?.length || r.commission_statement_href),
  }
}

/**
 * The payroll grid — "C · Window" (2026-09-05): one line per person inside a
 * well; ✓ · Name · Status · Gross · Net frozen on the left with the working
 * columns scrolling under them; rows grouped by department under a band that
 * carries the subtotal. Since the unified Payroll (2026-09-27) the Status
 * column says where each person's pay stands; tick people to Complete,
 * Unlock or Delete them, right-click somebody to Resubmit or add a Second payroll.
 * Since 2026-09-30 every statutory figure is a field too — the employee's
 * EPF / SOCSO / EIS and PCB under Deductions, the employer's under Employer —
 * and one somebody typed keeps an accent dot until Reset to JADUAL.
 */
export default function PayrollGrid({ rows, period, monthClosed = false }: Props) {
  const router = useRouter()
  const [openId, setOpenId] = useState<string | null>(null)
  const [department, setDepartment] = useState('')
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ rowId: string; anchor: RowMenuAnchor; byRightClick: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const groups = useMemo(() => groupByDepartment(rows), [rows])
  const visibleGroups = useMemo(
    () => groups.filter(g => !department || g.dept === department),
    [groups, department],
  )
  const visibleRows = useMemo(() => visibleGroups.flatMap(g => g.rows), [visibleGroups])
  const revenueRows = visibleRows.filter(r => r.revenue_payroll ?? r.source === 'commission')
  const showRevenueSplit = revenueRows.length > 0
  const splitTotals = columnTotals(revenueRows.map(calculateRevenuePayrollSplit), ['basicPay', 'commissionBalance'])
  const grossCommissionTotal = columnTotals(revenueRows, ['commission_amount']).commission_amount
  const displayedCommissionTotal = splitTotals.commissionBalance
    + columnTotals(visibleRows.filter(r => !(r.revenue_payroll ?? r.source === 'commission')), ['commission_amount']).commission_amount
  const order = useMemo(() => visibleRows.filter(r => r.scope === 'staff').map(r => r.id), [visibleRows])
  const totals = useMemo(() => columnTotals(visibleRows, TOTAL_KEYS), [visibleRows])

  const views = useMemo(() => new Map(rows.map(r => {
    const life = lifecycleOf(r)
    return [r.id, { life, status: rowStatusView(life), actions: rowActions(life, monthClosed) }]
  })), [rows, monthClosed])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => el.classList.toggle('scrolled', el.scrollLeft > 0)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Drop ticks on rows whose state moved under them (a refresh after an action).
  useEffect(() => {
    setSelected(prev => {
      const next = new Set([...prev].filter(id => {
        const a = views.get(id)?.actions
        return a && (a.complete || a.unlock || a.remove)
      }))
      return next.size === prev.size ? prev : next
    })
  }, [views])

  const selectableIds = useMemo(
    () => visibleRows.filter(r => {
      const a = views.get(r.id)?.actions
      return a && (a.complete || a.unlock || a.remove)
    }).map(r => r.id),
    [visibleRows, views],
  )
  const allSelectableChecked = selectableIds.length > 0 && selectableIds.every(id => selected.has(id))
  const picked = [...selected].map(id => views.get(id)).filter((v): v is NonNullable<typeof v> => !!v)
  const toComplete = picked.filter(v => v.actions.complete).map(v => v.life.id)
  const toUnlock = picked.filter(v => v.actions.unlock).map(v => v.life.id)
  const toRemove = picked.filter(v => v.actions.remove).map(v => v.life.id)

  function toggleRow(id: string) {
    setActionError(null)
    setNotice(null)
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setActionError(null)
    setNotice(null)
    setSelected(allSelectableChecked ? new Set() : new Set(selectableIds))
  }

  function toggleFold(dept: string) {
    setFolded(prev => {
      const next = new Set(prev)
      if (next.has(dept)) next.delete(dept)
      else next.add(dept)
      return next
    })
  }

  function act(label: string, run: () => Promise<string>) {
    setActionError(null)
    setNotice(null)
    startTransition(async () => {
      try {
        const done = await run()
        setSelected(new Set())
        setNotice(done)
        router.refresh()
      } catch (err) {
        setActionError(err instanceof Error ? err.message : `${label} failed`)
        router.refresh()
      }
    })
  }

  function handleComplete() {
    if (toComplete.length === 0) return
    act('Complete', async () => {
      const r = await completePayrollRows(period, toComplete)
      return `${r.completed} completed${r.unchanged ? ` · ${r.unchanged} resubmit${r.unchanged === 1 ? '' : 's'} unchanged, back as sent` : ''} — Submit to Finance when ready`
    })
  }

  function handleUnlock() {
    if (toUnlock.length === 0) return
    act('Unlock', async () => {
      const r = await unlockPayrollRows(period, toUnlock)
      return `${r.unlocked} unlocked — editable again`
    })
  }

  function handleDelete() {
    if (toRemove.length === 0) return
    const label = toRemove.length === 1 ? 'row' : 'rows'
    if (!window.confirm(`Delete ${toRemove.length} payroll ${label}? These staff won't appear in this month's payroll. You can re-add them with Import InfoTech or a new period.`)) return
    act('Delete', async () => {
      const r = await deletePayrollRows(toRemove, period)
      return `${r.deleted} deleted`
    })
  }

  const menuRow = menu ? rows.find(r => r.id === menu.rowId) ?? null : null
  const menuView = menuRow ? views.get(menuRow.id) ?? null : null

  return (
    <div className="mb-12">
      <div className="sheet-toolbar">
        <label className="flex items-center gap-2 text-xs font-medium">
          Department
          <select
            value={department}
            onChange={event => {
              setDepartment(event.target.value)
              setOpenId(null)
              setSelected(new Set())
              setActionError(null)
            }}
            className="text-ink"
          >
            <option value="">All departments</option>
            {groups.map(group => <option key={group.dept} value={group.dept}>{group.dept}</option>)}
          </select>
        </label>
        <span className="sheet-count ml-auto">{people(visibleRows.length)}</span>
      </div>
      {showRevenueSplit && (
        <p className="sheet-notice">
          Revenue: Gross Commission is the total before allocations; Balance under Earnings is the remaining commission payment.
          {' '}Net basic + Balance = Net to bank.
          {' '}A salesperson completes here when they are closed on Comm Cal — right-click them to open their ledger.
          {' '}Directors are keyed and Completed on Director Salary.
        </p>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-3 min-h-[1.75rem]">
        {selected.size > 0 ? (
          <span className="text-xs font-bold">{selected.size} selected</span>
        ) : notice ? (
          <span className="chip ledger" role="status"><span className="dot" />{notice}</span>
        ) : (
          <p className="text-xs">
            Tick people and Complete them when their figures are checked · right-click a row for more ·
            Name, Status and the payout stay put, the working scrolls.
          </p>
        )}
        {selected.size > 0 ? (
          <div className="flex items-center gap-3 flex-wrap">
            {actionError && <span className="text-danger text-xs max-w-md" role="alert">{actionError}</span>}
            {toComplete.length > 0 && (
              <button
                onClick={handleComplete}
                disabled={isPending}
                className="text-xs font-medium bg-accent hover:bg-accent-hover px-2.5 py-1 rounded-control transition-colors disabled:opacity-50"
              >
                {isPending ? 'Working…' : `Complete ${toComplete.length}`}
              </button>
            )}
            {toUnlock.length > 0 && (
              <button
                onClick={handleUnlock}
                disabled={isPending}
                className="text-xs font-medium border border-hairline bg-surface px-2.5 py-1 rounded-control disabled:opacity-50"
              >
                Unlock {toUnlock.length}
              </button>
            )}
            {toRemove.length > 0 && (
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="text-xs font-medium text-danger bg-danger-bg hover:bg-danger/15 border border-danger/40 px-2.5 py-1 rounded-control transition-colors disabled:opacity-50"
              >
                Delete {toRemove.length}
              </button>
            )}
            <button onClick={() => setSelected(new Set())} disabled={isPending} className="text-xs hover:underline underline-offset-2 disabled:opacity-50">
              Clear
            </button>
          </div>
        ) : actionError ? (
          <span className="text-danger text-xs max-w-md" role="alert">{actionError}</span>
        ) : (
          <span className="pg-legend">
            <span><i className="in" aria-hidden />editable</span>
            <span><i className="mn" aria-hidden />typed over JADUAL</span>
            <span><i className="ro" aria-hidden />computed</span>
            <span><i className="dv" aria-hidden />from Comm Cal / Director Salary</span>
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
                <Fragment key={c}>
                  <col className={`col-${c}`} />
                  {c === 'act' && showRevenueSplit && (
                    <>
                      <col className="col-basic" />
                      <col style={{ width: 118 }} />
                    </>
                  )}
                </Fragment>
              ))}
            </colgroup>
            <thead>
              <tr className="pg-grp">
                <th className="pg-st l0" colSpan={3} />
                <th className="pg-st l3" colSpan={3}>Payout</th>
                {showRevenueSplit && <th className="g1" colSpan={2}>Revenue payout</th>}
                <th className="g1" colSpan={5}>Earnings</th>
                <th className="g1" colSpan={7}>Deductions</th>
                <th className="g1" colSpan={3}>Employer</th>
              </tr>
              <tr className="pg-cols">
                <th className="pg-st l0 col-chk">
                  <input
                    type="checkbox"
                    aria-label="Select everyone who can be completed, unlocked or deleted"
                    checked={allSelectableChecked}
                    disabled={selectableIds.length === 0 || isPending}
                    onChange={toggleAll}
                    className="w-3.5 h-3.5 accent-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:outline-none"
                  />
                </th>
                <th className="pg-st l1 col-name">Name</th>
                <th className="pg-st l2 col-status">Status</th>
                <th className="num pg-st l3 col-gross">Gross</th>
                <th className="num pg-st l4 col-net">Net</th>
                <th className="pg-st l5 col-act" />
                {showRevenueSplit && (
                  <>
                    <th className="num g1">{visibleRows.filter(row => row.source === 'commission').every(row => row.payout_split_version === 2) ? 'Net basic' : 'Basic pay'}</th>
                    <th className="num" title="Commission total from Revenue before basic and statutory allocations">Gross Commission</th>
                  </>
                )}
                <th className="num g1 col-basic">Basic</th>
                <th className="num col-stat">Stat.</th>
                <th className="num col-ns">Non-stat.</th>
                <th className="num col-ot">OT</th>
                <th className="num col-comm" title={showRevenueSplit ? 'Remaining commission payment for Revenue; regular commission for other departments' : undefined}>{showRevenueSplit ? 'Balance' : 'Comm.'}</th>
                <th className="num g1 col-unpaid">Unpaid <i>days</i></th>
                <th className="num col-ded">Deduct</th>
                <th className="num col-skbbk" title="Net-only employee deduction — gross and statutory are unaffected">SKBBK</th>
                <th className="num col-epf-ee" title="EPF, employee's share — JADUAL until typed">EPF EE</th>
                <th className="num col-socso-ee" title="SOCSO, employee's share — JADUAL until typed">SOCSO EE</th>
                <th className="num col-eis-ee" title="EIS, employee's share — JADUAL until typed">EIS EE</th>
                <th className="num col-pcb" title="Monthly tax deduction — JADUAL until typed">PCB</th>
                <th className="num g1 col-epf-er" title="EPF, employer's share — JADUAL until typed">EPF ER</th>
                <th className="num col-socso-er" title="SOCSO, employer's share — JADUAL until typed">SOCSO ER</th>
                <th className="num col-eis-er" title="EIS, employer's share — JADUAL until typed">EIS ER</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => {
                const isFolded = folded.has(g.dept)
                const filteredOut = !!department && g.dept !== department
                const groupRevenueRows = g.rows.filter(r => r.revenue_payroll ?? r.source === 'commission')
                const groupSplit = columnTotals(groupRevenueRows.map(calculateRevenuePayrollSplit), ['basicPay', 'commissionBalance'])
                const groupGrossCommission = columnTotals(groupRevenueRows, ['commission_amount']).commission_amount
                const groupDisplayedCommission = groupSplit.commissionBalance
                  + columnTotals(g.rows.filter(r => !(r.revenue_payroll ?? r.source === 'commission')), ['commission_amount']).commission_amount
                const waiting = g.rows.filter(r => r.status === 'completed').length
                const sent = g.rows.filter(r => r.status === 'submitted' || r.status === 'paid').length
                return (
                  <Fragment key={g.dept}>
                    <tr className="pg-band" hidden={filteredOut}>
                      <td className="pg-st l0 group-cell" colSpan={2}>
                        <button
                          type="button"
                          className="group-btn"
                          aria-expanded={!isFolded}
                          aria-label={`${g.dept}, ${people(g.rows.length)}`}
                          title={g.dept}
                          onClick={() => toggleFold(g.dept)}
                        >
                          <span className="chev shrink-0" aria-hidden>▾</span>
                          <span className="min-w-0 truncate">{g.dept}</span>
                          <span className="count shrink-0">{g.rows.length}</span>
                        </button>
                      </td>
                      <td className="pg-st l2 pg-band-state">
                        {sent === g.rows.length ? 'all with Finance' : sent || waiting ? `${sent} sent · ${waiting} ready` : ''}
                      </td>
                      <td className="pg-st l3 sub">{formatMoneyBare(g.gross)}</td>
                      <td className="pg-st l4 sub">{formatMoneyBare(g.net)}</td>
                      <td className="pg-st l5" />
                      {showRevenueSplit && (
                        <>
                          <td className="num g1 sub">{groupRevenueRows.length ? formatMoneyBare(groupSplit.basicPay) : '—'}</td>
                          <td className="num sub">{groupRevenueRows.length ? formatMoneyBare(groupGrossCommission) : '—'}</td>
                        </>
                      )}
                      <td colSpan={4} />
                      <td className="num sub">{formatMoneyBare(groupDisplayedCommission)}</td>
                      <td colSpan={10} />
                    </tr>
                    {g.rows.map((r, i) => {
                      const view = views.get(r.id)!
                      const selectable = view.actions.complete || view.actions.unlock || view.actions.remove
                      return (
                        <PayrollRow
                          key={r.id}
                          row={r}
                          period={period}
                          index={order.indexOf(r.id)}
                          count={order.length}
                          alt={i % 2 === 1}
                          hidden={isFolded || filteredOut}
                          showRevenueSplit={showRevenueSplit}
                          status={view.status}
                          open={openId === r.id}
                          onOpen={() => setOpenId(r.id)}
                          onClose={() => setOpenId(null)}
                          onStep={dir => {
                            const next = neighbourId(order, r.id, dir)
                            if (next) setOpenId(next)
                          }}
                          selected={selected.has(r.id)}
                          onToggleSelect={() => toggleRow(r.id)}
                          selectDisabled={isPending || !selectable}
                          selectHint={selectable ? undefined : view.actions.hint ?? undefined}
                          onMenu={(anchor, byRightClick) => setMenu({ rowId: r.id, anchor, byRightClick })}
                        />
                      )
                    })}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="pg-st l0" colSpan={3} style={{ paddingLeft: 12 }}>
                  Total · {people(visibleRows.length)}
                </td>
                <td className="num pg-st l3">{formatMoneyBare(totals.gross)}</td>
                <td className="num pg-st l4">{formatMoneyBare(totals.net)}</td>
                <td className="pg-st l5" />
                {showRevenueSplit && (
                  <>
                    <td className="num g1">{formatMoneyBare(splitTotals.basicPay)}</td>
                    <td className="num">{formatMoneyBare(grossCommissionTotal)}</td>
                  </>
                )}
                <td className="num g1">{formatMoneyBare(totals.basic_salary)}</td>
                <td className="num sub">{formatMoneyBare(totals.statutory_allowance)}</td>
                <td className="num sub">{formatMoneyBare(totals.non_statutory_allowance)}</td>
                <td className="num sub">{formatMoneyBare(totals.ot_amount)}</td>
                <td className="num sub">{formatMoneyBare(displayedCommissionTotal)}</td>
                <td className="num g1 sub">{formatAmount(totals.unpaid_leave_days, 1)}</td>
                <td className="num sub">{formatMoneyBare(totals.deduction_amount)}</td>
                <td className="num sub">{formatMoneyBare(totals.skbbk_amount)}</td>
                <td className="num sub">{formatMoneyBare(totals.epf_ee)}</td>
                <td className="num sub">{formatMoneyBare(totals.socso_ee)}</td>
                <td className="num sub">{formatMoneyBare(totals.eis_ee)}</td>
                <td className="num sub">{formatMoneyBare(totals.pcb)}</td>
                <td className="num g1 sub">{formatMoneyBare(totals.epf_er)}</td>
                <td className="num sub">{formatMoneyBare(totals.socso_er)}</td>
                <td className="num sub">{formatMoneyBare(totals.eis_er)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <p className="text-xs mt-4">
        Edit a draft in the row and click Save, or open a name for the paycheck — same figures either way.
        EPF, SOCSO, EIS and PCB follow JADUAL until you type one; a typed figure keeps an accent dot and stays
        {' '}when the pay changes, until <strong className="font-bold">Reset statutory to JADUAL</strong> in the row&apos;s ⋯ menu.
        {' '}Tick people and <strong className="font-bold">Complete</strong> them when checked; <strong className="font-bold">Submit to Finance</strong>
        {' '}sends everybody Completed as one batch, and can be pressed again for the next group. Right-click somebody already sent to
        {' '}<strong className="font-bold">Resubmit</strong> them (a correction) or give them a <strong className="font-bold">Second payroll</strong>
        {' '}(a planned second payment) — either way the next batch sends only the difference.
      </p>

      {menu && menuRow && menuView && (
        <PayrollRowMenu
          key={menu.rowId}
          row={menuRow}
          period={period}
          anchor={menu.anchor}
          byRightClick={menu.byRightClick}
          actions={menuView.actions}
          status={menuView.status}
          onOpenPaycheck={menuRow.scope === 'staff' ? () => setOpenId(menuRow.id) : undefined}
          onClose={() => setMenu(null)}
          onDone={message => { setMenu(null); setNotice(message); setActionError(null) }}
        />
      )}
    </div>
  )
}
