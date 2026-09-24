'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { isRiderModel, RIDER } from '@/lib/catalogue/options'
import type { BrandRef, CatalogueModel, MaintenanceOption } from '../load'
import ModelEditor from './ModelEditor'
import { categoryLabel, orderedCategories } from './ui'

type Show = 'all' | 'offered' | 'not-offered' | 'new'

/** ERP models beside the portal's own calculator selections. Prices stay in SKU Master. */
export default function ModularTab({ models, brands, options }: {
  models: CatalogueModel[]
  brands: BrandRef[]
  options: MaintenanceOption[]
}) {
  const [category, setCategory] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [show, setShow] = useState<Show>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const saveInFlight = useRef(false)
  const [pending, setPending] = useState<string | null>(null)
  const [limit, setLimit] = useState(200)
  const [notice, setNotice] = useState<string | null>(null)

  const live = useMemo(() => models.filter(m => !m.removed), [models])
  const categories = useMemo(() => orderedCategories(live.map(m => m.category)), [live])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return live.filter(m => {
      if (category !== null && (m.category ?? '').toUpperCase() !== category) return false
      if (show === 'offered' && !m.offered) return false
      if (show === 'not-offered' && m.offered) return false
      if (show === 'new' && !m.isNew && !m.skus.some(s => s.isNew && !s.removed)) return false
      return !q || [m.code, m.name, m.brand, m.branding, ...m.skus.map(s => s.code)]
        .some(v => (v ?? '').toLowerCase().includes(q))
    })
  }, [live, category, query, show])
  // Deliberately independent of the filters: searching never unmounts an unsaved editor.
  const selected = models.find(m => m.erpId === open)
  const visible = shown.slice(0, limit)
  const savingChanged = useCallback((value: boolean) => {
    saveInFlight.current = value
    setSaving(value)
    if (value) setPending(null)
  }, [])

  function choose(id: string) {
    if (saveInFlight.current || id === open) return
    if (dirty) { setPending(id); return }
    setOpen(id)
    setNotice(null)
  }

  function close() {
    setOpen(null)
    setPending(null)
    setDirty(false)
    setSaving(false)
  }

  return (
    <section className="sku-master" aria-label="Modular models">
      <div className="sku-filters">
        <div className="sku-categories" role="group" aria-label="Model categories">
          <button type="button" className="sku-chip" aria-pressed={category === null} disabled={saving} onClick={() => { setCategory(null); setLimit(200) }}>All</button>
          {categories.map(c => <button key={c} type="button" className="sku-chip" aria-pressed={category === c} disabled={saving} onClick={() => { setCategory(c); setLimit(200) }}>{categoryLabel(c)}</button>)}
        </div>
        <div className="sku-filter-controls">
          <div className="sku-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
            <input type="search" aria-label="Search models" placeholder="Search model, name, brand or SKU…" value={query} disabled={saving} onChange={e => { setQuery(e.target.value); setLimit(200) }} />
          </div>
          <label className="sku-model-filter">
            <span>Show</span>
            <select value={show} disabled={saving} onChange={e => { setShow(e.target.value as Show); setLimit(200) }}>
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
        <p className="sku-count">Choose a model to set its calculator options.</p>
      </div>
      {notice ? <p className="sku-notice" role="status">{notice}</p> : null}
      {pending ? (
        <div className="sku-notice modular-switch-notice" role="alert">
          <span>{selected?.code} has unsaved changes.</span>
          <div className="sku-action-buttons">
            <button type="button" className="sku-secondary-button" disabled={saving} onClick={() => { if (!saveInFlight.current) setPending(null) }}>Keep editing</button>
            <button type="button" className="sku-secondary-button" disabled={saving} onClick={() => { if (saveInFlight.current) return; setOpen(pending); setPending(null); setDirty(false) }}>Discard and switch</button>
          </div>
        </div>
      ) : null}
      <div className={`modular-workspace${selected ? ' is-editing' : ''}`}>
        <div className="sku-table-panel modular-model-list">
          <div className="sku-table-window table-scroll" role="region" aria-label="Models table" tabIndex={0}>
            <table className="ledger-table sku-table modular-table">
              <thead><tr>
                <th scope="col" className="sku-code-column">Model</th><th scope="col">Category</th><th scope="col">Margin ladder</th>
                <th scope="col">Selected SKUs</th><th scope="col">Calculator</th><th scope="col">Status</th>
              </tr></thead>
              <tbody>
                {visible.length === 0 ? <tr><td colSpan={6} className="sku-empty">No models match these filters.</td></tr> : visible.map(m => {
                  const activeSkus = m.skus.filter(s => !s.removed && s.active)
                  const ticked = activeSkus.filter(s => s.offered).length
                  const ladder = m.brand && m.brand !== RIDER ? m.brand : isRiderModel(m.category, m.brandOverride) ? 'Rider' : 'Not assigned'
                  return <tr key={m.erpId} data-selected={m.erpId === open}>
                    <td className="sku-code-column">
                      <button type="button" className="modular-model-button" aria-label={`Configure ${m.code}`} aria-pressed={m.erpId === open} disabled={saving} onClick={() => choose(m.erpId)}>{m.code}</button>
                      {m.name && m.name !== m.code ? <span className="sku-model-name">{m.name}</span> : null}
                    </td>
                    <td>{categoryLabel(m.category)}</td><td>{ladder}</td>
                    <td className="whitespace-nowrap">{ticked} / {activeSkus.length}</td>
                    <td className="whitespace-nowrap">{m.offered ? 'Offered' : 'Not offered'}</td>
                    <td className="sku-status">{!m.active ? 'Inactive' : m.isNew ? 'New model' : m.skus.some(s => s.isNew && !s.removed) ? 'New SKU' : 'Active'}</td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
          <div className="sku-table-footer">
            <span>{visible.length.toLocaleString()} of {shown.length.toLocaleString()} models shown</span>
            {shown.length > visible.length ? <button type="button" className="sku-load-more" disabled={saving} onClick={() => setLimit(n => n + 200)}>Show {Math.min(200, shown.length - visible.length)} more</button> : null}
          </div>
        </div>
        {selected ? <ModelEditor key={selected.erpId} model={selected} brands={brands} options={options} onClose={close} onDirtyChange={setDirty} onSavingChange={savingChanged} onSaved={() => setNotice(`${selected.code} saved. Calculator selections are updated.`)} /> : null}
      </div>
    </section>
  )
}
