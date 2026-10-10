'use client'

import { useRouter } from 'next/navigation'
import { useMemo } from 'react'
import { adminMemberAction } from '@/app/(member)/member/actions'
import { bookRoom, cancelBooking } from '@/lib/rooms/actions'
import { ACCEPT_NOTE } from '@/lib/member/member-services'
import { openDocumentationFile } from '@/lib/documentation/actions'
import {
  acknowledgeHiringRequest, cancelHiringRequest, declineHiringRequest, fillHiringRequest, removeHiringTalent, requestHiringInfo,
  saveHiringCandidate, saveTalentNotes, setCandidateStage,
} from '@/lib/hiring/actions'
import type { HrAppData } from '@/lib/hr-app/model'
import HrApp, { type ActResult, type HrAppActions } from './HrApp'

// The HR app on the portal's own Server Actions (2026-10-11): each action asks
// its own gate and the database asks again; the app only reads again after a
// write.

const done = (res: { ok: true } | { ok: false; reason: string }): ActResult => (res.ok ? { ok: true } : { ok: false, reason: res.reason })

export default function HrAppLive({ data }: { data: HrAppData }) {
  const router = useRouter()
  const actions = useMemo<HrAppActions>(() => ({
    // Hiring's own actions (lib/hiring/actions.ts), each asking its Hiring cell.
    hireAck: async (id, owner) => done(await acknowledgeHiringRequest(id, owner)),
    hireInfo: async (id, note) => done(await requestHiringInfo(id, note)),
    hireDecline: async (id, note) => done(await declineHiringRequest(id, note)),
    hireCancel: async id => done(await cancelHiringRequest(id)),
    hireFill: async (id, hired, source, cost) => done(await fillHiringRequest(id, { hired: [hired], source, cost, note: '' })),
    candStage: async (_hire, candidate, stage) => done(await setCandidateStage(candidate, stage)),
    candAdd: async (hire, c) => {
      // The handoff's New candidate: name, phone, a note — shortlisted, as Applied.
      const form = new FormData()
      form.set('request', hire)
      form.set('name', c.name)
      form.set('phone', c.phone)
      form.set('note', c.note)
      form.set('stage', 'shortlisted')
      form.set('answers', '{}')
      return done(await saveHiringCandidate(form))
    },
    talentNotes: async (id, notes) => done(await saveTalentNotes(id, notes)),
    talentRemove: async id => done(await removeHiringTalent(id)),
    letterLink: async id => {
      // People › Documentation's own short link, made at the press (never kept).
      const res = await openDocumentationFile('letter', id, 'view')
      return res.ok ? { ok: true, url: res.url } : { ok: false, reason: res.reason }
    },
    requestDecide: async (id, decision, note) => {
      // The desktop's own moves (Member services): Accept onto the waiting list,
      // a claim approved into the payroll (its main button), or Reject.
      const res = await adminMemberAction(
        decision === 'accept' ? { action: 'qualify', requestId: id, note: note.trim() || ACCEPT_NOTE }
          : decision === 'approve' ? { action: 'approve', route: 'payroll', requestId: id, note }
            : { action: 'reject', requestId: id, note },
      )
      return res.ok ? { ok: true } : { ok: false, reason: res.error || 'The request could not be decided. Please try again.' }
    },
    book: async b => {
      const res = await bookRoom({
        room: b.roomId, day: b.date, from: b.from, to: b.to, title: b.title, department: b.dept || null,
        bookedBy: null, internal: b.attendees, guests: [], pax: b.pax, source: 'hr_app',
      })
      return res.ok ? { ok: true } : { ok: false, reason: res.reason }
    },
    bookCancel: async id => {
      const res = await cancelBooking(id)
      return res.ok ? { ok: true } : { ok: false, reason: res.reason }
    },
    refresh: () => router.refresh(),
  }), [router])
  return <HrApp data={data} actions={actions} />
}
