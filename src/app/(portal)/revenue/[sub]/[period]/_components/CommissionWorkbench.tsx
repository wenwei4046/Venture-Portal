'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { buildCommissionWorkbench, type CommissionOrderRow, type OverrideOrderRow } from '@/lib/commission/workbench'
import { formatMoney } from '@/lib/utils'
import { computeRevenuePay } from '@/lib/revenue-pay'
import type { OpenBillTag } from '@/lib/commission/types'
import type { CommissionWorkbenchData } from '../../../_lib/commission-workbench'
import { saveOpenBillPicks } from '../../../run-actions'
import CommissionMonthSummary, { type CommissionMonthStats } from './CommissionMonthSummary'
import NoCommission, { COMMISSIONABLE_HINT, SALES_VALUE_HINT } from './NoCommission'
import s from './commission-workbench.module.css'

type Tab = 'sales' | 'kpi' | 'open'
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

interface Props {
  data: CommissionWorkbenchData
  sub: string
  period: string
  runStatus: string | null
  savedTotals: { staffId: string; total: number }[]
  monthStats: CommissionMonthStats
  monthOverview?: ReactNode
  monthTools?: ReactNode
}

export default function CommissionWorkbench({ data, sub, period, runStatus, savedTotals, monthStats, monthOverview, monthTools }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('sales')
  const [personId, setPersonId] = useState<string | null>(null)
  const [view, setView] = useState<'personal' | 'overriding'>('personal')
  const [query, setQuery] = useState('')
  const [brand, setBrand] = useState('')
  const [sort, setSort] = useState('date_asc')
  const [excluded, setExcluded] = useState<string[]>([])
  const [picks, setPicks] = useState<OpenBillTag[] | null>(null)
  const [picksSource, setPicksSource] = useState<string | null>(null)
  const [currentTeam, setCurrentTeam] = useState(false)
  const [previewFeatures, setPreviewFeatures] = useState<{ kpi?: boolean; openBill?: boolean; margin?: boolean }>({})
  const [showExcluded, setShowExcluded] = useState(false)
  const [showAllOpen, setShowAllOpen] = useState(false)
  const [hidden, setHidden] = useState<Column[]>(['location'])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [saving, startSaving] = useTransition()
  const [hydrated, setHydrated] = useState(false)
  const restoredKey = useRef('')
  const storageKey = `commission-draft:${sub}:${period}`
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
        if (Array.isArray(draft.excluded)) setExcluded(draft.excluded.filter((id: unknown) => typeof id === 'string' && ids.has(id)))
        if (Array.isArray(draft.picks)) {
          if (draft.picksSource === sourceFingerprint) {
            setPicks(draft.picks.filter((pick: OpenBillTag) => ids.has(pick.orderId) && [1, 2, 3].includes(pick.rank)))
            setPicksSource(draft.picksSource)
          } else setNotice('Saved Open Bill picks changed since this draft. Its Open Bill edits were discarded; other draft settings were restored.')
        }
        if (typeof draft.currentTeam === 'boolean') setCurrentTeam(draft.currentTeam)
        if (draft.previewFeatures && typeof draft.previewFeatures === 'object') setPreviewFeatures(Object.fromEntries(Object.entries(draft.previewFeatures).filter(([key, value]) => ['kpi', 'openBill', 'margin'].includes(key) && typeof value === 'boolean')))
      }
    } catch { /* Storage is optional; the table still works in memory. */ }
    setHydrated(true)
  }, [storageKey, data.input.orders, sourceFingerprint])

  useEffect(() => {
    if (hydrated) {
      try { sessionStorage.setItem(storageKey, JSON.stringify({ excluded, picks, picksSource, currentTeam, previewFeatures })) } catch { /* private mode */ }
    }
  }, [storageKey, excluded, picks, picksSource, currentTeam, previewFeatures, hydrated])

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
    people: data.people, orders: data.orders, excludedOrderIds: excluded, openBillTags: tags,
  }), [data, effectiveInput, excluded, tags])
  const selected = board.people.find(p => p.staffId === personId)
  const isPersonView = tab === 'sales' && !!selected
  const workspaceRef = useRef<HTMLElement>(null)
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

  function navigate(next: Tab) { setTab(next); setPersonId(null); setQuery(''); setBrand('') }
  function choosePerson(id: string) { setPersonId(id); setView('personal'); setQuery(''); setBrand(''); setTab('sales'); setNotice('') }
  useEffect(() => {
    if (personId) workspaceRef.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
  }, [personId])
  function exclude(id: string) { setExcluded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }
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
        setNotice('Open Bill picks saved. Payroll is unchanged until you compute and sync the run.')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save picks. Refresh before retrying.')
      }
    })
  }
  function reset() { setExcluded([]); setPicks(null); setPicksSource(null); setCurrentTeam(false); setPreviewFeatures({}); setNotice('Draft reset to the current source orders.'); setError('') }
  function matches(row: CommissionOrderRow | OverrideOrderRow) {
    const q = query.trim().toLowerCase()
    return (!brand || row.brands.includes(brand)) && (!q || [row.orderNo, row.staffName, row.venue, row.organizer, row.eventName, ...row.brands, ...row.categories].some(v => v?.toLowerCase().includes(q)))
  }
  function pickControl(row: CommissionOrderRow) {
    const order = data.input.orders.find(o => o.id === row.orderId)
    return <div className="flex items-center gap-2">
      <input type="checkbox" aria-label={`Open Bill ${row.orderNo}`} checked={row.openBillRank != null}
        disabled={!openEnabled || locked || saving || !!order?.upsale || row.status === 'excluded'}
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
    const filtered = rows.filter(matches).filter(r => showExcluded || !excluded.includes(r.orderId))
      .sort((a, b) => (sort === 'commission_desc' ? b.totalCommission - a.totalCommission : sort === 'date_desc' ? b.orderDate.localeCompare(a.orderDate) : a.orderDate.localeCompare(b.orderDate)) || a.orderNo.localeCompare(b.orderNo))
    const visibleColumns = columns.filter(([key]) => !overriding || !['kpi', 'incentive', 'open'].includes(key))
    return <div className={s.tableFrame} key={overriding ? 'overriding' : 'personal'}>
      <div className={s.tableScroll} role="region" aria-label={`${overriding ? 'Overriding' : 'Personal'} commission table, scroll horizontally`} tabIndex={0}>
        <table className={s.table} aria-label={overriding ? 'Overriding commission by downline order' : 'Personal commission by sales order'}>
          <thead><tr><th className={s.stickyFirst}>Sales order</th>{overriding && <th>Downline</th>}
            {visibleColumns.map(([key, label]) => <th key={key} title={key === 'sales' ? SALES_VALUE_HINT : key === 'commissionable' ? COMMISSIONABLE_HINT : undefined}>{overriding && key === 'product' ? 'Override basis' : label}</th>)}
            <th>Review</th><th className={s.stickyTotal}>Total commission</th></tr></thead>
          <tbody>{filtered.map((row, i) => <tr key={`${row.orderId}:${overriding ? (row as OverrideOrderRow).downlineStaffId : row.staffId}:${i}`} className={excluded.includes(row.orderId) ? s.excluded : undefined}>
            <td className={s.stickyFirst}>{row.upsale ? <span>{row.orderNo}</span> : <Link href={`/revenue/${sub}/${row.periodMonth}/orders/${row.orderId}`}>{row.orderNo}</Link>}
              {row.periodMonth !== period && <small>Carried from {row.periodMonth.slice(0, 7)}</small>}
              {!overriding && <small>{statusLabel[(row as CommissionOrderRow).status]}</small>}</td>
            {overriding && <td>{(row as OverrideOrderRow).downlineName}</td>}
            {visibleColumns.map(([key]) => <td key={key} className={NUMERIC_COLUMNS.includes(key) ? s.numeric : undefined}>{cell(row, key, overriding)}</td>)}
            <td><button type="button" className={s.ghostButton} onClick={() => exclude(row.orderId)}>{excluded.includes(row.orderId) ? 'Restore' : 'Exclude'}</button></td>
            <td className={s.stickyTotal}>{money(row.totalCommission)}{overriding && <small>{pct((row as OverrideOrderRow).overrideRate)} overriding</small>}</td>
          </tr>)}</tbody>
          <tfoot><tr><td className={s.stickyFirst}>Visible subtotal</td><td colSpan={visibleColumns.length + (overriding ? 2 : 1)}>{filtered.length} sales orders</td><td className={s.stickyTotal}>{money(sum(filtered, r => r.totalCommission))}</td></tr></tfoot>
        </table>
        {!filtered.length && <div className={s.empty}>No sales orders match this view.</div>}
      </div>
      <div className={s.tableFooter}><span>{filtered.length} of {rows.length} rows · Scroll left / right to inspect the full sales line</span><span>Total commission stays visible →</span></div>
    </div>
  }

  const feedback = <>
    {notice && isPersonView && <p className={s.notice} role="status">{notice}</p>}
    {error && <p className={s.warning} role="alert">{error}</p>}
    {stalePicks && <p className={s.warning} role="alert">Saved Open Bill picks changed while this draft was open. Reset draft to use the latest picks before saving.</p>}
    {picks && <div className={s.toolbar}><button className={s.primaryButton} disabled={saving || locked || stalePicks || !data.input.scheme.enableOpenBill} onClick={savePicks}>{saving ? 'Saving…' : 'Save Open Bill picks'}</button><span className={s.muted}>{data.input.scheme.enableOpenBill ? 'Order exclusions remain a temporary review draft.' : 'Open Bill is preview-only while switched off in Revenue Rules. Enable it in Rules before saving picks.'}</span></div>}
  </>

  return <section ref={workspaceRef} className={s.workspace} aria-label="Commission workbench">
    {!isPersonView && <>
    {monthOverview}
    <CommissionMonthSummary stats={monthStats} peopleCount={board.people.length} totalCommission={board.totalCommission}
      status={currentTeam ? 'Current team preview' : data.input.hierarchy.length === 0 ? 'Rank history not set' : excluded.length || picks || Object.keys(previewFeatures).length ? 'Draft calculation' : 'Live calculation'} />
    <div className={s.tabs} role="tablist" aria-label="Commission views">
      {([['sales', 'Total Sales Orders'], ['kpi', 'KPI Items'], ['open', 'Open Bill']] as const).map(([key, text]) =>
        <button type="button" role="tab" aria-selected={tab === key} aria-controls={`commission-panel-${key}`} id={`commission-tab-${key}`} key={key}
          onClick={() => navigate(key)} className={tab === key ? s.activeTab : undefined}>{text}<span className={s.badge}>{key === 'sales' ? new Set(data.input.orders.filter(o => !o.upsale && o.periodMonth === period).map(o => o.id)).size : key === 'kpi' ? quantity(totals.kpiQty) : new Set(tags.map(t => t.orderId)).size}</span></button>)}
    </div>
    <div className={tab === 'sales' ? s.reviewToolbar : undefined}>
    {tab === 'sales' && <input className={s.search} placeholder="Search salesperson…" aria-label="Search salesperson" value={query} onChange={e => setQuery(e.target.value)} />}
    <details className={tab === 'sales' ? s.reviewControls : s.monthSettings}><summary>Review settings</summary>
    <div>
    <div className={s.topLine}><span className={s.badge}>Live calculation · {period.slice(0, 7)}</span><span className={s.muted}>Same Revenue Team rules as Arena</span><Link href={`/revenue/${sub}/rules`}>View rules ↗</Link></div>
    {data.input.hierarchy.length === 0 && !currentTeam && <p className={s.warning}>No team ranks are effective in {period.slice(0, 7)}. Product commission and overriding need an effective rank. Other configured incentives may still apply. You can try the current team below without changing history.</p>}
    <details className={s.rules}><summary>Calculation setup · KPI {effectiveInput.scheme.enableKpi ? 'on' : 'off'} · Open Bill {openEnabled ? 'on' : 'off'} · Margin {effectiveInput.scheme.enableMarginIncentive ? 'on' : 'off'}</summary>
      {(carriedCount > 0 || upsaleCount > 0) && <p>The month’s sales figures above stay unchanged. This commission calculation also includes {carriedCount} carried orders and {upsaleCount} recorded upsales.</p>}
      <p>Try the configured incentives in this preview. Permanent settings are managed in <Link href={`/revenue/${sub}/rules`}>Revenue Rules</Link>.</p>
      <div className={s.chips}>
        {data.currentHierarchy.length > 0 && <label className={s.chip}><input type="checkbox" checked={currentTeam} onChange={e => setCurrentTeam(e.target.checked)} />Use current team & dated rules for preview</label>}
        <label className={s.chip}><input type="checkbox" checked={effectiveInput.scheme.enableKpi} onChange={e => setPreviewFeatures(p => ({ ...p, kpi: e.target.checked }))} />KPI incentive</label>
        <label className={s.chip}><input type="checkbox" checked={openEnabled} onChange={e => setPreviewFeatures(p => ({ ...p, openBill: e.target.checked }))} />Open Bill incentive</label>
        <label className={s.chip}><input type="checkbox" checked={effectiveInput.scheme.enableMarginIncentive} onChange={e => setPreviewFeatures(p => ({ ...p, margin: e.target.checked }))} />Margin incentive & penalty</label>
      </div>
    </details>
    {(excluded.length > 0 || picks || currentTeam || Object.keys(previewFeatures).length > 0) && <div className={s.notice} role="status"><span>{currentTeam ? 'Current team preview · ' : ''}{Object.keys(previewFeatures).length > 0 ? 'Draft incentive settings · ' : ''}{excluded.length} orders excluded in this draft{picks ? ' · Open Bill picks changed' : ''}. Payroll is unchanged.</span><button className={s.ghostButton} onClick={reset}>Reset draft</button></div>}
    {excluded.length > 0 && <details className={s.rules}><summary>Restore excluded orders ({excluded.length})</summary><div className={s.chips}>{excluded.map(id => <button key={id} className={s.button} onClick={() => exclude(id)}>Restore {data.input.orders.find(o => o.id === id)?.orderNo ?? id}</button>)}</div></details>}
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
          <th>Margin</th><th>Personal</th><th>Overriding</th><th className={s.stickyTotal}>Total commission</th></tr></thead>
        <tbody>{people.map(p => {
          const counted = p.personalRows.filter(r => r.status !== 'excluded')
          const salesValue = sum(counted, r => r.orderTotal)
          const commissionable = sum(counted, r => r.commissionableValue)
          return <tr key={p.staffId}><td className={s.stickyFirst}><button className={s.ghostButton} onClick={() => choosePerson(p.staffId)}>{p.name} <span aria-hidden>↗</span></button></td>
          <td>{p.titleLabel}<small>{p.rankLabel} · {pct(p.productRate)}</small></td><td>{counted.length}</td>
          <td className={s.numeric}>{money(salesValue)}</td>
          <td className={s.numeric}>{money(commissionable)}<NoCommission amount={salesValue - commissionable} /></td>
          <td className={s.numeric}>{pct(p.statement?.marginPct)}<small>{p.statement?.marginPct == null ? 'Cost incomplete' : money(p.statement?.marginRevenue - p.statement?.marginCost)}</small></td>
          <td className={s.numeric}>{money(p.personalTotal)}</td><td className={s.numeric}>{money(p.overrideTotal)}</td><td className={s.stickyTotal}><button className={s.ghostButton} onClick={() => choosePerson(p.staffId)}>{money(p.totalCommission)}</button>{p.monthlyGroupIncentive > 0 && <small>Includes {money(p.monthlyGroupIncentive)} group reward</small>}</td></tr>
        })}</tbody>
        <tfoot><tr><td colSpan={8}>All salespeople · total commission</td><td className={s.stickyTotal}>{money(board.totalCommission)}</td></tr></tfoot>
      </table></div></div>
      {!people.length && <p className={s.empty}>No salespeople found.</p>}
    </>}

    {tab === 'sales' && selected && <>
      <nav className={s.breadcrumb} aria-label="Commission navigation"><button onClick={() => { setPersonId(null); setQuery(''); setBrand('') }}>← Sales people</button><span>/</span><span>{selected.name}</span></nav>
      <div className={s.personHeader}>
        <div className={s.personHeroTop}><span className={s.eyebrow}>COMMISSION · {new Date(`${period}T00:00:00Z`).toLocaleDateString('en-MY', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span><span className={s.heroStatus}>{currentTeam ? 'Current team preview' : data.input.hierarchy.length === 0 ? 'Rank history not set' : excluded.length || picks || Object.keys(previewFeatures).length ? 'Draft calculation' : 'Monthly calculation'}</span></div>
        <div className={s.personHeroBody}><div className={s.avatar}>{selected.name.slice(0, 2)}</div><div className={s.personIdentity}><h2>{selected.name}</h2><p>{selected.titleLabel ?? 'Title unassigned'}<span>{selected.rankLabel ?? 'Rank unassigned'} · {pct(selected.productRate)}</span></p></div>
          <div className={s.overviewTotal}><span>Total commission</span><strong>{money(selected.totalCommission)}</strong><small>Personal + overriding{selected.monthlyGroupIncentive ? ` + ${money(selected.monthlyGroupIncentive)} group reward` : ''}</small></div>
        </div>
      </div>
      <div className={s.summaryGrid}>
        <Summary label="Personal commission" value={money(selected.personalTotal)} />
        <Summary label="Overriding commission" value={money(selected.overrideTotal)} />
        <Summary label="Monthly margin" value={pct(selected.statement?.marginPct)} note={selected.statement?.marginPct == null ? 'Cost incomplete' : `${money(selected.statement?.marginRevenue - selected.statement?.marginCost)} margin`} />
        <Summary label="Estimated take-home pay" value={salary ? money(salary.net) : 'Not available'} note={salary ? 'Based on current commission' : data.payUnavailable ? 'Salary preview is unavailable for this session' : 'Payroll inputs are not set for this person'} />
      </div>

      <div className={s.topLine}><span className={s.muted}>Saved commission: {saved ? money(saved.total) : 'No saved run'}{saved && Math.abs(saved.total - selected.totalCommission) >= .01 ? ` · Difference ${money(selected.totalCommission - saved.total)}` : ''}</span>
        {saved && <Link href={`/revenue/${sub}/${period}/pay/${selected.staffId}`}>Saved salary breakdown ↗</Link>}</div>
      <div className={s.tabs} role="tablist" aria-label="Salesperson commission type">
        <button role="tab" aria-selected={view === 'personal'} className={view === 'personal' ? s.activeTab : undefined} onClick={() => setView('personal')}>Personal <span className={s.badge}>{selected.personalRows.length}</span></button>
        <button role="tab" aria-selected={view === 'overriding'} className={view === 'overriding' ? s.activeTab : undefined} onClick={() => setView('overriding')}>Overriding <span className={s.badge}>{selected.overridingRows.length}</span></button>
      </div>
      <div className={s.toolbar}><input className={s.search} aria-label="Search sales orders" placeholder="Search order, venue or brand…" value={query} onChange={e => setQuery(e.target.value)} />
        <select aria-label="Filter brand" value={brand} onChange={e => setBrand(e.target.value)}><option value="">All brands</option>{brands.map(b => <option key={b}>{b}</option>)}</select>
        <select aria-label="Sort sales orders" value={sort} onChange={e => setSort(e.target.value)}><option value="date_asc">Date · oldest first</option><option value="date_desc">Date · newest first</option><option value="commission_desc">Commission · highest first</option></select>
        <label className={s.chip}><input type="checkbox" checked={showExcluded} onChange={e => setShowExcluded(e.target.checked)} />Show excluded ({excluded.length})</label>
        {(excluded.length > 0 || picks || currentTeam || Object.keys(previewFeatures).length > 0) && <details className={s.editMenu}><summary className={s.button}>Review edits{excluded.length > 0 ? ` (${excluded.length})` : ''}</summary><div className={s.editOptions}>
          <p className={s.muted}>Preview changes only. Payroll is unchanged.</p>
          {excluded.map(id => <button key={id} className={s.button} onClick={() => exclude(id)}>Restore {data.input.orders.find(o => o.id === id)?.orderNo ?? id}</button>)}
          <button className={s.ghostButton} onClick={reset}>Reset draft</button>
        </div></details>}
        <details className={s.columnsMenu}><summary className={s.button}>Columns</summary><div className={s.columnOptions}>{COLUMNS.map(([key, label]) => <label key={key}><input type="checkbox" checked={!hidden.includes(key)} onChange={() => setHidden(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key])} />{label}</label>)}<small>Sales order & total always visible</small></div></details>
      </div>
      {feedback}
      {view === 'personal' ? orderTable(selected.personalRows, false) : orderTable(selected.overridingRows, true)}
      <div className={s.footerTotal}><span>{view === 'personal' ? 'Personal commission' : 'Overriding commission'} · all included orders</span><strong>{money(view === 'personal' ? selected.personalTotal : selected.overrideTotal)}</strong></div>
      <details className={s.salaryDetails}>
        <summary>Salary calculation · current preview</summary>
        {salary && salarySource ? <>
          <p className={s.muted}>Uses this commission draft and the available payroll inputs. Allowances and overtime use {salarySource.input.daysWorked} / {salarySource.input.daysInMonth} days.</p>
          <div className={s.tableFrame}>
            <table className={`${s.table} ${s.salaryTable}`} aria-label="Current salary calculation">
              <thead><tr><th>Component</th><th className={s.numeric}>Amount</th></tr></thead>
              <tbody>
                <tr><td>Current commission<small>Personal + overriding + group reward</small></td><td className={s.numeric}>{money(selected.totalCommission)}</td></tr>
                <tr><td>Other programmes<small>Already applied for this month</small></td><td className={s.numeric}>{money(salarySource.commissionElsewhere)}</td></tr>
                <tr><td>Payroll adjustment</td><td className={s.numeric}>{money(salarySource.payrollAdjustment)}</td></tr>
                <tr><td>Employer contributions deducted<small>EPF + SOCSO + EIS, funded from commission</small></td><td className={s.numeric}>{money(-salary.employerContributions)}</td></tr>
                <tr><td>Statutory allowance<small>Prorated</small></td><td className={s.numeric}>{money(salary.proratedStatutoryAllowance)}</td></tr>
                <tr><td>Other allowances</td><td className={s.numeric}>{money(salarySource.input.nonStatutoryAllowance)}</td></tr>
                <tr><td>Overtime<small>Prorated</small></td><td className={s.numeric}>{money(salary.proratedOt)}</td></tr>
                <tr><td>Payroll deductions</td><td className={s.numeric}>{money(-salarySource.input.deductionAmount)}</td></tr>
                <tr className={s.salarySubtotal}><td>Gross pay</td><td className={s.numeric}>{money(salary.gross)}</td></tr>
                <tr><td>Employee contributions<small>EPF + SOCSO + EIS</small></td><td className={s.numeric}>{money(-salary.employeeContributions)}</td></tr>
                <tr><td>{salarySource.input.taxMode === 'withholding' ? 'Withholding tax' : salarySource.input.taxMode === 'pcb' ? 'PCB tax' : 'Tax · none'}</td><td className={s.numeric}>{money(-(salary.pcb + salary.withholdingTax))}</td></tr>
                <tr><td>SKBBK</td><td className={s.numeric}>{money(-salarySource.input.skbbkAmount)}</td></tr>
              </tbody>
              <tfoot><tr><td>Estimated take-home pay</td><td className={s.numeric}>{money(salary.net)}</td></tr></tfoot>
            </table>
          </div>
        </> : <p className={s.muted}>{data.payUnavailable ? 'Salary preview is unavailable for this session.' : 'Payroll inputs are not set for this person.'} Commission can still be reviewed above.</p>}
      </details>
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
      {!openEnabled && <p className={s.notice}>Open Bill payout is switched off in Rules. Saved picks remain visible and pay zero.</p>}
      {locked && <p className={s.notice}>This run is {runStatus}. Reopen it in Payroll & source tools before saving Open Bill changes.</p>}
      <div className={s.toolbar}><input className={s.search} aria-label="Search Open Bill orders" placeholder="Search order or salesperson…" value={query} onChange={e => setQuery(e.target.value)} /><label className={s.chip}><input type="checkbox" checked={showAllOpen} onChange={e => setShowAllOpen(e.target.checked)} />Show all orders to add picks</label></div>
      <div className={s.tableFrame}><div className={s.tableScroll}><table className={s.table} aria-label="Open Bill orders"><thead><tr><th className={s.stickyFirst}>Sales order</th><th>Sales person</th><th>Event date</th><th>Venue</th><th>Brand / category</th><th>Sales value</th><th>Open Bill selection</th><th>Rate</th><th>Status</th><th className={s.stickyTotal}>Allocated bonus</th></tr></thead><tbody>{board.personalRows.filter(r => (showAllOpen || r.openBillRank != null) && matches(r)).map(r => <tr key={`${r.orderId}:${r.staffId}`}><td className={s.stickyFirst}>{r.orderNo}</td><td><button className={s.ghostButton} onClick={() => choosePerson(r.staffId)}>{r.staffName}</button></td><td>{r.eventDate}</td><td>{r.venue || '—'}</td><td>{r.brands.join(', ')}<small>{r.categories.join(', ')}</small></td><td className={s.numeric}>{money(r.orderTotal)}</td><td>{pickControl(r)}</td><td>{pct(r.openBillRate)}</td><td>{statusLabel[r.status]}</td><td className={s.stickyTotal}>{money(r.openBillBonus)}</td></tr>)}</tbody></table></div><div className={s.tableFooter}>Shared bills show each holder’s allocated part. All parts reconcile to the total bonus.</div></div>
      <div className={s.footerTotal}><span>All selected bills · allocated bonus</span><strong>{money(totals.open)}</strong></div>
    </>}
    </div>

    {!isPersonView && board.result.warnings.length > 0 && <details className={s.rules}><summary>{board.result.warnings.length} calculation notices · review before payroll</summary><ul>{board.result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
    {!isPersonView && monthTools}
  </section>
}

function Summary({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className={s.summary}><span className={s.summaryLabel}>{label}</span><strong className={s.summaryValue}>{value}</strong>{note && <small>{note}</small>}</div>
}




