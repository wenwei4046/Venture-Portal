// A project's formal log (`Audit Trail.dc.html`, ④-3): every record of its trail, oldest first and numbered, in the
// handoff's columns — when, who, what (a dot: green approved, red sent back, amber handed on for a decision), from →
// to, the reason, the version — filtered by person, action and stage. Read from mkt_project_log; nothing on it is
// ever edited: a mistake is corrected by a record of its own, *correction of #n* (④-3b — the user's answer 19, the
// manager's). Exported by anybody in Marketing (answers 18, 21): the rows shown, as a formal document, as the table,
// as the handoff's CSV. Not yet: the Attachment column (no record holds a file of its own). Pure.

import { monthLabel } from './billing'
import { periodOf, type MktProjectKind } from './board'
import { eventFromRow, leftOutWords, trailTime, type TaskEvent } from './task'

/** A record of the log: a trail line — and, a correction's, the record it corrects (④-3b). */
export interface LogEvent extends TaskEvent {
  corrects: number | null
}

export interface ProjectLog {
  track: string
  title: string
  kind: MktProjectKind
  rows: LogEvent[]
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** mkt_project_log(project) — null for no such project. */
export function projectLogFromRow(v: unknown): ProjectLog | null {
  if (!isObj(v)) return null
  return {
    track: str(v.track),
    title: str(v.title),
    kind: v.kind === 'product' || v.kind === 'recurring' || v.kind === 'deliverable' ? v.kind : 'quick',
    rows: (Array.isArray(v.rows) ? v.rows : []).filter(isObj).map(r => ({ ...eventFromRow(r), corrects: Number(r.corrects) || null })),
  }
}

export type AuditTone = 'green' | 'red' | 'amber' | 'grey'

export interface AuditRow {
  /** The record's own id — what a correction names. */
  id: number
  no: number
  /** When, as written (an export writes it whole). */
  at: string
  time: string
  actor: string
  action: string
  tone: AuditTone
  stage: string
  fromTo: string
  reason: string
  version: string
  /** A correction: the number of the record it corrects. */
  corrects: number | null
  /** The numbers of the corrections of it. */
  correctedIn: number[]
}

const ACTION: Record<string, string> = {
  opened: 'Stage opened', accepted: 'Accepted', picked: 'Next approver picked', submitted: 'Submitted', approved: 'Approved',
  changes: 'Changes requested', completed: 'Completed', closed: 'Task closed', nudged: 'Nudged',
  paused: 'Series paused', resumed: 'Series resumed', ended: 'Series ended',
  'link sent': 'Link sent to PIC', resent: 'Resent to PIC', 'pic approved': 'PIC approved via link',
  'pic changes': 'Changes requested via link', signed: 'Minutes signed', 'minutes completed': 'Minutes completed',
  'edited after approval': 'Edited after approval', 'started before approval': 'Started before approval',
  attached: 'Attached from the Library', detached: 'Taken off the task',
  'work started': 'Work started', planned: 'Plan saved', replanned: 'Plan changed before it opened', 'plan changed': 'Plan changed',
  reassigned: 'Reassigned', replaced: 'Replaced',
  subtask: 'Subtask created', delivered: 'Delivered', 'delivery returned': 'Delivery returned', 'delivery approved': 'Delivery approved',
  'subtask removed': 'Subtask taken back',
  'amount set': 'Amount set', 'billing confirmed': 'Billing confirmed', 'billing withdrawn': 'Billing withdrawn', stopped: 'Stopped',
  'run made': 'Monthly run made', 'run day': 'Run day changed', carried: 'Plan carried',
  'runs paused': 'Monthly runs paused', 'runs resumed': 'Monthly runs resumed',
  'campaign period': 'Campaign period',
  posted: 'Marked posted', unposted: 'Posted mark taken back',
  correction: 'Correction',
}
const TONE: Record<string, AuditTone> = {
  posted: 'green',
  approved: 'green', completed: 'green', 'pic approved': 'green', 'delivery approved': 'green', 'billing confirmed': 'green',
  changes: 'red', 'pic changes': 'red', 'delivery returned': 'red',
  submitted: 'amber', 'link sent': 'amber', resent: 'amber', reassigned: 'amber', replaced: 'amber', delivered: 'amber',
  'billing withdrawn': 'amber', stopped: 'amber',
}
/** A subtask's lines: the version is the subtask's own ("Subtitles BM + EN v2"), not its stage's. */
const OF_SUBTASK = new Set(['subtask', 'delivered', 'delivery returned', 'delivery approved', 'subtask removed'])
/** A product project's actions whose reason is a name or a minutes' title — their own columns, not Reason. */
const TO_PIC = new Set(['link sent', 'resent'])
const OF_MINUTES = new Set(['signed', 'minutes completed', 'pic approved'])
/** Billing's lines (②b-2b): the month they are for, in the Version column — never a figure. */
const OF_MONTH: Record<string, string> = { 'billing confirmed': 'month', 'billing withdrawn': 'month', stopped: 'until', 'run made': 'month',
  'runs resumed': 'from' }
const QUOTED = new Set(['changes', 'pic changes', 'started before approval', 'reassigned', 'replaced', 'delivery returned', 'correction'])
const NONE = '—'

const monthOfLine = (v: unknown) => (typeof v === 'string' && /^[0-9]{4}-[0-9]{2}$/.test(v) ? monthLabel(`${v}-01`) : NONE)

function actionWords(e: TaskEvent, kind: MktProjectKind): string {
  if (e.action === 'created') return kind === 'product' ? 'Project started' : e.data?.kind === 'recurring' ? 'Recurring task created' : 'Task created'
  return ACTION[e.action] ?? (e.action ? e.action[0].toUpperCase() + e.action.slice(1) : NONE)
}

/** The log's rows, oldest first, numbered from 1 — a correction with the number of the record it corrects, a record
 * with the numbers of its corrections. */
export function auditRows(log: ProjectLog): AuditRow[] {
  const noOf = new Map(log.rows.map((e, i) => [e.id, i + 1]))
  const corrections = new Map<number, number[]>()
  log.rows.forEach((e, i) => {
    if (e.corrects && noOf.has(e.corrects)) corrections.set(e.corrects, [...(corrections.get(e.corrects) ?? []), i + 1])
  })
  return log.rows.map((e, i) => {
    const reason = e.reason ?? ''
    const product = e.action === 'created' && typeof e.data?.product === 'string' ? `${e.data.product} v${Number(e.data.version) || 1}` : ''
    return {
      id: e.id,
      no: i + 1,
      at: e.at,
      corrects: e.corrects ? noOf.get(e.corrects) ?? null : null,
      correctedIn: corrections.get(e.id) ?? [],
      time: trailTime(e.at),
      actor: e.actor || NONE,
      action: actionWords(e, log.kind),
      tone: TONE[e.action] ?? 'grey',
      stage: e.stageName || (e.stage != null ? `Stage ${e.stage + 1}` : NONE),
      fromTo: TO_PIC.has(e.action) ? (reason ? `→ ${reason} (PIC)` : NONE)
        : e.fromTo ? (e.action === 'submitted' ? `${e.actor || NONE} → ${e.fromTo}` : e.action === 'reassigned' || e.action === 'replaced' ? e.fromTo : `→ ${e.fromTo}`) : NONE,
      // A campaign's run period (④-2b): its days, or that it was taken off.
      reason: e.action === 'campaign period' ? periodOf(e.data) ?? 'Taken off'
        // A post's mark (④-2c): its field, and the link it was posted at.
        : e.action === 'posted' || e.action === 'unposted' ? [e.data?.field, e.action === 'posted' ? e.data?.link : null].filter(x => typeof x === 'string' && x).join(' · ') || NONE
        // Resumed (②b-2g): the months whose run day came while it was paused.
        : e.action === 'runs resumed' ? leftOutWords(e.data) ?? NONE
        : TO_PIC.has(e.action) || OF_MINUTES.has(e.action) || !reason ? NONE : QUOTED.has(e.action) ? `"${reason}"` : reason,
      version: OF_SUBTASK.has(e.action) && typeof e.data?.title === 'string' ? (e.version ? `${e.data.title} ${e.version}` : e.data.title)
        : OF_MONTH[e.action] ? monthOfLine(e.data?.[OF_MONTH[e.action]])
        : e.version ? (e.stageName ? `${e.stageName} ${e.version}` : e.version) : OF_MINUTES.has(e.action) ? reason || NONE : product || NONE,
    }
  })
}

// ── The filter: by person, by action, by stage ─────────────────────────────────────
export type AuditGroup = 'person' | 'action' | 'stage'
export const AUDIT_GROUPS: readonly { key: AuditGroup; title: string }[] = [
  { key: 'person', title: 'Person' },
  { key: 'action', title: 'Action' },
  { key: 'stage', title: 'Stage' },
]
export type AuditFilter = Record<AuditGroup, string[]>
export const NO_AUDIT_FILTER: AuditFilter = { person: [], action: [], stage: [] }

const valueOf = (r: AuditRow, g: AuditGroup) => (g === 'person' ? r.actor : g === 'action' ? r.action : r.stage)

export const passesAudit = (r: AuditRow, f: AuditFilter) => AUDIT_GROUPS.every(({ key }) => !f[key].length || f[key].includes(valueOf(r, key)))

/** Each group's values as the log first names them, with how many records carry each (of the whole log). */
export function auditGroups(rows: readonly AuditRow[], f: AuditFilter): { key: AuditGroup; title: string; opts: { value: string; n: number; on: boolean }[] }[] {
  return AUDIT_GROUPS.map(({ key, title }) => {
    const counts = new Map<string, number>()
    for (const r of rows) counts.set(valueOf(r, key), (counts.get(valueOf(r, key)) ?? 0) + 1)
    return { key, title: `By ${title.toLowerCase()}`, opts: [...counts].map(([value, n]) => ({ value, n, on: f[key].includes(value) })) }
  })
}

/** The filter's chips: "Person: Mei", each removable. */
export const auditChips = (f: AuditFilter) =>
  AUDIT_GROUPS.flatMap(({ key, title }) => f[key].map(value => ({ key, group: title, value })))

export const auditCount = (shown: number, all: number) => `${shown} of ${all} record${all === 1 ? '' : 's'}`

export const toggleAudit = (f: AuditFilter, g: AuditGroup, v: string): AuditFilter =>
  ({ ...f, [g]: f[g].includes(v) ? f[g].filter(x => x !== v) : [...f[g], v] })

// ── A correction (④-3b — the user's answer 19, the manager's) ──────────────────────────────────────────
/** What was wrong and what is right — as mkt_log_correct asks (5–500). */
export const correctionOk = (words: string) => words.trim().length >= 5 && words.trim().length <= 500

// ── Export (④-3b — answers 18, 21: anybody in Marketing; a formal document and the table, and the handoff's CSV) ──
export type AuditExport = 'pdf' | 'table' | 'csv'
export const AUDIT_EXPORTS: readonly { key: AuditExport; label: string }[] = [
  { key: 'pdf', label: 'PDF — formal document' },
  { key: 'table', label: 'PDF — the table' },
  { key: 'csv', label: 'CSV' },
]
export const auditExportOf = (v: string | null): AuditExport => (v === 'table' || v === 'csv' ? v : 'pdf')

/** The filter in an address (`person=Mei&action=Approved`) — an export is of the rows shown. */
export function auditQuery(f: AuditFilter): string {
  const q = new URLSearchParams()
  for (const { key } of AUDIT_GROUPS) for (const v of f[key]) q.append(key, v)
  return q.toString()
}
export function auditFilterOf(q: URLSearchParams): AuditFilter {
  const of = (k: AuditGroup) => q.getAll(k).filter(Boolean).slice(0, 60).map(v => v.slice(0, 200))
  return { person: of('person'), action: of('action'), stage: of('stage') }
}

/** Where an export of the log is fetched (a GET route, the portal's file downloads' way). */
export const auditExportHref = (project: string, format: AuditExport, f: AuditFilter) =>
  `/marketing/projects/${encodeURIComponent(project)}/log?${[`format=${format}`, auditQuery(f)].filter(Boolean).join('&')}`
export const auditFileName = (track: string, format: AuditExport) =>
  `${(track || 'project').replace(/[^A-Za-z0-9-]/g, '')}_audit${format === 'table' ? '_table' : ''}.${format === 'csv' ? 'csv' : 'pdf'}`

export const AUDIT_HEADS = ['#', 'Time', 'Actor', 'Action', 'From → To', 'Reason', 'Version'] as const
/** A record's action as an export writes it — a correction's with the record it corrects. */
export const actionCell = (r: Pick<AuditRow, 'action' | 'corrects'>) => (r.corrects ? `${r.action} (correction of #${r.corrects})` : r.action)

const csvCell = (v: string | number) => {
  const s = String(v)
  return /[",\r\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s
}
/** The rows as the handoff's CSV: the table's columns, each time whole (the office's clock) — a cell a spreadsheet
 * would read as a formula is written as text. */
export function auditCsv(rows: readonly AuditRow[], whole: (at: string) => string): string {
  const lines = [[...AUDIT_HEADS], ...rows.map(r => [r.no, whole(r.at) || r.time, r.actor, actionCell(r), r.fromTo, r.reason, r.version])]
  return `${lines.map(l => l.map(csvCell).join(',')).join('\r\n')}\r\n`
}

const WIN_ANSI_MORE = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')
/** Words a PDF's own Helvetica can draw (WinAnsi, as every portal PDF): an arrow as `->`, anything else outside it `?`. */
export const pdfText = (s: string) =>
  s.replace(/→/g, '->').replace(/[^\n\x20-\x7e\xa0-\xff]/gu, c => (WIN_ANSI_MORE.has(c) ? c : '?'))
