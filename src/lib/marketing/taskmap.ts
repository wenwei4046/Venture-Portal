// The task map (`Task Map.dc.html`, ④-4): a project's road as swim lanes — Approvals on top, then each group its stages
// are on (a People title since 2026-10-24) — its stations (a stage's card; each approver's gate, 👤 a person or 🔗 the PIC) joined by its hand-offs: solid
// once made, dashed when the stage before picked who, red when sent back (returned ×n), faint while planned. A line
// says when, who and what; a station its facts, versions and own records. Replay walks the trail record by record.
// A stage split into subtasks (②b-2c) branches: each subtask its own station in its person's lane (tagged Subtask,
// 🔓 picked by the stage's owner, a dashed line to it), then the stage's mini gate Review delivery — a delivery's line up
// to it, a return's red line back. A project opened from another (④-4c — answer 23) starts at that one: its station
// before Created (tagged *Opened from*), a line to it, its panel opening it — a deliverable at its product project
// (④-4d: the handoff's *Requested — Opened from Social Media project*). A task written with meeting minutes (②a-3) has
// their station after Created, and — the PIC approving them (②a-4) — 🔗 the PIC's gate before its first stage, sent
// back with a red line, or round it, dashed, when the manager started before approval. Drawn from the task page (its
// stages, approvers, subtasks and trail). Pure. A product project's own map: productmap.ts.

import { officeTime } from '@/lib/office-time'
import { KIND_WORDS, shortDay, STATUS_WORDS, type MktSource, type MktSubtask } from './board'
import { groupEmoji, groupLabel, groupTone, type MktTone } from './groups'
import { eventText, nameOf, trailTime, type MktTaskPage, type TaskEvent, type TaskProject } from './task'
import { minutesState, picWho } from './task-minutes'

/** 'appr', or a group (a People title; '—' for a stage of none). */
export type MapLaneId = string
export type MapTone = 'done' | 'waiting' | 'draft' | 'red'

export interface MapLane { id: MapLaneId; name: string; emoji: string; tone: MktTone | 'appr' }

export interface MapNode {
  id: string
  kind: 'card' | 'gate'
  lane: MapLaneId
  /** Its place along the road, from 0. */
  col: number
  title: string
  full: string
  person: string
  icon: string
  date: string
  tone: MapTone
  current: boolean
  future: boolean
  tag: string | null
  stage: number | null
  handoff: string
  status: string
  /** The handoff's small gate: a stage's Review delivery. */
  mini?: boolean
}

export interface MapMeta { t: string; who: string; what: string; reason: string }

export interface MapEdge {
  key: string
  from: string
  to: string
  kind: 'solid' | 'dashed' | 'return' | 'future'
  label: string | null
  meta: MapMeta | null
  /** A delivery's line: up out of the subtask's top into its stage's lane — never through the subtasks beside it. */
  rise?: boolean
  /** A subtask's dashed line: down into the card's top from above — never in from the card beside it. */
  drop?: boolean
}

export interface ReplayStep { t: string; text: string; edges: string[]; at: string | null }

export interface Station {
  facts: [string, string][]
  files: { name: string; href: string }[]
  versions: { v: string; t: string }[]
  audit: { t: string; e: string }[]
  /** The project it was opened from: its own page. */
  open?: { href: string; label: string }
}

export interface TaskMap {
  lanes: MapLane[]
  nodes: MapNode[]
  edges: MapEdge[]
  steps: ReplayStep[]
  stations: Record<string, Station>
}

const TONE_LABEL: Record<MapTone, string> = { done: 'Done', waiting: 'Waiting', draft: 'Planned', red: 'Overdue' }

const day = (at: string | null | undefined) => {
  const t = at ? officeTime(at) : null
  return t?.isValid() ? shortDay(t.format('YYYY-MM-DD')) : ''
}
/** A moment's day as a station shows it ('25 Oct'), '' for none — the product project's map's too (productmap.ts). */
export const mapDay = day
export const flowKey = (a: string, b: string) => `${a}>${b}`
export const backKey = (a: string, b: string) => `${a}>${b}~back`

/** Where a project's road starts when it came from another (④-4c — answer 23): the project it was opened from, else a
 * deliverable's product project (the handoff's first station, *Requested* — "Opened from Social Media project"). */
