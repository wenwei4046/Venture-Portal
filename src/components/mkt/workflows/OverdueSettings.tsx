'use client'

import type { OverdueCfg, OverdueNotify } from '@/lib/marketing/flow'
import RadioCard from './RadioCard'
import Stepper from './Stepper'
import ToggleRow from './ToggleRow'
import w from './workflows.module.css'

// ⏰ When a stage is late (2a's right panel, workflow-wide): late by 1–10 working days, who is told, just remind or ask
// MM to reassign, and whether to remind again every day. Told by the portal's notice and the phone's push (decision 1).

const NOTIFY: readonly [OverdueNotify, string][] = [['doer', 'The person on it'], ['mm', 'MM'], ['director', 'Director'], ['next', 'Next person']]

export default function OverdueSettings({ cfg, onChange }: { cfg: OverdueCfg; onChange: (next: OverdueCfg) => void }) {
  const set = (p: Partial<OverdueCfg>) => onChange({ ...cfg, ...p })
  return (
    <div className={w.panel}>
      <div className={w.panelHead}>
        <span className={`${w.panelBadge} ${w.badgeRed}`}>⏰</span>
        <span className={w.panelTitle}>When a stage is late</span>
        <span className={w.grow} />
        <span className={w.panelAside}>All stages</span>
      </div>
      <div className={w.part}>
        <span className={w.q}>Late by</span>
        <div className={w.stepRow}>
          <Stepper label="Late by" value={cfg.days} min={1} max={10} onChange={days => set({ days })} />
          <span className={w.small}>working day(s) past the stage’s due date</span>
        </div>
      </div>
      <div className={w.part}>
        <span className={w.q}>Notify</span>
        <div className={w.chips}>
          {NOTIFY.map(([k, label]) => {
            const on = cfg.notify.includes(k)
            return (
              <button key={k} type="button" aria-pressed={on} className={`${w.chip}${on ? ` ${w.chipOn}` : ''}`}
                onClick={() => set({ notify: on ? cfg.notify.filter(x => x !== k) : NOTIFY.map(n => n[0]).filter(x => x === k || cfg.notify.includes(x)) })}>
                {on ? '✓ ' : ''}{label}
              </button>
            )
          })}
        </div>
      </div>
      <div className={w.part} role="radiogroup" aria-label="Then">
        <span className={w.q}>Then</span>
        <RadioCard on={cfg.action === 'remind'} title="Just remind" text="The people above get a reminder. Nothing else changes." onPick={() => set({ action: 'remind' })} />
        <RadioCard on={cfg.action === 'reassign'} title="Ask MM to reassign" text="MM sees “reassign it?” at the top of the task." onPick={() => set({ action: 'reassign' })} />
      </div>
      <ToggleRow on={cfg.repeat} title="Repeat daily" sub="Remind again every day until the stage moves on" onChange={repeat => set({ repeat })} />
    </div>
  )
}
