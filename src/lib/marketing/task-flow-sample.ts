// The Builder's ▶ Preview (Workflow Builder 2a handoff › Interactions: "the ▶ Preview tab shows the Task page built from
// the current draft, without publishing"): a SAMPLE task made from the draft the manager is editing — half its stages
// done, the people on it from Marketing's roster — and each decision played on it with flow.ts's `step`, exactly as the
// database decides. Nothing is saved. Pure. Nothing is made up either (the user, 2026-11-13): its title is the
// template's own name, its Track ID a placeholder, every field and table empty — no client, no brief, no answers.

import { officeTime } from '@/lib/office-time'
import { addDays } from './board'
import {
  ASSIGN_ID, addWorkDays, defaultFinish, dueAt, finishFromRow, isWorkDay, levelFromRow, overdueFromRow, step,
  type ApprLevel, type FlowAt,
} from './flow'
import type { FlowCol, FlowField, FlowLog, FlowPerson, FlowRow, FlowSection, FlowStageIn, FlowTask, FlowValue } from './task-flow-view'
import { personName } from './task-flow-view'

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const HOUR = 36e5

/** The draft as the Builder holds it (the build contract's shapes — read loosely, so a half-typed draft still draws). */
export interface PreviewDraft {
  category?: string
  tname?: string
  version?: number
  promise?: number | null
  overdue?: unknown
  finish?: unknown
  stages: unknown[]
  canvas?: unknown
}

/** n working days before `day`. */
function backWorkDays(day: string, n: number): string {
  let d = day
  for (let left = n; left > 0; ) {
    d = addDays(d, -1)
    if (isWorkDay(d)) left -= 1
  }
  return d
}


/** The sample task the Preview opens on. `people` is Marketing's roster (the manager first is not needed). */
export function sampleTask(draft: PreviewDraft, people: readonly FlowPerson[], now: Date): FlowTask {
  const raw = draft.stages.filter(isObj)
  const n = raw.length
  const cur = n <= 1 ? 0 : Math.min(n - 1, Math.ceil(n / 2))
  const roster = people.length ? people : [{ id: 'sample-1', name: 'Team member', role: '', load: 0 }]
  const managers = roster.filter(p => /MANAGER|DIRECTOR|\bMM\b|\bAMM\b/i.test(p.role))
  const staff = roster.filter(p => !managers.includes(p))
  const pickStaff = (i: number) => (staff.length ? staff : roster)[i % (staff.length || roster.length)].id
  // 'Picked at assignment': the second manager when there is one (the first approves elsewhere), as a manager would.
  const assignee = (managers[1] ?? managers[0] ?? roster[0]).id
  const sids = raw.map((s, i) => str(s.sid) || str(s.key) || `s${i}`)

  const today = officeTime(now).format('YYYY-MM-DD')
  const doneDays = raw.slice(0, cur).reduce((a, s) => a + Math.max(1, Number(s.sla) || 1), 0)
  const startOn = backWorkDays(today, Math.max(0, doneDays))
  let day = startOn
  let enteredAt = `${startOn}T09:00:00+08:00`
  const stages: FlowStageIn[] = raw.map((s, i) => {
    const who = isObj(s.who) ? s.who : {}
    const prev = who.mode === 'prev'
    const cands = arr(who.cands).filter((c): c is string => typeof c === 'string')
    const levels: ApprLevel[] = arr(s.appr).map(levelFromRow).filter((l): l is ApprLevel => !!l && l.ids.length > 0)
      .map(l => ({ ...l, ids: [...new Set(l.ids.map(id => (id === ASSIGN_ID ? assignee : id)))] }))
    const sla = Math.max(1, Math.trunc(Number(s.sla)) || 1)
    const st: FlowStageIn = {
      name: str(s.name) || 'Untitled stage', sla, doer: prev ? null : pickStaff(i), cands, levels,
      back: typeof s.back === 'number' ? s.back : null, picText: str(s.picText) || `The team is working on ${(str(s.name) || 'it').toLowerCase()}`,
      enteredAt: null, dueOn: null, doneAt: null,
    }
    if (i <= cur) {
      if (!st.doer) st.doer = cands[0] ?? pickStaff(i)
      st.enteredAt = enteredAt
      st.dueOn = addWorkDays(day, sla)
      day = st.dueOn
    }
    if (i < cur && st.dueOn) {
      st.doneAt = new Date(dueAt(st.dueOn).getTime() - 6.5 * HOUR).toISOString()
      enteredAt = st.doneAt
    }
    return st
  })

  // The canvas: its sections and fields, each by the stage that fills it in (by sid → index).
  const at = (sid: unknown) => (typeof sid === 'string' && sids.includes(sid) ? sids.indexOf(sid) : null)
  const canvas = isObj(draft.canvas) ? draft.canvas : {}
  let sections: FlowSection[] = arr(canvas.sections).filter(isObj).map((sec, k) => {
    const secStage = at(sec.stage)
    return {
      id: str(sec.id) || `sec${k}`, emoji: str(sec.emoji) || '🎯', title: str(sec.title) || (secStage !== null ? stages[secStage].name : 'Section'),
      stage: secStage, req: sec.req === true, pic: sec.pic !== false,
      fields: arr(sec.fields).filter(isObj).map((f, j): FlowField => {
        const fStage = f.stage === undefined ? secStage : at(f.stage) ?? secStage
        return {
          id: str(f.id) || `${k}-${j}`, label: str(f.label) || str(f.name) || 'Field', type: str(f.type) || 'Text', stage: fStage,
          req: f.req === true, pic: f.pic !== false && sec.pic !== false,
          cols: arr(f.cols).filter(isObj).map((c, ci): FlowCol => ({
            id: str(c.id) || `c${ci}`, name: str(c.name) || 'Column', type: str(c.type) || 'Text', stage: c.stage === undefined ? fStage : at(c.stage),
            req: c.req === true, pic: c.pic !== false, added: false,
          })),
        }
      }),
    }
  })
  // A draft with no canvas yet: a section per stage, titled by it, with a deliverable to hand in.
  if (!sections.length) {
    sections = stages.map((s, i) => ({
      id: `s${i}`, emoji: '🎯', title: s.name, stage: i, req: true, pic: true,
      fields: [{ id: `s${i}f0`, label: 'Deliverable', type: 'File', stage: i, req: true, pic: true, cols: [] }, { id: `s${i}f1`, label: 'Notes', type: 'Text', stage: i, req: false, pic: false, cols: [] }],
    }))
  }

  // Every field and table starts empty: the Preview shows the layout, not invented answers.
  const values: Record<string, FlowValue> = {}
  const rows: Record<string, FlowRow[]> = Object.fromEntries(sections.flatMap(sec => sec.fields.filter(f => f.type === 'Table').map(f => [f.id, [] as FlowRow[]])))

  const category = draft.category || 'Task'
  const c = stages[cur]
  const prevSt = stages[cur - 1]
  const task: FlowTask = {
    title: draft.tname ? `${category} · ${draft.tname}` : category,
    trackId: 'TSK-····',
    tplChip: `${category} · ${draft.tname || 'Standard'} v${draft.version ?? 1}`,
    category,
    startOn,
    promise: typeof draft.promise === 'number' ? draft.promise : null,
    stages,
    at: { cur, level: -1, ok: {}, done: n === 0 },
    sections,
    values,
    rows,
    overdue: overdueFromRow(draft.overdue),
    finish: draft.finish ? finishFromRow(draft.finish, category) : defaultFinish(category),
    people: [...roster],
    pic: 'Client',
    doneAt: null,
    log: [],
  }
  if (c) {
    task.log = [
      { icon: '🔔', text: `${personName(task, c.doer)} notified: “Your turn — ${c.name}”`, at: prevSt?.doneAt ?? `${startOn}T09:00:00+08:00` },
      ...(prevSt ? [{ icon: '✓', text: `${personName(task, prevSt.doer)} submitted ${prevSt.name}`, at: prevSt.doneAt as string }] : []),
    ]
  }
  return task
}

