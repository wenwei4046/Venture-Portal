'use client'

import { useRouter } from 'next/navigation'
import { useMemo } from 'react'
import { adminMemberAction } from '@/app/(member)/member/actions'
import { bookRoom, cancelBooking } from '@/lib/rooms/actions'
import { ACCEPT_NOTE } from '@/lib/member/member-services'
import type { HrAppData } from '@/lib/hr-app/model'
import HrApp, { type ActResult, type HrAppActions } from './HrApp'

// The HR app on the portal's own Server Actions (2026-10-11): each action asks
// its own gate and the database asks again; the app only reads again after a
// write. Hiring and Documentation join when their modules land.

const notYet = async (): Promise<ActResult> => ({ ok: false, reason: 'Not available yet.' })

export default function HrAppLive({ data }: { data: HrAppData }) {
  const router = useRouter()
  const actions = useMemo<HrAppActions>(() => ({
    hireAck: notYet,
    hireInfo: notYet,
    hireDecline: notYet,
    hireCancel: notYet,
    hireFill: notYet,
    candStage: notYet,
    candAdd: notYet,
    talentNotes: notYet,
    talentRemove: notYet,
    letterLink: async () => ({ ok: false, reason: 'Not available yet.' }),
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
