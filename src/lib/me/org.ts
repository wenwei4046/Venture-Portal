import { balanceOf, dayInfo, indexMonth, type Ctx } from '@/lib/attendance/engine'
import { rangeLabel, whenLabel } from '@/lib/attendance/requests'
import type { AttConfig, AttPerson } from '@/lib/attendance/types'
import { fmtN, plural } from './format'
import { configOf } from './month'
import { quotaFor, requestAmount, requestTitle, type Tone } from './requests'
import type { MeData, MeOrg, MeTeam, OrgPerson, OrgStatus } from './types'

/**
 * Me › Hierarchy and My team (2026-10-17, the handoff's `isHier` tiers and `isTeam`): one's line up to the top and
 * one's department as tiers of cards with a status dot — a word for today, never a time — and an upline's people
 * today with times, place and flags (photos stay with HR). Pure.
 */

export type CardTone = 'principal' | 'head' | 'upline' | null

export interface OrgCard {
  person: OrgPerson
  you: boolean
  /** The role under the name ("You · Marketing Executive" for you). */
  role: string
  tone: CardTone
  selected: boolean
  /** A manager card on Department picks that manager's team. */
  picks: boolean
}

export interface Tier {
  label: string
  cards: OrgCard[]
}

export const STATUS_WORD: Readonly<Record<OrgStatus, string>> = {
  present: 'Present', late: 'Late or flagged', leave: 'On leave', out: 'Not in yet', none: 'Not tracked',
}

/** The tone a level's card wears: the top, a head of department, a manager. */
export function toneOf(p: OrgPerson, direct: boolean): CardTone {
  const rank = p.rank ?? 0
  if (rank >= 9) return 'principal'
  if (rank === 8 || /head/i.test(p.level ?? '')) return 'head'
  if (direct || rank >= 6 || /manager/i.test(p.level ?? '')) return 'upline'
  return null
}

const card = (person: OrgPerson, o: Partial<OrgCard> & { you?: boolean } = {}): OrgCard => ({
  person, you: !!o.you, role: o.role ?? person.title ?? '', tone: o.tone ?? null, selected: !!o.selected, picks: !!o.picks,
})

/** My line: the top, down through each upline, to you — and the people who report to you. */
export function lineTiers(org: MeOrg): { tiers: Tier[]; title: string; count: string; foot: string } {
  const byId = new Map(org.people.map(p => [p.id, p]))
  const me = org.me ? byId.get(org.me) ?? null : null
  if (!me) return { tiers: [], title: 'Your line', count: '', foot: '' }
  const chain: OrgPerson[] = []
  const seen = new Set<string>([me.id])
  let cur = me.reportsTo ? byId.get(me.reportsTo) : undefined
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    chain.unshift(cur)
    cur = cur.reportsTo ? byId.get(cur.reportsTo) : undefined
  }
  const reports = org.people.filter(p => p.reportsTo === me.id && p.id !== me.id)
  const tiers: Tier[] = chain.map((p, i) => {
    const direct = i === chain.length - 1
    return { label: direct ? 'Upline' : p.level ?? p.title ?? 'Above', cards: [card(p, { tone: toneOf(p, direct) })] }
  })
  tiers.push({ label: 'You', cards: [card(me, { you: true, role: `You · ${me.title ?? 'no title'}` })] })
  if (reports.length) tiers.push({ label: 'Reports to you', cards: reports.map(p => card(p)) })
  return {
    tiers,
    title: 'Your line',
    count: `${chain.length} above · ${reports.length} below`,
    foot: reports.length > 1 ? 'Swipe sideways to see everyone · tap a person for details' : 'Tap a person for details',
  }
}

/** Department: its head(s), its managers (tap one), and the picked manager's team. */
export function deptTiers(org: MeOrg, pick: string | null): { tiers: Tier[]; title: string; count: string; foot: string; pick: string | null } {
  const dept = org.people.filter(p => org.departmentId && p.departmentId === org.departmentId)
  const name = dept[0]?.department ?? 'Department'
  if (!dept.length) return { tiers: [], title: name, count: '', foot: '', pick: null }
  const inDept = new Set(dept.map(p => p.id))
  const heads = dept.filter(p => !p.reportsTo || !inDept.has(p.reportsTo))
  const headIds = new Set(heads.map(p => p.id))
  const managers = dept.filter(p => !headIds.has(p.id) && dept.some(x => x.reportsTo === p.id))
  const chosen = managers.find(m => m.id === pick) ?? managers.find(m => dept.some(x => x.reportsTo === m.id && x.id === org.me)) ?? managers[0] ?? null
  const you = (p: OrgPerson) => p.id === org.me
  // The handoff's Department view names you by your title alone (My line says "You · …").
  const cardOf = (p: OrgPerson, tone: CardTone) => card(p, you(p) ? { you: true } : { tone })
  const tiers: Tier[] = [{ label: `Head of ${name}`, cards: heads.map(p => cardOf(p, 'head')) }]
  if (chosen) {
    tiers.push({ label: 'Managers · tap to see a team', cards: managers.map(p => ({ ...cardOf(p, 'upline'), selected: p.id === chosen.id, picks: true })) })
    const team = dept.filter(p => p.reportsTo === chosen.id).sort((a, b) => (you(a) ? -1 : you(b) ? 1 : 0))
    tiers.push({ label: `Team · ${chosen.name}`, cards: team.map(p => cardOf(p, null)) })
  } else {
    const rest = dept.filter(p => !headIds.has(p.id))
    if (rest.length) tiers.push({ label: 'Team', cards: rest.map(p => cardOf(p, null)) })
  }
  return { tiers, title: name, count: plural(dept.length, 'person', 'people'), foot: 'Swipe sideways to see everyone · tap a person for details', pick: chosen?.id ?? null }
}

