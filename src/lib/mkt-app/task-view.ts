// The Marketing app's task page (2026-11-28, `Marketing App iOS + Android.dc.html` › the task page): the Track ID and
// its status, the title, four facts, ONE banner for whoever is looking, the workflow strip, the stage's fields — the
// doer's to fill in before submit, read-only to everybody else — and the sticky bar's steps. Every rule is the desktop
// task page's own (lib/marketing/flow.ts, task-flow-page.ts, task-flow-view.ts, task.ts); this only says it in the
// phone's places. Pure.

import { actorsNow, bannerOf, levelIds, type BannerKind } from '@/lib/marketing/flow'
import { choiceOptions, type OptionLists } from '@/lib/marketing/options'
import { subtaskView, type MktTaskPage, type SubtaskRow } from '@/lib/marketing/task'
import { flowFromPage } from '@/lib/marketing/task-flow-page'
import {
  bannerView, fieldDisplay, flowStages, focusSections, headerView, mayFill, missingOf, modalPeople, personName, stripView, tableNote,
  type FlowTask, type FlowValue, type Missing,
} from '@/lib/marketing/task-flow-view'
import type { AppMay, Tone } from './model'

export type BannerTone = 'me' | 'wait' | 'late' | 'calm' | 'done'

export interface FieldView {
  /** `{stage}:{label}` — the flow's own id. */
  id: string
  label: string
  type: string
  req: boolean
  /** The doer's, before submit: an input; everybody else reads it. */
  edit: boolean
  value: FlowValue
  /** A Select's / Multi-select's choices (its own, or a shared list's). */
  options: string[]
  display: string
  filled: boolean
}

export interface StripView {
  idx: number
  mark: string
  name: string
  who: string
  state: 'done' | 'cur' | 'late' | 'later'
}

export interface TaskScreenView {
  projectId: string
  trackId: string
  title: string
  status: { label: string; tone: Tone }
  facts: { k: string; v: string; red: boolean }[]
  banner: { icon: string; title: string; text: string; tone: BannerTone }
  kind: BannerKind
  stripHead: string
  strip: StripView[]
  stage: string | null
  fields: FieldView[]
  fill: { text: string; done: boolean } | null
  /** The doer, working it: the box's orange edge. */
  mine: boolean
  /** Submit for approval / Complete stage — the doer's, with Marketing · Edit. */
  submit: string | null
  /** Request changes + Approve — whoever the level now waits for. */
  decide: boolean
  /** A delivery the stage's owner reviews (a subtask out with somebody, Ready). */
  delivery: SubtaskRow | null
  /** 🔔 Nudge {name} — a manager, on a task that waits on somebody else. */
  nudge: string | null
  nextLine: string
  /** The current stage's doer (first name) and its first level's approvers — who a step's toast says is told. */
  doer: string
  approvers: string[]
  /** The 🔓 handoff: who may take the next stage, when the doer picks at Submit. */
  pick: { stage: string; people: { id: string; name: string; role: string }[] } | null
  done: boolean
}

const STATUS_TONE: Record<'ok' | 'wait' | 'red' | 'done', Tone> = { ok: 'done', wait: 'wait', red: 'red', done: 'done' }

/** The task with the doer's typed values laid over what was saved, as the desktop page lays them (TaskPage › shown). */
export function withTyped(task: FlowTask, typed: Readonly<Record<string, FlowValue>>): FlowTask {
  return Object.keys(typed).length ? { ...task, values: { ...task.values, ...typed } } : task
}

const firstOf = (name: string) => name.split(/\s+/)[0] || name

