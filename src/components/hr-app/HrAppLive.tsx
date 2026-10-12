'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useTransition } from 'react'
import { setViewAs } from '@/components/layout/view-as-actions'
import {
  hrAppAcknowledge, hrAppAddCandidate, hrAppBook, hrAppCancelBooking, hrAppCancelHire, hrAppCandidateStage, hrAppDecide, hrAppDecline,
  hrAppFill, hrAppLetterLink, hrAppRemoveTalent, hrAppRequestInfo, hrAppTalentNotes,
} from '@/lib/hr-app/actions'
import type { HrAppData } from '@/lib/hr-app/model'
import { readNotices, removePushSubscription, reportPushTrouble, savePushSubscription } from '@/lib/push/actions'
import { changeMyPassword } from '@/lib/account/actions'
import { markMyMemo, openMemoFile } from '@/lib/memos/actions'
import HrApp, { type HrAppActions } from './HrApp'

// The HR app on the portal's own Server Actions (2026-10-11): each write goes
// through lib/hr-app/actions.ts — open only while its own portal page leaves
// it open to them — to the module's own action, which asks its gate, and the
// database asks again. The app only reads again after a write.

export default function HrAppLive({ data }: { data: HrAppData }) {
  const router = useRouter()
  const [, startSwitch] = useTransition()
  const actions = useMemo<HrAppActions>(() => ({
    hireAck: hrAppAcknowledge,
    hireInfo: hrAppRequestInfo,
    hireDecline: hrAppDecline,
    hireCancel: hrAppCancelHire,
    hireFill: hrAppFill,
    candStage: (_hire, candidate, stage) => hrAppCandidateStage(candidate, stage),
    candAdd: hrAppAddCandidate,
    talentNotes: hrAppTalentNotes,
    talentRemove: hrAppRemoveTalent,
    letterLink: hrAppLetterLink,
    noticesRead: readNotices,
    pushSave: savePushSubscription,
    pushRemove: removePushSubscription,
    pushTrouble: reportPushTrouble,
    requestDecide: hrAppDecide,
    book: hrAppBook,
    bookCancel: hrAppCancelBooking,
    // The account's own, not a module's: the portal's one action, which asks for a personal login itself.
    changePassword: changeMyPassword,
    // Their own memos (2026-10-12): the login's receipt, the same one the portal's bell and the Revenue app write.
    memoMark: markMyMemo,
    memoFile: openMemoFile,
    // Another view of the one app: the server action opens where it lives (on a phone, HR's is this app).
    switchView: view => {
      const form = new FormData()
      form.set('role', view)
      startSwitch(async () => { await setViewAs(form) })
    },
    refresh: () => router.refresh(),
  }), [router])
  return <HrApp data={data} actions={actions} />
}
