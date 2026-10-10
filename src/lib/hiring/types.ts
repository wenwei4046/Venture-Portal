// Hiring (2026-10-11, HR revamp round 2 — README §11–13): the shapes
// `hiring_board()` answers with (mig 20261011080000), read once per page and
// shared by Requests, a request's page, Insights, the Talent Bank and the HR
// phone app.

export type HiringStatus = 'submitted' | 'needs_info' | 'acknowledged' | 'filled' | 'cancelled' | 'declined'
export type CandidateStage = 'shortlisted' | 'appointment' | 'offered' | 'hired' | 'rejected'
export type HiringFieldType = 'text' | 'number' | 'longtext' | 'select' | 'range'
export type CandidateFieldType = 'text' | 'number' | 'date' | 'choice'

/** A question of the requester form (Form settings). `options` is comma-separated. */
export interface HiringField {
  id: string
  label: string
  type: HiringFieldType
  options: string
  required: boolean
  /** Position and Department: renamed, never removed, always required. */
  core: boolean
}

export interface HiringSource {
  id: string
  name: string
  active: boolean
  /** Requests marked filled through it. */
  used: number
}

export interface CandidateField {
  id: string
  label: string
  type: CandidateFieldType
  options: string
}

/** Somebody working here today (Requested by, Owner, Assisted by). */
export interface HiringPerson {
  id: string
  name: string
  title: string
  /** "Revenue", "HR" … — the department's short name. */
  department: string
}

export interface HiringEvent {
  what: string
  who: string
  note: string
  /** An instant (ISO). */
  at: string
}

export interface HiringCandidate {
  id: string
  name: string
  phone: string
  source: string
  stage: CandidateStage
  /** In the Talent Bank (and still there). */
  talentId: string | null
  answers: Record<string, string>
  note: string
  resumeName: string | null
}

export interface HiringRequest {
  id: string
  status: HiringStatus
  source: 'portal' | 'guest'
  requestedBy: string | null
  requesterName: string
  requesterDepartment: string | null
  /** A guest's company; null = HOUZS Venture. */
  requesterCompany: string | null
  requesterPhone: string | null
  /** The form as it stood when the request was sent. */
  fields: HiringField[]
  answers: Record<string, string>
  ownerId: string | null
  assistedBy: string | null
  hiredNames: string[]
  hiredThrough: string | null
  hiringCost: number | null
  attachmentName: string | null
  submittedAt: string
  acknowledgedAt: string | null
  filledAt: string | null
  closedAt: string | null
  candidates: HiringCandidate[]
  events: HiringEvent[]
}

export interface HiringTalent {
  id: string
  /** T-001 … */
  no: string
  name: string
  phone: string
  email: string
  position: string
  department: string
  fromRequest: string | null
  notes: string
  resumeName: string | null
  savedBy: string
  savedAt: string
  events: HiringEvent[]
}

export interface HiringBoard {
  fields: HiringField[]
  sources: HiringSource[]
  candidateFields: CandidateField[]
  people: HiringPerson[]
  requests: HiringRequest[]
  talents: HiringTalent[]
  /** The reader: their roster row (if their login has one) and the name the trails use. */
  me: { staffId: string | null; name: string }
}
