'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { formatMoney } from '@/lib/utils'
import type { BillCountAction } from '@/lib/commission/bill-exclusion'
import { brandOutcomeMessage, type BillBrandAction, type BrandOption } from '@/lib/commission/bill-brand'
import { billShareAction, holdersOf, type BillShareAction } from '@/lib/commission/bill-share'
import s from '../../_components/commission-workbench.module.css'
import NoCommission, { COMMISSIONABLE_HINT, SALES_VALUE_HINT } from '../../_components/NoCommission'
import PaperRefCell from '../../_components/PaperRefCell'
import BillContextMenu, { type BillBrandOutcome, type BillMenuOutcome, type BillShareOutcome } from './BillContextMenu'
import BillCountNotice from './BillCountNotice'
import BillShareNotice from './BillShareNotice'
import OpenBillPicker from './OpenBillPicker'
import ShareControl, { type ShareHolder, type TeamMember } from './ShareControl'
import { useBillMenu } from './useBillMenu'

/** One bill, already resolved on the server — nothing here reads the database. */
export interface BillRow {
  orderId: string
  orderNo: string
  /**
   * The paper beside the document (2026-10-03): the ERP's Ref No. — the
   * handwritten bill's number, HC13369 on HC-SO-2609-400 — and the paper
   * number the double-claim check reads from it (`paper-ref.ts`).
   */
  refNo: string | null
  paperNo: string | null
  href: string
  orderDate: string
  eventDate: string
  sequenceInDay: number | null
  customerName: string | null
  venue: string | null
  /** The PLACE filter link; null when the bill names no venue. */
  venueHref: string | null
  /** The place's own name, only when the document spells it differently. */
  venuePlace: string | null
  eventName: string | null
  organizer: string | null
  location: string | null
  brands: string[]
  categories: string[]
  /** Everything on the bill — transport, disposal and every other charge included. */
  orderTotal: number
  /** The part of the bill that earns commission (every shared part added back). */
  commissionable: number
  paidAmount: number
  /** The deposit the gate still asks for; null once it is met. */
  depositShort: number | null
  marginPct: number | null
  marginValue: number | null
  marginKeyed: boolean
  /** The bill's standing, in words: Included / Deposit pending / why it is excluded. */
  status: string
  cancelled: boolean
  /** "Taken out by Principal on 27 Sep 2026 — duplicate", while somebody has it out by hand. */
  exclusionDetail: string | null
  /** What the row's right-click menu may do about whether the bill counts. */
  countAction: BillCountAction
  /** *Brand for the margin* on the right-click: only for a bill nothing names a brand for (2026-09-27). */
  brandAction: BillBrandAction | null
  staff: { id: string; name: string; code: string | null; href: string } | null
  /** Set when no salesperson is matched: the ERP's agent string. */
  agent: { name: string; ignored: boolean } | null
  shares: ShareHolder[]
  shareDisabled: boolean
  shareDisabledReason: string
  title: string | null
  rank: string | null
  rate: number | null
  openBill: {
    rank: 1 | 2 | 3 | null
    suggested: boolean
    disabled: boolean
    disabledReason: string
  }
  commission: { product: number; kpi: number; marginIncentive: number; openBill: number; total: number } | null
}

type Column =
  | 'ref' | 'salesperson' | 'date' | 'customer' | 'venue' | 'event' | 'organizer' | 'location' | 'brand'
  | 'category' | 'sales' | 'commissionable' | 'paid' | 'margin' | 'rank' | 'product' | 'kpi' | 'incentive' | 'open'

// Ref No. (2026-10-03, user: follow erp sales order number, but with reference
// …): the handwritten bill's number, beside the ERP's, to check a bill back.
const COLUMNS: [Column, string][] = [
  ['ref', 'Ref No.'], ['salesperson', 'Salesperson'], ['date', 'Date'], ['customer', 'Customer'], ['venue', 'Venue'],
  ['event', 'Event'], ['organizer', 'Organizer'], ['location', 'Sales location'], ['brand', 'Brand'],
  ['category', 'Category'], ['sales', 'Sales value'], ['commissionable', 'Commissionable value'],
  ['paid', 'Paid'], ['margin', 'Margin'],
  ['rank', 'Title / rank'], ['product', 'Product commission'], ['kpi', 'KPI amount'],
  ['incentive', 'Margin incentive'], ['open', 'Open Bill'],
]
const NUMERIC: Column[] = ['sales', 'commissionable', 'paid', 'margin', 'product', 'kpi', 'incentive']
const money = formatMoney
const pct = (n: number | null | undefined) => n == null ? '—' : `${(n * 100).toFixed(1).replace('.0', '')}%`
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

