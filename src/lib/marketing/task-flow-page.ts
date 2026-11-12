// A running task (mkt_project, read by task.ts) as the task page's top draws it (`task-flow-view.ts`): its stages'
// levels and where it stands (task.ts › flowOf), its fields grouped into the canvas's sections (each field and table
// column by the stage that fills it in), its tables' rows and the doer's own columns, the template's overdue / finish
// settings, the workflow chip. A quick task (no canvas): a section per stage, titled by it. Pure.

import { runsStages, waitsNow, type MktBoard } from './board'
import { DEFAULT_OVERDUE, defaultFinish } from './flow'
import { eventText, flowOf, type MktTaskPage } from './task'
import { fieldKey, TASK_TYPES, type FormField } from './tasks'
import type { FlowCol, FlowField, FlowLog, FlowPerson, FlowRow, FlowSection, FlowTask, FlowValue } from './task-flow-view'


/** A stage's field's id on the page: its stage and its label (labels are unique on a stage). */
export const fieldId = (stage: number, label: string) => `${stage}:${label}`
export const colId = (j: number) => `c${j}`

/** A table's rows as a stage keeps them in its work: the JSON of its rows (each a list of cells — the template's columns,
 * then the task's own), else the template's preset rows. A checkbox column's cell reads "true" as ticked. */
export function rowsFromValue(f: Pick<FormField, 'cols' | 'rows'>, v: unknown, extra: readonly Pick<FlowCol, 'id' | 'type'>[] = []): FlowRow[] {
  const cols = [...(f.cols ?? []).map((c, j) => ({ id: colId(j), type: c.type as string })), ...extra.map(c => ({ id: c.id, type: c.type }))]
  let rows: unknown[] = []
  let preset = (f.rows ?? []).length
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(v)
      if (Array.isArray(parsed)) rows = parsed
    } catch {
      rows = []
    }
  } else {
    rows = f.rows ?? []
    preset = rows.length
  }
  return rows.filter(Array.isArray).map((r, i) => ({
    id: `r${i}`,
    added: i >= preset,
    cells: Object.fromEntries(cols.map((c, j) => {
      const cell: unknown = (r as unknown[])[j]
      const v2: string | boolean = typeof cell === 'boolean' ? cell : typeof cell === 'string' ? cell : ''
      return [c.id, c.type === 'Checkbox' ? v2 === true || v2 === 'true' : v2]
    })),
  }))
}

/** The rows written back as the stage keeps them: cells by column, a text each (a tick "true"). */
export const rowsToCells = (f: Pick<FlowField, 'cols'>, rows: readonly FlowRow[]): string[][] =>
  rows.map(r => f.cols.map(c => {
    const v = r.cells[c.id]
    return v === true ? 'true' : v === false || v === undefined ? '' : v
  }))
export const rowsToValue = (f: Pick<FlowField, 'cols'>, rows: readonly FlowRow[]) => JSON.stringify(rowsToCells(f, rows))

const ICON: Record<string, string> = {
  submitted: '✓', approved: '✓', completed: '✓', 'pic approved': '✓', changes: '↩', 'pic changes': '↩', reassigned: '⇄',
  nudged: '🔔', created: '✨', opened: '🔔', replaced: '⇄', done: '🎉', overdue: '⏰',
}

export interface FlowPageOpts {
  /** Tasks each person has open now (the board's), for the reassign modal. */
  loads?: Record<string, number>
}

