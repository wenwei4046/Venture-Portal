// My Space's task tiles (`My Space.dc.html` → `My Space Bento.dc.html`, the handoff's hm-store.js): what is on the
// viewer's plate, in three columns — My turn ("It's on you — red first"), Delegated by me (subtasks out with others,
// back to them for Review delivery) and Waiting on others (submitted, waiting for an approval) — and This week, the
// dates among them. The stage machine is the store's: a stage opens `todo` for its owner, who Accepts it, works,
// Submits it (`review`, through its approvers in turn — a person in the portal or the PIC through the link) or
// Completes it; an approver Approves or Requests changes (`changes`, back to the owner).
//
// Red is what is late: a stage, subtask or approval past its due date (18:00 office time), changes asked for. No Accept
// since the Workflow Builder 2a (2026-11-13 — the user's decision 5): a stage is its doer's as soon as it opens, and the
// 4-working-hours red is gone. My turn = the doer now, or anybody the level now still waits for; Waiting = on the task
// (a doer or an approver of any stage) but not their turn — flow.ts › tileOf. Pure: the page draws what this returns.

import {
  addDays, daysBetween, indexBoard, runsStages, shortDay, waitsNow, weekdayOf, type MktBoard, type MktGroup,
  type MktStage,
  type MktSub,
} from './board'
import { actorsNow, lateDays, PIC_ID, tileOf, turnOf, type FlowAt, type FlowStage } from './flow'

export type CardTone = 'red' | 'waiting' | 'done' | 'draft'
export type CardAction = 'accept' | 'open' | 'review' | 'none'
export type ColumnKey = 'turn' | 'delegated' | 'waiting'

export interface PlateCard {
  key: string
  trackId: string
  projectId: string
  title: string
  sub: MktSub | null
  /** The project a subtask belongs to. */
  parent: string | null
  stage: string | null
  due: string | null
  assignee: string | null
  nowWith: string | null
  tone: CardTone
  label: string
  action: CardAction
  /** Just put on the viewer's plate: a stage opened for them within the last day. */
  isNew: boolean
  /** What the card is (Workflow Builder 2a's tiles): the viewer's stage to do, their approval, their subtask, their
   * delivery to review, or a task they are on that is somebody else's turn. */
  kind?: 'doer' | 'approve' | 'subtask' | 'delegated' | 'waiting'
  /** Whole days past due (18:00 office time), 0 when on time. */
  late?: number
  /** The stage's group — a People title. */
  dept: MktGroup
}

