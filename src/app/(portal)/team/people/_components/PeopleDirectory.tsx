'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import LedgerRow from '@/components/LedgerRow'
import StaffActions from './StaffActions'

export interface PersonRow {
  id: string
  name: string
  code: string | null
  title: string | null
  department: string | null
  accountEmail: string | null
  accountActive: boolean | null
}

export interface AccountRow {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
}

interface Props {
  people: PersonRow[]
  /** Login accounts not yet attached to anybody on the roster. */
  unattachedAccounts: AccountRow[]
  /** Activity is readable by the Principal only — access_log's own RLS. */
  canSeeActivity: boolean
}

const NO_DEPT = '— No department'

export default function PeopleDirectory({ people, unattachedAccounts, canSeeActivity }: Props) {
  const [query, setQuery] = useState('')
  const [deptFilter, setDeptFilter] = useState<string | null>(null)

  // Distinct departments from the data, A→Z, people without one last.
  const departments = useMemo(() => {
    const set = new Set<string>()
    let hasNone = false
    for (const p of people) {
      if (p.department) set.add(p.department)
      else hasNone = true
    }
    const list = [...set].sort((a, b) => a.localeCompare(b))
    if (hasNone) list.push(NO_DEPT)
    return list
  }, [people])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return people.filter(p => {
      if (deptFilter && (p.department ?? NO_DEPT) !== deptFilter) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        (p.code ?? '').toLowerCase().includes(q) ||
        (p.title ?? '').toLowerCase().includes(q) ||
        (p.department ?? '').toLowerCase().includes(q) ||
        (p.accountEmail ?? '').toLowerCase().includes(q)
      )
    })
  }, [people, query, deptFilter])

  // Group by department (A→Z, no-dept last), names A→Z inside each group.
  const groups = useMemo(() => {
    const map = new Map<string, PersonRow[]>()
    for (const p of filtered) {
      const dept = p.department ?? NO_DEPT
      const list = map.get(dept)
      if (list) list.push(p)
      else map.set(dept, [p])
    }
    return [...map.entries()]
      .sort(([a], [b]) => {
        if (a === NO_DEPT) return 1
        if (b === NO_DEPT) return -1
        return a.localeCompare(b)
      })
      .map(([dept, rows]) => ({
        dept,
        rows: rows.sort((a, b) => a.name.localeCompare(b.name)),
      }))
  }, [filtered])

  const withAccount = people.filter(p => p.accountEmail).length

  return (
    <div className="mb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search name, title, department or email…"
          className="flex-1 sm:max-w-md px-3 py-2 bg-paper border border-hairline rounded-control text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border font-sans"
          aria-label="Search people"
        />
        <div className="font-mono text-xs text-muted shrink-0">
          {filtered.length} of {people.length} {people.length === 1 ? 'person' : 'people'}
          <span className="mx-2 text-hairline">·</span>
          {withAccount} with an account
        </div>
      </div>

      {/* Department filter chips */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <button
          type="button"
          onClick={() => setDeptFilter(null)}
          aria-pressed={deptFilter === null}
          className={`font-serif italic text-sm px-3 py-1.5 rounded-control border transition-colors ${
            deptFilter === null
              ? 'bg-accent border-accent text-white'
              : 'bg-surface border-hairline text-graphite hover:bg-surface-2'
          }`}
        >
          All
        </button>
        {departments.map(dept => {
          const count = people.filter(p => (p.department ?? NO_DEPT) === dept).length
          const active = deptFilter === dept
          return (
            <button
              key={dept}
              type="button"
              onClick={() => setDeptFilter(active ? null : dept)}
              aria-pressed={active}
              className={`font-serif italic text-sm px-3 py-1.5 rounded-control border transition-colors ${
                active
                  ? 'bg-accent border-accent text-white'
                  : 'bg-surface border-hairline text-graphite hover:bg-surface-2'
              }`}
            >
              {dept}
              <span
                className={`font-mono not-italic text-[11px] ml-1.5 ${active ? 'text-white/70' : 'text-muted'}`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center border border-hairline rounded-card bg-surface">
          <p className="font-serif italic text-graphite text-base">
            Nobody matches the current filter.
          </p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="m-hide">Title</th>
                <th className="m-hide">Department</th>
                <th className="m-hide">Account</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(group => (
                <GroupRows key={group.dept} dept={group.dept} rows={group.rows} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* An account nobody is attached to can still sign in — worth seeing. */}
      {unattachedAccounts.length > 0 ? (
        <section className="mt-12">
          <div className="sect-head">
            <h2>Accounts without a person</h2>
            <span className="rule" aria-hidden />
            <span className="count">
              {unattachedAccounts.length}{' '}
              {unattachedAccounts.length === 1 ? 'ACCOUNT' : 'ACCOUNTS'}
            </span>
          </div>
          <p className="font-serif italic text-muted text-sm mb-4 max-w-2xl">
            These can sign in but are not on the roster above. Attaching one to a
            person is what Invite User will do.
          </p>
          <div className="table-scroll">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="m-hide">Email</th>
                  <th className="m-hide">Role</th>
                  <th className="m-hide">Status</th>
                </tr>
              </thead>
              <tbody>
                {unattachedAccounts.map(a => (
                  <LedgerRow key={a.id}>
                    <td>
                      {canSeeActivity ? (
                        <Link
                          href={`/team/accounts/${a.id}`}
                          className="font-serif text-md text-ink hover:text-accent hover:underline underline-offset-4 decoration-1 transition-colors"
                        >
                          {a.name}
                        </Link>
                      ) : (
                        <span className="font-serif text-md text-ink">{a.name}</span>
                      )}
                    </td>
                    <td className="m-hide" data-label="Email">
                      <span className="font-mono text-xs text-graphite">{a.email}</span>
                    </td>
                    <td className="m-hide" data-label="Role">
                      <span className="font-serif italic text-graphite">{a.role}</span>
                    </td>
                    <td className="m-hide" data-label="Status">
                      {a.isActive ? (
                        <span className="font-serif italic text-ledger">active</span>
                      ) : (
                        <span className="font-serif italic text-muted">disabled</span>
                      )}
                    </td>
                  </LedgerRow>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function GroupRows({ dept, rows }: { dept: string; rows: PersonRow[] }) {
  return (
    <>
      <tr className="bg-surface">
        <td colSpan={5}>
          <span className="font-serif italic text-accent text-sm">{dept}</span>
          <span className="font-mono text-[11px] text-muted ml-2">
            · {rows.length} {rows.length === 1 ? 'person' : 'people'}
          </span>
        </td>
      </tr>
      {rows.map(p => (
        <LedgerRow key={p.id}>
          <td>
            <Link
              href={`/team/people/${p.id}`}
              className="font-serif text-md text-ink hover:text-accent hover:underline underline-offset-4 decoration-1 transition-colors"
            >
              {p.name}
            </Link>
            {p.code && <div className="font-mono text-[11px] text-muted mt-0.5">{p.code}</div>}
          </td>
          <td className="m-hide" data-label="Title">
            <span className="font-serif italic text-graphite">{p.title ?? '—'}</span>
          </td>
          <td className="m-hide" data-label="Department">
            <span className="font-serif italic text-graphite">{p.department ?? '—'}</span>
          </td>
          <td className="m-hide" data-label="Account">
            {p.accountEmail ? (
              <span className="font-mono text-xs text-graphite">{p.accountEmail}</span>
            ) : (
              <span className="font-serif italic text-muted">No account</span>
            )}
          </td>
          <td className="text-right">
            <StaffActions staffId={p.id} staffName={p.name} />
          </td>
        </LedgerRow>
      ))}
    </>
  )
}
