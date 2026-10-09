'use client'

import { useEffect, useState } from 'react'
import Link, { useLinkStatus } from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { UserRole } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { canApprove } from '@/lib/roles'
import { warmRoute } from '@/lib/nav-warm'
import { moreTabLabel, tabsForRole, type NavViewer, type TabDef } from './nav-config'

// Mobile navigation (2026-08-31). Replaces the hamburger + off-canvas drawer:
// the user asked for a bottom tab bar, the shape every phone app uses, so the
// primary destinations sit under the thumb instead of behind a menu.
//
// Five slots is the ceiling before labels stop fitting at 390px, and the
// portal has ~50 destinations for a Principal — so four are promoted per role
// (see TABS_BY_ROLE in nav-config) and the fifth opens the full nav sheet.
//
// Desktop is untouched: `md:hidden` here, and the Sidebar goes `hidden md:flex`.

const ICONS: Record<TabDef['icon'] | 'more', React.ReactNode> = {
  // Overview — a roof over a ledger line.
  home: (
    <>
      <path d="M3 10.2 12 3.5l9 6.7" />
      <path d="M5.5 9.2V20h13V9.2" />
      <path d="M9.5 20v-5.5h5V20" />
    </>
  ),
  // Approvals — a stamped tick.
  approve: (
    <>
      <path d="M4 5.5h16v13H4z" />
      <path d="M8 12.2l2.7 2.7L16 9.6" />
    </>
  ),
  // Payments — money leaving.
  out: (
    <>
      <path d="M12 20V4" />
      <path d="M6.5 9.5 12 4l5.5 5.5" />
    </>
  ),
  // Receipts — money arriving.
  in: (
    <>
      <path d="M12 4v16" />
      <path d="M17.5 14.5 12 20l-5.5-5.5" />
    </>
  ),
  // Invoice — a document with ruled lines.
  invoice: (
    <>
      <path d="M6 3.5h9l3.5 3.5v13H6z" />
      <path d="M14.6 3.6v3.8h3.8" />
      <path d="M9 12h6M9 15.5h4" />
    </>
  ),
  // Payroll — a stack of notes.
  payroll: (
    <>
      <path d="M3 7.5h18v9H3z" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M6 10.5v3M18 10.5v3" />
    </>
  ),
  // Staff — a person.
  staff: (
    <>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    </>
  ),
  // Director — a person with a seal.
  director: (
    <>
      <circle cx="10" cy="8" r="3" />
      <path d="M4 20c0-3.4 2.7-5.7 6-5.7 1 0 2 .2 2.8.6" />
      <circle cx="17.5" cy="17.5" r="3.2" />
    </>
  ),
  // Billing — a tag.
  billing: (
    <>
      <path d="M11.4 3.5H20v8.6l-8.6 8.6L3 12.1z" />
      <circle cx="16.2" cy="7.8" r="1.3" />
    </>
  ),
  // Reports — a bar chart.
  report: (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8.5 20v-6M13 20v-9.5M17.5 20v-4" />
    </>
  ),
  // More — the overflow sheet.
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="18.5" cy="12" r="1.4" />
    </>
  ),
}

function TabIcon({ name }: { name: TabDef['icon'] | 'more' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="21"
      height="21"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICONS[name]}
    </svg>
  )
}

/** A tab's face, inside its <Link> so it can read that link's pending state:
 *  a tapped tab takes the accent and its marker at once, before the page it
 *  opens has committed (2026-09-26). */
function TabFace({ active, fin, children }: { active: boolean; fin?: boolean; children: React.ReactNode }) {
  const { pending } = useLinkStatus()
  const lit = active || pending
  // The Finance view (2026-10-09): a peach pill behind the lit tab's icon,
  // ink lettering — the handoff's tab bar; elsewhere the accent bar.
  if (fin) {
    return (
      <span className={`relative flex flex-col items-center justify-center gap-1 h-[54px] px-1 ${lit ? 'fin-tab-lit' : 'fin-tab'}`}>
        {children}
      </span>
    )
  }
  return (
    <span
      className={`relative flex flex-col items-center justify-center gap-1 h-[54px] px-1 ${
        lit ? 'text-accent' : 'text-graphite'
      }`}
    >
      {/* Active marker — a short accent bar on the top edge, the same
          vocabulary the sidebar uses for its current item. */}
      <span
        aria-hidden
        className={`absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-7 rounded-b-sm transition-opacity ${
          lit ? 'bg-accent opacity-100' : 'opacity-0'
        }${pending ? ' nav-tab-grow' : ''}`}
      />
      {children}
    </span>
  )
}

