'use client'

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { HvPage, Toggle } from '@/components/hrv/kit'
import { Tabs } from '@/components/hrv/tabs'
import { openReplacements, waitingList, type SubDeptRequest } from '@/lib/commission/sales-group-requests'
import OrgChart, { type OrgDepartment } from './OrgChart'
import MembersGrid from './MembersGrid'
import WaitingList from './WaitingList'
import ReplacementList from './ReplacementList'
import type { TeamData } from '../../../_components/config/types'
import type { MembershipDestination } from '../../../_lib/membership-destinations'
import type { EmployeeDepartmentDestination } from '../../../_lib/employee-destinations'
import type { WaitingFormRead } from '../../../_lib/waiting-form'
import type { SubDepartmentCapacity } from '@/lib/commission/capacity'
import s from './sales-groups.module.css'

export type SalesGroupsTab = 'chart' | 'members' | 'waiting' | 'replacement'
const TABS: readonly SalesGroupsTab[] = ['chart', 'members', 'waiting', 'replacement']

/** `?tab=` → the tab; `team` was the Members tab's key until 2026-10-10. */
export function salesGroupsTab(raw: string | null, lists: boolean): SalesGroupsTab {
  const key = raw === 'team' ? 'members' : raw
  if (!TABS.includes(key as SalesGroupsTab)) return 'chart'
  if (!lists && (key === 'waiting' || key === 'replacement')) return 'chart'
  return key as SalesGroupsTab
}

/**
 * Sales Groups (was Staff Hierarchy; the HR revamp, 2026-10-10): Chart ·
 * Members N · Waiting list N · Replacement list N on one URL (`?tab=`, pushed
 * with the browser's history so Back steps through them).
 *
 * The chart is today's engine with the prototype's toolbar: this
 * sub-department alone, and its siblings beside it on "Show … alongside".
 * Members is the grid that edits Rank, Rate mode and Withholding. The two
 * lists are the member back office's requests of this sub-department, shown
 * only to whoever manages member requests (`requests` null otherwise).
 */
export default function SalesGroupsView({
  subDept,
  schemeId,
  team,
  departments,
  membershipDestinations,
  employeeDepartments = [],
  canManageEmployment = false,
  employmentToday = '',
  canEdit,
  requests,
  waitingForm = null,
  capacity = null,
  canTransfer = false,
  head,
}: {
  subDept: { name: string; slug: string; isHome: boolean }
  schemeId: string
  team: TeamData
  departments: OrgDepartment[]
  membershipDestinations: MembershipDestination[]
  employeeDepartments?: EmployeeDepartmentDestination[]
  canManageEmployment?: boolean
  employmentToday?: string
  /** Revenue · Edit. */
  canEdit: boolean
  /** The waiting-list and replacement requests; null = the viewer may not read them. */
  requests: { ok: true; rows: SubDeptRequest[] } | { ok: false; reason: string } | null
  /** The waiting-list form (Form settings, Upload form) — read with the requests. */
  waitingForm?: WaitingFormRead | null
  /** This sub-department's places: Transfer waits while it is full. */
  capacity?: SubDepartmentCapacity | null
  /** People › Create: Transfer files an employee. */
  canTransfer?: boolean
  head: ReactNode
}) {
  const searchParams = useSearchParams()
  const tab = salesGroupsTab(searchParams.get('tab'), requests !== null)
  const go = useCallback((next: string) => {
    const params = new URLSearchParams(window.location.search)
    if (next === 'chart') params.delete('tab')
    else params.set('tab', next)
    const qs = params.toString()
    window.history.pushState(null, '', qs ? `?${qs}` : window.location.pathname)
  }, [])

  const [alongside, setAlongside] = useState(false)
  const current = departments.find(d => d.schemeId === schemeId)
  const others = departments.filter(d => d.schemeId !== schemeId)
  const charted = useMemo(
    () => (alongside || !current ? departments : [current]),
    [alongside, current, departments],
  )
  const chartedPeople = charted.reduce((n, d) => n + d.people.length, 0)
  const currentDestination = membershipDestinations.find(d => d.schemeId === schemeId)
  const rows = requests?.ok ? requests.rows : []

  const items = [
    { key: 'chart', label: 'Chart' },
    { key: 'members', label: 'Members', count: team.people.length },
    ...(requests !== null
      ? [
          { key: 'waiting', label: 'Waiting list', count: waitingList(rows).length },
          { key: 'replacement', label: 'Replacement list', count: openReplacements(rows) },
        ]
      : []),
  ]

  return (
    <HvPage>
      {head}
      <Tabs items={items} active={tab} onSelect={go} label="Sales Groups" />

      {tab === 'members' ? (
        <MembersGrid
          people={team.people}
          ranks={team.ranks}
          titles={team.titles}
          candidates={team.candidates.filter(person => currentDestination?.eligibleStaffIds.includes(person.staff_id))}
          directors={team.directors}
          directorCandidates={team.directorCandidates}
          subDepartmentId={team.subDepartmentId}
          schemeId={schemeId}
          subDeptName={subDept.name}
          membershipDestinations={membershipDestinations}
          employeeDepartments={employeeDepartments}
          canManageEmployment={canManageEmployment}
          employmentToday={employmentToday}
          canEdit={canEdit}
        />
      ) : tab === 'waiting' || tab === 'replacement' ? (
        requests && !requests.ok ? (
          <p className={s.listError} role="alert">
            {requests.reason}
          </p>
        ) : tab === 'waiting' ? (
          <WaitingList
            rows={rows}
            subDeptName={subDept.name}
            subSlug={subDept.slug}
            form={waitingForm ?? { ok: false, reason: 'The waiting-list form could not be read.' }}
            capacity={capacity}
            canTransfer={canTransfer}
            subOptions={departments.map(d => d.name)}
          />
        ) : (
          <ReplacementList rows={rows} subDeptName={subDept.name} />
        )
      ) : chartedPeople === 0 ? (
        <NobodyYet
          isHome={subDept.isHome}
          othersName={others.map(o => o.name).join(' · ')}
          onShowOthers={!alongside && others.some(o => o.people.length > 0) ? () => setAlongside(true) : undefined}
        />
      ) : (
        <OrgChart
          departments={charted}
          membershipDestinations={membershipDestinations}
          employeeDepartments={employeeDepartments}
          canManageEmployment={canManageEmployment}
          employmentToday={employmentToday}
          initialDepartmentId={current?.id}
          toolbarToggle={
            others.length > 0 ? (
              <button type="button" className={s.alongside} role="switch" aria-checked={alongside} onClick={() => setAlongside(a => !a)}>
                <Toggle on={alongside} />
                Show {others.map(o => o.name).join(' · ')} alongside
              </button>
            ) : null
          }
        />
      )}
    </HvPage>
  )
}

function NobodyYet({ isHome, othersName, onShowOthers }: { isHome: boolean; othersName: string; onShowOthers?: () => void }) {
  return (
    <div className={s.empty}>
      <p className={s.emptyTitle}>Nobody to chart yet.</p>
      <p>
        {isHome
          ? 'Add salespeople under People Management with a commission department and a ladder title; they appear here with the rank their title gives.'
          : 'Add members on the Members tab — anybody in the department, with the title they hold here.'}
      </p>
      {onShowOthers ? (
        <button type="button" className={s.alongsideLink} onClick={onShowOthers}>
          Show {othersName} alongside
        </button>
      ) : null}
    </div>
  )
}
