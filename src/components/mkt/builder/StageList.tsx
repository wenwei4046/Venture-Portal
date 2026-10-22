'use client'

import { useState, type CSSProperties, type DragEvent, type ReactNode } from 'react'
import type { MktDept } from '@/lib/marketing/board'
import { DEPT_LABEL } from '@/lib/marketing/tasks'
import b from './builder.module.css'

// The builders' stages in order (`Workflow Builder.dc.html`): a card each — ⋮⋮ to drag, its number, its name, its team,
// how many fields it fills in, and the facts the builder shows under it — joined by short lines, + Add stage at the end.

export interface StageCardBase {
  key: string
  name: string
  dept: MktDept
  form: readonly unknown[]
}

const deptStyle = (d: MktDept): CSSProperties => ({ background: `var(--mk-team-${d}-bg)`, color: `var(--mk-team-${d})` })

/** One fact under a card's name: "Who Rachel", "SLA 2d" (mono), "Approval 👤 Rachel → 🔗 PIC". */
export function Fact({ k, children, mono, missing }: { k: string; children: ReactNode; mono?: boolean; missing?: boolean }) {
  return (
    <span className={b.wbFact}>
      <span className={b.wbFactK}>{k}</span>
      <span className={`${mono ? b.wbFactMono : b.wbFactV}${missing ? ` ${b.wbMissing}` : ''}`}>{children}</span>
    </span>
  )
}

export default function StageList<T extends StageCardBase>({
  stages,
  selected,
  onSelect,
  onMove,
  onAdd,
  facts,
}: {
  stages: readonly T[]
  selected: number
  onSelect: (i: number) => void
  /** Moved: `from` now stands at `to`. */
  onMove: (from: number, to: number) => void
  /** + Add stage; none when no more may be added. */
  onAdd: (() => void) | null
  facts: (stage: T, i: number) => ReactNode
}) {
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | 'end' | null>(null)

  const drop = (to: number) => {
    if (drag === null) return
    const target = to > drag ? to - 1 : to
    if (target !== drag) onMove(drag, target)
    setDrag(null)
    setOver(null)
  }

  return (
    <div className={b.wbStages}>
      {stages.map((x, i) => (
        <div
          key={x.key}
          onDragOver={e => {
            e.preventDefault()
            if (over !== i) setOver(i)
          }}
          onDrop={e => {
            e.preventDefault()
            drop(i)
          }}
        >
          <div className={`${b.wbDrop}${drag !== null && over === i && drag !== i && drag !== i - 1 ? ` ${b.wbDropOn}` : ''}`} />
          <div
            role="button"
            tabIndex={0}
            draggable
            onDragStart={(e: DragEvent) => {
              e.dataTransfer.effectAllowed = 'move'
              try {
                e.dataTransfer.setData('text/plain', String(i))
              } catch {
                // Some browsers refuse data on a drag; the index in state is enough.
              }
              setDrag(i)
            }}
            onDragEnd={() => {
              setDrag(null)
              setOver(null)
            }}
            onClick={() => onSelect(i)}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelect(i)}
            className={`${b.wbStage}${i === selected ? ` ${b.wbStageOn}` : ''}${drag === i ? ` ${b.wbStageDrag}` : ''}`}
          >
            <div className={b.wbRail}>
              <span className={b.wbGrip} title="Drag to reorder">⋮⋮</span>
              <span className={b.wbNum}>{i + 1}</span>
            </div>
            <div className={b.wbBody}>
              <div className={b.wbNameRow}>
                <span className={b.wbName}>{x.name || 'Untitled stage'}</span>
                <span className={b.wbTag} style={deptStyle(x.dept)}>{DEPT_LABEL[x.dept]}</span>
                {x.form.length ? <span className={`${b.wbTag} ${b.wbForm}`}>📝 {x.form.length} form field{x.form.length === 1 ? '' : 's'}</span> : null}
              </div>
              <div className={b.wbFacts}>{facts(x, i)}</div>
            </div>
          </div>
          {i < stages.length - 1 ? <div className={b.wbLink} /> : null}
        </div>
      ))}
      <div
        className={`${b.wbDrop}${drag !== null && over === 'end' ? ` ${b.wbDropOn}` : ''}`}
        style={{ marginTop: 6, minHeight: drag !== null ? 10 : 0 }}
        onDragOver={e => {
          e.preventDefault()
          if (over !== 'end') setOver('end')
        }}
        onDrop={e => {
          e.preventDefault()
          drop(stages.length)
        }}
      />
      {onAdd ? (
        <button type="button" className={b.wbAdd} onClick={onAdd}>
          + Add stage
        </button>
      ) : null}
    </div>
  )
}
