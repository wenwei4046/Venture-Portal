'use client'

import { useMemo, useState, type MouseEvent } from 'react'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'
import type { Ledger, LedgerLine } from '@/lib/cfo-reports'

/** Sentinel facet token for an empty segment / journal type. */
const BLANK = ' blank'

function formatSignedBalance(signed: number): string {
  const abs = Math.abs(signed)
  if (abs < 0.005) return '—'
  return `${formatMoney(abs)} ${signed >= 0 ? 'Dr' : 'Cr'}`
}

const SEGMENT_SHORT: Record<string, string> = {
  marketing: 'Mkt',
  finance: 'Fin',
  hr: 'HR',
  director_office: 'DO',
  director: 'Dir',
  corporate: 'Vent',
  treasury: 'Trs',
  unallocated: '—',
}
function segmentShort(seg: string): string {
  if (!seg) return ''
  return SEGMENT_SHORT[seg] ?? seg
}

const SEGMENT_LABEL: Record<string, string> = {
  marketing: 'Marketing',
  finance: 'Finance',
  hr: 'HR',
  director_office: 'Director Office',
  director: 'Director',
  corporate: 'Venture',
  treasury: 'Treasury',
  unallocated: 'Unallocated',
}
function segmentLabel(seg: string): string {
  if (seg === BLANK || !seg) return '(Blanks)'
  return SEGMENT_LABEL[seg] ?? seg
}
function journalTypeLabel(jt: string): string {
  return jt === BLANK || !jt ? '(Blanks)' : jt
}

const sortFacet = (a: string, b: string): number =>
  a === BLANK ? 1 : b === BLANK ? -1 : a.localeCompare(b, undefined, { numeric: true })

function isBfLine(l: LedgerLine): boolean {
  return l.description === 'BALANCE B/F' && l.entryDate === ''
}

function lineMatches(l: LedgerLine, q: string): boolean {
  if (!q) return true
  const haystack = [
    l.ref,
    l.description,
    l.accountDesc,
    l.journalType,
    l.entryNo,
    segmentShort(l.segment),
    l.segment,
    l.entryDate,
    l.entryDate ? dayjs(l.entryDate).format('D MMM YYYY') : '',
    l.entryDate ? dayjs(l.entryDate).format('DD/MM/YYYY') : '',
    l.debit > 0 ? formatMoney(l.debit) : '',
    l.credit > 0 ? formatMoney(l.credit) : '',
  ]
    .join('§')
    .toLowerCase()
  return haystack.includes(q)
}

