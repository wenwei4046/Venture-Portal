'use client'

// Shared renderer for the GL-driven statements (P&L / Balance Sheet / Cash
// Flow). Format follows the-conts.pages.dev reference: current | comparison |
// Δ% | % of revenue columns, collapsible account groups, leaf rows expand to
// their underlying journal transactions, expand/collapse all.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { formatMoneyBare } from '@/lib/utils'
import type { AccountNode, ReportSection } from '@/lib/gl-reports'
import { deltaPct, pctOf, type ReportBlock } from '@/lib/gl-report-blocks'

export type { ReportBlock }

export interface GlReportViewProps {
  basePath: string
  period: string // 'YYYY-MM'
  /** 'YYYY-MM' or '' — comparison is OPT-IN (default single-month view). */
  compare: string
  segment: string // '' = all
  segments: { value: string; label: string }[]
  blocks: ReportBlock[]
  /** When set, a "% Rev" column shows each row ÷ this base (P&L only). */
  pctBase?: { current: number; previous: number }
  /** Column header labels, e.g. "Jun 2026" / "May 2026" or "As at 30 Jun". */
  currentLabel: string
  compareLabel: string
}

function stepMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function money(n: number): string {
  return formatMoneyBare(n)
}

export default function GlReportView({
  basePath,
  period,
  compare,
  segment,
  segments,
  blocks,
  pctBase,
  currentLabel,
  compareLabel,
}: GlReportViewProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [openTxns, setOpenTxns] = useState<Set<string>>(new Set())

  const allGroupCodes = useMemo(() => {
    const codes: string[] = []
    const walk = (n: AccountNode) => {
      if (n.children.length > 0) {
        codes.push(n.code)
        n.children.forEach(walk)
      }
    }
    for (const b of blocks) if (b.kind === 'section') b.section.nodes.forEach(walk)
    return codes
  }, [blocks])

  function navigate(nextPeriod: string, nextCompare: string, nextSegment: string) {
    const qs = new URLSearchParams()
    qs.set('period', nextPeriod)
    if (nextCompare) qs.set('compare', nextCompare)
    if (nextSegment) qs.set('segment', nextSegment)
    router.push(`${basePath}?${qs.toString()}`)
  }

  const toggle = (set: Set<string>, key: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    apply(next)
  }

  const withCompare = compare !== ''
  const colCount = 2 + (withCompare ? 2 : 0) + (pctBase ? 1 : 0)

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <label className="flex items-center gap-1.5 font-mono text-xs text-muted">
          Period
          <button
            type="button"
            onClick={() => navigate(stepMonth(period, -1), compare, segment)}
            className="px-2 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-sm text-graphite hover:text-ink transition-colors"
            aria-label="Previous month"
          >
            ‹
          </button>
          <input
            type="month"
            value={period}
            onChange={(e) => e.target.value && navigate(e.target.value, compare, segment)}
            className="px-2 py-1.5 bg-paper border border-hairline rounded-md text-sm text-ink font-mono focus:outline-none focus:border-accent-border"
          />
          <button
            type="button"
            onClick={() => navigate(stepMonth(period, 1), compare, segment)}
            className="px-2 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-sm text-graphite hover:text-ink transition-colors"
            aria-label="Next month"
          >
            ›
          </button>
        </label>
        <label className="flex items-center gap-1.5 font-mono text-xs text-muted">
          Compare
          {withCompare ? (
            <>
              <input
                type="month"
                value={compare}
                onChange={(e) => navigate(period, e.target.value, segment)}
                className="px-2 py-1.5 bg-paper border border-hairline rounded-md text-sm text-ink font-mono focus:outline-none focus:border-accent-border"
              />
              <button
                type="button"
                onClick={() => navigate(period, '', segment)}
                className="px-2 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs text-graphite hover:text-danger transition-colors"
                title="Remove comparison"
              >
                ×
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => navigate(period, stepMonth(period, -1), segment)}
              className="px-2.5 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
              title="Compare with the previous month"
            >
              + vs last month
            </button>
          )}
        </label>
        <label className="flex items-center gap-2 font-mono text-xs text-muted">
          Segment
          <select
            value={segment}
            onChange={(e) => navigate(period, compare, e.target.value)}
            className="px-2 py-1.5 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          >
            {segments.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setCollapsed(new Set())
              setOpenTxns(new Set())
            }}
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={() => {
              setCollapsed(new Set(allGroupCodes))
              setOpenTxns(new Set())
            }}
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            Collapse all
          </button>
        </div>
      </div>

      <table className="ledger-table">
        <thead>
          <tr>
            <th>Account</th>
            <th className="num">{currentLabel}</th>
            {withCompare ? <th className="num">{compareLabel}</th> : null}
            {withCompare ? <th className="num">Δ%</th> : null}
            {pctBase ? <th className="num">% Rev</th> : null}
          </tr>
        </thead>
        <tbody>
          {blocks.map((b, i) =>
            b.kind === 'section' ? (
              <SectionRows
                key={b.section.key}
                section={b.section}
                collapsed={collapsed}
                openTxns={openTxns}
                onToggleGroup={(code) => toggle(collapsed, code, setCollapsed)}
                onToggleTxns={(code) => toggle(openTxns, code, setOpenTxns)}
                pctBase={pctBase}
                colCount={colCount}
                withCompare={withCompare}
              />
            ) : (
              <tr
                key={`summary-${i}`}
                className={
                  b.row.emphasis === 'strong'
                    ? 'border-t-2 border-hairline bg-surface'
                    : 'border-t border-hairline'
                }
              >
                <td className={`font-serif italic ${b.row.emphasis === 'strong' ? 'text-ink font-semibold' : 'text-ink font-medium'}`}>
                  {b.row.label}
                  {b.row.sub ? (
                    <span className="ml-2 font-mono not-italic text-[11px] text-graphite">{b.row.sub}</span>
                  ) : null}
                </td>
                <td
                  className={`num ${b.row.emphasis === 'strong' ? 'font-semibold' : 'font-medium'} ${
                    b.row.tone === 'auto'
                      ? b.row.current >= 0
                        ? 'text-ledger'
                        : 'text-danger'
                      : b.row.tone === 'ledger'
                        ? 'text-ledger'
                        : b.row.tone === 'danger'
                          ? 'text-danger'
                          : ''
                  }`}
                >
                  {b.row.current < 0 ? <span className="neg">{money(b.row.current)}</span> : money(b.row.current)}
                </td>
                {withCompare ? (
                  <td className="num text-graphite">
                    {b.row.previous < 0 ? <span className="neg">{money(b.row.previous)}</span> : money(b.row.previous)}
                  </td>
                ) : null}
                {withCompare ? (
                  <td className="num text-graphite">{deltaPct(b.row.current, b.row.previous)}</td>
                ) : null}
                {pctBase ? (
                  <td className="num text-graphite">{pctOf(b.row.current, pctBase.current)}</td>
                ) : null}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}

function SectionRows({
  section,
  collapsed,
  openTxns,
  onToggleGroup,
  onToggleTxns,
  pctBase,
  colCount,
  withCompare,
}: {
  section: ReportSection
  collapsed: Set<string>
  openTxns: Set<string>
  onToggleGroup: (code: string) => void
  onToggleTxns: (code: string) => void
  pctBase?: { current: number; previous: number }
  colCount: number
  withCompare: boolean
}) {
  const rows: React.ReactNode[] = []

  rows.push(
    <tr key={`sect-${section.key}`} className="bg-surface border-t-2 border-hairline">
      <td colSpan={colCount} className="font-serif italic text-ink font-semibold text-[15px]">
        {section.label}
      </td>
    </tr>,
  )

  const renderNode = (n: AccountNode, depth: number) => {
    const isGroup = n.children.length > 0
    const isCollapsed = collapsed.has(n.code)
    const txnsOpen = openTxns.has(n.code)
    const hasTxns = !isGroup && n.txns.length > 0
    rows.push(
      <tr key={n.code}>
        <td>
          <div className="flex items-baseline" style={{ paddingLeft: `${depth * 18}px` }}>
            {isGroup ? (
              <button
                type="button"
                onClick={() => onToggleGroup(n.code)}
                className="mr-1.5 font-mono text-[10px] text-graphite hover:text-ink w-3"
                aria-label={isCollapsed ? 'Expand' : 'Collapse'}
              >
                {isCollapsed ? '▸' : '▾'}
              </button>
            ) : hasTxns ? (
              <button
                type="button"
                onClick={() => onToggleTxns(n.code)}
                className="mr-1.5 font-mono text-[10px] text-muted hover:text-accent w-3"
                aria-label={txnsOpen ? 'Hide transactions' : 'Show transactions'}
                title={`${n.txns.length} transaction${n.txns.length === 1 ? '' : 's'} this period`}
              >
                {txnsOpen ? '▾' : '▸'}
              </button>
            ) : (
              <span className="mr-1.5 w-3" aria-hidden />
            )}
            <span className="font-mono text-xs text-graphite mr-2">{n.code}</span>
            <span className={`text-sm ${isGroup ? 'font-medium text-ink' : 'text-ink'}`}>{n.name}</span>
            {hasTxns ? (
              <span className="ml-2 font-mono text-[10px] text-muted">({n.txns.length})</span>
            ) : null}
          </div>
        </td>
        <td className={`num ${isGroup ? 'font-medium' : ''}`}>
          {n.current < 0 ? <span className="neg">{money(n.current)}</span> : money(n.current)}
        </td>
        {withCompare ? (
          <td className="num text-graphite">
            {n.previous < 0 ? <span className="neg">{money(n.previous)}</span> : money(n.previous)}
          </td>
        ) : null}
        {withCompare ? <td className="num text-graphite">{deltaPct(n.current, n.previous)}</td> : null}
        {pctBase ? <td className="num text-graphite">{pctOf(n.current, pctBase.current)}</td> : null}
      </tr>,
    )
    if (hasTxns && txnsOpen) {
      for (let i = 0; i < n.txns.length; i++) {
        const t = n.txns[i]
        rows.push(
          <tr key={`${n.code}-txn-${i}`} className="bg-surface/60">
            <td>
              <div className="flex items-baseline gap-3 font-mono text-[11px] text-graphite" style={{ paddingLeft: `${depth * 18 + 22}px` }}>
                <span>{dayjs(t.date).format('D MMM')}</span>
                <span className="text-accent">{t.entryNo ?? '—'}</span>
                <span className="text-muted truncate max-w-[26rem]" title={t.description}>
                  {t.description}
                </span>
              </div>
            </td>
            <td className="num font-mono text-[11px] text-graphite">
              {t.amount < 0 ? <span className="neg">{money(t.amount)}</span> : money(t.amount)}
            </td>
            {colCount > 2 ? <td colSpan={colCount - 2} /> : null}
          </tr>,
        )
      }
    }
    if (isGroup && !isCollapsed) {
      for (const c of n.children) renderNode(c, depth + 1)
    }
  }

  for (const n of section.nodes) renderNode(n, 0)

  if (section.nodes.length === 0) {
    rows.push(
      <tr key={`empty-${section.key}`}>
        <td colSpan={colCount} className="font-serif italic text-muted text-sm">
          No activity.
        </td>
      </tr>,
    )
  }

  return <>{rows}</>
}
