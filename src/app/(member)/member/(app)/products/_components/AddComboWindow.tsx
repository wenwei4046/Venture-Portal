'use client'

import { useEffect, useId, useMemo, useRef, useState, useTransition, type MutableRefObject } from 'react'
import { TIERS } from '@/lib/catalogue/pricing'
import { addCombo } from '../actions'
import type { CatalogueSku, ComboRow } from '../load'
import FloatingWindow from './FloatingWindow'
import { checkCombo, comboModels, comboPieces, draftDirty, moduleSum, readAmount, setLine, type ComboDraft } from './add-combo'
import { money, plural, tierLabel } from './ui'
import c from './products.module.css'

/**
 * Combo Pricing › Add combo (2026-10-08, design_handoff_product_list): a sofa
 * set made here — a model, its compartments, and a price per fabric tier and
 * seat height. Saved, it is costed like every combo (`catalogue_apply_combos`,
 * `member_catalogue`; the portal's own since the same day): a sales line
 * covering these compartments takes the set price instead of adding its
 * modules up.
 */
export default function AddComboWindow({ open, initialModel, sofaSkus, heights, combos, onClose, onAdded, onDirtyChange }: {
  open: boolean
  /** The model the tab is filtered to, if any. */
  initialModel: string
  sofaSkus: CatalogueSku[]
  /** The seat heights a price can be typed at (Maintenance's sofa sizes). */
  heights: string[]
  /** Every combo there is — no set twice, no name twice. */
  combos: ComboRow[]
  onClose: () => void
  onAdded: (result: { model: string; label: string; filled: number }) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const titleId = useId()
  // The dim or Esc: the open window decides (its guard asks when anything is typed).
  const dismiss = useRef<() => void>(() => onClose())
  return (
    <FloatingWindow open={open} layer="combo" labelledBy={titleId} onDismiss={() => dismiss.current()}>
      {open ? <AddCombo titleId={titleId} dismiss={dismiss} initialModel={initialModel} sofaSkus={sofaSkus} heights={heights} combos={combos}
        onClose={onClose} onAdded={onAdded} onDirtyChange={onDirtyChange} /> : null}
    </FloatingWindow>
  )
}

function AddCombo({ titleId, dismiss, initialModel, sofaSkus, heights, combos, onClose, onAdded, onDirtyChange }: {
  titleId: string
  dismiss: MutableRefObject<() => void>
  initialModel: string
  sofaSkus: CatalogueSku[]
  heights: string[]
  combos: ComboRow[]
  onClose: () => void
  onAdded: (result: { model: string; label: string; filled: number }) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const models = useMemo(() => comboModels(sofaSkus), [sofaSkus])
  const [draft, setDraft] = useState<ComboDraft>(() => ({
    model: models.some(m => m.code === initialModel) ? initialModel : '',
    label: '',
    pcs: {},
    prices: {},
  }))
  const [guard, setGuard] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saving, startSaving] = useTransition()
  const pieces = useMemo(() => comboPieces(sofaSkus, draft.model), [sofaSkus, draft.model])
  const check = checkCombo(draft, pieces, heights, combos)
  const dirty = draftDirty(draft)
  const picked = pieces.filter(p => (draft.pcs[p.module] ?? 0) > 0).map(p => ({ ...p, n: draft.pcs[p.module] }))
  const line = setLine(picked)
  const modelLabel = models.find(m => m.code === draft.model)?.label ?? draft.model

  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  function up(next: Partial<ComboDraft>) {
    setErr(null)
    setDraft(d => ({ ...d, ...next }))
  }
  function close() {
    if (saving) return
    if (dirty) setGuard(true)
    else onClose()
  }
  useEffect(() => { dismiss.current = close })

  function copyTotals() {
    if (!picked.length) return
    const prices = { ...draft.prices }
    for (const t of TIERS) {
      for (const h of heights) {
        const sum = moduleSum(picked, t, h)
        const key = `${t}#${h}`
        if (sum !== null && !String(prices[key] ?? '').trim()) prices[key] = String(sum)
      }
    }
    up({ prices })
  }

  function save() {
    if (saving) return
    if (check.problem) { setErr(check.problem); return }
    startSaving(async () => {
      try {
        const result = await addCombo({ baseModel: draft.model, modules: check.modules, label: check.label, prices: check.prices })
        if (!result.ok) { setErr(result.reason); return }
        onAdded({ model: draft.model, label: check.label, filled: check.filled })
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Could not add the combo.')
      }
    })
  }

  const status = err ?? (check.problem && (draft.model || check.pieces) ? check.problem : `${plural(check.pieces, 'piece')} · ${check.filled} of ${TIERS.length * heights.length} prices filled`)

  return (
    <section aria-label="New combo" style={{ display: 'contents' }} aria-busy={saving}>
      <header className={c.winHead}>
        <div className={c.winHeadText}>
          <span className={c.eyebrow}><span className={c.eyebrowDash} />COMBO PRICING · NEW SET</span>
          <h2 id={titleId} className={c.winTitle}>
            {check.label || 'New combo'}
            {draft.model ? <span className={c.winTitleName}> · Model {modelLabel}</span> : null}
          </h2>
        </div>
        <button type="button" className={c.iconButton} aria-label="Close" onClick={close}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </header>

      <div className={c.winBody} data-gap="24">
        <div className={c.identity}>
          <label className={c.field}>
            <span className={c.fieldLabel}>SOFA MODEL</span>
            <select className={c.fieldSelect} aria-label="Sofa model" value={draft.model} disabled={saving} onChange={e => up({ model: e.target.value, pcs: {} })}>
              <option value="">Choose a model…</option>
              {models.map(m => <option key={m.code} value={m.code}>{m.label}</option>)}
            </select>
          </label>
          <label className={c.field}>
            <span className={c.fieldLabel}>SET NAME</span>
            <input className={c.fieldInput} aria-label="Set name" value={draft.label} disabled={saving} placeholder={line || 'e.g. 3+2'} onChange={e => up({ label: e.target.value })} />
            <span className={c.fieldNote}>Blank uses the compartments as the name.</span>
          </label>
        </div>

        <section className={c.section} aria-label="Compartments">
          <div className={c.sectionHead}>
            <h3 className={c.sectionTitle}>Compartments</h3>
            <span className={c.sectionCount}>{plural(check.pieces, 'piece')}</span>
            <span className={c.spacer} />
            <button type="button" className={c.small} disabled={saving} onClick={() => up({ pcs: {} })}>Clear all</button>
          </div>
          {!draft.model ? <p className={c.emptyBox}>Pick a sofa model to see its compartments.</p> : null}
          <div className={c.pieces}>
            {pieces.map(p => {
              const n = draft.pcs[p.module] ?? 0
              return (
                <div key={p.module} className={c.piece} data-on={n > 0 || undefined}>
                  <span className={c.pieceText}>
                    <span className={c.pieceSize}>{p.module}</span>
                    <span className={c.pieceCode}>{p.code}</span>
                  </span>
                  <div className={c.stepper}>
                    <button type="button" className={c.step} data-minus="" aria-label={`Remove one ${p.module}`} disabled={n === 0 || saving}
                      onClick={() => up({ pcs: { ...draft.pcs, [p.module]: n - 1 } })}>−</button>
                    <span className={c.stepCount} data-on={n > 0 || undefined}>{n}</span>
                    <button type="button" className={c.step} aria-label={`Add one ${p.module}`} disabled={saving}
                      onClick={() => up({ pcs: { ...draft.pcs, [p.module]: n + 1 } })}>+</button>
                  </div>
                </div>
              )
            })}
          </div>
          {picked.length > 0 ? (
            <div className={c.setLine}>
              <span className={c.setLineLabel}>THIS SET</span>
              {picked.map((p, i) => (
                <span key={p.module} className={c.setLineItem}>
                  {i > 0 ? <span className={c.setLinePlus}>+</span> : null}
                  <span className={c.setLineChip}>{p.n > 1 ? `${p.n} × ` : ''}{p.module}</span>
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <section className={c.section} aria-label="Price per set">
          <div className={c.sectionHead}>
            <h3 className={c.sectionTitle}>Price per set (RM)</h3>
            <span className={c.spacer} />
            <button type="button" className={c.small} style={{ opacity: picked.length ? 1 : 0.45 }} disabled={saving} onClick={copyTotals}>Copy module totals</button>
          </div>
          <div className={c.priceCard}>
            <table className={c.priceTable}>
              <thead>
                <tr>
                  <th className={c.priceHead} data-first="" scope="col">FABRIC TIER</th>
                  {heights.map(h => <th key={h} className={c.priceHead} scope="col">SEAT {h}</th>)}
                </tr>
              </thead>
              <tbody>
                {TIERS.map(t => (
                  <tr key={t} className={c.priceRow}>
                    <th scope="row" className={c.priceTier}>Fabric {tierLabel(t)}</th>
                    {heights.map(h => {
                      const key = `${t}#${h}`
                      const value = draft.prices[key] ?? ''
                      const sum = moduleSum(picked, t, h)
                      const bad = Number.isNaN(readAmount(value))
                      return (
                        <td key={h} className={c.priceCell}>
                          <div className={c.priceStack}>
                            <input className={c.priceInput} value={value} inputMode="decimal" disabled={saving}
                              aria-label={`Fabric ${tierLabel(t)} at ${h}`} placeholder={sum !== null ? String(sum) : '—'}
                              data-filled={(value.trim() !== '' && !bad) || undefined} data-bad={bad || undefined}
                              onChange={e => up({ prices: { ...draft.prices, [key]: e.target.value } })} />
                            <span className={c.priceSum}>{sum !== null ? `Modules ${money(sum)}` : 'Not sold'}</span>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={c.rule}>
            {picked.length
              ? `When a sales line for Model ${draft.model} has exactly ${line}, it uses this set price for its fabric tier and seat height instead of adding up the module prices. Leave a box blank if that size is not sold as this set.`
              : 'When a sales line has exactly these compartments, it uses the set price for its fabric tier and seat height instead of adding up the module prices.'}
          </p>
        </section>
      </div>

      <footer className={c.winFoot}>
        {guard ? (
          <div className={c.winFootRow} role="alert">
            <span className={c.guardText}>Discard this new combo?</span>
            <button type="button" className={c.winSecondary} onClick={() => setGuard(false)}>Keep editing</button>
            <button type="button" className={c.winSecondary} onClick={onClose}>Discard</button>
          </div>
        ) : (
          <div className={c.winFootRow}>
            <span className={`${c.status} ${c.statusCombo}`} role="status" data-error={err ? '' : undefined}>{saving ? 'Adding…' : status}</span>
            <button type="button" className={c.winSecondary} disabled={saving} onClick={close}>Cancel</button>
            <button type="button" className={c.winPrimary} disabled={saving} data-idle={check.problem ? '' : undefined} onClick={save}>Add combo</button>
          </div>
        )}
      </footer>
    </section>
  )
}