export default function LedgerSections({ ledgers }: { ledgers: Ledger[] }) {
  const [query, setQuery] = useState('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  // Excel-style facet filters. null = no filter (every value passes).
  const [segSel, setSegSel] = useState<Set<string> | null>(null)
  const [jtSel, setJtSel] = useState<Set<string> | null>(null)

  const q = query.trim().toLowerCase()

  // Distinct segment / journal-type tokens across every real (non-B/F) line, so
  // the facet lists stay stable regardless of the active search or other filter.
  const { segTokens, jtTokens } = useMemo(() => {
    const segs = new Set<string>()
    const jts = new Set<string>()
    for (const led of ledgers) {
      for (const l of led.lines) {
        if (isBfLine(l)) continue
        segs.add(l.segment || BLANK)
        jts.add(l.journalType || BLANK)
      }
    }
    return {
      segTokens: Array.from(segs).sort(sortFacet),
      jtTokens: Array.from(jts).sort(sortFacet),
    }
  }, [ledgers])

  const prepared = useMemo(() => {
    const segPass = (l: LedgerLine) => !segSel || segSel.has(l.segment || BLANK)
    const jtPass = (l: LedgerLine) => !jtSel || jtSel.has(l.journalType || BLANK)
    const filtersActive = !!segSel || !!jtSel

    const out: Array<{ led: Ledger; lines: LedgerLine[]; matchedCount: number }> = []
    for (const led of ledgers) {
      const bf = led.lines.find(isBfLine) ?? null
      // Facet filters apply to lines regardless of an account-name search hit.
      const realLines = led.lines.filter((l) => !isBfLine(l) && segPass(l) && jtPass(l))

      // Account-level match: code or name hit → keep all (facet-passing) lines.
      const accountHit =
        !!q && (led.code.toLowerCase().includes(q) || led.accountName.toLowerCase().includes(q))

      let kept = !q || accountHit ? realLines : realLines.filter((l) => lineMatches(l, q))
      const narrowed = q || filtersActive
      const matchedCount = narrowed ? kept.length : 0
      if (narrowed && kept.length === 0) continue // hide sections with zero matches

      if (sortDir === 'desc') kept = [...kept].reverse()

      const finalLines = bf ? [bf, ...kept] : kept
      out.push({ led, lines: finalLines, matchedCount })
    }
    return out
  }, [ledgers, q, sortDir, segSel, jtSel])

  const filtersActive = !!segSel || !!jtSel
  const narrowed = !!q || filtersActive
  const totalMatches = prepared.reduce((s, p) => s + p.matchedCount, 0)
  const hiddenSections = narrowed ? ledgers.length - prepared.length : 0

  return (
    <div className="mt-2">
      {/* Toolbar — search + sort + facet filters */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[12rem] max-w-md">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ref, description, dept, date…"
            className="w-full pl-9 pr-9 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
          />
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <circle cx="9" cy="9" r="6" />
            <path d="M14 14l3 3" strokeLinecap="round" />
          </svg>
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-danger text-sm leading-none"
            >
              ×
            </button>
          ) : null}
        </div>
        <FacetFilter
          label="Dept"
          tokens={segTokens}
          selected={segSel}
          onChange={setSegSel}
          display={segmentLabel}
        />
        <FacetFilter
          label="Journal Type"
          tokens={jtTokens}
          selected={jtSel}
          onChange={setJtSel}
          display={journalTypeLabel}
        />
        <button
          type="button"
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          className="px-3 py-2 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors flex items-center gap-2"
          title={sortDir === 'asc' ? 'Oldest first (click for newest first)' : 'Newest first (click for oldest first)'}
        >
          <span>Date</span>
          <span className="text-base leading-none">{sortDir === 'asc' ? '↑' : '↓'}</span>
          <span className="text-muted">{sortDir === 'asc' ? 'oldest first' : 'newest first'}</span>
        </button>
      </div>

      {narrowed ? (
        <p className="font-serif italic text-muted text-xs mb-4">
          {totalMatches} matching {totalMatches === 1 ? 'line' : 'lines'} across {prepared.length} {prepared.length === 1 ? 'account' : 'accounts'}
          {hiddenSections > 0 ? ` · ${hiddenSections} ${hiddenSections === 1 ? 'account' : 'accounts'} hidden` : ''}
        </p>
      ) : null}

      {prepared.length === 0 ? (
        <p className="font-serif italic text-muted text-sm">
          {q ? (
            <>No lines match <strong>&ldquo;{query}&rdquo;</strong>. Try a different keyword or clear the filters.</>
          ) : (
            <>No lines match the active filters. Clear a filter to see more.</>
          )}
        </p>
      ) : (
        <div className="space-y-8">
          {prepared.map(({ led, lines }) => (
            <LedgerSection key={led.code} led={led} lines={lines} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Excel-style facet filter: a toolbar button (funnel) that opens a fixed-
 * positioned checkbox list of the column's distinct values + (All) + Clear.
 * Mirrors the per-column filter built into `SortableTable`, adapted for the
 * hand-rolled grouped ledger. `selected === null` means "all values pass".
 */
function FacetFilter({
  label,
  tokens,
  selected,
  onChange,
  display,
}: {
  label: string
  tokens: string[]
  selected: Set<string> | null
  onChange: (next: Set<string> | null) => void
  display: (token: string) => string
}) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  const [search, setSearch] = useState('')

  const active = selected !== null
  const allChecked = !selected || selected.size === tokens.length

  function openPanel(e: MouseEvent) {
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const left = Math.min(r.left, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 280)
    setAnchor({ top: r.bottom + 4, left: Math.max(8, left) })
    setSearch('')
    setOpen((o) => !o)
  }
  function tokenChecked(token: string): boolean {
    return selected ? selected.has(token) : true
  }
  function toggleToken(token: string) {
    const cur = new Set(selected ?? tokens)
    if (cur.has(token)) cur.delete(token)
    else cur.add(token)
    onChange(cur.size >= tokens.length ? null : cur)
  }
  function toggleAll() {
    onChange(allChecked ? new Set<string>() : null)
  }

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className={`px-3 py-2 border rounded-md text-xs font-mono transition-colors flex items-center gap-2 ${
          active
            ? 'bg-surface-2 border-accent-border text-ink'
            : 'bg-surface hover:bg-surface-2 border-hairline text-graphite hover:text-ink'
        }`}
        title={`Filter by ${label}`}
      >
        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M2 3.5h12L9.2 9v4l-2.4 1.2V9L2 3.5z" />
        </svg>
        <span>{label}</span>
        {active ? <span className="text-accent">●</span> : null}
      </button>

      {open && anchor ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="fixed z-50 w-64 bg-paper border border-hairline rounded-md shadow-xl p-2 text-left font-sans normal-case"
            style={{ top: anchor.top, left: anchor.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索值…"
              className="w-full mb-2 px-2 py-1 text-sm bg-paper border border-hairline rounded text-ink focus:outline-none focus:border-accent-border"
            />
            <div className="max-h-56 overflow-y-auto pr-1">
              {!search.trim() ? (
                <label className="flex items-center gap-2 py-0.5 text-sm cursor-pointer text-ink">
                  <input type="checkbox" className="accent-accent" checked={allChecked} onChange={toggleAll} />
                  <span className="font-medium">(All)</span>
                </label>
              ) : null}
              {tokens
                .filter((tok) => display(tok).toLowerCase().includes(search.trim().toLowerCase()))
                .map((tok) => (
                  <label key={tok} className="flex items-center gap-2 py-0.5 text-sm cursor-pointer text-ink">
                    <input
                      type="checkbox"
                      className="accent-accent shrink-0"
                      checked={tokenChecked(tok)}
                      onChange={() => toggleToken(tok)}
                    />
                    <span className="truncate" title={display(tok)}>
                      {display(tok)}
                    </span>
                  </label>
                ))}
              {tokens.length === 0 ? <div className="text-xs text-muted italic py-1">No values</div> : null}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-hairline">
              <button type="button" onClick={() => onChange(null)} className="text-xs text-muted hover:text-ink">
                Clear Filter
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-accent hover:text-accent-hover"
              >
                Close
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  )
}

function LedgerSection({ led, lines }: { led: Ledger; lines: LedgerLine[] }) {
  return (
    <section className="mb-10">
      <table className="ledger-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Acc. Desc.</th>
            <th>Journal Type</th>
            <th>Ref. 1</th>
            <th>Dept</th>
            <th>Desc.</th>
            <th className="num">Home DR</th>
            <th className="num">Home CR</th>
            <th className="num">Home Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr className="bg-surface border-t-2 border-hairline">
            <td colSpan={6} className="font-mono text-xs text-ink font-semibold">
              Acc. No.: {led.code} · {led.accountName}
            </td>
            <td className="num font-semibold">
              {led.periodTotals.debit > 0 ? formatMoney(led.periodTotals.debit) : '—'}
            </td>
            <td className="num font-semibold">
              {led.periodTotals.credit > 0 ? formatMoney(led.periodTotals.credit) : '—'}
            </td>
            <td className="num font-semibold">{formatSignedBalance(led.closingBalance)}</td>
          </tr>
          {lines.map((l, i) => {
            const isBf = isBfLine(l)
            return (
              <tr key={i} className={isBf ? 'text-graphite italic' : ''}>
                <td className="font-mono text-xs">
                  {l.entryDate ? dayjs(l.entryDate).format('D MMM YYYY') : '—'}
                </td>
                <td className="font-mono text-xs">{l.accountDesc}</td>
                <td className="font-mono text-xs uppercase tracking-wide text-accent">
                  {l.journalType}
                </td>
                <td className="font-mono text-sm text-ink">{l.ref}</td>
                <td className="font-mono text-xs text-graphite">{segmentShort(l.segment)}</td>
                <td className="text-sm">{l.description}</td>
                <td className="num">{l.debit > 0 ? formatMoney(l.debit) : '—'}</td>
                <td className="num">{l.credit > 0 ? formatMoney(l.credit) : '—'}</td>
                <td className="num">{formatSignedBalance(l.runningBalance)}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-hairline">
            <td colSpan={6} className="font-mono text-xs text-ink font-semibold">
              {led.code} {led.accountName} — total
            </td>
            <td className="num font-semibold">
              {led.periodTotals.debit > 0 ? formatMoney(led.periodTotals.debit) : '—'}
            </td>
            <td className="num font-semibold">
              {led.periodTotals.credit > 0 ? formatMoney(led.periodTotals.credit) : '—'}
            </td>
            <td className="num font-semibold text-num-ink">
              {formatSignedBalance(led.closingBalance)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  )
}
