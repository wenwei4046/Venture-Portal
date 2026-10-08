'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { SlidingTabs, type TabItem } from '@/components/motion/SlidingTabs'
import type { PermissionsData } from '../../_lib/permission-templates'
import PeopleDirectory, { type AccountRow, type PersonRow } from './PeopleDirectory'
import PermissionTemplates from './PermissionTemplates'
import InviteDrawer, { type InviteCandidate } from './InviteDrawer'

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
  canManagePermissions: boolean
  canSeeHistory: boolean
  canInvite: boolean
  /** Team · Create — adding somebody, by hand or from InfoTech (2026-10-08, PR2). */
  canAddPeople: boolean
  candidates: InviteCandidate[]
  /** `?template=` — the template a Hierarchy › Roles link opens on. */
  initialTemplateId: string | null
  /** `?invite=` — the drawer opens on load, with that person picked if one was named. */
  initialInvite: { staffId: string | null } | null
}

/**
 * People Management (2026-10-08, the Claude Design handoff): the roster and,
 * a tab over, the permission templates — Permissions merged in from its own
 * page, as Roles merged into Hierarchy. The tab is `?tab=`, pushed with the
 * browser's own history the way Hierarchy's is, so switching is a re-render
 * and Back returns to the last view. Invite user is a drawer over either.
 */
export default function PeopleManagement({
  people,
  unattachedAccounts,
  canSeeActivity,
  permissions,
  canManagePermissions,
  canSeeHistory,
  canInvite,
  canAddPeople,
  candidates,
  initialTemplateId,
  initialInvite,
}: Props) {
  const searchParams = useSearchParams()
  const tab = peopleTab(searchParams.get('tab'))
  const [notice, setNotice] = useState<string | null>(null)
  const [invite, setInvite] = useState<{ staffId: string | null } | null>(canInvite ? initialInvite : null)

  // A deep link opens the drawer once; it should not reopen it on every refresh.
  useEffect(() => {
    if (!searchParams.get('invite')) return
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

  const tabs: TabItem[] = [
    { key: 'people', label: 'People', count: people.filter(p => p.active).length },
    { key: 'permissions', label: 'Permissions', count: permissions.templates.length },
  ]

  return (
    <div>
      <div className="page-head tabbed">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> PEOPLE · MANAGEMENT
          </div>
          <h1 className="page-title">People</h1>
          <p className="text-[12px] leading-normal mt-3 max-w-[672px]">
            {tab === 'permissions'
              ? 'What each title may do, set once per template: a function, an action on it, and how far that reaches — their own records, their department, or the whole company. Titles point at a template; one person can still be raised or lowered on their own.'
              : 'Everyone on the payroll, the title they hold and the department it sits under. An account is what lets somebody sign in — most of the roster has none yet.'}
          </p>
        </div>
        {/* One orange action — adding somebody; the other two are the sheet's
            outlined buttons. */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canInvite ? (
            <button
              type="button"
              onClick={() => setInvite({ staffId: null })}
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors whitespace-nowrap"
            >
              Invite user
            </button>
          ) : null}
          {canAddPeople ? (
            <>
              <Link
                href="/team/people/import"
                className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors whitespace-nowrap"
              >
                Import InfoTech
              </Link>
              <Link
                href="/team/people/new"
                className="bg-accent hover:bg-accent-hover text-ink text-sm px-4 py-2 rounded-control transition-colors whitespace-nowrap"
              >
                + Add person
              </Link>
            </>
          ) : null}
        </div>
      </div>

      <SlidingTabs items={tabs} active={tab} onTabChange={goTo} variant="control" />

      {notice ? (
        <div className="sheet-notice !mt-0 mb-4 flex justify-between gap-3" role="status">
          <span>{notice}</span>
          <button type="button" className="perm-link shrink-0" onClick={() => setNotice(null)}>
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
          onNotice={setNotice}
        />
      ) : (
        <PeopleDirectory
          people={people}
          unattachedAccounts={unattachedAccounts}
          canSeeActivity={canSeeActivity}
          onInvite={canInvite ? staffId => setInvite({ staffId }) : undefined}
        />
      )}

      {invite ? (
        <InviteDrawer
          candidates={candidates}
          templates={permissions.templates}
          functions={permissions.functions}
          cellKeys={permissions.cellKeys}
          canSetCells={canManagePermissions}
          initialStaffId={invite.staffId}
          onClose={() => setInvite(null)}
          onCreated={message => {
            setInvite(null)
            setNotice(message)
          }}
        />
      ) : null}
    </div>
  )
}
