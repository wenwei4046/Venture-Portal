'use client'

import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import LedgerRow from '@/components/LedgerRow'
import PersonCard from './PersonCard'

dayjs.extend(relativeTime)

export interface PersonRow {
  id: string
  name: string
  code: string | null
  title: string | null
  department: string | null
  /** Employment, from hr_staff_costs.status — not the same fact as the account. */
  active: boolean
  resignedOn: string | null
  accountEmail: string | null
  accountActive: boolean | null
  lastSeenAt: string | null
  /** Fields whose absence breaks payroll or the import, computed server-side. */
  missing: string[]
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
/** Past this, a login nobody has touched is worth a second look. */
const STALE_DAYS = 42

type StatusFilter = 'active' | 'inactive' | 'all'

/**
 * The roster: one line per person.
 *
 * Rebuilt 2026-09-01 from a two-line, five-column table that ran 2,100px for
 * 24 people. Three changes carry most of it — the department column left
 * (the group header two inches above already says it), the name and title
 * stopped stacking, and the email address gave up the widest column on the
 * page to `Last seen`, because whether somebody *can* sign in is now told by
 * the tint on their monogram and the more useful question is whether the login
 * is still being used.
 */
export default function PeopleDirectory({ people, unattachedAccounts, canSeeActivity }: Props) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('active')
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const [card, setCard] = useState<{ id: string; editing: boolean } | null>(null)

  const counts = useMemo(() => {
    const active = people.filter(p => p.active).length
    return {
      total: people.length,
      active,
      inactive: people.length - active,
      withLogin: people.filter(p => p.accountEmail).length,
      incomplete: people.filter(p => p.missing.length > 0).length,
      departments: new Set(people.map(p => p.department ?? NO_DEPT)).size,
    }
  }, [people])

