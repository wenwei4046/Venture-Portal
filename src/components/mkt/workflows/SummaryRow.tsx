'use client'

import type { CSSProperties } from 'react'
import { overdueSummary, type OverdueCfg } from '@/lib/marketing/flow'
import { totalDays, timeBar, WF_PROMISE_MAX, type WfFix, type WfGroup, type WfStage, type WfWarning } from '@/lib/marketing/workflows'
import Stepper from './Stepper'
import w from './workflows.module.css'

// The summary row (2a): "{total} working days", the Promise stepper (saved per template, red when the stages run
// longer), the ⏰ overdue chip (opens When a stage is late), the warning pills with their Fix, and under them the 10px
// time bar — one segment per stage, sla ÷ (max(total, promise) + 1), the selected one brown — with the dashed promise
// line; then the grey lock note while MM assigns every stage.

export default function SummaryRow({
  stages,
  groups,
  promise,
  overdue,
  overdueOn,
  warnings,
  selected,
  lockNote,
  onPromise,
  onOverdue,
  onFix,
  onSelect,
}: {
  /** As they run (the lock applied). */
  stages: WfStage[]
  groups: WfGroup[]
  promise: number | null
  overdue: OverdueCfg
  overdueOn: boolean
  warnings: WfWarning[]
  selected: number | null
  lockNote: string | null
  onPromise: (n: number) => void
  onOverdue: () => void
  onFix: (fix: NonNullable<WfFix>) => void
  onSelect: (at: number) => void
}) {
  const total = totalDays(stages)
  const bar = timeBar(stages, promise)
  const hue = (key: string) => groups.find(g => g.key === key)?.hue ?? null
  return (
    <>
      <div className={w.summary}>
        <div className={w.sumRow}>
          <span className={w.total}><strong>{total}</strong> working days</span>
          <span className={w.promise} title="Product promise · working days promised to the client">
            Promise
            <Stepper small label="Promise" value={promise ?? total} min={1} max={WF_PROMISE_MAX} over={bar.over} onChange={onPromise} />
            days
          </span>
          <button type="button" className={`${w.odChip}${overdueOn ? ` ${w.odChipOn}` : ''}`} title="What happens when a stage is late" onClick={onOverdue}>
            {overdueSummary(overdue)}
          </button>
          <span className={w.grow} />
          {warnings.map(x => (
            x.fix ? (
              <button key={x.key} type="button" className={`${w.warn} ${w.warnFix}`} onClick={() => x.fix && onFix(x.fix)}>
                ⚠️ {x.text}<span className={w.fix}>Fix</span>
              </button>
            ) : (
              <span key={x.key} className={w.warn}>⚠️ {x.text}</span>
            )
          ))}
        </div>
        <div className={w.bar}>
          {bar.segments.map((s, i) => {
            const h = hue(stages[i].dept)
            return (
              <button
                key={s.sid}
                type="button"
                title={s.title}
                aria-label={s.title}
                className={`${w.barSeg}${i === selected ? ` ${w.barSegOn}` : h == null ? ` ${w.barSegNone}` : ''}`}
                style={{ width: `${s.w}%`, ...(h != null ? ({ '--g-h': h } as CSSProperties) : {}) }}
                onClick={() => onSelect(i)}
              />
            )
          })}
          {bar.promiseLeft != null ? <span className={`${w.promiseLine}${bar.over ? ` ${w.promiseLineOver}` : ''}`} style={{ left: `${bar.promiseLeft}%` }} /> : null}
        </div>
      </div>
      {lockNote ? <div className={w.lockNote}>🔒 {lockNote}</div> : null}
    </>
  )
}
