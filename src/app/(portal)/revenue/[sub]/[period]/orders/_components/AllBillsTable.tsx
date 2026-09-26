'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState, useTransition, type MouseEvent } from 'react'
import { formatMoney } from '@/lib/utils'
import type { BillCountAction } from '@/lib/commission/bill-exclusion'
import { includeOrder } from '../../../../run-actions'
import type { MenuAnchor } from '../../../hierarchy/_components/ContextMenuPanel'
import s from '../../_components/commission-workbench.module.css'
import NoCommission, { COMMISSIONABLE_HINT, SALES_VALUE_HINT } from '../../_components/NoCommission'
import BillContextMenu, { type BillMenuOutcome } from './BillContextMenu'
import OpenBillPicker from './OpenBillPicker'
import ShareControl, { type ShareHolder, type TeamMember } from './ShareControl'

/** One bill, already resolved on the server — nothing here reads the database. */
export interface BillRow {
  orderId: string
  orderNo: string
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
  | 'salesperson' | 'date' | 'customer' | 'venue' | 'event' | 'organizer' | 'location' | 'brand'
  | 'category' | 'sales' | 'commissionable' | 'paid' | 'margin' | 'rank' | 'product' | 'kpi' | 'incentive' | 'open'

const COLUMNS: [Column, string][] = [
  ['salesperson', 'Salesperson'], ['date', 'Date'], ['customer', 'Customer'], ['venue', 'Venue'],
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
}

interface OpenMenu {
  row: BillRow
  anchor: MenuAnchor
  link: { href: string; label: string } | null
  byRightClick: boolean
}

const ORDINAL = ['', '1st', '2nd', '3rd'] as const

/**
 * Every bill of the month in the salesperson ledger's format (2026-09-25) —
 * the same toolbar, sticky order / total columns and Columns menu as a
 * person's Personal table on the month page, plus the one thing a person's
 * table never needs: WHOSE bill it is. The Open Bill pick and *Share…* stay
 * on the row, because the evidence for both is the rest of the row.
 *
 * RIGHT-CLICK A BILL (2026-09-27) for its menu — open it, or *Don't count
 * this bill*, which takes it out of the month the way an ERP cancellation does
 * (`BillContextMenu`). The ⋯ beside the order number opens the same menu,
 * because a right-click alone is invisible on a phone and to a keyboard.
 */
export default function AllBillsTable({ rows, team, openBillPaid, commissionNote, initialShowExcluded, monthLabel, hasRun }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [brand, setBrand] = useState('')
  const [sort, setSort] = useState('date_asc')
  const [showExcluded, setShowExcluded] = useState(initialShowExcluded)
  const [hidden, setHidden] = useState<Column[]>(['location'])
  const [menu, setMenu] = useState<OpenMenu | null>(null)
  const [done, setDone] = useState<BillMenuOutcome | null>(null)
  const [undoError, setUndoError] = useState<string | null>(null)
  const [undoing, startUndo] = useTransition()
  const closeMenu = useCallback(() => setMenu(null), [])

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
        r.orderNo, r.customerName, r.venue, r.venuePlace, r.organizer, r.eventName,
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

  function openRowMenu(event: MouseEvent<HTMLTableRowElement>, row: BillRow) {
    // A control with a right-click of its own (Share…), or the browser's menu on purpose.
    if (event.isDefaultPrevented() || event.shiftKey) return
    const target = event.target as HTMLElement
    if (target.closest('input, select, textarea')) return
    // Selected text: Copy is what the right-click is for.
    if (window.getSelection()?.toString().trim()) return
    event.preventDefault()
    // Right-clicking a link keeps the browser's one useful answer for it.
    const linkEl = target.closest('a')
    const href = linkEl?.getAttribute('href')
    const link = linkEl && href && href !== row.href ? { href, label: linkEl.textContent?.trim() || href } : null
    // The keyboard's menu key fires at 0, 0: hang the menu from the row instead.
    const rect = event.currentTarget.getBoundingClientRect()
    const anchor = event.clientX === 0 && event.clientY === 0
      ? { left: rect.left + 16, top: rect.top, bottom: rect.bottom }
      : { left: event.clientX, top: event.clientY, bottom: event.clientY }
    setMenu({ row, anchor, link, byRightClick: true })
  }

  function openButtonMenu(button: HTMLButtonElement, row: BillRow) {
    if (menu?.row.orderId === row.orderId) return setMenu(null)
    const rect = button.getBoundingClientRect()
    setMenu({ row, anchor: { left: rect.left, top: rect.top, bottom: rect.bottom }, link: null, byRightClick: false })
  }

  function menuDone(outcome: BillMenuOutcome) {
    setMenu(null)
    setUndoError(null)
    setDone(outcome.result.changed ? outcome : null)
  }

  function undo(outcome: BillMenuOutcome) {
    setUndoError(null)
    startUndo(async () => {
      try {
        const result = await includeOrder(outcome.orderId)
        router.refresh()
        setDone({ orderId: outcome.orderId, orderNo: outcome.orderNo, excluded: false, result })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'That did not save'
        if (!message.includes('NEXT_REDIRECT')) setUndoError(message)
      }
    })
  }

  function doneMessage(outcome: BillMenuOutcome): string {
    const rank = outcome.result.openBillRank
    if (outcome.excluded) {
      return `${outcome.orderNo} no longer counts in ${monthLabel}${rank ? ` and gave up its ${ORDINAL[rank]} Open Bill` : ''}.`
        + (hasRun ? ' Compute the month again to take it out of the saved run.' : '')
    }
    if (outcome.result.counts === false) {
      return `${outcome.orderNo} is no longer out by hand, but it still does not count: ${outcome.result.stillOut ?? 'it is excluded'}.`
    }
    return `${outcome.orderNo} counts again${rank ? `, back as the ${ORDINAL[rank]} Open Bill` : ''}.`
      + (hasRun ? ' Compute the month again to put it back in the saved run.' : '')
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
      <input className={s.search} aria-label="Search bills" placeholder="Search order, salesperson, customer, venue or brand…"
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
    {done && <p className={s.notice} role="status">
      {doneMessage(done)}
      {done.excluded && <>{' '}<button type="button" className={s.ghostButton} disabled={undoing} onClick={() => undo(done)}>
        {undoing ? 'Undoing…' : 'Undo'}
      </button></>}
      {undoError && <span className="text-danger"> {undoError}</span>}
    </p>}

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
            onContextMenu={event => openRowMenu(event, r)}>
            <td className={s.stickyFirst}>
              <div className={s.billCell}>
                <div>
                  <Link href={r.href}>{r.orderNo}</Link>
                  <small className={r.status === 'Deposit pending' ? 'text-alert' : undefined}
                    title={r.exclusionDetail ?? undefined}>{r.status}</small>
                </div>
                <button type="button" className={s.rowMenuButton} aria-haspopup="menu" data-bill-menu-trigger
                  aria-expanded={menu?.row.orderId === r.orderId} aria-label={`Actions for ${r.orderNo}`}
                  title="Actions — or right-click the bill" onClick={event => openButtonMenu(event.currentTarget, r)}>
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
        who: menu.row.staff?.name ?? menu.row.agent?.name ?? null,
        action: menu.row.countAction,
        exclusionDetail: menu.row.exclusionDetail,
      }}
      anchor={menu.anchor} link={menu.link} byRightClick={menu.byRightClick} monthLabel={monthLabel}
      onClose={closeMenu} onDone={menuDone} />}
  </div>
}
