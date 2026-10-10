'use client'

import { useMemo, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import dayjs from 'dayjs'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import type { Ledger, LedgerLine } from '@/lib/cfo-reports'
import LedgerRow from '@/components/LedgerRow'

/** Sentinel facet token for an empty segment / journal type. */
const BLANK = ' blank'

function formatSignedBalance(signed: number): string {
  const abs = Math.abs(signed)
  if (abs < 0.005) return '—'
  return `${formatMoneyBare(abs)} ${signed >= 0 ? 'Dr' : 'Cr'}`
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
/** A department by name: the five core ones here, the ones added since (IT,
 *  Revenue Department) from the registry's `names` (2026-10-10 — they read
 *  as their segment keys before). */
function segmentLabel(seg: string, names: Record<string, string> = {}): string {
  if (seg === BLANK || !seg) return '(Blanks)'
  return SEGMENT_LABEL[seg] ?? names[seg] ?? seg
}
function journalTypeLabel(jt: string): string {
  return jt === BLANK || !jt ? '(Blanks)' : jt
}

const sortFacet = (a: string, b: string): number =>
  a === BLANK ? 1 : b === BLANK ? -1 : a.localeCompare(b, undefined, { numeric: true })

function isBfLine(l: LedgerLine): boolean {
  return l.description === 'BALANCE B/F' && l.entryDate === ''
}

function lineMatches(l: LedgerLine, q: string, names: Record<string, string>): boolean {
  if (!q) return true
  const haystack = [
    l.ref,
    l.description,
    l.accountDesc,
    l.journalType,
    l.entryNo,
    segmentShort(l.segment),
    l.segment,
    l.segment ? segmentLabel(l.segment, names) : '',
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

const NO_NAMES: Record<string, string> = {}

export default function LedgerSections({
  ledgers,
  deptNames = NO_NAMES,
}: {
  ledgers: Ledger[]
  /** The departments added since the five core ones, by segment (lib/ledger-view `ledgerDeptNames`). */
  deptNames?: Record<string, string>
}) {
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

      let kept = !q || accountHit ? realLines : realLines.filter((l) => lineMatches(l, q, deptNames))
      const narrowed = q || filtersActive
      const matchedCount = narrowed ? kept.length : 0
      if (narrowed && kept.length === 0) continue // hide sections with zero matches

      if (sortDir === 'desc') kept = [...kept].reverse()

      const finalLines = bf ? [bf, ...kept] : kept
      out.push({ led, lines: finalLines, matchedCount })
    }
    return out
  }, [ledgers, q, sortDir, segSel, jtSel, deptNames])

  const filtersActive = !!segSel || !!jtSel
  const narrowed = !!q || filtersActive
  const totalMatches = prepared.reduce((s, p) => s + p.matchedCount, 0)
  const hiddenSections = narrowed ? ledgers.length - prepared.length : 0

  return (
    <div className="mt-2">
      {/* Toolbar — search + sort + facet filters */}
      <div className="gl-toolbar">
        <div className="relative flex-1 min-w-[12rem]">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ref, description, dept, date…"
            className="w-full pl-9 pr-9 py-2 bg-white border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
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
          display={(seg) => segmentLabel(seg, deptNames)}
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
          className="btn-quiet-sheet flex items-center gap-2"
          title={sortDir === 'asc' ? 'Oldest first (click for newest first)' : 'Newest first (click for oldest first)'}
        >
          <span>Date</span>
          <span className="text-base leading-none">{sortDir === 'asc' ? '↑' : '↓'}</span>
          <span className="text-muted">{sortDir === 'asc' ? 'oldest first' : 'newest first'}</span>
        </button>
      </div>

      {narrowed ? (
        <p className="text-xs text-graphite mb-4">
          {totalMatches} matching {totalMatches === 1 ? 'line' : 'lines'} across {prepared.length} {prepared.length === 1 ? 'account' : 'accounts'}
          {hiddenSections > 0 ? ` · ${hiddenSections} ${hiddenSections === 1 ? 'account' : 'accounts'} hidden` : ''}
        </p>
      ) : null}

      {prepared.length === 0 ? (
        <p className="text-sm text-graphite">
          {q ? (
            <>No lines match <strong>&ldquo;{query}&rdquo;</strong>. Try a different keyword or clear the filters.</>
          ) : (
            <>No lines match the active filters. Clear a filter to see more.</>
          )}
        </p>
      ) : (
        <div>
          {prepared.map(({ led, lines }) => (
            <LedgerSection key={led.code} led={led} lines={lines} deptNames={deptNames} />
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
        className={`btn-quiet-sheet flex items-center gap-2 ${active ? 'border-accent-border' : ''}`}
        title={`Filter by ${label}`}
      >
        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M2 3.5h12L9.2 9v4l-2.4 1.2V9L2 3.5z" />
        </svg>
        <span>{label}</span>
        {active ? <span className="text-accent">●</span> : null}
      </button>

      {/* Portaled to document.body — a transformed ancestor re-bases `fixed`
          and the panel lands away from its button (user report 2026-06-12). */}
      {open && anchor && typeof document !== 'undefined' ? (
        createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="fixed z-50 w-64 bg-paper border border-hairline rounded-panel shadow-xl p-2 text-left font-sans normal-case"
            style={{ top: anchor.top, left: anchor.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
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
                Clear filter
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
        </>,
        document.body,
        )
      ) : null}
    </>
  )
}

/**
 * One account (2026-10-09, the user's Claude Design handoff): its code and
 * name as the section's heading with the count of its lines, then the table —
 * an Opening balance row (the balance brought forward), the lines with the
 * journal type a chip and the department named, and a Closing balance row
 * with the period's debits and credits.
 */
function LedgerSection({ led, lines, deptNames }: { led: Ledger; lines: LedgerLine[]; deptNames: Record<string, string> }) {
  const count = lines.filter((l) => !isBfLine(l)).length
  return (
    <section className="mb-10">
      <div className="sect-head">
        <h2>
          {led.code} · {led.accountName}
        </h2>
        <span className="rule" aria-hidden />
        <span className="count">
          {count} {count === 1 ? 'LINE' : 'LINES'}
        </span>
      </div>
      <div className="table-frame">
        <div className="table-frame-scroll">
          <table className="ledger-table [&_td.num]:whitespace-nowrap">
            <thead>
              <tr>
                <th>Date</th>
                <th className="m-hide">Acc. Desc.</th>
                <th className="m-hide">Journal Type</th>
                <th className="m-hide">Ref. 1</th>
                <th className="m-hide">Dept</th>
                <th className="m-hide">Desc.</th>
                <th className="right m-hide">Home DR</th>
                <th className="right m-hide">Home CR</th>
                <th className="right">Home Balance</th>
                <th className="lt-toggle" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) =>
                isBfLine(l) ? (
                  <LedgerRow key={i} className="gl-open">
                    <td className="font-mono text-xs whitespace-nowrap">{dayjs(led.from).format('D MMM YYYY')}</td>
                    <td className="m-hide" data-label="Acc. Desc.">
                      {led.code} · {led.accountName}
                    </td>
                    <td className="m-hide" data-label="Journal Type">—</td>
                    <td className="m-hide" data-label="Ref. 1">—</td>
                    <td className="m-hide" data-label="Dept">—</td>
                    <td className="m-hide" data-label="Desc.">Opening balance</td>
                    <td className="num m-hide" data-label="Home DR">—</td>
                    <td className="num m-hide" data-label="Home CR">—</td>
                    <td className="num">{formatSignedBalance(led.openingBalance)}</td>
                  </LedgerRow>
                ) : (
                  <LedgerRow key={i}>
                    <td className="font-mono text-xs whitespace-nowrap">{l.entryDate ? dayjs(l.entryDate).format('D MMM YYYY') : '—'}</td>
                    {/* code · name on every line (2026-10-10, the handoff — was the name alone). */}
                    <td className="text-xs m-hide" data-label="Acc. Desc.">
                      {led.code} · {l.accountDesc || led.accountName}
                    </td>
                    <td className="m-hide" data-label="Journal Type">
                      {l.journalType ? (
                        <span className="chip">
                          <span className="dot" />
                          {l.journalType}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    {/* A reference number in the body face, Inter 500 (the handoff), not the mono. */}
                    <td className="font-medium whitespace-nowrap m-hide" data-label="Ref. 1">
                      {l.ref}
                    </td>
                    <td className="m-hide" data-label="Dept">
                      {l.segment ? segmentLabel(l.segment, deptNames) : '—'}
                    </td>
                    <td className="m-hide" data-label="Desc.">
                      {l.description}
                    </td>
                    <td className="num m-hide" data-label="Home DR">
                      {l.debit > 0 ? formatMoneyBare(l.debit) : '—'}
                    </td>
                    <td className="num m-hide" data-label="Home CR">
                      {l.credit > 0 ? formatMoneyBare(l.credit) : '—'}
                    </td>
                    <td className="num">{formatSignedBalance(l.runningBalance)}</td>
                  </LedgerRow>
                ),
              )}
            </tbody>
            <tfoot>
              <tr>
                <td>Closing balance</td>
                <td className="m-hide" colSpan={5} />
                <td className="num m-hide">{led.periodTotals.debit > 0 ? formatMoneyBare(led.periodTotals.debit) : '—'}</td>
                <td className="num m-hide">{led.periodTotals.credit > 0 ? formatMoneyBare(led.periodTotals.credit) : '—'}</td>
                <td className="num">{formatSignedBalance(led.closingBalance)}</td>
                <td className="lt-toggle" aria-hidden />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  )
}
