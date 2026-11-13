'use client'

import type { CSSProperties, MouseEvent } from 'react'
import { apprText, type WfGroup, type WfPerson, type WfStage } from '@/lib/marketing/workflows'
import { personBg } from '../builder/people'
import { longPress } from './longPress'
import w from './workflows.module.css'

// One stage on the flow row (2a): its number and name; DONE BY — grey "MM assigns · per project", amber the
// shortlist's faces and "🔓 picked by {stage before}", red "No shortlist · Add people →" (a click opens Who does it);
// APPROVED BY — the levels joined by "→" (a click opens Approval); the group's dot and name, and "{sla}d".

export default function StageCard({
  stage,
  at,
  before,
  selected,
  groups,
  people,
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
  people: WfPerson[]
  nameOf: (id: string) => string
  onSelect: (section?: 'who' | 'appr') => void
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
          <div className={w.whoRow}>
            <span className={w.mmAv}>MM</span>
            <div className={w.whoText}><span className={w.whoMain}>MM assigns</span><span className={w.whoSub}>per project</span></div>
          </div>
        ) : cands.length ? (
          <div className={w.whoRow}>
            <div className={w.avs}>
              {cands.slice(0, 3).map(c => {
                const p = people.find(x => x.id === c)
                return <span key={c} title={nameOf(c)} className={w.av} style={{ background: personBg(p ? { group: p.title } : undefined) }}>{nameOf(c).charAt(0).toUpperCase()}</span>
              })}
            </div>
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
      <div className={w.cardFoot} style={hue}>
        <span className={`${w.dot}${group ? '' : ` ${w.dotNone}`}`} />
        <span className={w.deptName}>{group?.name ?? '—'}</span>
        <span className={w.sla}>{stage.sla}d</span>
      </div>
    </div>
  )
}
