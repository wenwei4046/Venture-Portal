// A 📦 product project's map (④-4d — the user's answers 22 and 23: "Map and Audit trail on every project", "the intake
// is drawn on the map"): its road as a task's map draws one (taskmap.ts) — where it was opened from (④-4c), Created, the
// intake meeting's minutes (written, signed, sent back by the PIC), 🔗 the PIC's approval on the link when the minutes
// ask for it (or the work *started before approval*), the work started (*Plan assignments*) — then its deliverables in a
// lane of their own, a line down to each, each opening its own page and map (a recurring project's latest month). Drawn
// from the product page and its trail: the formal log's every record once it is read, the page's newest 40 until then.
// Pure.

import { shortDay } from './board'
import { picNames } from './clients'
import { bothWaiting, deliverableState, productEventText, runsLine, type ProductDeliverable, type ProductProjectPage } from './project'
import { groupEmoji, groupLabel, groupTone } from './groups'
import { nameOf, trailTime } from './task'
import {
  backKey, flowKey, mapDay, originStation, type MapEdge, type MapLane, type MapLaneId, type MapMeta, type MapNode, type ReplayStep, type Station,
  type TaskMap,
} from './taskmap'

/** A record of a product project's trail — the page's or the formal log's. */
export interface ProductMapEvent {
  at: string
  actor: string
  action: string
  reason: string | null
  data?: Record<string, unknown> | null
}

/** The deliverables' own lane, under the project's. */
export const DELIV_LANE = 'deliverables'
/** Its records on the minutes' station, on the work's; the rest on Created's (the project's own: billing, its owner …). */
const ON_MINUTES = new Set(['signed', 'minutes completed', 'campaign period', 'edited after approval'])
const ON_WORK = new Set(['work started', 'run made', 'run day', 'runs paused', 'runs resumed', 'started before approval', 'stopped'])

