'use client'

import { useCallback, useMemo, useState } from 'react'
import { isRiderModel, RIDER } from '@/lib/catalogue/options'
import type { BrandRef, CatalogueModel, MaintenanceOption } from '../load'
import ModelEditor from './ModelEditor'
import { categoryLabel, orderedCategories } from './ui'

type Show = 'all' | 'offered' | 'not-offered' | 'new'

/**
 * ERP models, one card each, grouped by category the way the ERP's own
 * Modular page is. A card opens the model in a floating window.
 * Prices stay on SKU Master, Maintenance and Combo Pricing.
 */
export default function ModularTab({ models, brands, options }: {
  models: CatalogueModel[]
  brands: BrandRef[]
  options: MaintenanceOption[]
}) {
  const [category, setCategory] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [show, setShow] = useState<Show>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [limit, setLimit] = useState(200)
  const [notice, setNotice] = useState<string | null>(null)

  const live = useMemo(() => models.filter(m => !m.removed), [models])
  const categories = useMemo(() => orderedCategories(live.map(m => m.category)), [live])
  /** The filtered models in the order they are drawn: category by category. */
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matching = live.filter(m => {
      if (category !== null && (m.category ?? '').toUpperCase() !== category) return false
      if (show === 'offered' && !m.offered) return false
      if (show === 'not-offered' && m.offered) return false
      if (show === 'new' && !m.isNew && !m.skus.some(s => s.isNew && !s.removed)) return false
      return !q || [m.code, m.name, m.brand, m.branding, ...m.skus.map(s => s.code)]
        .some(v => (v ?? '').toLowerCase().includes(q))
    })
    const rank = (m: CatalogueModel) => {
      const i = categories.indexOf((m.category ?? '').toUpperCase())
      return i === -1 ? categories.length : i
    }
    return matching.map((m, i) => ({ m, i })).sort((a, b) => rank(a.m) - rank(b.m) || a.i - b.i).map(x => x.m)
  }, [live, categories, category, query, show])
  const visible = shown.slice(0, limit)
  const groups = useMemo(() => {
    const byCategory = new Map<string, CatalogueModel[]>()
    for (const m of visible) {
      const key = (m.category ?? '').toUpperCase()
      byCategory.set(key, [...(byCategory.get(key) ?? []), m])
    }
    return [...byCategory]
  }, [visible])
  // Deliberately independent of the filters: searching never unmounts an unsaved window.
  const selected = models.find(m => m.erpId === open)
  const index = selected ? shown.findIndex(m => m.erpId === selected.erpId) : -1

  const step = useCallback((dir: -1 | 1) => {
    const next = shown[index + dir]
    if (next) setOpen(next.erpId)
  }, [shown, index])

  return (
    <section className="sku-master" aria-label="Modular models">
      <div className="sku-filters">
        <div className="sku-categories" role="group" aria-label="Model categories">
          <button type="button" className="sku-chip" aria-pressed={category === null} onClick={() => { setCategory(null); setLimit(200) }}>All</button>
          {categories.map(c => <button key={c} type="button" className="sku-chip" aria-pressed={category === c} onClick={() => { setCategory(c); setLimit(200) }}>{categoryLabel(c)}</button>)}
        </div>
        <div className="sku-filter-controls">
          <div className="sku-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
            <input type="search" aria-label="Search models" placeholder="Search model, name, brand or SKU…" value={query} onChange={e => { setQuery(e.target.value); setLimit(200) }} />
          </div>
          <label className="sku-model-filter">
            <span>Show</span>
            <select value={show} onChange={e => { setShow(e.target.value as Show); setLimit(200) }}>
              <option value="all">All models</option>
              <option value="offered">Offered</option>
              <option value="not-offered">Not offered</option>
              <option value="new">New models or SKUs</option>
            </select>
          </label>
        </div>
      </div>
      <div className="sku-actions">
        <p className="sku-count"><strong>{shown.length.toLocaleString()}</strong> models{category ? ` · ${categoryLabel(category)}` : ''}</p>
        <p className="sku-count">Click a model to set its calculator options.</p>
      </div>
      {notice ? <p className="sku-notice" role="status">{notice}</p> : null}
      <div className="sku-table-panel">
        <div className="sku-table-window modular-board" role="region" aria-label="Models" tabIndex={0}>
          {visible.length === 0 ? <p className="modular-board-empty">No models match these filters.</p> : groups.map(([cat, list]) => (
            <section key={cat || 'none'} className="modular-group" aria-label={`${categoryLabel(cat || null)} models`}>
              <h3 className="modular-group-head">
                <span className="modular-group-chip">{cat ? categoryLabel(cat) : 'Uncategorised'}</span>
                <span>{list.length} {list.length === 1 ? 'model' : 'models'}</span>
              </h3>
              <div className="modular-cards">
                {list.map(m => {
                  const activeSkus = m.skus.filter(s => !s.removed && s.active)
                  const ticked = activeSkus.filter(s => s.offered).length
                  const ladder = m.brand && m.brand !== RIDER ? m.brand : isRiderModel(m.category, m.brandOverride) ? 'Rider' : 'No ladder'
                  const status = !m.active ? 'Inactive' : m.isNew ? 'New model' : m.skus.some(s => s.isNew && !s.removed) ? 'New SKU' : null
                  return <button key={m.erpId} type="button" className="modular-card" data-offered={m.offered} data-open={m.erpId === open}
                    aria-label={`Configure ${m.code}`} onClick={() => { setOpen(m.erpId); setNotice(null) }}>
                    <span className="modular-card-top">
                      <strong>{m.code}</strong>
                      <span className="modular-card-state">{m.offered ? 'Offered' : 'Not offered'}</span>
                    </span>
                    {m.name && m.name !== m.code ? <span className="modular-card-name">{m.name}</span> : null}
                    <span className="modular-card-meta">
                      <span>{ladder}</span>
                      <span>{ticked} / {activeSkus.length} {activeSkus.length === 1 ? 'SKU' : 'SKUs'}</span>
                      {status ? <span data-flag>{status}</span> : null}
                    </span>
                  </button>
                })}
              </div>
            </section>
          ))}
        </div>
        <div className="sku-table-footer">
          <span>{visible.length.toLocaleString()} of {shown.length.toLocaleString()} models shown</span>
          {shown.length > visible.length ? <button type="button" className="sku-load-more" onClick={() => setLimit(n => n + 200)}>Show {Math.min(200, shown.length - visible.length)} more</button> : null}
        </div>
      </div>
      {selected ? <ModelEditor
        key={selected.erpId}
        model={selected}
        brands={brands}
        options={options}
        position={index === -1 ? null : { index, total: shown.length, category }}
        onClose={() => setOpen(null)}
        onStep={step}
        onSaved={setNotice}
      /> : null}
    </section>
  )
}
