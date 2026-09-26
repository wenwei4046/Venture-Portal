'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import { heightKey } from '@/lib/catalogue/keys'
import { TIERS } from '@/lib/catalogue/pricing'
import { saveComboPrices } from '../../catalogue-actions'
import type { ComboRow } from '../load'
import { useProductDraftGuard } from './ProductWorkspace'
import {
  buildComboPriceEdits, comboHeightColumns, comboKey, comboPriceAt,
  comboSlotLabel, type ComboDrafts,
} from './combo-pricing'

/** ERP definitions stay read-only; the portal maintains the price of one set. */
export default function ComboPricingTab({ combos }: { combos: ComboRow[] }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [model, setModel] = useState('')
  const [tier, setTier] = useState('all')
  const [editing, setEditing] = useState(false)
  const [drafts, setDrafts] = useState<ComboDrafts>(new Map())
  const [saving, startSaving] = useTransition()
  const saveLock = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  useProductDraftGuard(drafts.size > 0, saving)

  const models = useMemo(() => {
    const options = new Map<string, string>()
    for (const c of combos) options.set(c.baseModel, c.modelName && c.modelName !== c.baseModel
      ? `${c.baseModel} · ${c.modelName}` : c.baseModel)
    return [...options].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
  }, [combos])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return combos.filter(c => {
      if (model && c.baseModel !== model) return false
      if (tier !== 'all' && (c.tier ?? 'any') !== tier) return false
      return !q || [c.baseModel, c.modelName, c.label, comboSlotLabel(c.slots)]
        .some(v => (v ?? '').toLowerCase().includes(q))
    })
  }, [combos, model, query, tier])
  const groups = useMemo(() => {
    const byModel = new Map<string, { baseModel: string; modelName: string | null; combos: ComboRow[] }>()
    for (const c of shown) {
      const group = byModel.get(c.baseModel) ?? { baseModel: c.baseModel, modelName: null, combos: [] }
      if (!group.modelName && c.modelName && c.modelName !== c.baseModel) group.modelName = c.modelName
      group.combos.push(c)
      byModel.set(c.baseModel, group)
    }
    return [...byModel.values()]
  }, [shown])

  function touch(c: ComboRow, height: string, value: string) {
    const key = comboKey(c)
    const h = heightKey(height)!
    setDrafts(previous => {
      const next = new Map(previous)
      const cells = { ...next.get(key) }
      const current = comboPriceAt(c, height)
      if (value === (current === null ? '' : String(current))) delete cells[h]
      else cells[h] = { height, value }
      if (Object.keys(cells).length) next.set(key, cells)
      else next.delete(key)
      return next
    })
  }

  function cancel() {
    if (saveLock.current) return
    setDrafts(new Map())
    setEditing(false)
    setError(null)
  }

  function save() {
    if (saveLock.current || drafts.size === 0) return
    saveLock.current = true
    setError(null)
    setNotice(null)
    startSaving(async () => {
      try {
        const edits = buildComboPriceEdits(combos, drafts)
        const result = await saveComboPrices(edits)
        setDrafts(new Map())
        setEditing(false)
        setNotice(`${result.saved} combo${result.saved === 1 ? '' : 's'} saved. New sales lines use these prices. To update an existing month, recost its orders in Comm Cal.`)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the combo prices')
      } finally {
        saveLock.current = false
      }
    })
  }

  return (
    <section className="sku-master combo-workspace" aria-label="Combo Pricing">
      <div className="sku-filters">
        <div className="sku-filter-controls combo-filter-controls">
          <label className="sku-search">
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
              <circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" />
            </svg>
            <input type="search" value={query} disabled={saving} onChange={e => setQuery(e.target.value)}
              placeholder="Search combo or module…" aria-label="Search combos" />
          </label>
          <label className="sku-model-filter">
            <span>Model</span>
            <select value={model} disabled={saving} onChange={e => setModel(e.target.value)}>
              <option value="">All models</option>
              {models.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <div className="sku-tier-filter" role="group" aria-label="Combo tier">
            <span>Tier</span>
            <div className="sku-tier-options">
              {[['all', 'All'], ...TIERS.map((t, i) => [t, `P${i + 1}`]), ['any', 'Any']].map(([value, label]) => (
                <button key={value} type="button" aria-pressed={tier === value} disabled={saving} onClick={() => setTier(value)}>{label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="sku-actions">
        <p className="sku-count" aria-live="polite"><strong>{shown.length.toLocaleString()}</strong> combo{shown.length === 1 ? '' : 's'}{model ? ` · Model ${model}` : ''} · Price per set (RM)</p>
        <div className="sku-action-buttons">
          {editing ? <>
            <button type="button" onClick={cancel} disabled={saving} className="sku-secondary-button">Cancel</button>
            <button type="button" onClick={save} disabled={saving || drafts.size === 0} className="sku-primary-button">
              {saving ? 'Saving…' : drafts.size === 0 ? 'Save changes' : `Save ${drafts.size} combo${drafts.size === 1 ? '' : 's'}`}
            </button>
          </> : <button type="button" onClick={() => { setEditing(true); setNotice(null) }} className="sku-primary-button" disabled={combos.length === 0}>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
              <path d="m12.5 3.5 4 4M3 17l1-5L13.5 2.5a1.4 1.4 0 0 1 2 0l2 2a1.4 1.4 0 0 1 0 2L8 16l-5 1Z" />
            </svg>
            Edit Prices
          </button>}
        </div>
      </div>
      {editing ? <p className="sku-edit-note">Blank clears a price. Zero is stored; only a positive combo price replaces module prices. Changes across models and tiers are saved together.</p> : null}
      {error ? <p className="sku-notice" data-tone="error" role="alert">{error}</p> : null}
      {notice ? <p className="sku-notice" data-tone="ok" role="status">{notice}</p> : null}

      <div className="sku-table-panel combo-panel">
        <div className="sku-table-window combo-window" tabIndex={0} role="region" aria-label="Combo prices">
          {shown.length === 0 ? <p className="sku-empty combo-empty">No combos match these filters.</p> : groups.map(group => (
            <section key={group.baseModel} className="combo-group" aria-label={`Model ${group.baseModel}`}>
              <h3 className="combo-group-head">
                <strong>{group.baseModel}</strong>
                {group.modelName ? <span className="combo-group-name">{group.modelName}</span> : null}
                <span className="combo-group-count">{group.combos.length} combo{group.combos.length === 1 ? '' : 's'}</span>
              </h3>
              <div className="combo-grid">
                {group.combos.map(c => {
                  const key = comboKey(c)
                  const name = c.label ?? 'Unnamed combo'
                  return <article key={key} className="combo-card" aria-label={`${c.baseModel} ${name} ${c.tier ? c.tier.replace('PRICE_', 'P') : 'any tier'}`}>
                    <header className="combo-card-head">
                      <span className="combo-model-chip">{c.baseModel}</span>
                      <strong className="combo-card-title">{name}</strong>
                      {c.isNew ? <span className="chip accent">New</span> : null}
                      <span className="combo-tier-badge">{c.tier ? `Fabric tier ${c.tier.replace('PRICE_', '')}` : 'Any tier'}</span>
                    </header>
                    <div className="combo-slots" aria-label={`${c.slots.length} module${c.slots.length === 1 ? '' : 's'} in one set`}>
                      {c.slots.map((slot, index) => <span key={index} className="combo-slot">{index > 0 ? <span aria-hidden="true"> + </span> : null}{slot.join(' or ')}</span>)}
                      {c.slots.length === 0 ? 'No modules defined' : null}
                    </div>
                    <div className="combo-heights">
                      {comboHeightColumns([c]).map(h => {
                        const current = comboPriceAt(c, h)
                        const historical = !c.heights.some(value => heightKey(value) === heightKey(h))
                        const draft = drafts.get(key)?.[heightKey(h)!]
                        return <div key={h} className="combo-cell" data-priced={current !== null || undefined} data-edited={draft ? true : undefined} data-historical={historical || undefined}
                          title={historical ? 'Previously priced seat size; no longer listed by the ERP' : undefined}>
                          <span className="combo-cell-height">{h}</span>
                          {editing ? <input
                            value={draft?.value ?? (current === null ? '' : String(current))}
                            onChange={e => touch(c, h, e.target.value)}
                            disabled={saving} inputMode="decimal" className="sku-price-input combo-price-input"
                            aria-label={`${c.baseModel} ${name} ${c.tier ?? 'any tier'} at ${h}`}
                          /> : <span className="combo-cell-price num">{current === null ? '—' : formatMoney(current)}</span>}
                        </div>
                      })}
                    </div>
                    <footer className="combo-card-foot">Effective <time dateTime={c.effectiveFrom}>{c.effectiveFrom}</time></footer>
                  </article>
                })}
              </div>
            </section>
          ))}
        </div>
        <div className="sku-table-footer">
          <span>{shown.length.toLocaleString()} of {combos.length.toLocaleString()} combos shown</span>
          <span className="combo-definition-note">One module per group; “or” means alternatives. Seat sizes and modules follow the ERP.</span>
        </div>
      </div>
    </section>
  )
}
