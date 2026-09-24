'use client'

import type { ReactNode } from 'react'

/**
 * The few pieces the Product List's tabs share. The ERP's category chips are
 * kept in the ERP's own order and words (All · Sofa · Bedframe · Accessory ·
 * Sofa Accessory · Mattress · …) so the two screens read side by side.
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

export function categoryLabel(c: string | null): string {
  if (!c) return '—'
  return CATEGORY_LABEL[c.toUpperCase()] ?? c.charAt(0) + c.slice(1).toLowerCase()
}

/** Categories present, in the ERP's order, unknown ones after. */
export function orderedCategories(present: Iterable<string | null>): string[] {
  const set = new Set<string>()
  for (const c of present) if (c) set.add(c.toUpperCase())
  const known = (CATEGORY_ORDER as readonly string[]).filter(c => set.has(c))
  const rest = [...set].filter(c => !(CATEGORY_ORDER as readonly string[]).includes(c)).sort()
  return [...known, ...rest]
}

export function Stat({
  label,
  value,
  note,
  alert,
}: {
  label: string
  value: string
  note?: string
  alert?: boolean
}) {
  return (
    <div className="border border-hairline rounded-md bg-surface px-4 py-3">
      <div className="text-[0.65rem] uppercase tracking-wider text-graphite">{label}</div>
      <div className={`text-2xl tabular tracking-[-0.01em] ${alert ? 'text-danger' : 'text-num-ink'}`}>{value}</div>
      {note ? <div className="text-xs text-graphite mt-1">{note}</div> : null}
    </div>
  )
}

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
        active ? 'bg-accent text-paper border-accent' : 'bg-surface text-graphite border-hairline hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

/** The mirror's own states of a row: new since the first load, off in the ERP, gone from it. */
export function MirrorFlags({ isNew, active, removed }: { isNew: boolean; active: boolean; removed: boolean }) {
  return (
    <>
      {isNew ? <span className="chip accent whitespace-nowrap">NEW</span> : null}
      {removed ? (
        <span className="chip danger whitespace-nowrap" title="The ERP no longer carries it — kept, because past bills sold it">
          GONE FROM ERP
        </span>
      ) : !active ? (
        <span className="chip whitespace-nowrap" title="Inactive in the ERP">
          INACTIVE
        </span>
      ) : null}
    </>
  )
}

export const MONEY_INPUT =
  'px-2 py-1 bg-paper border border-hairline rounded text-sm text-ink text-right tabular-nums focus:outline-none focus:border-accent-border'

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3 mb-4">{children}</div>
}

export function Notice({ tone, children }: { tone: 'ok' | 'error'; children: ReactNode }) {
  return (
    <p
      className={`font-serif italic text-sm mb-4 border rounded-card px-4 py-3 ${
        tone === 'error' ? 'text-danger border-danger bg-danger-bg' : 'text-ink border-hairline bg-surface'
      }`}
    >
      {children}
    </p>
  )
}
