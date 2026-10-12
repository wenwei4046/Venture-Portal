import Link from 'next/link'
import type { User } from '@/types'
import { HvPage, PageHead, btn } from '@/components/hrv/kit'
import { officeToday } from '@/lib/office-time'
import { revenuePath } from '@/lib/revenue'
import { sees } from '@/lib/sensitive'
import { fullText } from '@/lib/commission/waiting-transfer'
import { loadWaitingTransfer, type WaitingTransferRead } from '../_lib/waiting-transfer'
import WaitingTransferForm from './WaitingTransferForm'
import s from './waiting-transfer.module.css'

/**
 * People Management's employee form, opened by Sales Groups › Waiting list ›
 * Transfer (`/team/people/new?waiting=<request>`, 2026-10-10, the HR revamp).
 * It asks both doors it goes through — People › Create (the page's own gate)
 * and the member back office — and says so when either is shut, when the
 * applicant has left the list, or when the sub-department is full.
 */
export default async function WaitingTransfer({ requestId, viewer }: { requestId: string; viewer: User }) {
  const read: WaitingTransferRead = viewer.permissions.includes('member_requests_manage')
    ? await loadWaitingTransfer(requestId)
    : { ok: false, reason: 'Transferring from the waiting list needs HR request management access.' }
  const head = <PageHead eyebrow="People · Management" title="People" />

  if (!read.ok) {
    return (
      <HvPage>
        {head}
        <div className={s.blocked} role="note">
          <p>{read.reason}</p>
          <Link
            href={read.subSlug ? `${revenuePath(read.subSlug, 'hierarchy')}?tab=waiting` : '/team/people'}
            className={`${btn('outline')} ${s.blockedLink}`}
          >
            {read.subSlug ? 'Back to waiting list' : 'Back to People'}
          </Link>
        </div>
      </HvPage>
    )
  }

  const full = fullText(read.facts)
  const blocked = !sees(viewer, 'nric') || !sees(viewer, 'bank')
    ? 'Transferring needs NRIC and Bank accounts ticked for your title — the form files both.'
    : full
      ? `${full} Raise the limit on Rules › Capacity first.`
      : null

  return (
    <HvPage>
      {head}
      <WaitingTransferForm
        facts={read.facts}
        subSlug={read.subSlug}
        titles={read.titles}
        managers={read.managers}
        today={officeToday()}
        blocked={blocked}
      />
    </HvPage>
  )
}
