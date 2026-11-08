'use client'

import { useMemo, useState } from 'react'
import { GWP_MAX_QTY, type GwpGiftPick } from '@/lib/catalogue/gwp-edits'
import type { PickSku } from '../load'
import { categoryLabel, SearchIcon, TickIcon } from './ui'
import c from './products.module.css'

const PICK_LIMIT = 20

/**
 * One side of a gift with purchase — the SKUs bought, or the gifts (Product List › GWP, 2026-11-08). Search, then
 * pick one at a time or every match at once (the user: "or can select all as well" — a mattress in every size);
 * what is picked stands above as chips, each taken off with its ×. The bought side ticks; the gifts' side counts
 * — a − / + beside each match sets how many of it a unit bought earns (the user: "换成就是 Quantity，就可以加 1、
 * 加 2、加 3 这样子"), 0 being off the list. A SKU picked on the other side shows here, and cannot be picked: one SKU
 * is never both bought and given.
 */
export default function GwpSkuPicker({ title, searchLabel, skus, picks, counted, elsewhere, elsewhereLabel, codeOf, onChange, disabled }: {
  title: string
  searchLabel: string
  skus: readonly PickSku[]
  /** What is picked, in the order it was — each with its quantity (1 on the bought side). */
  picks: readonly GwpGiftPick[]
  /** The gifts' side: a quantity for each pick rather than a tick. */
  counted: boolean
  /** The SKUs picked on the other side. */
  elsewhere: ReadonlySet<string>
  elsewhereLabel: string
  codeOf: (erpId: string) => string
  onChange: (next: GwpGiftPick[]) => void
  disabled: boolean
}) {
  const [query, setQuery] = useState('')
  const qtyOf = useMemo(() => new Map(picks.map(p => [p.erpId, p.qty])), [picks])
  const q = query.trim().toLowerCase()
  const matches = useMemo(
    () =>
      q
        ? skus.filter(
            s =>
              !s.removed &&
              [s.code, s.description, s.model, s.category ? categoryLabel(s.category) : null].some(v =>
                (v ?? '').toLowerCase().includes(q),
              ),
          )
        : [],
    [skus, q],
  )
  const shown = matches.slice(0, PICK_LIMIT)
  const free = shown.filter(s => !elsewhere.has(s.erpId))
  const allOn = free.length > 0 && free.every(s => qtyOf.has(s.erpId))

  /** A SKU at this quantity: 0 takes it off, a new one goes last. */
  function setQty(erpId: string, qty: number) {
    const next = Math.max(0, Math.min(GWP_MAX_QTY, qty))
    if (next === 0) onChange(picks.filter(p => p.erpId !== erpId))
    else if (qtyOf.has(erpId)) onChange(picks.map(p => (p.erpId === erpId ? { erpId, qty: next } : p)))
    else onChange([...picks, { erpId, qty: next }])
  }

  function pickAll() {
    if (allOn) {
      const off = new Set(free.map(s => s.erpId))
      onChange(picks.filter(p => !off.has(p.erpId)))
    } else {
      onChange([...picks, ...free.filter(s => !qtyOf.has(s.erpId)).map(s => ({ erpId: s.erpId, qty: 1 }))])
    }
  }

  const msg = !q ? null
    : matches.length === 0 ? 'No SKU matches.'
    : matches.length > PICK_LIMIT ? `Showing ${PICK_LIMIT} of ${matches.length.toLocaleString()}`
    : null

  return (
    <div className={c.picker} role="group" aria-label={title}>
      <div className={c.pickerHead}>
        <span className={c.pickerTitle}>{title.toUpperCase()}</span>
        <span className={c.gwpPickCount}>{picks.length}</span>
        {free.length > 1 ? (
          <button type="button" className={c.cellLink} disabled={disabled} onClick={pickAll}>
            {allOn ? (counted ? 'Take all off' : 'Untick all') : counted ? `Add all ${free.length}` : `Tick all ${free.length}`}
          </button>
        ) : null}
      </div>
      {picks.length > 0 ? (
        <span className={c.gwpChips}>
          {picks.map(p => (
            <span key={p.erpId} className={c.gwpChip} data-picked="">
              {codeOf(p.erpId)}
              {counted ? <span className={c.gwpChipQty}>×{p.qty}</span> : null}
              <button type="button" className={c.gwpChipX} disabled={disabled} aria-label={`Take ${codeOf(p.erpId)} off`}
                onClick={() => onChange(picks.filter(x => x.erpId !== p.erpId))}>×</button>
            </span>
          ))}
        </span>
      ) : null}
      {/* In a row, as Costing Setting's: the search box's flex basis is a width (in the card's column it became a height). */}
      <div className={c.pickerControls}>
        <label className={c.pickerSearch}>
          <SearchIcon />
          <input type="search" className={c.searchInput} value={query} disabled={disabled} onChange={e => setQuery(e.target.value)}
            placeholder="Search SKU code, description or model…" aria-label={searchLabel} />
        </label>
      </div>
      {msg ? <p className={c.pickerMsg}>{msg}</p> : null}
      {shown.length > 0 ? (
        <ul className={c.results}>
          {shown.map(s => {
            const there = elsewhere.has(s.erpId)
            const qty = qtyOf.get(s.erpId) ?? 0
            return (
              <li key={s.erpId} className={c.result}>
                {there ? null : counted ? (
                  <span className={c.gwpStepper} role="group" aria-label={`${s.code} quantity`}>
                    <button type="button" className={c.gwpStep} disabled={disabled || qty === 0} aria-label={`One ${s.code} less`}
                      onClick={() => setQty(s.erpId, qty - 1)}>−</button>
                    <span className={c.gwpStepCount} data-zero={qty === 0 || undefined} aria-live="polite">{qty}</span>
                    <button type="button" className={c.gwpStep} disabled={disabled || qty >= GWP_MAX_QTY} aria-label={`One ${s.code} more`}
                      onClick={() => setQty(s.erpId, qty + 1)}>+</button>
                  </span>
                ) : (
                  <button type="button" role="checkbox" aria-checked={qty > 0} aria-label={`Tick ${s.code}`} className={c.resultTick}
                    data-on={qty > 0 || undefined} disabled={disabled} onClick={() => setQty(s.erpId, qty > 0 ? 0 : 1)}>
                    <TickIcon size={12} />
                  </button>
                )}
                <span className={c.resultCode}>{s.code}</span>
                <span className={c.resultDesc}>{s.description ?? '—'}</span>
                {there ? <span className={c.pill}>{elsewhereLabel}</span> : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