export interface PlateColumn {
  key: ColumnKey
  emoji: string
  title: string
  cards: PlateCard[]
  anyRed: boolean
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** "Overdue 1 day" — a due date passed; null while it is not. */
function late(due: string | null, today: string): string | null {
  if (!due || !today) return null
  const d = daysBetween(due, today)
  return d > 0 ? `Overdue ${plural(d, 'day')}` : null
}

/** A running task in the shared rules' terms: its stages (doer, levels, due, done) and where it stands now. */
export function flowOfStages(stages: readonly MktStage[], cur: MktStage): { stages: FlowStage[]; at: FlowAt } {
  return {
    stages: stages.map(x => ({ doer: x.owner, levels: x.levels, dueOn: x.dueOn, done: x.status === 'done' })),
    at: { cur: Math.max(0, stages.indexOf(cur)), level: cur.status === 'review' ? cur.apprIdx : -1, ok: cur.status === 'review' ? cur.apprOk : {}, done: false },
  }
}

const stageText = (s: MktStage, of: number) => `Stage ${s.idx + 1}/${of} · ${s.name}`

/** Red first, then the soonest date, then as they came. */
function inOrder(cards: PlateCard[]): PlateCard[] {
  return cards
    .map((c, i) => ({ c, i }))
    .sort((a, b) =>
      Number(b.c.tone === 'red') - Number(a.c.tone === 'red') ||
      (a.c.due ?? '9999').localeCompare(b.c.due ?? '9999') ||
      a.i - b.i)
    .map(x => x.c)
}

export function plateColumns(board: MktBoard, me: string | null = board.me, now: Date = new Date()): PlateColumn[] {
  const turn_: PlateCard[] = []
  const delegated: PlateCard[] = []
  const waiting: PlateCard[] = []
  if (me) {
    const ix = indexBoard(board)
    const first = (id: string | null | undefined) => ix.person(id)?.first || ix.person(id)?.full || 'someone'
    const today = board.today
    for (const p of board.projects) {
      if (!runsStages(p)) continue
      const stages = ix.stagesOf(p.id)
      const s = stages.find(x => x.idx === p.cur)
      if (!s) continue
      const base = (extra: Partial<PlateCard> & Pick<PlateCard, 'key' | 'tone' | 'label' | 'action'>): PlateCard => ({
        trackId: p.trackId,
        projectId: p.id,
        title: p.title,
        sub: ix.sub(p.sub) ?? null,
        parent: null,
        stage: stageText(s, stages.length),
        due: s.dueOn,
        assignee: null,
        nowWith: null,
        isNew: false,
        kind: 'doer',
        late: 0,
        dept: s.dept,
        ...extra,
      })
      const owner = s.owner === me
      const lateBy = s.dueOn ? lateDays(s.dueOn, now) : 0
      const overdue = lateBy > 0 ? `${lateBy}d overdue` : null
      const fl = flowOfStages(stages, s)
      const turn = turnOf(fl.stages, fl.at, me)
      const tile = tileOf(fl.stages, fl.at, me)
      const nameOf = (id: string) => (id === PIC_ID ? (p.pic ? `${p.pic} (PIC)` : 'PIC') : first(id))
      const withWho = actorsNow(fl.stages, fl.at).map(nameOf).join(', ') || null

      if (turn === 'doer') {
        if (s.status === 'changes') {
          turn_.push(base({ key: `${p.id}:${s.idx}:changes`, kind: 'doer', late: lateBy, tone: 'red', label: `Changes requested · ${s.changes?.by || 'approver'}`, action: 'open' }))
        } else {
          const fresh = !!s.enteredAt && now.getTime() - Date.parse(s.enteredAt) < 864e5 && now.getTime() >= Date.parse(s.enteredAt)
          turn_.push(base({ key: `${p.id}:${s.idx}:doer`, kind: 'doer', late: lateBy, tone: overdue ? 'red' : 'waiting', label: overdue ?? 'Your turn', action: 'open', isNew: !overdue && fresh }))
        }
      } else if (turn === 'approve') {
        turn_.push(base({ key: `${p.id}:${s.idx}:approve`, kind: 'approve', late: lateBy, tone: overdue ? 'red' : 'waiting', label: overdue ? `${overdue} · Needs your approval` : 'Needs your approval', action: 'review' }))
      } else if (tile === 'waiting') {
        const words = s.status === 'review' && waitsNow(s).includes(PIC_ID) && owner
          ? `Waiting for PIC · ${plural(Math.max(0, s.submittedAt && today ? daysBetween(s.submittedAt.slice(0, 10), today) : 0), 'day')}`
          : `${s.name} · with ${withWho ?? 'nobody yet'}`
        waiting.push(base({ key: `${p.id}:${s.idx}:waiting`, kind: 'waiting', late: lateBy, tone: overdue ? 'red' : 'waiting', label: overdue ? `Overdue · ${words}` : words, action: 'open', nowWith: withWho }))
      }

      // The current stage's subtasks: the viewer's own to do, or theirs out with others.
      if (s.status !== 'accepted' && s.status !== 'changes' && s.status !== 'todo') continue
      for (const t of ix.subtasksOf(p.id, s.idx)) {
        const tLate = t.status === 'approved' ? null : late(t.dueOn, today)
        const sub = (extra: Partial<PlateCard> & Pick<PlateCard, 'key' | 'tone' | 'label' | 'action'>) =>
          base({ title: t.title, parent: p.title, stage: null, due: t.dueOn, ...extra })
        if (t.assignee === me && !owner && (t.status === 'working' || t.status === 'revising')) {
          const words = t.status === 'revising' ? `Revising · returned ${plural(t.returns, 'time')}` : 'In progress'
          turn_.push(sub({ key: `sub:${t.id}`, kind: 'subtask', tone: tLate ? 'red' : 'waiting', label: tLate ?? words, action: 'open', nowWith: null }))
        } else if (t.assignee === me && !owner && t.status === 'ready') {
          waiting.push(sub({ key: `sub:${t.id}`, kind: 'waiting', tone: 'waiting', label: `Waiting for ${first(s.owner)} to review`, action: 'open', nowWith: first(s.owner) }))
        } else if (owner && t.assignee !== me && t.status !== 'approved') {
          const who = first(t.assignee)
          const words = t.status === 'ready' ? 'Ready' : t.status === 'revising' ? 'Revising' : t.dueOn ? `In progress · due ${shortDay(t.dueOn)}` : 'In progress'
          delegated.push(sub({
            key: `sub:${t.id}`, kind: 'delegated', tone: tLate && t.status !== 'ready' ? 'red' : 'waiting', label: tLate && t.status !== 'ready' ? tLate : words,
            action: t.status === 'ready' ? 'review' : 'none', assignee: who,
          }))
        }
      }
    }
  }
  const column = (key: ColumnKey, emoji: string, title: string, cards: PlateCard[]): PlateColumn => {
    const ordered = inOrder(cards)
    return { key, emoji, title, cards: ordered, anyRed: ordered.some(c => c.tone === 'red') }
  }
  return [
    column('turn', '👉', 'My turn', turn_),
    column('delegated', '📤', 'Delegated by me', delegated),
    column('waiting', '⏳', 'Waiting on others', waiting),
  ]
}

/** The card's grey line: whose it is for, the stage, the date, who has it. */
export function cardMeta(c: PlateCard): string {
  return [
    c.sub?.name ?? c.parent,
    c.parent && c.sub ? c.parent : null,
    c.stage,
    c.due ? `Due ${shortDay(c.due)}` : null,
    c.assignee ? `with ${c.assignee}` : null,
    c.nowWith ? `with ${c.nowWith}` : null,
  ].filter(Boolean).join(' · ')
}

export interface WeekRow {
  key: string
  when: string
  title: string
  red: boolean
  trackId: string
}

/** This week: the dates on the viewer's plate up to Sunday — late ones too — the soonest five. */
export function weekRows(columns: PlateColumn[], today: string): WeekRow[] {
  if (!today) return []
  const sunday = addDays(today, 6 - weekdayOf(today))
  const seen = new Set<string>()
  return columns
    .flatMap(col => col.cards)
    .filter(c => c.due && c.due <= sunday)
    .filter(c => (seen.has(c.key) ? false : (seen.add(c.key), true)))
    .sort((a, b) => (a.due as string).localeCompare(b.due as string))
    .slice(0, 5)
    .map(c => ({ key: c.key, when: shortDay(c.due as string), title: c.title, red: c.tone === 'red', trackId: c.trackId }))
}

/** What is on a plate, for the pet's mood (`petState`): My turn's cards, those late there and in Waiting, a stage just
 * put on it. */
export function plateOf(columns: PlateColumn[]): { count: number; red: number; fresh: boolean } {
  const turn = columns.find(c => c.key === 'turn')?.cards ?? []
  const waiting = columns.find(c => c.key === 'waiting')?.cards ?? []
  return { count: turn.length, red: [...turn, ...waiting].filter(c => c.tone === 'red').length, fresh: turn.some(c => c.isNew) }
}

/** "you have 2 things on your plate" / "your plate is clear" — the greeting's second half. */
export function plateLine(turn: number): string {
  return turn > 0 ? `you have ${plural(turn, 'thing')} on your plate` : 'your plate is clear'
}

/** The task a card opens: its page, by its Track ID. */
export function cardHref(c: Pick<PlateCard, 'trackId'>): string {
  return `/marketing/projects/${encodeURIComponent(c.trackId)}`
}