export function originOf(p: { source: MktSource | null; parentProject?: TaskProject['parentProject'] }): MktSource | null {
  if (p.source) return p.source
  const pp = p.parentProject
  return pp ? { id: pp.id, trackId: pp.trackId, title: pp.title, kind: 'product', status: pp.status, owner: '' } : null
}

/** That project's station, before Created: its Track ID, its owner, tagged *Opened from*; its panel opens it. */
export function originStation(src: MktSource, lane: MapLaneId, col: number, track: string): { node: MapNode; station: Station } {
  const node: MapNode = {
    id: 'src', kind: 'card', lane, col, title: src.trackId, full: `${src.trackId} · ${src.title}`, person: src.owner || '—', icon: '',
    date: '', tone: 'done', current: false, future: false, tag: 'Opened from', stage: null, handoff: KIND_WORDS[src.kind], status: STATUS_WORDS[src.status],
  }
  return {
    node,
    station: {
      facts: [['Track ID', src.trackId], ['Person', node.person], ['Handoff', `Opened ${track} from it`], ['Kind', node.handoff], ['Status', node.status]],
      files: [], versions: [], audit: [], open: { href: `/marketing/projects/${encodeURIComponent(src.trackId)}`, label: `Open ${src.trackId}` },
    },
  }
}
/** A delivered or a stage's own file's link, signed at the click (lib/storage/browser.ts › fileRoute's shape —
 * Marketing's code keeps out of the storage modules). */
const fileHref = (path: string) => `/files/marketing/${path.split('/').map(encodeURIComponent).join('/')}`

type RoadItem = { id: string; kind: 'card' | 'gate'; stage: number | null; level: number; sub?: MktSubtask; review?: true }

