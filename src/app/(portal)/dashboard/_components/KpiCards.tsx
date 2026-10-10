import type { ReactNode } from 'react'

// 2026-10-10 — the handoff's KPI rows (Billing & dept pool, Director salary):
// plain cards, not the page's summary cards — no top bar and no icon, the
// label, the figure at 22px in the number face, a note. The walnut frame
// marks the row's one primary figure; a net figure is green as a profit and
// red as a loss (README › StatCard colour rule). CSS `.ov-kpi*`.

export type KpiTone = 'default' | 'primary' | 'ledger' | 'danger'

export function KpiCards({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ov-kpis" role="group" aria-label={label}>
      {children}
    </div>
  )
}

export function KpiCard({ label, value, note, tone = 'default' }: { label: string; value: ReactNode; note?: ReactNode; tone?: KpiTone }) {
  return (
    <div className="ov-kpi" data-tone={tone === 'default' ? undefined : tone} role="group" aria-label={label}>
      <div className="ov-kpi-label">{label}</div>
      <div className="ov-kpi-value">{value}</div>
      {note ? <div className="ov-kpi-note">{note}</div> : null}
    </div>
  )
}

/** A net figure's tone: green above zero, red below, plain at nil. */
export function netTone(value: number): KpiTone {
  return value > 0 ? 'ledger' : value < 0 ? 'danger' : 'default'
}
