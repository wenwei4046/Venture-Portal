'use client'

import type { StageRef } from '@/lib/marketing/canvas'
import CanvasStageChips from './CanvasStageChips'
import CanvasSwitch from './CanvasSwitch'
import c from './canvas.module.css'

// A section's settings (`Canvas Template Editor.dc.html`): 🔒 locked, ⭐ required before submit, 👁 visible to PIC, and
// which stage it belongs to (or any). 📋 Requirements sets only whether the PIC sees it.

export interface SecSettings {
  locked: boolean
  req: boolean
  pic: boolean
}

export default function CanvasSectionPop({
  title,
  sec,
  only,
  stages,
  stage,
  onChange,
  onStage,
  onRemove,
  onClose,
}: {
  title: string
  sec: SecSettings
  /** Only whether the PIC sees it is set (📋 Requirements). */
  only?: 'pic'
  stages: readonly StageRef[]
  stage: string | null
  onChange: (next: SecSettings) => void
  onStage?: (sid: string | null) => void
  onRemove?: () => void
  onClose: () => void
}) {
  return (
    <div className={`${c.pop} ${c.popSec}`} role="dialog" aria-label={`Section ${title}`} onClick={e => e.stopPropagation()}>
      <div className={c.popHead}>
        <span className={c.popLabel}>Section · {title}</span>
        <button type="button" className={c.popX} aria-label="Close" onClick={onClose}>×</button>
      </div>
      {only === 'pic' ? (
        <>
          <CanvasSwitch on label="🔒 Locked — colleagues can't delete" disabled onChange={() => undefined} />
          <CanvasSwitch on={sec.pic} label="👁 Visible to PIC" onChange={pic => onChange({ ...sec, pic })} />
        </>
      ) : (
        <>
          <CanvasSwitch on={sec.locked} label="🔒 Locked — colleagues can't delete" onChange={locked => onChange({ ...sec, locked })} />
          <CanvasSwitch on={sec.req} label="⭐ Required before submit" onChange={req => onChange({ ...sec, req })} />
          <CanvasSwitch on={sec.pic} label="👁 Visible to PIC" onChange={pic => onChange({ ...sec, pic })} />
          <div className={c.popRule}>
            <CanvasStageChips stages={stages} value={stage} any onPick={sid => onStage?.(sid)} />
          </div>
        </>
      )}
      {onRemove ? (
        <div className={c.popFoot}>
          <button type="button" className={c.popRemove} onClick={onRemove}>Remove section</button>
        </div>
      ) : null}
    </div>
  )
}
