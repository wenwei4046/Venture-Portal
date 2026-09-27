'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { buildCommissionWorkbench, type CommissionOrderRow, type OverrideOrderRow } from '@/lib/commission/workbench'
import { depositRequired } from '@/lib/commission/engine'
import { billCountAction, type BillCountAction } from '@/lib/commission/bill-exclusion'
import {
  billHref, readWorkbenchLocation, sameWorkbenchView, workbenchSearch,
  type LedgerSort, type LedgerView, type WorkbenchLocation,
} from '@/lib/commission/workbench-nav'
import { formatMoney } from '@/lib/utils'
import { computeRevenuePay } from '@/lib/revenue-pay'
import type { FairSales } from '@/lib/venues'
import type { OpenBillTag } from '@/lib/commission/types'
import type { CommissionWorkbenchData } from '../../../_lib/commission-workbench'
import { excludeOrder, includeOrder, saveOpenBillPicks } from '../../../run-actions'
import { nameWarnings, payrollState, unmatchedWarnings, type RunStatus } from '@/lib/commission/payroll-send'
import { useEntryScroll } from '@/components/layout/useEntryScroll'
import BillContextMenu, { type BillMenuOutcome } from '../orders/_components/BillContextMenu'
import BillCountNotice from '../orders/_components/BillCountNotice'
import { useBillMenu } from '../orders/_components/useBillMenu'
import CommissionMonthSummary, { type CommissionMonthStats } from './CommissionMonthSummary'
import SalaryCalculation from './SalaryCalculation'
import NoCommission, { COMMISSIONABLE_HINT, DEPOSIT_HINT, DROP_HINT, GROUP_SALES_HINT, SALES_VALUE_HINT, UPSELL_HINT } from './NoCommission'
import PayrollBar from './PayrollBar'
import s from './commission-workbench.module.css'

