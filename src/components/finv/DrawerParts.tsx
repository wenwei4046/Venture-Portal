import type { ReactNode } from 'react'
import d from './drawer.module.css'

// A drawer's numbered groups and their lines (2026-10-14, the Finance revamp
// v2 — D05): the roman numeral and the title over a white card, a line a fact
// (its label left, the value right with a note under it), a peach foot for a
// total, a sentence when the group has nothing. A voucher's drawer and an
// invoice's are drawn with them.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "06 Oct 2026" — a date as the design writes it. */
export function fd(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, day] = iso.slice(0, 10).split('-').map(Number)
  return `${String(day).padStart(2, '0')} ${MON[m - 1]} ${y}`
}

export function DrawerGroup({
  n,
  title,
  foot,
  empty,
  children,
}: {
  n: string
  title: string
  foot?: { l: string; v: string }
  empty?: string
  children?: ReactNode
}) {
  return (
    <>
      <div className={d.label}>
        <span className={d.labelRoman}>{n}</span> {title}
      </div>
      <div className={d.group}>
        {children}
        {foot ? (
          <div className={d.foot}>
            <span className={d.footL}>{foot.l}</span>
            <span className={d.footV}>{foot.v}</span>
          </div>
        ) : null}
        {empty ? <div className={d.groupEmpty}>{empty}</div> : null}
      </div>
    </>
  )
}

export function DrawerLine({
  label,
  value,
  sub,
  mono = false,
  tone,
}: {
  label: string
  value: ReactNode
  sub?: string
  mono?: boolean
  /** A figure's colour: money in green, what is left to collect in the wait blue. */
  tone?: 'ledger' | 'wait'
}) {
  return (
    <div className={d.line}>
      <span className={d.lineLabel}>{label}</span>
      <span className={d.lineValue}>
        <span className={d.lineV} data-mono={mono ? 'true' : undefined} data-tone={tone}>
          {value}
        </span>
        {sub ? <span className={d.lineSub}>{sub}</span> : null}
      </span>
    </div>
  )
}
