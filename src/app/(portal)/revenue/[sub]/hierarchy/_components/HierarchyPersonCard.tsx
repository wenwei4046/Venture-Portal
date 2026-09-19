'use client'

import { createContext, useContext } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { ratePct } from '@/lib/commission/ranks'
import { NODE_HEIGHT, NODE_WIDTH } from '@/lib/org-layout'
import { headsLabel } from '@/lib/department-heads'
import { hierarchyTitleAppearance } from '@/lib/hierarchy-title-appearance'
import type { PopAnchor } from './MovePopover'
import type { OrgPerson } from './org-chart-types'

export interface PersonCardData extends Record<string, unknown> {
  membershipId: string
  person: OrgPerson
  uplineName: string | null
  departmentName: string
  /**
   * The sub-department's heads, by name. At the top of a tree the last row
   * names them instead of "Top of team": that is who the leader reports to
   * (2026-09-11) — a reporting line, not an upline, so no override.
   */
  directorNames: readonly string[]
  tone: number
  selected: boolean
  pending: boolean
}
export type PersonNode = Node<PersonCardData, 'person'>
export const UplineContext = createContext<(id: string, anchor: PopAnchor) => void>(() => {})
export const PersonMenuContext = createContext<(id: string, anchor: PopAnchor) => void>(() => {})

function rankChip(person: OrgPerson): string {
  const label = (person.rankLabel ?? '').replace(/^rank\s+/i, '')
  if (person.isGroupPackage) return `${label} · group`
  return person.productRate === null || label.includes('%') ? label : `${label} · ${ratePct(person.productRate)}`
}

export default function HierarchyPersonCard({ data }: NodeProps<PersonNode>) {
  const open = useContext(UplineContext)
  const openMenu = useContext(PersonMenuContext)
  const { person, uplineName } = data
  const title = hierarchyTitleAppearance(person.titleName)
  // At the top of a tree the line goes up to the sub-department's director(s).
  const reportsTo = uplineName === null && data.directorNames.length ? headsLabel(data.directorNames) : null
  return (
    <div
      className={`org-card space-person${data.selected ? ' sel' : ''}${person.rankId === null ? ' unplaced' : ''}`}
      data-space-tone={data.tone}
      style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
      tabIndex={0}
      aria-label={`${person.name} in ${data.departmentName}`}
      aria-haspopup="menu"
      onContextMenu={event => {
        event.preventDefault()
        event.stopPropagation()
        if (data.pending) return
        event.currentTarget.focus({ preventScroll: true })
        openMenu(data.membershipId, { left: event.clientX, top: event.clientY, bottom: event.clientY })
      }}
      onKeyDown={event => {
        if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
        event.preventDefault()
        event.stopPropagation()
        if (data.pending) return
        const rect = event.currentTarget.getBoundingClientRect()
        openMenu(data.membershipId, { left: rect.left, top: rect.top, bottom: rect.bottom })
      }}
    >
      <Handle type="target" position={Position.Top} isConnectable={!data.pending} />
      <div className="oc-top">
        <div className="oc-nm" title={`${person.name} · ${data.departmentName}`}>{person.name}</div>
        <span className={`oc-rank${person.rankLabel ? '' : ' none'}`} title={person.rankPayLabel}>
          {person.rankLabel ? rankChip(person) : 'no rank yet'}
        </span>
      </div>
      <div className="oc-tt oc-title-row">
        <span className="oc-title-badge" data-title-tone={title.tone}>
          <span className="oc-title-marker" aria-hidden="true">{title.marker}</span>
          <span className="oc-title-label">{title.label}</span>
        </span>
        {!person.canRecruit ? <span className="nd">· no downlines</span> : null}
        {person.rateMode === 'fixed' ? <span className="nd">· manual</span> : null}
      </div>
      {person.directLineLimit != null ? (
        <div className="oc-tt" title={person.expansionEarnedAt ? `SDL earned in ${person.expansionSourcePeriod?.slice(0, 7) ?? 'an applied month'}. Opened slots are retained.` : 'Additional direct lines require qualification in their opening month.'}>
          {person.directLineCount ?? 0}/{person.directLineLimit} directs{person.expansionEarnedAt ? ' · SDL earned' : ''}
        </div>
      ) : null}
      <button
        type="button"
        className="oc-up nodrag nopan"
        data-org-open
        disabled={data.pending}
        aria-label={`Change upline of ${person.name} in ${data.departmentName}`}
        title={reportsTo ? `Top of a tree — reports to ${reportsTo}, the sub-department's director. A reporting line only: no override.` : undefined}
        onClick={event => {
          const rect = event.currentTarget.getBoundingClientRect()
          open(data.membershipId, { left: rect.left, top: rect.top, bottom: rect.bottom })
        }}
      >
        <span className="k">{reportsTo ? 'Reports to' : 'Upline'}</span>
        <span className={`v${uplineName ? '' : ' top'}`}>{uplineName ?? reportsTo ?? 'Top of team'}</span>
        <span aria-hidden className="text-accent">⌄</span>
      </button>
      <Handle type="source" position={Position.Bottom} isConnectable={!data.pending} />
    </div>
  )
}