/** One decision played on the sample (`step` decides where it goes); the stage opened gets its clock and due day,
 * the stage finished its finish; changes clear the stages from the back target on. Returns the task as it now stands. */
export function sampleStep(task: FlowTask, what: 'submit' | 'approve' | 'changes', by: string, now: Date, pick: string | null = null): FlowTask {
  const before = task.at
  const stages = task.stages.map(s => ({ ...s }))
  if (what === 'submit' && pick && stages[before.cur + 1] && !stages[before.cur + 1].doer) stages[before.cur + 1].doer = pick
  const next: FlowAt = step(stages.map((s, i) => ({ doer: s.doer, levels: s.levels, dueOn: s.dueOn, done: i < before.cur, back: s.back })), before, by, what)
  if (next === before) return task
  const iso = now.toISOString()
  const today = officeTime(now).format('YYYY-MM-DD')
  const cur = stages[before.cur]
  const log: FlowLog[] = []
  const name = (id: string | null) => personName(task, id)
  if (what === 'submit') log.push({ icon: '✓', text: `${name(by)} submitted ${cur.name}`, at: iso })
  if (what === 'approve') log.push({ icon: '✓', text: `${name(by)} approved ${cur.name}`, at: iso })
  if (what === 'changes') log.push({ icon: '↩', text: `${name(by)} requested changes on ${cur.name}`, at: iso })
  if (next.done) {
    cur.doneAt = iso
    log.push({ icon: '🎉', text: 'Task done · everyone on the task notified', at: iso })
  } else if (next.cur !== before.cur || (what === 'changes')) {
    if (what !== 'changes') cur.doneAt = iso
    for (let i = next.cur + 1; i <= before.cur && what === 'changes'; i += 1) {
      stages[i] = { ...stages[i], enteredAt: null, dueOn: null, doneAt: null }
    }
    const open = stages[next.cur]
    open.enteredAt = iso
    open.dueOn = addWorkDays(today, open.sla)
    open.doneAt = null
    log.push({ icon: '🔔', text: `${name(open.doer)} notified: “${what === 'changes' ? `Changes requested — back to ${open.name}` : `Your turn — ${open.name}`}”`, at: iso })
  } else if (next.level !== before.level) {
    const lv = cur.levels[next.level]
    if (lv) log.push({ icon: '🔔', text: `${lv.ids.map(name).join(' & ')} notified: “Please approve ${cur.name}”`, at: iso })
  }
  return { ...task, stages, at: next, doneAt: next.done ? iso : null, log: [...log.reverse(), ...task.log] }
}

