'use client'

import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import LedgerRow from '@/components/LedgerRow'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import { ratePct } from '@/lib/commission/ranks'
import { compareByLadder } from '@/lib/ladder'
import PersonCard from './PersonCard'

dayjs.extend(relativeTime)

export interface PersonRow {
  id: string
  name: string
  code: string | null
  title: string | null
  /** Where their title stands on the ladder; null when it is not placed. */
  levelRank: number | null
  levelName: string | null
  department: string | null
  /**
   * The rank of their OPEN commission position — "Rank B", and the rate it
   * pays. Optional, and it stands for two different absences: most of the
   * roster is on no commission scheme at all, and a reader without the
   * `revenue` scope is shown none of the ones who are (page.tsx swallows that
   * refusal rather than lose the roster over it). Both read as a dash, which
   * is the honest answer from where that reader is standing.
   */
  rankLabel?: string | null
  /** 0.08 = 8%, the way `comm_ranks.product_rate` stores it. */
  rankRate?: number | null
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
  /**
   * Opens the invite drawer with this person picked — an active person with no
   * login shows Invite in their Last seen cell (2026-10-08). Absent for a
   * reader who may not invite.
   */
  onInvite?: (staffId: string) => void
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
export default function PeopleDirectory({ people, unattachedAccounts, canSeeActivity, onInvite }: Props) {
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

  // Group by department (A→Z, no-dept last). Inside a group the ladder reads
  // top down — the most senior title first, the same title together, names
  // A→Z on a rung — so the roster is the org chart in rows (user, 2026-09-05).
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
        rows: rows.sort(compareByLadder),
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
      {/* The roster in five figures, over the whole roster whatever the
          filter below shows — the counts somebody would otherwise scroll to
          find, and the one that turns the roster into a worklist. Active staff
          is what the page is opened for, so it is the sheet's walnut card;
          Missing details turns amber only while somebody is missing one. */}
      <StatCards label="The roster">
        <StatCard
          label="Active staff"
          value={String(counts.active)}
          icon="people"
          tone="primary"
          note={`${counts.total} on the roster`}
        />
        <StatCard label="Departments" value={String(counts.departments)} icon="building" />
        <StatCard label="With a login" value={String(counts.withLogin)} icon="user" note="Can sign in to the portal" />
        <StatCard
          label="Missing details"
          value={String(counts.incomplete)}
          icon="file-alert"
          tone={counts.incomplete > 0 ? 'alert' : 'default'}
          note="NRIC · bank account · hire date"
          title="Active people missing an NRIC, a bank account or a hire date — each blocks payroll or the InfoTech import"
        />
        <StatCard label="Inactive" value={String(counts.inactive)} icon="clock" note="Resigned or deactivated" />
      </StatCards>

      <div className="sheet-toolbar">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search name, code, title or email…"
          className="flex-1 min-w-0 basis-60 sm:max-w-md focus:outline-none"
          aria-label="Search people"
        />
        {/* Employment filter. Deactivating somebody used to delete them from
            the only page that lists people; now it moves them one tab over.
            The sheet's filter pills: the pick is a peach wash with an orange
            edge, its count in the boxed badge. */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Employment status">
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
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                status === key
                  ? 'border-accent bg-accent-bg font-bold'
                  : 'border-hairline bg-surface hover:border-accent'
              }`}
            >
              {label}
              <span className="sheet-count">{n}</span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
          <p className="text-sm">Nobody matches the current filter.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="ledger-table tight">
            <thead>
              {/* The widths are in globals.css under `.tight` (all but Rank's,
                  which has nowhere there to go — see below) — fixed layout,
                  so the columns stay on the same vertical edges from the first
                  row to the last, and below 768px the name gets whatever the
                  two remaining columns do not need. */}
              <tr>
                <th className="col-name">Name</th>
                {/* Below 768px the name needs the row to itself, so every other
                    column folds into LedgerRow's panel. */}
                <th className="col-title m-hide">Title</th>
                {/* The one width not declared in globals.css's `.tight` block,
                    and it has to live somewhere: the six `col-*` shares
                    already add to 100%, so a seventh column with no width of
                    its own is handed 0 under `table-layout: fixed` and its
                    chip spills into Code. Claiming a share instead makes the
                    other six scale down around it rather than one collapse.
                    `md:` because below 768px this column is folded away, and a
                    width there would be taken off the name — the same trap
                    the `.tight` phone rules were written for. */}
                <th className="md:w-[14%] m-hide">Rank</th>
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
                      {/* Every visible column — seven since Rank arrived. The
                          chevron is not one of them: it is `display: none`
                          above 768px and LedgerRow adds it per row, not
                          here. */}
                      <td className="group-cell" colSpan={7}>
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
                                  // the whole column's width. The sheet
                                  // underlines a link in a cell, so it reads
                                  // as one without a colour of its own.
                                  className="clip min-w-0"
                                >
                                  {p.name}
                                </Link>
                              </div>
                            </td>
                            <td className="m-hide" data-label="Title">
                              <span className="flex items-baseline gap-2 min-w-0">
                                <span className="clip min-w-0" title={p.title ?? undefined}>
                                  {p.title ?? '—'}
                                </span>
                                {/* The rung — the rows are in its order. */}
                                {p.levelRank !== null ? (
                                  <span
                                    className="font-mono text-[10px] shrink-0"
                                    title={`Level ${p.levelRank} · ${p.levelName}`}
                                  >
                                    L{p.levelRank}
                                  </span>
                                ) : null}
                              </span>
                            </td>
                            <td className="m-hide" data-label="Rank">
                              {p.rankLabel ? (
                                <span className="flex items-center gap-2 min-w-0">
                                  <span className="chip shrink-0">{p.rankLabel}</span>
                                  {p.rankRate != null ? (
                                    <span className="font-mono text-[10px] shrink-0">
                                      {ratePct(p.rankRate)}
                                    </span>
                                  ) : null}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="m-hide" data-label="Code">
                              <span className="font-mono text-[11px]">{p.code ?? '—'}</span>
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
                              <LastSeen person={p} onInvite={onInvite} />
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
          <p className="text-sm mb-4 max-w-2xl">
            These can sign in but are not on the roster above, so no title decides what they may
            do: each keeps the role it was made with. Somebody on the roster gets a login of their
            own from Invite on their row.
          </p>
          <div className="table-scroll">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="m-hide">Email</th>
                  <th className="m-hide">Role</th>
                  <th className="m-hide">Status</th>
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {unattachedAccounts.map(a => (
                  <LedgerRow key={a.id}>
                    <td className="font-medium">
                      {canSeeActivity ? (
                        <Link href={`/team/accounts/${a.id}`}>{a.name}</Link>
                      ) : (
                        a.name
                      )}
                    </td>
                    <td className="m-hide" data-label="Email">
                      <span className="font-mono text-xs">{a.email}</span>
                    </td>
                    <td className="m-hide" data-label="Role">
                      {/* The role is a value, not a state — no dot. */}
                      <span className="chip">{a.role}</span>
                    </td>
                    <td className="m-hide" data-label="Status">
                      {a.isActive ? (
                        <span className="chip ledger">
                          <span className="dot" aria-hidden />
                          active
                        </span>
                      ) : (
                        <span className="chip">
                          <span className="dot" aria-hidden />
                          disabled
                        </span>
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
          onInvite={
            onInvite
              ? staffId => {
                  setCard(null)
                  onInvite(staffId)
                }
              : undefined
          }
        />
      ) : null}
    </div>
  )
}

/**
 * Four different facts, four different weights. A dash is "no account at all",
 * which is not the same as an account that has never been used — and an active
 * login nobody has touched in six weeks is the one worth acting on, so that
 * one is a state on an amber wash rather than one more date.
 */
function LastSeen({ person, onInvite }: { person: PersonRow; onInvite?: (staffId: string) => void }) {
  // An active person with no login: the drawer, with them picked (the design's
  // Invite cell — the sheet's row-Save treatment).
  if (!person.accountEmail && person.active && onInvite) {
    return (
      <button
        type="button"
        className="invite-cell"
        onClick={e => {
          e.stopPropagation()
          onInvite(person.id)
        }}
      >
        Invite
      </button>
    )
  }
  if (!person.accountEmail) {
    return (
      <span className="font-mono text-[11px]" title="No login account">
        —
      </span>
    )
  }
  if (person.accountActive === false) {
    return (
      <span className="chip danger">
        <span className="dot" aria-hidden />
        Disabled
      </span>
    )
  }
  if (!person.lastSeenAt) {
    return <span className="font-mono text-[11px]">never</span>
  }
  const at = dayjs(person.lastSeenAt)
  const stale = dayjs().diff(at, 'day') >= STALE_DAYS
  return stale ? (
    <span className="chip alert" title={`${at.format('D MMM YYYY, HH:mm')} — no sign-in for ${STALE_DAYS}+ days`}>
      <span className="dot" aria-hidden />
      {at.fromNow()}
    </span>
  ) : (
    <span className="font-mono text-[11px]" title={at.format('D MMM YYYY, HH:mm')}>
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