  const searching = query.trim() !== ''

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return people.filter(p => {
      if (status === 'active' && !p.active) return false
      if (status === 'inactive' && p.active) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        (p.code ?? '').toLowerCase().includes(q) ||
        (p.title ?? '').toLowerCase().includes(q) ||
        (p.department ?? '').toLowerCase().includes(q) ||
        (p.accountEmail ?? '').toLowerCase().includes(q)
      )
    })
  }, [people, query, status])

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

  function toggleFold(dept: string) {
    setFolded(prev => {
      const next = new Set(prev)
      if (next.has(dept)) next.delete(dept)
      else next.add(dept)
      return next
    })
  }

  return (
    <div className="mb-12">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search name, code, title or email…"
          className="flex-1 sm:max-w-md px-3 py-2 bg-paper border border-hairline rounded-control text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border font-sans"
          aria-label="Search people"
        />
        {/* Employment filter. Deactivating somebody used to delete them from
            the only page that lists people; now it moves them one tab over. */}
        <div
          className="inline-flex bg-surface-2 border border-hairline rounded-control p-0.5 gap-0.5 self-start"
          role="group"
          aria-label="Employment status"
        >
          {(
            [
              ['active', 'Active', counts.active],
              ['inactive', 'Inactive', counts.inactive],
              ['all', 'All', counts.total],
            ] as const
          ).map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatus(key)}
              aria-pressed={status === key}
              className={`font-serif italic text-sm px-3 py-1 rounded-[5px] transition-colors ${
                status === key
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-graphite hover:text-ink'
              }`}
            >
              {label}
              <span
                className={`font-mono not-italic text-[10.5px] ml-1.5 ${
                  status === key ? 'text-accent' : 'text-muted'
                }`}
              >
                {n}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Counts somebody would otherwise scroll to find — and the one that
          turns the roster into a worklist. */}
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 mb-5 px-3 py-2 bg-surface border border-hairline rounded-control font-mono text-[11px] text-muted">
        <span>
          <b className="text-num-ink text-[12.5px] font-semibold">{counts.total}</b> people
        </span>
        <span>
          <b className="text-num-ink text-[12.5px] font-semibold">{counts.departments}</b>{' '}
          departments
        </span>
        <span>
          <b className="text-num-ink text-[12.5px] font-semibold">{counts.withLogin}</b>{' '}
          {counts.withLogin === 1 ? 'has a login' : 'have a login'}
        </span>
        {counts.incomplete > 0 ? (
          <span>
            <b className="text-alert text-[12.5px] font-semibold">{counts.incomplete}</b> with
            missing details
          </span>
        ) : null}
        {counts.inactive > 0 ? (
          <span>
            <b className="text-num-ink text-[12.5px] font-semibold">{counts.inactive}</b> inactive
          </span>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center border border-hairline rounded-card bg-surface">
          <p className="font-serif italic text-graphite text-base">
            Nobody matches the current filter.
          </p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="ledger-table tight">
            <thead>
              {/* The widths are in globals.css under `.tight` — fixed layout,
                  so the columns stay on the same vertical edges from the first
                  row to the last, and below 768px the name gets whatever the
                  two remaining columns do not need. */}
              <tr>
                <th className="col-name">Name</th>
                {/* Below 768px the name needs the row to itself, so every other
                    column folds into LedgerRow's panel. */}
                <th className="col-title m-hide">Title</th>
                <th className="col-code m-hide">Code</th>
                <th className="col-emp m-hide">Employment</th>
                <th className="col-seen m-hide whitespace-nowrap">Last seen</th>
                <th className="col-act text-right" aria-label="Actions" />
                {/* Matches the chevron cell LedgerRow adds to every body row;
                    without it the fixed layout has one column fewer than the
                    rows do and the last column loses its width. */}
                <th className="lt-toggle" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {groups.map(group => {
                const open = searching || !folded.has(group.dept)
                const incomplete = group.rows.filter(p => p.missing.length > 0).length
                return (
                  <Fragment key={group.dept}>
                    <tr>
                      <td className="group-cell" colSpan={6}>
                        <button
                          type="button"
                          className="group-btn"
                          onClick={() => toggleFold(group.dept)}
                          aria-expanded={open}
                        >
                          <span className="chev" aria-hidden>
                            ▼
                          </span>
                          <span>{group.dept}</span>
                          <span className="count">
                            {group.rows.length} {group.rows.length === 1 ? 'person' : 'people'}
                            {incomplete > 0 ? (
                              <>
                                {' · '}
                                <em>{incomplete} incomplete</em>
                              </>
                            ) : null}
                          </span>
                        </button>
                      </td>
                    </tr>
                    {open
                      ? group.rows.map(p => (
                          // The whole row opens the card, not just the name.
                          // The row already lights up under the cursor, so
                          // anything less makes the highlight a promise the
                          // row does not keep. The pencil and the name stop
                          // the event so they keep their own meaning.
                          <LedgerRow
                            key={p.id}
                            className="cursor-pointer"
                            onClick={() => setCard({ id: p.id, editing: false })}
                          >
                            <td>
                              <div className="flex items-center gap-2.5">
                                <span
                                  className={`mono-tile ${p.accountEmail ? 'linked' : ''}`}
                                  title={
                                    p.accountEmail
                                      ? `Can sign in — ${p.accountEmail}`
                                      : 'No login account'
                                  }
                                >
                                  {initials(p.name)}
                                </span>
                                <Link
                                  href={`/team/people/${p.id}`}
                                  onClick={e => {
                                    // Cmd/ctrl/shift-click keeps its usual
                                    // meaning — open the full page in a tab.
                                    if (e.metaKey || e.ctrlKey || e.shiftKey) return
                                    e.preventDefault()
                                    // The row opens the card too — without this
                                    // the same click would run both handlers.
                                    e.stopPropagation()
                                    setCard({ id: p.id, editing: false })
                                  }}
                                  // min-w-0 so the name can ellipsize: a flex
                                  // item defaults to min-width:auto, which
                                  // makes the longest name on the roster set
                                  // the whole column's width.
                                  className="clip min-w-0 font-sans text-ink hover:text-accent transition-colors"
                                >
                                  {p.name}
                                </Link>
                              </div>
                            </td>
                            <td className="m-hide" data-label="Title">
                              <span className="clip text-ink" title={p.title ?? undefined}>
                                {p.title ?? '—'}
                              </span>
                            </td>
                            <td className="m-hide" data-label="Code">
                              <span className="font-mono text-[11px] text-muted">
                                {p.code ?? '—'}
                              </span>
                            </td>
                            <td className="m-hide" data-label="Employment">
                              <span className="whitespace-nowrap">
                                {p.active ? (
                                  <span className="chip ledger">
                                    <span className="dot" aria-hidden />
                                    Active
                                  </span>
                                ) : (
                                  <span className="chip">
                                    <span className="dot" aria-hidden />
                                    {p.resignedOn
                                      ? `Resigned ${dayjs(p.resignedOn).format('D MMM YYYY')}`
                                      : 'Inactive'}
                                  </span>
                                )}
                                {p.missing.length > 0 ? (
                                  <span
                                    className="chip alert ml-1.5"
                                    title={`Missing ${p.missing.join(', ')} — blocks payroll or the InfoTech import`}
                                  >
                                    <span className="dot" aria-hidden />
                                    {p.missing.length} missing
                                  </span>
                                ) : null}
                              </span>
                            </td>
                            <td className="m-hide whitespace-nowrap" data-label="Last seen">
                              <LastSeen person={p} />
                            </td>
                            <td className="text-right">
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation()
                                  setCard({ id: p.id, editing: true })
                                }}
                                className="icon-btn"
                                title={`Edit ${p.name}`}
                                aria-label={`Edit ${p.name}`}
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="w-[15px] h-[15px]"
                                >
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                </svg>
                              </button>
                            </td>
                          </LedgerRow>
                        ))
                      : null}
                  </Fragment>
                )
              })}
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
            These can sign in but are not on the roster above. Attaching one to a person is what
            Invite User will do.
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

      {card ? (
        <PersonCard
          personId={card.id}
          startEditing={card.editing}
          onClose={() => setCard(null)}
        />
      ) : null}
    </div>
  )
}

/**
 * Four different facts, four different weights. A dash is "no account at all",
 * which is not the same as an account that has never been used — and an active
 * login nobody has touched in six weeks is the one worth acting on.
 */
function LastSeen({ person }: { person: PersonRow }) {
  if (!person.accountEmail) {
    return (
      <span className="font-mono text-[11px] text-muted" title="No login account">
        —
      </span>
    )
  }
  if (person.accountActive === false) {
    return <span className="chip danger">Disabled</span>
  }
  if (!person.lastSeenAt) {
    return <span className="font-mono text-[11px] text-muted">never</span>
  }
  const at = dayjs(person.lastSeenAt)
  const stale = dayjs().diff(at, 'day') >= STALE_DAYS
  return (
    <span
      className={`font-mono text-[11px] ${stale ? 'text-alert' : 'text-graphite'}`}
      title={at.format('D MMM YYYY, HH:mm')}
    >
      {stale ? '● ' : ''}
      {at.fromNow()}
    </span>
  )
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()
}
