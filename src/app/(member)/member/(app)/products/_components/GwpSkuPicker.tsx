'use client'

import { useMemo, useState } from 'react'
import type { PickSku } from '../load'
import { categoryLabel, SearchIcon, TickIcon } from './ui'
import c from './products.module.css'

const PICK_LIMIT = 20

/**
 * One side of a gift with purchase — the SKUs bought, or the gifts (Product List › GWP, 2026-11-08). Search, then
 * tick one at a time or every match at once (the user: "or can select all as well" — a mattress in every size);
 * what is picked stands above as chips, each taken off with its ×. A SKU picked on the other side shows here, and
 * cannot be ticked: one SKU is never both bought and given.
 */
export default function GwpSkuPicker({ title, searchLabel, skus, chosen, elsewhere, elsewhereLabel, codeOf, onChange, disabled }: {
  title: string
  searchLabel: string
  skus: readonly PickSku[]
  /** The SKU Master ids picked, in the order they were. */
  chosen: readonly string[]
  /** The SKUs picked on the other side. */
  elsewhere: ReadonlySet<string>
  elsewhereLabel: string
  codeOf: (erpId: string) => string
  onChange: (next: string[]) => void
  disabled: boolean
}) {
  const [query, setQuery] = useState('')
  const picked = useMemo(() => new Set(chosen), [chosen])
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
  const allOn = free.length > 0 && free.every(s => picked.has(s.erpId))

  function toggle(erpId: string) {
    onChange(picked.has(erpId) ? chosen.filter(id => id !== erpId) : [...chosen, erpId])
  }

  function tickAll() {
    if (allOn) {
      const off = new Set(free.map(s => s.erpId))
      onChange(chosen.filter(id => !off.has(id)))
    } else {
      onChange([...chosen, ...free.map(s => s.erpId).filter(id => !picked.has(id))])
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
        <span className={c.gwpPickCount}>{chosen.length}</span>
        {free.length > 1 ? (
          <button type="button" className={c.cellLink} disabled={disabled} onClick={tickAll}>
            {allOn ? 'Untick all' : `Tick all ${free.length}`}
          </button>
        ) : null}
      </div>
      {chosen.length > 0 ? (
        <span className={c.gwpChips}>
          {chosen.map(id => (
            <span key={id} className={c.gwpChip} data-picked="">
              {codeOf(id)}
              <button type="button" className={c.gwpChipX} disabled={disabled} aria-label={`Take ${codeOf(id)} off`}
                onClick={() => onChange(chosen.filter(x => x !== id))}>×</button>
            </span>
          ))}
        </span>
      ) : null}
      <label className={c.pickerSearch}>
        <SearchIcon />
        <input type="search" className={c.searchInput} value={query} disabled={disabled} onChange={e => setQuery(e.target.value)}
          placeholder="Search SKU code, description or model…" aria-label={searchLabel} />
      </label>
      {msg ? <p className={c.pickerMsg}>{msg}</p> : null}
      {shown.length > 0 ? (
        <ul className={c.results}>
          {shown.map(s => {
            const there = elsewhere.has(s.erpId)
            const on = picked.has(s.erpId)
            return (
              <li key={s.erpId} className={c.result}>
                {!there ? (
                  <button type="button" role="checkbox" aria-checked={on} aria-label={`Tick ${s.code}`} className={c.resultTick}
                    data-on={on || undefined} disabled={disabled} onClick={() => toggle(s.erpId)}>
                    <TickIcon size={12} />
                  </button>
                ) : null}
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
