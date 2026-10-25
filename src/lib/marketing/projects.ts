// Projects (the sidebar's 📁 — the handoff leaves its list undrawn: "designed in a later module"): every project,
// Quick Task and recurring run on the board, in the Calendar's look — what it is, whose it is now and where it
// stands. Open ones first, the latest change first; a subsidiary's own when its row in the sidebar is picked; a Track
// ID or words typed in the search. Pure.

import {
  approverNow, daysBetween, indexBoard, isSeries, shortDay, type MktBoard, type MktProject, type MktProjectKind, type MktSub,
} from './board'

export type ProjectTone = 'red' | 'waiting' | 'done' | 'draft'
export type ProjectScope = 'open' | 'done' | 'all'

export interface ProjectRow {
  id: string
  trackId: string
  kind: MktProjectKind
  kindLabel: string
  title: string
  sub: MktSub | null
  /** "Stage 2/5 · Design", or what comes before the stages. */
  stage: string
  who: string
  due: string | null
  dueLabel: string
  tone: ProjectTone
  label: string
  open: boolean
  updatedAt: string
}

const KIND_LABEL: Record<MktProjectKind, string> = { product: 'Project', quick: 'Quick Task', recurring: 'Recurring', deliverable: 'Deliverable' }

export function projectRows(board: MktBoard): ProjectRow[] {
  const ix = indexBoard(board)
  const first = (id: string | null | undefined) => ix.person(id)?.first || ix.person(id)?.full || '—'
  return board.projects
    .filter(p => !(isSeries(p) && board.projects.some(x => x.series === p.id && x.status !== 'done' && x.status !== 'cancelled')))
    .map(p => row(p))
    .sort((a, b) => Number(b.open) - Number(a.open) || b.updatedAt.localeCompare(a.updatedAt))

  function row(p: MktProject): ProjectRow {
    const stages = ix.stagesOf(p.id)
    const s = stages.find(x => x.idx === p.cur) ?? null
    const open = !['done', 'cancelled'].includes(p.status)
    const due = p.status === 'active' && s ? s.dueOn : p.dueOn
    const late = !!(open && due && board.today && daysBetween(due, board.today) > 0)
    let tone: ProjectTone = 'waiting'
    let label = ''
    let who = first(p.owner)
    switch (p.status) {
      case 'minutes': tone = 'draft'; label = 'Minutes'; break
      case 'waiting_pic': tone = 'waiting'; label = 'Waiting for PIC'; who = p.pic ? `${p.pic} (PIC)` : 'PIC'; break
      case 'changes': tone = 'red'; label = 'PIC asked for changes'; break
      case 'approved': tone = 'waiting'; label = 'Approved · plan next'; break
      case 'paused': tone = 'draft'; label = 'Paused'; break
      case 'done': tone = 'done'; label = 'Done'; break
      case 'cancelled': tone = 'draft'; label = 'Cancelled'; break
      case 'active': {
        if (isSeries(p)) {
          tone = 'draft'; label = p.recur?.status === 'paused' ? 'Paused' : 'Next run scheduled'
          break
        }
        if (!s) { label = 'In progress'; break }
        who = first(s.owner)
        const appr = approverNow(s)
        if (s.status === 'todo') label = 'Not accepted yet'
        else if (s.status === 'accepted') label = 'In progress'
        else if (s.status === 'changes') { tone = 'red'; label = 'Changes requested' }
        else if (s.status === 'review' && appr) {
          label = appr.kind === 'pic' ? 'Waiting for PIC' : `Waiting for ${first(appr.staff)}`
          who = appr.kind === 'pic' ? (p.pic ? `${p.pic} (PIC)` : 'PIC') : first(appr.staff)
        } else label = 'In progress'
        break
      }
    }
    // A campaign running (the user's answer 13): Live — once its work started, while it runs.
    if (p.campaign && (p.status === 'active' || p.status === 'done') && board.today >= p.campaign.from && board.today <= p.campaign.until) {
      if (tone !== 'red') tone = 'waiting'
      label = tone === 'red' ? label : 'Live'
    }
    if (late && tone !== 'done') {
      tone = 'red'
      label = `Overdue · ${label}`
    }
    const stage = p.status === 'active' && s && !isSeries(p)
      ? `Stage ${s.idx + 1}/${stages.length} · ${s.name}`
      : p.status === 'minutes' || p.status === 'waiting_pic' || p.status === 'changes' || p.status === 'approved'
        // A task whose minutes the PIC approves waits before its first stage (②a-4).
        ? p.kind === 'product' ? 'Before the plan' : 'Before stage 1'
        : stages.length ? `${stages.length} stages` : '—'
    return {
      id: p.id,
      trackId: p.trackId,
      kind: p.kind,
      kindLabel: KIND_LABEL[p.kind],
      title: p.title,
      sub: ix.sub(p.sub) ?? null,
      stage,
      who,
      due,
      dueLabel: due ? shortDay(due) : '—',
      tone,
      label,
      open,
      updatedAt: p.updatedAt,
    }
  }
}

