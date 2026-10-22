'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { HvPage, PageHead, btn } from '@/components/hrv/kit'
import { Tabs } from '@/components/hrv/tabs'
import { flash } from '@/components/hrv/toast'
import type { PermissionsData } from '../../_lib/permission-templates'
import PeopleDirectory, { type AccountRow, type PersonRow } from './PeopleDirectory'
import PermissionTemplates from './PermissionTemplates'
import InviteDialog, { type InviteCandidate, type InviteNotice, type PendingInvite } from './InviteDialog'
import SecretText from './SecretText'
import s from './people.module.css'

export type PeopleTab = 'people' | 'permissions'

/** The tab a `?tab=` value names. Anything else is the roster. */
export function peopleTab(param: string | null | undefined): PeopleTab {
  return param === 'permissions' ? 'permissions' : 'people'
}

interface Props {
  people: PersonRow[]
  unattachedAccounts: AccountRow[]
  canSeeActivity: boolean
  permissions: PermissionsData
  /** The Permissions tab: not for somebody who reads People through the directory (PR4b). */
  showPermissions: boolean
  canManagePermissions: boolean
  canSeeHistory: boolean
  canInvite: boolean
  /** Team · Create — adding somebody, by hand or from InfoTech (2026-10-08, PR2). */
  canAddPeople: boolean
  candidates: InviteCandidate[]
  /** Sent an invite link they never used (2026-10-16): Invite user asks them again. */
  pendingInvites: PendingInvite[]
  /** Who this reader may not give a login, and why: a full-access title, for whoever does not manage permissions (2026-10-20). */
  inviteHeld: Readonly<Record<string, string>>
  /** `?template=` — the template a Hierarchy › Roles link opens on. */
  initialTemplateId: string | null
  /** `?invite=` — the invite window opens on load, with that person picked if one was named. */
  initialInvite: { staffId: string | null } | null
}

/**
 * People Management as the HR revamp draws it (2026-10-10, the handoff's
 * variant A): the kit's head with Invite user · Import InfoTech · + Add
 * person, compact tabs People · Permissions, the roster below. The tab is
 * `?tab=`, pushed with the browser's own history so Back returns to the last
 * view; Invite user is a window over either.
 */
export default function PeopleManagement({
  people,
  unattachedAccounts,
  canSeeActivity,
  permissions,
  showPermissions,
  canManagePermissions,
  canSeeHistory,
  canInvite,
  canAddPeople,
  candidates,
  pendingInvites,
  inviteHeld,
  initialTemplateId,
  initialInvite,
}: Props) {
  const searchParams = useSearchParams()
  const tab = showPermissions ? peopleTab(searchParams.get('tab')) : 'people'
  const [notice, setNotice] = useState<InviteNotice | null>(null)
  const heldAtFirst = initialInvite?.staffId ? (inviteHeld[initialInvite.staffId] ?? null) : null
  const [invite, setInvite] = useState<{ staffId: string | null } | null>(canInvite && !heldAtFirst ? initialInvite : null)

  /** Invite user for somebody, from any door (a row, their window, their page) — or why not, for a full-access title. */
  function openInvite(staffId: string) {
    const held = inviteHeld[staffId]
    if (held) return flash(held)
    setInvite({ staffId })
  }

  // A deep link opens the window once; it should not reopen it on every refresh.
  useEffect(() => {
    if (!searchParams.get('invite')) return
    if (canInvite && heldAtFirst) flash(heldAtFirst)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('invite')
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function goTo(key: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (key === 'people') params.delete('tab')
    else params.set('tab', key)
    params.delete('template')
    const qs = params.toString()
    window.history.pushState(null, '', qs ? `?${qs}` : window.location.pathname)
  }

  return (
    <HvPage>
      <PageHead
        eyebrow="People · Management"
        title="People"
        right={
          canInvite || canAddPeople ? (
            <div className={s.headActions}>
              {canInvite ? (
                <button type="button" className={`${btn('outline')} ${s.headBtn}`} onClick={() => setInvite({ staffId: null })}>
                  Invite user
                </button>
              ) : null}
              {canAddPeople ? (
                <>
                  <Link href="/team/people/import" className={`${btn('outline')} ${s.headBtn}`}>
                    Import InfoTech
                  </Link>
                  <Link href="/team/people/new" className={`${btn('primary')} ${s.headBtn}`}>
                    + Add person
                  </Link>
                </>
              ) : null}
            </div>
          ) : undefined
        }
      />

      {showPermissions ? (
        <Tabs
          items={[
            { key: 'people', label: 'People' },
            { key: 'permissions', label: 'Permissions' },
          ]}
          active={tab}
          onSelect={goTo}
          size="compact"
          label="People"
          style={{ margin: '-4px 0 16px' }}
        />
      ) : null}

      {notice ? (
        <div className={s.notice} role="status">
          <span>
            {notice.text}
            {notice.secret ? <SecretText value={notice.secret} /> : null}
          </span>
          <button type="button" className={s.noticeDismiss} onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {tab === 'permissions' ? (
        <PermissionTemplates
          data={permissions}
          canManage={canManagePermissions}
          canSeeHistory={canSeeHistory}
          initialTemplateId={initialTemplateId}
          onNotice={text => setNotice({ text })}
        />
      ) : (
        <PeopleDirectory
          people={people}
          unattachedAccounts={unattachedAccounts}
          canSeeActivity={canSeeActivity}
          onInvite={canInvite ? openInvite : undefined}
        />
      )}

      {invite ? (
        <InviteDialog
          candidates={candidates}
          pending={pendingInvites}
          templates={permissions.templates}
          initialStaffId={invite.staffId}
          onClose={() => setInvite(null)}
          onCreated={message => {
            setInvite(null)
            setNotice(message)
          }}
        />
      ) : null}
    </HvPage>
  )
}
