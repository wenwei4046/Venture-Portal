'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import { heightKey, valueKey } from '@/lib/catalogue/keys'
import { CALC_CATEGORIES, calcCategoryOf, defaultGift, erpAllows, isRestricted, isRiderModel, optionKeysOf, RIDER, skuKeyOf, type OptionKey } from '@/lib/catalogue/options'
import { saveModelSettings } from '../../catalogue-actions'
import type { BrandRef, CatalogueModel, MaintenanceOption } from '../load'
import { useProductDraftGuard } from './ProductWorkspace'

function priceBadge(s: CatalogueModel['skus'][number]) {
  if (s.grid?.length) return <><span>Matrix price</span>{s.price !== null ? <span className="block">Fallback {formatMoney(s.price)}</span> : null}</>
  if (s.price !== null) return formatMoney(s.price)
  return 'No price'
}

/** Portal selections remain distinct from the ERP allowlist and from price editing. */
export default function ModelEditor({ model, brands, options, onClose, onDirtyChange, onSavingChange, onSaved }: {
  model: CatalogueModel
  brands: BrandRef[]
  options: MaintenanceOption[]
  onClose: () => void
  onDirtyChange?: (dirty: boolean) => void
  onSavingChange?: (saving: boolean) => void
  onSaved?: () => void
}) {
  const router = useRouter()
  const [saving, startSaving] = useTransition()
  const saveInFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [offered, setOffered] = useState(model.offered)
  const [skuTicks, setSkuTicks] = useState<Record<string, boolean>>(() => Object.fromEntries(model.skus.map(s => [s.erpId, s.offered])))
  const [enabled, setEnabled] = useState<Record<string, string[]>>(() => ({ ...model.enabled }))
  const [gift, setGift] = useState<boolean | null>(model.giftOverride)
  const [calc, setCalc] = useState<string | null>(model.calcOverride)
  const [brand, setBrand] = useState<string | null>(model.brandOverride)
  const [initial] = useState(() => JSON.stringify({ offered: model.offered, skuTicks: Object.fromEntries(model.skus.map(s => [s.erpId, s.offered])), enabled: model.enabled, gift: model.giftOverride, calc: model.calcOverride, brand: model.brandOverride }))
  const dirty = JSON.stringify({ offered, skuTicks, enabled, gift, calc, brand }) !== initial
  useProductDraftGuard(dirty, saving)
  const skuKey = skuKeyOf(model.category)
  const optionKeys = optionKeysOf(model.category)
  const derivedCalc = calcCategoryOf(model.category, model.name ?? model.code)
  const liveSkus = model.skus.filter(s => !s.removed && s.active)
  const missingLadder = !isRiderModel(model.category, brand) && !(brand ?? model.derivedBrand)

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  const optionPrice = useMemo(() => new Map(options.map(o => [`${o.pool}\u0000${valueKey(o.value)}`, o.price])), [options])
  const poolValues = useMemo(() => {
    const byPool = new Map<string, MaintenanceOption[]>()
    for (const o of options) if (o.active && !o.removed) byPool.set(o.pool, [...(byPool.get(o.pool) ?? []), o])
    return new Map([...byPool].map(([pool, list]) => [pool, list.sort((a, b) => a.sortOrder - b.sortOrder || a.value.localeCompare(b.value)).map(o => o.value)]))
  }, [options])

  function erpFor(o: OptionKey): string[] {
    return erpAllows(model.allowed, o.key, poolValues.get(o.pool) ?? [])
  }
  function chipsFor(o: OptionKey): string[] {
    const erp = erpFor(o)
    const seen = new Set(erp.map(valueKey))
    return [...erp, ...(enabled[o.key] ?? []).filter(v => !seen.has(valueKey(v)))]
  }
  function isOn(key: string, value: string) {
    return (enabled[key] ?? []).some(v => valueKey(v) === valueKey(value))
  }
  function toggle(key: string, value: string) {
    setEnabled(prev => {
      const list = prev[key] ?? []
      return { ...prev, [key]: list.some(v => valueKey(v) === valueKey(value)) ? list.filter(v => valueKey(v) !== valueKey(value)) : [...list, value] }
    })
  }
  function turnOn(on: boolean) {
    setOffered(on)
    const untouched = !model.configured && Object.values(skuTicks).every(v => !v) && Object.keys(enabled).length === 0
    if (on && untouched) {
      setSkuTicks(Object.fromEntries(model.skus.map(s => [s.erpId, !s.removed && s.active])))
      setEnabled(Object.fromEntries(optionKeys.map(o => [o.key, erpFor(o)])))
      setNote('Selected the current SKUs and allowed options. Untick anything the calculator should not offer.')
    }
  }
  function save() {
    if (saveInFlight.current) return
    saveInFlight.current = true
    onSavingChange?.(true)
    setError(null)
    startSaving(async () => {
      try {
        await saveModelSettings({ erpModelId: model.erpId, offered, enabled: Object.fromEntries(optionKeys.map(o => [o.key, enabled[o.key] ?? []])), gift, calcCategory: calc, brandCode: brand, skuOffered: skuTicks })
        router.refresh()
        onSaved?.()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the model')
      } finally {
        saveInFlight.current = false
        onSavingChange?.(false)
      }
    })
  }

  return (
    <section className="modular-editor" aria-label={`Configure model ${model.code}`} data-product-dirty={dirty} data-product-saving={saving}>
      <header className="modular-editor-header">
        <div>
          <h2 className="font-medium">{model.code}{model.name && model.name !== model.code ? ` · ${model.name}` : ''}</h2>
          <p className="text-xs mt-1">{model.category ?? 'Uncategorised'}{model.branding ? ` · ${model.branding}` : ''}{!model.active ? ' · Inactive in ERP' : ''}</p>
        </div>
        <p className="text-xs mt-2">Select what this model offers in the Revenue calculator.</p>
      </header>
      <div className="modular-editor-body">
        {error ? <p className="sku-notice" data-tone="error" role="alert">{error}</p> : null}
        {note ? <p className="sku-notice" role="status">{note}</p> : null}
        {missingLadder ? <p className="sku-notice" data-tone="error">Choose a margin ladder below before this {categoryName(model.category)} can appear in the calculator.</p> : null}
        <fieldset disabled={saving} className="min-w-0">
          <legend className="sr-only">Model settings</legend>
          <div className="modular-editor-section">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={offered} onChange={e => turnOn(e.target.checked)} />
              Offered in the Revenue calculator
            </label>
          </div>
          <section className="modular-editor-section" aria-label="SKU selections">
            <div className="modular-section-title">
              <h3 className="text-sm font-medium">{skuKey === 'compartments' ? 'Compartments' : skuKey === 'sizes' ? 'Sizes' : 'SKUs'}</h3>
              <span className="text-xs">{liveSkus.filter(s => skuTicks[s.erpId]).length} / {liveSkus.length} selected</span>
              <button type="button" className="sku-grid-link text-xs" onClick={() => setSkuTicks(Object.fromEntries(model.skus.map(s => [s.erpId, !s.removed && s.active])))}>Select all</button>
              <button type="button" className="sku-grid-link text-xs" onClick={() => setSkuTicks(Object.fromEntries(model.skus.map(s => [s.erpId, false])))}>Clear all</button>
            </div>
            {model.skus.length === 0 ? <p className="text-xs">No SKUs are linked to this model in the ERP.</p> : (
              <div className="modular-option-grid">
                {model.skus.map(s => <label key={s.erpId} className="modular-option" data-selected={skuTicks[s.erpId] ?? false}>
                  <input type="checkbox" aria-label={`Offer SKU ${s.code}`} checked={skuTicks[s.erpId] ?? false} disabled={(s.removed || !s.active) && !skuTicks[s.erpId]} onChange={e => setSkuTicks(prev => ({ ...prev, [s.erpId]: e.target.checked }))} />
                  <span><span className="font-medium">{s.optionLabel}</span><span className="block text-xs">{s.code}</span><span className="block text-xs">{priceBadge(s)}{s.removed ? ' · Removed' : !s.active ? ' · Inactive' : s.isNew ? ' · New' : ''}</span></span>
                </label>)}
              </div>
            )}
          </section>
          {optionKeys.map(o => {
            const chips = chipsFor(o)
            const allowed = new Set(erpFor(o).map(valueKey))
            const restricted = isRestricted(model.allowed, o.key)
            const label = o.key === 'sizes' && (model.category ?? '').toUpperCase() === 'SOFA' ? 'Seat sizes (inches)' : o.label
            return <section key={o.key} className="modular-editor-section" aria-label={label}>
              <div className="modular-section-title">
                <h3 className="text-sm font-medium">{label}</h3>
                <span className="text-xs">{chips.filter(v => isOn(o.key, v)).length} / {chips.length} selected</span>
                {chips.length > 0 ? <>
                  <button type="button" className="sku-grid-link text-xs" onClick={() => setEnabled(prev => ({ ...prev, [o.key]: erpFor(o) }))}>Select all</button>
                  <button type="button" className="sku-grid-link text-xs" onClick={() => setEnabled(prev => ({ ...prev, [o.key]: [] }))}>Clear all</button>
                </> : null}
              </div>
              {chips.length === 0 ? <p className="text-xs">{restricted ? 'No options are available for this model.' : 'The Maintenance list is empty.'}</p> : (
                <div className="modular-option-grid">
                  {chips.map(v => {
                    const on = isOn(o.key, v)
                    const stale = !allowed.has(valueKey(v))
                    const surcharge = o.priced ? optionPrice.get(`${o.pool}\u0000${valueKey(v)}`) : undefined
                    return <label key={v} className="modular-option" data-selected={on}>
                      <input type="checkbox" aria-label={`${label}: ${v}`} checked={on} disabled={stale && !on} onChange={() => toggle(o.key, v)} />
                      <span><span className="font-medium">{v}</span>
                        {stale ? <span className="block text-xs">No longer allowed by ERP</span> : null}
                        {o.key === 'sizes' && (model.category ?? '').toUpperCase() === 'SOFA' ? <span className="block text-xs">{liveSkus.filter(s => (s.grid ?? []).some(c => heightKey(c.height) === heightKey(v))).length} / {liveSkus.length} with matrix price</span> : null}
                        {o.priced ? <span className="block text-xs">{surcharge === undefined || surcharge === null ? 'No surcharge entered' : `${surcharge < 0 ? '−' : '+'}${formatMoney(Math.abs(surcharge))}`}</span> : null}
                      </span>
                    </label>
                  })}
                </div>
              )}
            </section>
          })}
          <section className="modular-overrides" aria-label="Calculator defaults">
            <h3 className="text-sm font-medium">Calculator defaults</h3>
            <label><span>Calculator section</span><select value={calc ?? ''} onChange={e => setCalc(e.target.value || null)}>
              <option value="">{derivedCalc} (ERP default)</option>
              {CALC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select></label>
            <label><span>Free gift</span><select value={gift === null ? '' : gift ? 'yes' : 'no'} onChange={e => setGift(e.target.value === '' ? null : e.target.value === 'yes')}>
              <option value="">{defaultGift(calc ?? derivedCalc) ? 'May be a gift (default)' : 'Not a gift (default)'}</option><option value="yes">May be a gift</option><option value="no">Not a gift</option>
            </select></label>
            <label><span>Margin ladder</span><select value={brand ?? ''} onChange={e => setBrand(e.target.value || null)}>
              <option value="">{model.derivedBrand ? `${model.derivedBrand} (ERP default)` : isRiderModel(model.category, null) ? 'Rider (ERP default)' : 'Not assigned (ERP default)'}</option>
              {brand && brand !== RIDER && !brands.some(b => b.code === brand) ? <option value={brand}>{brand} (unavailable)</option> : null}
              {brands.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
              <option value={RIDER}>Rider — no brand of its own</option>
            </select></label>
          </section>
        </fieldset>
      </div>
      <footer className="modular-editor-footer">
        <span className="text-xs" role="status">{saving ? 'Saving model…' : dirty ? 'Unsaved changes' : 'No unsaved changes'}</span>
        <div className="sku-action-buttons">
          <button type="button" className="sku-secondary-button" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="sku-primary-button" onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save model'}</button>
        </div>
      </footer>
    </section>
  )
}

function categoryName(category: string | null) {
  return (category ?? '').toUpperCase() === 'SOFA' ? 'sofa' : 'mattress'
}
