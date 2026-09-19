'use client'

// Shared renderer for the GL-driven statements (P&L / Balance Sheet / Cash
// Flow). Format follows the-conts.pages.dev reference: current | comparison |
// Δ% | % of revenue columns, collapsible account groups, leaf rows expand to
// their underlying journal transactions, expand/collapse all.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { formatMoneyBare } from '@/lib/utils'
import type { AccountNode, ReportSection } from '@/lib/gl-reports'
import { deltaPct, pctOf, type ReportBlock } from '@/lib/gl-report-blocks'
import { matchesAccount } from '@/lib/report-search'
import Highlight from './Highlight'

export type { ReportBlock }

export interface GlReportViewProps {
  basePath: string
  period: string // 'YYYY-MM'
  /** 'YYYY-MM' or '' — comparison is OPT-IN (default single-month view). */
  compare: string
  segment: string // '' = all
  segments: { value: string; label: string; dot?: string }[]
  blocks: ReportBlock[]
  /** When set, a "% Rev" column shows each row ÷ this base (P&L only). */
  pctBase?: { current: number; previous: number }
  /** Column header labels, e.g. "Jun 2026" / "May 2026" or "As at 30 Jun". */
  currentLabel: string
  compareLabel: string
  /** 'cf' (default) = the navy / gold report skin (user 2026-09-18 "蓝为主",
   *  then "report 那边的颜色等等弄到和 cash flow 的一样"); 'ledger' = the
   *  portal's plain ledger look. */
  skin?: 'cf' | 'ledger'
}

/** Collapse key for a headed section that is NOT a merged root (its own row
 *  has no account code to key on). */
const sectKey = (sectionKey: string) => `sect:${sectionKey}`

/** Every foldable row key (groups) and every leaf with transactions (txns),
 *  in document order. Row identity is `${section.key}:${code}` — the SAME
 *  account can appear in two sections (e.g. 3052 in both 实收 and 支出 of the
 *  cash-flow grammar); bare codes made those rows share React keys + open
 *  state, so clicking the first copy only ever expanded the last one (user
 *  2026-08-29: "点不开"). A headed section folds like a group too, keyed by
 *  its merged root's code or, without one, sectKey(). */
function collectFoldKeys(blocks: ReportBlock[]): { groups: string[]; txns: string[] } {
  const groups: string[] = []
  const txns: string[] = []
  const walk = (sk: string, n: AccountNode) => {
    if (n.children.length > 0) {
      groups.push(`${sk}:${n.code}`)
      n.children.forEach((c) => walk(sk, c))
    } else if (n.txns.length > 0) {
      txns.push(`${sk}:${n.code}`)
    }
  }
  for (const b of blocks) {
    if (b.kind !== 'section') continue
    const s = b.section
    if (s.headed && s.root) {
      walk(s.key, s.root) // the root's children ARE s.nodes
    } else if (s.headed) {
      groups.push(sectKey(s.key))
      s.nodes.forEach((n) => walk(s.key, n))
    } else {
      s.nodes.forEach((n) => walk(s.key, n))
    }
  }
  return { groups, txns }
}

function stepMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function money(n: number): string {
  // Accounting convention: zero renders as a dash (matches the Excel/PDF
  // exports' `#,##0.00;(#,##0.00);—` number format).
  if (Math.abs(n) < 0.005) return '—'
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
  skin = 'cf',
}: GlReportViewProps) {
  const router = useRouter()
  // A statement with layout (headed) sections opens folded to its category
  // rows — L1, as in the approved Cash Flow mock-up (2026-09-18); the rail's
  // L2 / L3 open it up. The plain statements (P&L, BS, R&P) open fully.
  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    blocks.some((b) => b.kind === 'section' && b.section.headed)
      ? new Set(collectFoldKeys(blocks).groups)
      : new Set(),
  )
  const [openTxns, setOpenTxns] = useState<Set<string>>(new Set())

  // L1 = top accounts only · L2 = every account level · L3 = + transactions.
  const { allGroupCodes, allTxnCodes } = useMemo(() => {
    const k = collectFoldKeys(blocks)
    return { allGroupCodes: k.groups, allTxnCodes: k.txns }
  }, [blocks])

  const setLevel = (level: 1 | 2 | 3) => {
    setCollapsed(level === 1 ? new Set(allGroupCodes) : new Set())
    setOpenTxns(level === 3 ? new Set(allTxnCodes) : new Set())
  }

  // ─── Account search ───
  // Highlights, never hides: a filtered statement invites reading a subtotal as
  // if it covered only the visible rows. Matches are collected in document
  // order so ‹ › walks the report top-to-bottom, and every ancestor of a match
  // is forced open so the hit is actually on screen whatever the detail level.
  const [search, setSearch] = useState('')
  const [activeHit, setActiveHit] = useState(0)
  // Bumped on every jump request. With a single match the index can't move, so
  // the scroll effect would never re-fire and Enter looked dead (user
  // 2026-07-31); watching this makes every Enter jump regardless.
  const [jump, setJump] = useState(0)

  const { hitCodes, forceOpen } = useMemo(() => {
    const hits: string[] = []
    const open = new Set<string>()
    if (!search.trim()) return { hitCodes: hits, forceOpen: open }
    const walk = (sk: string, n: AccountNode, ancestors: string[]) => {
      if (matchesAccount(search, n.code, n.name)) {
        hits.push(`${sk}:${n.code}`)
        for (const a of ancestors) open.add(a)
      }
      if (n.children.length > 0) {
        const next = [...ancestors, `${sk}:${n.code}`]
        for (const c of n.children) walk(sk, c, next)
      }
    }
    for (const b of blocks) {
      if (b.kind !== 'section') continue
      const s = b.section
      // A merged root is a real account row (searchable); a plain headed
      // section is an ancestor its hits must force open.
      if (s.headed && s.root) walk(s.key, s.root, [])
      else s.nodes.forEach((n) => walk(s.key, n, s.headed ? [sectKey(s.key)] : []))
    }
    return { hitCodes: hits, forceOpen: open }
  }, [blocks, search])

  const hitSet = useMemo(() => new Set(hitCodes), [hitCodes])
  const activeCode = hitCodes.length > 0 ? hitCodes[activeHit % hitCodes.length] : null

  // A new query restarts at the first hit — and counts as a jump, so typing
  // straight to a single match scrolls to it without touching Enter.
  useEffect(() => {
    setActiveHit(0)
    setJump((j) => j + 1)
  }, [search])
  useEffect(() => {
    if (!activeCode) return
    document
      .getElementById(`gl-row-${activeCode}`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeCode, jump])

  const stepHit = (delta: number) => {
    if (hitCodes.length === 0) return
    setActiveHit((i) => (i + delta + hitCodes.length) % hitCodes.length)
    setJump((j) => j + 1)
  }

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

  const railHead = 'font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-muted mb-2'
  const railBtn =
    'px-2 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors'

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start">
      {/* ── Left rail: period / compare / detail / segment ── */}
      <aside className="w-full lg:w-60 shrink-0 lg:sticky lg:top-4 space-y-6">
        <div>
          <div className={railHead}>Period</div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => navigate(stepMonth(period, -1), compare, segment)}
              className={railBtn}
              aria-label="Previous month"
            >
              ‹
            </button>
            <input
              type="month"
              value={period}
              onChange={(e) => e.target.value && navigate(e.target.value, compare, segment)}
              className="flex-1 min-w-0 px-2 py-1.5 bg-paper border border-hairline rounded-md text-sm text-ink font-mono focus:outline-none focus:border-accent-border"
            />
            <button
              type="button"
              onClick={() => navigate(stepMonth(period, 1), compare, segment)}
              className={railBtn}
              aria-label="Next month"
            >
              ›
            </button>
          </div>
        </div>

        <div>
          <div className={railHead}>Compare</div>
          {withCompare ? (
            <div className="flex items-center gap-1.5">
              <input
                type="month"
                value={compare}
                onChange={(e) => navigate(period, e.target.value, segment)}
                className="flex-1 min-w-0 px-2 py-1.5 bg-paper border border-hairline rounded-md text-sm text-ink font-mono focus:outline-none focus:border-accent-border"
              />
              <button
                type="button"
                onClick={() => navigate(period, '', segment)}
                className={`${railBtn} hover:text-danger`}
                title="Remove comparison"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigate(period, stepMonth(period, -1), segment)}
              className={`${railBtn} w-full`}
              title="Compare with the previous month"
            >
              + vs last month
            </button>
          )}
        </div>

        <div>
          <div className={railHead}>Find account</div>
          <div className="relative">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  stepHit(e.shiftKey ? -1 : 1)
                } else if (e.key === 'Escape') {
                  setSearch('')
                }
              }}
              placeholder="Code or name…"
              aria-label="Find account by code or name"
              className="search-plain w-full px-2.5 py-1.5 pr-7 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted hover:text-danger font-mono text-sm px-1"
                aria-label="Clear search"
              >
                ×
              </button>
            ) : null}
          </div>
          {search.trim() ? (
            <div className="flex items-center justify-between gap-2 mt-1.5">
              <span className="font-mono text-[11px] text-muted">
                {hitCodes.length === 0
                  ? 'No match'
                  : `${activeHit + 1} / ${hitCodes.length} match${hitCodes.length === 1 ? '' : 'es'}`}
              </span>
              {hitCodes.length > 0 ? (
                <span className="flex items-center gap-1">
                  <button type="button" onClick={() => stepHit(-1)} className={railBtn} aria-label="Previous match">
                    ‹
                  </button>
                  <button type="button" onClick={() => stepHit(1)} className={railBtn} aria-label="Next match">
                    ›
                  </button>
                </span>
              ) : null}
            </div>
          ) : (
            <p className="font-serif italic text-muted text-[11px] mt-1.5 leading-snug">
              Highlights only — nothing is hidden, so every total still covers the full report.
            </p>
          )}
        </div>

        <div>
          <div className={railHead}>Detail level</div>
          <div className="flex items-center gap-1.5">
            {([
              [1, 'L1', 'Top accounts only'],
              [2, 'L2', 'All account levels'],
              [3, 'L3', 'Everything incl. transactions'],
            ] as const).map(([lvl, label, title]) => (
              <button key={lvl} type="button" onClick={() => setLevel(lvl)} title={title} className={`${railBtn} flex-1`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className={railHead}>Segment</div>
          <div className="space-y-0.5">
            {segments.map((s) => {
              const active = segment === s.value
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => navigate(period, compare, s.value)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-[13px] transition-colors ${
                    active ? 'bg-accent-bg text-ink font-medium' : 'text-graphite hover:bg-surface-2 hover:text-ink'
                  }`}
                >
                  <span
                    className={`inline-flex w-3.5 h-3.5 rounded-full border items-center justify-center shrink-0 ${
                      active ? 'border-accent' : 'border-hairline'
                    }`}
                    aria-hidden
                  >
                    {active ? <span className="w-1.5 h-1.5 rounded-full bg-accent" /> : null}
                  </span>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot ?? 'bg-muted'}`} aria-hidden />
                  <span className="truncate">{s.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </aside>

      {/* ── Statement table ── */}
      <div className="flex-1 min-w-0 overflow-x-auto">
      <table className={`ledger-table gl-report${skin === 'cf' ? ' cf-report' : ''}`}>
        <thead>
          <tr>
            <th>Account</th>
            <th className="num">{currentLabel}</th>
            {withCompare ? <th className="num m-hide">{compareLabel}</th> : null}
            {withCompare ? <th className="num m-hide">Δ%</th> : null}
            {pctBase ? <th className="num m-hide">% Rev</th> : null}
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
                search={search}
                hitSet={hitSet}
                activeCode={activeCode}
                forceOpen={forceOpen}
              />
            ) : (
              <tr
                key={`summary-${i}`}
                className={
                  b.row.emphasis === 'strong'
                    ? 'row-summary-strong border-t-2 border-hairline'
                    : 'row-summary border-t border-hairline'
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
                  <td className="num text-graphite m-hide">
                    {b.row.previous < 0 ? <span className="neg">{money(b.row.previous)}</span> : money(b.row.previous)}
                  </td>
                ) : null}
                {withCompare ? (
                  <td className="num text-graphite m-hide">{deltaPct(b.row.current, b.row.previous)}</td>
                ) : null}
                {pctBase ? (
                  <td className="num text-graphite m-hide">{pctOf(b.row.current, pctBase.current)}</td>
                ) : null}
              </tr>
            ),
          )}
        </tbody>
      </table>
      </div>
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
  search,
  hitSet,
  activeCode,
  forceOpen,
}: {
  section: ReportSection
  collapsed: Set<string>
  openTxns: Set<string>
  onToggleGroup: (code: string) => void
  onToggleTxns: (code: string) => void
  pctBase?: { current: number; previous: number }
  colCount: number
  withCompare: boolean
  search: string
  hitSet: Set<string>
  activeCode: string | null
  /** Ancestors of a match — opened regardless of the collapsed state. */
  forceOpen: Set<string>
}) {
  const rows: React.ReactNode[] = []

  /** `header` = this node is a headed section's own row (a merged root): band
   *  styling, same toggles — its children then sit one step in. */
  const renderNode = (n: AccountNode, depth: number, header = false) => {
    const isGroup = n.children.length > 0
    // Section-scoped row identity — the same account may appear in another
    // section (cash-flow in/out both carry e.g. 3052), and sharing bare-code
    // keys/state made the first copy un-expandable.
    const rk = `${section.key}:${n.code}`
    // A match below forces its ancestors open, so a hit is never buried.
    const isCollapsed = collapsed.has(rk) && !forceOpen.has(rk)
    const isHit = hitSet.has(rk)
    const isActive = activeCode === rk
    const txnsOpen = openTxns.has(rk)
    const hasTxns = !isGroup && n.txns.length > 0
    // The whole code+name area toggles — not just the arrow (user 2026-06-11).
    const toggleAction = isGroup
      ? () => onToggleGroup(rk)
      : hasTxns
        ? () => onToggleTxns(rk)
        : undefined
    rows.push(
      <tr
        key={rk}
        id={`gl-row-${rk}`}
        className={`${header ? 'row-cat' : isGroup ? 'row-group' : 'row-leaf'}${
          isActive ? ' search-row-active' : isHit ? ' search-row-hit' : ''
        }`}
      >
        <td>
          <button
            type="button"
            onClick={toggleAction}
            disabled={!toggleAction}
            className={`flex items-baseline text-left w-full ${toggleAction ? 'cursor-pointer group' : 'cursor-default'}`}
            style={{ paddingLeft: `${depth * 18}px` }}
            aria-label={
              isGroup
                ? isCollapsed
                  ? 'Expand'
                  : 'Collapse'
                : hasTxns
                  ? txnsOpen
                    ? 'Hide transactions'
                    : 'Show transactions'
                  : undefined
            }
            title={hasTxns ? `${n.txns.length} transaction${n.txns.length === 1 ? '' : 's'} this period` : undefined}
          >
            {isGroup ? (
              <span className="mr-1.5 font-mono text-[10px] text-graphite group-hover:text-ink w-3">
                {isCollapsed ? '▸' : '▾'}
              </span>
            ) : hasTxns ? (
              <span className="mr-1.5 font-mono text-[10px] text-muted group-hover:text-accent w-3">
                {txnsOpen ? '▾' : '▸'}
              </span>
            ) : (
              <span className="mr-1.5 w-3" aria-hidden />
            )}
            <span className="font-mono text-xs text-graphite mr-2">
              <Highlight text={n.code} query={search} />
            </span>
            <span className={`text-sm text-ink ${isGroup || header ? 'font-medium' : ''} ${toggleAction ? 'group-hover:text-accent transition-colors' : ''}`}>
              <Highlight text={n.name} query={search} />
            </span>
            {hasTxns ? (
              <span className="ml-2 font-mono text-[10px] text-muted">({n.txns.length})</span>
            ) : null}
          </button>
        </td>
        <td className={`num ${isGroup || header ? 'font-medium' : ''}`}>
          {n.current < 0 ? <span className="neg">{money(n.current)}</span> : money(n.current)}
        </td>
        {withCompare ? (
          <td className="num text-graphite m-hide">
            {n.previous < 0 ? <span className="neg">{money(n.previous)}</span> : money(n.previous)}
          </td>
        ) : null}
        {withCompare ? <td className="num text-graphite m-hide">{deltaPct(n.current, n.previous)}</td> : null}
        {pctBase ? <td className="num text-graphite m-hide">{pctOf(n.current, pctBase.current)}</td> : null}
      </tr>,
    )
    if (hasTxns && txnsOpen) {
      for (let i = 0; i < n.txns.length; i++) {
        const t = n.txns[i]
        rows.push(
          <tr key={`${rk}-txn-${i}`} className="row-txn">
            <td>
              <div className="flex items-baseline gap-3 font-mono text-[11px] text-graphite" style={{ paddingLeft: `${depth * 18 + 22}px` }}>
                <span>{dayjs(t.date).format('D MMM')}</span>
                {/* Wrap, don't clip — user 2026-08-24: "没显示完" on the
                    inter-billing source descriptions. */}
                <span className="text-muted min-w-0 whitespace-normal break-words" title={t.description}>
                  {t.description}
                </span>
                {t.party ? <span className="text-accent shrink-0">{t.party}</span> : null}
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

  if (section.headed && section.root) {
    // The merged root IS the section row; its children (= section.nodes)
    // render one step in through renderNode's own recursion.
    renderNode(section.root, 0, true)
  } else if (section.headed) {
    // Section row carries the totals and folds its accounts (user 2026-09-18:
    // no more "— 小计" row doubling the parent above it).
    const sk = sectKey(section.key)
    const isCollapsed = collapsed.has(sk) && !forceOpen.has(sk)
    rows.push(
      <tr key={`sect-${section.key}`} className="row-cat">
        <td>
          <button
            type="button"
            onClick={() => onToggleGroup(sk)}
            className="flex items-baseline text-left w-full cursor-pointer group"
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
          >
            <span className="mr-1.5 font-mono text-[10px] text-graphite group-hover:text-ink w-3">
              {isCollapsed ? '▸' : '▾'}
            </span>
            <span className="text-sm text-ink font-medium group-hover:text-accent transition-colors">{section.label}</span>
          </button>
        </td>
        <td className="num font-medium">
          {section.current < 0 ? <span className="neg">{money(section.current)}</span> : money(section.current)}
        </td>
        {withCompare ? (
          <td className="num text-graphite m-hide">
            {section.previous < 0 ? <span className="neg">{money(section.previous)}</span> : money(section.previous)}
          </td>
        ) : null}
        {withCompare ? <td className="num text-graphite m-hide">{deltaPct(section.current, section.previous)}</td> : null}
        {pctBase ? <td className="num text-graphite m-hide">{pctOf(section.current, pctBase.current)}</td> : null}
      </tr>,
    )
    if (!isCollapsed) for (const n of section.nodes) renderNode(n, 1)
  } else {
    // Section title = small-caps eyebrow (matches the portal's sect-head
    // convention) so it reads clearly apart from the serif-italic subtotal rows.
    rows.push(
      <tr key={`sect-${section.key}`} className="row-sect border-t-2 border-hairline">
        <td colSpan={colCount} className="pt-3.5">
          <span className="font-sans text-[10.5px] font-semibold uppercase tracking-[0.18em] text-accent">
            {section.label}
          </span>
        </td>
      </tr>,
    )
    for (const n of section.nodes) renderNode(n, 0)
  }

  if (section.nodes.length === 0 && !section.root) {
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