export function taskMap(page: MktTaskPage): TaskMap {
  const p = page.project
  const stages = [...page.stages].sort((a, b) => a.idx - b.idx)
  const events = page.events.filter(e => e.action !== 'free')
  const who = (id: string | null | undefined) => nameOf(page.team, id)
  // The PIC its 🔗 levels ask: the project's own — a task's named on New Project (②a-5), a run's its series' — else the
  // subsidiary's.
  const picName = p.pic || page.sub?.pic || 'PIC'
  const active = p.status === 'active'
  const created = events.find(e => e.action === 'created')
  const src = originOf(p)
  // Its meeting minutes (②a-3), and the PIC approving them (②a-4) — a run's, its series'.
  const doc = page.minutes
  const pm = p.picMinutes
  const pics = pm ? picWho(pm, !!doc?.template.rules.picAll && !!pm.pic2) : ''
  const picOk = pm?.reply?.decision === 'approved' && pm.status !== 'waiting_pic' && pm.status !== 'changes'
  // Started before the PIC approved (the manager's): the line round the gate.
  const skipped = !!pm?.override && !picOk

  // ── The road: where it was opened from, the start, its minutes and the PIC's gate, then each stage — its subtasks off
  // to the side, its Review delivery — and its approvers ──
  const road: RoadItem[] = [...(src ? [{ id: 'src', kind: 'card' as const, stage: null, level: -1 }] : []), { id: 'start', kind: 'card', stage: null, level: -1 },
    ...(doc ? [{ id: 'min', kind: 'card' as const, stage: null, level: -1 }] : []), ...(doc && pm ? [{ id: 'pic', kind: 'gate' as const, stage: null, level: -1 }] : [])]
  const subsOf = (idx: number) => page.subtasks.filter(t => t.stage === idx)
  for (const s of stages) {
    road.push({ id: `s${s.idx}`, kind: 'card', stage: s.idx, level: -1 })
    const subs = subsOf(s.idx)
    for (const t of subs) road.push({ id: `t${t.id}`, kind: 'card', stage: s.idx, level: -1, sub: t })
    if (subs.length) road.push({ id: `r${s.idx}`, kind: 'gate', stage: s.idx, level: -1, review: true })
    s.appr.forEach((_, k) => road.push({ id: `g${s.idx}-${k}`, kind: 'gate', stage: s.idx, level: k }))
  }
  /** The road itself — a subtask is off it, joined by lines of its own. */
  const main = road.filter(r => !r.sub)
  const before = (id: string) => main[main.findIndex(r => r.id === id) - 1]?.id ?? null
  /** Along the road from a stage's card to the station after it: through its Review delivery when it has subtasks. */
  const via = (i: number, to: string) => (main.some(r => r.id === `r${i}`) ? [flowKey(`s${i}`, `r${i}`), flowKey(`r${i}`, to)] : [flowKey(`s${i}`, to)])
  /** The station of the subtask a line is about — none once it was taken back. */
  const subNode = (e: TaskEvent) => {
    const id = typeof e.data?.subtask === 'string' ? `t${e.data.subtask}` : null
    return id && road.some(r => r.id === id) ? id : null
  }
  /** The station a stage hands on to when its last approver approves (or it completes): the next stage's card. */
  const nextCard = (idx: number) => {
    const n = stages.find(s => s.idx > idx)
    return n ? `s${n.idx}` : null
  }

  // ── The trail walked once: each line's last word, the send-backs, the replay, each station's own records ──
  const meta = new Map<string, MapMeta>()
  const backs = new Map<string, { from: string; to: string; n: number; meta: MapMeta }>()
  const steps: ReplayStep[] = []
  const own = new Map<string, { t: string; e: string }[]>()
  const versions = new Map<string, Map<string, string>>()
  const gateAt = new Map<string, string>()
  const level = new Map<number, number>()
  const note = (id: string, e: TaskEvent) => own.set(id, [...(own.get(id) ?? []), { t: trailTime(e.at), e: eventText(e, page) }])
  const version = (id: string, v: string | null, what: string, at: string) => {
    if (!v) return
    const m = versions.get(id) ?? new Map<string, string>()
    m.set(v, `${what} ${day(at)}`.trim())
    versions.set(id, m)
  }
  const mk = (e: TaskEvent, whoText: string): MapMeta => ({ t: trailTime(e.at), who: whoText, what: eventText(e, page), reason: e.reason ?? '' })
  let at: string | null = 'start'

  for (const e of events) {
    const i = e.stage
    const card = i != null ? `s${i}` : null
    const lit: string[] = []
    switch (e.action) {
      case 'created':
        note('start', e)
        // Opened from another: the line from it says who opened it (it is lit from Replay's start — a deliverable or
        // a run has no created record).
        if (src) meta.set(flowKey('src', 'start'), mk(e, e.actor || '—'))
        at = 'start'
        // Written with its minutes: they open with it.
        if (doc) {
          lit.push(flowKey('start', 'min'))
          meta.set(flowKey('start', 'min'), mk(e, `${e.actor || '—'} → ${who(p.owner)}`))
          at = 'min'
        }
        break
      // Its minutes (②a-3) and their way to the PIC (②a-4) — a stage's own approval on the link stays its card's.
      case 'signed': case 'minutes completed':
        if (doc) note('min', e)
        break
      case 'link sent': case 'resent': case 'edited after approval':
        if (!doc || !pm) break
        note('min', e)
        note('pic', e)
        lit.push(flowKey('min', 'pic'))
        meta.set(flowKey('min', 'pic'), mk(e, `${e.actor || '—'} → ${pics}`))
        at = 'pic'
        break
      case 'pic changes': {
        if (i != null || !pm) { if (card) note(card, e); break }
        note('pic', e)
        note('min', e)
        const key = backKey('pic', 'min')
        backs.set(key, { from: 'pic', to: 'min', n: (backs.get(key)?.n ?? 0) + 1, meta: mk(e, `${e.actor || '—'} → ${who(p.owner)}`) })
        lit.push(key)
        at = 'min'
        break
      }
      case 'pic approved':
        if (i != null || !pm) { if (card) note(card, e); break }
        // The work starts with it — the first stage's 'opened' lights the line on.
        note('pic', e)
        at = 'pic'
        break
      case 'started before approval': case 'work started':
        if (pm) note('pic', e)
        else if (card) note(card, e)
        break
      case 'opened': {
        if (!card) break
        const from = before(card)
        if (from) {
          lit.push(flowKey(from, card))
          meta.set(flowKey(from, card), mk(e, `${e.actor || '—'} → ${e.fromTo ?? '—'}`))
        }
        note(card, e)
        at = card
        break
      }
      case 'accepted': case 'picked': case 'nudged':
        if (card) { note(card, e); at = card }
        break
      case 'submitted': {
        if (!card || i == null) break
        level.set(i, 0)
        const gate = `g${i}-0`
        for (const k of via(i, gate)) {
          lit.push(k)
          meta.set(k, mk(e, `${e.actor || '—'} → ${e.fromTo ?? '—'}`))
        }
        note(card, e)
        version(card, e.version, 'Submitted', e.at)
        version(gate, e.version, 'Waiting since', e.at)
        gateAt.set(gate, e.at)
        at = gate
        break
      }
      case 'approved': {
        if (i == null) break
        const k = level.get(i) ?? 0
        const gate = `g${i}-${k}`
        note(gate, e)
        if (e.fromTo) {
          const next = `g${i}-${k + 1}`
          lit.push(flowKey(gate, next))
          meta.set(flowKey(gate, next), mk(e, `${e.actor || '—'} → ${e.fromTo}`))
          version(gate, e.version, 'Passed on', e.at)
          version(next, e.version, 'Waiting since', e.at)
          gateAt.set(`${gate}:done`, e.at)
          gateAt.set(next, e.at)
          level.set(i, k + 1)
          at = next
        } else {
          const next = nextCard(i)
          if (next) {
            lit.push(flowKey(gate, next))
            meta.set(flowKey(gate, next), mk(e, e.actor || '—'))
          }
          version(gate, e.version, 'Approved', e.at)
          if (card) version(card, e.version, 'Approved', e.at)
          gateAt.set(`${gate}:done`, e.at)
          at = next ?? gate
        }
        break
      }
      case 'completed': {
        if (!card || i == null) break
        const next = nextCard(i)
        if (next) {
          for (const k of via(i, next)) {
            lit.push(k)
            meta.set(k, mk(e, e.actor || '—'))
          }
        }
        note(card, e)
        at = next ?? card
        break
      }
      // A subtask (②b-2c): split off to its person, delivered up to Review delivery, returned, approved.
      case 'subtask': {
        const t = subNode(e)
        if (card) note(card, e)
        if (!t || !card) break
        lit.push(flowKey(card, t))
        meta.set(flowKey(card, t), mk(e, `${e.actor || '—'} → ${e.fromTo ?? '—'}`))
        note(t, e)
        at = t
        break
      }
      case 'delivered': {
        const t = subNode(e)
        if (!t || i == null) { if (card) note(card, e); break }
        const rev = `r${i}`
        lit.push(flowKey(t, rev))
        meta.set(flowKey(t, rev), mk(e, `${e.actor || '—'} → ${e.fromTo ?? '—'}`))
        note(t, e)
        note(rev, e)
        version(t, e.version, 'Delivered', e.at)
        at = rev
        break
      }
      case 'delivery returned': {
        const t = subNode(e)
        if (!t || i == null) { if (card) note(card, e); break }
        const rev = `r${i}`
        const key = backKey(rev, t)
        backs.set(key, { from: rev, to: t, n: (backs.get(key)?.n ?? 0) + 1, meta: mk(e, `${e.actor || '—'} → ${e.fromTo ?? '—'}`) })
        lit.push(key)
        note(rev, e)
        note(t, e)
        version(t, e.version, 'Returned', e.at)
        at = t
        break
      }
      case 'delivery approved': {
        const t = subNode(e)
        if (!t || i == null) { if (card) note(card, e); break }
        note(`r${i}`, e)
        note(t, e)
        version(t, e.version, 'Approved', e.at)
        at = card
        break
      }
      case 'changes': {
        if (i == null) break
        const k = level.get(i) ?? 0
        const s = stages.find(x => x.idx === i)
        const from = s && s.appr.length ? `g${i}-${Math.min(k, s.appr.length - 1)}` : `s${i}`
        const back = typeof e.data?.back === 'number' ? e.data.back : i
        const to = `s${back}`
        const key = backKey(from, to)
        const m = mk(e, `${e.actor || '—'} → ${e.fromTo ?? '—'}`)
        backs.set(key, { from, to, n: (backs.get(key)?.n ?? 0) + 1, meta: m })
        lit.push(key)
        note(from, e)
        note(to, e)
        version(from, e.version, 'Changes requested', e.at)
        if (card) version(card, e.version, 'Changes requested', e.at)
        level.set(i, 0)
        at = to
        break
      }
      case 'closed':
        at = null
        break
      default:
        if (card) note(card, e)
    }
    steps.push({ t: trailTime(e.at), text: eventText(e, page), edges: lit, at })
  }

  // ── The stations as the database has them now ─────────────────────────────────
  const lanesUsed: MapLaneId[] = []
  const addLane = (l: MapLaneId) => { if (!lanesUsed.includes(l)) lanesUsed.push(l) }
  if (stages.some(s => s.appr.length) || (doc && pm)) addLane('appr')
  const laneOf = (dept: string | undefined) => dept || '—'
  const startLane: MapLaneId = laneOf(stages[0]?.dept)
  addLane(startLane)
  stages.forEach(s => addLane(laneOf(s.dept)))
  for (const r of road) if (r.sub) addLane(laneOf(page.team.find(x => x.id === r.sub?.assignee)?.title ?? ''))

  const returnsTo = (idx: number) => [...backs.values()].filter(b => b.to === `s${idx}`).reduce((n, b) => n + b.n, 0)
  const nodes: MapNode[] = road.map((r, col) => {
    // The project it was opened from — its own road, behind this one's start.
    if (r.id === 'src' && src) return originStation(src, startLane, col, p.trackId).node
    if (r.id === 'start') {
      const by = created?.actor || who(p.owner)
      return {
        id: 'start', kind: 'card', lane: startLane, col, title: 'Created', full: `Created by ${by}`, person: by, icon: '',
        date: day(created?.at ?? p.createdAt), tone: 'done', current: false, future: false, tag: null, stage: null,
        handoff: src ? `Opened from ${src.trackId}` : 'Created', status: 'Done',
      }
    }
    if (r.id === 'min' && doc) {
      // Its minutes: done once complete — or, the PIC approving them, once sent; back here when the PIC asks for changes.
      const sentBack = pm?.status === 'changes'
      const writing = pm ? pm.status === 'minutes' : doc.status !== 'completed'
      const done = !writing && !sentBack
      const n = backs.get(backKey('pic', 'min'))?.n ?? 0
      const words = minutesState(doc, who, null).label
      return {
        id: 'min', kind: 'card', lane: startLane, col, title: 'Meeting minutes', full: `Meeting minutes · ${doc.title}`, person: who(p.owner), icon: '',
        date: done ? day(doc.completedAt ?? pm?.sentAt) : '', tone: done ? 'done' : sentBack ? 'red' : 'waiting', current: !!pm && !done, future: false,
        tag: n ? `returned ×${n}` : null, stage: null, handoff: 'Written on New Project',
        status: done ? 'Done' : sentBack ? 'Changes requested' : words === 'Draft' ? (pm ? 'Ready to send · now here' : 'Draft') : words,
      }
    }
    if (r.id === 'pic' && pm) {
      // 🔗 The PIC approving them: waiting since they were sent, approved — or gone round, started before approval.
      const waiting = pm.status === 'waiting_pic'
      const sentBack = pm.status === 'changes'
      const half = waiting && doc ? minutesState(doc, who, pm).label : ''
      return {
        id: 'pic', kind: 'gate', lane: 'appr', col, title: 'approves the minutes', full: `${pics} approves the minutes`, person: pics, icon: '🔗',
        date: picOk ? day(pm.reply?.at) : waiting && pm.sentAt ? `Since ${day(pm.sentAt)}` : '',
        tone: picOk ? 'done' : waiting ? 'waiting' : sentBack ? 'red' : 'draft', current: waiting, future: !picOk && !waiting && !sentBack && !pm.sentAt,
        tag: null, stage: null, handoff: 'PIC via link',
        status: waiting ? half || `Waiting for ${pics}` : picOk ? 'Approved' : skipped ? 'Started before approval' : sentBack ? 'Changes requested' : 'Planned',
      }
    }
    const s = stages.find(x => x.idx === r.stage)!
    const stageDone = s.status === 'done' || p.status === 'done' || s.idx < p.cur
    const here = active && s.idx === p.cur && !stageDone
    const late = !!(s.dueOn && page.today && s.dueOn < page.today)
    if (r.sub) {
      // A subtask: its person's lane, picked by the stage's owner; done once handed in (Review delivery is where it is).
      const t = r.sub
      const person = page.team.find(x => x.id === t.assignee)
      const handedIn = t.status === 'ready' || t.status === 'approved' || stageDone
      const tLate = !handedIn && !!(t.dueOn && page.today && t.dueOn < page.today)
      const current = here && !handedIn
      const tone: MapTone = handedIn ? 'done' : tLate || t.returns >= 3 ? 'red' : 'waiting'
      return {
        id: r.id, kind: 'card', lane: laneOf(person?.title ?? ''), col, title: t.title, full: t.title, person: who(t.assignee), icon: '',
        date: t.dueOn ? (handedIn ? shortDay(t.dueOn) : `Due ${shortDay(t.dueOn)}`) : '', tone, current, future: false,
        tag: t.returns ? `returned ×${t.returns}` : 'Subtask', stage: s.idx, handoff: `🔓 Picked by ${who(s.owner)}`,
        status: t.status === 'approved' || stageDone ? 'Approved' : t.status === 'ready' ? 'Delivered · waiting for review'
          : t.status === 'revising' ? 'Revising' : tLate ? 'Overdue' : 'In progress',
      }
    }
    if (r.review) {
      // The stage's Review delivery, its owner's: waiting while a delivery is in, done once every subtask is approved.
      const subs = subsOf(s.idx)
      const passed = stageDone || subs.every(t => t.status === 'approved')
      const current = here && !passed && subs.some(t => t.status === 'ready')
      const tone: MapTone = passed ? 'done' : current ? 'waiting' : 'draft'
      return {
        id: r.id, kind: 'gate', lane: laneOf(s.dept), col, title: 'Review delivery', full: `Review delivery by ${who(s.owner)}`, person: who(s.owner),
        icon: '', date: '', tone, current, future: tone === 'draft', tag: null, stage: s.idx, handoff: 'Owner of the stage',
        status: current ? `Waiting for ${who(s.owner)}` : TONE_LABEL[tone], mini: true,
      }
    }
    if (r.kind === 'card') {
      // Handed in, its approvers deciding: the card's part is done (the handoff draws it so) — the gate is where it is.
      const handedIn = here && s.status === 'review'
      const current = here && !handedIn
      const tone: MapTone = stageDone || handedIn ? 'done' : current ? (late || s.status === 'changes' ? 'red' : 'waiting') : 'draft'
      const prev = stages.filter(x => x.idx < s.idx).pop()
      const handoff = s.mode === 'prev' ? `🔓 Picked by ${prev ? who(prev.owner) : 'the stage before'}` : s.mode === 'assign' ? '🔒 Picked at assignment' : '🔒 Assigned'
      const n = returnsTo(s.idx)
      return {
        id: r.id, kind: 'card', lane: laneOf(s.dept), col, title: s.name, full: s.name, person: who(s.owner), icon: '',
        date: stageDone ? day(s.doneAt) || (s.dueOn ? shortDay(s.dueOn) : '') : handedIn ? day(s.submittedAt) : s.dueOn ? `Due ${shortDay(s.dueOn)}` : '',
        tone, current, future: tone === 'draft', tag: n ? `returned ×${n}` : null, stage: s.idx, handoff,
        status: current ? (s.status === 'changes' ? 'Changes requested' : late ? 'Overdue' : 'Waiting · now here') : handedIn ? 'Submitted' : TONE_LABEL[tone],
      }
    }
    const a = s.appr[r.level]
    const pic = a.kind === 'pic'
    const passed = stageDone || (here && s.status === 'review' && r.level < s.apprIdx)
    const current = here && s.status === 'review' && r.level === s.apprIdx
    const tone: MapTone = passed ? 'done' : current ? (late ? 'red' : 'waiting') : 'draft'
    const person = pic ? picName : who(a.staff)
    const since = gateAt.get(r.id)
    return {
      id: r.id, kind: 'gate', lane: 'appr', col, title: `approves ${s.name}`, full: `${person} approves ${s.name}`, person,
      icon: pic ? '🔗' : '👤',
      date: passed ? day(gateAt.get(`${r.id}:done`) ?? s.doneAt) : current && since ? `Since ${day(since)}` : '',
      tone, current, future: !passed && !current, tag: null, stage: s.idx, handoff: pic ? 'PIC via link' : 'Internal approver',
      status: current ? (pic ? 'Waiting for PIC' : `Waiting for ${person}`) : TONE_LABEL[tone],
    }
  })
  const byId = new Map(nodes.map(n => [n.id, n]))

  // ── The lines: along the road, then each send-back ─────────────────────────────
  const edges: MapEdge[] = []
  for (let k = 1; k < main.length; k++) {
    const from = main[k - 1].id
    const to = main[k].id
    const target = byId.get(to)!
    const reached = !target.future
    const s = stages.find(x => x.idx === target.stage)
    const picked = target.kind === 'card' && s?.mode === 'prev'
    // Round the PIC's gate: started before they approved (②a-4).
    const round = from === 'pic' && skipped && reached
    edges.push({
      key: flowKey(from, to), from, to,
      kind: !reached ? 'future' : picked || round ? 'dashed' : 'solid',
      // The line from where it was opened goes unlabelled: the two share a lane, its label would sit under *Created* —
      // the source's card says *Opened from*.
      label: round ? 'started before approval' : reached && picked ? `picked by ${byId.get(before(to) ?? '')?.person ?? '—'}` : null,
      meta: meta.get(flowKey(from, to)) ?? null,
    })
  }
  // A subtask's own lines: dashed out to it (its person picked by the stage's owner), up to Review delivery once delivered.
  const labelled = new Set<number>()
  for (const r of road) {
    if (!r.sub || r.stage == null) continue
    const card = `s${r.stage}`
    const rev = `r${r.stage}`
    const owner = stages.find(x => x.idx === r.stage)?.owner
    // One label a stage: its subtasks' lines would all say the same.
    const label = labelled.has(r.stage) ? null : `picked by ${who(owner)}`
    labelled.add(r.stage)
    edges.push({ key: flowKey(card, r.id), from: card, to: r.id, kind: 'dashed', label, meta: meta.get(flowKey(card, r.id)) ?? null, drop: true })
    edges.push({ key: flowKey(r.id, rev), from: r.id, to: rev, kind: r.sub.delivery || r.sub.status === 'ready' || r.sub.status === 'approved' ? 'solid' : 'future', label: null, meta: meta.get(flowKey(r.id, rev)) ?? null, rise: true })
  }
  for (const [key, b] of backs) edges.push({ key, from: b.from, to: b.to, kind: 'return', label: `returned ×${b.n}`, meta: b.meta })

  // ── Each station's own panel ───────────────────────────────────────────────────
  const stations: Record<string, Station> = {}
  const subById = new Map(road.filter(r => r.sub).map(r => [r.id, r.sub as MktSubtask]))
  for (const n of nodes) {
    if (n.id === 'src' && src) {
      stations.src = originStation(src, n.lane, n.col, p.trackId).station
      continue
    }
    const s = n.stage != null ? stages.find(x => x.idx === n.stage) : null
    const t = subById.get(n.id)
    const approval = t || n.mini ? `👤 ${who(s?.owner)} reviews the delivery`
      : n.id === 'min' ? (pm ? `🔗 ${pics}` : '— No PIC sign-off')
      : n.kind === 'gate' ? (n.icon === '🔗' ? '🔗 PIC approves via link' : '👤 Internal approver')
      : s && s.appr.length ? s.appr.map(a => (a.kind === 'pic' ? `🔗 ${picName}` : `👤 ${who(a.staff)}`)).join(' → ') : '— No approval'
    const due = t ? t.dueOn : s?.dueOn
    stations[n.id] = {
      facts: [
        ['Track ID', p.trackId],
        ['Person', n.person],
        ['Handoff', n.handoff],
        [n.status === 'Done' || n.status === 'Approved' ? 'Completed' : 'Deadline', n.status === 'Done' ? n.date || '—' : due ? shortDay(due) : '—'],
        ['Approval', n.id === 'start' ? '—' : approval],
      ],
      files: t
        ? [...(t.delivery?.files ?? []).map(f => ({ name: f.name, href: fileHref(f.path) })), ...(t.delivery?.links ?? []).map(l => ({ name: l.label || l.url, href: l.url }))]
        : n.kind === 'card' && s ? [...s.work.files.map(f => ({ name: f.name, href: fileHref(f.path) })), ...s.work.links.map(l => ({ name: l.label || l.url, href: l.url }))] : [],
      versions: [...(versions.get(n.id) ?? new Map<string, string>())].map(([v, t]) => ({ v, t })),
      audit: own.get(n.id) ?? [],
    }
  }

  const lanes: MapLane[] = lanesUsed.map(id => (id === 'appr'
    ? { id, name: 'Approvals', emoji: '🛡️', tone: 'appr' as const }
    : { id, name: groupLabel(id === '—' ? '' : id), emoji: groupEmoji(id === '—' ? '' : id), tone: groupTone(id === '—' ? '' : id) }))
  return { lanes, nodes, edges, steps, stations }
}

