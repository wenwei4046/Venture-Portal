'use server'

import { getUser } from '@/lib/auth'
import { adminMemberAction } from '@/app/(member)/member/actions'
import { ACCEPT_NOTE } from '@/lib/member/member-services'
import { openDocumentationFile } from '@/lib/documentation/actions'
import {
  acknowledgeHiringRequest, cancelHiringRequest, declineHiringRequest, fillHiringRequest, removeHiringTalent, requestHiringInfo,
  saveHiringCandidate, saveTalentNotes, setCandidateStage, submitHiringRequest,
} from '@/lib/hiring/actions'
import type { CandidateStage, TalentReason } from '@/lib/hiring/types'
import { bookRoom, cancelBooking } from '@/lib/rooms/actions'
import { decideRequest } from '@/lib/attendance/actions'
import { acknowledgeProbation } from '@/app/(portal)/team/people/probation-actions'
import { appAccess } from './server'
import type { HrAppData } from './model'

/**
 * The HR phone app's writes (2026-10-11; the review's M2). Each is the
 * module's OWN Server Action — its gate and the database's still ask — run
 * only while the write's own portal page leaves it open to them: the page's
 * tab, and one of its boxes for that write (`appAccess`, server.ts). A write
 * sent from `/hr-app` names no portal page, so without this the module would
 * act "as held" whatever their ticks say.
 */
type Act = { ok: true } | { ok: false; reason: string }

const SHUT = 'This is not open to your account.'

async function may(write: keyof HrAppData['may']): Promise<boolean> {
  const user = await getUser()
  return !!user && !!appAccess(user).may[write]
}

const done = (res: { ok: true } | { ok: false; reason: string }): Act => (res.ok ? { ok: true } : { ok: false, reason: res.reason })

// ── Hiring › Requests: Acknowledge, More info, Decline, Cancel, Mark filled (Approve); a candidate (Edit, Create) ──

export async function hrAppAcknowledge(id: string, owner: string): Promise<Act> {
  return (await may('hireApprove')) ? done(await acknowledgeHiringRequest(id, owner)) : { ok: false, reason: SHUT }
}

export async function hrAppRequestInfo(id: string, note: string): Promise<Act> {
  return (await may('hireApprove')) ? done(await requestHiringInfo(id, note)) : { ok: false, reason: SHUT }
}

export async function hrAppDecline(id: string, note: string): Promise<Act> {
  return (await may('hireApprove')) ? done(await declineHiringRequest(id, note)) : { ok: false, reason: SHUT }
}

export async function hrAppCancelHire(id: string): Promise<Act> {
  return (await may('hireApprove')) ? done(await cancelHiringRequest(id)) : { ok: false, reason: SHUT }
}

export async function hrAppFill(id: string, hired: string, source: string, cost: string): Promise<Act> {
  return (await may('hireApprove')) ? done(await fillHiringRequest(id, { hired: [hired], source, cost, note: '' })) : { ok: false, reason: SHUT }
}

/** A candidate's status; Not selected keeps them in the Talent Bank with the reason tapped (2026-10-24). */
export async function hrAppCandidateStage(candidate: string, stage: CandidateStage, reason?: TalentReason): Promise<Act> {
  return (await may('hireEdit')) ? done(await setCandidateStage(candidate, stage, reason)) : { ok: false, reason: SHUT }
}

/** The handoff's New candidate: name, phone, a note — shortlisted, as Applied. */
export async function hrAppAddCandidate(request: string, c: { name: string; phone: string; note: string }): Promise<Act> {
  if (!(await may('hireCreate'))) return { ok: false, reason: SHUT }
  const form = new FormData()
  form.set('request', request)
  form.set('name', c.name)
  form.set('phone', c.phone)
  form.set('note', c.note)
  form.set('stage', 'shortlisted')
  form.set('answers', '{}')
  return done(await saveHiringCandidate(form))
}

