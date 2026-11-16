'use client'

import { useEffect, useRef, type CSSProperties } from 'react'
import type { FinishCfg } from '@/lib/marketing/flow'
import type { WfGroup, WfPerson, WfStage } from '@/lib/marketing/workflows'
import Tip from '../ui/Tip'
import StageCard, { type CardPart } from './StageCard'
import w from './workflows.module.css'

// The flow row (2a), as a scroll row (the 2026-11-17 handoff's 3a — `docs/design_handoff_workflow_projects/` §1.1;
// the user picked 3a, 3b's wrap was not built): every card in one grid, `repeat(n, minmax(150px, 1fr)) 84px`, joined by
// 12px lines, inside a row that scrolls sideways; the 76px green 🏁 Done card pinned on the right (sticky, white behind
// it, a soft shadow on its left) opens the End settings. Selecting a stage — its card, a time-bar segment, a warning's
// Fix — brings its card into view at once (no smooth scroll), 96px kept clear on the right for Done.

const CELEB_ICON: Record<FinishCfg['celebration'], string> = { fireworks: '🎆', cheers: '🍻', movie: '🎬', confetti: '🎉', custom: '🖼️' }
/** Kept clear on the right for the pinned Done card. */
const PIN = 96

/** Scrolls `row` so stage `at`'s cell is in view, Done's room kept; nothing when the row does not scroll. */
export function reveal(row: HTMLElement, at: number) {
  const cell = row.querySelector<HTMLElement>(`[data-i="${at}"]`)
  if (!cell || row.scrollWidth <= row.clientWidth) return
  const left = cell.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft
  if (left < row.scrollLeft) row.scrollLeft = left - 8
  else if (left + cell.offsetWidth > row.scrollLeft + row.clientWidth - PIN) row.scrollLeft = left + cell.offsetWidth - row.clientWidth + PIN
}

export default function FlowRow({
  stages,
  selected,
  endOn,
  finish,
  groups,
  people,
  fills,
  nameOf,
  onSelect,
  onMenu,
  onEnd,
}: {
  /** As they run (the lock applied). */
  stages: WfStage[]
  selected: number | null
  endOn: boolean
  finish: FinishCfg
  groups: WfGroup[]
  people: WfPerson[]
  /** Each stage's FILLS IN words, null for nothing to fill. */
  fills: (string | null)[]
  nameOf: (id: string) => string
  onSelect: (at: number, part?: CardPart) => void
  onMenu: (x: number, y: number, at: number) => void
  onEnd: () => void
}) {
  const row = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (row.current && selected != null) reveal(row.current, selected)
  }, [selected, stages.length])
  const n = stages.length
  return (
    <>
      <div className={w.flowNote}>
        <Tip text="Scroll sideways, or click the time bar to jump to a stage. 🏁 Done stays pinned on the right.">
          <strong className={w.flowCount} tabIndex={0}>{n} stage{n === 1 ? '' : 's'}</strong>
        </Tip>
      </div>
      <div ref={row} className={w.flowRow} data-testid="flow-row">
        <div className={w.flow} style={{ gridTemplateColumns: `repeat(${n}, minmax(150px, 1fr)) 84px` } as CSSProperties}>
          {stages.map((s, i) => (
            <div key={s.sid} className={w.cell} data-i={i}>
              <StageCard
                stage={s}
                at={i}
                before={i > 0 ? stages[i - 1].name || 'Untitled stage' : null}
                selected={i === selected}
                groups={groups}
                people={people}
                fills={fills[i] ?? null}
                nameOf={nameOf}
                onSelect={part => onSelect(i, part)}
                onMenu={(x, y) => onMenu(x, y, i)}
              />
              {i < n - 1 ? <div className={w.join}><span className={w.joinLine} /></div> : <div className={w.join} />}
            </div>
          ))}
          <div className={w.endPin}>
            <button type="button" className={`${w.end}${endOn ? ` ${w.endOn}` : ''}`} onClick={onEnd} aria-pressed={endOn} aria-label="Task done settings">
              <span className={w.endFlag}>🏁</span>
              <span className={w.endDone}>Done</span>
              <span className={w.endSum}>🔔 {finish.notify.length} · {CELEB_ICON[finish.celebration]}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
