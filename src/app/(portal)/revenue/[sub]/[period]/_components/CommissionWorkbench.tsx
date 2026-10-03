'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { buildCommissionWorkbench, type CommissionOrderRow, type OverrideOrderRow, type WorkbenchPerson } from '@/lib/commission/workbench'
import { closeDrift, nextOpenPerson, salespersonFigures, type CloseDrift, type SalespersonClose, type SalespersonFigures } from '@/lib/commission/closes'
import { unpricedBills, unpricedByStaff } from '@/lib/commission/unpriced'
import { depositRequired } from '@/lib/commission/engine'
import { billCountAction, type BillCountAction } from '@/lib/commission/bill-exclusion'
import {
  billHref, readWorkbenchLocation, sameWorkbenchView, workbenchSearch,
  type LedgerSort, type LedgerView, type WorkbenchLocation, type WorkbenchTab,
} from '@/lib/commission/workbench-nav'
import { formatMoney } from '@/lib/utils'
import { computeRevenuePay } from '@/lib/revenue-pay'
import { personPayLinesLock } from '@/lib/revenue-pay-lines'
import { brandLabel, exhibitionQuery, NO_BRAND, type ExhibitionSales } from '@/lib/exhibitions'
import type { OpenBillTag } from '@/lib/commission/types'
import type { CommissionWorkbenchData } from '../../../_lib/commission-workbench'
import { excludeOrder, includeOrder, saveOpenBillPicks } from '../../../run-actions'
import { nameWarnings, payrollState, unmatchedWarnings, type RunStatus } from '@/lib/commission/payroll-send'
import { useEntryScroll } from '@/components/layout/useEntryScroll'
import BillContextMenu, { type BillBrandOutcome, type BillMenuOutcome, type BillShareOutcome } from '../orders/_components/BillContextMenu'
import BillCountNotice from '../orders/_components/BillCountNotice'
import BillShareNotice from '../orders/_components/BillShareNotice'
import { billBrandAction, brandOutcomeMessage, type BrandOption } from '@/lib/commission/bill-brand'
import { billShareAction, sharePct, type BillShareAction, type ShareCandidate, type ShareHolder } from '@/lib/commission/bill-share'
import { useBillMenu } from '../orders/_components/useBillMenu'
import CommissionMonthSummary, { type CommissionMonthStats } from './CommissionMonthSummary'
import SalaryCalculation from './SalaryCalculation'
import NoCommission, { COMMISSIONABLE_HINT, DEPOSIT_HINT, DROP_HINT, GROUP_SALES_HINT, SALES_VALUE_HINT, UPSELL_HINT } from './NoCommission'
import CloseBar from './CloseBar'
import PayrollBar from './PayrollBar'
import DirectorPayNote from './DirectorPayNote'
import PersonCloseControl from './PersonCloseControl'
import UnpricedBillsNotice from './UnpricedBillsNotice'
import PaperRefCell from './PaperRefCell'
import { useSalespersonCloses } from './useSalespersonCloses'
import { SheetIcon } from '@/components/sheet/SheetIcon'
import s from './commission-workbench.module.css'
import c from './close-controls.module.css'

