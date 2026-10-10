'use client'

import { createContext, useContext, useState } from 'react'

// The Venture Pool's search (2026-10-10, the user's Claude Design handoff):
// the page's toolbar under the cards — over the charts — whose words narrow
// the pool ledger below. PoolLedgerTable reads them from here.

const Query = createContext<string | undefined>(undefined)

export function PoolSearchProvider({ children }: { children: React.ReactNode }) {
  const [q, setQ] = useState('')
  return (
    <Query.Provider value={q}>
      <div className="page-search" role="search">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQ('')
          }}
          placeholder="Search description, type…"
          aria-label="Search the pool ledger"
        />
        {q ? (
          <button type="button" onClick={() => setQ('')}>
            Clear
          </button>
        ) : null}
      </div>
      {children}
    </Query.Provider>
  )
}

/** The toolbar's words; undefined without one (the table keeps its own box). */
export function usePoolSearch(): string | undefined {
  return useContext(Query)
}