export function flowFromPage(page: MktTaskPage, opts: FlowPageOpts = {}): FlowTask {
  const p = page.project
  const typeLabel = TASK_TYPES.find(t => t.key === p.qType)?.label
  const category = p.wf?.category || p.deliv?.item || typeLabel || 'Task'
  const { at } = flowOf(page)
  const sidIdx = new Map(page.stages.flatMap((s, i) => (s.sid ? [[s.sid, i] as const] : [])))
  const idxOf = (sid: string | null | undefined, fallback: number | null) => (sid === undefined ? fallback : sid === null ? null : sidIdx.get(sid) ?? fallback)

  const stages = page.stages.map(s => ({
    name: s.name,
    sla: s.sla,
    doer: s.owner,
    cands: s.cands,
    levels: s.levels,
    back: s.back,
    picText: s.picText ?? '',
    enteredAt: s.enteredAt,
    dueOn: s.dueOn,
    doneAt: s.doneAt,
  }))

  // The canvas's sections (titles, emoji, the stage that fills them in), then each stage's own for fields none holds.
  const canvas: FlowSection[] = p.sections.map(sec => ({ id: sec.id, emoji: sec.emoji || '🎯', title: sec.title, stage: idxOf(sec.stage, null), req: false, pic: true, fields: [] }))
  const own: FlowSection[] = []
  const values: Record<string, FlowValue> = {}
  const rows: Record<string, FlowRow[]> = {}
  page.stages.forEach((s, i) => {
    for (const f of s.form) {
      const id = fieldId(i, f.label)
      const extra: FlowCol[] = (p.extraCols[fieldKey(f)] ?? p.extraCols[f.label] ?? [])
        .map(c => ({ id: c.id, name: c.name, type: c.type, stage: c.stage ?? i, req: false, pic: false, added: true }))
      const cols: FlowCol[] = [
        ...(f.cols ?? []).map((c, j) => ({ id: colId(j), name: c.name, type: c.type, stage: idxOf(c.stage, i), req: c.req === true, pic: c.pic !== false, added: false })),
        ...extra,
      ]
      const field: FlowField = { id, label: f.label, type: f.type, stage: i, req: f.type !== 'Note' && f.req !== false, pic: f.pic !== false, cols }
      const v = s.work.vals[f.label]
      if (f.type === 'Table') rows[id] = rowsFromValue(f, v, extra)
      else if (v !== undefined) values[id] = v
      // Its section: the canvas section it names (by id — older ones by title); none named, its stage's own (the
      // canvas's section of that stage, else one titled by the stage).
      const home = (f.section ? canvas.find(x => x.id === f.section || x.title === f.section) : undefined)
        ?? (f.section ? undefined : canvas.find(x => x.stage === i))
      if (home) {
        home.fields.push(field)
        continue
      }
      const title = f.sectionTitle || f.section
      let sec = own.find(x => (f.section ? x.id === `n:${f.section}` : x.stage === i && x.id === `s${i}`))
      if (!sec) {
        sec = f.section
          ? { id: `n:${f.section}`, emoji: '📄', title: title ?? '', stage: null, req: false, pic: true, fields: [] }
          : { id: `s${i}`, emoji: '🎯', title: s.name, stage: i, req: true, pic: true, fields: [] }
        own.push(sec)
      }
      sec.fields.push(field)
    }
  })
  const sections = [...canvas.filter(x => x.fields.length), ...own]
  for (const sec of sections) sec.req = sec.fields.some(f => f.req)

  const people: FlowPerson[] = page.team.map(t => ({ id: t.id, name: t.first || t.full, role: t.title ?? t.role ?? '', load: opts.loads?.[t.id] ?? 0 }))
  const log: FlowLog[] = page.events
    .filter(e => e.action !== 'free')
    .map(e => ({ icon: ICON[e.action] ?? '•', text: eventText(e, page), at: e.at }))
    .reverse()

  const last = page.stages[page.stages.length - 1]
  return {
    title: p.title,
    trackId: p.trackId,
    tplChip: p.wf ? `${p.wf.category} · ${p.wf.tname} v${p.wf.version}` : p.deliv ? `${p.deliv.group} · ${p.deliv.item}`
      : `${p.kind === 'recurring' ? '🔁' : '⚡'} ${typeLabel ?? (p.kind === 'recurring' ? 'Recurring task' : 'Quick task')}`,
    category,
    startOn: p.startsOn,
    promise: null,
    deadline: p.dueOn,
    stages,
    at,
    sections,
    values,
    rows,
    overdue: p.overdue ?? { ...DEFAULT_OVERDUE, notify: [...DEFAULT_OVERDUE.notify] },
    finish: p.finish ?? defaultFinish(category),
    people,
    pic: p.pic ?? page.sub?.pic ?? 'PIC',
    doneAt: at.done ? last?.doneAt ?? null : null,
    log,
  }
}

/** Each person's open tasks now (the reassign modal's "{n} active"): a task counts for whoever it waits for — the doer
 * of the stage now, or the people its level now still waits for. As builderPeople's plate. */
export function boardLoads(board: Pick<MktBoard, 'projects' | 'stages'>): Record<string, number> {
  const out: Record<string, number> = {}
  const curOf = new Map(board.projects.filter(runsStages).map(p => [p.id, p.cur]))
  for (const s of board.stages) {
    if (curOf.get(s.project) !== s.idx) continue
    const who = s.status === 'review' ? waitsNow(s) : s.status === 'done' || !s.owner ? [] : [s.owner]
    for (const id of who) if (id !== 'pic') out[id] = (out[id] ?? 0) + 1
  }
  return out
}
