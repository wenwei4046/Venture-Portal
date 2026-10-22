'use client'

import { useEffect, useId, useMemo, useRef, useState, useTransition, type MutableRefObject } from 'react'
import { useRouter } from 'next/navigation'
import { MODEL_NAME_MAX, tidyModelName } from '@/lib/catalogue/edits'
import { valueKey } from '@/lib/catalogue/keys'
import { CALC_CATEGORIES, calcCategoryOf, defaultGift, erpAllows, isRestricted, isRiderModel, leadNameOf, needsBrandPick, optionKeysOf, RIDER, skuKeyOf, takesModelName, type OptionKey } from '@/lib/catalogue/options'
import { saveModelSettings } from '../actions'
import type { BrandRef, CatalogueModel, MaintenanceOption } from '../load'
import FloatingWindow from './FloatingWindow'
import { useProductDraftGuard } from './ProductWorkspace'
import { categoryLabel, plural, TickIcon } from './ui'
import c from './products.module.css'

/** Where a guarded move goes: close the window, step through the list, or open the card that was clicked. */
export type ModelLeave = { kind: 'close' } | { kind: 'step'; dir: -1 | 1 } | { kind: 'open'; id: string }

interface Draft {
  offered: boolean
  skuTicks: Record<string, boolean>
  enabled: Record<string, string[]>
  gift: boolean | null
  calc: string | null
  brand: string | null
  /** The model name box as typed: '' = no name of the portal's own. */
  name: string
}

/** How many ticks, switches, selects and boxes differ from what is saved. Ticking and unticking again is no change. */
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
  if (tidyModelName(saved.name) !== tidyModelName(draft.name)) n++
  return n
}

type EditorProps = {
  brands: BrandRef[]
  options: MaintenanceOption[]
  /** Where this model sits in the filtered list, for the eyebrow and ‹ ›. */
  position?: { index: number; total: number } | null
  onClose: () => void
  onStep?: (dir: -1 | 1) => void
  /** Another card was clicked and the guard let it open. */
  onOpen?: (id: string) => void
  onDirtyChange?: (dirty: boolean) => void
  onSavingChange?: (saving: boolean) => void
  onSaved?: (message: string) => void
  /** Lets the board ask the window to leave, through its guard (a card clicked while it holds changes). */
  requestRef?: MutableRefObject<((leave: ModelLeave) => void) | null>
}

/**
 * One model in a floating window, on one sheet (the prototype's model window):
 * the calculator listing on top, then every selection. Portal selections only —
 * prices live on SKU Master, Maintenance and Combo Pricing. The window is there
 * whether a model is open or not, so it can fade in and out (`FloatingWindow`).
 */
export default function ModelEditor({ model, ...props }: EditorProps & { model: CatalogueModel | null }) {
  const titleId = useId()
  // The open model's own move-away, through its guard: the dim, Esc.
  const dismiss = useRef<() => void>(() => props.onClose())
  return (
    <FloatingWindow open={model !== null} layer="model" labelledBy={titleId} onDismiss={() => dismiss.current()}>
      {model ? <EditorContent key={model.erpId} model={model} titleId={titleId} dismiss={dismiss} {...props} /> : null}
    </FloatingWindow>
  )
}