interface Props {
  rows: BillRow[]
  team: TeamMember[]
  /** The scheme pays Open Bill: the column carries the picker rather than a label. */
  openBillPaid: boolean
  /** Null when the live calculation could not be produced; the columns then say why. */
  commissionNote: string | null
  initialShowExcluded: boolean
  /** "September 2026". */
  monthLabel: string
  /** The month has a saved run, which taking a bill out leaves behind until it is computed again. */
  hasRun: boolean
  /** The brands a bill with none can be given by hand (2026-09-27). */
  brandOptions?: readonly BrandOption[]
}

/**
 * Every bill of the month in the salesperson ledger's format (2026-09-25) —
 * the same toolbar, sticky order / total columns and Columns menu as a
 * person's Personal table on the month page, plus the one thing a person's
 * table never needs: WHOSE bill it is. The Open Bill pick and *Share…* stay
 * on the row, because the evidence for both is the rest of the row.
 *
 * RIGHT-CLICK A BILL (2026-09-27) for its menu — open it, *Share this bill…*
 * (2026-09-30, the same write as *Share…* under the name), or *Don't count
 * this bill*, which takes it out of the month the way an ERP cancellation does
 * (`BillContextMenu`). The ⋯ beside the order number opens the same menu,
 * because a right-click alone is invisible on a phone and to a keyboard.
 */
