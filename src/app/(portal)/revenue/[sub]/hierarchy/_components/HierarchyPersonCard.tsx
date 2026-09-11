'use client'

import { createContext, useContext } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { ratePct } from '@/lib/commission/ranks'
import { NODE_HEIGHT, NODE_WIDTH } from '@/lib/org-layout'
import { hierarchyTitleAppearance } from '@/lib/hierarchy-title-appearance'
import type { PopAnchor } from './MovePopover'
import type { OrgPerson } from './org-chart-types'

export interface PersonCardData extends Record<string, unknown> {
  membershipId: string
  person: OrgPerson
  uplineName: string | null
  departmentName: string
  tone: number
  selected: boolean
  pending: boolean
}
export type PersonNode = Node<PersonCardData, 'person'>
export const UplineContext = createContext<(id: string, anchor: PopAnchor) => void>(() => {})

function rankChip(person: OrgPerson): string {
  const label = (person.rankLabel ?? '').replace(/^rank\s+/i, '')
  if (person.isGroupPackage) return `${label} · group`
  return person.productRate === null || label.includes('%') ? label : `${label} · ${ratePct(person.productRate)}`
}

export default function HierarchyPersonCard({ data }: NodeProps<PersonNode>) {
  const open = useContext(UplineContext)
  const { person, uplineName } = data
  const title = hierarchyTitleAppearance(person.titleName)
  return (
    <div
      className={`org-card space-person${data.selected ? ' sel' : ''}${person.rankId === null ? ' unplaced' : ''}`}
      data-space-tone={data.tone}
      style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
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
        onClick={event => {
          const rect = event.currentTarget.getBoundingClientRect()
          open(data.membershipId, { left: rect.left, top: rect.top, bottom: rect.bottom })
        }}
      >
        <span className="k">Upline</span>
        <span className={`v${uplineName ? '' : ' top'}`}>{uplineName ?? 'Top of team'}</span>
        <span aria-hidden className="text-accent">⌄</span>
      </button>
      <Handle type="source" position={Position.Bottom} isConnectable={!data.pending} />
    </div>
  )
}
