'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { User } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { getRoleLabel } from '@/lib/roles'
import {
  buildNavEntries,
  isGroup,
  itemActive,
  tabHrefs,
  type NavData,
  type NavEntry,
} from './nav-config'

// The fifth tab. Everything the four promoted tabs don't cover — for a
// Principal that is ~45 destinations — rendered as one scrolling sheet
// grouped exactly the way the desktop sidebar groups it, so the two navs
// teach the same map of the portal.
//
// No accordions: on a sheet you are already one tap deep, and a second tap to
// reveal children turns a lookup into a hunt. Everything is listed; it scrolls.

interface Props {
  user: User
  /** Database-backed nav rows (Revenue's sub-departments), read by the layout. */
  navData: NavData
  open: boolean
  onClose: () => void
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

export default function MoreSheet({ user, navData, open, onClose }: Props) {
  const pathname = usePathname() ?? ''
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get('tab')
  const basisParam = searchParams.get('basis')
  const promoted = tabHrefs(user.role)

  // Close on navigation — tapping an entry should leave the sheet behind.
  useEffect(() => {
    if (open) onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, tabParam, basisParam])

  // Escape closes; body scroll locks while the sheet owns the screen.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  const visible = buildNavEntries(navData).filter((entry) => entry.visible(user))

  // Group consecutive entries by section label, same pass the sidebar makes.
  const sections: { label: string | null; entries: NavEntry[] }[] = []
  for (const entry of visible) {
    const sec = entry.section ?? null
    const last = sections[sections.length - 1]
    if (last && last.label === sec) last.entries.push(entry)
    else sections.push({ label: sec, entries: [entry] })
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    // This device only — the default ('global') ends the account everywhere.
    await supabase.auth.signOut({ scope: 'local' })
    router.push('/login')
    router.refresh()
  }

  let romanIdx = 0

  // The nav runs three levels since the Revenue Department arrived — Revenue ›
  // Fair › Comm Cal — so this recurses rather than assuming a group holds only
  // links. Still no accordions: on a sheet you are already
  // one tap in, and a second tap to reveal children turns a lookup into a
  // hunt. Every level is listed and the sheet scrolls.
  function renderEntry(entry: NavEntry, depth: number): React.ReactNode {
    if (!entry.visible(user)) return null

    if (isGroup(entry)) {
      const children = entry.children.filter((c) => c.visible(user))
      if (children.length === 0) return null
      // A group with a page of its own usually shares it with its first child
      // (Fair and its Commission Calculation are the same URL) — listing it
      // twice would just be noise. It only earns a row of its own when no
      // child carries it.
      const ownDestination =
        entry.href && !children.some((c) => !isGroup(c) && c.href === entry.href)
          ? entry.href
          : null
      return (
        <li key={`${entry.label}-${depth}`} className={depth === 0 ? 'mb-1.5' : 'mb-1'}>
          {ownDestination ? (
            <SheetLink
              href={ownDestination}
              label={entry.label}
              active={pathname === ownDestination}
              dimmed={promoted.has(ownDestination)}
            />
          ) : (
            <div
              className={`font-serif italic text-graphite px-1 ${
                depth === 0 ? 'text-[13px] pt-1.5 pb-1' : 'text-[12px] pt-1 pb-0.5'
              }`}
            >
              {entry.label}
            </div>
          )}
          <ul className="pl-3 border-l border-hairline ml-1">
            {children.map((child) => renderEntry(child, depth + 1))}
          </ul>
        </li>
      )
    }

    return (
      <SheetLink
        key={entry.href}
        href={entry.href}
        label={entry.label}
        active={itemActive(entry, pathname, tabParam, basisParam)}
        dimmed={promoted.has(entry.href)}
      />
    )
  }

  return (
    <div
      className={`md:hidden print:hidden fixed inset-0 z-50 flex flex-col transition-opacity duration-200 ${
        open ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="All sections"
      aria-hidden={!open}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute inset-0 bg-scrim/45 backdrop-blur-sm"
      />

      <div
        className={`relative mt-auto flex flex-col bg-paper rounded-t-panel border-t border-hairline max-h-[86vh] transition-transform duration-250 ease-out ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Grab handle + header */}
        <div className="shrink-0 px-5 pt-2.5 pb-3 border-b border-hairline">
          <span aria-hidden className="block mx-auto mb-3 h-1 w-9 rounded-full bg-hairline" />
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <div className="font-serif text-[19px] leading-none text-ink truncate">
                {user.name || getRoleLabel(user.role)}
              </div>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-graphite mt-1.5">
                {getRoleLabel(user.role)} · 全部功能
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 text-graphite hover:text-ink text-2xl leading-none px-2 -mr-2"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        {/* Nav list */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 pb-[calc(16px+var(--safe-bottom))]">
          {sections.map((section) => {
            const roman = section.label ? ROMAN[romanIdx++] : null
            return (
              <div key={section.label ?? 'overview'} className="mb-5 last:mb-0">
                {section.label ? (
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="font-mono text-[9.5px] text-accent tracking-[0.14em]">{roman}</span>
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-graphite">
                      {section.label}
                    </span>
                    <span aria-hidden className="flex-1 h-px bg-hairline" />
                  </div>
                ) : null}

                <ul>{section.entries.map((entry) => renderEntry(entry, 0))}</ul>
              </div>
            )
          })}

          <button
            type="button"
            onClick={handleSignOut}
            className="mt-4 w-full text-left font-mono text-[10.5px] uppercase tracking-[0.14em] text-graphite hover:text-danger py-3 border-t border-hairline"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

function SheetLink({
  href,
  label,
  active,
  dimmed,
}: {
  href: string
  label: string
  active: boolean
  /** Already on the tab bar — listed for completeness, but quieter. */
  dimmed: boolean
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`relative flex items-center min-h-[44px] pl-4 pr-2 rounded-control text-[15px] ${
          active
            ? 'text-accent font-medium bg-accent-bg'
            : dimmed
              ? 'text-muted'
              : 'text-ink active:bg-surface-2'
        }`}
      >
        <span
          aria-hidden
          className={
            active
              ? 'absolute left-[3px] top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-sm bg-accent'
              : 'absolute left-[5px] top-1/2 -translate-y-1/2 w-[3px] h-[3px] rounded-full bg-muted opacity-40'
          }
        />
        {label}
      </Link>
    </li>
  )
}
