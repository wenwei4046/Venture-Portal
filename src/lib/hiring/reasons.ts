import type { CandidateStage, HiringBankReason, HiringBoard, HiringTalent, TalentReason } from './types'

// Why somebody is kept in the Talent Bank (2026-10-24 — IT-0008, from HR: "after the candidate is failed with interview
// or not shortlisted … the candidate will be placed within the Talent Bank"; the user: "包括 upload 的时候，最好能放一个
// drop 掉的原因：可能是刚好 not right now，或者他被 fail shortlist 等。做成一个 dropdown，可以选 type 就好了"). The same
// day, asked whether HR should add, rename and turn off the reasons like File types, the user: "1, yes do with same" —
// the list is HR's (mig 20261024235300, `hiring_bank_reasons`; the board's `talentReasons`), and the database refuses
// a reason not on it, or one turned off.

/** The five the list began with — what a board read before the list was there stands for. */
export const STARTING_REASONS: readonly HiringBankReason[] = [
  { id: 'not_shortlisted', name: 'Not shortlisted', active: true, used: 0 },
  { id: 'failed_interview', name: 'Failed interview', active: true, used: 0 },
  { id: 'not_right_now', name: 'Not right now', active: true, used: 0 },
  { id: 'declined_offer', name: 'Declined offer', active: true, used: 0 },
  { id: 'other', name: 'Other', active: true, used: 0 },
]

/** "+ Add a new reason…" picked in a form (Edit): its name is typed beside it, and made on Save. */
export const NEW_REASON = '__new'

/** "Failed interview" — or '' for somebody kept before the reason was asked. */
export function reasonLabel(reasons: readonly HiringBankReason[], reason: TalentReason | null | undefined): string {
  return reason ? reasons.find(r => r.id === reason)?.name ?? '' : ''
}

/** What a picker offers: the reasons that are on — and the one somebody already has, though it was turned off since. */
export function pickable(reasons: readonly HiringBankReason[], current?: TalentReason | null): HiringBankReason[] {
  return reasons.filter(r => r.active || r.id === current)
}

/** The reason a candidate leaving this stage most likely has — what the database keeps when none is given. */
export function outReason(stage: CandidateStage): TalentReason {
  return stage === 'appointment' ? 'failed_interview' : stage === 'offered' ? 'declined_offer' : stage === 'hired' ? 'other' : 'not_shortlisted'
}

/** The reason a picker starts on: `wanted` while it is on, else the first that is. */
export function startReason(reasons: readonly HiringBankReason[], wanted: TalentReason): TalentReason {
  const on = reasons.filter(r => r.active)
  return on.some(r => r.id === wanted) ? wanted : on[0]?.id ?? ''
}

/** Not selected ▸ why? — the reasons that are on, the one their stage says first. */
export function whyOrder(reasons: readonly HiringBankReason[], stage: CandidateStage): HiringBankReason[] {
  const first = outReason(stage)
  return reasons.filter(r => r.active).sort((a, b) => Number(b.id === first) - Number(a.id === first))
}

/** A name typed with "+ Add a new reason…" that the list already has on: that reason. */
export function knownReason(reasons: readonly HiringBankReason[], name: string): TalentReason | null {
  const key = name.trim().toLowerCase()
  return reasons.find(r => r.active && r.name.trim().toLowerCase() === key)?.id ?? null
}

/** Where somebody came into the bank: "HR-006 · Sales Designer" (a request's candidate) or added in the Talent Bank itself. */
export function cameFrom(board: Pick<HiringBoard, 'requests'>, t: Pick<HiringTalent, 'fromRequest'>): string {
  if (!t.fromRequest) return 'Added in Talent Bank'
  const position = board.requests.find(r => r.id === t.fromRequest)?.answers.position?.trim()
  return position ? `${t.fromRequest} · ${position}` : t.fromRequest
}
