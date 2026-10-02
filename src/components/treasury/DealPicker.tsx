'use client'

import { useState, type ReactNode } from 'react'

// Picking one loan out of many, in two steps (2026-10-02).
//
// Both repayment forms offered every open deal in one <select>, each option a
// single line carrying six facts — "CONTS · RM 90,000.00 @ 0.500%/mo · 欠
// 64,500.00 · SC WS · 5 May 25" — sorted by amount, so one party's deals were
// scattered through 26 rows and nothing lined up (user: "太密密麻麻了,然后太多
// 选项了" … "选哪里一笔要整齐,你看长短不一"). The facts all have to stay: two
// loans to the same company are told apart by exactly the source and the date.
//
// So the party is chosen first, on buttons of equal size, and its name drops
// out of every row; what is left is dates and figures, set on ONE grid template
// shared by the header and every row, which is what keeps each column on the
// same line. A party with a single deal is selected outright.

export interface DealPickerItem {
  id: string
  /** Who the deal is with — the full name, not the short code. */
  party: string
  /** A word beside the name on the party button, e.g. 董事 / 子公司. */
  partyTag?: string | null
  /** YYYY-MM-DD; rows run oldest first. */
  date: string | null
  principal: number
  outstanding: number
}

export interface DealPickerColumn<T> {
  label: string
  /** Numbers go right and in tabular figures, so decimal points stack. */
  align?: 'left' | 'right'
  /** A CSS grid track: '1.2fr', '96px' … */
  width: string
  cell: (item: T) => ReactNode
  /** Greys the cell — for "—" where a deal has no rate or no fixed term. */
  dim?: (item: T) => boolean
}

interface Props<T extends DealPickerItem> {
  items: T[]
  value: string
  onChange: (id: string) => void
  columns: DealPickerColumn<T>[]
  /** Step labels, e.g. "谁还钱" / "还哪一笔". */
  partyLabel: string
  dealLabel: string
  /** Shown under step 2 until a party is chosen. */
  emptyHint: string
}

const money = (n: number) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function DealPicker<T extends DealPickerItem>({
  items,
  value,
  onChange,
  columns,
  partyLabel,
  dealLabel,
  emptyHint,
}: Props<T>) {
  const selected = items.find((i) => i.id === value) ?? null
  // The open party follows the selection, but can be opened before any deal is
  // picked — hence its own state.
  const [openParty, setOpenParty] = useState<string | null>(selected?.party ?? null)
  const party = selected?.party ?? openParty

  const groups = new Map<string, { tag: string | null; rows: T[]; owed: number }>()
  for (const item of items) {
    const g = groups.get(item.party) ?? { tag: item.partyTag ?? null, rows: [], owed: 0 }
    g.rows.push(item)
    g.owed += item.outstanding
    groups.set(item.party, g)
  }
  // Largest balance first: the party most likely to be paying.
  const parties = [...groups.entries()].sort((a, b) => b[1].owed - a[1].owed || a[0].localeCompare(b[0]))
  const rows = party
    ? [...(groups.get(party)?.rows ?? [])].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    : []
  const template = columns.map((c) => c.width).join(' ')

  function pickParty(name: string) {
    const only = groups.get(name)?.rows ?? []
    setOpenParty(name)
    // One deal: there is nothing to choose in step 2.
    if (only.length === 1) onChange(only[0].id)
    else if (selected && selected.party !== name) onChange('')
  }

  return (
    <div>
      <p className="font-sans text-[11px] uppercase tracking-[0.1em] text-muted mb-2">① {partyLabel}</p>
      <div role="radiogroup" aria-label={partyLabel} className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {parties.map(([name, g]) => {
          const on = name === party
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pickParty(name)}
              className={`min-w-0 text-left rounded-md border px-3 py-2 transition-colors ${
                on ? 'border-accent-border bg-accent-bg' : 'border-hairline bg-paper hover:border-accent-border'
              }`}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="truncate font-sans text-sm font-semibold text-ink" title={name}>
                  {name}
                </span>
                {g.tag ? (
                  <span className="shrink-0 rounded-full border border-hairline px-1.5 font-sans text-[10px] text-graphite">
                    {g.tag}
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 flex justify-between gap-2 font-mono tabular text-[11px] text-muted">
                <span>{g.rows.length} 笔</span>
                <span>欠 {money(g.owed)}</span>
              </span>
            </button>
          )
        })}
      </div>

      <p className="font-sans text-[11px] uppercase tracking-[0.1em] text-muted mb-2">② {dealLabel}</p>
      {party ? (
        <div className="overflow-x-auto">
          <div role="radiogroup" aria-label={dealLabel} className="min-w-[520px]">
            <div
              className="grid gap-x-4 px-3 pb-1.5 border-b border-hairline font-sans text-[11px] uppercase tracking-[0.06em] text-muted"
              style={{ gridTemplateColumns: template }}
            >
              {columns.map((c) => (
                <span key={c.label} className={c.align === 'right' ? 'text-right' : ''}>
                  {c.label}
                </span>
              ))}
            </div>
            {rows.map((row) => {
              const on = row.id === value
              return (
                <button
                  key={row.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onChange(row.id)}
                  className={`grid w-full items-center gap-x-4 px-3 py-2.5 border-b border-hairline text-left text-sm transition-colors ${
                    on ? 'bg-accent-bg shadow-[inset_3px_0_0_rgb(var(--accent))]' : 'hover:bg-paper'
                  }`}
                  style={{ gridTemplateColumns: template }}
                >
                  {columns.map((c) => (
                    <span
                      key={c.label}
                      className={`min-w-0 truncate ${
                        c.align === 'right' ? 'text-right font-mono tabular' : 'font-sans'
                      } ${c.dim?.(row) ? 'text-muted' : 'text-ink'}`}
                    >
                      {c.cell(row)}
                    </span>
                  ))}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="font-serif italic text-muted text-sm py-3">{emptyHint}</p>
      )}
    </div>
  )
}

/** 尚欠, with a thin bar for how much of the principal has come back. */
export function OwedCell({ principal, outstanding }: { principal: number; outstanding: number }) {
  const repaid = principal > 0 ? Math.max(0, Math.min(100, Math.round((1 - outstanding / principal) * 100))) : 0
  return (
    <span className="block">
      <strong className="font-semibold">{money(outstanding)}</strong>
      <span className="mt-1 ml-auto block h-1 w-20 overflow-hidden rounded-full bg-hairline" aria-hidden>
        <span className="block h-full bg-accent" style={{ width: `${repaid}%` }} />
      </span>
    </span>
  )
}

/** "05 May 2025" — fixed width, so the date column never changes length. */
export function dealDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]
  return month ? `${d} ${month} ${y}` : iso
}

/** A monthly rate as the picker prints it: "0.5%", "4%", or "—" for none. */
export function dealRate(pct: number): string {
  return pct > 0 ? `${Math.round(pct * 1000) / 1000}%` : '—'
}

export const dealMoney = money