export function taskScreenView(
  page: MktTaskPage,
  may: AppMay,
  now: Date,
  typed: Readonly<Record<string, FlowValue>> = {},
  lists: OptionLists = {},
): TaskScreenView {
  const me = page.me
  const task = withTyped(flowFromPage(page), typed)
  const stages = flowStages(task)
  const at = task.at
  const n = task.stages.length
  const cur = task.stages[at.cur]
  const head = headerView(task, now)
  const missing: Missing[] = missingOf(task)
  const kind = n ? bannerOf(stages, at, me, may.manage) : 'none'
  const bv = n ? bannerView(task, me, may.manage, now, missing.length) : null
  const actors = n && !at.done ? actorsNow(stages, at) : []
  const nameOf = (id: string | null | undefined) => personName(task, id)

  // The delivery the stage's owner reviews: a subtask out with somebody, back Ready (the Delegated card's Review).
  const subs = subtaskView(page, { edit: may.edit, approve: may.decide, manage: may.manage })
  const delivery = subs?.rows.find(r => r.canReview) ?? null

  // ── The banner ──
  const pageStage = page.stages[at.cur]
  let banner: TaskScreenView['banner']
  if (delivery) {
    banner = { icon: '📥', title: `${firstOf(delivery.who)} delivered`, text: 'Review the delivery, or send it back.', tone: 'wait' }
  } else if (kind === 'doer' && pageStage?.status === 'changes' && pageStage.changes) {
    // The doer after a rejection: the approver's own words, quoted (the desktop flow's banner says only "Your turn").
    banner = { icon: '↩️', title: `${pageStage.changes.by || 'The approver'} asked for changes`, text: `“${pageStage.changes.reason}”`, tone: 'late' }
  } else if (bv) {
    const tone: BannerTone = bv.tone === 'done' ? 'done' : bv.tone === 'late' ? 'late' : kind === 'doer' ? 'me' : kind === 'approver' ? 'wait' : 'calm'
    banner = { icon: bv.icon, title: bv.title, text: bv.text, tone }
  } else {
    banner = { icon: '👀', title: 'Nothing to do here', text: 'This task has no stages yet.', tone: 'calm' }
  }

  // ── The strip ──
  const strip: StripView[] = n
    ? stripView(task, me, at.cur, now).map(c => ({
      // The viewer's own stages say *You* (the handoff's strip); everybody else's, their name.
      idx: c.idx, mark: c.mark, name: c.name, who: me && task.stages[c.idx]?.doer === me ? 'You' : c.who,
      state: c.state === 'done' ? 'done' : c.state === 'cur' ? (c.late ? 'late' : 'cur') : 'later',
    }))
    : []
  const doneCount = at.done ? n : at.cur

  // ── The stage's fields: the current stage's sections, flat ──
  const mine = kind === 'doer' && may.edit && !at.done
  const sections = n ? focusSections(task, at.cur) : []
  const fields: FieldView[] = sections.flatMap(sec => sec.fields).map(f => {
    const form = f.stage != null ? page.stages[f.stage]?.form.find(x => x.label === f.label) : undefined
    const value: FlowValue = task.values[f.id] ?? (f.type === 'Multi-select' ? [] : f.type === 'Checkbox' ? false : '')
    const shown = f.type === 'Table' ? { text: tableNote(task, f, mine), filled: (task.rows[f.id] ?? []).length > 0 } : fieldDisplay(task, f)
    return {
      id: f.id,
      label: f.label,
      type: f.type,
      req: f.req && f.type !== 'Note',
      edit: mine && mayFill(task, me, f.stage) && f.type !== 'Note' && f.type !== 'Table',
      value,
      options: form && (f.type === 'Select' || f.type === 'Multi-select') ? choiceOptions(form, lists, value) : [],
      display: shown.text,
      filled: shown.filled,
    }
  })
  // What this stage must fill in before it is submitted (missingOf's own reckoning): its required fields, and its
  // required table columns (a checkbox column never is).
  const required = sections.flatMap(sec => sec.fields).reduce((t, f) => {
    if (f.type === 'Table') return t + f.cols.filter(c => c.stage === at.cur && c.req && c.type !== 'Checkbox').length
    return t + (f.stage === at.cur && f.req && f.type !== 'Note' ? 1 : 0)
  }, 0)
  const fill = required > 0
    ? missing.length ? { text: `${Math.max(0, required - missing.length)} of ${required} filled`, done: false } : { text: 'All filled', done: true }
    : null

  // ── The bar ──
  const submit = mine && !delivery ? (cur && cur.levels.some(l => levelIds(l).length) ? 'Submit for approval' : 'Complete stage') : null
  const decide = kind === 'approver' && may.decide && !at.done
  const waitsOn = actors.find(id => id !== me) ?? null
  const nudge = kind === 'mm' && may.manage && waitsOn ? firstOf(nameOf(waitsOn)) : null
  const next = task.stages[at.cur + 1] ?? null
  const approvers = cur?.levels[0] ? levelIds(cur.levels[0]).map(id => firstOf(nameOf(id))) : []
  let nextLine = ''
  if (delivery) nextLine = `${firstOf(delivery.who)} is told either way`
  else if (submit && cur) {
    nextLine = approvers.length
      ? `Next up: ${approvers.join(' or ')} approves · told when you submit`
      : next ? `Next up: ${next.doer ? firstOf(nameOf(next.doer)) : 'you pick who'} · ${next.name}` : 'Last stage — this finishes the task'
  } else if (decide && cur) nextLine = `${firstOf(nameOf(cur.doer))} is told either way`
  else if (nudge) nextLine = 'At most one nudge an hour per person and task'

  const pick = submit && next && !next.doer && next.cands.length
    ? { stage: next.name, people: modalPeople(task, at.cur + 1, 'pick').map(p => ({ id: p.id, name: p.name, role: p.role })) }
    : null

  const youIn = !!me && actors.includes(me)
  const facts = [
    { k: 'Now with', v: at.done ? '—' : youIn ? `${firstOf(nameOf(me))} (you)` : head.nowWith.name, red: false },
    { k: 'Subsidiary', v: page.sub?.name ?? '—', red: false },
    { k: 'Stage due', v: head.stageDue, red: head.stageDueRed },
    { k: 'Stage', v: n ? `${at.done ? n : at.cur + 1} of ${n}` : '—', red: false },
  ]

  return {
    projectId: page.project.id,
    trackId: page.project.trackId,
    title: page.project.title,
    status: { label: head.status.label, tone: STATUS_TONE[head.status.tone] },
    facts,
    banner,
    kind,
    stripHead: `Workflow · ${doneCount} of ${n} done`,
    strip,
    stage: cur?.name ?? null,
    fields,
    fill,
    mine,
    submit,
    decide,
    delivery,
    nudge,
    nextLine,
    doer: cur ? firstOf(nameOf(cur.doer)) : '',
    approvers,
    pick,
    done: at.done,
  }
}

/** The fields still empty, as the toast names them ("Fill in Caption, Post date"). */
export function missingWords(page: MktTaskPage, typed: Readonly<Record<string, FlowValue>>): { ids: string[]; text: string } | null {
  const miss = missingOf(withTyped(flowFromPage(page), typed))
  if (!miss.length) return null
  return { ids: miss.map(m => m.id.split(':').slice(0, 2).join(':')), text: `Fill in ${miss.map(m => m.label).join(', ')}` }
}

/** A field's value as `saveMktWork` takes it: words, a tick, picks — an emptied one as null (only what changed is sent). */
export function workValue(v: FlowValue): string | boolean | string[] | null {
  if (Array.isArray(v)) return v.length ? v : null
  if (typeof v === 'boolean') return v
  return v.trim() ? v : null
}

/** The label a field is saved by (`{stage}:{label}` → label). */
export const labelOf = (fieldId: string) => fieldId.slice(fieldId.indexOf(':') + 1)
