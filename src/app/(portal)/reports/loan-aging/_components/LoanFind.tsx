'use client'

import { createContext, useContext, useState } from 'react'

// Find company on Loan Aging's control row (2026-10-10, the user's Claude
// Design handoff): highlights the matching rows in every table, hides none.
// The tables stay server-rendered; each row reads the query from here.

const Find = createContext('')

export function LoanFindProvider({
  names,
  asAt,
  children,
}: {
  names: string[]
  /** As at a month (2026-10-10): picking one reloads the page with ?as_at=. */
  asAt?: { value: string; options: Array<{ value: string; label: string }> }
  children: React.ReactNode
}) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const hits = needle ? names.filter((n) => n.toLowerCase().includes(needle)).length : 0
  return (
    <Find.Provider value={needle}>
      <div className="rpt-toolbar" role="group" aria-label="Report controls">
        {asAt ? (
          // A plain GET form: picking a month reloads the page as at it.
          <form method="get" className="rpt-field">
            <span>As at</span>
            <select name="as_at" aria-label="As at" defaultValue={asAt.value} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
              {asAt.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </form>
        ) : null}
        <div className="rpt-field rpt-find">
          <span>Find company</span>
          <div className="rpt-find-box">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQ('')
              }}
              placeholder="Company…"
              aria-label="Find company"
              className="search-plain"
            />
            {needle ? <small>{hits === 0 ? 'No match' : `${hits} ${hits === 1 ? 'match' : 'matches'}`}</small> : null}
          </div>
        </div>
      </div>
      {children}
    </Find.Provider>
  )
}

/** A table row that lights up when Find matches its company. */
export function FindRow({ name, children }: { name: string; children: React.ReactNode }) {
  const needle = useContext(Find)
  return <tr className={needle && name.toLowerCase().includes(needle) ? 'search-row-hit' : undefined}>{children}</tr>
}
