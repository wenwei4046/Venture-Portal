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
  const heights = useMemo(() => comboHeightColumns(shown), [shown])

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

      <div className="sku-table-panel">
        <div className="sku-table-window table-scroll" tabIndex={0} role="region" aria-label="Combo prices table">
          <table className="ledger-table sku-table">
            <thead><tr>
              <th scope="col" className="sku-code-column">Combo</th>
              <th scope="col">Model</th>
              <th scope="col">Tier</th>
              <th scope="col">Modules in one set</th>
              {heights.map(h => <th scope="col" key={h} className="num">{h}</th>)}
              <th scope="col">Effective from</th>
            </tr></thead>
            <tbody>
              {shown.length === 0 ? <tr><td colSpan={5 + heights.length} className="sku-empty">No combos match these filters.</td></tr> : shown.map(c => {
                const key = comboKey(c)
                const available = new Set(comboHeightColumns([c]).map(heightKey))
                return <tr key={key}>
                  <td className="sku-code-column"><strong>{c.label ?? 'Unnamed combo'}</strong>{c.isNew ? <span className="chip ml-2">New</span> : null}</td>
                  <td>{c.baseModel}{c.modelName && c.modelName !== c.baseModel ? <span className="sku-model-name">{c.modelName}</span> : null}</td>
                  <td className="combo-tier">{c.tier ? c.tier.replace('PRICE_', 'P') : 'Any tier'}</td>
                  <td className="combo-modules">
                    <div className="combo-slots" aria-label={`${c.slots.length} module${c.slots.length === 1 ? '' : 's'} in one set`}>
                      {c.slots.map((slot, index) => <span key={index} className="combo-slot">{index > 0 ? <span aria-hidden="true"> + </span> : null}{slot.join(' or ')}</span>)}
                      {c.slots.length === 0 ? 'No modules defined' : null}
                    </div>
                  </td>
                  {heights.map(h => {
                    const current = comboPriceAt(c, h)
                    const supported = available.has(heightKey(h))
                    const rawHeight = c.heights.find(value => heightKey(value) === heightKey(h))
                      ?? Object.keys(c.prices).find(value => heightKey(value) === heightKey(h)) ?? h
                    const historical = !c.heights.some(value => heightKey(value) === heightKey(h))
                    return <td key={h} className="num" title={!supported ? 'This seat size is not defined for this combo' : historical ? 'Previously priced seat size; no longer listed by the ERP' : undefined}>
                      {editing && supported ? <input
                        value={drafts.get(key)?.[heightKey(h)!]?.value ?? (current === null ? '' : String(current))}
                        onChange={e => touch(c, rawHeight, e.target.value)}
                        disabled={saving} inputMode="decimal" className="sku-price-input"
                        aria-label={`${c.baseModel} ${c.label ?? 'Unnamed combo'} ${c.tier ?? 'any tier'} at ${rawHeight}`}
                      /> : current === null ? '—' : formatMoney(current)}
                    </td>
                  })}
                  <td className="sku-status">{c.effectiveFrom}</td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
        <div className="sku-table-footer">
          <span>{shown.length.toLocaleString()} of {combos.length.toLocaleString()} combos shown</span>
          <span className="combo-definition-note">One module per group; “or” means alternatives. Seat sizes and modules follow the ERP.</span>
        </div>
      </div>
    </section>
  )
}