export function productMap(page: ProductProjectPage, log?: readonly ProductMapEvent[] | null): TaskMap {
  const p = page.project
  const events: ProductMapEvent[] = log ? [...log] : [...page.trail].reverse()
  const who = (id: string | null | undefined) => nameOf(page.team, id)
  const doc = page.minutes.find(m => m.intake) ?? page.minutes[0] ?? null
  const picSigns = !!doc?.template.rules.pic
  const pics = picNames(p.pic, p.pic2) || 'PIC'
  // Both PICs sign off and one has: whom it still waits for, as the page says it.
  const firstIn = bothWaiting(page)
  const owner = p.ownerName || who(p.owner)
  const home: MapLaneId = page.team.find(t => t.id === p.owner)?.title || '—'
  const started = p.status === 'active' || p.status === 'paused' || p.status === 'done'
  const picOk = p.picReply?.decision === 'approved' && p.status !== 'waiting_pic' && p.status !== 'changes'
  // Started before the PIC approved (the manager's override): the line round the gate.
  const skipped = !!p.override && !picOk
  const ready = !started && (p.status === 'approved' || (skipped && (p.status === 'waiting_pic' || p.status === 'changes')))
  const src = p.source
  const created = events.find(e => e.action === 'created')
  const workAt = events.find(e => e.action === 'work started')
  // A one-time project's deliverables; a recurring one's latest month's (its months are on its trail).
  const latest = Math.max(0, ...page.deliverables.map(d => d.deliv?.run ?? 1))
  const delivs = page.deliverables.filter(d => d.status !== 'cancelled' && (!p.runs || (d.deliv?.run ?? 1) === latest))
  const dId = (d: ProductDeliverable) => `d${d.id}`
  const main = [...(src ? ['src'] : []), 'start', 'min', ...(picSigns ? ['pic'] : []), 'work']

  // ── The trail walked once: each line's last word, the PIC's send-backs, the replay, each station's own records ──
  const words = (e: ProductMapEvent) => productEventText(e, p.product)
  const meta = new Map<string, MapMeta>()
  const own = new Map<string, { t: string; e: string }[]>()
  const steps: ReplayStep[] = []
  const back = { n: 0, meta: null as MapMeta | null }
  const note = (id: string, e: ProductMapEvent) => own.set(id, [...(own.get(id) ?? []), { t: trailTime(e.at), e: words(e) }])
  const mk = (e: ProductMapEvent, whoText: string): MapMeta => ({ t: trailTime(e.at), who: whoText, what: words(e), reason: e.reason ?? '' })
  const line = (lit: string[], from: string, to: string, m: MapMeta) => {
    lit.push(flowKey(from, to))
    meta.set(flowKey(from, to), m)
  }
  let at: string | null = 'start'
  for (const e of events) {
    const lit: string[] = []
    const actor = e.actor || '—'
    switch (e.action) {
      case 'created':
        note('start', e)
        // The line from where it was opened is lit from Replay's start (replayAt); the record says who opened it.
        if (src) meta.set(flowKey('src', 'start'), mk(e, actor))
        // The intake meeting's minutes open with the project.
        line(lit, 'start', 'min', mk(e, `${actor} → ${owner}`))
        at = 'min'
        break
      case 'link sent': case 'resent':
        note('min', e)
        if (picSigns) {
          note('pic', e)
          line(lit, 'min', 'pic', mk(e, `${actor} → ${e.reason || pics} (PIC)`))
          at = 'pic'
        }
        break
      case 'minutes completed':
        note('min', e)
        // No PIC sign-off: the minutes completed, the work is next.
        if (!picSigns) {
          line(lit, 'min', 'work', mk(e, `${actor} → ${owner}`))
          at = 'work'
        }
        break
      case 'edited after approval':
        note('min', e)
        if (picSigns) {
          note('pic', e)
          line(lit, 'min', 'pic', mk(e, `${actor} → ${pics} (PIC)`))
          at = 'pic'
        }
        break
      case 'pic changes':
        note('pic', e)
        note('min', e)
        back.n += 1
        back.meta = mk(e, `${actor} → ${owner}`)
        lit.push(backKey('pic', 'min'))
        at = 'min'
        break
      case 'pic approved':
        note('pic', e)
        // The first of two PICs (both sign off): still waiting for the other.
        if (typeof e.data?.waiting === 'string' && e.data.waiting) at = 'pic'
        else {
          line(lit, 'pic', 'work', mk(e, `${actor} → ${owner}`))
          at = 'work'
        }
        break
      case 'started before approval':
        note('work', e)
        line(lit, picSigns ? 'pic' : 'min', 'work', mk(e, actor))
        at = 'work'
        break
      case 'work started': case 'run made':
        note('work', e)
        // The deliverables drawn are the latest month's — their lines made by its record: the work started (the first
        // month), or that month's run made. An earlier month's lines are not on the map.
        if (e.action === 'work started' ? latest <= 1 : typeof e.data?.run !== 'number' || e.data.run === latest) {
          for (const d of delivs) line(lit, 'work', dId(d), mk(e, `${actor} → ${d.title}`))
        }
        at = 'work'
        break
      case 'closed':
        at = null
        break
      default:
        note(ON_MINUTES.has(e.action) ? 'min' : ON_WORK.has(e.action) ? 'work' : 'start', e)
    }
    steps.push({ t: trailTime(e.at), text: words(e), edges: lit, at })
  }

  // ── The stations as the database has them now ─────────────────────────────────
  const writing = p.status === 'minutes'
  const sentBack = p.status === 'changes'
  const waiting = p.status === 'waiting_pic'
  const by = created?.actor || owner
  const node = (n: Omit<MapNode, 'icon' | 'current' | 'future' | 'tag' | 'stage'> & Partial<MapNode>): MapNode =>
    ({ icon: '', current: false, future: false, tag: null, stage: null, ...n })
  const road = [...main, ...delivs.map(dId)]
  const nodes: MapNode[] = road.map((id, col) => {
    if (id === 'src' && src) return originStation(src, home, col, p.track).node
    if (id === 'start') {
      return node({
        id, kind: 'card', lane: home, col, title: 'Created', full: `Created by ${by}`, person: by, date: mapDay(created?.at ?? p.createdAt), tone: 'done',
        handoff: src ? `Opened from ${src.trackId}` : p.product ? `${p.product.name} v${p.product.version}` : 'Created', status: 'Done',
      })
    }
    if (id === 'min') {
      const done = !writing && !sentBack
      return node({
        id, kind: 'card', lane: home, col, title: 'Meeting minutes', full: `Meeting minutes · ${doc?.title || '—'}`, person: owner,
        date: done ? mapDay(doc?.completedAt ?? p.linkSentAt) : '', tone: done ? 'done' : sentBack ? 'red' : 'waiting', current: !done,
        tag: back.n ? `returned ×${back.n}` : null, handoff: 'Intake meeting', status: sentBack ? 'Changes requested' : writing ? 'Writing · now here' : 'Done',
      })
    }
    if (id === 'pic') {
      return node({
        id, kind: 'gate', lane: 'appr', col, title: 'approves the minutes', full: `${pics} approves the minutes`, person: pics, icon: '🔗',
        date: picOk ? mapDay(p.picReply?.at) : waiting && p.linkSentAt ? `Since ${mapDay(p.linkSentAt)}` : '',
        tone: picOk ? 'done' : waiting ? 'waiting' : 'draft', current: waiting, future: !picOk && !waiting && !p.linkSentAt, handoff: 'PIC via link',
        status: waiting ? firstIn ?? `Waiting for ${pics}` : picOk ? 'Approved' : skipped && started ? 'Started before approval' : sentBack ? 'Changes requested' : 'Planned',
      })
    }
    if (id === 'work') {
      const n = page.deliverables.filter(d => d.status !== 'cancelled').length
      const whoStarted = workAt?.actor || owner
      return node({
        id, kind: 'card', lane: home, col, title: 'Work started', full: started ? `Work started by ${whoStarted}` : 'Plan assignments', person: started ? whoStarted : owner,
        date: started ? mapDay(workAt?.at) : '', tone: started ? 'done' : ready ? 'waiting' : 'draft', current: ready, future: !started && !ready,
        handoff: 'Plan assignments',
        status: started ? (p.runs ? runsLine(p.runs, p.status === 'paused') : `${n} deliverable${n === 1 ? '' : 's'}`) : ready ? 'Plan assignments · now here' : 'Planned',
      })
    }
    const d = delivs.find(x => dId(x) === id)!
    const st = deliverableState(d, page.team, page.today)
    return node({
      id, kind: 'card', lane: DELIV_LANE, col, title: d.title, full: `${d.trackId} · ${d.title}`, person: d.stage?.owner ? who(d.stage.owner) : '—',
      date: d.status === 'done' ? mapDay(d.doneAt) : d.dueOn ? `Due ${shortDay(d.dueOn)}` : '', tone: st.tone, future: st.tone === 'draft',
      tag: 'Deliverable', handoff: d.workflow ?? 'Deliverable', status: st.label,
    })
  })
  const byId = new Map(nodes.map(n => [n.id, n]))

  // ── The lines: along the road, the PIC's send-backs, one down to each deliverable ─────────────────
  const edges: MapEdge[] = []
  for (let k = 1; k < main.length; k++) {
    const from = main[k - 1]
    const to = main[k]
    const target = byId.get(to)!
    const round = to === 'work' && skipped && !target.future
    edges.push({
      key: flowKey(from, to), from, to, kind: target.future ? 'future' : round ? 'dashed' : 'solid', label: round ? 'started before approval' : null,
      meta: meta.get(flowKey(from, to)) ?? null,
    })
  }
  if (back.n) edges.push({ key: backKey('pic', 'min'), from: 'pic', to: 'min', kind: 'return', label: `returned ×${back.n}`, meta: back.meta })
  for (const d of delivs) {
    edges.push({ key: flowKey('work', dId(d)), from: 'work', to: dId(d), kind: 'solid', label: null, meta: meta.get(flowKey('work', dId(d))) ?? null, drop: true })
  }

  // ── Each station's own panel ───────────────────────────────────────────────────
  const stations: Record<string, Station> = {}
  for (const n of nodes) {
    if (n.id === 'src' && src) {
      stations.src = originStation(src, n.lane, n.col, p.track).station
      continue
    }
    const d = delivs.find(x => dId(x) === n.id)
    if (d) {
      stations[n.id] = {
        facts: [
          ['Track ID', d.trackId], ['Person', n.person], ['Handoff', n.handoff],
          [d.status === 'done' ? 'Completed' : 'Deadline', d.status === 'done' ? mapDay(d.doneAt) || '—' : d.dueOn ? shortDay(d.dueOn) : '—'],
          // Not planned yet: no stage under way.
          ['Stage', d.stage && d.status !== 'planning' ? `${d.stage.idx + 1} of ${d.stages} · ${d.stage.name}` : '—'],
        ],
        files: [], versions: [], audit: [], open: { href: `/marketing/projects/${encodeURIComponent(d.trackId)}`, label: `Open ${d.trackId}` },
      }
      continue
    }
    const when = n.id === 'pic' ? ['Sent', mapDay(p.linkSentAt) || '—'] : [n.status === 'Done' ? 'Completed' : 'Deadline', n.status === 'Done' ? n.date || '—' : '—']
    const approval = n.id === 'pic' ? '🔗 PIC approves via link' : n.id === 'min' ? (picSigns ? `🔗 ${pics}` : '— No PIC sign-off') : '—'
    stations[n.id] = {
      facts: [['Track ID', p.track], ['Person', n.person], ['Handoff', n.handoff], when as [string, string], ['Approval', approval]],
      files: [], versions: [], audit: own.get(n.id) ?? [],
    }
  }

  const lanes: MapLane[] = [
    ...(picSigns ? [{ id: 'appr', name: 'Approvals', emoji: '🛡️', tone: 'appr' as const }] : []),
    { id: home, name: groupLabel(home === '—' ? '' : home), emoji: groupEmoji(home === '—' ? '' : home), tone: groupTone(home === '—' ? '' : home) },
    ...(delivs.length ? [{ id: DELIV_LANE, name: 'Deliverables', emoji: '📦', tone: groupTone('') }] : []),
  ]
  return { lanes, nodes, edges, steps, stations }
}