/** HR Mobile's "+ New hiring request" (2026-10-17): the desktop drawer's own Submit to HR, with Form settings' answers. */
export async function hrAppNewHire(requestedBy: string, answers: Record<string, string>): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (!(await may('hireCreate'))) return { ok: false, reason: SHUT }
  const res = await submitHiringRequest({ requestedBy, answers })
  return res.ok ? { ok: true, id: res.id } : { ok: false, reason: res.reason }
}

// ── Hiring › Talent Bank (Edit) ──

export async function hrAppTalentNotes(talent: string, notes: string): Promise<Act> {
  return (await may('talentEdit')) ? done(await saveTalentNotes(talent, notes)) : { ok: false, reason: SHUT }
}

export async function hrAppRemoveTalent(talent: string): Promise<Act> {
  return (await may('talentEdit')) ? done(await removeHiringTalent(talent)) : { ok: false, reason: SHUT }
}

// ── Member services: Accept onto the waiting list, a claim approved (into the payroll, or a payment request to Finance), Reject ──

/** Where an approved claim's money goes — Member services' two buttons (the user, 2026-10-11: the phone asks both too). */
export type ClaimRoute = 'payroll' | 'payment'

export async function hrAppDecide(id: string, decision: 'accept' | 'approve' | 'reject', note: string, route: ClaimRoute = 'payroll'): Promise<Act> {
  if (!(await may('decide'))) return { ok: false, reason: SHUT }
  if (route !== 'payroll' && route !== 'payment') return { ok: false, reason: 'Pick where the claim is paid from.' }
  const res = await adminMemberAction(
    decision === 'accept' ? { action: 'qualify', requestId: id, note: note.trim() || ACCEPT_NOTE }
      : decision === 'approve' ? { action: 'approve', route, requestId: id, note }
        : { action: 'reject', requestId: id, note },
  )
  return res.ok ? { ok: true } : { ok: false, reason: res.error || 'The request could not be decided. Please try again.' }
}

// ── HR › Attendance › Requests (HR Mobile, 2026-10-17): decide the waiting step — HR's, or the upline's on their behalf ──

export async function hrAppAttDecide(id: string, approve: boolean, note: string): Promise<Act> {
  if (!(await may('attDecide'))) return { ok: false, reason: SHUT }
  if (!approve && !note.trim()) return { ok: false, reason: 'Add a note to reject' }
  const res = await decideRequest(id, approve, note)
  return res.ok ? { ok: true } : { ok: false, reason: res.reason }
}

// ── Admin › Meeting Rooms: book from the HR app; cancel what is theirs to cancel ──

export async function hrAppBook(b: { title: string; dept: string; roomId: string; date: string; from: number; to: number; attendees: string[]; pax: number }): Promise<Act> {
  if (!(await may('book'))) return { ok: false, reason: SHUT }
  const res = await bookRoom({
    room: b.roomId, day: b.date, from: b.from, to: b.to, title: b.title, department: b.dept || null,
    bookedBy: null, internal: b.attendees, guests: [], pax: b.pax, source: 'hr_app',
  })
  return res.ok ? { ok: true } : { ok: false, reason: res.reason }
}

export async function hrAppCancelBooking(id: string): Promise<Act> {
  if (!(await may('book'))) return { ok: false, reason: SHUT }
  const res = await cancelBooking(id)
  return res.ok ? { ok: true } : { ok: false, reason: res.reason }
}

// ── People: a probation's reminder acknowledged (2026-10-23) — People · Edit on the person's page ──

export async function hrAppProbationAck(id: string): Promise<Act> {
  return (await may('probationAck')) ? done(await acknowledgeProbation(id)) : { ok: false, reason: SHUT }
}

// ── People › Documentation: a letter's short link, made at the press (never kept) ──

export async function hrAppLetterLink(id: string, kind: 'letter' | 'document' = 'letter'): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  const user = await getUser()
  if (!user || !appAccess(user).parts.docs) return { ok: false, reason: SHUT }
  if (kind !== 'letter' && kind !== 'document') return { ok: false, reason: SHUT }
  const res = await openDocumentationFile(kind, id, 'view')
  return res.ok ? { ok: true, url: res.url } : { ok: false, reason: res.reason }
}