/** What the map shows after the first `step` records: the lines lit, the stations reached, where the work stands. */
export function replayAt(map: TaskMap, step: number): { lit: Set<string>; seen: Set<string>; at: string | null; last: ReplayStep | null } {
  // Where it was opened from was there before it, and its line with it — whether or not a record made it.
  const src = map.nodes.some(n => n.id === 'src')
  const lit = new Set<string>(src ? [flowKey('src', 'start')] : [])
  const seen = new Set<string>(src ? ['src', 'start'] : ['start'])
  let at: string | null = 'start'
  for (const s of map.steps.slice(0, Math.max(0, step))) {
    for (const k of s.edges) {
      lit.add(k)
      const e = map.edges.find(x => x.key === k)
      if (e) { seen.add(e.from); seen.add(e.to) }
    }
    at = s.at
    if (at) seen.add(at)
  }
  return { lit, seen, at, last: step > 0 ? map.steps[step - 1] ?? null : null }
}

/** The list view's rows, along the road. */
export function mapRows(map: TaskMap): { id: string; no: string; icon: string; title: string; lane: string; person: string; handoff: string; status: string; tone: MapTone; current: boolean; date: string }[] {
  const lane = new Map(map.lanes.map(l => [l.id, l]))
  return map.nodes.map((n, i) => ({
    id: n.id, no: String(i + 1).padStart(2, '0'), icon: n.kind === 'gate' ? n.icon : lane.get(n.lane)?.emoji ?? '', title: n.full,
    lane: lane.get(n.lane)?.name ?? '', person: n.person, handoff: n.tag ? `${n.handoff} · ${n.tag}` : n.handoff,
    status: n.status, tone: n.tone, current: n.current, date: n.date,
  }))
}

