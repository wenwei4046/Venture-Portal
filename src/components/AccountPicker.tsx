'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { typeLabel, type AccountType } from '@/lib/coa'

export interface AccountOption {
  code: string
  name: string
  type: AccountType
  parent_code: string | null
  is_active: boolean
}

interface Props {
  accounts: AccountOption[]
  /** Currently selected code; pass empty string for "no selection". */
  value: string
  /** Fires when the user picks (or clears) an option. */
  onChange: (code: string) => void
  /** Form field name — also written to a hidden input so FormData captures it. */
  name: string
  /** Limit which account types appear. Defaults to all 8. */
  typeFilter?: AccountType[]
  placeholder?: string
  required?: boolean
  disabled?: boolean
  id?: string
}

/**
 * Searchable account picker.
 *
 * Drops in wherever a `<select name="account_code">` used to live. Features:
 *  - Type-to-filter: matches against `code` and `name` (case-insensitive).
 *  - Grouped by COA type, in `typeLabel()` order.
 *  - Header accounts (any account that has at least one child) are filtered
 *    out automatically — they can't be posted to.
 *  - Inactive accounts hidden.
 *  - Optional `typeFilter` to restrict (e.g. fund-in passes
 *    `['liability', 'equity']`; loan disbursement passes the BS-side four).
 *  - Writes the chosen code into a hidden input so the surrounding form
 *    submits it via FormData like any other field.
 *
 * Keep this component dumb: it doesn't talk to Supabase. The parent server
 * page fetches `accounts` from `chart_of_accounts` and passes them in.
 */
export default function AccountPicker({
  accounts,
  value,
  onChange,
  name,
  typeFilter,
  placeholder = 'Select account…',
  required = false,
  disabled = false,
  id,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlight, setHighlight] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Header detection: any account that is some other account's parent.
  const headerCodes = useMemo(() => {
    const s = new Set<string>()
    for (const a of accounts) if (a.parent_code) s.add(a.parent_code)
    return s
  }, [accounts])

  // Postable, type-filtered, search-filtered options.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return accounts.filter((a) => {
      if (!a.is_active) return false
      if (headerCodes.has(a.code)) return false
      if (typeFilter && !typeFilter.includes(a.type)) return false
      if (!q) return true
      return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
    })
  }, [accounts, headerCodes, typeFilter, search])

  // Group by type, preserving the canonical type order (typeLabel() order).
  const grouped = useMemo(() => {
    const order: AccountType[] = typeFilter ?? [
      'equity', 'fixed_asset', 'asset', 'liability',
      'revenue', 'cost', 'other_income', 'expense',
    ]
    const map = new Map<AccountType, AccountOption[]>()
    for (const a of filtered) {
      if (!map.has(a.type)) map.set(a.type, [])
      map.get(a.type)!.push(a)
    }
    const out: Array<{ type: AccountType; items: AccountOption[] }> = []
    for (const t of order) {
      const items = map.get(t)
      if (items && items.length > 0) {
        items.sort((x, y) => x.code.localeCompare(y.code))
        out.push({ type: t, items })
      }
    }
    return out
  }, [filtered, typeFilter])

  // Flat list of options in render order — index space for the keyboard
  // highlight pointer.
  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped])

  // Current selection display: "code · name" if we can resolve it.
  const selected = useMemo(
    () => (value ? accounts.find((a) => a.code === value) ?? null : null),
    [value, accounts],
  )

  // Click outside closes the dropdown.
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // Reset highlight when the filter shape changes.
  useEffect(() => {
    setHighlight(0)
  }, [search, open])

  // Keep highlighted item scrolled into view.
  useEffect(() => {
    if (!open) return
    const node = listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`)
    if (node) node.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  function pick(code: string) {
    onChange(code)
    setSearch('')
    setOpen(false)
    inputRef.current?.blur()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true)
      e.preventDefault()
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
      e.preventDefault()
      return
    }
    if (e.key === 'ArrowDown') {
      setHighlight((h) => Math.min(h + 1, flat.length - 1))
      e.preventDefault()
      return
    }
    if (e.key === 'ArrowUp') {
      setHighlight((h) => Math.max(h - 1, 0))
      e.preventDefault()
      return
    }
    if (e.key === 'Enter') {
      const opt = flat[highlight]
      if (opt) pick(opt.code)
      e.preventDefault()
      return
    }
  }

  // Display value in the visible input: while typing → user search; otherwise
  // → selected label or empty.
  const inputDisplay = open
    ? search
    : selected
      ? `${selected.code} · ${selected.name}`
      : ''

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        autoComplete="off"
        value={inputDisplay}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setSearch(e.target.value)
          if (!open) setOpen(true)
        }}
        onKeyDown={onKeyDown}
        className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border disabled:opacity-50 disabled:cursor-not-allowed"
      />
      {selected && !open ? (
        <button
          type="button"
          onClick={() => pick('')}
          aria-label="Clear account"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-danger text-sm px-1"
        >
          ×
        </button>
      ) : null}

      {/* Hidden input carries the actual code to the surrounding form */}
      <input type="hidden" name={name} value={value} required={required} />

      {open ? (
        <div
          ref={listRef}
          className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto bg-paper border border-hairline rounded-md shadow-md text-sm"
        >
          {flat.length === 0 ? (
            <div className="px-3 py-2 text-muted italic">No matching accounts.</div>
          ) : (
            grouped.map((g) => (
              <div key={g.type}>
                <div className="px-3 py-1 bg-surface border-b border-hairline font-mono text-[11px] uppercase tracking-wide text-graphite">
                  {typeLabel(g.type)}
                </div>
                {g.items.map((a) => {
                  const idx = flat.findIndex((f) => f.code === a.code)
                  const active = idx === highlight
                  return (
                    <button
                      key={a.code}
                      type="button"
                      data-idx={idx}
                      onMouseEnter={() => setHighlight(idx)}
                      onMouseDown={(e) => e.preventDefault()} // keep focus on input until click
                      onClick={() => pick(a.code)}
                      className={`w-full text-left px-3 py-1.5 flex items-baseline gap-2 ${
                        active ? 'bg-accent-bg text-ink' : 'hover:bg-surface'
                      }`}
                    >
                      <span className="font-mono text-[12px] text-graphite w-12 shrink-0">{a.code}</span>
                      <span className="text-ink">{a.name}</span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
