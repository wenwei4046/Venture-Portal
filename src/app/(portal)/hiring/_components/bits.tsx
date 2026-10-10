'use client'

import { Chip } from '@/components/hrv/kit'
import { STAGE, STATUS, trailRows } from '@/lib/hiring/view'
import type { CandidateStage, HiringEvent, HiringStatus } from '@/lib/hiring/types'
import s from './hiring.module.css'

// Small pieces every Hiring page draws (2026-10-11): a request's status chip,
// a candidate's stage chip, and the Audit trail with its major and minor dots.

export function StatusChip({ status }: { status: HiringStatus }) {
  return (
    <Chip tone={STATUS[status].tone} style={{ fontSize: 10.5 }}>
      {STATUS[status].label}
    </Chip>
  )
}

/** The stage tones as the candidate card colours them: wash, edge, word. */
export const STAGE_COLOURS: Readonly<Record<CandidateStage, { bg: string; border: string; fg: string }>> = {
  shortlisted: { bg: 'rgb(255 255 255)', border: 'rgb(var(--hv-hairline))', fg: 'rgb(var(--hv-body-2))' },
  appointment: { bg: 'rgb(var(--hv-alert-bg))', border: 'rgb(var(--hv-alert-border))', fg: 'rgb(var(--hv-alert))' },
  offered: { bg: 'rgb(var(--hv-info-bg))', border: 'rgb(var(--hv-info-border))', fg: 'rgb(var(--hv-info))' },
  hired: { bg: 'rgb(var(--hv-ledger-bg))', border: 'rgb(var(--hv-ledger-border))', fg: 'rgb(var(--hv-ledger))' },
  rejected: { bg: 'rgb(var(--hv-danger-bg))', border: 'rgb(var(--hv-danger-border))', fg: 'rgb(var(--hv-danger))' },
}

export function StageChip({ stage }: { stage: CandidateStage }) {
  const c = STAGE_COLOURS[stage]
  return (
    <span className={s.stageChip} style={{ borderColor: c.border, background: c.bg, color: c.fg }}>
      <span className={s.stageDot} style={{ background: c.fg }} aria-hidden="true" />
      {STAGE[stage].label}
    </span>
  )
}

/** The Audit trail: major steps a filled dot (the newest orange) with "STATUS", minor ones a hollow one. */
export function Trail({ events, majorOnly = false }: { events: readonly HiringEvent[]; majorOnly?: boolean }) {
  const rows = trailRows(events, majorOnly)
  return (
    <div>
      {rows.map((e, i) => (
        <div key={i} className={s.ev}>
          <div className={s.evRail} aria-hidden="true">
            <span className={s.evDot} data-major={e.major ? 'true' : undefined} data-last={e.last ? 'true' : undefined} />
            <span className={s.evLine} data-last={e.last ? 'true' : undefined} />
          </div>
          <div className={s.evBody}>
            <div className={s.evTop}>
              <span className={s.evWhat} data-major={e.major ? 'true' : undefined}>
                <span>{e.what}</span>
                {e.major ? <span className={s.evTag}>Status</span> : null}
              </span>
              <span className={s.evWhen}>{e.when}</span>
            </div>
            <div className={s.evWho}>{e.who}</div>
            {e.note ? (
              <div className={s.evNote} data-major={e.major ? 'true' : undefined}>
                {e.note}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

/** All | Status only — the trail's switch. */
export function TrailSwitch({ majorOnly, onChange }: { majorOnly: boolean; onChange: (v: boolean) => void }) {
  return (
    <span className={s.trailSwitch} role="group" aria-label="Which steps">
      <button type="button" className={s.trailOpt} aria-pressed={!majorOnly} onClick={() => onChange(false)}>
        All
      </button>
      <button type="button" className={s.trailOpt} aria-pressed={majorOnly} onClick={() => onChange(true)}>
        Status only
      </button>
    </span>
  )
}
