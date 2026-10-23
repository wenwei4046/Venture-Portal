import type { CandidateStage, HiringBoard, HiringTalent, TalentReason } from './types'

// Why somebody is kept in the Talent Bank (2026-10-24 — IT-0008, from HR: "after the candidate is failed with interview
// or not shortlisted … the candidate will be placed within the Talent Bank"; the user: "包括 upload 的时候，最好能放一个
// drop 掉的原因：可能是刚好 not right now，或者他被 fail shortlist 等。做成一个 dropdown，可以选 type 就好了"). The
// database keeps the same five (mig 20261024233700, `hiring_talents.reason`) and refuses any other.

export const REASONS: ReadonlyArray<{ id: TalentReason; label: string }> = [
  { id: 'not_shortlisted', label: 'Not shortlisted' },
  { id: 'failed_interview', label: 'Failed interview' },
  { id: 'not_right_now', label: 'Not right now' },
  { id: 'declined_offer', label: 'Declined offer' },
  { id: 'other', label: 'Other' },
]

export function isReason(v: unknown): v is TalentReason {
  return REASONS.some(r => r.id === v)
}

/** "Failed interview" — or '' for somebody kept before the reason was asked. */
export function reasonLabel(reason: TalentReason | null | undefined): string {
  return REASONS.find(r => r.id === reason)?.label ?? ''
}

/** The reason a candidate leaving this stage most likely has — what the database keeps when none is given. */
export function outReason(stage: CandidateStage): TalentReason {
  return stage === 'appointment' ? 'failed_interview' : stage === 'offered' ? 'declined_offer' : stage === 'hired' ? 'other' : 'not_shortlisted'
}

/** Where somebody came into the bank: "HR-006 · Sales Designer" (a request's candidate) or added in the Talent Bank itself. */
export function cameFrom(board: Pick<HiringBoard, 'requests'>, t: Pick<HiringTalent, 'fromRequest'>): string {
  if (!t.fromRequest) return 'Added in Talent Bank'
  const position = board.requests.find(r => r.id === t.fromRequest)?.answers.position?.trim()
  return position ? `${t.fromRequest} · ${position}` : t.fromRequest
}