// ── My team today ───────────────────────────────────────────────────────────

export interface TeamRow {
  id: string
  name: string
  sub: string
  chip: [Tone, string] | null
  order: number
}

/** The team's config: their assignments (the reader's own are only theirs). */
function teamCtx(d: MeData, team: MeTeam): Ctx {
  const config: AttConfig = { ...configOf(d), people: team.reports, assignments: team.assignments }
  return {
    config,
    month: { month: `${team.today.slice(0, 7)}-01`, punches: team.punches, marks: team.marks, overrides: d.month.overrides, leave: team.leave, decisions: [], close: null },
    today: team.today,
    now: d.now.slice(0, 5),
  }
}

/** Each person who reports to you, today: present, late, flagged, on leave, not in. */
export function teamRows(d: MeData, team: MeTeam): TeamRow[] {
  const ctx = teamCtx(d, team)
  const idx = indexMonth(ctx.month)
  const rows = team.reports.filter(p => p.reportsToMe).map((p): TeamRow => {
    const info = dayInfo(p, team.today, ctx, idx)
    const code = info.code
    const punch = team.punches.find(x => x.staffId === p.id && x.dir === 'in' && !x.invalid)
    const leave = team.leave.find(l => l.staffId === p.id && l.status === 'approved')
    const typeName = (c: string) => d.leaveTypes.find(t => t.code === c)?.name ?? `${c} leave`
    if (!info.tracked) return { id: p.id, name: p.name, sub: `${p.title ?? 'No title'} · does not clock`, chip: null, order: 6 }
    if (leave) return { id: p.id, name: p.name, sub: `${typeName(leave.code)} · ${rangeLabel(leave.from, leave.to)}`, chip: ['info', 'Leave'], order: 3 }
    if (code === 'W' || code === 'H' || code === 'CH' || code === 'SO') {
      return { id: p.id, name: p.name, sub: info.holiday ?? (info.sday?.type === 'rest' ? 'Rest day' : 'Off day'), chip: ['neutral', 'Off'], order: 5 }
    }
    if (info.in && punch) {
      const reason = punch.reason ? ` · “${punch.reason}”` : ''
      const where = info.place ? ` · ${info.place}` : ''
      if (info.flags.length) return { id: p.id, name: p.name, sub: `IN ${info.in}${where}${info.flags.includes('From a computer') ? ' · from a computer' : ''}${reason}`, chip: ['warning', 'Flagged'], order: 2 }
      if (code === 'L') return { id: p.id, name: p.name, sub: `IN ${info.in}${where} · ${info.lateMin} min past ${info.sday?.start ?? ''}`.trim(), chip: ['warning', 'Late'], order: 1 }
      return { id: p.id, name: p.name, sub: `IN ${info.in}${where}`, chip: ['success', 'Present'], order: 0 }
    }
    if (code === 'P' && !punch) return { id: p.id, name: p.name, sub: 'Fixed hours', chip: ['success', 'Present'], order: 0 }
    return { id: p.id, name: p.name, sub: `No punch yet${info.sday?.start ? ` · starts ${info.sday.start}` : ''}`, chip: ['neutral', 'Not in'], order: 4 }
  })
  return rows.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

export interface WaitItem {
  id: string
  ref: string
  who: string
  title: string
  when: string
  amount: string
  reason: string
  balance: string
  route: string
  toHR: boolean
}

/** What waits at your step, with what the decision sheet shows. */
export function waitItems(d: MeData, team: MeTeam): WaitItem[] {
  return team.waiting.map(r => {
    const person: AttPerson | undefined = team.reports.find(p => p.id === r.staffId)
    const toHR = r.steps.some(s => s.state === 'queued' && s.role === 'hr')
    let balance = ''
    if (r.kind === 'leave' && person && r.leaveCode) {
      const type = d.leaveTypes.find(t => t.code === r.leaveCode)
      if (type && !type.unpaid) {
        const b = balanceOf(person, type, { ...configOf(d), people: team.reports, assignments: team.assignments }, team.ledger, d.workDay)
        if (b.left != null) balance = `${fmtN(b.left)} days left after this`
      }
    }
    if (r.kind === 'ot') balance = `${fmtN(team.otHours[r.staffId] ?? 0)} h this month`
    const title = r.kind === 'ot' ? (r.detail.after === true ? 'Overtime · after the fact' : 'Overtime · asked first') : requestTitle(r, d.leaveTypes)
    return {
      id: r.id, ref: r.ref, who: r.who, title, toHR,
      when: r.kind === 'leave' && r.from ? rangeLabel(r.from, r.to) : whenLabel(r),
      amount: r.kind === 'correction' ? (r.nth != null && r.from ? `${r.nth} of ${quotaFor(d, r.from)}` : '—') : requestAmount(r, d),
      reason: r.reason || '—',
      balance,
      route: toHR ? 'You, then HR' : r.kind === 'leave' ? 'You decide · HR sees it' : 'You decide',
    }
  })
}
