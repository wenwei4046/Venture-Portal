'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import { heightKey, valueKey } from '@/lib/catalogue/keys'
import {
  CALC_CATEGORIES,
  calcCategoryOf,
  defaultGift,
  erpAllows,
  isRestricted,
  isRiderModel,
  optionKeysOf,
  RIDER,
  skuKeyOf,
  type OptionKey,
} from '@/lib/catalogue/options'
import { saveModelSettings } from '../../catalogue-actions'
import type { BrandRef, CatalogueModel, MaintenanceOption } from '../load'
import { Notice } from './ui'

/**
 * One model's Modular ticks — what the Revenue calculator may offer of it.
 *
 * THE ERP SAYS WHAT EXISTS, THE PORTAL SAYS WHAT IS OFFERED (user 2026-09-24:
 * "Modular 是独立的"). Every chip here is something the ERP's own Modular tab
 * allows for this model; the tick is the portal's, and only a ticked chip
 * reaches a calculator dropdown. Ten SKUs over there, seven ticked here: the
 * calculator offers seven.
 *
 * Two kinds of chip, because the ERP's allowed options are two kinds of thing:
 * the ones that ARE the model's SKUs (a sofa's compartments, a bed frame's or
 * mattress's sizes) are ticked per SKU, and the ones that are OPTIONS (seat
 * height, leg height, specials, divan / total heights, gaps) are ticked per
 * model. Something the ERP adds later arrives unticked.
 */

function priceBadge(s: CatalogueModel['skus'][number]) {
  if (s.price !== null) return <span className="text-num-ink">{formatMoney(s.price)}</span>
  if (s.grid && s.grid.length > 0) return <span className="text-graphite">grid</span>
  return <span className="text-danger">no price</span>
}