// ── Geometry (the handoff's): lanes 150 high, 60 in for their tags, a station every 200 ─────────────────
export const LANE_H = 150
export const MAP_OFF = 60
export const COL_W = 200
const FIRST_X = 140

export interface Box { w: number; h: number; cx: number; cy: number; l: number; r: number; t: number; b: number }

export function boxOf(n: Pick<MapNode, 'kind' | 'col' | 'lane' | 'mini'>, lanes: readonly MapLane[]): Box {
  const li = Math.max(0, lanes.findIndex(l => l.id === n.lane))
  const w = n.kind === 'gate' ? (n.mini ? 112 : 140) : 172
  const h = n.kind === 'gate' ? (n.mini ? 58 : 74) : 80
  const cx = MAP_OFF + FIRST_X + n.col * COL_W
  const cy = li * LANE_H + LANE_H / 2
  return { w, h, cx, cy, l: cx - w / 2, r: cx + w / 2, t: cy - h / 2, b: cy + h / 2 }
}

export const mapSize = (map: TaskMap) => ({
  w: MAP_OFF + FIRST_X + Math.max(0, map.nodes.length - 1) * COL_W + 140,
  h: Math.max(1, map.lanes.length) * LANE_H,
})

/** A line's curve: along the road from one's right to the next's left; a send-back from the gate's foot round to the
 * stage's head. Returns the SVG path and its middle (for its label). */
