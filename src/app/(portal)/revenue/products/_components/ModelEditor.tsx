'use client'

import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { valueKey } from '@/lib/catalogue/keys'
import { CALC_CATEGORIES, calcCategoryOf, defaultGift, erpAllows, isRestricted, isRiderModel, optionKeysOf, RIDER, skuKeyOf, type OptionKey } from '@/lib/catalogue/options'
import { saveModelSettings } from '../../catalogue-actions'
import type { BrandRef, CatalogueModel, MaintenanceOption } from '../load'
import { useProductDraftGuard } from './ProductWorkspace'
import { categoryLabel } from './ui'

type Leave = { kind: 'close' } | { kind: 'step'; dir: -1 | 1 }

interface Draft {
  offered: boolean
  skuTicks: Record<string, boolean>
  enabled: Record<string, string[]>
  gift: boolean | null
  calc: string | null
  brand: string | null
}

/** How many ticks, switches and selects differ from what is saved. Ticking and unticking again is no change. */
export function countChanges(saved: Draft, draft: Draft, keys: readonly string[]): number {
  let n = 0
  if (saved.offered !== draft.offered) n++
  for (const id of new Set([...Object.keys(saved.skuTicks), ...Object.keys(draft.skuTicks)])) {
    if (!!saved.skuTicks[id] !== !!draft.skuTicks[id]) n++
  }
  for (const key of keys) {
    const a = new Set((saved.enabled[key] ?? []).map(valueKey))
    const b = new Set((draft.enabled[key] ?? []).map(valueKey))
    for (const v of a) if (!b.has(v)) n++
    for (const v of b) if (!a.has(v)) n++
  }
  if (saved.gift !== draft.gift) n++
  if (saved.calc !== draft.calc) n++
  if (saved.brand !== draft.brand) n++
  return n
}

/**
 * One model in a floating window, on one sheet: the calculator listing on top,
 * then every selection. Portal selections only — prices live on SKU Master,
 * Maintenance and Combo Pricing.
 */
