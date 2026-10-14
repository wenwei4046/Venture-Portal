import type { ReactNode } from 'react'
import s from './full.module.css'

// A record's full page, in parts (2026-10-15, the Finance revamp v2 — D06 of
// `.design/fin-r2/handoff`; the prototype draws every record's full page one
// way, its `fullModel`): the head's facts, a numbered card, a card's line, the
// dark panel's line, the trail across and the audit log. A payment voucher's
// page, an allocation's, an invoice's, a loan's and a fund source's are drawn
// with them on `full.module.css`. No hooks — a server page composes them.

export { s as fullStyles }

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "06 Oct 2026" — a day as the full page writes it. */
export function fullDay(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${String(d).padStart(2, '0')} ${MON[m - 1]} ${y}`
}

/** A fact under the number: its label in 10px caps over its value. */
export function FullFact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <span className={s.fact}>
      <span className={s.factLabel}>{label}</span>
      <span className={s.factValue} data-mono={mono ? 'true' : undefined}>
        {value}
      </span>
    </span>
  )
}

/** A numbered card: its strip (the peach number, the title in Newsreader, an aside in mono, a control), its body. */
export function FullCard({ n, title, aside, extra, children }: { n: number; title: string; aside?: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className={s.card} aria-label={title}>
      <div className={s.cardHead}>
        <span className={s.cardN}>{n}</span>
        <span className={s.cardTitle}>{title}</span>
        <span className={s.grow} />
        {extra}
        {aside ? <span className={s.cardAside}>{aside}</span> : null}
      </div>
      <div className={s.cardBody}>{children}</div>
    </section>
  )
}

/** A card's line (inside a `dl` of `fullStyles.dl`): its label, its value — a note under it when there is one. */
export function FullRow({ label, value, sub }: { label: string; value: ReactNode; sub?: string | null }) {
  return (
    <>
      <dt className={s.dt}>{label}</dt>
      <dd className={s.dd}>
        {value}
        {sub ? <span className={s.ddSub}>{sub}</span> : null}
      </dd>
    </>
  )
}

/** The dark panel's line: its label left, the value right with a note under it, and a control after it. */
export function FullPanelRow({ label, value, sub, mono = false, after }: { label: string; value: string; sub?: string | null; mono?: boolean; after?: ReactNode }) {
  return (
    <div className={s.pRow}>
      <span className={s.pRowLabel}>{label}</span>
      <span className={s.pRowValue}>
        <span className={s.pRowV} data-mono={mono ? 'true' : undefined}>
          {value}
        </span>
        {sub ? <span className={s.pRowSub}>{sub}</span> : null}
        {after}
      </span>
    </div>
  )
}

export interface FullStep {
  label: string
  by: string | null
  /** The second line — when it happened (already written), or a note. */
  when: string | null
  state: 'done' | 'todo' | 'bad'
}

/** The trail across: a dot and a line a step, the line in the accent once the next step is done. */
export function FullTrail({ steps }: { steps: FullStep[] }) {
  return (
    <div className={s.trail}>
      {steps.map((t, i) => (
        <div key={i} className={s.step} data-state={t.state}>
          <div className={s.stepRail}>
            <span className={s.stepDot} />
            <span className={s.stepLine} data-on={steps[i + 1] && steps[i + 1].state !== 'todo' ? 'true' : undefined} />
          </div>
          <span className={s.stepLabel}>{t.label}</span>
          <span className={s.stepBy}>
            {t.by ?? (t.state === 'todo' ? '' : '—')}
            <br />
            {t.when ?? ''}
          </span>
        </div>
      ))}
    </div>
  )
}

/** The audit log: When · Who · What changed, newest first — or a sentence when there is nothing on record. */
export function FullAudit({ rows }: { rows: Array<{ at: string; who: string; what: string }> }) {
  if (rows.length === 0) return <p className={s.none}>No change on record.</p>
  return (
    <div className={s.table}>
      <div className={s.tHead}>
        <span className={s.aWhen}>When</span>
        <span className={s.aWho}>Who</span>
        <span className={s.aWhat}>What changed</span>
      </div>
      {rows.map((a, i) => (
        <div key={i} className={s.aRow}>
          <span className={s.aWhen}>{a.at}</span>
          <span className={s.aWho} title={a.who}>
            {a.who}
          </span>
          <span className={s.aWhat}>{a.what}</span>
        </div>
      ))}
    </div>
  )
}
