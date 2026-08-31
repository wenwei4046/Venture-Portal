'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { UserRole } from '@/types'
import {
  navEntries,
  itemActive,
  isGroup,
  type NavEntry,
  type NavItem,
} from './nav-config'

interface SidebarProps {
  role: UserRole
}

// Desktop-only since 2026-08-31. Mobile navigation moved to BottomTabBar +
// MoreSheet; the off-canvas drawer this used to double as is gone, so there
// is no `mobileOpen` / `onClose` any more.
export default function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const basisParam = searchParams.get('basis')
  const router = useRouter()

  const visible = navEntries.filter((entry) => entry.visible(role))

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

  // Track which groups are open. Auto-open if current path matches a child.
  const getInitialOpen = () => {
    const open: Record<string, boolean> = {}
    for (const entry of visible) {
      if (isGroup(entry)) {
        open[entry.label] = entry.children.some((c) => itemActive(c, pathname, tabParam, basisParam))
      }
    }
    return open
  }
  const [groupOpen, setGroupOpen] = useState(getInitialOpen)

  function toggleGroup(label: string) {
    setGroupOpen((prev) => ({ ...prev, [label]: !prev[label] }))
  }

  // Eagerly prefetch ALL visible routes on mount for instant navigation
  useEffect(() => {
    visible.forEach((entry) => {
      if (isGroup(entry)) {
        entry.children.forEach((child) => {
          if (child.href !== pathname) router.prefetch(child.href)
        })
      } else if (entry.href !== pathname) {
        router.prefetch(entry.href)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open group when navigating to a child page
  useEffect(() => {
    for (const entry of visible) {
      if (isGroup(entry)) {
        const match = entry.children.some((c) => itemActive(c, pathname, tabParam, basisParam))
        if (match) setGroupOpen((prev) => ({ ...prev, [entry.label]: true }))
      }
    }
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
              {section.entries.map((entry) => {
                if (isGroup(entry)) {
                  const groupActive = entry.children.some((c) =>
                    itemActive(c, pathname, tabParam, basisParam)
                  )
                  const isOpen = !!groupOpen[entry.label]
                  return (
                    <div key={entry.label}>
                      <button
                        type="button"
                        onClick={() => toggleGroup(entry.label)}
                        className={
                          groupActive && !isOpen
                            ? 'nav-link relative w-full flex items-center justify-between pl-[18px] pr-3 py-[7px] mb-0.5 rounded-md bg-accent-bg text-accent font-serif italic text-[15.5px]'
                            : 'nav-link relative w-full flex items-center justify-between pl-[18px] pr-3 py-1.5 mb-0.5 rounded-md text-graphite hover:bg-surface-2 hover:text-ink text-[13px] font-sans tracking-[0.005em]'
                        }
                      >
                        <span
                          aria-hidden
                          className={
                            groupActive && !isOpen
                              ? 'absolute left-[6px] top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-sm bg-accent'
                              : 'absolute left-[8px] top-1/2 -translate-y-1/2 w-[3px] h-[3px] rounded-full bg-muted opacity-40'
                          }
                        />
                        {entry.label}
                        <span
                          className={`text-[10px] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        >
                          ▼
                        </span>
                      </button>
                      {isOpen ? (
                        <div className="ml-3 border-l border-hairline pl-2">
                          {entry.children
                            .filter((c) => c.visible(role))
                            .map((child) => {
                              const active = itemActive(child, pathname, tabParam, basisParam)
                              return (
                                <Link
                                  key={child.href}
                                  href={child.href}
                                  className={
                                    active
                                      ? 'nav-link relative block pl-[18px] pr-3 py-[5px] mb-0.5 rounded-md bg-accent-bg text-accent font-serif italic text-[14px]'
                                      : 'nav-link relative block pl-[18px] pr-3 py-1 mb-0.5 rounded-md text-graphite hover:bg-surface-2 hover:text-ink text-[12.5px] font-sans tracking-[0.005em]'
                                  }
                                >
                                  <span
                                    aria-hidden
                                    className={
                                      active
                                        ? 'absolute left-[6px] top-1/2 -translate-y-1/2 w-[3px] h-3 rounded-sm bg-accent'
                                        : 'absolute left-[8px] top-1/2 -translate-y-1/2 w-[3px] h-[3px] rounded-full bg-muted opacity-40'
                                    }
                                  />
                                  {child.label}
                                </Link>
                              )
                            })}
                        </div>
                      ) : null}
                    </div>
                  )
                }

                const item = entry as NavItem
                const active = itemActive(item, pathname, tabParam, basisParam)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      active
                        ? 'nav-link relative block pl-[18px] pr-3 py-[7px] mb-0.5 rounded-md bg-accent-bg text-accent font-serif italic text-[15.5px]'
                        : 'nav-link relative block pl-[18px] pr-3 py-1.5 mb-0.5 rounded-md text-graphite hover:bg-surface-2 hover:text-ink text-[13px] font-sans tracking-[0.005em]'
                    }
                  >
                    <span
                      aria-hidden
                      className={
                        active
                          ? 'absolute left-[6px] top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-sm bg-accent'
                          : 'absolute left-[8px] top-1/2 -translate-y-1/2 w-[3px] h-[3px] rounded-full bg-muted opacity-40'
                      }
                    />
                    {item.label}
                  </Link>
                )
              })}
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
