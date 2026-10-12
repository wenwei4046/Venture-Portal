'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { HvPage, PageHead, btn } from '@/components/hrv/kit'
import { Tabs } from '@/components/hrv/tabs'
import type { RolePerson, RoleRung, RoleTitle } from '@/lib/hierarchy-roles'
import TeamOrgChart, { ALL_DEPARTMENTS, type ChartPerson } from './TeamOrgChart'
import PeopleRoles from './PeopleRoles'
import LevelsList from './LevelsList'
import TitleWindow, { type DepartmentOption } from './TitleWindow'

export type HierarchyTab = 'chart' | 'roles' | 'levels'

/**
 * The view a `?tab=` value names. Anything else is the chart; the old Table
 * (2026-09) and Roles (2026-10-08) tabs became People & roles.
 */
export function hierarchyTab(param: string | null | undefined): HierarchyTab {
  if (param === 'levels') return 'levels'
  return param === 'roles' || param === 'table' ? 'roles' : 'chart'
}

/**
 * People › Hierarchy as the HR revamp draws it (2026-10-10, the handoff's
 * variant A): Org chart · People & roles · Levels.
 *
 *   Org chart       the canvas, as it was (the user: the chart stays) —
 *                   drag, or draw a line from a manager down; search a name.
 *   People & roles  a band per title over the people holding it, with its
 *                   level and permission template; + New title, and Edit on
 *                   each band (what the Roles tab's rows did).
 *   Levels          the ladder top down, its titles as chips — drag one to
 *                   another level, rename a level, add one on top.
 *
 * The tab is `?tab=`, pushed with the browser's own history so Next syncs
 * `useSearchParams` without a round trip and Back returns to the last view.
 */
export default function HierarchyView({
  people,
  chartPeople = people,
  commissionHref,
  rungs,
  breaks,
  roleTitles,
  rolePeople,
  departments,
  canDeleteTitles,
  canEdit,
  canManage,
  chartOnly = false,
}: {
  people: ChartPerson[]
  /** Includes extra scheme-specific roles. */
  chartPeople?: ChartPerson[]
  commissionHref: string | null
  rungs: RoleRung[]
  /** Reporting lines the ladder, as it stands, would refuse. */
  breaks: Array<{ id: string; managerId: string }>
  /** Every title, with its rung and template. */
  roleTitles: RoleTitle[]
  /** The roster by title, for People & roles and the Levels counts. */
  rolePeople: RolePerson[]
  departments: DepartmentOption[]
  canDeleteTitles: boolean
  /** Team · Edit: the chart's lines may be dragged and redrawn. */
  canEdit: boolean
  /** Team · Manage: titles and the ladder may be written. */
  canManage: boolean
  /**
   * Somebody who reads People through the directory (Team · View without the
   * Salary tick, 2026-10-10, PR4b): the whole company's chart, names and
   * titles only — no People & roles or Levels.
   */
  chartOnly?: boolean
}) {
  const searchParams = useSearchParams()
  const tab = chartOnly ? 'chart' : hierarchyTab(searchParams.get('tab'))
  // Who is lit up, and the department chips — held here so they survive a
  // switch to another tab and back.
  const [focused, setFocused] = useState<string | null>(null)
  const [focusDept, setFocusDept] = useState<string>(ALL_DEPARTMENTS)
  // The title window: an id, 'new', or closed.
  const [editing, setEditing] = useState<string | null>(null)

  function goTo(key: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (key === 'chart') params.delete('tab')
    else params.set('tab', key)
    const qs = params.toString()
    window.history.pushState(null, '', qs ? `?${qs}` : window.location.pathname)
  }

  const editingTitle = editing && editing !== 'new' ? (roleTitles.find(t => t.id === editing) ?? null) : null

  return (
    <HvPage>
      <PageHead
        eyebrow="People · Hierarchy"
        title="Hierarchy"
        right={
          tab === 'roles' && canManage ? (
            <button type="button" className={btn('outline')} onClick={() => setEditing('new')}>
              + New title
            </button>
          ) : undefined
        }
      />

      {chartOnly ? null : (
        <Tabs
          items={[
            { key: 'chart', label: 'Org chart' },
            { key: 'roles', label: 'People & roles', count: roleTitles.length },
            { key: 'levels', label: 'Levels' },
          ]}
          active={tab}
          onSelect={goTo}
          size="compact"
          label="Hierarchy"
          style={{ margin: '-4px 0 16px' }}
        />
      )}

      {tab === 'roles' ? (
        <PeopleRoles titles={roleTitles} rungs={rungs} people={rolePeople} canManage={canManage} onEdit={setEditing} />
      ) : tab === 'levels' ? (
        <LevelsList rungs={rungs} titles={roleTitles} people={rolePeople} breaks={breaks.length} canManage={canManage} />
      ) : people.length === 0 ? (
        <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
          <p className="text-md font-bold mb-2">Nobody to chart yet.</p>
          <p className="text-sm max-w-md mx-auto">Add people under People → People Management first.</p>
        </div>
      ) : (
        /* min-w-0 or the canvas — which is as wide as the tree is — sets the
           width of the row it sits in and pushes past the page. */
        <div className="min-w-0">
          <div className="sect-head">
            <h2>Staff hierarchy</h2>
            <span className="rule" aria-hidden />
            <span className="count">{people.length} PEOPLE · REPORTS TO</span>
          </div>
          <TeamOrgChart
            people={chartPeople}
            commissionHref={commissionHref}
            focused={focused}
            onFocus={setFocused}
            focusDept={focusDept}
            onFocusDept={setFocusDept}
            canEdit={canEdit}
          />
        </div>
      )}

      {editing ? (
        <TitleWindow
          key={editing}
          title={editingTitle}
          people={editingTitle ? rolePeople.filter(p => p.titleId === editingTitle.id).length : 0}
          rungs={rungs}
          departments={departments}
          canDelete={canDeleteTitles}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </HvPage>
  )
}