export function edgePath(A: Box, B: Box, back: boolean, rise = false, drop = false): { d: string; mid: [number, number] } {
  const c = (p0: number[], p1: number[], p2: number[], p3: number[]) => ({
    d: `M${p0[0]},${p0[1]} C${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]}`,
    mid: [(p0[0] + 3 * p1[0] + 3 * p2[0] + p3[0]) / 8, (p0[1] + 3 * p1[1] + 3 * p2[1] + p3[1]) / 8] as [number, number],
  })
  if (back) {
    // Below when the stage sits under the gate; above when it shares its lane.
    if (B.t > A.b) return c([A.cx - 10, A.b - 4], [A.cx - 120, A.b + 110], [B.cx + 80, B.t - 110], [B.cx + 40, B.t - 2])
    return c([A.cx - 10, A.t + 4], [A.cx - 90, A.t - 70], [B.cx + 60, B.t - 70], [B.cx + 20, B.t - 2])
  }
  // A delivery's line into a gate in a lane above: up from the card's top, then along that lane.
  if (rise && B.cy < A.t) return c([A.cx, A.t], [A.cx, B.cy], [A.cx, B.cy], [B.l - 2, B.cy])
  // A subtask's dashed line into a card in a lane below: down into its top-left.
  if (drop && B.t > A.b) return c([A.r, A.cy], [A.r + 60, A.cy], [B.l + 30, B.t - 70], [B.l + 30, B.t - 2])
  const dx = Math.max(40, (B.l - A.r) / 2)
  return c([A.r, A.cy], [A.r + dx, A.cy], [B.l - dx, B.cy], [B.l - 2, B.cy])
}
