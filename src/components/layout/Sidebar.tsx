'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import type { NavViewer } from './nav-config'
import {
  buildNavEntries,
  groupActive,
  itemActive,
  isGroup,
  type NavData,
  type NavEntry,
  type NavGroup,
  type NavItem,
} from './nav-config'

interface SidebarProps {
  viewer: NavViewer
  /** Database-backed nav rows (Revenue's sub-departments), read by the layout. */
  navData: NavData
}

// Desktop-only since 2026-08-31. Mobile navigation moved to BottomTabBar +
// MoreSheet; the off-canvas drawer this used to double as is gone, so there
// is no `mobileOpen` / `onClose` any more.
export default function Sidebar({ viewer, navData }: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const basisParam = searchParams.get('basis')

  const visible = buildNavEntries(navData).filter((entry) => entry.visible(viewer))

  // Group consecutive entries by section label so we can render dividers.
  const sections: { label: string | null; entries: NavEntry[] }[] = []
  for (const entry of visible) {
    const sec = entry.section ?? null
    const last = sections[sections.length - 1]
    if (last && last.label === sec) {
      last.entries.push(entry)
    } else {
      sections.push({ label: sec, entries: [entry] })
    }
  }

  // Open state is keyed by the group's path through the tree ("Revenue/Fair"),
  // not by its label alone: the tree is three levels deep since the Revenue
  // Department arrived, and a sub-department is free to be named after a group
  // above it.
  const groupKey = (label: string, prefix: string) => (prefix ? `${prefix}/${label}` : label)

  /** Every group on the path to the page being read, keyed and open. */
  function openOnPath(entries: NavEntry[], prefix: string): Record<string, boolean> {
    const open: Record<string, boolean> = {}
    for (const entry of entries) {
      if (!isGroup(entry)) continue
      const key = groupKey(entry.label, prefix)
      if (groupActive(entry, pathname, tabParam, basisParam)) {
        open[key] = true
        Object.assign(open, openOnPath(entry.children, key))
      }
    }
    return open
  }

  // Track which groups are open. Auto-open if current path matches a child.
  const [groupOpen, setGroupOpen] = useState(() => openOnPath(visible, ''))

  function toggleGroup(key: string) {
    setGroupOpen((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // No eager prefetch (2026-09-09). This used to `router.prefetch()` every
  // visible route on mount, and `useRouter().prefetch` defaults to a FULL
  // prefetch — the server rendered all ~24 pages (auth, permissions and each
  // page's own queries, journal scans included) within seconds of every hard
  // load, and any button pressed during that window queued behind them. The
  // `<Link>`s below keep Next's default prefetch, which for these dynamic
  // routes fetches only the loading boundary, on hover and in-viewport.

  // Auto-open every group on the way to the page being read — both Revenue and
  // the sub-department inside it, so arriving at /revenue/fair/rules from a
  // link shows the rail that page belongs to.
  useEffect(() => {
    setGroupOpen((prev) => ({ ...prev, ...openOnPath(visible, '') }))
  }, [pathname, tabParam]) // eslint-disable-line react-hooks/exhaustive-deps

  // Desktop pin (2026-08-29 "固定钉住需要"): keeps the panel permanently open.
  // Read from localStorage AFTER mount so the server-rendered markup matches.
  const [pinned, setPinned] = useState(false)
  useEffect(() => {
    try {
      setPinned(localStorage.getItem('hv_sidebar_pinned') === '1')
    } catch {}
  }, [])
  const togglePinned = () => {
    setPinned((p) => {
      const next = !p
      try {
        localStorage.setItem('hv_sidebar_pinned', next ? '1' : '0')
      } catch {}
      return next
    })
  }

  // Roman numeral counter for labeled sections only (skip the unlabeled overview).
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
  let romanIdx = 0

  // ── Rendering ────────────────────────────────────────────────────────────
  //
  // One recursive pass, because the nav is no longer a fixed two levels: the
  // Revenue Department reads Revenue › Fair › Commission Calculation. `depth`
  // picks type size and indent and nothing else — a row has the same shape at
  // every level, which is what keeps the third one reading as part of the nav
  // rather than as a panel bolted inside it.

  function renderEntries(entries: NavEntry[], depth: number, prefix: string) {
    return entries
      .filter((entry) => entry.visible(viewer))
      .map((entry) =>
        isGroup(entry) ? renderGroup(entry, depth, prefix) : renderItem(entry as NavItem, depth),
      )
  }

  function renderGroup(group: NavGroup, depth: number, prefix: string) {
    const key = groupKey(group.label, prefix)
    const isOpen = !!groupOpen[key]
    // Collapsed, a group wears its active child's highlight — that is the only
    // sign left that the page being read is in there. Open, the child wears it.
    const lit = groupActive(group, pathname, tabParam, basisParam) && !isOpen

    const chevron = (
      <span className={`text-[10px] transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
    )

    return (
      <div key={key}>
        {group.href ? (
          // A group with a page of its own: the label navigates, the chevron
          // folds. Fair stays one click from the sidebar, the way it was before
          // its three views moved in underneath it.
          <div
            className={
              'nav-link relative flex items-center mb-0.5 rounded-md ' +
              (lit ? 'bg-accent-bg text-accent' : 'text-graphite hover:bg-surface-2 hover:text-ink')
            }
          >
            <Marker active={lit} depth={depth} />
            <Link
              href={group.href}
              className={
                'flex-1 min-w-0 truncate ' +
                (lit
                  ? `${labelPad(depth, true)} font-serif italic ${labelSize(depth, true)}`
                  : `${labelPad(depth, false)} font-sans tracking-[0.005em] ${labelSize(depth, false)}`)
              }
            >
              {group.label}
            </Link>
            <button
              type="button"
              onClick={() => toggleGroup(key)}
              className="shrink-0 pl-1 pr-3 py-1.5 leading-none"
              aria-expanded={isOpen}
              aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${group.label}`}
            >
              {chevron}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => toggleGroup(key)}
            aria-expanded={isOpen}
            className={
              'nav-link relative w-full flex items-center justify-between mb-0.5 rounded-md ' +
              (lit
                ? `bg-accent-bg text-accent font-serif italic ${labelPad(depth, true)} ${labelSize(depth, true)}`
                : `text-graphite hover:bg-surface-2 hover:text-ink font-sans tracking-[0.005em] ${labelPad(depth, false)} ${labelSize(depth, false)}`)
            }
          >
            <Marker active={lit} depth={depth} />
            {group.label}
            {chevron}
          </button>
        )}
        {isOpen ? (
          <div
            className={
              depth === 0
                ? 'ml-3 border-l border-hairline pl-2'
                : 'ml-2 border-l border-hairline pl-1.5'
            }
          >
            {renderEntries(group.children, depth + 1, key)}
          </div>
        ) : null}
      </div>
    )
  }

  function renderItem(item: NavItem, depth: number) {
    const active = itemActive(item, pathname, tabParam, basisParam)
    return (
      <Link
        key={item.href}
        href={item.href}
        className={
          'nav-link relative block truncate mb-0.5 rounded-md ' +
          (active
            ? `bg-accent-bg text-accent font-serif italic ${labelPad(depth, true)} ${labelSize(depth, true)}`
            : `text-graphite hover:bg-surface-2 hover:text-ink font-sans tracking-[0.005em] ${labelPad(depth, false)} ${labelSize(depth, false)}`)
        }
      >
        <Marker active={active} depth={depth} />
        {item.label}
      </Link>
    )
  }

  // Desktop (2026-08-29, user: "background colour 可以换一下…然后做成隐藏的,
  // 鼠标划过去才显示" + "固定钉住需要"): the sidebar rests as a slim 16px rail
  // and expands on hover — width animates in-flow so the content glides rather
  // than being overlapped. The 📌 pin keeps it permanently open (persisted in
  // localStorage, read after mount so SSR markup stays stable). The
  // `sidebar-contrast` class re-declares the palette tokens for this subtree —
  // deep espresso panel, completely apart from the cream page. Below md the
  // rail is not rendered at all — BottomTabBar owns mobile navigation.
  return (
    <aside
      className={
        `group/side sidebar-contrast w-[240px] shrink-0 border-r border-hairline h-full bg-surface ` +
        `hidden md:block md:relative md:z-auto md:overflow-hidden md:transition-[width] md:duration-200 ` +
        // Desktop: float the rail as a rounded panel inset from the shell edges
        // rather than a full-bleed slab bolted to the left border. The gap lets
        // the page colour run behind it, which is what stops a panel this tall
        // from reading as a wall.
        ` md:border-r-0 md:rounded-panel md:my-2.5 md:ml-2.5 md:h-[calc(100%-20px)] md:ring-1 md:ring-hairline ` +
        (pinned ? 'md:w-[220px]' : 'md:w-4 md:hover:w-[220px]')
      }
      aria-label="Main navigation"
    >
      {/* Collapsed-rail hint (desktop only) — fades out once expanded. */}
      {!pinned ? (
        <div
          className="hidden md:flex absolute inset-y-0 left-0 w-4 items-center justify-center opacity-100 group-hover/side:opacity-0 transition-opacity duration-150 pointer-events-none"
          aria-hidden
        >
          <span className="font-mono text-[10px] text-muted">❯</span>
        </div>
      ) : null}
      <div
        className={
          `flex flex-col h-full w-[240px] md:w-[220px] md:transition-opacity md:duration-150 ` +
          (pinned ? 'md:opacity-100' : 'md:opacity-0 md:group-hover/side:opacity-100')
        }
      >
      {/* Brand mark */}
      <div className="px-6 pt-7 pb-5 flex items-start justify-between relative">
        <div>
          <div className="font-serif text-[30px] leading-none tracking-[-0.015em] text-ink">
            HOUZS
            <br />
            <span className="italic text-ink">Venture</span>
            <span className="text-accent ml-1">·</span>
          </div>
          <p className="font-serif italic text-[12.5px] text-graphite mt-1 tracking-[0.01em]">
            INTERNAL LEDGER · <span className="text-accent not-italic font-sans tracking-wider text-[10.5px]">内部账册</span>
          </p>
        </div>
        {/* Pin — desktop only: keep the panel open instead of hover-reveal. */}
        <button
          type="button"
          onClick={togglePinned}
          className={`hidden md:block text-base leading-none pt-1 px-1 transition-all ${
            pinned ? '' : 'opacity-35 grayscale hover:opacity-70'
          }`}
          title={pinned ? '取消固定 — 恢复滑过才显示' : '固定 sidebar — 常驻展开'}
          aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar'}
          aria-pressed={pinned}
        >
          📌
        </button>
        {/* Gradient underline — ink fading to transparent */}
        <span
          aria-hidden
          className="absolute left-6 right-6 bottom-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, rgb(var(--ink)) 0%, rgb(var(--hairline)) 40%, transparent 100%)',
          }}
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {sections.map((section, sectionIndex) => {
          const roman = section.label ? ROMAN[romanIdx++] : null
          return (
            <div
              key={section.label ?? '__top'}
              className={sectionIndex === 0 ? 'mt-1' : 'mt-5'}
            >
              {section.label ? (
                <div className="flex items-baseline gap-2 px-3 pt-1 pb-2">
                  <span className="font-serif italic text-[11px] text-accent tracking-[0.02em]">
                    {roman}.
                  </span>
                  <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                    {section.label}
                  </span>
                  <span
                    aria-hidden
                    className="flex-1 h-px bg-hairline -translate-y-[3px]"
                  />
                </div>
              ) : null}
              {renderEntries(section.entries, 0, '')}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-hairline">
        <p className="text-[11px] text-muted font-mono leading-relaxed">
          HV Portal v0.3
          <br />
          Phase 3 Shipped
        </p>
      </div>
      </div>
    </aside>
  )
}

// Type shrinks one step per level so three levels still read as a hierarchy
// inside 220px. An active row sits a shade larger and in the serif italic —
// the portal's "you are here" everywhere else too.
function labelSize(depth: number, active: boolean): string {
  if (depth === 0) return active ? 'text-[15.5px]' : 'text-[13px]'
  if (depth === 1) return active ? 'text-[14px]' : 'text-[12.5px]'
  return active ? 'text-[13px]' : 'text-[12px]'
}

function labelPad(depth: number, active: boolean): string {
  if (depth >= 2) return active ? 'pl-[16px] pr-2 py-[3px]' : 'pl-[16px] pr-2 py-1'
  if (depth === 1) return active ? 'pl-[18px] pr-3 py-[5px]' : 'pl-[18px] pr-3 py-1'
  return active ? 'pl-[18px] pr-3 py-[7px]' : 'pl-[18px] pr-3 py-1.5'
}

/** The left gutter mark: a bar when the row is the page being read, a dot
 *  otherwise. Both tuck in with depth so the third level does not shout. */
function Marker({ active, depth }: { active: boolean; depth: number }) {
  const barHeight = depth === 0 ? 'h-4' : depth === 1 ? 'h-3' : 'h-2.5'
  const barLeft = depth >= 2 ? 'left-[5px]' : 'left-[6px]'
  const dotLeft = depth >= 2 ? 'left-[7px]' : 'left-[8px]'
  return (
    <span
      aria-hidden
      className={
        active
          ? `absolute ${barLeft} top-1/2 -translate-y-1/2 w-[3px] ${barHeight} rounded-sm bg-accent`
          : `absolute ${dotLeft} top-1/2 -translate-y-1/2 w-[3px] h-[3px] rounded-full bg-muted opacity-40`
      }
    />
  )
}