/** The icon in its pill on the Finance view: the pill shows only when lit. */
function TabGlyph({ name, lit, fin }: { name: TabDef['icon'] | 'more'; lit: boolean; fin?: boolean }) {
  return (
    <span className="relative inline-flex items-center justify-center">
      {fin && lit ? <span className="fin-pill" aria-hidden /> : null}
      <TabIcon name={name} />
    </span>
  )
}

function tabActive(tab: TabDef, pathname: string): boolean {
  const path = tab.href.split('?')[0]
  const match = tab.exact ? pathname === path : pathname === path || pathname.startsWith(path + '/')
  if (!match) return false
  if (tab.notPaths?.some((p) => pathname === p || pathname.startsWith(p + '/'))) return false
  return true
}

interface Props {
  role: UserRole
  viewer: NavViewer
  moreOpen: boolean
  onMoreClick: () => void
  /** The Finance view (2026-10-09): the handoff's cream bar and peach pill. */
  fin?: boolean
}

export default function BottomTabBar({ role, viewer, moreOpen, onMoreClick, fin = false }: Props) {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const tabs = tabsForRole(role)

  // Pending-approvals badge. Counted client-side with a head-only query so it
  // costs one tiny round-trip after paint rather than blocking every server
  // render of the shell. RLS scopes the count; roles that can't approve skip
  // the query entirely.
  const [pending, setPending] = useState<number | null>(null)
  useEffect(() => {
    if (!tabs.some((t) => t.badge) || !canApprove(viewer)) return
    let cancelled = false
    const supabase = createClient()
    supabase
      .from('approval_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => {
        if (!cancelled) setPending(count ?? 0)
      })
    return () => {
      cancelled = true
    }
    // Re-count on navigation — approving on /approvals should drain the badge.
  }, [pathname, role]) // eslint-disable-line react-hooks/exhaustive-deps

  // Warm the four tab targets so thumb taps land instantly — only where this
  // bar IS the navigation. It is mounted on desktop too (hidden by `md:hidden`),
  // and there these were four full server renders on every hard load for a bar
  // nobody could see (2026-09-26). warmRoute also skips a page that writes the
  // audit log as it renders: HR's third tab is the staff directory, and every
  // HR hard load was recording a view of it (lib/nav-warm.ts).
  useEffect(() => {
    if (!window.matchMedia('(max-width: 767.98px)').matches) return
    tabs.forEach((t) => warmRoute(router, t.href))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <nav
      className={`md:hidden print:hidden fixed bottom-0 inset-x-0 z-40 border-t border-hairline pb-[env(safe-area-inset-bottom)] ${fin ? 'fin-tabbar' : 'bg-chrome'}`}
      aria-label="Primary"
    >
      <ul className="flex items-stretch">
        {tabs.map((tab) => {
          const active = !moreOpen && tabActive(tab, pathname)
          const showBadge = tab.badge && pending !== null && pending > 0
          return (
            <li key={tab.href} className="flex-1 min-w-0">
              <Link href={tab.href} aria-current={active ? 'page' : undefined} className="block">
                <TabFace active={active} fin={fin}>
                  <span className="relative">
                    <TabGlyph name={tab.icon} lit={active} fin={fin} />
                    {showBadge ? (
                      <span
                        className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-danger text-paper font-mono text-[9.5px] leading-[15px] text-center"
                        aria-label={`${pending} pending`}
                      >
                        {pending > 99 ? '99+' : pending}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[10px] leading-none tracking-wide truncate max-w-full">
                    {tab.label}
                  </span>
                </TabFace>
              </Link>
            </li>
          )
        })}

        {/* Fifth slot — the rest of the portal. */}
        <li className="flex-1 min-w-0">
          <button
            type="button"
            onClick={onMoreClick}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            className={`relative w-full flex flex-col items-center justify-center gap-1 h-[54px] px-1 ${
              fin ? (moreOpen ? 'fin-tab-lit' : 'fin-tab') : moreOpen ? 'text-accent' : 'text-graphite'
            }`}
          >
            {fin ? null : (
              <span
                aria-hidden
                className={`absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-7 rounded-b-sm transition-opacity ${
                  moreOpen ? 'bg-accent opacity-100' : 'opacity-0'
                }`}
              />
            )}
            <TabGlyph name="more" lit={moreOpen} fin={fin} />
            <span className="text-[10px] leading-none tracking-wide">{moreTabLabel(role)}</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
