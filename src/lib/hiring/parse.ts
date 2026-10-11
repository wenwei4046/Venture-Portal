import type {
  CandidateField,
  CandidateFieldType,
  CandidateStage,
  HiringBoard,
  HiringCandidate,
  HiringEvent,
  HiringField,
  HiringFieldType,
  HiringFile,
  HiringFileType,
  HiringPerson,
  HiringRequest,
  HiringSource,
  HiringStatus,
  HiringTalent,
} from './types'

// `hiring_board()`'s jsonb, checked field by field: anything missing or of the
// wrong kind comes back as an empty value, never a crash on the page.

type Json = Record<string, unknown>

const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v))
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
const strings = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [k, value] of Object.entries(obj(v))) if (value !== null && value !== undefined) out[k] = String(value)
  return out
}

const STATUSES: readonly HiringStatus[] = ['submitted', 'needs_info', 'acknowledged', 'filled', 'cancelled', 'declined']
const STAGES: readonly CandidateStage[] = ['shortlisted', 'appointment', 'offered', 'hired', 'rejected']
const FIELD_TYPES: readonly HiringFieldType[] = ['text', 'number', 'longtext', 'select', 'range']
const CANDIDATE_TYPES: readonly CandidateFieldType[] = ['text', 'number', 'date', 'choice']

export function fieldFromJson(v: unknown): HiringField {
  const o = obj(v)
  const type = FIELD_TYPES.includes(o.type as HiringFieldType) ? (o.type as HiringFieldType) : 'text'
  return { id: str(o.id), label: str(o.label), type, options: str(o.options), required: o.required === true, core: o.core === true }
}

function eventFromJson(v: unknown): HiringEvent {
  const o = obj(v)
  return { what: str(o.what), who: str(o.who), note: str(o.note), at: str(o.at) }
}

function fileFromJson(v: unknown): HiringFile {
  const o = obj(v)
  return {
    id: str(o.id),
    typeId: str(o.typeId),
    type: str(o.type) || 'File',
    resume: o.resume === true,
    name: str(o.name) || 'file',
    addedAt: str(o.addedAt),
    addedBy: str(o.addedBy),
  }
}

/** A record's files: only the ones with an id — what a link and a removal name. */
const filesFromJson = (v: unknown): HiringFile[] => arr(v).map(fileFromJson).filter(f => f.id)

function candidateFromJson(v: unknown): HiringCandidate {
  const o = obj(v)
  return {
    id: str(o.id),
    name: str(o.name),
    phone: str(o.phone),
    source: str(o.source) || 'Applied',
    stage: STAGES.includes(o.stage as CandidateStage) ? (o.stage as CandidateStage) : 'shortlisted',
    talentId: strOrNull(o.talentId),
    answers: strings(o.answers),
    note: str(o.note),
    files: filesFromJson(o.files),
  }
}

export function requestFromJson(v: unknown): HiringRequest {
  const o = obj(v)
  return {
    id: str(o.id),
    status: STATUSES.includes(o.status as HiringStatus) ? (o.status as HiringStatus) : 'submitted',
    source: o.source === 'guest' ? 'guest' : 'portal',
    requestedBy: strOrNull(o.requestedBy),
    requesterName: str(o.requesterName),
    requesterDepartment: strOrNull(o.requesterDepartment),
    requesterCompany: strOrNull(o.requesterCompany),
    requesterPhone: strOrNull(o.requesterPhone),
    fields: arr(o.fields).map(fieldFromJson),
    answers: strings(o.answers),
    ownerId: strOrNull(o.ownerId),
    assistedBy: strOrNull(o.assistedBy),
    hiredNames: arr(o.hiredNames).map(str).filter(Boolean),
    hiredThrough: strOrNull(o.hiredThrough),
    hiringCost: num(o.hiringCost),
    attachmentName: strOrNull(o.attachmentName),
    submittedAt: str(o.submittedAt),
    acknowledgedAt: strOrNull(o.acknowledgedAt),
    filledAt: strOrNull(o.filledAt),
    closedAt: strOrNull(o.closedAt),
    candidates: arr(o.candidates).map(candidateFromJson),
    events: arr(o.events).map(eventFromJson),
  }
}

function talentFromJson(v: unknown): HiringTalent {
  const o = obj(v)
  return {
    id: str(o.id),
    no: str(o.no),
    name: str(o.name),
    phone: str(o.phone),
    email: str(o.email),
    position: str(o.position),
    department: str(o.department),
    fromRequest: strOrNull(o.fromRequest),
    notes: str(o.notes),
    files: filesFromJson(o.files),
    savedBy: str(o.savedBy),
    savedAt: str(o.savedAt),
    events: arr(o.events).map(eventFromJson),
  }
}

export function boardFromJson(v: unknown): HiringBoard {
  const o = obj(v)
  const me = obj(o.me)
  return {
    fields: arr(o.fields).map(fieldFromJson),
    sources: arr(o.sources).map((s): HiringSource => {
      const x = obj(s)
      return { id: str(x.id), name: str(x.name), active: x.active !== false, used: num(x.used) ?? 0 }
    }),
    candidateFields: arr(o.candidateFields).map((f): CandidateField => {
      const x = obj(f)
      return {
        id: str(x.id),
        label: str(x.label),
        type: CANDIDATE_TYPES.includes(x.type as CandidateFieldType) ? (x.type as CandidateFieldType) : 'text',
        options: str(x.options),
      }
    }),
    fileTypes: arr(o.fileTypes)
      .map((t): HiringFileType => {
        const x = obj(t)
        return { id: str(x.id), name: str(x.name), builtin: x.builtin === 'resume' ? 'resume' : null, active: x.active !== false, used: num(x.used) ?? 0 }
      })
      .filter(t => t.id && t.name),
    people: arr(o.people).map((p): HiringPerson => {
      const x = obj(p)
      return { id: str(x.id), name: str(x.name), title: str(x.title), department: str(x.department) }
    }),
    requests: arr(o.requests).map(requestFromJson),
    talents: arr(o.talents).map(talentFromJson),
    me: { staffId: strOrNull(me.staffId), name: str(me.name) || 'HR' },
  }
}
