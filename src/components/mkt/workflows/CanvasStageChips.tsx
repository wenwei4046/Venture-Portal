'use client'

import type { StageRef } from '@/lib/marketing/canvas'
import c from './canvas.module.css'

// "🎯 Which stage fills this in?" — the template's real stages, by their keys (a stage renamed or moved keeps what it
// fills in). A section may also belong to any stage ("Any / read-only").

export default function CanvasStageChips({
  stages,
  value,
  any,
  onPick,
}: {
  stages: readonly StageRef[]
  value: string | null
  any?: boolean
  onPick: (sid: string | null) => void
}) {
  return (
    <div className={c.popPart}>
      <span>🎯 Which stage fills this in?</span>
      <div className={c.chips} role="radiogroup" aria-label="Which stage fills this in?">
        {any ? (
          <button type="button" role="radio" aria-checked={value === null} className={`${c.chip}${value === null ? ` ${c.chipOn}` : ''}`} onClick={() => onPick(null)}>
            Any / read-only
          </button>
        ) : null}
        {stages.map((s, i) => (
          <button key={s.sid} type="button" role="radio" aria-checked={value === s.sid} className={`${c.chip}${value === s.sid ? ` ${c.chipOn}` : ''}`} onClick={() => onPick(s.sid)}>
            {s.name || `Stage ${i + 1}`}
          </button>
        ))}
      </div>
      {!any && (value === null || !stages.some(s => s.sid === value)) ? <span className={c.popWarn}>Pick the stage that fills it in</span> : null}
    </div>
  )
}