type Tab = WorkbenchTab
const TABS: [Tab, string][] = [
  ['sales', 'Total Sales Orders'], ['kpi', 'KPI Items'], ['open', 'Open Bill'],
  // Sales exhibition (2026-10-03) — Sales by venue until the user said a result
  // is read by BRAND at a venue, organiser and date, not by the venue.
  ['deposit', 'Below deposit'], ['exhibition', 'Sales exhibition'],
  // The month's two review panels, above the cards until 2026-09-30 (user:
  // 把这两个 move 去 … 让它们形成两个 tab). Drawn only when the page hands them over.
  ['changes', 'Drops & upsells'], ['claims', 'Double claims'],
]
/** The tabs that are the page's panels rather than cuts of the workbench's own board. */
const REVIEW_TABS: readonly Tab[] = ['changes', 'claims']
type Column = 'ref' | 'salesperson' | 'date' | 'venue' | 'event' | 'organizer' | 'location' | 'brand' | 'category' | 'sales' | 'commissionable' | 'margin' | 'rank' | 'product' | 'kpi' | 'incentive' | 'open'
// Sales person (2026-09-30): the one column a person's own ledger rarely
// needs — until a bill is shared, and then it names both holders.
// Ref No. (2026-10-03): the handwritten bill's number beside the ERP's — the
// one a bill is checked back against, and the one double claims match on.
const COLUMNS: [Column, string][] = [
  ['ref', 'Ref No.'], ['salesperson', 'Sales person'], ['date', 'Date'], ['venue', 'Venue'], ['event', 'Event'], ['organizer', 'Organizer'],
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
// A Revenue Director with a rung (2026-09-27): paid that rate on their own
// bills and nothing more — never an override.
const DIRECTOR_NOTE = 'own bills only · no override'

/**
 * What the payroll bar needs from the server beside the run itself
 * (2026-09-27). Absent on a page that sends nothing — the bar is not drawn.
 */
export interface PayrollBarFacts {
  /** "September 2026". */
  monthLabel: string
  sentAt: string | null
  /** "September 2026" — the first month the portal pays — for a month settled by hand. */
  settledBefore: string | null
  /** Why the month's payroll can take no more commission (`commission_payroll_closed`), or null. */
  payrollClosed: string | null
}

/**
 * A panel the month page builds on the server and hands over as a tab of its
 * own (2026-09-30): what it shows, and how many things in it wait on a person
 * — the count on the tab.
 */
export interface ReviewTab {
  panel: ReactNode
  count: number
}

/** A bill of the month taken out by hand (`excluded_reason = 'manual'`). */
export interface NotCountedBill {
  orderId: string
  orderNo: string
  /** The ERP's Ref No. and the paper number read from it (`paper-ref.ts`). */
  refNo?: string | null
  paperNo?: string | null
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
   * The month's bills by the exhibition they were written at — a brand at a
   * fair (`lib/exhibitions.ts`). Every live bill, matched or not, so the tab
   * adds up to the Total sales value card.
   */
  exhibitions?: ExhibitionSales[]
  monthOverview?: ReactNode
  payroll?: PayrollBarFacts
  /**
   * What the month pays — the scheme's real switches (`SchemeSwitches`), in
   * Review settings. The one set since 2026-09-28: the payroll bar's foot held
   * them and Review settings held preview-only copies that saved nothing
   * (user: 保留一个就好).
   */
  switches?: ReactNode
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
  /**
   * *Brand for the margin* on a bill's right-click (2026-09-27): the brands a
   * bill with none can be given, and which bills were given theirs here.
   */
  brandMenu?: { options: readonly BrandOption[]; picked: Readonly<Record<string, string>> } | null
  /**
   * Closing salespeople's month (2026-09-27): who is closed, and whether this
   * month can be closed at all. Absent: no ticks, bar or Close button.
   */
  closes?: CloseFacts
  /**
   * *Share this bill…* on a bill's right-click (2026-09-30): the
   * sub-department's team, whom a bill may be shared with. Absent: no row.
   */
  shareTeam?: readonly { staffId: string; name: string }[]
  /**
   * The month's review panels as tabs at the end of the rail (2026-09-30):
   * *Drops & upsells* — what the ERP changed on settled bills, and bills of
   * another month's fair — and *Double claims*, each group with the reasons
   * it was flagged and its bills' history. They sat stacked above the month's
   * cards until then. A tab whose panel is absent is not drawn.
   */
  reviews?: { changes?: ReviewTab; claims?: ReviewTab }
}

/** What the month page hands over for closing salespeople. */
export interface CloseFacts {
  subDepartmentId: string
  closes: SalespersonClose[]
  /** Why nobody in this month can be closed (a month settled by hand), or null. */
  unavailable: string | null
}

/** One line of the list of salespeople: live, or as it stood when closed. */
interface ListRow {
  staffId: string
  /** The live calculation's person; null for somebody closed who has since left the month. */
  person: WorkbenchPerson | null
  /** What the row shows — the close's figures once closed. */
  figures: SalespersonFigures
  close: SalespersonClose | undefined
  /** Closed, and the live month has moved since. */
  drift: CloseDrift | null
}

export default function CommissionWorkbench({ data, sub, period, runStatus, savedTotals, monthStats, exhibitions = [], monthOverview, payroll, switches, notCounted = [], lockedPeriods = [], brandMenu = null, closes: closeFacts, shareTeam, reviews }: Props) {
  const router = useRouter()
  // Where the workbench stands is the URL's (2026-09-27, lib/commission/
  // workbench-nav.ts): which cut, whose ledger, which of their tables. Every
  // step is a history entry, so Back from a bill opened on a salesperson's
  // ledger lands on that ledger — it used to land on the list of people.
  const searchParams = useSearchParams()
  const here = useMemo(() => readWorkbenchLocation(searchParams), [searchParams])
  const reviewOf = (key: Tab): ReviewTab | undefined => key === 'changes' ? reviews?.changes : key === 'claims' ? reviews?.claims : undefined
  const drawn = (key: Tab) => !REVIEW_TABS.includes(key) || reviewOf(key) !== undefined
  // A link to a review tab this page does not draw opens on the month's first view.
  const tab: Tab = drawn(here.tab) ? here.tab : 'sales'
  const { personId, view } = here
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
  const [showExcluded, setShowExcluded] = useState(false)
  const [showAllOpen, setShowAllOpen] = useState(false)
  const [hidden, setHidden] = useState<Column[]>(['location'])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [billDone, setBillDone] = useState<BillMenuOutcome | null>(null)
  const [brandDone, setBrandDone] = useState<string | null>(null)
  const [shareDone, setShareDone] = useState<BillShareOutcome | null>(null)
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
        // A draft saved before 2026-09-28 may still carry `previewFeatures` —
        // the incentive toggles that saved nothing. They are gone; so is it.
      }
      const layout = JSON.parse(sessionStorage.getItem(layoutKey) ?? 'null')
      if (Array.isArray(layout?.hidden)) setHidden(layout.hidden.filter((key: unknown) => COLUMNS.some(([column]) => column === key)))
      if (typeof layout?.showExcluded === 'boolean') setShowExcluded(layout.showExcluded)
    } catch { /* Storage is optional; the table still works in memory. */ }
    setHydrated(true)
  }, [storageKey, layoutKey, data.input.orders, sourceFingerprint])

  useEffect(() => {
    if (hydrated) {
      try { sessionStorage.setItem(storageKey, JSON.stringify({ picks, picksSource, currentTeam })) } catch { /* private mode */ }
    }
  }, [storageKey, picks, picksSource, currentTeam, hydrated])

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

  // What the month pays is the scheme's own switches, as saved (Review settings
  // › This month pays): a switch there is saved, and the page follows it with
  // the refresh. Only the current-team preview reads anything else.
  const effectiveInput = useMemo(() => ({ ...data.input,
    ...(currentTeam ? data.currentRules : {}),
    hierarchy: currentTeam ? data.currentHierarchy : data.input.hierarchy,
  }), [data, currentTeam])
  const board = useMemo(() => buildCommissionWorkbench(effectiveInput, {
    people: data.people, orders: data.orders, openBillTags: tags,
  }), [data, effectiveInput, tags])
  // What sending would put in payroll: the month as saved — no unsaved picks
  // or previews. The server works out the same.
  const drafting = picks !== null || currentTeam
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

  // ── Closing salespeople's month (2026-09-27) ───────────────────────────
  // A closed person's row shows what was locked; the live figure only rides
  // along when it has moved since. A close always locks the month AS SAVED,
  // so nobody can be closed while a draft is on screen.
  const listIds = useMemo(() => [...new Set([...board.people.map(p => p.staffId), ...(closeFacts?.closes ?? []).map(c => c.staffId)])], [board, closeFacts])
  const closer = useSalespersonCloses({ subDepartmentId: closeFacts?.subDepartmentId ?? '', period, closes: closeFacts?.closes ?? [],
    scope: `/revenue/${sub}/${period}`, staffIds: listIds })
  const monthLabel = monthName(period)
  // `drafting` (above) — unsaved picks or previews — is exactly what a close must not lock.
  const closeBlocked = closeFacts?.unavailable
    ?? (data.input.hierarchy.length === 0 ? `No team ranks are effective in ${monthLabel} — set them before closing anybody.`
      : drafting ? 'A close locks the month as saved — save the Open Bill picks, or reset the preview, first.' : null)
  const listRows: ListRow[] = useMemo(() => {
    const live = board.people.map(person => {
      const close = closer.closedById.get(person.staffId)
      return { staffId: person.staffId, person, close,
        figures: close ? close.summary : salespersonFigures(person),
        drift: close ? closeDrift(close, person) : null }
    })
    const onMonth = new Set(live.map(r => r.staffId))
    const gone = [...closer.closedById.values()].filter(close => !onMonth.has(close.staffId))
      .map(close => ({ staffId: close.staffId, person: null, close, figures: close.summary, drift: closeDrift(close, null) }))
    return [...live, ...gone].sort((a, b) => a.figures.name.localeCompare(b.figures.name))
  }, [board, closer.closedById])
  const listTotal = sum(listRows, r => r.figures.total)
  const selectedClose = selected ? closer.closedById.get(selected.staffId) : undefined
  // A director's terms here (Rules › Directors, 2026-09-27): the note above
  // their ledger says what the month pays them beside their own bills.
  const selectedDirector = selected
    ? (data.input.directors ?? []).find(d => d.staffId === selected.staffId && (d.fixedAmount > 0 || d.incentiveAmount > 0))
    : undefined
  const selectedDrift = selected && selectedClose ? closeDrift(selectedClose, selected) : null
  const openOrder = listRows.map(r => r.staffId)
  const nextId = selected ? nextOpenPerson(openOrder, selected.staffId, new Set(closer.closedById.keys())) : null
  const nextName = nextId ? listRows.find(r => r.staffId === nextId)?.figures.name ?? null : null
  // Bills paid on but priced RM 0 in the ERP (2026-09-27): they earn nothing
  // until the ERP has prices, so they are named before anybody is closed.
  const unpriced = useMemo(() => unpricedBills(data.input), [data.input])
  const unpricedOf = useMemo(() => unpricedByStaff(unpriced), [unpriced])
  const unpricedIds = useMemo(() => new Set(unpriced.map(bill => bill.orderId)), [unpriced])
  const staffName = (staffId: string) => data.people.find(p => p.staffId === staffId)?.name ?? staffId
  const workspaceRef = useRef<HTMLElement>(null)
  // Back to a ledger lands on the row it was left at, not at its top: the
  // portal scrolls `main` and the table scrolls in its frame, and the browser
  // restores neither by itself.
  useEntryScroll(workspaceRef, `${tab}|${personId ?? ''}|${view}`, `.${s.tableScroll}`)
  const saved = savedTotals.find(p => p.staffId === personId)
  const salarySource = data.payRows.find(p => p.staffId === personId)
  const salary = selected && salarySource ? computeRevenuePay({ ...salarySource.input,
    commission: (selectedClose?.total ?? selected.totalCommission) + salarySource.commissionElsewhere + salarySource.payrollAdjustment,
  }) : null
  const openEnabled = effectiveInput.scheme.enableOpenBill
  const hasOpen = openEnabled || tags.length > 0
  const isVisible = (key: Column) => !hidden.includes(key) && (key !== 'open' || hasOpen)
  const columns = COLUMNS.filter(([key]) => isVisible(key))
  const brands = [...new Set(board.personalRows.flatMap(r => r.brands))].sort()
  const carriedCount = new Set(data.input.orders.filter(o => !o.upsale && o.periodMonth !== period).map(o => o.id)).size
  const upsaleCount = new Set(data.input.orders.filter(o => o.upsale).map(o => o.id)).size
  const people = listRows.filter(r => r.figures.name.toLowerCase().includes(query.trim().toLowerCase()))
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
  const exhibitionTotals = { bills: exhibitions.reduce((a, x) => a + x.orders, 0), total: sum(exhibitions, x => x.total), commissionable: sum(exhibitions, x => x.commissionable) }
  // The brands on the tab, bills with none last — one brand's exhibitions at a time.
  const exhibitionBrands = [...new Set(exhibitions.map(x => x.brand))]
    .sort((a, b) => a === null ? 1 : b === null ? -1 : a.localeCompare(b))
  const exhibitionQueryText = query.trim().toLowerCase()
  const shownExhibitions = exhibitions.filter(x =>
    (!brand || (brand === NO_BRAND ? x.brand === null : x.brand === brand)) &&
    (!exhibitionQueryText || [brandLabel(x.brand), x.displayName, x.event, x.organizer].some(v => v?.toLowerCase().includes(exhibitionQueryText))))
  const badges: Record<Tab, ReactNode> = {
    sales: new Set(data.input.orders.filter(o => !o.upsale && o.periodMonth === period).map(o => o.id)).size,
    kpi: quantity(totals.kpiQty),
    open: new Set(tags.map(t => t.orderId)).size,
    deposit: heldTotals.bills,
    exhibition: exhibitions.length,
    changes: reviews?.changes?.count ?? 0,
    claims: reviews?.claims?.count ?? 0,
  }
  // A review tab's count is what waits on somebody: it stands out while it is not zero.
  const waiting = (key: Tab) => (reviewOf(key)?.count ?? 0) > 0
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
      setShareDone(null)
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
  // A shared bill (2026-09-30): the row is ONE holder's part, and a change to
  // the bill reaches every holder — so every holder's close stands in its way.
  const holdersOf = (row: CommissionOrderRow | OverrideOrderRow): ShareHolder[] =>
    row.share ? row.share.parts : [{ staffId: row.staffId, name: row.staffName, pct: 1 }]
  const partOf = (row: CommissionOrderRow | OverrideOrderRow) => row.share?.parts.find(p => p.staffId === row.staffId)?.pct ?? 1
  function closedHolder(row: CommissionOrderRow | OverrideOrderRow, doing: string): string | null {
    const closed = holdersOf(row).find(holder => closer.closedById.has(holder.staffId))
    return closed ? `${closed.name}’s ${monthLabel} is closed — reopen it before ${doing}` : null
  }
  /** Whose bill a shared row is, said from the row's own holder. */
  function shareNote(row: CommissionOrderRow | OverrideOrderRow): string | null {
    const share = row.share
    if (!share) return null
    return row.staffId === share.ownerStaffId
      ? `Shared with ${share.parts.filter(p => p.staffId !== share.ownerStaffId).map(p => p.name).join(', ')}`
      : `From ${share.ownerName}’s bill`
  }
  function countActionFor(row: CommissionOrderRow): BillCountAction {
    // A closed salesperson's bills stay as they were closed (2026-09-27) —
    // the action refuses them too; the menu says so before anybody tries.
    const closed = closedHolder(row, 'changing which bills count')
    if (closed) return { kind: 'locked', excludedByHand: false, reason: closed }
    // Every bill on a ledger is live: an excluded one is not in the engine's input.
    return billCountAction(
      { cancelled: false, excludedReason: null, erpStatus: null, erpOnHold: false, excludedByHand: false },
      { runLocked: lockedMonths.has(row.periodMonth), monthLabel: monthName(row.periodMonth) },
    )
  }
  function billMenuDone(outcome: BillMenuOutcome) {
    billMenu.closeMenu()
    setBrandDone(null)
    setShareDone(null)
    setBillDone(outcome.result.changed ? outcome : null)
  }
  // Share this bill (2026-09-30): anybody on the team, bar the owner; somebody
  // closed this month cannot take a part — their locked figure would stop
  // matching their ledger.
  const shareCandidates = useMemo<ShareCandidate[]>(() => (shareTeam ?? []).map(member => ({
    ...member, closed: closer.closedById.has(member.staffId) ? `closed for ${monthLabel}` : null,
  })), [shareTeam, closer.closedById, monthLabel])
  function shareActionFor(row: CommissionOrderRow | OverrideOrderRow): BillShareAction | null {
    if (row.upsale || !shareTeam) return null
    return billShareAction(
      { ownerStaffId: row.share?.ownerStaffId ?? row.staffId, ownerName: row.share?.ownerName ?? row.staffName, parts: holdersOf(row) },
      { runLocked: lockedMonths.has(row.periodMonth), closedReason: closedHolder(row, 'changing who shares this bill'), monthLabel: monthName(row.periodMonth) },
    )
  }
  function shareMenuDone(outcome: BillShareOutcome) {
    billMenu.closeMenu()
    setBillDone(null)
    setBrandDone(null)
    setShareDone(outcome)
  }
  // The notice's *Open NAME*: the ledger where the new part now sits, with
  // the notice still saying what happened.
  function openHolder(staffId: string) {
    const outcome = shareDone
    choosePerson(staffId)
    setShareDone(outcome)
  }
  // Brand for the margin: only a bill nothing names a brand for, or one given
  // its brand here — the same row All bills offers (2026-09-27).
  const brandOptions = brandMenu?.options ?? []
  const brandOf = new Map(data.input.orders.map(o => [o.id, o.brandCode ?? null]))
  function brandActionFor(row: CommissionOrderRow | OverrideOrderRow) {
    return billBrandAction(
      { brandCode: brandOf.get(row.orderId) ?? null, picked: brandMenu?.picked[row.orderId] ?? null, cancelled: false },
      {
        runLocked: lockedMonths.has(row.periodMonth),
        closedReason: closedHolder(row, 'changing a bill’s brand'),
        monthLabel: monthName(row.periodMonth),
        hasOptions: brandOptions.length > 0,
      },
    )
  }
  function brandMenuDone(outcome: BillBrandOutcome) {
    billMenu.closeMenu()
    setBillDone(null)
    setShareDone(null)
    const nameOf = (code: string) => brandOptions.find(o => o.code === code)?.name ?? code
    setBrandDone(outcome.result.changed ? brandOutcomeMessage(outcome.result, nameOf) : null)
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
    setError(''); setNotice(''); setBillDone(null); setShareDone(null); setBillBusy(row.orderId)
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
    setError(''); setNotice(''); setBillDone(null); setShareDone(null); setBillBusy(bill.orderId)
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
        setNotice('Open Bill picks saved. Payroll takes them as each salesperson is sent.')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save picks. Refresh before retrying.')
      }
    })
  }
  function reset() { setPicks(null); setPicksSource(null); setCurrentTeam(false); setNotice('Draft reset to the current source orders.'); setError('') }
  function matches(row: CommissionOrderRow | OverrideOrderRow) {
    const q = query.trim().toLowerCase()
    // A shared bill answers to every holder's name — ADRIAN finds the part on ANTHONY's ledger.
    return (!brand || row.brands.includes(brand)) && (!q || [row.orderNo, row.refNo, row.staffName, row.venue, row.organizer, row.eventName, ...row.brands, ...row.categories, ...(row.share?.parts.map(p => p.name) ?? [])].some(v => v?.toLowerCase().includes(q)))
  }
  function pickControl(row: CommissionOrderRow) {
    const order = data.input.orders.find(o => o.id === row.orderId)
    const closed = closedHolder(row, 'changing this pick')
    return <div className="flex items-center gap-2">
      <input type="checkbox" aria-label={`Open Bill ${row.orderNo}`} checked={row.openBillRank != null}
        disabled={!openEnabled || locked || saving || !!order?.upsale || !!closed}
        title={closed ?? undefined}
        onChange={e => changePick(row.orderId, e.target.checked ? 1 : null)} />
      {row.openBillRank != null && <select aria-label={`Open Bill rank ${row.orderNo}`} value={row.openBillRank}
        disabled={!openEnabled || locked || saving || !!closed} onChange={e => changePick(row.orderId, Number(e.target.value) as 1 | 2 | 3)}>
        <option value="1">1st</option><option value="2">2nd</option><option value="3">3rd</option>
      </select>}
      <span>{money(row.openBillBonus)}</span>
    </div>
  }
  function cell(row: CommissionOrderRow | OverrideOrderRow, key: Column, overriding: boolean) {
    const own = row as CommissionOrderRow
    switch (key) {
      // An upsale is no bill, so it has no paper of its own.
      case 'ref': return row.upsale ? <span className={s.muted}>—</span> : <PaperRefCell refNo={row.refNo} paperNo={row.paperNo} />
      // A shared bill names every holder, the owner first; the ledger's own person in bold.
      case 'salesperson': return row.share
        ? <span className={s.holders}>{row.share.parts.map(p => <span key={p.staffId} className={p.staffId === row.staffId ? s.holderSelf : undefined}>
          {p.name} <span className={s.holderPart}>{sharePct(p.pct)}</span></span>)}</span>
        : row.staffName
      case 'date': return row.orderDate
      case 'venue': return row.venue || <span className={s.muted}>Not linked</span>
      case 'event': return <>{row.eventName || row.eventDate}</>
      case 'organizer': return row.organizer || <span className={s.muted}>Not linked</span>
      case 'location': return row.location || '—'
      case 'brand': return row.brands.join(', ') || 'Unclassified'
      case 'category': return row.categories.join(', ') || '—'
      // A holder's part of a shared bill is a part of its sales — say of how much.
      case 'sales': return row.share
        ? <>{money(row.orderTotal)}<small className={s.muted}>{sharePct(partOf(row))} of {money(row.share.wholeTotal)}</small></>
        : money(row.orderTotal)
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
    // Overriding names the downline in a column of its own.
    const visibleColumns = columns.filter(([key]) => !overriding || !['salesperson', 'kpi', 'incentive', 'open'].includes(key))
    return <div className={s.tableFrame} key={overriding ? 'overriding' : 'personal'}>
      <div className={s.tableScroll} role="region" aria-label={`${overriding ? 'Overriding' : 'Personal'} commission table, scroll horizontally`} tabIndex={0}>
        <table className={s.table} aria-label={overriding ? 'Overriding commission by downline order' : 'Personal commission by sales order'}>
          <thead><tr><th className={s.stickyFirst}>Sales order</th>{overriding && <th>Downline</th>}
            {visibleColumns.map(([key, label]) => <th key={key} title={key === 'sales' ? SALES_VALUE_HINT : key === 'commissionable' ? COMMISSIONABLE_HINT : undefined}>{overriding && key === 'product' ? 'Override basis' : label}</th>)}
            <th>Review</th><th className={s.stickyTotal}>Total commission</th></tr></thead>
          <tbody>{filtered.map((row, i) => <tr key={`${row.orderId}:${overriding ? (row as OverrideOrderRow).downlineStaffId : row.staffId}:${i}`}
            onContextMenu={row.upsale ? undefined : event => billMenu.onRowContextMenu(event, row)}>
            <td className={s.stickyFirst}>{billCell(row, <>
              {row.share && <small className={s.shareNote}>{shareNote(row)}</small>}
              {row.periodMonth !== period && <small>Carried from {row.periodMonth.slice(0, 7)}</small>}
              {!overriding && <small>{statusLabel[(row as CommissionOrderRow).status]}</small>}
              {!overriding && unpricedIds.has(row.orderId) && <small className={c.unpricedNote}>Priced RM 0 in the ERP</small>}</>)}</td>
            {overriding && <td>{(row as OverrideOrderRow).downlineName}</td>}
            {visibleColumns.map(([key]) => <td key={key} className={NUMERIC_COLUMNS.includes(key) ? s.numeric : undefined}>{cell(row, key, overriding)}</td>)}
            <td>{row.upsale ? <span className={s.muted}>Not a bill</span>
              : <button type="button" className={s.ghostButton} disabled={lockedMonths.has(row.periodMonth) || billPending}
                title={lockedMonths.has(row.periodMonth) ? `${monthName(row.periodMonth)} is in payroll — a bill cannot leave it now` : 'Take this bill out of the commission; it stays out whatever the ERP sends next'}
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
          <thead><tr><th className={s.stickyFirst}>Sales order</th><th>Ref No.</th>{withPerson && <th>Sales person</th>}<th>Date</th><th>Venue</th>
            <th title={SALES_VALUE_HINT}>Sales value</th><th title={COMMISSIONABLE_HINT}>Commissionable value</th>
            <th>Paid</th><th title={DEPOSIT_HINT}>Deposit needed</th><th className={s.stickyTotal}>Still to collect</th></tr></thead>
          <tbody>{filtered.map(row => {
            const { required, short } = depositOf(row)
            return <tr key={row.key} onContextMenu={event => billMenu.onRowContextMenu(event, row)}>
              <td className={s.stickyFirst}>{billCell(row, <>
                {row.share && <small className={s.shareNote}>{shareNote(row)}</small>}
                {row.periodMonth !== period && <small>Carried from {row.periodMonth.slice(0, 7)}</small>}</>)}</td>
              <td><PaperRefCell refNo={row.refNo} paperNo={row.paperNo} /></td>
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
          <tfoot><tr><td className={s.stickyFirst}>Visible subtotal</td><td colSpan={withPerson ? 8 : 7}>{filtered.length} sales orders</td><td className={s.stickyTotal}>{money(sum(filtered, r => depositOf(r).short))}</td></tr></tfoot>
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
    {brandDone && <p className={s.notice} role="status">{brandDone}</p>}
    {shareDone && <BillShareNotice key={`${shareDone.orderId}:${shareDone.result.staffId}:${shareDone.result.after}:${shareDone.undone ? 'undone' : 'done'}`}
      outcome={shareDone} className={s.notice} buttonClassName={s.ghostButton} onChange={setShareDone}
      onOpenHolder={openHolder} currentStaffId={isPersonView ? personId : null} />}
    {error && <p className={s.warning} role="alert">{error}</p>}
    {stalePicks && <p className={s.warning} role="alert">Saved Open Bill picks changed while this draft was open. Reset draft to use the latest picks before saving.</p>}
    {picks && <div className={s.toolbar}><button className={s.primaryButton} disabled={saving || locked || stalePicks || !data.input.scheme.enableOpenBill} onClick={savePicks}>{saving ? 'Saving…' : 'Save Open Bill picks'}</button><span className={s.muted}>{data.input.scheme.enableOpenBill ? 'Unsaved until you save them — payroll is unchanged.' : 'Open Bill is switched off for this month, so these picks pay nothing and cannot be saved. Switch it on under Review settings › This month pays first.'}</span></div>}
  </>

  return <section ref={workspaceRef} className={s.workspace} aria-label="Commission workbench">
    {!isPersonView && <>
    {monthOverview}
    <CommissionMonthSummary stats={monthStats} peopleCount={board.people.length} totalCommission={board.totalCommission}
      status={currentTeam ? 'Current team preview' : data.input.hierarchy.length === 0 ? 'Rank history not set' : picks ? 'Draft calculation' : 'Live calculation'} />
    {payroll && payrollView && <PayrollBar monthLabel={payroll.monthLabel} period={period} state={payrollView} draft={drafting} />}
    <div className={s.tabs} role="tablist" aria-label="Commission views">
      {TABS.filter(([key]) => drawn(key)).map(([key, text]) =>
        <button type="button" role="tab" aria-selected={tab === key} aria-controls={`commission-panel-${key}`} id={`commission-tab-${key}`} key={key}
          onClick={() => navigate(key)} className={tab === key ? s.activeTab : undefined}>{text}<span className={waiting(key) ? `${s.badge} ${s.alertBadge}` : s.badge}>{badges[key]}</span></button>)}
    </div>
    <div className={tab === 'sales' ? s.reviewToolbar : undefined}>
    {tab === 'sales' && <input className={s.search} placeholder="Search salesperson…" aria-label="Search salesperson" value={query} onChange={e => setQuery(e.target.value)} />}
    {/* Review settings (2026-09-28): what the month pays — the scheme's real
        switches, the only set on the page — then how the figure is worked out
        and the one preview left, the current team. The KPI / Open Bill /
        Margin checkboxes that sat here were copies of the switches that saved
        nothing, and a draft of them silently turned Close off. */}
    <details className={tab === 'sales' ? s.reviewControls : s.monthSettings}><summary>Review settings{drafting && <span className={s.draftTag}>Draft</span>}</summary>
    <div>
    {switches && <div className={s.monthPays}>{switches}</div>}
    <div className={s.settingsLine}><span className={s.badge}>Live calculation · {period.slice(0, 7)}</span><span className={s.muted}>Same Revenue Team rules as Arena</span><Link href={`/revenue/${sub}/rules`}>View rules ↗</Link></div>
    {(carriedCount > 0 || upsaleCount > 0) && <p className={s.settingsNote}>The month’s sales figures above stay unchanged. This commission calculation also includes {carriedCount} carried orders and {upsaleCount} recorded upsales.</p>}
    {data.input.hierarchy.length === 0 && !currentTeam && <p className={s.warning}>No team ranks are effective in {period.slice(0, 7)}. Product commission and overriding need an effective rank. Other configured incentives may still apply. You can try the current team below without changing history.</p>}
    {data.currentHierarchy.length > 0 && <div className={s.settingsLine}><label className={s.chip}><input type="checkbox" checked={currentTeam} onChange={e => setCurrentTeam(e.target.checked)} />Use current team & dated rules for preview</label><span className={s.muted}>A preview — nothing is saved.</span></div>}
    {drafting && <div className={s.notice} role="status"><span>{[currentTeam && 'Current team preview', picks && 'Open Bill picks changed'].filter(Boolean).join(' · ')}. Payroll is unchanged.</span><button className={s.ghostButton} onClick={reset}>Reset draft</button></div>}
    </div>
    </details>
    </div>
    </>}
    {notice && !isPersonView && <p className={s.notice} role="status">{notice}</p>}
    {!isPersonView && feedback}

    <div role={isPersonView ? undefined : "tabpanel"} id={`commission-panel-${tab}`} aria-labelledby={isPersonView ? undefined : `commission-tab-${tab}`}>
    {tab === 'sales' && !selected && <>
      <UnpricedBillsNotice bills={unpriced} nameOf={staffName} hrefOf={orderHref} onPerson={id => choosePerson(id)} />
      {closeFacts && <CloseBar monthLabel={monthLabel} ticked={closer.ticked} busy={closer.busy} disabledReason={closeBlocked}
        error={closer.error} notice={closer.notice} onClearTicks={closer.clearTicks}
        rows={listRows.map(r => ({ staffId: r.staffId, name: r.figures.name, total: r.figures.total, closed: !!r.close, changed: !!r.drift,
          unpriced: unpricedOf.get(r.staffId)?.length ?? 0 }))}
        onClose={targets => closer.close(targets)} onReopen={targets => closer.reopen(targets)} />}
      <div className={s.tableFrame}><div className={s.tableScroll}><table className={s.table} aria-label="Salesperson commission summary">
        <thead><tr><th className={s.stickyFirst}>{closeFacts ? <span className={c.nameCell}><input type="checkbox" aria-label="Tick every salesperson shown"
            checked={people.length > 0 && people.every(r => closer.ticked.has(r.staffId))}
            ref={box => { if (box) box.indeterminate = people.some(r => closer.ticked.has(r.staffId)) && !people.every(r => closer.ticked.has(r.staffId)) }}
            onChange={e => closer.tickAll(people.map(r => r.staffId), e.target.checked)} />Sales person</span> : 'Sales person'}</th>
          <th>Title / rank</th><th>Orders</th>
          <th title={SALES_VALUE_HINT}>Sales value</th><th title={COMMISSIONABLE_HINT}>Commissionable value</th>
          <th title={GROUP_SALES_HINT}>Group sales</th>
          <th title={UPSELL_HINT}>Upsell</th><th title={DROP_HINT}>Drop sales</th>
          <th>Margin</th><th>Personal</th><th>Overriding</th><th className={s.stickyTotal}>Total commission</th></tr></thead>
        <tbody>{people.map(row => {
          // A closed person's row is the close's: what was checked and locked,
          // not whatever the live month says since (2026-09-27). Bills, and
          // beside them what was added to or dropped from settled ones — neither
          // of those is a bill, so neither is an order.
          const f = row.figures
          const p = row.person
          const qualifies = p?.statement?.qualifiesForRankKey && p.statement.qualifiesForRankKey !== p.statement.effectiveRankKey
            ? p.statement.qualifiesForRankKey : null
          const promotes = p?.statement?.promotesToTitleId ?? null
          const open = () => { if (p) choosePerson(p.staffId) }
          return <tr key={row.staffId} className={row.close ? c.rowClosed : undefined}><td className={s.stickyFirst}>
            <span className={c.nameCell}>{closeFacts && <input type="checkbox" aria-label={`Tick ${f.name}`} checked={closer.ticked.has(row.staffId)} onChange={() => closer.toggle(row.staffId)} />}
              <button className={s.ghostButton} onClick={open} disabled={!p}>{f.name} <span aria-hidden>↗</span></button></span>
            {row.close && <small><span className={`${c.closedTag} ${row.drift ? c.movedTag : ''}`} title={`Closed ${new Date(row.close.closedAt).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}${row.close.closedByName ? ` by ${row.close.closedByName}` : ''}`}>
              <SheetIcon name="lock" />{row.drift ? 'Closed · moved since' : 'Closed'}</span></small>}
            {(unpricedOf.get(row.staffId)?.length ?? 0) > 0 && <small><span className={`${c.closedTag} ${c.unpricedTag}`} title="Paid, but priced RM 0 in the ERP — earns nothing until the ERP has prices">
              <SheetIcon name="alert" />{unpricedOf.get(row.staffId)!.length} {unpricedOf.get(row.staffId)!.length === 1 ? 'bill' : 'bills'} RM 0</span></small>}</td>
          <td>{heads.has(row.staffId)
            ? f.rankLabel ? <>{f.titleLabel ?? HEAD_TITLE}<small>{f.rankLabel} · {pct(f.productRate)} · {DIRECTOR_NOTE}</small></> : <>{HEAD_TITLE}<small>{HEAD_NOTE}</small></>
            : <>{f.titleLabel}<small>{f.rankLabel} · {pct(f.productRate)}</small></>}
            {qualifies && <small><span className={s.badge}>Qualifies for {rankName(qualifies)}</span></small>}
            {promotes && <small><span className={s.badge}>{locked ? `Title raised to ${titleName(promotes)}` : `Title → ${titleName(promotes)} when sent`}</span></small>}</td>
          <td>{f.orders}</td>
          <td className={s.numeric}>{money(f.salesValue)}</td>
          <td className={s.numeric}>{money(f.commissionable)}<NoCommission amount={f.salesValue - f.commissionable} /></td>
          <td className={s.numeric}>{f.groupRevenue !== null ? money(f.groupRevenue) : <span className={s.muted}>—</span>}</td>
          <td className={s.numeric}>{f.upsell ? money(f.upsell) : <span className={s.muted}>—</span>}</td>
          <td className={s.numeric}>{f.dropped ? <span className="neg">{money(f.dropped)}</span> : <span className={s.muted}>—</span>}</td>
          <td className={s.numeric}>{pct(f.marginPct)}<small>{f.marginPct == null || f.marginRevenue === null || f.marginCost === null ? 'Cost incomplete' : money(f.marginRevenue - f.marginCost)}</small></td>
          <td className={s.numeric}>{money(f.personal)}</td><td className={s.numeric}>{money(f.overriding)}</td><td className={s.stickyTotal}><button className={s.ghostButton} onClick={open} disabled={!p}>{money(f.total)}</button>{f.groupIncentive > 0 && <small>Includes {money(f.groupIncentive)} group reward</small>}
            {f.directorPay > 0 && <small>Includes {money(f.directorPay)} director pay</small>}
            {row.drift && <small className={c.live}>Live now {money(row.drift.liveTotal)}</small>}</td></tr>
        })}</tbody>
        <tfoot><tr><td colSpan={11}>All salespeople · total commission{closer.closedById.size > 0 ? ' · closed at their locked figure' : ''}</td><td className={s.stickyTotal}>{money(listTotal)}</td></tr></tfoot>
      </table></div></div>
      {!people.length && <p className={s.empty}>No salespeople found.</p>}
    </>}

    {tab === 'sales' && selected && <>
      <nav className={s.breadcrumb} aria-label="Commission navigation"><button onClick={backToPeople}>← Sales people</button><span>/</span><span>{selected.name}</span></nav>
      <div className={s.personHeader}>
        <div className={s.personHeroTop}><span className={s.eyebrow}>COMMISSION · {new Date(`${period}T00:00:00Z`).toLocaleDateString('en-MY', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span><span className={s.heroStatus}>{selectedClose ? 'Closed' : currentTeam ? 'Current team preview' : data.input.hierarchy.length === 0 ? 'Rank history not set' : picks ? 'Draft calculation' : 'Monthly calculation'}</span></div>
        <div className={s.personHeroBody}><div className={s.avatar}>{selected.name.slice(0, 2)}</div><div className={s.personIdentity}><h2>{selected.name}</h2><p>{heads.has(selected.staffId)
          ? selected.rankLabel
            ? <>{selected.titleLabel ?? HEAD_TITLE}<span>{selected.rankLabel} · {pct(selected.productRate)} · {DIRECTOR_NOTE}</span></>
            : <>{HEAD_TITLE}<span>{HEAD_NOTE}</span></>
          : <>{selected.titleLabel ?? 'Title unassigned'}<span>{selected.rankLabel ?? 'Rank unassigned'} · {pct(selected.productRate)}</span></>}</p></div>
          {closeFacts && <PersonCloseControl key={selected.staffId} name={selected.name}
            unpriced={(unpricedOf.get(selected.staffId) ?? []).map(bill => bill.orderNo)} total={selected.totalCommission} monthLabel={monthLabel}
            close={selectedClose} liveTotal={selectedDrift ? selectedDrift.liveTotal : null} nextName={nextName}
            busy={closer.busy} disabledReason={closeBlocked}
            onClose={() => closer.close([{ staffId: selected.staffId, name: selected.name, total: selected.totalCommission }])}
            onCloseAndNext={() => closer.close([{ staffId: selected.staffId, name: selected.name, total: selected.totalCommission }], () => { if (nextId) choosePerson(nextId) })}
            onReopen={() => closer.reopen([{ staffId: selected.staffId, name: selected.name }])} />}
          <div className={s.overviewTotal}><span>{selectedClose ? 'Total commission · locked' : 'Total commission'}</span><strong>{money(selectedClose?.total ?? selected.totalCommission)}</strong><small>Personal + overriding{(selectedClose?.summary.groupIncentive ?? selected.monthlyGroupIncentive) ? ` + ${money(selectedClose?.summary.groupIncentive ?? selected.monthlyGroupIncentive)} group reward` : ''}{(selectedClose?.summary.directorPay ?? selected.monthlyDirectorPay) ? ` + ${money(selectedClose?.summary.directorPay ?? selected.monthlyDirectorPay)} director pay` : ''}</small></div>
        </div>
      </div>
      {(closer.notice || closer.error) && <p className={closer.error ? s.warning : s.notice} role={closer.error ? 'alert' : 'status'}>{closer.error || closer.notice}</p>}
      <UnpricedBillsNotice bills={unpricedOf.get(selected.staffId) ?? []} nameOf={staffName} hrefOf={orderHref} onPerson={id => choosePerson(id)} person={selected.name} />
      {selectedClose && selectedDrift && <div className={c.moved} role="note">
        <strong>Moved since {selected.name} was closed: {selectedDrift.delta >= 0 ? '+' : ''}{money(selectedDrift.delta)}</strong>
        The closed {money(selectedClose.total)} still stands — the bills below are live and now come to {money(selectedDrift.liveTotal)}. Reopen to take the new figure, or leave it for the payroll step to carry.
        {(selectedDrift.bills.length > 0 || selectedDrift.overrides.length > 0) && <ul>
          {selectedDrift.bills.map(b => <li key={b.id}>{b.no}: {b.closed === null ? `new · ${money(b.live ?? 0)}` : b.live === null ? `gone · was ${money(b.closed)}` : `${money(b.closed)} → ${money(b.live)}`}</li>)}
          {selectedDrift.overrides.map(o => <li key={o.staffId}>Override from {o.name}: {money(o.closed)} → {money(o.live)}</li>)}
        </ul>}
      </div>}
      <div className={s.summaryGrid}>
        <Summary label="Personal commission" value={money(selectedClose?.summary.personal ?? selected.personalTotal)} />
        <Summary label="Overriding commission" value={money(selectedClose?.summary.overriding ?? selected.overrideTotal)} />
        {selectedClose
          ? <Summary label="Monthly margin" value={pct(selectedClose.summary.marginPct)} note={selectedClose.summary.marginPct == null || selectedClose.summary.marginRevenue === null || selectedClose.summary.marginCost === null ? 'Cost incomplete' : `${money(selectedClose.summary.marginRevenue - selectedClose.summary.marginCost)} margin`} />
          : <Summary label="Monthly margin" value={pct(selected.statement?.marginPct)} note={selected.statement?.marginPct == null ? 'Cost incomplete' : `${money(selected.statement?.marginRevenue - selected.statement?.marginCost)} margin`} />}
        <Summary label="Estimated take-home pay" value={salary ? money(salary.net) : 'Not available'} note={salary ? (selectedClose ? 'Based on the closed commission' : 'Based on current commission') : data.payUnavailable ? 'Salary preview is unavailable for this session' : 'Payroll inputs are not set for this person'} />
      </div>

      {/* What payroll holds for them — only a month that was sent holds anything (2026-09-27). */}
      <div className={s.topLine}><span className={s.muted}>{locked
        ? <>In payroll: {money(saved?.total ?? 0)}{Math.abs((saved?.total ?? 0) - selected.totalCommission) >= .01 ? ` · Difference ${money(selected.totalCommission - (saved?.total ?? 0))}` : ''}</>
        : 'Not in payroll yet'}</span>
        {locked && saved && <Link href={`/revenue/${sub}/${period}/pay/${selected.staffId}`}>Payroll breakdown ↗</Link>}</div>
      {selectedDirector && <DirectorPayNote terms={selectedDirector} statement={selected.statement}
        monthValue={data.input.monthCommissionableValue ?? null} monthLabel={monthLabel} />}
      <div className={s.tabs} role="tablist" aria-label="Salesperson commission type">
        <button role="tab" aria-selected={view === 'personal'} className={view === 'personal' ? s.activeTab : undefined} onClick={() => showLedger('personal')}>Personal <span className={s.badge}>{selected.personalRows.length}</span></button>
        <button role="tab" aria-selected={view === 'overriding'} className={view === 'overriding' ? s.activeTab : undefined} onClick={() => showLedger('overriding')}>Overriding <span className={s.badge}>{selected.overridingRows.length}</span></button>
        <button role="tab" aria-selected={view === 'deposit'} className={view === 'deposit' ? s.activeTab : undefined} onClick={() => showLedger('deposit')}>Below deposit <span className={s.badge}>{personHeld.length}</span></button>
      </div>
      {view === 'deposit' && <p className={`${s.subtitle} ${s.tabNote}`}>{depositNote}</p>}
      <div className={s.toolbar}><input className={s.search} aria-label="Search sales orders" placeholder="Search order, Ref No., venue or brand…" value={query} onChange={e => setQuery(e.target.value)} />
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
          <thead><tr><th className={s.stickyFirst}>Not counted</th><th>Ref No.</th><th>Date</th><th title={SALES_VALUE_HINT}>Sales value</th><th>Count</th></tr></thead>
          <tbody>{personNotCounted.map(b => <tr key={b.orderId}>
            <td className={s.stickyFirst}><Link href={orderHref({ periodMonth: period, orderId: b.orderId })}>{b.orderNo}</Link><small>Taken out by hand</small></td>
            <td><PaperRefCell refNo={b.refNo ?? null} paperNo={b.paperNo ?? null} /></td>
            <td>{b.orderDate}</td>
            <td className={s.numeric}>{money(b.orderTotal)}</td>
            <td><button type="button" className={s.ghostButton} disabled={lockedMonths.has(period) || billPending}
              title={lockedMonths.has(period) ? `${monthLabel} is in payroll — a bill cannot return to it now` : undefined}
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
        source={salarySource} payUnavailable={data.payUnavailable}
        closedReason={data.payLinesClosed ?? personPayLinesLock(salarySource?.payrollStatus, selected.name)} />
    </>}

    {tab === 'kpi' && <>
      <div className={s.topLine}><div><h2 className={s.sectionHeading}>KPI across the team</h2><p className={s.subtitle}>Qualifying item quantities and commission expense for every salesperson.</p></div></div>
      {!effectiveInput.scheme.enableKpi && <p className={s.notice}>KPI payout is switched off in this scheme. Configured KPI sales are listed; payable expense is zero. It is switched on under Review settings › This month pays.</p>}
      {effectiveInput.kpiItems.length === 0 && <p className={s.warning}>No KPI items are configured for this date. <Link href={`/revenue/products?tab=kpi&sub=${sub}`}>Choose the SKUs and specials and their amounts on Product List › Add-on / KPI Items</Link> to calculate quantities and expenses.</p>}
      <div className={s.summaryGrid}><Summary label="KPI items" value={quantity(totals.kpiQty)} /><Summary label="Base expense" value={money(totals.kpiBase)} /><Summary label="Threshold bonus" value={money(totals.kpiTotal - totals.kpiBase)} /><Summary label="Total KPI expense" value={money(totals.kpiTotal)} /></div>
      <div className={s.tableFrame}><div className={s.tableScroll}><table className={s.table} aria-label="KPI expense by salesperson"><thead><tr><th>Sales person</th><th>Title / rank</th><th>KPI items</th><th>Base amount</th><th>Threshold bonus</th><th className={s.stickyTotal}>Total KPI expense</th></tr></thead><tbody>{board.people.map(p => <tr key={p.staffId}><td><button className={s.ghostButton} onClick={() => choosePerson(p.staffId)}>{p.name} ↗</button></td><td>{p.titleLabel}<small>{p.rankLabel}</small></td><td>{quantity(board.kpi.find(k => k.staffId === p.staffId)?.soldQty ?? 0)}<small>{quantity(p.statement?.kpiQty ?? 0)} payable · {quantity(board.kpi.find(k => k.staffId === p.staffId)?.heldQty ?? 0)} held</small></td><td className={s.numeric}>{money((p.statement?.kpiBase ?? 0))}</td><td className={s.numeric}>+ {money((p.statement?.kpiCommission ?? 0) - (p.statement?.kpiBase ?? 0))}<small>{pct(p.statement?.kpiThresholdPct)}</small></td><td className={s.stickyTotal}>{money((p.statement?.kpiCommission ?? 0))}</td></tr>)}</tbody><tfoot><tr><td colSpan={5}>Total KPI expense</td><td className={s.stickyTotal}>{money(totals.kpiTotal)}</td></tr></tfoot></table></div></div>
    </>}

    {tab === 'open' && <>
      <div className={s.topLine}><div><h2 className={s.sectionHeading}>Open Bill allocation</h2><p className={s.subtitle}>Review every selected bill across the team. One rank per salesperson, per event day.</p></div><div className={s.overviewTotal}><span>Total Open Bill bonus</span><strong>{money(totals.open)}</strong></div></div>
      {!openEnabled && <p className={s.notice}>Open Bill payout is switched off for this month. Saved picks remain visible and pay zero; picks open once it is switched on under Review settings › This month pays.</p>}
      {locked && <p className={s.notice}>This month is in payroll, so its Open Bill picks cannot change.</p>}
      <div className={s.toolbar}><input className={s.search} aria-label="Search Open Bill orders" placeholder="Search order, Ref No. or salesperson…" value={query} onChange={e => setQuery(e.target.value)} /><label className={s.chip}><input type="checkbox" checked={showAllOpen} onChange={e => setShowAllOpen(e.target.checked)} />Show all orders to add picks</label></div>
      <div className={s.tableFrame}><div className={s.tableScroll}><table className={s.table} aria-label="Open Bill orders"><thead><tr><th className={s.stickyFirst}>Sales order</th><th>Ref No.</th><th>Sales person</th><th>Event date</th><th>Venue</th><th>Brand / category</th><th>Sales value</th><th>Open Bill selection</th><th>Rate</th><th>Status</th><th className={s.stickyTotal}>Allocated bonus</th></tr></thead><tbody>{board.personalRows.filter(r => (showAllOpen || r.openBillRank != null) && matches(r)).map(r => <tr key={`${r.orderId}:${r.staffId}`}><td className={s.stickyFirst}>{r.orderNo}</td><td>{r.upsale ? <span className={s.muted}>—</span> : <PaperRefCell refNo={r.refNo} paperNo={r.paperNo} />}</td><td><button className={s.ghostButton} onClick={() => choosePerson(r.staffId)}>{r.staffName}</button></td><td>{r.eventDate}</td><td>{r.venue || '—'}</td><td>{r.brands.join(', ')}<small>{r.categories.join(', ')}</small></td><td className={s.numeric}>{money(r.orderTotal)}</td><td>{pickControl(r)}</td><td>{pct(r.openBillRate)}</td><td>{statusLabel[r.status]}</td><td className={s.stickyTotal}>{money(r.openBillBonus)}</td></tr>)}</tbody></table></div><div className={s.tableFooter}>Shared bills show each holder’s allocated part. All parts reconcile to the total bonus.</div></div>
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

    {tab === 'exhibition' && <>
      <div className={s.topLine}><div><h2 className={s.sectionHeading}>Sales exhibition</h2><p className={s.subtitle}>Every bill of the month at the exhibition it was written at. An exhibition is one brand’s booth at one fair: the same venue, organiser and days with another brand is another exhibition, the way the ERP opens one project per brand booth. A bill belongs to the booth the salesperson picked when opening it in the ERP, whatever its goods — a Dunlopillo pillow sold at the Akemi booth is Akemi’s — and a bill with no booth goes by its own brand. Nothing is picked here. Bills no fair claims are grouped by brand and venue, and are placed by fixing the event on the order in the ERP.</p></div>
        <div className={s.overviewTotal}><span>Total sales value</span><strong>{money(exhibitionTotals.total)}</strong></div></div>
      <div className={s.toolbar}>
        <input className={s.search} aria-label="Search exhibitions" placeholder="Search brand, venue or organizer…" value={query} onChange={e => setQuery(e.target.value)} />
        <select aria-label="Filter exhibitions by brand" value={brand} onChange={e => setBrand(e.target.value)}>
          <option value="">All brands</option>
          {exhibitionBrands.map(b => <option key={b ?? NO_BRAND} value={b ?? NO_BRAND}>{brandLabel(b)}</option>)}
        </select>
      </div>
      <div className={s.tableFrame}><div className={s.tableScroll} role="region" aria-label="Sales exhibition, scroll horizontally" tabIndex={0}><table className={s.table} aria-label="Sales exhibition">
        <thead><tr><th className={s.stickyFirst}>Brand</th><th>Venue</th><th>Event</th><th>Organizer</th><th>Salespeople</th><th>Bills</th><th className={s.stickyTotal} title={SALES_VALUE_HINT}>Sales value</th></tr></thead>
        <tbody>{shownExhibitions.map(x => <tr key={x.key}>
          <td className={s.stickyFirst}>{x.brand ?? <span className={s.muted}>{brandLabel(null)}</span>}</td>
          {/* The venue opens exactly this exhibition's bills on All bills. */}
          <td><Link href={`/revenue/${sub}/${period}/orders?${exhibitionQuery(x)}`}>{x.displayName}</Link></td>
          <td>{x.event || <span className={s.muted}>{x.fairId ? 'Dates not set' : 'Not linked'}</span>}</td>
          <td>{x.organizer || <span className={s.muted}>Not linked</span>}</td>
          <td>{x.people}</td><td>{x.orders}</td>
          <td className={s.stickyTotal}>{money(x.total)}<NoCommission amount={x.total - x.commissionable} /></td>
        </tr>)}</tbody>
        <tfoot><tr><td className={s.stickyFirst}>{shownExhibitions.length < exhibitions.length ? 'Visible exhibitions' : 'All exhibitions'}</td><td colSpan={4}>{shownExhibitions.length} {shownExhibitions.length === 1 ? 'exhibition' : 'exhibitions'}</td><td>{shownExhibitions.reduce((a, x) => a + x.orders, 0)}</td><td className={s.stickyTotal}>{money(sum(shownExhibitions, x => x.total))}</td></tr></tfoot>
      </table>
      {!shownExhibitions.length && <div className={s.empty}>{exhibitions.length ? 'No exhibitions match this search.' : 'No bills this month.'}</div>}
      </div><div className={s.tableFooter}><span>{exhibitionTotals.bills} bills · {money(exhibitionTotals.commissionable)} of it earns commission</span><span>A venue opens that exhibition’s bills →</span></div></div>
    </>}

    {/* The page's own panels, server-built (2026-09-30). */}
    {tab === 'changes' && reviews?.changes?.panel}
    {tab === 'claims' && reviews?.claims?.panel}
    </div>

    {billMenu.menu && <BillContextMenu
      bill={{
        orderId: billMenu.menu.row.orderId,
        orderNo: billMenu.menu.row.orderNo,
        href: orderHref(billMenu.menu.row),
        // A shared bill is every holder's: the heading names them all.
        who: holdersOf(billMenu.menu.row).map(holder => holder.name).join(' + '),
        action: countActionFor(billMenu.menu.row),
        exclusionDetail: null,
      }}
      anchor={billMenu.menu.anchor} link={billMenu.menu.link} byRightClick={billMenu.menu.byRightClick} monthLabel={monthLabel}
      brand={(() => {
        const action = brandActionFor(billMenu.menu.row)
        return action ? { action, options: brandOptions } : null
      })()}
      share={(() => {
        const action = shareActionFor(billMenu.menu.row)
        return action ? { action, candidates: shareCandidates } : null
      })()}
      onClose={billMenu.closeMenu} onDone={billMenuDone} onBrandDone={brandMenuDone} onShareDone={shareMenuDone} />}
  </section>
}

function Summary({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className={s.summary}><span className={s.summaryLabel}>{label}</span><strong className={s.summaryValue}>{value}</strong>{note && <small>{note}</small>}</div>
}




