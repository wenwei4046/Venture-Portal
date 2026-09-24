'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { formatMoney } from '@/lib/utils'
import type { CostingGap } from '../load'

const REASONS: Record<string, string> = {
  not_in_sku_master: 'Missing from SKU Master',
  unpriced: 'Price needed',
  no_height: 'Seat size not matched',
  error: 'Pricing error',
}

/** The RPC's end date is exclusive and its bill counts overlap across codes. */
export default function CostingGapsSection({ gaps, from, to }: { gaps: CostingGap[]; from: string; to: string }) {
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
      <div className="sku-actions">
        <p className="sku-count" aria-live="polite"><strong>{shown.length.toLocaleString()}</strong> codes · {lines.toLocaleString()} sales lines · <strong>{formatMoney(revenue)}</strong> revenue</p>
        <Link href="/revenue/products" className="sku-secondary-button">Open SKU Master</Link>
      </div>
      <div className="sku-table-panel">
        <div className="sku-table-window table-scroll" tabIndex={0} role="region" aria-label="Costing gaps table">
          <table className="ledger-table sku-table">
            <thead><tr>
              <th scope="col" className="sku-code-column">Item code</th>
              <th scope="col">Product</th><th scope="col">Group</th>
              <th scope="col" className="num">Lines</th><th scope="col" className="num">Bills</th>
              <th scope="col" className="num">Revenue</th><th scope="col">Reason</th><th scope="col">Next step</th>
            </tr></thead>
            <tbody>
              {visible.length === 0 ? <tr><td colSpan={8} className="sku-empty">{gaps.length === 0 ? 'No costing gaps were found in this sales period.' : 'No costing gaps match these filters.'}</td></tr> : visible.map(g => (
                <tr key={g.item_code}>
                  <td className="sku-code-column">{g.item_code}</td>
                  <td className="sku-description">{g.product_name ?? '—'}</td><td>{g.item_group ?? '—'}</td>
                  <td className="num">{g.lines.toLocaleString()}</td><td className="num">{g.bills.toLocaleString()}</td>
                  <td className="num">{formatMoney(g.revenue)}</td><td>{REASONS[g.reason] ?? g.reason}</td>
                  <td className="product-gap-next">
                    {g.reason === 'unpriced' && g.has_price ? (
                      <span>Price now available. Recost the affected orders in Comm Cal.</span>
                    ) : !g.in_sku_master ? (
                      <span>Check this code in the ERP catalogue.</span>
                    ) : (
                      <Link className="sku-grid-link" href={`/revenue/products?q=${encodeURIComponent(g.item_code)}`}>Review SKU price</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sku-table-footer">
          <span>{visible.length.toLocaleString()} of {shown.length.toLocaleString()} codes shown</span>
          {visible.length < shown.length ? <button type="button" className="sku-load-more" onClick={() => setLimit(n => n + 200)}>Show {Math.min(200, shown.length - visible.length)} more</button> : null}
          <span>Bills are counted per code; the same bill may appear in several rows.</span>
        </div>
      </div>
    </section>
  )
}