export default function AllBillsTable({ rows, team, openBillPaid, commissionNote, initialShowExcluded, monthLabel, hasRun, brandOptions = [] }: Props) {
  const [query, setQuery] = useState('')
  const [brand, setBrand] = useState('')
  const [sort, setSort] = useState('date_asc')
  const [showExcluded, setShowExcluded] = useState(initialShowExcluded)
  const [hidden, setHidden] = useState<Column[]>(['location'])
  const { menu, closeMenu, onRowContextMenu, onMenuButton, isOpenOn } = useBillMenu<BillRow>(r => r.orderId, r => r.href)
  const [done, setDone] = useState<BillMenuOutcome | null>(null)
  const [brandDone, setBrandDone] = useState<string | null>(null)
  const [shareDone, setShareDone] = useState<BillShareOutcome | null>(null)

  const excludedCount = rows.filter(r => r.cancelled).length
  const brands = useMemo(() => [...new Set(rows.flatMap(r => r.brands))].sort(), [rows])
  const columns = COLUMNS.filter(([key]) => !hidden.includes(key))

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const order = new Map(rows.map((r, i) => [r.orderId, i]))
    return rows
      .filter(r => showExcluded || !r.cancelled)
      .filter(r => !brand || r.brands.includes(brand))
      .filter(r => !q || [
        r.orderNo, r.refNo, r.customerName, r.venue, r.venuePlace, r.organizer, r.eventName,
        r.staff?.name, r.staff?.code, r.agent?.name, ...r.shares.map(sh => sh.name), ...r.brands, ...r.categories,
      ].some(v => v?.toLowerCase().includes(q)))
      .sort((a, b) => {
        // The server hands the rows over in the order the day wrote them.
        const written = order.get(a.orderId)! - order.get(b.orderId)!
        switch (sort) {
          case 'date_desc': return b.orderDate.localeCompare(a.orderDate) || -written
          case 'commission_desc': return (b.commission?.total ?? 0) - (a.commission?.total ?? 0) || written
          case 'sales_desc': return b.orderTotal - a.orderTotal || written
          case 'salesperson': return (a.staff?.name ?? a.agent?.name ?? '').localeCompare(b.staff?.name ?? b.agent?.name ?? '') || written
          default: return written
        }
      })
  }, [rows, query, brand, sort, showExcluded])

  const subtotalSales = round2(visible.filter(r => !r.cancelled).reduce((a, r) => a + r.orderTotal, 0))
  const subtotalCommissionable = round2(visible.filter(r => !r.cancelled).reduce((a, r) => a + r.commissionable, 0))
  const subtotalCommission = round2(visible.reduce((a, r) => a + (r.commission?.total ?? 0), 0))

  function menuDone(outcome: BillMenuOutcome) {
    closeMenu()
    setBrandDone(null)
    setShareDone(null)
    setDone(outcome.result.changed ? outcome : null)
  }

  function brandMenuDone(outcome: BillBrandOutcome) {
    closeMenu()
    setDone(null)
    setShareDone(null)
    const nameOf = (code: string) => brandOptions.find(o => o.code === code)?.name ?? code
    setBrandDone(outcome.result.changed ? brandOutcomeMessage(outcome.result, nameOf) : null)
  }

  function shareMenuDone(outcome: BillShareOutcome) {
    closeMenu()
    setDone(null)
    setBrandDone(null)
    setShareDone(outcome)
  }

  /** *Share this bill…* on the right-click (2026-09-30): the same as *Share…* under the name. */
  function shareActionOf(r: BillRow): BillShareAction | null {
    if (!r.staff || r.cancelled) return null
    return billShareAction(
      { ownerStaffId: r.staff.id, ownerName: r.staff.name, parts: holdersOf({ staffId: r.staff.id, name: r.staff.name }, r.shares) },
      { runLocked: r.shareDisabled, closedReason: null, monthLabel },
    )
  }

  function salesperson(r: BillRow) {
    if (!r.staff) {
      // Red means "answer this". An ignored name HAS been answered, so it stops asking.
      return <span className={r.agent?.ignored ? s.muted : 'text-danger'}>
        {r.agent?.name} · {r.agent?.ignored ? 'not ours' : 'unmatched'}
      </span>
    }
    return <>
      <Link href={r.staff.href}>{r.staff.name}</Link>
      {r.staff.code && <small className={s.muted}>{r.staff.code}</small>}
      <ShareControl orderId={r.orderId} ownerStaffId={r.staff.id} ownerName={r.staff.name}
        shares={r.shares} team={team} disabled={r.shareDisabled} disabledReason={r.shareDisabledReason} />
    </>
  }

  function money0(n: number | undefined) {
    return commissionNote || n === undefined ? <span className={s.muted}>—</span> : money(n)
  }

  function cell(r: BillRow, key: Column) {
    switch (key) {
      case 'ref': return <PaperRefCell refNo={r.refNo} paperNo={r.paperNo} />
      case 'salesperson': return salesperson(r)
      case 'date': return <>{r.orderDate}{r.sequenceInDay ? <small className={s.muted}>#{r.sequenceInDay} of the day</small> : null}</>
      case 'customer': return r.customerName ?? <span className={s.muted}>—</span>
      case 'venue': return r.venue
        ? <>{r.venueHref ? <Link href={r.venueHref}>{r.venue}</Link> : r.venue}{r.venuePlace && <small className={s.muted}>at {r.venuePlace}</small>}</>
        : <span className={s.muted}>Not linked</span>
      case 'event': return r.eventName ?? r.eventDate
      case 'organizer': return r.organizer ?? <span className={s.muted}>Not linked</span>
      case 'location': return r.location ?? '—'
      case 'brand': return r.brands.join(', ') || 'Unclassified'
      case 'category': return r.categories.join(', ') || '—'
      case 'sales': return money(r.orderTotal)
      case 'commissionable': return <>{money(r.commissionable)}<NoCommission amount={r.orderTotal - r.commissionable} /></>
      case 'paid': return <>{money(r.paidAmount)}{r.depositShort !== null && <small className="text-danger">needs {money(r.depositShort)}</small>}</>
      case 'margin': return r.marginPct === null
        ? <>—<small className={s.muted}>Cost incomplete</small></>
        : <>{pct(r.marginPct)}<small className={s.muted}>{r.marginKeyed ? 'keyed' : r.marginValue === null ? '' : money(r.marginValue)}</small></>
      case 'rank': return r.staff ? <>{r.title ?? '—'}<small className={s.muted}>{r.rank ?? 'Rank unassigned'}{r.rate !== null ? ` · ${pct(r.rate)}` : ''}</small></> : '—'
      case 'product': return money0(r.commission?.product)
      case 'kpi': return money0(r.commission?.kpi)
      case 'incentive': return money0(r.commission?.marginIncentive)
      case 'open': return openBillPaid
        ? <div className="flex items-center gap-2">
            <OpenBillPicker orderId={r.orderId} staffName={r.staff?.name ?? null} eventDate={r.eventDate}
              rank={r.openBill.rank} suggested={r.openBill.suggested}
              disabled={r.openBill.disabled} disabledReason={r.openBill.disabledReason} />
            {r.commission && r.commission.openBill > 0 && <span>{money(r.commission.openBill)}</span>}
          </div>
        : r.openBill.rank ? `Open Bill ${r.openBill.rank}` : '—'
    }
  }

  return <div className={s.workspace}>
    <div className={s.toolbar}>
      <input className={s.search} aria-label="Search bills" placeholder="Search order, Ref No., salesperson, customer, venue or brand…"
        value={query} onChange={e => setQuery(e.target.value)} />
      <select aria-label="Filter brand" value={brand} onChange={e => setBrand(e.target.value)}>
        <option value="">All brands</option>{brands.map(b => <option key={b}>{b}</option>)}
      </select>
      <select aria-label="Sort bills" value={sort} onChange={e => setSort(e.target.value)}>
        <option value="date_asc">Date · oldest first</option>
        <option value="date_desc">Date · newest first</option>
        <option value="salesperson">Salesperson · A → Z</option>
        <option value="sales_desc">Sales value · highest first</option>
        <option value="commission_desc">Commission · highest first</option>
      </select>
      <label className={s.chip}>
        <input type="checkbox" checked={showExcluded} onChange={e => setShowExcluded(e.target.checked)} />
        Show excluded ({excludedCount})
      </label>
      <details className={s.columnsMenu}>
        <summary className={s.button}>Columns</summary>
        <div className={s.columnOptions}>
          {COLUMNS.map(([key, label]) => <label key={key}>
            <input type="checkbox" checked={!hidden.includes(key)}
              onChange={() => setHidden(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key])} />
            {label}
          </label>)}
          <small>Sales order & total always visible</small>
        </div>
      </details>
    </div>
    {commissionNote && <p className={s.notice} role="status">{commissionNote}</p>}
    {done && <BillCountNotice key={`${done.orderId}:${done.excluded}`} outcome={done} monthLabel={monthLabel} hasRun={hasRun}
      className={s.notice} buttonClassName={s.ghostButton} onChange={setDone} />}
    {brandDone && <p className={s.notice} role="status">{brandDone}</p>}
    {shareDone && <BillShareNotice key={`${shareDone.orderId}:${shareDone.result.staffId}:${shareDone.result.after}:${shareDone.undone ? 'undone' : 'done'}`}
      outcome={shareDone} className={s.notice} buttonClassName={s.ghostButton} onChange={setShareDone} />}

    <div className={s.tableFrame}>
      <div className={s.tableScroll} role="region" aria-label="All bills, scroll horizontally" tabIndex={0}>
        <table className={s.table} aria-label="Every bill of the month">
          <thead><tr>
            <th className={s.stickyFirst}>Sales order</th>
            {columns.map(([key, label]) => <th key={key} className={NUMERIC.includes(key) ? s.numeric : undefined}
              title={key === 'sales' ? SALES_VALUE_HINT : key === 'commissionable' ? COMMISSIONABLE_HINT : undefined}>{label}</th>)}
            <th className={s.stickyTotal}>Total commission</th>
          </tr></thead>
          <tbody>{visible.map(r => <tr key={r.orderId} className={r.cancelled ? s.excluded : undefined}
            onContextMenu={event => onRowContextMenu(event, r)}>
            <td className={s.stickyFirst}>
              <div className={s.billCell}>
                <div>
                  <Link href={r.href}>{r.orderNo}</Link>
                  <small className={r.status === 'Deposit pending' ? 'text-alert' : undefined}
                    title={r.exclusionDetail ?? undefined}>{r.status}</small>
                </div>
                <button type="button" className={s.rowMenuButton} aria-haspopup="menu" data-bill-menu-trigger
                  aria-expanded={isOpenOn(r)} aria-label={`Actions for ${r.orderNo}`}
                  title="Actions — or right-click the bill" onClick={event => onMenuButton(event.currentTarget, r)}>
                  ⋯
                </button>
              </div>
            </td>
            {columns.map(([key]) => <td key={key} className={NUMERIC.includes(key) ? s.numeric : undefined}>{cell(r, key)}</td>)}
            <td className={s.stickyTotal}>
              {r.cancelled ? <span className={s.muted}>Not paid</span> : money0(r.commission?.total)}
              {r.shares.length > 0 && <small className={s.muted}>{r.shares.length + 1} holders</small>}
            </td>
          </tr>)}</tbody>
          <tfoot><tr>
            <td className={s.stickyFirst}>Visible subtotal</td>
            <td colSpan={columns.length}>{visible.length} bills · {money(subtotalSales)} sales · {money(subtotalCommissionable)} commissionable</td>
            <td className={s.stickyTotal}>{commissionNote ? '—' : money(subtotalCommission)}</td>
          </tr></tfoot>
        </table>
        {!visible.length && <div className={s.empty}>No bills match this view.</div>}
      </div>
      <div className={s.tableFooter}>
        <span>{visible.length} of {rows.length} bills · Scroll left / right to inspect the full sales line · Right-click a bill for its menu</span>
        <span>Total commission stays visible →</span>
      </div>
    </div>
    {menu && <BillContextMenu
      bill={{
        orderId: menu.row.orderId,
        orderNo: menu.row.orderNo,
        href: menu.row.href,
        who: menu.row.staff
          ? [menu.row.staff.name, ...menu.row.shares.map(sh => sh.name)].join(' + ')
          : menu.row.agent?.name ?? null,
        action: menu.row.countAction,
        exclusionDetail: menu.row.exclusionDetail,
      }}
      anchor={menu.anchor} link={menu.link} byRightClick={menu.byRightClick} monthLabel={monthLabel}
      brand={menu.row.brandAction ? { action: menu.row.brandAction, options: brandOptions } : null}
      share={(() => {
        const action = shareActionOf(menu.row)
        return action ? { action, candidates: team } : null
      })()}
      onClose={closeMenu} onDone={menuDone} onBrandDone={brandMenuDone} onShareDone={shareMenuDone} />}
  </div>
}
