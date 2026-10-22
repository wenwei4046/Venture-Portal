// What Marketing's shell draws from the database (mig 20261023214100): `mkt_shell()` — who is signed in as Marketing
// knows them, the subsidiaries with the caller's own count on each, the counts beside My Space / Calendar / Projects /
// Tracking, the unread notices — `mkt_search(q)` for the top bar and `mkt_notices(n)` for the bell. Read from the
// browser on the person's own session (never a Server Action fired by a navigation — speed.md); parsed here, so a
// missing field draws as nothing rather than as a crash.

import { formatIntlDate } from '@/lib/utils'
import type { MktCountKey } from './nav'

export type MktTeam = 'manager' | 'content' | 'social' | 'design' | 'ads' | 'brand'

export interface MktShellMe {
  id: string
  full: string
  first: string
  title: string | null
  team: MktTeam | null
  role: string | null
  color: string | null
}

export interface MktShellSub {
  id: string
  code: string
  name: string
  dot: string
  emoji: string
  /** Marketing's own client, not one of the group's companies. */
  client: boolean
  /** What is on the caller's plate for it. */
  count: number
}

export interface MktShellData {
  today: string
  me: MktShellMe | null
  subs: MktShellSub[]
  counts: Record<MktCountKey, number>
  notices: number
}

export interface MktNotice {
  id: string
  title: string
  body: string
  /** The project it is about (`/marketing/projects/<id>`), when it is about one. */
  ref: string | null
  at: string
  read: boolean
  /** What it says: 'plan' (put on an Assignment plan), 'approve', 'changes' … (its data's `type`). */
  type: string | null
}

export interface MktSearchHit {
  trackId: string
  title: string
  kind: string
  status: string
  sub: string | null
}

export interface MktSearchPerson {
  id: string
  first: string
  full: string
  title: string | null
  team: MktTeam | null
}

export interface MktSearchResult {
  projects: MktSearchHit[]
  people: MktSearchPerson[]
}

const TEAMS: readonly MktTeam[] = ['manager', 'content', 'social', 'design', 'ads', 'brand']
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null)
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}
const team = (v: unknown): MktTeam | null => (TEAMS.includes(v as MktTeam) ? (v as MktTeam) : null)
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

export const EMPTY_SHELL: MktShellData = {
  today: '',
  me: null,
  subs: [],
  counts: { myspace: 0, calendar: 0, projects: 0, tracking: 0 },
  notices: 0,
}

export function mktShellFromRow(v: unknown): MktShellData {
  if (!isObj(v)) return EMPTY_SHELL
  const me = isObj(v.me) && str(v.me.id)
    ? {
        id: str(v.me.id),
        full: str(v.me.full),
        first: str(v.me.first) || str(v.me.full).split(/\s+/)[0] || '',
        title: strOrNull(v.me.title),
        team: team(v.me.team),
        role: strOrNull(v.me.role),
        color: strOrNull(v.me.color),
      }
    : null
  const subs = list(v.subs)
    .filter(isObj)
    .filter(s => str(s.id) && str(s.code))
    .map(s => ({
      id: str(s.id),
      code: str(s.code),
      name: str(s.name) || str(s.code),
      dot: str(s.dot) || 'rgb(160 150 140)',
      emoji: str(s.emoji) || '🏢',
      client: s.client === true,
      count: num(s.count),
    }))
  const c = isObj(v.counts) ? v.counts : {}
  return {
    today: str(v.today),
    me,
    subs,
    counts: { myspace: num(c.myspace), calendar: num(c.calendar), projects: num(c.projects), tracking: num(c.tracking) },
    notices: num(v.notices),
  }
}

/** The sidebar's order (the handoff's): the ones with something for the caller first, most first; the rest as listed. */
export function subsForNav(subs: readonly MktShellSub[]): MktShellSub[] {
  return subs
    .map((s, i) => ({ s, i }))
    .sort((a, b) => Number(b.s.count > 0) - Number(a.s.count > 0) || b.s.count - a.s.count || a.i - b.i)
    .map(x => x.s)
}

/** The Subsidiaries row's own count, shown while its list is folded away (the handoff's). */
export function subsTotal(subs: readonly MktShellSub[]): number {
  return subs.reduce((n, s) => n + s.count, 0)
}

export function mktNoticesFromRow(v: unknown): MktNotice[] {
  return list(v)
    .filter(isObj)
    .filter(n => str(n.id))
    .map(n => ({
      id: str(n.id), title: str(n.title), body: str(n.body), ref: strOrNull(n.ref), at: str(n.at), read: n.read === true,
      type: isObj(n.data) ? strOrNull(n.data.type) : null,
    }))
}

export function mktSearchFromRow(v: unknown): MktSearchResult {
  if (!isObj(v)) return { projects: [], people: [] }
  return {
    projects: list(v.projects)
      .filter(isObj)
      .filter(p => str(p.trackId))
      .map(p => ({ trackId: str(p.trackId), title: str(p.title), kind: str(p.kind), status: str(p.status), sub: strOrNull(p.sub) })),
    people: list(v.people)
      .filter(isObj)
      .filter(p => str(p.id))
      .map(p => ({ id: str(p.id), first: str(p.first), full: str(p.full), title: strOrNull(p.title), team: team(p.team) })),
  }
}

/** "now", "5m ago", "2h ago", "3d ago", then the date — a notice's age as the handoff's bell writes it. */
export function noticeAge(at: string, now: Date): string {
  const t = Date.parse(at)
  if (!Number.isFinite(t)) return ''
  const min = Math.floor((now.getTime() - t) / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return formatIntlDate(new Date(t), { day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' })
}

/** The avatar's letter: the first name's first letter. */
export function initialOf(name: string | null | undefined): string {
  return (name ?? '').trim().charAt(0).toUpperCase() || '·'
}
