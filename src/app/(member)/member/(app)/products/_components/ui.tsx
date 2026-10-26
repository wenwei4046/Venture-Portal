'use client'

import type { ChangeEvent, ReactNode } from 'react'
import { formatMoneyBare } from '@/lib/utils'
import c from './products.module.css'

/**
 * The pieces every Product List tab is built from (2026-10-08), drawn to the
 * prototype (design_handoff_product_list › ProductList.dc.html): the filter
 * panel and its chips, the search and labelled selects, the tier switch, the
 * action row, the note and the notice, the table card and its footer.
 *
 * The ERP's category chips are kept in the ERP's own order and words (All ·
 * Sofa · Bedframe · Accessory · Sofa Accessory · Mattress · …) so the two
 * screens read side by side.
 */

export const CATEGORY_ORDER = [
  'SOFA',
  'BEDFRAME',
  'ACCESSORY',
  'FABRIC_ACCESSORY',
  'MATTRESS',
  'BEDLINES',
  'DINING',
  'DIFFUSER',
  'CARPET',
  'SERVICE',
] as const

const CATEGORY_LABEL: Record<string, string> = {
  SOFA: 'Sofa',
  BEDFRAME: 'Bedframe',
  ACCESSORY: 'Accessory',
  FABRIC_ACCESSORY: 'Sofa Accessory',
  MATTRESS: 'Mattress',
  BEDLINES: 'Bedlines',
  DINING: 'Dining',
  DIFFUSER: 'Diffuser',
  CARPET: 'Carpet',
  SERVICE: 'Service',
}

export function categoryLabel(cat: string | null): string {
  if (!cat) return '—'
  return CATEGORY_LABEL[cat.toUpperCase()] ?? cat.charAt(0) + cat.slice(1).toLowerCase()
}

/** Categories present, in the ERP's order, unknown ones after. */
export function orderedCategories(present: Iterable<string | null>): string[] {
  const set = new Set<string>()
  for (const p of present) if (p) set.add(p.toUpperCase())
  const known = (CATEGORY_ORDER as readonly string[]).filter(k => set.has(k))
  const rest = [...set].filter(k => !(CATEGORY_ORDER as readonly string[]).includes(k)).sort()
  return [...known, ...rest]
}

