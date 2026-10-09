import Link from 'next/link'
import { Children, type CSSProperties, type ReactNode } from 'react'
import { SheetIcon, type SheetIconName } from './SheetIcon'

// The summary cards that open a page on the sheet (DESIGN.md › "Sheet
// theme"), lifted from Comm Cal's month (`CommissionMonthSummary`, #154): a
// short bar, the label in small caps, the figure, then a note and a line icon
// at the foot.
//
// `primary` is the page's one dark object — the figure it is opened for, in
// walnut with a walnut frame. Use it once per row, like the month's Total
// commission. `danger` / `alert` carry a problem that still needs somebody;
// the word says what it is, the colour only says it needs looking at.

// `wait` (2026-10-09, the Finance revamp): something waiting on someone —
// pending, awaiting the Principal, maturing — in blue.
export type StatTone = 'default' | 'primary' | 'danger' | 'alert' | 'ledger' | 'wait'

/** How many cards sit side by side: all of them up to six, then two even
 *  rows (eight → 4 + 4) rather than a seventh squeezed in or one left over. */
export function statColumns(count: number): { wide: number; medium: number } {
  const wide = count <= 6 ? Math.max(count, 1) : Math.ceil(count / 2)
  return { wide, medium: Math.min(wide, 3) }
}

export function StatCards({ label, children, note }: {
  /** What the row sums up — read out to a screen reader. */
  label: string
  children: ReactNode
  /** One quiet line under the cards ("Unmatched agents 0"). */
  note?: ReactNode
}) {
  // Conditional cards (`{x ? <StatCard/> : null}`) do not count.
  const { wide, medium } = statColumns(Children.toArray(children).length)
  const columns = { '--stat-cols': wide, '--stat-cols-md': medium } as CSSProperties
  return (
    <section className="stat-cards" aria-label={label}>
      <div className="stat-cards-grid" style={columns}>{children}</div>
      {note ? <p className="stat-cards-note">{note}</p> : null}
    </section>
  )
}

export function StatCard({ label, value, icon, note, tone = 'default', title, href }: {
  label: string
  value: ReactNode
  icon: SheetIconName
  note?: ReactNode
  tone?: StatTone
  /** A longer explanation on hover. */
  title?: string
  /** The card opens what it counts. */
  href?: string
}) {
  const body = (
    <>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-foot">
        {note ? <span>{note}</span> : null}
        <span className="stat-card-icon" aria-hidden="true"><SheetIcon name={icon} /></span>
      </div>
    </>
  )
  const tint = tone === 'default' ? undefined : tone
  return href ? (
    <Link href={href} className="stat-card" data-tone={tint} aria-label={label} title={title}>
      {body}
    </Link>
  ) : (
    <div className="stat-card" data-tone={tint} role="group" aria-label={label} title={title}>
      {body}
    </div>
  )
}
