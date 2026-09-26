'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { formatMoney } from '@/lib/utils'
import type { CostingGap } from '../load'
import ColumnTable, { type TableColumn } from './ColumnTable'

const REASONS: Record<string, string> = {
  not_in_sku_master: 'Missing from SKU Master',
  unpriced: 'Price needed',
  no_height: 'Seat size not matched',
  error: 'Pricing error',
}

function nextStep(g: CostingGap) {
  if (g.reason === 'unpriced' && g.has_price) return <span>Price now available. Recost the affected orders in Comm Cal.</span>
  if (!g.in_sku_master) return <span>Check this code in the ERP catalogue.</span>
  return <Link className="sku-grid-link" href={`/revenue/products?q=${encodeURIComponent(g.item_code)}`}>Review SKU price</Link>
}

// The table's own order; the reader may move and resize the columns (ColumnTable).
const COLUMNS: TableColumn<CostingGap>[] = [
  { key: 'code', label: 'Item code', className: 'sku-nowrap sku-col-code', defaultWidth: 190, cell: g => g.item_code },
  { key: 'product', label: 'Product', className: 'sku-description', defaultWidth: 280, cell: g => g.product_name ?? '—' },
  { key: 'group', label: 'Group', defaultWidth: 120, cell: g => g.item_group ?? '—' },
  { key: 'lines', label: 'Lines', className: 'num', defaultWidth: 96, cell: g => g.lines.toLocaleString() },
  { key: 'bills', label: 'Bills', className: 'num', defaultWidth: 96, cell: g => g.bills.toLocaleString() },
  { key: 'revenue', label: 'Revenue', className: 'num', defaultWidth: 140, cell: g => formatMoney(g.revenue) },
  { key: 'reason', label: 'Reason', defaultWidth: 180, cell: g => REASONS[g.reason] ?? g.reason },
  { key: 'next', label: 'Next step', className: 'product-gap-next', defaultWidth: 300, cell: nextStep },
]

/** The RPC's end date is exclusive and its bill counts overlap across codes. */
export default function CostingGapsSection({ gaps, from, to, columnLayouts = {} }: {
  gaps: CostingGap[]
  from: string
  to: string
  /** The reader's column layouts from the request (`layoutsFromCookies`). */
  columnLayouts?: Record<string, string>
}) {
  const [query, setQuery] = useState('')
  const [reason, setReason] = useState('')
  const [limit, setLimit] = useState(200)
  const reasons = [...new Set(gaps.map(g => g.reason))].sort()
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return gaps.filter(g => (!reason || g.reason === reason) && (!q ||
      [g.item_code, g.product_name, g.item_group, g.brand_code].some(v => (v ?? '').toLowerCase().includes(q))))
      .sort((a, b) => b.revenue - a.revenue || b.lines - a.lines || a.item_code.localeCompare(b.item_code))
  }, [gaps, query, reason])
  const lines = shown.reduce((total, g) => total + g.lines, 0)
  const revenue = shown.reduce((total, g) => total + g.revenue, 0)
  const visible = shown.slice(0, limit)

  return (
    <section className="sku-master" aria-label="Costing gaps">
      <div className="sku-filters">
        <div className="product-section-heading">
          <h2>Costing gaps</h2>
          <p>Sales from {from} up to, but not including, {to}.</p>
        </div>
        <div className="sku-filter-controls">
          <label className="sku-search">
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg>
            <input type="search" value={query} aria-label="Search costing gaps" placeholder="Search code, product or brand…" onChange={e => { setQuery(e.target.value); setLimit(200) }} />
          </label>
          <label className="sku-model-filter">
            <span>Reason</span>
            <select value={reason} onChange={e => { setReason(e.target.value); setLimit(200) }}>
              <option value="">All reasons</option>
              {reasons.map(key => <option key={key} value={key}>{REASONS[key] ?? key}</option>)}
            </select>
          </label>
        </div>
      </div>
      <div className="sku-stage">
        <div className="sku-actions">
          <p className="sku-count" aria-live="polite"><strong>{shown.length.toLocaleString()}</strong> codes · {lines.toLocaleString()} sales lines · <strong>{formatMoney(revenue)}</strong> revenue</p>
          <Link href="/revenue/products" className="sku-secondary-button">Open SKU Master</Link>
        </div>
        <ColumnTable
          id="costing-gaps"
          initialLayout={columnLayouts['costing-gaps']}
          label="Costing gaps table"
          columns={COLUMNS}
          rows={visible}
          rowKey={g => g.item_code}
          empty={gaps.length === 0 ? 'No costing gaps were found in this sales period.' : 'No costing gaps match these filters.'}
          footer={<>
            <span>{visible.length.toLocaleString()} of {shown.length.toLocaleString()} codes shown</span>
            {visible.length < shown.length ? <button type="button" className="sku-load-more" onClick={() => setLimit(n => n + 200)}>Show {Math.min(200, shown.length - visible.length)} more</button> : null}
            <span>Bills are counted per code; the same bill may appear in several rows.</span>
          </>}
        />
      </div>
    </section>
  )
}
