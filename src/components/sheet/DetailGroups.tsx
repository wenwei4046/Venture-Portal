import type { ReactNode } from 'react'

// A page's facts in groups (2026-10-09, the Finance revamp — the handoff's
// "dl" block): cards side by side, each with a small banded title and its
// label / value rows, the value in the number face. Used by a statement's
// net summary, a fund source's terms and dates, an allocation's split.

export interface DetailItem {
  label: string
  value: ReactNode
  /** The value in the body face rather than the number face (a name, a mode). */
  text?: boolean
}

export interface DetailGroup {
  title: string
  items: DetailItem[]
}

export default function DetailGroups({ title, count, groups }: { title: string; count?: string; groups: DetailGroup[] }) {
  return (
    <section className="mb-9" aria-label={title}>
      <div className="sect-head">
        <h2>{title}</h2>
        <span className="rule" aria-hidden />
        {count ? <span className="count">{count}</span> : null}
      </div>
      <div className="dl-groups">
        {groups.map((g) => (
          <div key={g.title} className="dl-group">
            <div className="dl-group-head">
              <span className="dl-group-bar" aria-hidden />
              <span>{g.title}</span>
            </div>
            <dl className="dl-group-list">
              {g.items.map((item) => (
                <div key={item.label} className="dl-item">
                  <dt>{item.label}</dt>
                  <dd className={item.text ? 'text' : undefined}>{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  )
}