/** "1 SKU" / "1,234 SKUs" — the prototype's `plural`. */
export function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`
}

/** A figure in a table: 2 decimals, negatives in brackets, nothing as —. */
export function money(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : formatMoneyBare(n)
}

/** PRICE_2 → P2. */
export function tierLabel(tier: string | null): string {
  return tier ? tier.replace('PRICE_', 'P') : 'Any'
}

// ── icons, as the prototype draws them ──────────────────────────────────────

export function SearchIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" style={{ color: 'var(--rv-sub)', flex: 'none' }}>
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="m13 13 4 4" />
    </svg>
  )
}

export function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <path d="m12.5 3.5 4 4M3 17l1-5L13.5 2.5a1.4 1.4 0 0 1 2 0l2 2a1.4 1.4 0 0 1 0 2L8 16l-5 1Z" />
    </svg>
  )
}

export function TickIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--rv-white)" strokeWidth={size > 11 ? 3.4 : 3.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 5 5L20 7" />
    </svg>
  )
}

// ── the filter panel ────────────────────────────────────────────────────────

export function FilterPanel({ children }: { children: ReactNode }) {
  return <div className={c.filters}>{children}</div>
}

export function ChipRow({ label, children, ariaLabel }: { label?: string; children: ReactNode; ariaLabel: string }) {
  return (
    <div className={c.chips} role="group" aria-label={ariaLabel}>
      {label ? <span className={c.chipLabel}>{label}</span> : null}
      {children}
    </div>
  )
}

export function Chip({ on, onClick, disabled, count, small, children }: {
  on: boolean
  onClick: () => void
  disabled?: boolean
  /** A count badge — the unsaved edits in a Maintenance pool. */
  count?: number
  /** The second row's smaller chip (Maintenance pools). */
  small?: boolean
  children: ReactNode
}) {
  return (
    <button type="button" className={small ? c.subChip : c.chip} aria-pressed={on} disabled={disabled} onClick={onClick}>
      {children}
      {count ? <span className={c.badge} aria-label={`${count} unsaved`}>{count}</span> : null}
    </button>
  )
}

export function SubChipRow({ children, ariaLabel }: { children: ReactNode; ariaLabel: string }) {
  return <div className={c.chips2} role="group" aria-label={ariaLabel}>{children}</div>
}

/** The controls row; ruled off from chips above it. */
export function Controls({ ruled, children }: { ruled: boolean; children: ReactNode }) {
  return <div className={c.controls} data-ruled={ruled || undefined}>{children}</div>
}

export function SearchField({ value, onChange, placeholder, label, disabled }: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  disabled?: boolean
}) {
  return (
    <label className={c.search}>
      <SearchIcon />
      <input type="search" className={c.searchInput} value={value} placeholder={placeholder} aria-label={label} disabled={disabled}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} />
    </label>
  )
}

export function SelectField({ label, value, onChange, options, disabled }: {
  label: string
  value: string
  onChange: (value: string) => void
  options: ReadonlyArray<readonly [string, string]>
  disabled?: boolean
}) {
  return (
    <label className={c.select}>
      <span className={c.selectLabel}>{label}</span>
      <select className={c.selectControl} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}

/** The tier switch: P1 · P2 · P3 (Combo Pricing adds All). */
export function TierControl({ label = 'Tier', value, onChange, options, disabled }: {
  label?: string
  value: string
  onChange: (value: string) => void
  options: ReadonlyArray<readonly [string, string]>
  disabled?: boolean
}) {
  return (
    <div className={c.select} role="group" aria-label={label === 'Tier' ? 'Fabric tier' : label}>
      <span className={c.selectLabel}>{label}</span>
      <div className={c.seg}>
        {options.map(([v, l]) => (
          <button key={v} type="button" className={c.segButton} aria-pressed={value === v} disabled={disabled} onClick={() => onChange(v)}>{l}</button>
        ))}
      </div>
    </div>
  )
}

// ── the action row ──────────────────────────────────────────────────────────

/** A count on the left (`<strong>N</strong> rest`), the buttons on the right. */
export function ActionRow({ count, rest, children }: { count?: string; rest?: ReactNode; children?: ReactNode }) {
  return (
    <div className={c.actions}>
      <p className={c.count} aria-live="polite">
        {count ? <strong>{count}</strong> : null}
        {count && rest ? ' ' : null}
        {rest}
      </p>
      <div className={c.buttons}>{children}</div>
    </div>
  )
}

export function EditButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={c.primary} onClick={onClick} disabled={disabled}>
      <PencilIcon />{label}
    </button>
  )
}

/** Cancel + Save N things; Save looks idle with nothing to save. */
export function EditingButtons({ cancelLabel = 'Cancel', onCancel, saveLabel, onSave, changes, saving, pending = saving }: {
  cancelLabel?: string
  onCancel: () => void
  saveLabel: string
  onSave: () => void
  changes: number
  /** Locks both buttons. */
  saving: boolean
  /** The write itself: the button reads Saving… only then. A tab that waits for its refresh after a save passes its write alone, and says Saved in its label meanwhile. */
  pending?: boolean
}) {
  return (
    <>
      <button type="button" className={c.secondary} onClick={onCancel} disabled={saving}>{cancelLabel}</button>
      <button type="button" className={c.primary} onClick={onSave} disabled={saving || changes === 0} data-idle={changes === 0 || undefined}>
        {pending ? 'Saving…' : saveLabel}
      </button>
    </>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <p className={c.note}>{children}</p>
}

export function Notice({ tone, children }: { tone: 'ok' | 'error'; children: ReactNode }) {
  return (
    <p className={c.notice} data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  )
}

export function Heading({ title, sub, readOnly }: { title: string; sub?: ReactNode; readOnly?: boolean }) {
  return (
    <div className={c.heading}>
      <h2 className={c.headingTitle}>{title}</h2>
      {sub ? <span className={c.headingSub}>{sub}</span> : null}
      {readOnly ? <span className={c.pill}>Read only</span> : null}
    </div>
  )
}

// ── table cells ─────────────────────────────────────────────────────────────

/** NEW / REMOVING / a mirror flag, after the cell's text. */
export function CellChip({ tone, children }: { tone?: 'new' | 'removing'; children: ReactNode }) {
  return <span className={c.cellChip} data-tone={tone}>{children}</span>
}

/** The mirror's own states of a row: new since the first load, off in the ERP, gone from it. */
export function MirrorFlags({ isNew, active, removed }: { isNew: boolean; active: boolean; removed: boolean }) {
  return (
    <>
      {isNew ? <CellChip>NEW</CellChip> : null}
      {removed ? <CellChip tone="removing">GONE FROM ERP</CellChip> : !active ? <CellChip>INACTIVE</CellChip> : null}
    </>
  )
}

/** A price typed in a table: orange-edged once it differs from what is saved. */
export function CellInput({ value, onChange, edited, width, label, disabled, placeholder = '—', rowCol }: {
  value: string
  onChange: (value: string) => void
  edited: boolean
  width?: number
  label: string
  disabled?: boolean
  placeholder?: string
  /** Where the box sits on a sheet, for a block pasted from Excel. */
  rowCol?: { row: number; column: number }
}) {
  return (
    <input className={c.cellInput} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} inputMode="decimal"
      data-edited={edited || undefined} aria-label={label} disabled={disabled} style={width ? { width } : undefined}
      data-row={rowCol?.row} data-column={rowCol?.column} />
  )
}

/** A choice in a table cell, drawn as `CellInput` is: amber while edited. */
export function CellSelect({ value, options, onChange, edited, label, disabled }: {
  value: string
  options: readonly (readonly [string, string])[]
  onChange: (value: string) => void
  edited: boolean
  label: string
  disabled?: boolean
}) {
  return (
    <select className={c.cellSelect} value={value} onChange={e => onChange(e.target.value)} data-edited={edited || undefined}
      aria-label={label} disabled={disabled}>
      {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
    </select>
  )
}

/** The footer under a table: what is shown, Show more, and a note on the right. */
export function TableFoot({ shown, more, onMore, note, children }: {
  shown: ReactNode
  more?: string
  onMore?: () => void
  note?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className={c.foot}>
      <span>{shown}</span>
      {more && onMore ? <button type="button" className={c.more} onClick={onMore}>{more}</button> : null}
      {children}
      <span className={c.footSpacer} />
      {note ? <span>{note}</span> : null}
    </div>
  )
}