type Tab = 'sales' | 'kpi' | 'open' | 'deposit' | 'venue'
const TABS: [Tab, string][] = [
  ['sales', 'Total Sales Orders'], ['kpi', 'KPI Items'], ['open', 'Open Bill'],
  ['deposit', 'Below deposit'], ['venue', 'Sales by venue'],
]
type Column = 'date' | 'venue' | 'event' | 'organizer' | 'location' | 'brand' | 'category' | 'sales' | 'commissionable' | 'margin' | 'rank' | 'product' | 'kpi' | 'incentive' | 'open'
const COLUMNS: [Column, string][] = [
  ['date', 'Date'], ['venue', 'Venue'], ['event', 'Event'], ['organizer', 'Organizer'],
  ['location', 'Sales location'], ['brand', 'Brand'], ['category', 'Category'], ['sales', 'Sales value'],
  ['commissionable', 'Commissionable value'],
  ['margin', 'Margin'], ['rank', 'Title / rank'], ['product', 'Product commission'], ['kpi', 'KPI amount'],
  ['incentive', 'Margin incentive'], ['open', 'Open Bill'],
]
const NUMERIC_COLUMNS: Column[] = ['sales', 'commissionable', 'margin', 'product', 'kpi', 'incentive']
const money = formatMoney
const quantity = (value: number) => new Intl.NumberFormat('en-MY', { maximumFractionDigits: 8 }).format(value)
const pct = (n: number | null | undefined) => n == null ? '—' : `${(n * 100).toFixed(1).replace('.0', '')}%`
const sum = <T,>(rows: T[], get: (row: T) => number) => Math.round(rows.reduce((a, r) => a + get(r), 0) * 100) / 100
const statusLabel = { eligible: 'Included', excluded: 'Excluded from draft', deposit_pending: 'Deposit pending', already_released: 'Previously paid' }
const tagFingerprint = (tags: readonly OpenBillTag[]) => JSON.stringify(tags.map(t => `${t.orderId}:${t.rank}`).sort())
const monthName = (month: string) => new Date(`${month}T00:00:00Z`).toLocaleDateString('en-MY', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const HEAD_TITLE = 'Department head'
const HEAD_NOTE = 'Own bills earn no commission'

/**
 * What the payroll bar needs from the server beside the run itself
 * (2026-09-27). Absent on a page that sends nothing — the bar is not drawn.
 */
export interface PayrollBarFacts {
  subDepartmentId: string
  /** "September 2026". */
  monthLabel: string
  runId: string | null
  sentAt: string | null
  /** "September 2026" — the first month the portal pays — for a month settled by hand. */
  settledBefore: string | null
  /** Why the month's payroll can take no more commission (`commission_payroll_closed`), or null. */
  payrollClosed: string | null
  /** What the month pays — the scheme switches. */
  switches?: ReactNode
}

/** A bill of the month taken out by hand (`excluded_reason = 'manual'`). */
export interface NotCountedBill {
  orderId: string
  orderNo: string
  orderDate: string
  staffId: string | null
  orderTotal: number
}

interface Props {
  data: CommissionWorkbenchData
  sub: string
  period: string
  runStatus: string | null
  /** The saved run's statements: what payroll holds, once the run is in it. */
  savedTotals: { staffId: string; total: number }[]
  monthStats: CommissionMonthStats
  /**
   * The month's bills by the fair they were written at — every live bill,
   * matched or not, so the tab adds up to the Total sales value card.
   */
  venues?: FairSales[]
  monthOverview?: ReactNode
  payroll?: PayrollBarFacts
  /**
   * The month's bills somebody took out by hand (Don't count this bill) —
   * gone from the calculation, listed on their seller's page to count again.
   */
  notCounted?: NotCountedBill[]
  /**
   * Months whose bills can no longer be taken out or counted again — their run
   * has paid (`commission_order_period_locked`). A bill's menu reads its OWN
   * month: one carried in from August answers to August's run.
   */
  lockedPeriods?: readonly string[]
}

export default function CommissionWorkbench({ data, sub, period, runStatus, savedTotals, monthStats, venues = [], monthOverview, payroll, notCounted = [], lockedPeriods = [] }: Props) {
  const router = useRouter()
  // Where the workbench stands is the URL's (2026-09-27, lib/commission/
  // workbench-nav.ts): which cut, whose ledger, which of their tables. Every
  // step is a history entry, so Back from a bill opened on a salesperson's
  // ledger lands on that ledger — it used to land on the list of people.
  const searchParams = useSearchParams()
  const here = useMemo(() => readWorkbenchLocation(searchParams), [searchParams])
  const { tab, personId, view } = here
  // The search box, brand and order are typed here and written into the URL
  // as they change (a replace, not a new entry), so the entry Back returns to
  // carries them too. A step through history onto another table picks up
  // that entry's own.
  const [query, setQueryValue] = useState(here.query)
  const [brand, setBrandValue] = useState(here.brand)
  const [sort, setSortValue] = useState<LedgerSort>(here.sort)
  const [filtersOf, setFiltersOf] = useState(here)
  if (!sameWorkbenchView(filtersOf, here)) {
    setFiltersOf(here)
    setQueryValue(here.query)
    setBrandValue(here.brand)
    setSortValue(here.sort)
  }
  const [picks, setPicks] = useState<OpenBillTag[] | null>(null)
  const [picksSource, setPicksSource] = useState<string | null>(null)
  const [currentTeam, setCurrentTeam] = useState(false)
  const [previewFeatures, setPreviewFeatures] = useState<{ kpi?: boolean; openBill?: boolean; margin?: boolean }>({})
  const [showExcluded, setShowExcluded] = useState(false)
  const [showAllOpen, setShowAllOpen] = useState(false)
  const [hidden, setHidden] = useState<Column[]>(['location'])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [billDone, setBillDone] = useState<BillMenuOutcome | null>(null)
  // The ledger's own button is the real Don't count too (user 2026-09-27): it
  // answers on the same notice, with the same Undo, as the right-click menu.
  const [billPending, startBill] = useTransition()
  const [billBusy, setBillBusy] = useState<string | null>(null)
  const [saving, startSaving] = useTransition()
  const [hydrated, setHydrated] = useState(false)
  const restoredKey = useRef('')
  const storageKey = `commission-draft:${sub}:${period}`
  // Which columns are showing, and whether the bills taken out by hand are: kept for
  // the month so a return from a bill finds the table laid out as it was left.
  const layoutKey = `commission-layout:${sub}:${period}`
  const tags = picks ?? data.input.openBillTags
  const sourceFingerprint = tagFingerprint(data.input.openBillTags)
  const stalePicks = picks !== null && picksSource !== sourceFingerprint
  const locked = runStatus === 'applied' || runStatus === 'locked'

  useEffect(() => {
    if (restoredKey.current === storageKey) return
    restoredKey.current = storageKey
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (raw) {
        const draft = JSON.parse(raw)
        const ids = new Set(data.input.orders.map(o => o.id))
        if (Array.isArray(draft.picks)) {
          if (draft.picksSource === sourceFingerprint) {
            setPicks(draft.picks.filter((pick: OpenBillTag) => ids.has(pick.orderId) && [1, 2, 3].includes(pick.rank)))
            setPicksSource(draft.picksSource)
          } else setNotice('Saved Open Bill picks changed since this draft. Its Open Bill edits were discarded; other draft settings were restored.')
        }
        if (typeof draft.currentTeam === 'boolean') setCurrentTeam(draft.currentTeam)
        if (draft.previewFeatures && typeof draft.previewFeatures === 'object') setPreviewFeatures(Object.fromEntries(Object.entries(draft.previewFeatures).filter(([key, value]) => ['kpi', 'openBill', 'margin'].includes(key) && typeof value === 'boolean')))
      }
      const layout = JSON.parse(sessionStorage.getItem(layoutKey) ?? 'null')
      if (Array.isArray(layout?.hidden)) setHidden(layout.hidden.filter((key: unknown) => COLUMNS.some(([column]) => column === key)))
      if (typeof layout?.showExcluded === 'boolean') setShowExcluded(layout.showExcluded)
    } catch { /* Storage is optional; the table still works in memory. */ }
    setHydrated(true)
  }, [storageKey, layoutKey, data.input.orders, sourceFingerprint])

  useEffect(() => {
    if (hydrated) {
      try { sessionStorage.setItem(storageKey, JSON.stringify({ picks, picksSource, currentTeam, previewFeatures })) } catch { /* private mode */ }
    }
  }, [storageKey, picks, picksSource, currentTeam, previewFeatures, hydrated])

  useEffect(() => {
    if (hydrated) {
      try { sessionStorage.setItem(layoutKey, JSON.stringify({ hidden, showExcluded })) } catch { /* private mode */ }
    }
  }, [layoutKey, hidden, showExcluded, hydrated])

  useEffect(() => {
    if (!picks) return
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [picks])

  const effectiveInput = useMemo(() => ({ ...data.input,
    ...(currentTeam ? data.currentRules : {}),
    hierarchy: currentTeam ? data.currentHierarchy : data.input.hierarchy,
    scheme: { ...data.input.scheme,
      enableKpi: previewFeatures.kpi ?? data.input.scheme.enableKpi,
      enableOpenBill: previewFeatures.openBill ?? data.input.scheme.enableOpenBill,
      enableMarginIncentive: previewFeatures.margin ?? data.input.scheme.enableMarginIncentive,
      enableMarginPenalty: previewFeatures.margin ?? data.input.scheme.enableMarginPenalty,
    },
  }), [data, currentTeam, previewFeatures])
  const board = useMemo(() => buildCommissionWorkbench(effectiveInput, {
    people: data.people, orders: data.orders, openBillTags: tags,
  }), [data, effectiveInput, tags])
  // What sending would put in payroll: the month as saved — no unsaved picks
  // or previews. The server works out the same.
  const drafting = picks !== null || currentTeam || Object.keys(previewFeatures).length > 0
  const sendBoard = useMemo(() => drafting
    ? buildCommissionWorkbench(data.input, { people: data.people, orders: data.orders })
    : board, [drafting, data, board])
  const payrollView = useMemo(() => {
    if (!payroll) return null
    const names = new Map(data.people.map(p => [p.staffId, p.name]))
    const inPayroll = runStatus === 'applied' || runStatus === 'locked'
    return payrollState({
      status: (runStatus as RunStatus | null) ?? null,
      sent: inPayroll ? {
        total: sum(savedTotals, row => row.total),
        byStaff: new Map(savedTotals.map(row => [row.staffId, row.total])),
      } : null,
      sentAt: payroll.sentAt,
      settledBefore: payroll.settledBefore,
      payrollClosed: payroll.payrollClosed,
    }, {
      total: sendBoard.result.totalCommission,
      byStaff: new Map(sendBoard.result.statements.map(st => [st.staffId, st.totalCommission])),
      blockers: nameWarnings([...unmatchedWarnings(data.unmatchedOrderNos), ...sendBoard.result.warnings], id => names.get(id)),
    })
  }, [payroll, data, runStatus, savedTotals, sendBoard])
  const selected = board.people.find(p => p.staffId === personId)
  const isPersonView = tab === 'sales' && !!selected
  const workspaceRef = useRef<HTMLElement>(null)
  // Back to a ledger lands on the row it was left at, not at its top: the
  // portal scrolls `main` and the table scrolls in its frame, and the browser
  // restores neither by itself.
  useEntryScroll(workspaceRef, `${tab}|${personId ?? ''}|${view}`, `.${s.tableScroll}`)
  const saved = savedTotals.find(p => p.staffId === personId)
  const salarySource = data.payRows.find(p => p.staffId === personId)
  const salary = selected && salarySource ? computeRevenuePay({ ...salarySource.input,
    commission: selected.totalCommission + salarySource.commissionElsewhere + salarySource.payrollAdjustment,
  }) : null
  const openEnabled = effectiveInput.scheme.enableOpenBill
  const hasOpen = openEnabled || tags.length > 0
  const isVisible = (key: Column) => !hidden.includes(key) && (key !== 'open' || hasOpen)
  const columns = COLUMNS.filter(([key]) => isVisible(key))
  const brands = [...new Set(board.personalRows.flatMap(r => r.brands))].sort()
  const carriedCount = new Set(data.input.orders.filter(o => !o.upsale && o.periodMonth !== period).map(o => o.id)).size
  const upsaleCount = new Set(data.input.orders.filter(o => o.upsale).map(o => o.id)).size
  const people = board.people.filter(p => p.name.toLowerCase().includes(query.trim().toLowerCase()))
  const totals = {
    kpiQty: board.kpi.reduce((total, p) => total + p.soldQty, 0),
    kpiBase: sum(board.people, p => (p.statement?.kpiBase ?? 0)),
    kpiTotal: sum(board.people, p => (p.statement?.kpiCommission ?? 0)),
    open: sum(board.people, p => (p.statement?.openBillBonus ?? 0)),
    margin: sum(board.people, p => (p.statement?.marginIncentive ?? 0)),
  }

  // What the deposit gate is holding (2026-09-26): the engine's own verdict on
  // each bill, and how much of each deposit is still to come in. A shared bill
  // is held once per holder, each on their part — the parts add back to it.
  const threshold = effectiveInput.scheme.depositThresholdPct
  const held = board.personalRows.filter(r => r.status === 'deposit_pending')
  const depositOf = (row: CommissionOrderRow) => {
    const required = depositRequired(row.orderTotal, threshold)
    return { required, short: Math.max(0, Math.round((required - row.paidAmount) * 100) / 100) }
  }
  const heldTotals = {
    bills: new Set(held.map(r => r.orderId)).size,
    sales: sum(held, r => r.orderTotal),
    paid: sum(held, r => r.paidAmount),
    short: sum(held, r => depositOf(r).short),
  }
  const personHeld = held.filter(r => r.staffId === personId)
  const personNotCounted = personId ? notCounted.filter(b => b.staffId === personId) : []
  const depositNote = threshold == null
    ? 'This scheme has no deposit gate — every bill counts in the month it is written.'
    : `Below ${pct(threshold)} of the order total, so none of the commission is released yet. Nothing is lost — each one pays in the month its deposit clears.`
  const venueTotals = { bills: venues.reduce((a, v) => a + v.orders, 0), total: sum(venues, v => v.total), commissionable: sum(venues, v => v.commissionable) }
  const venueQuery = query.trim().toLowerCase()
  const shownVenues = venues.filter(v => !venueQuery || [v.displayName, v.event, v.organizer].some(x => x?.toLowerCase().includes(venueQuery)))
  const badges: Record<Tab, ReactNode> = {
    sales: new Set(data.input.orders.filter(o => !o.upsale && o.periodMonth === period).map(o => o.id)).size,
    kpi: quantity(totals.kpiQty),
    open: new Set(tags.map(t => t.orderId)).size,
    deposit: heldTotals.bills,
    venue: venues.length,
  }
  // The run's promotion preview rides on the title it would change (it lived
  // on the saved-run table until that table went, 2026-09-26).
  const rankName = (key: string) => data.input.ranks.find(r => r.rankKey === key)?.label ?? key
  // A Revenue Director is above the ladder: no rank to show, and by rule their
  // own bills earn nothing (2026-09-27) — say that rather than a blank "0%".
  const heads = new Set(data.input.departmentHeadIds ?? [])
  const titleName = (id: string) => data.input.ranks.find(r => r.titleId === id)?.titleLabel ?? 'a higher title'

  /**
   * Moves the workbench: a new table is a new history entry (so Back steps
   * out of it), a new search, brand or order on the same table replaces the
   * entry it is on. Keys the workbench does not own stay in the URL. Next
   * picks the change up through `useSearchParams` without a round trip.
   * Returns whether the URL changed.
   */
  function go(to: WorkbenchLocation, how: 'push' | 'replace' = 'push'): boolean {
    const url = workbenchSearch(window.location.search, to) || window.location.pathname
    if (new URL(url, window.location.href).href === window.location.href) return false
    if (how === 'push') {
      setBillDone(null)
      window.history.pushState(null, '', url)
    } else {
      window.history.replaceState(null, '', url)
    }
    return true
  }
  const fresh = { query: '', brand: '', sort }
  function navigate(next: Tab) { go({ tab: next, personId: null, view: 'personal', ...fresh }) }
  // A name clicked in a list opens their ledger at its top; a ledger reached
  // through history keeps the scroll the browser gives it back.
  const scrollToPerson = useRef(false)
  function choosePerson(id: string, startView: LedgerView = 'personal') {
    setNotice('')
    scrollToPerson.current = go({ tab: 'sales', personId: id, view: startView, ...fresh })
  }
  function backToPeople() { go({ tab: 'sales', personId: null, view: 'personal', ...fresh }) }
  function showLedger(next: LedgerView) { go({ ...here, view: next, query, brand, sort }) }
  function setQuery(value: string) { setQueryValue(value); go({ ...here, query: value, brand, sort }, 'replace') }
  function setBrand(value: string) { setBrandValue(value); go({ ...here, query, brand: value, sort }, 'replace') }
  function setSort(value: LedgerSort) { setSortValue(value); go({ ...here, query, brand, sort: value }, 'replace') }
  useEffect(() => {
    if (personId && scrollToPerson.current) workspaceRef.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
    scrollToPerson.current = false
  }, [personId])

  // A bill opened from here carries the way back to exactly here (`?from=`):
  // its page then offers "← ANTHONY" rather than only All bills.
  const returnHere = useMemo(() => {
    const qs = searchParams.toString()
    return `/revenue/${sub}/${period}${qs ? `?${qs}` : ''}`
  }, [searchParams, sub, period])
  const orderHref = (row: { periodMonth: string; orderId: string }) => billHref(sub, row.periodMonth, row.orderId, returnHere)

  // Right-click a bill on a ledger (2026-09-27): All bills' menu — open it, or
  // *Don't count this bill*, which takes it out of the month for good (until
  // somebody counts it again) — the same as the ledger's own button beside it.
  const billMenu = useBillMenu<CommissionOrderRow | OverrideOrderRow>(row => row.key, orderHref)
  const lockedMonths = new Set(lockedPeriods)
  const monthLabel = monthName(period)
  function countActionFor(row: CommissionOrderRow): BillCountAction {
    // Every bill on a ledger is live: an excluded one is not in the engine's input.
    return billCountAction(
      { cancelled: false, excludedReason: null, erpStatus: null, erpOnHold: false, excludedByHand: false },
      { runLocked: lockedMonths.has(row.periodMonth), monthLabel: monthName(row.periodMonth) },
    )
  }
  function billMenuDone(outcome: BillMenuOutcome) {
    billMenu.closeMenu()
    setBillDone(outcome.result.changed ? outcome : null)
  }
  /** The first cell of a bill's row: its number, the notes under it, and its ⋯. */
  function billCell(row: CommissionOrderRow | OverrideOrderRow, notes: ReactNode) {
    // An upsale or a drop is not a bill: nothing to open, nothing to take out.
    if (row.upsale) return <><span>{row.orderNo}</span>{notes}</>
    return <div className={s.billCell}>
      <div><Link href={orderHref(row)}>{row.orderNo}</Link>{notes}</div>
      <button type="button" className={s.rowMenuButton} aria-haspopup="menu" data-bill-menu-trigger
        aria-expanded={billMenu.isOpenOn(row)} aria-label={`Actions for ${row.orderNo}`}
        title="Actions — or right-click the bill" onClick={event => billMenu.onMenuButton(event.currentTarget, row)}>
        ⋯
      </button>
    </div>
  }
  function dontCount(row: CommissionOrderRow | OverrideOrderRow) {
    setError(''); setNotice(''); setBillDone(null); setBillBusy(row.orderId)
    startBill(async () => {
      try {
        const result = await excludeOrder(row.orderId, null)
        setBillDone(result.changed ? { orderId: row.orderId, orderNo: row.orderNo, excluded: true, result } : null)
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'That bill could not be taken out.'
        if (!message.includes('NEXT_REDIRECT')) setError(message)
      } finally { setBillBusy(null) }
    })
  }
  function countAgain(bill: NotCountedBill) {
    setError(''); setNotice(''); setBillDone(null); setBillBusy(bill.orderId)
    startBill(async () => {
      try {
        const result = await includeOrder(bill.orderId)
        setBillDone(result.changed ? { orderId: bill.orderId, orderNo: bill.orderNo, excluded: false, result } : null)
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'That bill could not be counted again.'
        if (!message.includes('NEXT_REDIRECT')) setError(message)
      } finally { setBillBusy(null) }
    })
  }
  function changePick(orderId: string, rank: 1 | 2 | 3 | null) {
    const order = data.input.orders.find(o => o.id === orderId)
    if (!order || order.upsale) return
    if (picks === null) setPicksSource(sourceFingerprint)
    const conflicting = new Set(data.input.orders.filter(o => o.staffId === order.staffId && o.eventDate === order.eventDate).map(o => o.id))
    setPicks(current => {
      const remaining = (current ?? data.input.openBillTags).filter(t => t.orderId !== orderId && !(rank && conflicting.has(t.orderId) && t.rank === rank))
      return rank ? [...remaining, { orderId, rank: rank }] : remaining
    })
    setNotice('Open Bill draft recalculated across all salespeople. Save picks to keep this allocation.')
  }
  function savePicks() {
    if (!data.input.scheme.enableOpenBill || stalePicks) return
    setError(''); setNotice('')
    startSaving(async () => {
      const before = new Map(data.input.openBillTags.map(t => [t.orderId, t.rank]))
      const after = new Map(tags.map(t => [t.orderId, t.rank]))
      const changed = [...new Set([...before.keys(), ...after.keys()])].filter(id => before.get(id) !== after.get(id))
      try {
        await saveOpenBillPicks(changed.map(orderId => ({ orderId, before: before.get(orderId) ?? null, after: after.get(orderId) ?? null })))
        setPicks(null)
        setPicksSource(null)
        setNotice('Open Bill picks saved. Payroll changes only when the month is sent — the payroll bar above.')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save picks. Refresh before retrying.')
      }
    })
  }
  function reset() { setPicks(null); setPicksSource(null); setCurrentTeam(false); setPreviewFeatures({}); setNotice('Draft reset to the current source orders.'); setError('') }
  function matches(row: CommissionOrderRow | OverrideOrderRow) {
    const q = query.trim().toLowerCase()
    return (!brand || row.brands.includes(brand)) && (!q || [row.orderNo, row.staffName, row.venue, row.organizer, row.eventName, ...row.brands, ...row.categories].some(v => v?.toLowerCase().includes(q)))
  }
  function pickControl(row: CommissionOrderRow) {
    const order = data.input.orders.find(o => o.id === row.orderId)
    return <div className="flex items-center gap-2">
      <input type="checkbox" aria-label={`Open Bill ${row.orderNo}`} checked={row.openBillRank != null}
        disabled={!openEnabled || locked || saving || !!order?.upsale}
        onChange={e => changePick(row.orderId, e.target.checked ? 1 : null)} />
      {row.openBillRank != null && <select aria-label={`Open Bill rank ${row.orderNo}`} value={row.openBillRank}
        disabled={!openEnabled || locked || saving} onChange={e => changePick(row.orderId, Number(e.target.value) as 1 | 2 | 3)}>
        <option value="1">1st</option><option value="2">2nd</option><option value="3">3rd</option>
      </select>}
      <span>{money(row.openBillBonus)}</span>
    </div>
  }
  function cell(row: CommissionOrderRow | OverrideOrderRow, key: Column, overriding: boolean) {
    const own = row as CommissionOrderRow
    switch (key) {
      case 'date': return row.orderDate
      case 'venue': return row.venue || <span className={s.muted}>Not linked</span>
      case 'event': return <>{row.eventName || row.eventDate}</>
      case 'organizer': return row.organizer || <span className={s.muted}>Not linked</span>
      case 'location': return row.location || '—'
      case 'brand': return row.brands.join(', ') || 'Unclassified'
      case 'category': return row.categories.join(', ') || '—'
      case 'sales': return money(row.orderTotal)
      case 'commissionable': return <>{money(row.commissionableValue)}<NoCommission amount={row.orderTotal - row.commissionableValue} /></>
      case 'margin': return row.upsale ? 'Not applicable' : <>{pct(row.marginPct)}<small className={s.muted}>{row.marginCost == null ? 'Cost incomplete' : money(row.marginRevenue - row.marginCost)}</small></>
      case 'rank': return overriding ? <>{(row as OverrideOrderRow).downlineTitle}<small>{(row as OverrideOrderRow).downlineRank}</small></>
        : <>{selected?.titleLabel}<small>{selected?.rankLabel} · {pct(own.productRate)}</small></>
      case 'product': return overriding ? money((row as OverrideOrderRow).overrideBasis) : <>{money(own.productCommission)}<small title={own.penaltyWithheld > 0 ? 'Includes the margin penalty on product commission and Open Bill bonus.' : undefined}>{pct(own.productRate)}{own.penaltyWithheld > 0 ? ` · −${money(own.penaltyWithheld)} total bill cut` : ''}</small></>
      case 'kpi': return overriding ? '—' : <>{money(own.kpiBase)}<small className={own.kpiBonus ? s.positive : s.muted}>+ {money(own.kpiBonus)} · {pct(own.kpiThresholdPct)} bonus</small></>
      case 'incentive': return overriding ? '—' : <>{money(own.marginIncentive)}<small className={s.muted}>Monthly allocation</small></>
      case 'open': return overriding ? '—' : pickControl(own)
    }
  }
  function orderTable(rows: (CommissionOrderRow | OverrideOrderRow)[], overriding: boolean) {
    const filtered = rows.filter(matches)
      .sort((a, b) => (sort === 'commission_desc' ? b.totalCommission - a.totalCommission : sort === 'date_desc' ? b.orderDate.localeCompare(a.orderDate) : a.orderDate.localeCompare(b.orderDate)) || a.orderNo.localeCompare(b.orderNo))
    const visibleColumns = columns.filter(([key]) => !overriding || !['kpi', 'incentive', 'open'].includes(key))
    return <div className={s.tableFrame} key={overriding ? 'overriding' : 'personal'}>
      <div className={s.tableScroll} role="region" aria-label={`${overriding ? 'Overriding' : 'Personal'} commission table, scroll horizontally`} tabIndex={0}>
        <table className={s.table} aria-label={overriding ? 'Overriding commission by downline order' : 'Personal commission by sales order'}>
          <thead><tr><th className={s.stickyFirst}>Sales order</th>{overriding && <th>Downline</th>}
            {visibleColumns.map(([key, label]) => <th key={key} title={key === 'sales' ? SALES_VALUE_HINT : key === 'commissionable' ? COMMISSIONABLE_HINT : undefined}>{overriding && key === 'product' ? 'Override basis' : label}</th>)}
            <th>Review</th><th className={s.stickyTotal}>Total commission</th></tr></thead>
          <tbody>{filtered.map((row, i) => <tr key={`${row.orderId}:${overriding ? (row as OverrideOrderRow).downlineStaffId : row.staffId}:${i}`}
            onContextMenu={row.upsale ? undefined : event => billMenu.onRowContextMenu(event, row)}>
            <td className={s.stickyFirst}>{billCell(row, <>
              {row.periodMonth !== period && <small>Carried from {row.periodMonth.slice(0, 7)}</small>}
              {!overriding && <small>{statusLabel[(row as CommissionOrderRow).status]}</small>}</>)}</td>
            {overriding && <td>{(row as OverrideOrderRow).downlineName}</td>}
            {visibleColumns.map(([key]) => <td key={key} className={NUMERIC_COLUMNS.includes(key) ? s.numeric : undefined}>{cell(row, key, overriding)}</td>)}
            <td>{row.upsale ? <span className={s.muted}>Not a bill</span>
              : <button type="button" className={s.ghostButton} disabled={lockedMonths.has(row.periodMonth) || billPending}
                title={lockedMonths.has(row.periodMonth) ? `${monthName(row.periodMonth)} is in payroll — take it back before a bill can leave it` : 'Take this bill out of the commission; it stays out whatever the ERP sends next'}
                onClick={() => dontCount(row)}>{billBusy === row.orderId ? 'Taking out…' : 'Don’t count'}</button>}</td>
            <td className={s.stickyTotal}>{money(row.totalCommission)}{overriding && <small>{pct((row as OverrideOrderRow).overrideRate)} overriding</small>}</td>
          </tr>)}</tbody>
          <tfoot><tr><td className={s.stickyFirst}>Visible subtotal</td><td colSpan={visibleColumns.length + (overriding ? 2 : 1)}>{filtered.length} sales orders</td><td className={s.stickyTotal}>{money(sum(filtered, r => r.totalCommission))}</td></tr></tfoot>
        </table>
        {!filtered.length && <div className={s.empty}>No sales orders match this view.</div>}
      </div>
      <div className={s.tableFooter}><span>{filtered.length} of {rows.length} rows · Scroll left / right to inspect the full sales line</span><span>Total commission stays visible →</span></div>
    </div>
  }
  /** Bills the deposit gate is holding — the whole team's, or one person's (`withPerson` false). */
  function depositTable(rows: CommissionOrderRow[], withPerson: boolean) {
    const filtered = rows.filter(matches)
      .sort((a, b) => a.orderDate.localeCompare(b.orderDate) || a.orderNo.localeCompare(b.orderNo) || a.staffName.localeCompare(b.staffName))
    const shared = new Set(rows.filter((r, i) => rows.findIndex(x => x.orderId === r.orderId) !== i).map(r => r.orderId)).size > 0
    return <div className={s.tableFrame} key={withPerson ? 'deposit-team' : 'deposit-person'}>
      <div className={s.tableScroll} role="region" aria-label="Orders below deposit, scroll horizontally" tabIndex={0}>
        <table className={s.table} aria-label={withPerson ? 'Orders below deposit' : `${selected?.name ?? 'Salesperson'} orders below deposit`}>
          <thead><tr><th className={s.stickyFirst}>Sales order</th>{withPerson && <th>Sales person</th>}<th>Date</th><th>Venue</th>
            <th title={SALES_VALUE_HINT}>Sales value</th><th title={COMMISSIONABLE_HINT}>Commissionable value</th>
            <th>Paid</th><th title={DEPOSIT_HINT}>Deposit needed</th><th className={s.stickyTotal}>Still to collect</th></tr></thead>
          <tbody>{filtered.map(row => {
            const { required, short } = depositOf(row)
            return <tr key={row.key} onContextMenu={event => billMenu.onRowContextMenu(event, row)}>
              <td className={s.stickyFirst}>{billCell(row, row.periodMonth !== period && <small>Carried from {row.periodMonth.slice(0, 7)}</small>)}</td>
              {withPerson && <td><button type="button" className={s.ghostButton} onClick={() => choosePerson(row.staffId, 'deposit')}>{row.staffName}</button></td>}
              <td>{row.orderDate}</td>
              <td>{row.venue || <span className={s.muted}>Not linked</span>}{row.eventName && <small>{row.eventName}</small>}</td>
              <td className={s.numeric}>{money(row.orderTotal)}</td>
              <td className={s.numeric}>{money(row.commissionableValue)}<NoCommission amount={row.orderTotal - row.commissionableValue} /></td>
              <td className={s.numeric}>{money(row.paidAmount)}<small className={s.muted}>{pct(row.orderTotal > 0 ? row.paidAmount / row.orderTotal : null)} of the bill</small></td>
              <td className={s.numeric}>{money(required)}<small className={s.muted}>{pct(threshold)} of the bill</small></td>
              <td className={s.stickyTotal}>{money(short)}</td>
            </tr>
          })}</tbody>
          <tfoot><tr><td className={s.stickyFirst}>Visible subtotal</td><td colSpan={withPerson ? 7 : 6}>{filtered.length} sales orders</td><td className={s.stickyTotal}>{money(sum(filtered, r => depositOf(r).short))}</td></tr></tfoot>
        </table>
        {!filtered.length && <div className={s.empty}>{rows.length ? 'No sales orders match this view.' : 'Every bill has met its deposit.'}</div>}
      </div>
      <div className={s.tableFooter}><span>{filtered.length} of {rows.length} rows{shared ? ' · Shared bills show each holder’s part' : ''}</span><span>Still to collect stays visible →</span></div>
    </div>
  }

  const feedback = <>
    {notice && isPersonView && <p className={s.notice} role="status">{notice}</p>}
    {billDone && <BillCountNotice key={`${billDone.orderId}:${billDone.excluded}`} outcome={billDone} monthLabel={monthLabel}
      hasRun={runStatus !== null} className={s.notice} buttonClassName={s.ghostButton} onChange={setBillDone} />}
    {error && <p className={s.warning} role="alert">{error}</p>}
    {stalePicks && <p className={s.warning} role="alert">Saved Open Bill picks changed while this draft was open. Reset draft to use the latest picks before saving.</p>}
    {picks && <div className={s.toolbar}><button className={s.primaryButton} disabled={saving || locked || stalePicks || !data.input.scheme.enableOpenBill} onClick={savePicks}>{saving ? 'Saving…' : 'Save Open Bill picks'}</button><span className={s.muted}>{data.input.scheme.enableOpenBill ? 'Unsaved until you save them — payroll is unchanged.' : 'Open Bill is preview-only while switched off for this month. Switch it on under This month pays, in the payroll bar, before saving picks.'}</span></div>}
  </>

  return <section ref={workspaceRef} className={s.workspace} aria-label="Commission workbench">
    {!isPersonView && <>
    {monthOverview}
    <CommissionMonthSummary stats={monthStats} peopleCount={board.people.length} totalCommission={board.totalCommission}
      status={currentTeam ? 'Current team preview' : data.input.hierarchy.length === 0 ? 'Rank history not set' : picks || Object.keys(previewFeatures).length ? 'Draft calculation' : 'Live calculation'} />
    {payroll && payrollView && <PayrollBar period={period} monthLabel={payroll.monthLabel} subDepartmentId={payroll.subDepartmentId}
      runId={payroll.runId} state={payrollView} draft={drafting} switches={payroll.switches} />}
    <div className={s.tabs} role="tablist" aria-label="Commission views">
      {TABS.map(([key, text]) =>
        <button type="button" role="tab" aria-selected={tab === key} aria-controls={`commission-panel-${key}`} id={`commission-tab-${key}`} key={key}
          onClick={() => navigate(key)} className={tab === key ? s.activeTab : undefined}>{text}<span className={s.badge}>{badges[key]}</span></button>)}
    </div>
    <div className={tab === 'sales' ? s.reviewToolbar : undefined}>
    {tab === 'sales' && <input className={s.search} placeholder="Search salesperson…" aria-label="Search salesperson" value={query} onChange={e => setQuery(e.target.value)} />}
    <details className={tab === 'sales' ? s.reviewControls : s.monthSettings}><summary>Review settings</summary>
    <div>
    <div className={s.topLine}><span className={s.badge}>Live calculation · {period.slice(0, 7)}</span><span className={s.muted}>Same Revenue Team rules as Arena</span><Link href={`/revenue/${sub}/rules`}>View rules ↗</Link></div>
    {data.input.hierarchy.length === 0 && !currentTeam && <p className={s.warning}>No team ranks are effective in {period.slice(0, 7)}. Product commission and overriding need an effective rank. Other configured incentives may still apply. You can try the current team below without changing history.</p>}
    <details className={s.rules}><summary>Calculation setup · KPI {effectiveInput.scheme.enableKpi ? 'on' : 'off'} · Open Bill {openEnabled ? 'on' : 'off'} · Margin {effectiveInput.scheme.enableMarginIncentive ? 'on' : 'off'}</summary>
      {(carriedCount > 0 || upsaleCount > 0) && <p>The month’s sales figures above stay unchanged. This commission calculation also includes {carriedCount} carried orders and {upsaleCount} recorded upsales.</p>}
      <p>Try the configured incentives in this preview — nothing is saved. What the month really pays is set under This month pays, in the payroll bar above, and in <Link href={`/revenue/${sub}/rules`}>Revenue Rules</Link>.</p>
      <div className={s.chips}>
        {data.currentHierarchy.length > 0 && <label className={s.chip}><input type="checkbox" checked={currentTeam} onChange={e => setCurrentTeam(e.target.checked)} />Use current team & dated rules for preview</label>}
        <label className={s.chip}><input type="checkbox" checked={effectiveInput.scheme.enableKpi} onChange={e => setPreviewFeatures(p => ({ ...p, kpi: e.target.checked }))} />KPI incentive</label>
        <label className={s.chip}><input type="checkbox" checked={openEnabled} onChange={e => setPreviewFeatures(p => ({ ...p, openBill: e.target.checked }))} />Open Bill incentive</label>
        <label className={s.chip}><input type="checkbox" checked={effectiveInput.scheme.enableMarginIncentive} onChange={e => setPreviewFeatures(p => ({ ...p, margin: e.target.checked }))} />Margin incentive & penalty</label>
      </div>
    </details>
    {drafting && <div className={s.notice} role="status"><span>{[currentTeam && 'Current team preview', Object.keys(previewFeatures).length > 0 && 'Draft incentive settings', picks && 'Open Bill picks changed'].filter(Boolean).join(' · ')}. Payroll is unchanged.</span><button className={s.ghostButton} onClick={reset}>Reset draft</button></div>}
    </div>
    </details>
    </div>
    </>}
    {notice && !isPersonView && <p className={s.notice} role="status">{notice}</p>}
    {!isPersonView && feedback}

    <div role={isPersonView ? undefined : "tabpanel"} id={`commission-panel-${tab}`} aria-labelledby={isPersonView ? undefined : `commission-tab-${tab}`}>
    {tab === 'sales' && !selected && <>
      <div className={s.tableFrame}><div className={s.tableScroll}><table className={s.table} aria-label="Salesperson commission summary">
        <thead><tr><th className={s.stickyFirst}>Sales person</th><th>Title / rank</th><th>Orders</th>
          <th title={SALES_VALUE_HINT}>Sales value</th><th title={COMMISSIONABLE_HINT}>Commissionable value</th>
          <th title={GROUP_SALES_HINT}>Group sales</th>
          <th title={UPSELL_HINT}>Upsell</th><th title={DROP_HINT}>Drop sales</th>
          <th>Margin</th><th>Personal</th><th>Overriding</th><th className={s.stickyTotal}>Total commission</th></tr></thead>
        <tbody>{people.map(p => {
          const counted = p.personalRows.filter(r => r.status !== 'excluded')
          // Bills, and beside them what was added to or dropped from settled
          // ones (2026-09-26) — neither is a bill, so neither is an order.
          const bills = counted.filter(r => !r.upsale)
          const salesValue = sum(bills, r => r.orderTotal)
          const commissionable = sum(bills, r => r.commissionableValue)
          const upsell = sum(counted.filter(r => r.upsale && r.orderTotal > 0), r => r.orderTotal)
          const dropped = sum(counted.filter(r => r.upsale && r.orderTotal < 0), r => r.orderTotal)
          const qualifies = p.statement?.qualifiesForRankKey && p.statement.qualifiesForRankKey !== p.statement.effectiveRankKey
            ? p.statement.qualifiesForRankKey : null
          const promotes = p.statement?.promotesToTitleId ?? null
          return <tr key={p.staffId}><td className={s.stickyFirst}><button className={s.ghostButton} onClick={() => choosePerson(p.staffId)}>{p.name} <span aria-hidden>↗</span></button></td>
          <td>{heads.has(p.staffId) ? <>{HEAD_TITLE}<small>{HEAD_NOTE}</small></> : <>{p.titleLabel}<small>{p.rankLabel} · {pct(p.productRate)}</small></>}
            {qualifies && <small><span className={s.badge}>Qualifies for {rankName(qualifies)}</span></small>}
            {promotes && <small><span className={s.badge}>{locked ? `Title raised to ${titleName(promotes)}` : `Title → ${titleName(promotes)} when sent`}</span></small>}</td>
          <td>{bills.length}</td>
          <td className={s.numeric}>{money(salesValue)}</td>
          <td className={s.numeric}>{money(commissionable)}<NoCommission amount={salesValue - commissionable} /></td>
          <td className={s.numeric}>{p.statement ? money(p.statement.groupRevenue) : <span className={s.muted}>—</span>}</td>
          <td className={s.numeric}>{upsell ? money(upsell) : <span className={s.muted}>—</span>}</td>
          <td className={s.numeric}>{dropped ? <span className="neg">{money(dropped)}</span> : <span className={s.muted}>—</span>}</td>
          <td className={s.numeric}>{pct(p.statement?.marginPct)}<small>{p.statement?.marginPct == null ? 'Cost incomplete' : money(p.statement?.marginRevenue - p.statement?.marginCost)}</small></td>
          <td className={s.numeric}>{money(p.personalTotal)}</td><td className={s.numeric}>{money(p.overrideTotal)}</td><td className={s.stickyTotal}><button className={s.ghostButton} onClick={() => choosePerson(p.staffId)}>{money(p.totalCommission)}</button>{p.monthlyGroupIncentive > 0 && <small>Includes {money(p.monthlyGroupIncentive)} group reward</small>}</td></tr>
        })}</tbody>
        <tfoot><tr><td colSpan={11}>All salespeople · total commission</td><td className={s.stickyTotal}>{money(board.totalCommission)}</td></tr></tfoot>
      </table></div></div>
      {!people.length && <p className={s.empty}>No salespeople found.</p>}
    </>}

    {tab === 'sales' && selected && <>
      <nav className={s.breadcrumb} aria-label="Commission navigation"><button onClick={backToPeople}>← Sales people</button><span>/</span><span>{selected.name}</span></nav>
      <div className={s.personHeader}>
        <div className={s.personHeroTop}><span className={s.eyebrow}>COMMISSION · {new Date(`${period}T00:00:00Z`).toLocaleDateString('en-MY', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span><span className={s.heroStatus}>{currentTeam ? 'Current team preview' : data.input.hierarchy.length === 0 ? 'Rank history not set' : picks || Object.keys(previewFeatures).length ? 'Draft calculation' : 'Monthly calculation'}</span></div>
        <div className={s.personHeroBody}><div className={s.avatar}>{selected.name.slice(0, 2)}</div><div className={s.personIdentity}><h2>{selected.name}</h2><p>{heads.has(selected.staffId)
          ? <>{HEAD_TITLE}<span>{HEAD_NOTE}</span></>
          : <>{selected.titleLabel ?? 'Title unassigned'}<span>{selected.rankLabel ?? 'Rank unassigned'} · {pct(selected.productRate)}</span></>}</p></div>
          <div className={s.overviewTotal}><span>Total commission</span><strong>{money(selected.totalCommission)}</strong><small>Personal + overriding{selected.monthlyGroupIncentive ? ` + ${money(selected.monthlyGroupIncentive)} group reward` : ''}</small></div>
        </div>
      </div>
      <div className={s.summaryGrid}>
        <Summary label="Personal commission" value={money(selected.personalTotal)} />
        <Summary label="Overriding commission" value={money(selected.overrideTotal)} />
        <Summary label="Monthly margin" value={pct(selected.statement?.marginPct)} note={selected.statement?.marginPct == null ? 'Cost incomplete' : `${money(selected.statement?.marginRevenue - selected.statement?.marginCost)} margin`} />
        <Summary label="Estimated take-home pay" value={salary ? money(salary.net) : 'Not available'} note={salary ? 'Based on current commission' : data.payUnavailable ? 'Salary preview is unavailable for this session' : 'Payroll inputs are not set for this person'} />
      </div>

      {/* What payroll holds for them — only a month that was sent holds anything (2026-09-27). */}
      <div className={s.topLine}><span className={s.muted}>{locked
        ? <>In payroll: {money(saved?.total ?? 0)}{Math.abs((saved?.total ?? 0) - selected.totalCommission) >= .01 ? ` · Difference ${money(selected.totalCommission - (saved?.total ?? 0))}` : ''}</>
        : 'Not in payroll yet'}</span>
        {locked && saved && <Link href={`/revenue/${sub}/${period}/pay/${selected.staffId}`}>Payroll breakdown ↗</Link>}</div>
      <div className={s.tabs} role="tablist" aria-label="Salesperson commission type">
        <button role="tab" aria-selected={view === 'personal'} className={view === 'personal' ? s.activeTab : undefined} onClick={() => showLedger('personal')}>Personal <span className={s.badge}>{selected.personalRows.length}</span></button>
        <button role="tab" aria-selected={view === 'overriding'} className={view === 'overriding' ? s.activeTab : undefined} onClick={() => showLedger('overriding')}>Overriding <span className={s.badge}>{selected.overridingRows.length}</span></button>
        <button role="tab" aria-selected={view === 'deposit'} className={view === 'deposit' ? s.activeTab : undefined} onClick={() => showLedger('deposit')}>Below deposit <span className={s.badge}>{personHeld.length}</span></button>
      </div>
      {view === 'deposit' && <p className={`${s.subtitle} ${s.tabNote}`}>{depositNote}</p>}
      <div className={s.toolbar}><input className={s.search} aria-label="Search sales orders" placeholder="Search order, venue or brand…" value={query} onChange={e => setQuery(e.target.value)} />
        <select aria-label="Filter brand" value={brand} onChange={e => setBrand(e.target.value)}><option value="">All brands</option>{brands.map(b => <option key={b}>{b}</option>)}</select>
        {view !== 'deposit' && <select aria-label="Sort sales orders" value={sort} onChange={e => setSort(e.target.value as LedgerSort)}><option value="date_asc">Date · oldest first</option><option value="date_desc">Date · newest first</option><option value="commission_desc">Commission · highest first</option></select>}
        {view !== 'deposit' && <label className={s.chip}><input type="checkbox" checked={showExcluded} onChange={e => setShowExcluded(e.target.checked)} />Show not counted ({personNotCounted.length})</label>}
        {drafting && <details className={s.editMenu}><summary className={s.button}>Review edits</summary><div className={s.editOptions}>
          <p className={s.muted}>Preview changes only. Payroll is unchanged.</p>
          <button className={s.ghostButton} onClick={reset}>Reset draft</button>
        </div></details>}
        {view !== 'deposit' && <details className={s.columnsMenu}><summary className={s.button}>Columns</summary><div className={s.columnOptions}>{COLUMNS.map(([key, label]) => <label key={key}><input type="checkbox" checked={!hidden.includes(key)} onChange={() => setHidden(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key])} />{label}</label>)}<small>Sales order & total always visible</small></div></details>}
      </div>
      {feedback}
      {view === 'personal' ? orderTable(selected.personalRows, false) : view === 'overriding' ? orderTable(selected.overridingRows, true) : depositTable(personHeld, false)}
      {view !== 'deposit' && showExcluded && <div className={`${s.tableFrame} ${s.notCounted}`}>
        <div className={s.tableScroll}><table className={s.table} aria-label={`${selected.name} bills not counted`}>
          <thead><tr><th className={s.stickyFirst}>Not counted</th><th>Date</th><th title={SALES_VALUE_HINT}>Sales value</th><th>Count</th></tr></thead>
          <tbody>{personNotCounted.map(b => <tr key={b.orderId}>
            <td className={s.stickyFirst}><Link href={orderHref({ periodMonth: period, orderId: b.orderId })}>{b.orderNo}</Link><small>Taken out by hand</small></td>
            <td>{b.orderDate}</td>
            <td className={s.numeric}>{money(b.orderTotal)}</td>
            <td><button type="button" className={s.ghostButton} disabled={lockedMonths.has(period) || billPending}
              title={lockedMonths.has(period) ? `${monthLabel} is in payroll — take it back before a bill can return to it` : undefined}
              onClick={() => countAgain(b)}>{billBusy === b.orderId ? 'Counting…' : 'Count again'}</button></td>
          </tr>)}</tbody>
        </table>
        {!personNotCounted.length && <div className={s.empty}>Every bill of theirs this month counts.</div>}
        </div>
      </div>}
      <div className={s.footerTotal}>{view === 'deposit'
        ? <><span>Still to collect · {personHeld.length} {personHeld.length === 1 ? 'bill' : 'bills'} below deposit</span><strong>{money(sum(personHeld, r => depositOf(r).short))}</strong></>
        : <><span>{view === 'personal' ? 'Personal commission' : 'Overriding commission'} · all included orders</span><strong>{money(view === 'personal' ? selected.personalTotal : selected.overrideTotal)}</strong></>}</div>
      {/* The salary this month comes to — and, from its pencil, the pay lines
          HR adds to it (2026-09-27). Keyed so one person's unsaved lines never
          follow the page to the next person. */}
      <SalaryCalculation key={selected.staffId} staffName={selected.name} period={period} commission={selected.totalCommission}
        source={salarySource} payUnavailable={data.payUnavailable} closedReason={data.payLinesClosed ?? null} />
    </>}

    {tab === 'kpi' && <>
      <div className={s.topLine}><div><h2 className={s.sectionHeading}>KPI across the team</h2><p className={s.subtitle}>Qualifying item quantities and commission expense for every salesperson.</p></div></div>
      {!effectiveInput.scheme.enableKpi && <p className={s.notice}>KPI payout is switched off in this scheme. Configured KPI sales are listed; payable expense is zero.</p>}
      {effectiveInput.kpiItems.length === 0 && <p className={s.warning}>No KPI items are configured for this date. <Link href={`/revenue/${sub}/rules`}>Set the product codes and per-item amounts in Rules</Link> to calculate quantities and expenses.</p>}
      <div className={s.summaryGrid}><Summary label="KPI items" value={quantity(totals.kpiQty)} /><Summary label="Base expense" value={money(totals.kpiBase)} /><Summary label="Threshold bonus" value={money(totals.kpiTotal - totals.kpiBase)} /><Summary label="Total KPI expense" value={money(totals.kpiTotal)} /></div>
      <div className={s.tableFrame}><div className={s.tableScroll}><table className={s.table} aria-label="KPI expense by salesperson"><thead><tr><th>Sales person</th><th>Title / rank</th><th>KPI items</th><th>Base amount</th><th>Threshold bonus</th><th className={s.stickyTotal}>Total KPI expense</th></tr></thead><tbody>{board.people.map(p => <tr key={p.staffId}><td><button className={s.ghostButton} onClick={() => choosePerson(p.staffId)}>{p.name} ↗</button></td><td>{p.titleLabel}<small>{p.rankLabel}</small></td><td>{quantity(board.kpi.find(k => k.staffId === p.staffId)?.soldQty ?? 0)}<small>{quantity(p.statement?.kpiQty ?? 0)} payable · {quantity(board.kpi.find(k => k.staffId === p.staffId)?.heldQty ?? 0)} held</small></td><td className={s.numeric}>{money((p.statement?.kpiBase ?? 0))}</td><td className={s.numeric}>+ {money((p.statement?.kpiCommission ?? 0) - (p.statement?.kpiBase ?? 0))}<small>{pct(p.statement?.kpiThresholdPct)}</small></td><td className={s.stickyTotal}>{money((p.statement?.kpiCommission ?? 0))}</td></tr>)}</tbody><tfoot><tr><td colSpan={5}>Total KPI expense</td><td className={s.stickyTotal}>{money(totals.kpiTotal)}</td></tr></tfoot></table></div></div>
    </>}

    {tab === 'open' && <>
      <div className={s.topLine}><div><h2 className={s.sectionHeading}>Open Bill allocation</h2><p className={s.subtitle}>Review every selected bill across the team. One rank per salesperson, per event day.</p></div><div className={s.overviewTotal}><span>Total Open Bill bonus</span><strong>{money(totals.open)}</strong></div></div>
      {!openEnabled && <p className={s.notice}>Open Bill payout is switched off for this month. Saved picks remain visible and pay zero.</p>}
      {locked && <p className={s.notice}>This month is in payroll. Take it back — the payroll bar above — before changing Open Bill picks.</p>}
      <div className={s.toolbar}><input className={s.search} aria-label="Search Open Bill orders" placeholder="Search order or salesperson…" value={query} onChange={e => setQuery(e.target.value)} /><label className={s.chip}><input type="checkbox" checked={showAllOpen} onChange={e => setShowAllOpen(e.target.checked)} />Show all orders to add picks</label></div>
      <div className={s.tableFrame}><div className={s.tableScroll}><table className={s.table} aria-label="Open Bill orders"><thead><tr><th className={s.stickyFirst}>Sales order</th><th>Sales person</th><th>Event date</th><th>Venue</th><th>Brand / category</th><th>Sales value</th><th>Open Bill selection</th><th>Rate</th><th>Status</th><th className={s.stickyTotal}>Allocated bonus</th></tr></thead><tbody>{board.personalRows.filter(r => (showAllOpen || r.openBillRank != null) && matches(r)).map(r => <tr key={`${r.orderId}:${r.staffId}`}><td className={s.stickyFirst}>{r.orderNo}</td><td><button className={s.ghostButton} onClick={() => choosePerson(r.staffId)}>{r.staffName}</button></td><td>{r.eventDate}</td><td>{r.venue || '—'}</td><td>{r.brands.join(', ')}<small>{r.categories.join(', ')}</small></td><td className={s.numeric}>{money(r.orderTotal)}</td><td>{pickControl(r)}</td><td>{pct(r.openBillRate)}</td><td>{statusLabel[r.status]}</td><td className={s.stickyTotal}>{money(r.openBillBonus)}</td></tr>)}</tbody></table></div><div className={s.tableFooter}>Shared bills show each holder’s allocated part. All parts reconcile to the total bonus.</div></div>
      <div className={s.footerTotal}><span>All selected bills · allocated bonus</span><strong>{money(totals.open)}</strong></div>
    </>}

    {tab === 'deposit' && <>
      <div className={s.topLine}><div><h2 className={s.sectionHeading}>Waiting on a deposit</h2><p className={s.subtitle}>{depositNote}</p></div></div>
      <div className={s.summaryGrid}>
        <Summary label="Bills below deposit" value={String(heldTotals.bills)} />
        <Summary label="Sales value held" value={money(heldTotals.sales)} />
        <Summary label="Paid so far" value={money(heldTotals.paid)} />
        <Summary label="Still to collect" value={money(heldTotals.short)} note="To bring every held bill up to its deposit" />
      </div>
      <div className={s.toolbar}><input className={s.search} aria-label="Search orders below deposit" placeholder="Search order, salesperson or venue…" value={query} onChange={e => setQuery(e.target.value)} /></div>
      {depositTable(held, true)}
      <div className={s.footerTotal}><span>All bills below deposit · still to collect</span><strong>{money(heldTotals.short)}</strong></div>
    </>}

    {tab === 'venue' && <>
      <div className={s.topLine}><div><h2 className={s.sectionHeading}>Sales by venue</h2><p className={s.subtitle}>Every bill of the month at the fair it was written at. The venue, the days and the organiser come with the bill from the ERP, where the salesperson picks the event — nothing is picked here. A venue that held two fairs this month has a row for each; bills no fair claims are grouped by venue, and are placed by fixing the event on the order in the ERP.</p></div>
        <div className={s.overviewTotal}><span>Total sales value</span><strong>{money(venueTotals.total)}</strong></div></div>
      <div className={s.toolbar}><input className={s.search} aria-label="Search venues" placeholder="Search venue or organizer…" value={query} onChange={e => setQuery(e.target.value)} /></div>
      <div className={s.tableFrame}><div className={s.tableScroll} role="region" aria-label="Sales by venue, scroll horizontally" tabIndex={0}><table className={s.table} aria-label="Sales by venue">
        <thead><tr><th className={s.stickyFirst}>Venue</th><th>Event</th><th>Organizer</th><th>Salespeople</th><th>Bills</th><th className={s.stickyTotal} title={SALES_VALUE_HINT}>Sales value</th></tr></thead>
        <tbody>{shownVenues.map(v => <tr key={v.key}>
          <td className={s.stickyFirst}><Link href={`/revenue/${sub}/${period}/orders?venue=${encodeURIComponent(v.venueKey)}`}>{v.displayName}</Link></td>
          <td>{v.event || <span className={s.muted}>{v.fairId ? 'Dates not set' : 'Not linked'}</span>}</td>
          <td>{v.organizer || <span className={s.muted}>Not linked</span>}</td>
          <td>{v.people}</td><td>{v.orders}</td>
          <td className={s.stickyTotal}>{money(v.total)}<NoCommission amount={v.total - v.commissionable} /></td>
        </tr>)}</tbody>
        <tfoot><tr><td className={s.stickyFirst}>{shownVenues.length < venues.length ? 'Visible venues' : 'All venues'}</td><td colSpan={3}>{shownVenues.length} {shownVenues.length === 1 ? 'row' : 'rows'}</td><td>{shownVenues.reduce((a, v) => a + v.orders, 0)}</td><td className={s.stickyTotal}>{money(sum(shownVenues, v => v.total))}</td></tr></tfoot>
      </table>
      {!shownVenues.length && <div className={s.empty}>{venues.length ? 'No venues match this search.' : 'No bills this month.'}</div>}
      </div><div className={s.tableFooter}><span>{venueTotals.bills} bills · {money(venueTotals.commissionable)} of it earns commission</span><span>A venue opens every bill written there →</span></div></div>
    </>}
    </div>

    {billMenu.menu && <BillContextMenu
      bill={{
        orderId: billMenu.menu.row.orderId,
        orderNo: billMenu.menu.row.orderNo,
        href: orderHref(billMenu.menu.row),
        who: billMenu.menu.row.staffName,
        action: countActionFor(billMenu.menu.row),
        exclusionDetail: null,
      }}
      anchor={billMenu.menu.anchor} link={billMenu.menu.link} byRightClick={billMenu.menu.byRightClick} monthLabel={monthLabel}
      onClose={billMenu.closeMenu} onDone={billMenuDone} />}
  </section>
}

function Summary({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className={s.summary}><span className={s.summaryLabel}>{label}</span><strong className={s.summaryValue}>{value}</strong>{note && <small>{note}</small>}</div>
}