export default function ModelEditor({
  model,
  brands,
  options,
  onClose,
}: {
  model: CatalogueModel
  brands: BrandRef[]
  options: MaintenanceOption[]
  onClose: () => void
}) {
  const router = useRouter()
  const [saving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const skuKey = skuKeyOf(model.category)
  const optionKeys = optionKeysOf(model.category)

  const [offered, setOffered] = useState(model.offered)
  const [skuTicks, setSkuTicks] = useState<Record<string, boolean>>(
    () => Object.fromEntries(model.skus.map(s => [s.erpId, s.offered])),
  )
  const [enabled, setEnabled] = useState<Record<string, string[]>>(() => ({ ...model.enabled }))
  const [gift, setGift] = useState<boolean | null>(model.giftOverride)
  const [calc, setCalc] = useState<string | null>(model.calcOverride)
  const [brand, setBrand] = useState<string | null>(model.brandOverride)

  const derivedCalc = calcCategoryOf(model.category, model.name ?? model.code)
  const optionPrice = useMemo(() => {
    const m = new Map<string, number | null>()
    for (const o of options) m.set(`${o.pool}\u0000${valueKey(o.value)}`, o.price)
    return m
  }, [options])

  /** Each Maintenance pool's live values, in the pool's own order. */
  const poolValues = useMemo(() => {
    const byPool = new Map<string, MaintenanceOption[]>()
    for (const o of options) {
      if (o.active && !o.removed) byPool.set(o.pool, [...(byPool.get(o.pool) ?? []), o])
    }
    return new Map(
      [...byPool].map(([pool, list]) => [
        pool,
        list.sort((a, b) => a.sortOrder - b.sortOrder || a.value.localeCompare(b.value)).map(o => o.value),
      ]),
    )
  }, [options])

  /** What the ERP lets this model take for one key — the whole pool when it restricts nothing. */
  function erpFor(o: OptionKey): string[] {
    return erpAllows(model.allowed, o.key, poolValues.get(o.pool) ?? [])
  }

  /** The chips for one option key: what the ERP allows, then anything ticked here the ERP no longer allows. */
  function chipsFor(o: OptionKey): string[] {
    const erp = erpFor(o)
    const mine = enabled[o.key] ?? []
    const seen = new Set(erp.map(v => valueKey(v)))
    return [...erp, ...mine.filter(v => !seen.has(valueKey(v)))]
  }

  function isOn(key: string, value: string): boolean {
    const k = valueKey(value)
    return (enabled[key] ?? []).some(v => valueKey(v) === k)
  }

  function toggle(key: string, value: string) {
    setEnabled(prev => {
      const list = prev[key] ?? []
      const k = valueKey(value)
      const next = list.some(v => valueKey(v) === k) ? list.filter(v => valueKey(v) !== k) : [...list, value]
      return { ...prev, [key]: next }
    })
  }

  function setAll(o: OptionKey, on: boolean) {
    setEnabled(prev => ({ ...prev, [o.key]: on ? chipsFor(o) : [] }))
  }

  const liveSkus = model.skus.filter(s => !s.removed)

  /**
   * Offering a model nobody has configured starts from everything the ERP
   * allows — every live SKU, every allowed option — so the next step is
   * unticking what the calculator should not offer, not ticking forty chips.
   */
  function turnOn(on: boolean) {
    setOffered(on)
    const untouched =
      !model.configured && Object.values(skuTicks).every(v => !v) && Object.keys(enabled).length === 0
    if (on && untouched) {
      setSkuTicks(Object.fromEntries(model.skus.map(s => [s.erpId, !s.removed && s.active])))
      setEnabled(Object.fromEntries(optionKeys.map(o => [o.key, erpFor(o)])))
      setNote('Started from everything the ERP allows for this model — untick what the calculator should not offer.')
    }
  }

  function save() {
    setError(null)
    // Only the keys this category has; a sofa does not carry divan heights.
    const cleanEnabled = Object.fromEntries(optionKeys.map(o => [o.key, enabled[o.key] ?? []]))
    startSaving(async () => {
      try {
        await saveModelSettings({
          erpModelId: model.erpId,
          offered,
          enabled: cleanEnabled,
          gift,
          calcCategory: calc,
          brandCode: brand,
          skuOffered: skuTicks,
        })
        router.refresh()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the model')
      }
    })
  }

  const priceGridHeights = (h: string) =>
    liveSkus.filter(s => (s.grid ?? []).some(c => heightKey(c.height) === heightKey(h))).length

  return (
    <div className="bg-paper border border-hairline rounded-md p-4 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-mono text-xs text-graphite">{model.code}</div>
          <div className="font-serif text-lg text-ink">{model.name ?? model.code}</div>
          <div className="text-xs text-graphite mt-1">
            ERP: {model.category ?? '—'}
            {model.branding ? ` · branding ${model.branding}` : ''}
            {!model.active ? ' · inactive over there' : ''}
            {model.removed ? ' · gone from the ERP' : ''}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink font-sans">
          <input
            type="checkbox"
            checked={offered}
            onChange={e => turnOn(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Offered in the Revenue calculator
        </label>
      </div>

      {note ? <Notice tone="ok">{note}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {!isRiderModel(model.category, brand) && !(brand ?? model.derivedBrand) ? (
        <Notice tone="error">
          No margin ladder. A {(model.category ?? '').toUpperCase() === 'SOFA' ? 'sofa' : 'mattress'} sells under its
          brand&rsquo;s ladder, and{' '}
          {model.branding ? (
            <>the ERP branding &ldquo;{model.branding}&rdquo; matches no brand the calculator sells.</>
          ) : (
            <>the ERP gives this model no branding.</>
          )}{' '}
          It is not offered until a Margin ladder is chosen below.
        </Notice>
      ) : null}

      <div>
        <div className="flex items-baseline gap-3 mb-2">
          <h3 className="font-sans text-sm font-medium text-ink">
            {skuKey === 'compartments' ? 'Compartments' : skuKey === 'sizes' ? 'Sizes' : 'SKUs'}
          </h3>
          <span className="font-mono text-[10.5px] text-muted">
            {Object.entries(skuTicks).filter(([id, on]) => on && liveSkus.some(s => s.erpId === id)).length}/{liveSkus.length} TICKED
          </span>
          <button type="button" className="text-xs text-accent hover:underline" onClick={() => setSkuTicks(Object.fromEntries(model.skus.map(s => [s.erpId, !s.removed])))}>
            Tick all
          </button>
          <button type="button" className="text-xs text-accent hover:underline" onClick={() => setSkuTicks(Object.fromEntries(model.skus.map(s => [s.erpId, false])))}>
            Untick all
          </button>
        </div>
        {model.skus.length === 0 ? (
          <p className="font-serif italic text-sm text-muted">The ERP lists no SKU under this model.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {model.skus.map(s => (
              <label
                key={s.erpId}
                title={s.code}
                className={`inline-flex items-center gap-2 border rounded-full px-3 py-1 text-xs cursor-pointer ${
                  skuTicks[s.erpId] ? 'border-accent-border bg-accent-bg text-ink' : 'border-hairline bg-surface text-graphite'
                } ${s.removed ? 'opacity-50' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={skuTicks[s.erpId] ?? false}
                  disabled={s.removed}
                  onChange={e => setSkuTicks(prev => ({ ...prev, [s.erpId]: e.target.checked }))}
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                />
                <span className="font-mono">{s.optionLabel}</span>
                <span className="text-[10.5px]">{priceBadge(s)}</span>
                {s.isNew ? <span className="chip accent">NEW</span> : null}
              </label>
            ))}
          </div>
        )}
      </div>

      {optionKeys.map(o => {
        const chips = chipsFor(o)
        const erp = new Set(erpFor(o).map(v => valueKey(v)))
        const restricted = isRestricted(model.allowed, o.key)
        return (
          <div key={o.key}>
            <div className="flex items-baseline gap-3 mb-2">
              <h3 className="font-sans text-sm font-medium text-ink">{o.label}</h3>
              <span className="font-mono text-[10.5px] text-muted">
                {(enabled[o.key] ?? []).length}/{chips.length} TICKED
              </span>
              {chips.length > 0 ? (
                <>
                  <button type="button" className="text-xs text-accent hover:underline" onClick={() => setAll(o, true)}>
                    Tick all
                  </button>
                  <button type="button" className="text-xs text-accent hover:underline" onClick={() => setAll(o, false)}>
                    Untick all
                  </button>
                </>
              ) : null}
              {!restricted && chips.length > 0 ? (
                <span className="text-[10.5px] text-muted">The ERP does not restrict this model: the whole pool</span>
              ) : null}
            </div>
            {chips.length === 0 ? (
              <p className="font-serif italic text-sm text-muted">
                {restricted
                  ? 'The ERP allows none for this model.'
                  : 'The ERP does not restrict this model, and its Maintenance pool is empty.'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {chips.map(v => {
                  const on = isOn(o.key, v)
                  const stale = !erp.has(valueKey(v))
                  const surcharge = o.priced ? optionPrice.get(`${o.pool}\u0000${valueKey(v)}`) : undefined
                  return (
                    <label
                      key={v}
                      className={`inline-flex items-center gap-2 border rounded-full px-3 py-1 text-xs cursor-pointer ${
                        on ? 'border-accent-border bg-accent-bg text-ink' : 'border-hairline bg-surface text-graphite'
                      }`}
                      title={stale ? 'Ticked here, but the ERP no longer allows it for this model' : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(o.key, v)}
                        className="h-3.5 w-3.5 accent-[var(--accent)]"
                      />
                      <span className={stale ? 'line-through' : undefined}>{v}</span>
                      {o.key === 'sizes' && model.category === 'SOFA' ? (
                        <span className="text-[10.5px] text-muted">
                          {priceGridHeights(v)}/{liveSkus.length} priced
                        </span>
                      ) : null}
                      {o.priced ? (
                        surcharge === undefined || surcharge === null ? (
                          <span className="text-[10.5px] text-muted">+RM ?</span>
                        ) : (
                          <span className="text-[10.5px] text-num-ink">
                            {surcharge >= 0 ? '+' : '−'}
                            {formatMoney(Math.abs(surcharge))}
                          </span>
                        )
                      ) : null}
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      <div className="flex flex-wrap items-end gap-5 border-t border-hairline pt-4">
        <label className="text-xs font-sans text-graphite">
          <span className="block mb-1">Calculator section</span>
          <select
            value={calc ?? ''}
            onChange={e => setCalc(e.target.value || null)}
            className="px-2 py-1 bg-paper border border-hairline rounded text-sm text-ink"
          >
            <option value="">{derivedCalc} (from the ERP category)</option>
            {CALC_CATEGORIES.filter(c => c !== derivedCalc).map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-sans text-graphite">
          <span className="block mb-1">Free gift</span>
          <select
            value={gift === null ? '' : gift ? 'yes' : 'no'}
            onChange={e => setGift(e.target.value === '' ? null : e.target.value === 'yes')}
            className="px-2 py-1 bg-paper border border-hairline rounded text-sm text-ink"
          >
            <option value="">{defaultGift(calc ?? derivedCalc) ? 'May be a gift (default)' : 'Not a gift (default)'}</option>
            <option value="yes">May be a gift</option>
            <option value="no">Not a gift</option>
          </select>
        </label>
        <label className="text-xs font-sans text-graphite">
          <span className="block mb-1">Margin ladder</span>
          <select
            value={brand ?? ''}
            onChange={e => setBrand(e.target.value || null)}
            className="px-2 py-1 bg-paper border border-hairline rounded text-sm text-ink"
          >
            <option value="">
              {model.derivedBrand
                ? `${model.derivedBrand} (from the ERP branding)`
                : isRiderModel(model.category, null)
                  ? 'Rider (from the ERP category)'
                  : 'None: the ERP branding matches no brand'}
            </option>
            {brands.map(b => (
              <option key={b.code} value={b.code}>{b.name}</option>
            ))}
            <option value={RIDER}>Rider — no brand of its own</option>
          </select>
        </label>
        <div className="flex items-center gap-3 ml-auto">
          <button type="button" onClick={onClose} disabled={saving} className="font-serif italic text-sm text-graphite hover:text-ink">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save model'}
          </button>
        </div>
      </div>
    </div>
  )
}
