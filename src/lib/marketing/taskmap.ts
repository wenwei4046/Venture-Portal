// The task map (`Task Map.dc.html`, ④-4): a project's road as swim lanes — Approvals on top, then each team its stages
// are on — its stations (a stage's card; each approver's gate, 👤 a person or 🔗 the PIC) joined by its hand-offs: solid
// once made, dashed when the stage before picked who, red when sent back (returned ×n), faint while planned. A line
// says when, who and what; a station its facts, versions and own records. Replay walks the trail record by record.
// Drawn from the task page (its stages, approvers and trail) — subtasks have no writer yet, so none is drawn. Pure.

import { officeTime } from '@/lib/office-time'
import { shortDay, type MktDept } from './board'
import { eventText, nameOf, trailTime, type MktTaskPage, type TaskEvent } from './task'
import { DEPT_LABEL } from './tasks'

export type MapLaneId = 'appr' | MktDept
export type MapTone = 'done' | 'waiting' | 'draft' | 'red'

export interface MapLane { id: MapLaneId; name: string; emoji: string }

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
}

export interface MapMeta { t: string; who: string; what: string; reason: string }

export interface MapEdge {
  key: string
  from: string
  to: string
  kind: 'solid' | 'dashed' | 'return' | 'future'
  label: string | null
  meta: MapMeta | null
}

export interface ReplayStep { t: string; text: string; edges: string[]; at: string | null }

export interface Station {
  facts: [string, string][]
  files: { name: string; href: string }[]
  versions: { v: string; t: string }[]
  audit: { t: string; e: string }[]
}

export interface TaskMap {
  lanes: MapLane[]
  nodes: MapNode[]
  edges: MapEdge[]
  steps: ReplayStep[]
  stations: Record<string, Station>
}

export const LANE_EMOJI: Record<MktDept, string> = { social: '📣', content: '🎬', design: '🎨', ads: '📈', brand: '✨' }
const TONE_LABEL: Record<MapTone, string> = { done: 'Done', waiting: 'Waiting', draft: 'Planned', red: 'Overdue' }

const day = (at: string | null | undefined) => {
  const t = at ? officeTime(at) : null
  return t?.isValid() ? shortDay(t.format('YYYY-MM-DD')) : ''
}
const flowKey = (a: string, b: string) => `${a}>${b}`
const backKey = (a: string, b: string) => `${a}>${b}~back`

