'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import { compareHeights, heightKey } from '@/lib/catalogue/keys'
import { TIERS, type PriceCell } from '@/lib/catalogue/pricing'
import { saveSkuPrices } from '../../catalogue-actions'
import type { CatalogueSku } from '../load'
import { categoryLabel, orderedCategories } from './ui'
import { useProductDraftGuard } from './ProductWorkspace'

const LIMIT_STEP = 300
type CellDraft = { height: string; tier: string; price: string }
type Draft = { price?: string; cells?: Record<string, CellDraft> }

function cellKey(height: string, tier: string): string {
  return `${heightKey(height)}|${tier}`
}

function cellPrice(grid: PriceCell[] | null, height: string, tier: string): number | null {
  const k = heightKey(height)
  return grid?.find(c => heightKey(c.height) === k && c.tier === tier)?.price ?? null
}

function modelKey(sku: CatalogueSku): string {
  return sku.modelId ?? sku.modelCode ?? ''
}

/** The ERP's SKU rows and matrix shape, with prices owned by the portal. */
export default function SkuMasterTab({ skus, sofaSizes, initialQuery = '' }: { skus: CatalogueSku[]; sofaSizes: string[]; initialQuery?: string }) {
  const router = useRouter()
  const [category, setCategory] = useState<string | null>(null)
  const [query, setQuery] = useState(initialQuery)
  const [model, setModel] = useState('')
  const [showGone, setShowGone] = useState(false)
  const [limit, setLimit] = useState(LIMIT_STEP)
  const [editing, setEditing] = useState(false)
  const [tier, setTier] = useState<string>('PRICE_2')
  const drafts = useRef<Map<string, Draft>>(new Map())
  const [dirty, setDirty] = useState(0)
  const [saving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const sofaView = category === 'SOFA'
  useProductDraftGuard(dirty > 0, saving)

  const live = useMemo(() => skus.filter(s => showGone || !s.removed), [skus, showGone])
  const categories = useMemo(() => orderedCategories(live.map(s => s.category)), [live])
  const models = useMemo(() => {
    const options = new Map<string, string>()
    for (const s of live) {
      const key = modelKey(s)
      if ((s.category ?? '').toUpperCase() === 'SOFA' && key) options.set(key, s.modelCode ?? s.modelName ?? key)
    }
    return [...options].sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }))
  }, [live])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return live.filter(s => {
      if (category !== null && (s.category ?? '').toUpperCase() !== category) return false
      if (sofaView && model && modelKey(s) !== model) return false
      return !q || [s.code, s.description, s.modelCode, s.modelName, s.brand, s.optionLabel]
        .some(v => (v ?? '').toLowerCase().includes(q))
    })
  }, [live, category, query, sofaView, model])

  // Keep visible sizes in ERP order, followed by historical priced sizes.
  // DEFAULT stays in saved grids but is not an editable size column here.
  const heights = useMemo(() => {
    if (!sofaView) return []
    const cols = sofaSizes.filter(h => heightKey(h) !== 'default')
    const have = new Set(cols.map(h => heightKey(h)))
    const extra = new Map<string, string>()
    for (const s of shown) {
      for (const c of s.grid ?? []) {
        const k = heightKey(c.height)
        if (k !== null && k !== 'default' && !have.has(k) && !extra.has(k)) extra.set(k, c.height)
      }
    }
    return [...cols, ...[...extra.values()].sort(compareHeights)]
  }, [sofaView, sofaSizes, shown])

  function changeCategory(next: string | null) {
    setCategory(next)
    setModel('')
    setLimit(LIMIT_STEP)
  }

  function touch(erpId: string, update: (d: Draft) => void) {
    const d = drafts.current.get(erpId) ?? {}
    update(d)
    drafts.current.set(erpId, d)
    setDirty(drafts.current.size)
  }

  function cancel() {
    drafts.current = new Map()
    setDirty(0)
    setEditing(false)
    setError(null)
  }

  function save() {
    const byId = new Map(skus.map(s => [s.erpId, s]))
    const edits = [...drafts.current.entries()].map(([erpId, d]) => {
      const s = byId.get(erpId)!
      const price = d.price !== undefined ? d.price : s.price === null ? null : String(s.price)
      const merged = new Map<string, { height: string; tier: string; price: string | null }>()
      for (const c of s.grid ?? []) merged.set(cellKey(c.height, c.tier), { ...c, price: String(c.price) })
      for (const [key, cell] of Object.entries(d.cells ?? {})) {
        // Raw labels travel with the draft, independently of the visible filters.
        // Existing cells also retain their original saved spelling.
        merged.set(key, { ...cell, height: merged.get(key)?.height ?? cell.height })
      }
      return { erpId, price, grid: merged.size ? [...merged.values()] : null }
    })
    setError(null)
    setNotice(null)
    startSaving(async () => {
      try {
        const r = await saveSkuPrices(edits)
        drafts.current = new Map()
        setDirty(0)
        setEditing(false)
        setNotice(`${r.saved} SKU${r.saved === 1 ? '' : 's'} saved. New sales lines use these prices. To update an existing month, recost its orders in Comm Cal.`)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the prices')
      }
    })
  }

  const visible = shown.slice(0, limit)
  const modelLabel = models.find(([key]) => key === model)?.[1]

  return (
    <section className="sku-master" aria-label="SKU Master">
      <div className="sku-filters">
        <div className="sku-categories" role="group" aria-label="Product category">
          <button type="button" className="sku-chip" aria-pressed={category === null} disabled={saving} onClick={() => changeCategory(null)}>All</button>
          {categories.map(c => (
            <button key={c} type="button" className="sku-chip" aria-pressed={category === c} disabled={saving} onClick={() => changeCategory(c)}>{categoryLabel(c)}</button>
          ))}
        </div>
        <div className="sku-filter-controls">
          <label className="sku-search">
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
              <circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" />
            </svg>
            <input
              type="search" value={query} disabled={saving}
              onChange={e => { setQuery(e.target.value); setLimit(LIMIT_STEP) }}
              placeholder="Search product code or description…" aria-label="Search the SKU master"
            />
          </label>
          {sofaView ? (
            <>
              <label className="sku-model-filter">
                <span>Model</span>
                <select value={model} disabled={saving} onChange={e => { setModel(e.target.value); setLimit(LIMIT_STEP) }}>
                  <option value="">All models</option>
                  {models.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <div className="sku-tier-filter" role="group" aria-label="Fabric tier">
                <span>Tier</span>
                <div className="sku-tier-options">
                  {TIERS.map((t, i) => (
                    <button key={t} type="button" aria-pressed={tier === t} disabled={saving} onClick={() => setTier(t)}>P{i + 1}</button>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="sku-actions">
        <p className="sku-count" aria-live="polite">
          <strong>{shown.length.toLocaleString()}</strong> SKU{shown.length === 1 ? '' : 's'}
          {modelLabel ? ` · Model ${modelLabel}` : ''}
          {sofaView ? ` · P${TIERS.indexOf(tier as typeof TIERS[number]) + 1}` : ''}
        </p>
        <div className="sku-action-buttons">
          {editing ? (
            <>
              <button type="button" onClick={cancel} disabled={saving} className="sku-secondary-button">Cancel</button>
              <button type="button" onClick={save} disabled={saving || dirty === 0} className="sku-primary-button">
                {saving ? 'Saving…' : dirty === 0 ? 'Save changes' : `Save ${dirty} SKU${dirty === 1 ? '' : 's'}`}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => { setEditing(true); setNotice(null) }} className="sku-primary-button">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                <path d="m12.5 3.5 4 4M3 17l1-5L13.5 2.5a1.4 1.4 0 0 1 2 0l2 2a1.4 1.4 0 0 1 0 2L8 16l-5 1Z" />
              </svg>
              Edit Prices
            </button>
          )}
        </div>
      </div>
      {editing ? <p className="sku-edit-note">Blank clears a price; 0 is a zero price. Changes across models and tiers are saved together.</p> : null}
      {error ? <p className="sku-notice" data-tone="error" role="alert">{error}</p> : null}
      {notice ? <p className="sku-notice" data-tone="ok" role="status">{notice}</p> : null}

      <div className="sku-table-panel">
        <div className="sku-table-window table-scroll" tabIndex={0} role="region" aria-label="SKU prices table">
          <table className="ledger-table sku-table">
            <thead>
              <tr>
                <th scope="col" className="sku-code-column">Product code</th>
                <th scope="col">Description</th>
                <th scope="col">Model</th>
                {sofaView ? <><th scope="col">Category</th><th scope="col">PRICE_TIER</th></> : <><th scope="col">Size</th><th scope="col">Brand</th></>}
                {sofaView ? heights.map(h => <th scope="col" key={h} className="num">{h}</th>) : null}
                {!sofaView ? <th scope="col" className="num">Price</th> : null}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={sofaView ? 5 + heights.length : 6} className="sku-empty">No SKUs match these filters.</td></tr>
              ) : visible.map(s => (
                <tr key={s.erpId}>
                  <td className="sku-code-column">{s.code}</td>
                  <td className="sku-description">{s.description ?? '—'}</td>
                  <td>
                    {s.modelCode ?? '—'}
                    {s.modelName && s.modelName !== s.modelCode ? <div className="sku-model-name">{s.modelName}</div> : null}
                  </td>
                  {sofaView ? (
                    <><td>{categoryLabel(s.category)}</td><td>{tier}</td></>
                  ) : (
                    <>
                      <td>{s.optionLabel !== s.code ? s.optionLabel : categoryLabel(s.category)}</td>
                      <td>{s.brand ?? <span title="Rides any cart; the mattress or sofa decides the ladder">rider</span>}</td>
                    </>
                  )}
                  {sofaView ? heights.map(h => {
                    const current = cellPrice(s.grid, h, tier)
                    return (
                      <td key={h} className="num">
                        {editing ? (
                          <input
                            key={`${s.erpId}|${h}|${tier}`}
                            defaultValue={drafts.current.get(s.erpId)?.cells?.[cellKey(h, tier)]?.price ?? (current === null ? '' : String(current))}
                            onChange={e => touch(s.erpId, d => {
                              d.cells = { ...(d.cells ?? {}), [cellKey(h, tier)]: { height: h, tier, price: e.target.value } }
                            })}
                            disabled={saving} inputMode="decimal" aria-label={`${s.code} at ${h} ${tier}`} className="sku-price-input"
                          />
                        ) : current === null ? '—' : formatMoney(current)}
                      </td>
                    )
                  }) : null}
                  {!sofaView ? <td className="num">
                    {editing && !(s.grid && s.grid.length > 0) ? (
                      <input
                        key={`${s.erpId}|flat`}
                        defaultValue={drafts.current.get(s.erpId)?.price ?? (s.price === null ? '' : String(s.price))}
                        onChange={e => touch(s.erpId, d => { d.price = e.target.value })}
                        disabled={saving} inputMode="decimal" aria-label={`${s.code} price`} className="sku-price-input"
                      />
                    ) : s.grid && s.grid.length > 0 && (s.category ?? '').toUpperCase() === 'SOFA' ? (
                      <button type="button" className="sku-grid-link" disabled={saving} onClick={() => { changeCategory('SOFA'); setModel(modelKey(s)) }}>View prices</button>
                    ) : s.price !== null ? formatMoney(s.price) : s.grid && s.grid.length > 0 ? (
                      <span title="A saved price matrix belongs to this SKU">Matrix price</span>
                    ) : '—'}
                  </td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sku-table-footer">
          <span>{visible.length.toLocaleString()} of {shown.length.toLocaleString()} SKUs shown</span>
          {shown.length > visible.length ? (
            <button type="button" onClick={() => setLimit(l => l + LIMIT_STEP)} className="sku-load-more">Show {Math.min(LIMIT_STEP, shown.length - visible.length)} more</button>
          ) : null}
          {skus.some(s => s.removed) ? (
            <label className="sku-catalogue-filter">
              <span>Catalogue</span>
              <select value={showGone ? 'all' : 'current'} disabled={saving} onChange={e => { setShowGone(e.target.value === 'all'); setModel(''); setLimit(LIMIT_STEP) }}>
                <option value="current">Current SKUs</option>
                <option value="all">Include removed SKUs</option>
              </select>
            </label>
          ) : null}
        </div>
      </div>
    </section>
  )
}
