// Lead View v3 › Team (2026-11-10, docs/design_handoff_lead_view_v3 § 4; migs 20261110220000 / 220100). People are
// added from People and the ERP's staff list; a role decides what Lead View they get, and the database's permission
// readers follow it (see the migration). Pure parts, tested in team.test.ts.

import type { LeadOutlet } from './outlets'

export type TeamRole = 'admin' | 'cs' | 'outlet'
/** Why somebody's access is stopped ('' = it is not). */
export type TeamWhy = '' | 'people' | 'erp' | 'not_yet' | 'ended'

export interface TeamMember {
  staffId: string
  code: string
  name: string
  email: string
  title: string
  erpCode: string
  erpJob: string
  branch: string
  hasLogin: boolean
  role: TeamRole
  reply: boolean
  reports: boolean
  outlets: string[]
  from: string | null
  to: string | null
  why: TeamWhy
  leftOn: string | null
}

export interface DirectoryPerson {
  staffId: string
  code: string
  name: string
  email: string
  title: string
  erpCode: string
  erpJob: string
  branch: string
  active: boolean
  erpInactive: boolean
  hasLogin: boolean
  added: boolean
}
export interface StaffDirectory {
  people: DirectoryPerson[]
  /** In the ERP, matching nobody in People: HR adds them there first. */
  erpOnly: Array<{ code: string; name: string; email: string; job: string; branch: string; active: boolean }>
  erpAt: string | null
}

export const ROLES: Record<TeamRole, [string, string]> = {
  admin: ['Admin', 'Everything, including Settings.'],
  cs: ['Customer service', 'All outlets. Chats, replies and reports. No Settings.'],
  outlet: ['Outlet staff', 'Only the outlets you pick below, plus chats with no outlet.'],
}

/** Stopped: out of the active list. Not started yet is still a member, with its date. */
export const stopped = (m: Pick<TeamMember, 'why'>) => m.why === 'people' || m.why === 'erp' || m.why === 'ended'

export const initialsOf = (name: string) => (name || '?').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()

/** "16 Nov" — the prototype's short day. */
export function shortDay(d: string | null | undefined): string {
  if (!d) return ''
  const [, m, dd] = d.split('-')
  return `${Number(dd)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]}`
}

/** A row's second line: why stopped, else an Outlet staff's outlets, else the role. */
export function subLine(m: TeamMember, outlets: LeadOutlet[]): string {
  if (m.why === 'erp') return 'Inactive in ERP · access stopped'
  if (m.why === 'people') return 'Not active in People · access stopped'
  if (m.why === 'ended') return `Access ended ${shortDay(m.to)}`
  if (m.role === 'outlet') return m.outlets.map(id => outlets.find(o => o.id === id)?.name).filter(Boolean).join(', ') || 'No outlet yet'
  return ROLES[m.role][0]
}

/** What a person starts as when added (README § 4): a Lead Executive is Customer service; anybody else Outlet staff
 * with the outlet of their ERP branch ticked (the outlet whose name holds the branch, in any case). */
export function defaultsFor(p: Pick<DirectoryPerson, 'erpJob' | 'title' | 'branch'>, outlets: LeadOutlet[]): { role: TeamRole; outlets: string[] } {
  if (/lead\s*executive/i.test(`${p.erpJob} ${p.title}`)) return { role: 'cs', outlets: [] }
  const branch = p.branch.trim().toLowerCase()
  const hit = branch ? outlets.filter(o => o.name.toLowerCase().includes(branch)) : []
  return { role: 'outlet', outlets: hit.length === 1 ? [hit[0].id] : [] }
}

/** The Add from ERP list: those not added and active first; every row says why it cannot be picked. */
export function pickRows(d: StaffDirectory, q: string) {
  const needle = q.trim().toLowerCase()
  const rows = [
    ...d.people.map(p => ({
      key: p.staffId, staffId: p.staffId as string | null, name: p.name,
      sub: [p.erpCode || p.code, p.erpJob || p.title, p.branch].filter(Boolean).join(' · '),
      tag: p.erpInactive ? 'Inactive in ERP' : p.added ? 'Added' : !p.active ? 'Inactive' : '',
      person: p,
    })),
    ...d.erpOnly.map(e => ({
      key: `erp-${e.code}-${e.name}`, staffId: null, name: e.name, sub: [e.code, e.job, e.branch].filter(Boolean).join(' · '),
      tag: !e.active ? 'Inactive in ERP' : 'Not in People', person: null,
    })),
  ]
  return rows
    .filter(r => !needle || `${r.name} ${r.sub}`.toLowerCase().includes(needle))
    .sort((a, b) => Number(!!a.tag) - Number(!!b.tag))
}

/** Inbox › Preview as (README § 4): does this member see a chat with this outlet? Stopped sees nothing; Outlet staff
 * their outlets plus chats with no outlet; Admin and Customer service every chat. The database decides the same
 * (lead_outlet_ok); this only draws it for whoever previews. */
export function previewSees(m: TeamMember, outletId: string | null | undefined): boolean {
  if (stopped(m)) return false
  if (m.role !== 'outlet') return true
  return !outletId || m.outlets.includes(outletId)
}

/** The banner's second line: what this member sees. */
export function previewScope(m: TeamMember, outlets: LeadOutlet[]): string {
  if (stopped(m)) return 'Access stopped'
  if (m.role === 'admin') return 'Admin · everything'
  if (m.role === 'cs') return 'All outlets'
  const names = m.outlets.map(id => outlets.find(o => o.id === id)?.name).filter(Boolean)
  return [...names, 'no outlet'].join(' + ') + (m.reply ? '' : ' · view only')
}

/** May this member reply to a customer? (Outlet staff need Reply ticked.) */
export const previewReplies = (m: TeamMember) => !stopped(m) && (m.role !== 'outlet' || m.reply)