export default function ModelEditor({ model, brands, options, position, onClose, onStep, onDirtyChange, onSavingChange, onSaved }: {
  model: CatalogueModel
  brands: BrandRef[]
  options: MaintenanceOption[]
  /** Where this model sits in the filtered list, for the eyebrow and ‹ ›. */
  position?: { index: number; total: number; category: string | null } | null
  onClose: () => void
  onStep?: (dir: -1 | 1) => void
  onDirtyChange?: (dirty: boolean) => void
  onSavingChange?: (saving: boolean) => void
  onSaved?: (message: string) => void
}) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [saving, startSaving] = useTransition()
  const saveInFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [guard, setGuard] = useState<Leave | null>(null)
  const [saved] = useState<Draft>(() => ({
    offered: model.offered,
    skuTicks: Object.fromEntries(model.skus.map(s => [s.erpId, s.offered])),
    enabled: { ...model.enabled },
    gift: model.giftOverride,
    calc: model.calcOverride,
    brand: model.brandOverride,
  }))
  const [offered, setOffered] = useState(saved.offered)
  const [skuTicks, setSkuTicks] = useState(saved.skuTicks)
  const [enabled, setEnabled] = useState(saved.enabled)
  const [gift, setGift] = useState(saved.gift)
  const [calc, setCalc] = useState(saved.calc)
  const [brand, setBrand] = useState(saved.brand)
  const skuKey = skuKeyOf(model.category)
  const optionKeys = optionKeysOf(model.category)
  const changes = countChanges(saved, { offered, skuTicks, enabled, gift, calc, brand }, optionKeys.map(o => o.key))
  const dirty = changes > 0
  useProductDraftGuard(dirty, saving)
  const derivedCalc = calcCategoryOf(model.category, model.name ?? model.code)
  const liveSkus = model.skus.filter(s => !s.removed && s.active)
  const missingLadder = !isRiderModel(model.category, brand) && !(brand ?? model.derivedBrand)
  const hasPrev = !!position && position.index > 0
  const hasNext = !!position && position.index < position.total - 1

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  // Native modality: the list behind is inert, Esc is ours, focus returns to the card.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const main = dialog.closest('main')
    const mainOverflow = main?.style.overflow ?? ''
    if (main) main.style.overflow = 'hidden'
    if (!dialog.open) dialog.showModal?.()
    dialog.focus({ preventScroll: true })
    return () => {
      if (dialog.open) dialog.close?.()
      if (main) main.style.overflow = mainOverflow
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])

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

  function perform(leave: Leave) {
    if (leave.kind === 'close') onClose()
    else onStep?.(leave.dir)
  }
  function request(leave: Leave) {
    if (saveInFlight.current) return
    if (dirty) { setGuard(leave); return }
    perform(leave)
  }

  function save(after: Leave = { kind: 'close' }) {
    if (saveInFlight.current) return
    saveInFlight.current = true
    onSavingChange?.(true)
    setError(null)
    setGuard(null)
    startSaving(async () => {
      try {
        await saveModelSettings({ erpModelId: model.erpId, offered, enabled: Object.fromEntries(optionKeys.map(o => [o.key, enabled[o.key] ?? []])), gift, calcCategory: calc, brandCode: brand, skuOffered: skuTicks })
        router.refresh()
        const last = after.kind === 'step' && after.dir === 1 && !hasNext
        onSaved?.(last ? `${model.code} saved. That was the last model in this list.` : `${model.code} saved. Calculator selections are updated.`)
        if (after.kind === 'step' && (after.dir === 1 ? hasNext : hasPrev)) onStep?.(after.dir)
        else onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the model')
      } finally {
        saveInFlight.current = false
        onSavingChange?.(false)
      }
    })
  }

  const skuTitle = skuKey === 'compartments' ? 'Compartments' : skuKey === 'sizes' ? 'Sizes' : 'SKUs'
  const ticked = liveSkus.filter(s => skuTicks[s.erpId]).length
  const summary = !offered ? { tone: 'off', text: 'Not offered. Members cannot quote this model.' }
    : missingLadder ? { tone: 'bad', text: 'Offered, but members will not see it until a margin ladder is chosen.' }
    : { tone: 'ok', text: `Members can quote ${[`${ticked} of ${liveSkus.length} ${skuTitle.toLowerCase()}`, ...optionKeys.map(o => `${chipsFor(o).filter(v => isOn(o.key, v)).length} ${o.label.toLowerCase()}`)].join(' · ')}.` }

  return (
    <dialog
      ref={dialogRef}
      className="modular-win"
      aria-labelledby={titleId}
      aria-modal="true"
      aria-busy={saving}
      tabIndex={-1}
      data-product-dirty={dirty}
      data-product-saving={saving}
      onCancel={e => { e.preventDefault(); request({ kind: 'close' }) }}
      onClick={e => {
        if (e.target !== e.currentTarget) return
        const r = e.currentTarget.getBoundingClientRect()
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) request({ kind: 'close' })
      }}
    >
      <section className="modular-win-frame" aria-label={`Configure model ${model.code}`}>
        <header className="modular-win-head">
          <div className="min-w-0">
            <div className="modular-win-eyebrow"><em aria-hidden="true" />Modular{position ? ` · ${position.index + 1} of ${position.total}` : ''}{position?.category ? ` · ${categoryLabel(position.category)}` : ''}</div>
            <h2 id={titleId}>{model.code}{model.name && model.name !== model.code ? <span className="modular-win-name"> · {model.name}</span> : null}</h2>
            <div className="modular-win-meta">
              <span>{categoryLabel(model.category)}</span>
              <span>{model.branding ? `ERP branding · ${model.branding}` : 'No ERP branding'}</span>
              <span>{liveSkus.length} {liveSkus.length === 1 ? 'SKU' : 'SKUs'}</span>
              {!model.active ? <span data-flag>Inactive in ERP</span> : null}
              {model.isNew ? <span data-flag>New model</span> : null}
            </div>
          </div>
          <div className="modular-win-nav">
            <button type="button" className="modular-win-icon" aria-label="Previous model" disabled={!hasPrev || saving} onClick={() => request({ kind: 'step', dir: -1 })}>‹</button>
            <button type="button" className="modular-win-icon" aria-label="Next model" disabled={!hasNext || saving} onClick={() => request({ kind: 'step', dir: 1 })}>›</button>
            <button type="button" className="modular-win-icon" aria-label="Close" disabled={saving} onClick={() => request({ kind: 'close' })}>×</button>
          </div>
        </header>

        <div className="modular-win-body">
          {error ? <p className="sku-notice" data-tone="error" role="alert">{error}</p> : null}
          {note ? <p className="modular-win-note" role="status">{note}</p> : null}
          <fieldset disabled={saving} className="min-w-0">
            <legend className="sr-only">Model settings</legend>
            <section className="modular-win-gates" aria-label="Calculator listing">
              <div className="modular-win-field">
                <span className="modular-win-label">Revenue calculator</span>
                <button type="button" role="switch" aria-checked={offered} aria-label="Offered in the Revenue calculator" className="modular-win-switch" onClick={() => turnOn(!offered)}>
                  <span className="modular-win-track" aria-hidden="true" /><span>{offered ? 'Offered' : 'Not offered'}</span>
                </button>
              </div>
              <label className="modular-win-field" data-bad={missingLadder || undefined}>
                <span className="modular-win-label">Margin ladder</span>
                <select aria-label="Margin ladder" value={brand ?? ''} onChange={e => setBrand(e.target.value || null)}>
                  <option value="">{model.derivedBrand ? `${model.derivedBrand} (ERP default)` : isRiderModel(model.category, null) ? 'Rider (ERP default)' : 'Not assigned (ERP default)'}</option>
                  {brand && brand !== RIDER && !brands.some(b => b.code === brand) ? <option value={brand}>{brand} (unavailable)</option> : null}
                  {brands.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
                  <option value={RIDER}>Rider — no brand of its own</option>
                </select>
                <span className="modular-win-help">{missingLadder ? `Required. A ${categoryName(model.category)} with no ladder cannot appear in the calculator.` : isRiderModel(model.category, brand) ? 'A rider joins any cart; the mattress or sofa decides the ladder.' : 'Margins on this model are measured on this ladder.'}</span>
              </label>
              <label className="modular-win-field">
                <span className="modular-win-label">Calculator section</span>
                <select aria-label="Calculator section" value={calc ?? ''} onChange={e => setCalc(e.target.value || null)}>
                  <option value="">{derivedCalc} (ERP default)</option>
                  {CALC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="modular-win-field">
                <span className="modular-win-label">Free gift</span>
                <select aria-label="Free gift" value={gift === null ? '' : gift ? 'yes' : 'no'} onChange={e => setGift(e.target.value === '' ? null : e.target.value === 'yes')}>
                  <option value="">{defaultGift(calc ?? derivedCalc) ? 'May be a gift (default)' : 'Not a gift (default)'}</option><option value="yes">May be a gift</option><option value="no">Not a gift</option>
                </select>
              </label>
            </section>
            <p className="modular-win-summary" data-tone={summary.tone}>{summary.text}</p>

            <section className="modular-win-section" aria-label={skuTitle}>
              <div className="modular-win-section-head">
                <h3>{skuTitle}</h3>
                <span className="modular-win-count">{ticked} / {liveSkus.length}</span>
                <span className="flex-1" />
                <button type="button" className="sku-secondary-button" onClick={() => setSkuTicks(Object.fromEntries(model.skus.map(s => [s.erpId, !s.removed && s.active])))}>Select all</button>
                <button type="button" className="sku-secondary-button" onClick={() => setSkuTicks(Object.fromEntries(model.skus.map(s => [s.erpId, false])))}>Clear all</button>
              </div>
              {model.skus.length === 0 ? <p className="text-xs">No SKUs are linked to this model in the ERP.</p> : (
                <div className="modular-win-tiles">
                  {model.skus.map(s => {
                    const on = skuTicks[s.erpId] ?? false
                    const locked = (s.removed || !s.active) && !on
                    const flag = s.removed ? 'Removed' : !s.active ? 'Inactive' : s.isNew ? 'New' : null
                    return <label key={s.erpId} className="modular-win-tile" data-on={on} aria-disabled={locked || undefined}>
                      <input type="checkbox" aria-label={`Offer SKU ${s.code}`} checked={on} disabled={locked} onChange={e => setSkuTicks(prev => ({ ...prev, [s.erpId]: e.target.checked }))} />
                      <span className="modular-win-tile-main">{s.optionLabel}</span>
                      {s.optionLabel !== s.code ? <span className="modular-win-tile-sub">{s.code}</span> : null}
                      {flag ? <span className="modular-win-tile-sub"><span className="modular-win-tag">{flag}</span></span> : null}
                    </label>
                  })}
                </div>
              )}
            </section>

            {optionKeys.map(o => {
              const chips = chipsFor(o)
              const allowed = new Set(erpFor(o).map(valueKey))
              return <section key={o.key} className="modular-win-section" aria-label={o.label}>
                <div className="modular-win-section-head">
                  <h3>{o.label}</h3>
                  <span className="modular-win-count">{chips.filter(v => isOn(o.key, v)).length} / {chips.length}</span>
                  <span className="flex-1" />
                  {chips.length > 0 ? <>
                    <button type="button" className="sku-secondary-button" onClick={() => setEnabled(prev => ({ ...prev, [o.key]: erpFor(o) }))}>Select all</button>
                    <button type="button" className="sku-secondary-button" onClick={() => setEnabled(prev => ({ ...prev, [o.key]: [] }))}>Clear all</button>
                  </> : null}
                </div>
                {chips.length === 0 ? <p className="text-xs">{isRestricted(model.allowed, o.key) ? 'No options are available for this model.' : 'The Maintenance list is empty.'}</p> : (
                  <div className="modular-win-tiles" data-width={o.key === 'specials' ? 'long' : 'short'}>
                    {chips.map(v => {
                      const on = isOn(o.key, v)
                      const stale = !allowed.has(valueKey(v))
                      return <label key={v} className="modular-win-tile" data-on={on} data-stale={stale || undefined} aria-disabled={(stale && !on) || undefined}>
                        <input type="checkbox" aria-label={`${o.label}: ${v}`} checked={on} disabled={stale && !on} onChange={() => toggle(o.key, v)} />
                        <span className="modular-win-tile-main">{v}</span>
                        {stale ? <span className="modular-win-tile-sub">No longer allowed by ERP</span> : null}
                      </label>
                    })}
                  </div>
                )}
              </section>
            })}
            {/* 2026-10-05: a bed frame's divan, leg, gap and total height are no
                longer ticked — the Quote offers FOC and every option Maintenance
                charges that the ERP lets this model take. */}
            {(model.category ?? '').toUpperCase() === 'BEDFRAME' ? (
              <section className="modular-win-section" aria-label="Divan, leg, gap and total height">
                <div className="modular-win-section-head"><h3>Divan, leg, gap and total height</h3></div>
                <p className="text-xs">Members choose FOC, or an option charged on Maintenance that the ERP allows for this model. A charge is paid by the customer on top: out of the margin, in the commission.</p>
              </section>
            ) : null}
          </fieldset>
        </div>

        <footer className="modular-win-foot">
          {guard ? <div className="modular-win-guard" role="alert">
            <span><strong>{model.code}</strong> has unsaved changes.</span>
            <span className="flex-1" />
            <button type="button" className="sku-secondary-button" onClick={() => setGuard(null)}>Keep editing</button>
            <button type="button" className="sku-secondary-button" onClick={() => { const g = guard; setGuard(null); perform(g) }}>Discard</button>
            <button type="button" className="sku-primary-button" onClick={() => save(guard)}>Save and {guard.kind === 'close' ? 'close' : 'continue'}</button>
          </div> : <>
            <span className="modular-win-status" role="status" data-dirty={dirty && !saving}>{saving ? 'Saving…' : dirty ? `${changes} unsaved ${changes === 1 ? 'change' : 'changes'}` : 'No unsaved changes'}</span>
            <div className="sku-action-buttons modular-win-buttons">
              <button type="button" className="sku-secondary-button" onClick={() => request({ kind: 'close' })} disabled={saving}>Cancel</button>
              <button type="button" className="sku-primary-button" onClick={() => save()} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save'}</button>
              {onStep ? <button type="button" className="sku-secondary-button modular-win-next" onClick={() => dirty ? save({ kind: 'step', dir: 1 }) : request({ kind: 'step', dir: 1 })} disabled={saving || (!dirty && !hasNext)}>
                {dirty ? 'Save & next' : 'Next'} <span aria-hidden="true">›</span>
              </button> : null}
            </div>
          </>}
        </footer>
      </section>
    </dialog>
  )
}

function categoryName(category: string | null) {
  return (category ?? '').toUpperCase() === 'SOFA' ? 'sofa' : 'mattress'
}