function EditorContent({ model, titleId, dismiss, brands, options, position, onClose, onStep, onOpen, onDirtyChange, onSavingChange, onSaved, requestRef }: EditorProps & {
  model: CatalogueModel
  titleId: string
  dismiss: MutableRefObject<() => void>
}) {
  const router = useRouter()
  const [saving, startSaving] = useTransition()
  const saveInFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [guard, setGuard] = useState<ModelLeave | null>(null)
  // The margin ladder and the calculator section follow the ERP's branding,
  // and a rider's margin follows the cart's brand: only a mattress or a sofa
  // the system cannot place is asked (user 2026-10-06). Anything stored for
  // the others is not read, and a save clears it.
  const picks = needsBrandPick(model.category, model.derivedBrand)
  // A sofa's model is a number, so the portal may name it (2026-10-19); the box
  // holds the portal's own name only — the ERP's shows as its placeholder.
  const named = takesModelName(model.category)
  const [saved] = useState<Draft>(() => ({
    offered: model.offered,
    skuTicks: Object.fromEntries(model.skus.map(s => [s.erpId, s.offered])),
    enabled: { ...model.enabled },
    gift: model.giftOverride,
    calc: picks ? model.calcOverride : null,
    brand: picks ? model.brandOverride : null,
    name: model.ownName ?? '',
  }))
  const [offered, setOffered] = useState(saved.offered)
  const [skuTicks, setSkuTicks] = useState(saved.skuTicks)
  const [enabled, setEnabled] = useState(saved.enabled)
  const [gift, setGift] = useState(saved.gift)
  const [calc, setCalc] = useState(saved.calc)
  const [brand, setBrand] = useState(saved.brand)
  const [name, setName] = useState(saved.name)
  const nameChanged = tidyModelName(name) !== tidyModelName(saved.name)
  const skuKey = skuKeyOf(model.category)
  const optionKeys = optionKeysOf(model.category)
  const changes = countChanges(saved, { offered, skuTicks, enabled, gift, calc, brand, name }, optionKeys.map(o => o.key))
  const dirty = changes > 0
  useProductDraftGuard(changes, saving)
  // The section follows the ERP's own name, never one typed here.
  const derivedCalc = calcCategoryOf(model.category, model.erpName ?? model.code)
  const erpNamed = model.erpName && model.erpName !== model.code ? model.erpName : null
  // The title reads as the card: a named sofa by its name, its code after it (2026-10-19).
  const lead = leadNameOf(model.category, model.code, model.name)
  const titleRest = lead ? model.code : model.name && model.name !== model.code ? model.name : null
  const liveSkus = model.skus.filter(s => !s.removed && s.active)
  const missingLadder = picks && !brand
  const hasPrev = !!position && position.index > 0
  const hasNext = !!position && position.index < position.total - 1

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

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

  function perform(leave: ModelLeave) {
    if (leave.kind === 'close') onClose()
    else if (leave.kind === 'step') onStep?.(leave.dir)
    else onOpen?.(leave.id)
  }
  function request(leave: ModelLeave) {
    if (saveInFlight.current) return
    if (dirty) { setGuard(leave); return }
    perform(leave)
  }
  // The dim and Esc close through the guard; so does a card the board was asked to open.
  useEffect(() => {
    dismiss.current = () => request({ kind: 'close' })
    if (requestRef) requestRef.current = request
  })
  useEffect(() => () => {
    if (requestRef) requestRef.current = null
  }, [requestRef])

  function save(after: ModelLeave = { kind: 'close' }) {
    if (saveInFlight.current) return
    saveInFlight.current = true
    onSavingChange?.(true)
    setError(null)
    setGuard(null)
    startSaving(async () => {
      try {
        await saveModelSettings({
          erpModelId: model.erpId, offered, enabled: Object.fromEntries(optionKeys.map(o => [o.key, enabled[o.key] ?? []])), gift, calcCategory: calc, brandCode: brand, skuOffered: skuTicks,
          // Only a name that changed is sent: another window's name is never written back over.
          ...(named && nameChanged ? { modelName: tidyModelName(name) || null } : {}),
        })
        router.refresh()
        const last = after.kind === 'step' && after.dir === 1 && !hasNext
        onSaved?.(last ? `${model.code} saved. That was the last model in this list.` : `${model.code} saved. Calculator selections are updated.`)
        if (after.kind === 'step' && (after.dir === 1 ? hasNext : hasPrev)) onStep?.(after.dir)
        else if (after.kind === 'open') onOpen?.(after.id)
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
  const metaChips: Array<{ label: string; flag?: boolean }> = [
    { label: categoryLabel(model.category) },
    { label: model.branding ? `ERP branding · ${model.branding}` : 'No ERP branding' },
    { label: plural(liveSkus.length, 'SKU') },
    ...(!model.active ? [{ label: 'Inactive in ERP', flag: true }] : []),
    ...(model.isNew ? [{ label: 'New model', flag: true }] : []),
  ]

  return (
    <section aria-label={`Configure model ${model.code}`} style={{ display: 'contents' }} aria-busy={saving}>
      <header className={c.winHead}>
        <div className={c.winHeadText}>
          <span className={c.eyebrow}><span className={c.eyebrowDash} />MODULAR{position ? ` · ${position.index + 1} OF ${position.total}` : ''}</span>
          <h2 id={titleId} className={c.winTitle}>{lead ?? model.code}{titleRest ? <span className={c.winTitleName}> · {titleRest}</span> : null}</h2>
          <div className={c.metaChips}>
            {metaChips.map(m => <span key={m.label} className={c.metaChip} data-flag={m.flag || undefined}>{m.label}</span>)}
          </div>
        </div>
        <div className={c.winNav}>
          <button type="button" className={c.iconButton} aria-label="Previous model" data-faded={!hasPrev || undefined} disabled={!hasPrev || saving} onClick={() => request({ kind: 'step', dir: -1 })}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
          </button>
          <button type="button" className={c.iconButton} aria-label="Next model" data-faded={!hasNext || undefined} disabled={!hasNext || saving} onClick={() => request({ kind: 'step', dir: 1 })}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          </button>
          <button type="button" className={c.iconButton} aria-label="Close" disabled={saving} onClick={() => request({ kind: 'close' })}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      </header>

      <div className={c.winBody}>
        {error ? <p className={c.notice} data-tone="error" role="alert">{error}</p> : null}
        {note ? <p className={c.winNote} role="status">{note}</p> : null}
        <fieldset disabled={saving} style={{ display: 'contents' }}>
          <legend className="sr-only">Model settings</legend>
          <div className={c.winListing}>
            <div className={c.calc} data-picks={picks || undefined} data-named={named || undefined} aria-label="Calculator listing" role="group">
              <div className={c.field}>
                <span className={c.fieldLabel}>REVENUE CALCULATOR</span>
                <button type="button" role="switch" aria-checked={offered} aria-label="Offered in the Revenue calculator" className={c.toggle} onClick={() => turnOn(!offered)}>
                  <span className={c.track} aria-hidden="true"><span className={c.knob} /></span>{offered ? 'Offered' : 'Not offered'}
                </button>
              </div>
              {picks ? <>
                <label className={c.field}>
                  <span className={c.fieldLabel}>MARGIN LADDER</span>
                  <select aria-label="Margin ladder" className={c.fieldSelect} data-bad={missingLadder || undefined} value={brand ?? ''} onChange={e => setBrand(e.target.value || null)}>
                    <option value="">Not assigned</option>
                    {brand && brand !== RIDER && !brands.some(b => b.code === brand) ? <option value={brand}>{brand} (unavailable)</option> : null}
                    {brands.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
                    <option value={RIDER}>Rider — no brand of its own</option>
                  </select>
                  <span className={c.fieldHelp} data-bad={missingLadder || undefined}>{missingLadder
                    ? `Required. ${model.branding ? `The ERP branding ${model.branding} is not a brand the portal knows` : 'The ERP gives this model no branding'}, so the ${categoryName(model.category)} cannot appear in the calculator until a ladder is chosen.`
                    : isRiderModel(model.category, brand) ? 'A rider joins any cart; the mattress or sofa decides the ladder.' : 'Margins on this model are measured on this ladder.'}</span>
                </label>
                <label className={c.field}>
                  <span className={c.fieldLabel}>CALCULATOR SECTION</span>
                  <select aria-label="Calculator section" className={c.fieldSelect} value={calc ?? ''} onChange={e => setCalc(e.target.value || null)}>
                    <option value="">{derivedCalc} (ERP default)</option>
                    {CALC_CATEGORIES.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </label>
              </> : null}
              <label className={c.field}>
                <span className={c.fieldLabel}>FREE GIFT</span>
                <select aria-label="Free gift" className={c.fieldSelect} value={gift === null ? '' : gift ? 'yes' : 'no'} onChange={e => setGift(e.target.value === '' ? null : e.target.value === 'yes')}>
                  <option value="">{defaultGift(calc ?? derivedCalc) ? 'May be a gift (default)' : 'Not a gift (default)'}</option><option value="yes">May be a gift</option><option value="no">Not a gift</option>
                </select>
              </label>
              {named ? (
                <label className={c.field}>
                  <span className={c.fieldLabel}>MODEL NAME</span>
                  <input type="text" aria-label="Model name" className={`${c.fieldInput} ${c.capsInput}`} value={name} maxLength={MODEL_NAME_MAX}
                    placeholder={erpNamed ?? 'Add a name'} autoComplete="off" spellCheck={false} onChange={e => setName(e.target.value)} />
                </label>
              ) : null}
            </div>
            <p className={c.summary} data-tone={summary.tone}>{summary.text}</p>
          </div>

          <section className={c.section} aria-label={skuTitle}>
            <div className={c.sectionHead}>
              <h3 className={c.sectionTitle}>{skuTitle}</h3>
              <span className={c.sectionCount}>{ticked} / {liveSkus.length}</span>
              <span className={c.spacer} />
              <button type="button" className={c.small} onClick={() => setSkuTicks(Object.fromEntries(model.skus.map(s => [s.erpId, !s.removed && s.active])))}>Select all</button>
              <button type="button" className={c.small} onClick={() => setSkuTicks(Object.fromEntries(model.skus.map(s => [s.erpId, false])))}>Clear all</button>
            </div>
            {model.skus.length === 0 ? <p className={c.winSmall}>No SKUs are linked to this model in the ERP.</p> : (
              <div className={c.tileGrid}>
                {model.skus.map(s => {
                  const on = skuTicks[s.erpId] ?? false
                  const locked = (s.removed || !s.active) && !on
                  const tag = s.removed ? 'Removed' : !s.active ? 'Inactive in ERP' : s.isNew ? 'NEW' : null
                  return (
                    <Tile key={s.erpId} on={on} disabled={locked} label={`Offer SKU ${s.code}`} onChange={next => setSkuTicks(prev => ({ ...prev, [s.erpId]: next }))}
                      main={s.optionLabel} sub={s.optionLabel !== s.code ? s.code : null} tag={tag} />
                  )
                })}
              </div>
            )}
          </section>

          {optionKeys.map(o => {
            const chips = chipsFor(o)
            const allowed = new Set(erpFor(o).map(valueKey))
            return (
              <section key={o.key} className={c.section} aria-label={o.label}>
                <div className={c.sectionHead}>
                  <h3 className={c.sectionTitle}>{o.label}</h3>
                  <span className={c.sectionCount}>{chips.filter(v => isOn(o.key, v)).length} / {chips.length}</span>
                  <span className={c.spacer} />
                  {chips.length > 0 ? <>
                    <button type="button" className={c.small} onClick={() => setEnabled(prev => ({ ...prev, [o.key]: erpFor(o) }))}>Select all</button>
                    <button type="button" className={c.small} onClick={() => setEnabled(prev => ({ ...prev, [o.key]: [] }))}>Clear all</button>
                  </> : null}
                </div>
                {chips.length === 0 ? <p className={c.winSmall}>{isRestricted(model.allowed, o.key) ? 'No options are available for this model.' : 'The Maintenance list is empty.'}</p> : (
                  <div className={c.tileGrid} data-width={o.key === 'specials' ? 'long' : 'short'}>
                    {chips.map(v => {
                      const on = isOn(o.key, v)
                      const stale = !allowed.has(valueKey(v))
                      return (
                        <Tile key={v} on={on} disabled={stale && !on} label={`${o.label}: ${v}`} onChange={() => toggle(o.key, v)}
                          main={v} sub={null} tag={stale ? 'No longer allowed by ERP' : null} />
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })}
          {/* 2026-10-05: what the ticks above do to a bed frame's divan, leg, gap and total height on the Quote. */}
          {(model.category ?? '').toUpperCase() === 'BEDFRAME' ? (
            <p className={c.winSmall}>
              On the Quote, a divan, leg, gap or total height turned on here is offered with its charge from Maintenance. One turned on with no charge is FOC; one not turned on is never offered.
            </p>
          ) : null}
        </fieldset>
      </div>

      <footer className={c.winFoot}>
        {guard ? (
          <div className={c.winFootRow} role="alert">
            <span className={c.guardText}><strong>{model.code}</strong> has unsaved changes.</span>
            <button type="button" className={c.winSecondary} onClick={() => setGuard(null)}>Keep editing</button>
            <button type="button" className={c.winSecondary} onClick={() => { const g = guard; setGuard(null); perform(g) }}>Discard</button>
            <button type="button" className={c.winPrimary} data-guard="" onClick={() => save(guard)}>Save and {guard.kind === 'close' ? 'close' : 'continue'}</button>
          </div>
        ) : (
          <div className={c.winFootRow}>
            <span className={c.status} role="status" data-dirty={(dirty && !saving) || undefined}>{saving ? 'Saving…' : dirty ? plural(changes, 'unsaved change') : 'No unsaved changes'}</span>
            <button type="button" className={c.winSecondary} onClick={() => request({ kind: 'close' })} disabled={saving}>Cancel</button>
            <button type="button" className={c.winPrimary} onClick={() => save()} disabled={saving || !dirty} data-idle={!dirty || undefined}>{saving ? 'Saving…' : 'Save'}</button>
            {onStep ? (
              <button type="button" className={`${c.winSecondary} ${c.winNext}`} data-faded={(!dirty && !hasNext) || undefined}
                onClick={() => dirty ? save({ kind: 'step', dir: 1 }) : request({ kind: 'step', dir: 1 })} disabled={saving || (!dirty && !hasNext)}>
                {dirty ? 'Save & next ›' : 'Next ›'}
              </button>
            ) : null}
          </div>
        )}
      </footer>
    </section>
  )
}

/** A tick tile: the prototype's box-and-label, a real checkbox underneath. */
function Tile({ on, disabled, label, onChange, main, sub, tag }: {
  on: boolean
  disabled: boolean
  label: string
  onChange: (next: boolean) => void
  main: string
  sub: string | null
  tag: string | null
}) {
  return (
    <label className={c.pick} data-on={on || undefined} aria-disabled={disabled || undefined}>
      <input type="checkbox" className={c.pickInput} aria-label={label} checked={on} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className={c.box} aria-hidden="true"><TickIcon size={11} /></span>
      <span className={c.pickText}>
        <span className={c.pickMain}>{main}</span>
        {sub ? <span className={c.pickSub}>{sub}</span> : null}
        {tag ? <span className={c.pickTag}>{tag}</span> : null}
      </span>
    </label>
  )
}

function categoryName(category: string | null) {
  return (category ?? '').toUpperCase() === 'SOFA' ? 'sofa' : 'mattress'
}
