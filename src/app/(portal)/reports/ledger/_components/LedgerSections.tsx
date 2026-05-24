'use client'

import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'
import type { Ledger, LedgerLine } from '@/lib/cfo-reports'

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

  const q = query.trim().toLowerCase()

  const prepared = useMemo(() => {
    const out: Array<{ led: Ledger; lines: LedgerLine[]; matchedCount: number }> = []
    for (const led of ledgers) {
      const bf = led.lines.find(isBfLine) ?? null
      const realLines = led.lines.filter((l) => !isBfLine(l))

      // Account-level match: code or name hit → keep all real lines.
      const accountHit =
        !!q && (led.code.toLowerCase().includes(q) || led.accountName.toLowerCase().includes(q))

      let kept = !q || accountHit ? realLines : realLines.filter((l) => lineMatches(l, q))
      const matchedCount = q ? kept.length : 0
      if (q && kept.length === 0) continue // hide sections with zero matches when searching

      if (sortDir === 'desc') kept = [...kept].reverse()

      const finalLines = bf ? [bf, ...kept] : kept
      out.push({ led, lines: finalLines, matchedCount })
    }
    return out
  }, [ledgers, q, sortDir])

  const totalMatches = prepared.reduce((s, p) => s + p.matchedCount, 0)
  const hiddenSections = q ? ledgers.length - prepared.length : 0

  return (
    <div className="mt-2">
      {/* Toolbar — search + sort */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
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

      {q ? (
        <p className="font-serif italic text-muted text-xs mb-4">
          {totalMatches} matching {totalMatches === 1 ? 'line' : 'lines'} across {prepared.length} {prepared.length === 1 ? 'account' : 'accounts'}
          {hiddenSections > 0 ? ` · ${hiddenSections} ${hiddenSections === 1 ? 'account' : 'accounts'} hidden` : ''}
        </p>
      ) : null}

      {prepared.length === 0 ? (
        <p className="font-serif italic text-muted text-sm">
          No lines match <strong>&ldquo;{query}&rdquo;</strong>. Try a different keyword or clear the search.
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
