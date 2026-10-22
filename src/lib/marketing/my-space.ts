// My Space's task tiles (`My Space.dc.html` → `My Space Bento.dc.html`, the handoff's hm-store.js): what is on the
// viewer's plate, in three columns — My turn ("It's on you — red first"), Delegated by me (subtasks out with others,
// back to them for Review delivery) and Waiting on others (submitted, waiting for an approval) — and This week, the
// dates among them. The stage machine is the store's: a stage opens `todo` for its owner, who Accepts it, works,
// Submits it (`review`, through its approvers in turn — a person in the portal or the PIC through the link) or
// Completes it; an approver Approves or Requests changes (`changes`, back to the owner).
//
// Red is what is late: a stage, subtask or approval past its due date, and changes asked for. Pure: the page draws
// what this returns.

import {
  addDays, approverNow, daysBetween, indexBoard, runsStages, shortDay, weekdayOf, type MktBoard, type MktDept, type MktStage,
  type MktSub,
} from './board'

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
  /** Just put on the viewer's plate: a stage to Accept. */
  isNew: boolean
  dept: MktDept
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

export function plateColumns(board: MktBoard, me: string | null = board.me): PlateColumn[] {
  const turn: PlateCard[] = []
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
        dept: s.dept,
        ...extra,
      })
      const overdue = late(s.dueOn, today)
      const owner = s.owner === me
      const appr = approverNow(s)

      if (owner && s.status === 'todo') {
        turn.push(base({ key: `${p.id}:${s.idx}:todo`, tone: overdue ? 'red' : 'waiting', label: overdue ?? 'New · just assigned', action: 'accept', isNew: !overdue }))
      } else if (owner && s.status === 'accepted') {
        turn.push(base({ key: `${p.id}:${s.idx}:accepted`, tone: overdue ? 'red' : 'waiting', label: overdue ?? 'In progress', action: 'open' }))
      } else if (owner && s.status === 'changes') {
        turn.push(base({ key: `${p.id}:${s.idx}:changes`, tone: 'red', label: `Changes requested · ${s.changes?.by || 'approver'}`, action: 'open' }))
      }
      if (s.status === 'review' && appr?.kind === 'person' && appr.staff === me) {
        turn.push(base({ key: `${p.id}:${s.idx}:approve`, tone: overdue ? 'red' : 'waiting', label: overdue ? `${overdue} · Waiting for your approval` : 'Waiting for your approval', action: 'open' }))
      } else if (owner && s.status === 'review' && appr) {
        const who = appr.kind === 'pic' ? 'PIC' : first(appr.staff)
        const since = s.submittedAt && today ? Math.max(0, daysBetween(s.submittedAt.slice(0, 10), today)) : 0
        const words = appr.kind === 'pic' ? `Waiting for PIC · ${plural(Math.max(since, 0), 'day')}` : `Waiting for ${who}`
        waiting.push(base({
          key: `${p.id}:${s.idx}:waiting`, tone: overdue ? 'red' : 'waiting', label: overdue ? `Overdue · ${words}` : words, action: 'open',
          nowWith: appr.kind === 'pic' ? (p.pic ? `${p.pic} (PIC)` : 'PIC') : who,
        }))
      }

      // The current stage's subtasks: the viewer's own to do, or theirs out with others.
      if (s.status !== 'accepted' && s.status !== 'changes') continue
      for (const t of ix.subtasksOf(p.id, s.idx)) {
        const tLate = t.status === 'approved' ? null : late(t.dueOn, today)
        const sub = (extra: Partial<PlateCard> & Pick<PlateCard, 'key' | 'tone' | 'label' | 'action'>) =>
          base({ title: t.title, parent: p.title, stage: null, due: t.dueOn, ...extra })
        if (t.assignee === me && !owner && (t.status === 'working' || t.status === 'revising')) {
          const words = t.status === 'revising' ? `Revising · returned ${plural(t.returns, 'time')}` : 'In progress'
          turn.push(sub({ key: `sub:${t.id}`, tone: tLate ? 'red' : 'waiting', label: tLate ?? words, action: 'open', nowWith: null }))
        } else if (t.assignee === me && !owner && t.status === 'ready') {
          waiting.push(sub({ key: `sub:${t.id}`, tone: 'waiting', label: `Waiting for ${first(s.owner)} to review`, action: 'open', nowWith: first(s.owner) }))
        } else if (owner && t.assignee !== me && t.status !== 'approved') {
          const who = first(t.assignee)
          const words = t.status === 'ready' ? 'Ready' : t.status === 'revising' ? 'Revising' : t.dueOn ? `In progress · due ${shortDay(t.dueOn)}` : 'In progress'
          delegated.push(sub({
            key: `sub:${t.id}`, tone: tLate && t.status !== 'ready' ? 'red' : 'waiting', label: tLate && t.status !== 'ready' ? tLate : words,
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
    column('turn', '👉', 'My turn', turn),
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

/** "you have 2 things on your plate" / "your plate is clear" — the greeting's second half. */
export function plateLine(turn: number): string {
  return turn > 0 ? `you have ${plural(turn, 'thing')} on your plate` : 'your plate is clear'
}

/** The project a card opens. */
export function cardHref(c: Pick<PlateCard, 'trackId'>): string {
  return `/marketing/projects?q=${encodeURIComponent(c.trackId)}`
}