export interface ProjectFilter {
  scope: ProjectScope
  /** A subsidiary's code (the sidebar's ?sub=). */
  sub: string | null
  q: string
}

export function filterProjects(rows: ProjectRow[], f: ProjectFilter): ProjectRow[] {
  const q = f.q.trim().toLowerCase()
  return rows.filter(r =>
    (f.scope === 'all' || (f.scope === 'open' ? r.open : !r.open)) &&
    (!f.sub || r.sub?.code === f.sub) &&
    (!q || r.trackId.toLowerCase().includes(q) || r.title.toLowerCase().includes(q)))
}

export interface StageRow {
  idx: number
  name: string
  owner: string
  approval: string
  due: string
  tone: ProjectTone
  label: string
  current: boolean
}

/** A project's stages as its page lists them: who does it, who approves it, its date, where it stands. */
export function stageRows(board: MktBoard, projectId: string): StageRow[] {
  const ix = indexBoard(board)
  const p = board.projects.find(x => x.id === projectId)
  if (!p) return []
  const first = (id: string | null | undefined) => ix.person(id)?.first || ix.person(id)?.full || '—'
  return ix.stagesOf(p.id).map(s => {
    const current = p.status === 'active' && s.idx === p.cur
    const late = !!(current && s.dueOn && board.today && s.dueOn < board.today && s.status !== 'done')
    const appr = approverNow(s)
    const label =
      s.status === 'done' ? 'Done' :
      s.status === 'planned' ? 'Not started' :
      s.status === 'todo' ? 'Not accepted yet' :
      s.status === 'accepted' ? 'In progress' :
      s.status === 'changes' ? 'Changes requested' :
      appr?.kind === 'pic' ? 'Waiting for PIC' : appr ? `Waiting for ${first(appr.staff)}` : 'In review'
    const tone: ProjectTone = s.status === 'done' ? 'done' : s.status === 'planned' ? 'draft' : late || s.status === 'changes' ? 'red' : 'waiting'
    return {
      idx: s.idx,
      name: s.name,
      owner: s.owner ? first(s.owner) : 'Not assigned yet',
      approval: s.appr.length ? s.appr.map(a => (a.kind === 'pic' ? `PIC${p.pic ? ` · ${p.pic}` : ''}` : first(a.staff))).join(' → ') : '— no approval',
      due: s.dueOn ? shortDay(s.dueOn) : '—',
      tone,
      label: late ? `Overdue · ${label}` : label,
      current,
    }
  })
}

/** A Track ID asked for in full opens on every project — done ones too. */
export function scopeFor(q: string): ProjectScope {
  return /^(MKT|TSK|RCR)-/i.test(q.trim()) ? 'all' : 'open'
}
