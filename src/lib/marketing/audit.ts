// A project's formal log (`Audit Trail.dc.html`, ④-3): every record of its trail, oldest first and numbered, in the
// handoff's columns — when, who, what (a dot: green approved, red sent back, amber handed on for a decision), from →
// to, the reason, the version — filtered by person, action and stage. Read from mkt_project_log; nothing on it is
// ever edited. Not yet: corrections (question 19), Export (question 18), the Attachment column (no record holds a file
// until Marketing's R2 bucket). Pure.

import type { MktProjectKind } from './board'
import { eventFromRow, trailTime, type TaskEvent } from './task'

export interface ProjectLog {
  track: string
  title: string
  kind: MktProjectKind
  rows: TaskEvent[]
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** mkt_project_log(project) — null for no such project. */
export function projectLogFromRow(v: unknown): ProjectLog | null {
  if (!isObj(v)) return null
  return {
    track: str(v.track),
    title: str(v.title),
    kind: v.kind === 'product' ? 'product' : v.kind === 'recurring' ? 'recurring' : 'quick',
    rows: (Array.isArray(v.rows) ? v.rows : []).filter(isObj).map(eventFromRow),
  }
}

export type AuditTone = 'green' | 'red' | 'amber' | 'grey'

export interface AuditRow {
  no: number
  time: string
  actor: string
  action: string
  tone: AuditTone
  stage: string
  fromTo: string
  reason: string
  version: string
}

const ACTION: Record<string, string> = {
  opened: 'Stage opened', accepted: 'Accepted', picked: 'Next approver picked', submitted: 'Submitted', approved: 'Approved',
  changes: 'Changes requested', completed: 'Completed', closed: 'Task closed', nudged: 'Nudged',
  paused: 'Series paused', resumed: 'Series resumed', ended: 'Series ended',
  'link sent': 'Link sent to PIC', resent: 'Resent to PIC', 'pic approved': 'PIC approved via link',
  'pic changes': 'Changes requested via link', signed: 'Minutes signed', 'minutes completed': 'Minutes completed',
  'edited after approval': 'Edited after approval', 'started before approval': 'Started before approval',
}
const TONE: Record<string, AuditTone> = {
  approved: 'green', completed: 'green', 'pic approved': 'green',
  changes: 'red', 'pic changes': 'red',
  submitted: 'amber', 'link sent': 'amber', resent: 'amber',
}
/** A product project's actions whose reason is a name or a minutes' title — their own columns, not Reason. */
const TO_PIC = new Set(['link sent', 'resent'])
const OF_MINUTES = new Set(['signed', 'minutes completed', 'pic approved'])
const QUOTED = new Set(['changes', 'pic changes', 'started before approval'])
const NONE = '—'

function actionWords(e: TaskEvent, kind: MktProjectKind): string {
  if (e.action === 'created') return kind === 'product' ? 'Project started' : e.data?.kind === 'recurring' ? 'Recurring task created' : 'Task created'
  return ACTION[e.action] ?? (e.action ? e.action[0].toUpperCase() + e.action.slice(1) : NONE)
}

/** The log's rows, oldest first, numbered from 1. */
export function auditRows(log: ProjectLog): AuditRow[] {
  return log.rows.map((e, i) => {
    const reason = e.reason ?? ''
    const product = e.action === 'created' && typeof e.data?.product === 'string' ? `${e.data.product} v${Number(e.data.version) || 1}` : ''
    return {
      no: i + 1,
      time: trailTime(e.at),
      actor: e.actor || NONE,
      action: actionWords(e, log.kind),
      tone: TONE[e.action] ?? 'grey',
      stage: e.stageName || (e.stage != null ? `Stage ${e.stage + 1}` : NONE),
      fromTo: TO_PIC.has(e.action) ? (reason ? `→ ${reason} (PIC)` : NONE)
        : e.fromTo ? (e.action === 'submitted' ? `${e.actor || NONE} → ${e.fromTo}` : `→ ${e.fromTo}`) : NONE,
      reason: TO_PIC.has(e.action) || OF_MINUTES.has(e.action) || !reason ? NONE : QUOTED.has(e.action) ? `"${reason}"` : reason,
      version: e.version ? (e.stageName ? `${e.stageName} ${e.version}` : e.version) : OF_MINUTES.has(e.action) ? reason || NONE : product || NONE,
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
