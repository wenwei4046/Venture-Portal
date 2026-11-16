'use client'

import type { StageFill } from '@/lib/marketing/canvas'
import Tip from '../ui/Tip'
import w from './workflows.module.css'

// "🎯 What {stage} fills in" (the 2026-11-17 handoff, `docs/design_handoff_workflow_projects/` §1.3): under the Stage
// Settings, every field, table column the stage fills in on the Canvas — its glyph, its name, where it sits, ⭐ required
// and 👁 visible to the PIC (an icon that is off drawn faint); "Edit in Canvas →" opens the Canvas tab. Flashed amber
// for 0.9 s when a card's FILLS IN opened it. The legend's words are the icons' tooltips (helper lines show on hover
// only — the user, 2026-11-13).

export default function StageFills({ name, fills, flash, onOpenCanvas }: {
  name: string
  fills: StageFill[]
  /** Amber for a moment (a card's FILLS IN was clicked). */
  flash: boolean
  onOpenCanvas: () => void
}) {
  return (
    <section className={`${w.fillsPanel}${flash ? ` ${w.fillsFlash}` : ''}`} aria-label={`What ${name} fills in`} data-testid="stage-fills">
      <div className={w.fillsHead}>
        <span className={w.fillsTitle}>🎯 What {name} fills in</span>
        <button type="button" className={w.fillsEdit} onClick={onOpenCanvas}>Edit in Canvas →</button>
      </div>
      {fills.length ? (
        <ul className={w.fillsList}>
          {fills.map(f => (
            <li key={f.id} className={w.fillsRow}>
              <span className={w.fillsGlyph}>{f.glyph}</span>
              <span className={w.fillsName}>{f.name}</span>
              <span className={w.fillsWhere}>{f.where}</span>
              <span className={`${w.fillsIcon}${f.req ? '' : ` ${w.fillsOff}`}`} title="Required before submit" aria-label={f.req ? 'Required' : 'Not required'}>⭐</span>
              <span className={`${w.fillsIcon}${f.pic ? '' : ` ${w.fillsOff}`}`} title="Visible to PIC" aria-label={f.pic ? 'Visible to PIC' : 'Not visible to PIC'}>👁</span>
            </li>
          ))}
        </ul>
      ) : (
        <Tip text="Add fields in Canvas and set 🎯 to this stage.">
          <span className={w.fillsEmpty} tabIndex={0}>Nothing to fill in. The doer just submits.</span>
        </Tip>
      )}
    </section>
  )
}
