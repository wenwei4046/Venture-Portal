'use client'

import type { FinishCfg } from '@/lib/marketing/flow'
import type { WfGroup, WfPerson, WfStage } from '@/lib/marketing/workflows'
import StageCard from './StageCard'
import w from './workflows.module.css'

// The flow row (2a): the stage cards left to right (flex 1 1 0, at least 118px; past six they wrap, each at most a
// sixth), joined by 12px lines, and the 76px green 🏁 Done card after the last that opens the End settings.

const CELEB_ICON: Record<FinishCfg['celebration'], string> = { fireworks: '🎆', cheers: '🍻', movie: '🎬', confetti: '🎉', custom: '🖼️' }

export default function FlowRow({
  stages,
  selected,
  endOn,
  finish,
  groups,
  people,
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
  nameOf: (id: string) => string
  onSelect: (at: number, section?: 'who' | 'appr') => void
  onMenu: (x: number, y: number, at: number) => void
  onEnd: () => void
}) {
  const wrap = stages.length > 6
  return (
    <div className={w.flow}>
      {stages.map((s, i) => (
        <div key={s.sid} className={`${w.cell}${wrap ? ` ${w.cellWrap}` : ''}`}>
          <StageCard
            stage={s}
            at={i}
            before={i > 0 ? stages[i - 1].name || 'Untitled stage' : null}
            selected={i === selected}
            groups={groups}
            people={people}
            nameOf={nameOf}
            onSelect={section => onSelect(i, section)}
            onMenu={(x, y) => onMenu(x, y, i)}
          />
          <div className={w.join}><span className={w.joinLine} /></div>
        </div>
      ))}
      <button type="button" className={`${w.end}${endOn ? ` ${w.endOn}` : ''}`} onClick={onEnd} aria-pressed={endOn} aria-label="Task done settings">
        <span className={w.endFlag}>🏁</span>
        <span className={w.endDone}>Done</span>
        <span className={w.endSum}>🔔 {finish.notify.length} · {CELEB_ICON[finish.celebration]}</span>
      </button>
    </div>
  )
}
