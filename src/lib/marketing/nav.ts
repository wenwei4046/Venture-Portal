// Marketing's sidebar (the handoff's `Marketing Shell.dc.html`): My Space, Calendar, Subsidiaries (each one under it),
// Projects, Library, then MANAGER TOOLS — Tracking Dashboard, Workflow Builder, Product Builder, Minutes Builder,
// Replace Person — and Settings at the foot. Each row is a page of Marketing's view and shows where its page opens for
// the viewer (its tab, lib/page-tabs.ts). Two rows the handoff does not draw sit by Settings: one's own claims and the
// meeting rooms, which every member of staff keeps (Staff · Basic's) — Marketing's people would lose them otherwise.
//
// Pure: the shell draws it, the tests read it.

import { opensPath } from '@/lib/page-tabs'

export type MktNavKey =
  | 'myspace' | 'calendar' | 'subs' | 'projects' | 'library'
  | 'tracking' | 'workflow' | 'product' | 'minutes' | 'replace'
  | 'claims' | 'rooms' | 'settings'

/** The tile behind a row's emoji (the handoff's four tones). */
export type MktTone = 'sand' | 'mist' | 'peach' | 'cream'

/** Which of the sidebar's counts a row carries (mkt_shell's `counts`). */
export type MktCountKey = 'myspace' | 'calendar' | 'projects' | 'tracking'

export interface MktNavRow {
  key: MktNavKey
  emoji: string
  label: string
  tone: MktTone
  /** The page it opens; Subsidiaries opens its list instead, Settings the Appearance panel. */
  href?: string
  count?: MktCountKey
  /** Listed under MANAGER TOOLS. */
  manager?: boolean
  /** By Settings at the foot (the portal's own two). */
  foot?: boolean
}

/** The rows in the handoff's order — only those whose page is built. */
export const MKT_NAV: readonly MktNavRow[] = [
  { key: 'myspace', emoji: '🏠', label: 'My Space', tone: 'sand', href: '/marketing', count: 'myspace' },
  { key: 'calendar', emoji: '📅', label: 'Calendar', tone: 'mist', href: '/marketing/calendar', count: 'calendar' },
  { key: 'subs', emoji: '🏢', label: 'Subsidiaries', tone: 'peach' },
  { key: 'projects', emoji: '📁', label: 'Projects', tone: 'sand', href: '/marketing/projects', count: 'projects' },
  { key: 'tracking', emoji: '📊', label: 'Tracking Dashboard', tone: 'sand', href: '/marketing/tracking', count: 'tracking', manager: true },
  { key: 'workflow', emoji: '🧩', label: 'Workflow Builder', tone: 'mist', href: '/marketing/workflows', manager: true },
  { key: 'minutes', emoji: '📝', label: 'Minutes Builder', tone: 'cream', href: '/marketing/minutes', manager: true },
  { key: 'claims', emoji: '🧾', label: 'My claims', tone: 'cream', href: '/claims', foot: true },
  { key: 'rooms', emoji: '🚪', label: 'Meeting Rooms', tone: 'mist', href: '/admin/rooms', foot: true },
]

/** The rows a viewer's tabs open (an account with no tabs worked out is not asked — opensPath). */
export function mktNavRows(tabs: readonly string[] | undefined): MktNavRow[] {
  // Subsidiaries lists the projects of each — it shows with Projects.
  const projects = opensPath(tabs, '/marketing/projects')
  return MKT_NAV.filter(r => (r.key === 'subs' ? projects : r.href ? opensPath(tabs, r.href) : true))
}

const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + '/')

/** Which row a page lights: the most specific one whose page it is under; a subsidiary's projects light its own row. */
export function mktNavActive(pathname: string, search: URLSearchParams | null): MktNavKey | `sub:${string}` | null {
  const path = pathname.split('?')[0]
  if (path === '/marketing/projects' && search?.get('sub')) return `sub:${search.get('sub')}`
  // New Project is the Projects tab's page.
  if (path === '/marketing/new') return 'projects'
  let best: MktNavRow | null = null
  for (const r of MKT_NAV) {
    if (!r.href || !under(path, r.href)) continue
    if (!best || (best.href ?? '').length < r.href.length) best = r
  }
  return best?.key ?? null
}

/** The top bar's crumb for a page: its row's emoji and words, or the page's own. */
export function mktCrumb(pathname: string): { emoji: string; label: string } {
  const path = pathname.split('?')[0]
  if (path === '/marketing/new') return { emoji: '📁', label: 'Projects / New project' }
  const row = MKT_NAV.filter(r => r.href && under(path, r.href)).sort((a, b) => (b.href ?? '').length - (a.href ?? '').length)[0]
  if (row) return { emoji: row.emoji, label: row.label }
  const other: Record<string, { emoji: string; label: string }> = {
    '/admin/password': { emoji: '🔑', label: 'Change password' },
    '/admin/documents': { emoji: '📄', label: 'My documents' },
    '/it-support': { emoji: '🛟', label: 'IT support' },
  }
  return other[path] ?? { emoji: '🏠', label: 'My Space' }
}
