'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { setViewAs } from '@/components/layout/view-as-actions'
import ViewAsPersonPicker from '@/components/layout/ViewAsPersonPicker'
import { changeMyPassword } from '@/lib/account/actions'
import {
  careMktPet, createMktTask, decideMktStage, nudgeMkt, readMktChat, reviewMktSubtask, saveMktSpace, saveMktWork, sendMktChat, submitMktStage,
} from '@/lib/marketing/actions'
import type { MktAppData } from '@/lib/mkt-app/model'
import { approveRequests, cancelRequest, openNewRequest, openRequestFile, saveRequest, sendBackRequests } from '@/lib/payment-requests/actions'
import { readNotices } from '@/lib/push/actions'
import { createClient } from '@/lib/supabase/client'
import MktApp, { type MktAppActions } from './MktApp'
import type { ClaimActions } from './screens/ClaimScreen'

// The Marketing app on the portal's own Server Actions (2026-11-28): each write is the module's own — the task page's
// (lib/marketing/actions.ts), My Space's, the Claim page's (lib/payment-requests/actions.ts) — which asks its gate, and
// the database asks again. The app reads again only after a write (router.refresh).

/** The Claim page's own actions, as they are. */
const CLAIMS: ClaimActions = {
  openNew: openNewRequest,
  save: saveRequest,
  cancel: cancelRequest,
  approve: approveRequests,
  sendBack: sendBackRequests,
  openFile: openRequestFile,
}

export default function MktAppLive({ data, platform }: { data: MktAppData; platform: 'ios' | 'android' }) {
  const router = useRouter()
  const [, startSwitch] = useTransition()
  // View as a person… (every switcher's last row): the portal's own picker, over the app's sheets.
  const [picking, setPicking] = useState(false)
  const actions = useMemo<MktAppActions>(() => ({
    saveWork: saveMktWork,
    submit: submitMktStage,
    decide: decideMktStage,
    review: reviewMktSubtask,
    nudge: nudgeMkt,
    createTask: createMktTask,
    saveSpace: saveMktSpace,
    care: careMktPet,
    send: sendMktChat,
    read: readMktChat,
    noticesRead: readNotices,
    claims: CLAIMS,
    // The account's own, not a module's: the portal's one action, which asks for a personal login itself.
    changePassword: changeMyPassword,
    // Another view of the one app: the server action opens where it lives (on a phone, each view's own face).
    switchView: view => {
      if (view === 'person') return setPicking(true)
      const form = new FormData()
      form.set('role', view)
      startSwitch(async () => { await setViewAs(form) })
    },
    // This phone only (2026-10-08): the shared logins are signed in on several.
    signOut: async () => {
      await createClient().auth.signOut({ scope: 'local' })
      router.push('/login')
      router.refresh()
    },
    refresh: () => router.refresh(),
  }), [router])
  return (
    <>
      <MktApp data={data} actions={actions} platform={platform} />
      {data.views ? <ViewAsPersonPicker open={picking} onClose={() => setPicking(false)} z={90} /> : null}
    </>
  )
}
