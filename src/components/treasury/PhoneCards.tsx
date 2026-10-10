import Link from 'next/link'
import type { ReactNode } from 'react'

// A list read on a phone as stacked cards (2026-10-10, the user's Claude
// Design handoff — its phone list): each row's name with its figure on the
// right and what that figure is under it, a line of small print, the status
// chips and the other columns as labelled details; a row that has a record of
// its own opens it (the chevron). A Total foot closes the list. The desk keeps
// its table; the caller shows this below `md` only.

export interface PhoneCard {
  key: string
  title: ReactNode
  /** The row's figure, right of the title. */
  figure?: ReactNode
  /** What the figure is ("Amount"), under it. */
  figureLabel?: string
  /** A line of small print under the title. */
  sub?: ReactNode
  /** Status chips, ahead of the labelled details. */
  chips?: ReactNode
  /** The other columns, label then value; a blank value is left out. */
  details?: Array<{ label: string; value: ReactNode }>
  /** The row opens its own record. */
  href?: string
  /** A band row — a bank's Balance B/F. */
  band?: boolean
}

export default function PhoneCards({
  label,
  cards,
  foot,
  empty = 'Nothing here yet.',
}: {
  /** What the list is — read out to a screen reader. */
  label: string
  cards: PhoneCard[]
  /** The list's Total: a label, its figure and a line under it. */
  foot?: { label: ReactNode; value: ReactNode; note?: ReactNode }
  empty?: ReactNode
}) {
  return (
    <div className="fund-plist" role="list" aria-label={label}>
      {cards.length === 0 ? (
        <div role="listitem" className="fund-pempty">
          {empty}
        </div>
      ) : null}
      {cards.map((c) => {
        const details = (c.details ?? []).filter((d) => d.value != null && d.value !== '' && d.value !== '—')
        const body = (
          <>
            <div className="fund-prow-main">
              <div className="fund-prow-top">
                <span className="fund-prow-title">{c.title}</span>
                {c.figure != null || c.figureLabel ? (
                  <span className="fund-prow-fig">
                    <span className="fund-prow-val">{c.figure}</span>
                    {c.figureLabel ? <span className="fund-prow-what">{c.figureLabel}</span> : null}
                  </span>
                ) : null}
              </div>
              {c.sub ? <div className="fund-prow-sub">{c.sub}</div> : null}
              {c.chips || details.length > 0 ? (
                <div className="fund-prow-meta">
                  {c.chips}
                  {details.map((d) => (
                    <span key={d.label} className="fund-prow-d">
                      {d.label} <span className="fund-prow-dv">{d.value}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            {c.href ? (
              <span className="fund-prow-chev" aria-hidden>
                ›
              </span>
            ) : null}
          </>
        )
        const cls = `fund-prow${c.band ? ' fund-band' : ''}`
        return c.href ? (
          <div key={c.key} role="listitem" className="fund-pitem">
            <Link href={c.href} className={`${cls} fund-prow-link`}>
              {body}
            </Link>
          </div>
        ) : (
          <div key={c.key} role="listitem" className={cls}>
            {body}
          </div>
        )
      })}
      {foot && cards.length > 0 ? (
        <div role="listitem" className="fund-pfoot">
          <span>{foot.label}</span>
          <span className="fund-pfoot-fig">
            {foot.value}
            {foot.note ? <span className="fund-pfoot-note">{foot.note}</span> : null}
          </span>
        </div>
      ) : null}
    </div>
  )
}