export function taskMap(page: MktTaskPage): TaskMap {
  const p = page.project
  const stages = [...page.stages].sort((a, b) => a.idx - b.idx)
  const events = page.events.filter(e => e.action !== 'free')
  const who = (id: string | null | undefined) => nameOf(page.team, id)
  const picName = page.sub?.pic || 'PIC'
  const active = p.status === 'active'
  const created = events.find(e => e.action === 'created')

  // ── The road: the start, then each stage and its approvers in turn ──────────────
  const road: { id: string; kind: 'card' | 'gate'; stage: number | null; level: number }[] = [{ id: 'start', kind: 'card', stage: null, level: -1 }]
  for (const s of stages) {
    road.push({ id: `s${s.idx}`, kind: 'card', stage: s.idx, level: -1 })
    s.appr.forEach((_, k) => road.push({ id: `g${s.idx}-${k}`, kind: 'gate', stage: s.idx, level: k }))
  }
  const before = (id: string) => road[road.findIndex(r => r.id === id) - 1]?.id ?? null
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
        at = 'start'
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
        lit.push(flowKey(card, gate))
        meta.set(flowKey(card, gate), mk(e, `${e.actor || '—'} → ${e.fromTo ?? '—'}`))
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
          lit.push(flowKey(card, next))
          meta.set(flowKey(card, next), mk(e, e.actor || '—'))
        }
        note(card, e)
        at = next ?? card
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
  if (stages.some(s => s.appr.length)) addLane('appr')
  const startLane: MapLaneId = stages[0]?.dept ?? 'social'
  addLane(startLane)
  stages.forEach(s => addLane(s.dept))

  const returnsTo = (idx: number) => [...backs.values()].filter(b => b.to === `s${idx}`).reduce((n, b) => n + b.n, 0)
  const nodes: MapNode[] = road.map((r, col) => {
    if (r.id === 'start') {
      const by = created?.actor || who(p.owner)
      return {
        id: 'start', kind: 'card', lane: startLane, col, title: 'Created', full: `Created by ${by}`, person: by, icon: '',
        date: day(created?.at ?? p.createdAt), tone: 'done', current: false, future: false, tag: null, stage: null,
        handoff: 'Created', status: 'Done',
      }
    }
    const s = stages.find(x => x.idx === r.stage)!
    const stageDone = s.status === 'done' || p.status === 'done' || s.idx < p.cur
    const here = active && s.idx === p.cur && !stageDone
    const late = !!(s.dueOn && page.today && s.dueOn < page.today)
    if (r.kind === 'card') {
      // Handed in, its approvers deciding: the card's part is done (the handoff draws it so) — the gate is where it is.
      const handedIn = here && s.status === 'review'
      const current = here && !handedIn
      const tone: MapTone = stageDone || handedIn ? 'done' : current ? (late || s.status === 'changes' ? 'red' : 'waiting') : 'draft'
      const prev = stages.filter(x => x.idx < s.idx).pop()
      const handoff = s.mode === 'prev' ? `🔓 Picked by ${prev ? who(prev.owner) : 'the stage before'}` : s.mode === 'assign' ? '🔒 Picked at assignment' : '🔒 Assigned'
      const n = returnsTo(s.idx)
      return {
        id: r.id, kind: 'card', lane: s.dept, col, title: s.name, full: s.name, person: who(s.owner), icon: '',
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
  for (let k = 1; k < road.length; k++) {
    const from = road[k - 1].id
    const to = road[k].id
    const target = byId.get(to)!
    const reached = !target.future
    const s = stages.find(x => x.idx === target.stage)
    const picked = target.kind === 'card' && s?.mode === 'prev'
    edges.push({
      key: flowKey(from, to), from, to,
      kind: !reached ? 'future' : picked ? 'dashed' : 'solid',
      label: reached && picked ? `picked by ${byId.get(before(to) ?? '')?.person ?? '—'}` : null,
      meta: meta.get(flowKey(from, to)) ?? null,
    })
  }
  for (const [key, b] of backs) edges.push({ key, from: b.from, to: b.to, kind: 'return', label: `returned ×${b.n}`, meta: b.meta })

  // ── Each station's own panel ───────────────────────────────────────────────────
  const stations: Record<string, Station> = {}
  for (const n of nodes) {
    const s = n.stage != null ? stages.find(x => x.idx === n.stage) : null
    const approval = n.kind === 'gate'
      ? (n.icon === '🔗' ? '🔗 PIC approves via link' : '👤 Internal approver')
      : s && s.appr.length ? s.appr.map(a => (a.kind === 'pic' ? `🔗 ${picName}` : `👤 ${who(a.staff)}`)).join(' → ') : '— No approval'
    stations[n.id] = {
      facts: [
        ['Track ID', p.trackId],
        ['Person', n.person],
        ['Handoff', n.handoff],
        [n.status === 'Done' ? 'Completed' : 'Deadline', n.status === 'Done' ? n.date || '—' : s?.dueOn ? shortDay(s.dueOn) : '—'],
        ['Approval', n.id === 'start' ? '—' : approval],
      ],
      files: n.kind === 'card' && s ? s.work.links.map(l => ({ name: l.label || l.url, href: l.url })) : [],
      versions: [...(versions.get(n.id) ?? new Map<string, string>())].map(([v, t]) => ({ v, t })),
      audit: own.get(n.id) ?? [],
    }
  }

  const lanes: MapLane[] = lanesUsed.map(id => ({
    id, name: id === 'appr' ? 'Approvals' : DEPT_LABEL[id], emoji: id === 'appr' ? '🛡️' : LANE_EMOJI[id],
  }))
  return { lanes, nodes, edges, steps, stations }
}

/** What the map shows after the first `step` records: the lines lit, the stations reached, where the work stands. */
export function replayAt(map: TaskMap, step: number): { lit: Set<string>; seen: Set<string>; at: string | null; last: ReplayStep | null } {
  const lit = new Set<string>()
  const seen = new Set<string>(['start'])
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

export function boxOf(n: Pick<MapNode, 'kind' | 'col' | 'lane'>, lanes: readonly MapLane[]): Box {
  const li = Math.max(0, lanes.findIndex(l => l.id === n.lane))
  const w = n.kind === 'gate' ? 140 : 172
  const h = n.kind === 'gate' ? 74 : 80
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
export function edgePath(A: Box, B: Box, back: boolean): { d: string; mid: [number, number] } {
  const c = (p0: number[], p1: number[], p2: number[], p3: number[]) => ({
    d: `M${p0[0]},${p0[1]} C${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]}`,
    mid: [(p0[0] + 3 * p1[0] + 3 * p2[0] + p3[0]) / 8, (p0[1] + 3 * p1[1] + 3 * p2[1] + p3[1]) / 8] as [number, number],
  })
  if (back) {
    // Below when the stage sits under the gate; above when it shares its lane.
    if (B.t > A.b) return c([A.cx - 10, A.b - 4], [A.cx - 120, A.b + 110], [B.cx + 80, B.t - 110], [B.cx + 40, B.t - 2])
    return c([A.cx - 10, A.t + 4], [A.cx - 90, A.t - 70], [B.cx + 60, B.t - 70], [B.cx + 20, B.t - 2])
  }
  const dx = Math.max(40, (B.l - A.r) / 2)
  return c([A.r, A.cy], [A.r + dx, A.cy], [B.l - dx, B.cy], [B.l - 2, B.cy])
}
