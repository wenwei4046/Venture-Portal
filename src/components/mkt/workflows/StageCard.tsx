'use client'

import type { CSSProperties, MouseEvent } from 'react'
import { apprText, type WfGroup, type WfPerson, type WfStage } from '@/lib/marketing/workflows'
import { personBg } from '../builder/people'
import { longPress } from './longPress'
import w from './workflows.module.css'

// One stage on the flow row (2a; refined by the 2026-11-17 handoff, `docs/design_handoff_workflow_projects/` §1.2,
// §1.4): its number and name; DONE BY — grey: three of the team's faces side by side (22px, 3px apart, never
// overlapping) over "Anyone · {n}" / "picked per project"; amber: the shortlist's faces, the same way, over their names
// and "🔓 picked by {stage before}"; red "No shortlist · Add people →" (a click opens Who does it); APPROVED BY — the
// levels joined by "→" (a click opens Approval); FILLS IN — "{n} fields · {r} required" from the canvas, or "Nothing to
// fill" (a click opens PIC & form and flashes the list under the settings); the group's dot and name, and "{sla}d".

export type CardPart = 'who' | 'appr' | 'fills'

export default function StageCard({
  stage,
  at,
  before,
  selected,
  groups,
  people,
  fills,
  nameOf,
  onSelect,
  onMenu,
}: {
  /** As it runs (the lock applied). */
  stage: WfStage
  at: number
  /** The stage before's name (who hands it over). */
  before: string | null
  selected: boolean
  groups: WfGroup[]
  /** Marketing's whole team (Anyone can assign). */
  people: WfPerson[]
  /** "3 fields · 2 required", or null for nothing to fill. */
  fills: string | null
  nameOf: (id: string) => string
  onSelect: (part?: CardPart) => void
  onMenu: (x: number, y: number) => void
}) {
  const prev = stage.who.mode === 'prev'
  const cands = stage.who.cands
  const group = groups.find(g => g.key === stage.dept) ?? null
  const hue = group ? ({ '--g-h': group.hue } as CSSProperties) : undefined
  const name = stage.name || 'Untitled stage'
  const menu = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onMenu(e.clientX, e.clientY)
  }
  const faces = (ids: string[]) => (
    <div className={w.avs}>
      {ids.slice(0, 3).map(c => {
        const p = people.find(x => x.id === c)
        return <span key={c} title={nameOf(c)} className={w.av} style={{ background: personBg(p ? { group: p.title } : undefined) }}>{nameOf(c).charAt(0).toUpperCase()}</span>
      })}
    </div>
  )
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Stage ${at + 1} · ${name}`}
      className={`${w.card}${selected ? ` ${w.cardOn}` : ''}`}
      onClick={() => onSelect()}
      onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) onSelect() }}
      onContextMenu={menu}
      {...longPress((x, y) => onMenu(x, y))}
    >
      <div className={w.cardHead}>
        <span className={w.num}>{at + 1}</span>
        <span className={w.cardName}>{name}</span>
      </div>
      <div
        className={`${w.who}${prev ? (cands.length ? ` ${w.whoPrev}` : ` ${w.whoEmpty}`) : ''}`}
        onClick={e => { e.stopPropagation(); onSelect('who') }}
      >
        <span className={w.kicker}>Done by</span>
        {!prev ? (
          <div className={w.whoStack}>
            {faces(people.map(p => p.id))}
            <div className={w.whoText}><span className={w.whoMain}>Anyone · {people.length}</span><span className={w.whoSub}>picked per project</span></div>
          </div>
        ) : cands.length ? (
          <div className={w.whoStack}>
            {faces(cands)}
            <div className={w.whoText}>
              <span className={w.whoMain}>{cands.map(nameOf).join(' / ')}</span>
              <span className={w.whoSub}>🔓 picked by {before || 'previous stage'}</span>
            </div>
          </div>
        ) : (
          <div className={w.whoText}><span className={w.whoEmptyMain}>No shortlist</span><span className={w.whoEmptySub}>Add people →</span></div>
        )}
      </div>
      <div className={w.appr} onClick={e => { e.stopPropagation(); onSelect('appr') }}>
        <span className={w.kicker}>Approved by</span>
        <span className={`${w.apprText}${stage.appr.length ? '' : ` ${w.apprNone}`}`}>{apprText(stage.appr, nameOf)}</span>
      </div>
      <div className={w.fills} title="See what this stage fills in" onClick={e => { e.stopPropagation(); onSelect('fills') }}>
        <span className={w.kicker}>Fills in</span>
        <span className={`${w.fillsText}${fills ? '' : ` ${w.fillsNone}`}`}>{fills ?? 'Nothing to fill'}</span>
      </div>
      <div className={w.cardFoot} style={hue}>
        <span className={`${w.dot}${group ? '' : ` ${w.dotNone}`}`} />
        <span className={w.deptName}>{group?.name ?? '—'}</span>
        <span className={w.sla}>{stage.sla}d</span>
      </div>
    </div>
  )
}
