'use client'

import { Fragment, useEffect, useMemo, useState, type MouseEvent } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { officeTime } from '@/lib/office-time'
import { Card, Cards, Chip, GridHead, GridRow, GridTable, hv } from '@/components/hrv/kit'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import { ratePct } from '@/lib/commission/ranks'
import { compareByLadder } from '@/lib/ladder'
import { initialsOf, rosterCounts, rosterDepartments, rosterGroups, rosterMatches, type RosterStatus } from '@/lib/people-roster'
import PersonWindow from './PersonWindow'
import s from './people.module.css'

dayjs.extend(relativeTime)

export interface PersonRow {
  id: string
  /** Their full name — last name, then first (`fullNameOf`, 2026-10-20); the person's page shows the two apart. */
  name: string
  /** The full name on their IC — what the search also finds them by. */
  icName?: string | null
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
  /** Sent an invite link not used yet (2026-10-16) — read only for whoever may invite. */
  invitePending?: boolean
  /** Why this reader may not give them a login: a full-access title, for whoever does not manage permissions (2026-10-20). */
  inviteHeld?: string
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
  /** Opens Invite user with this person picked. Absent for a reader who may not invite. */
  onInvite?: (staffId: string) => void
}

/** Past this, a login nobody has touched is worth a second look. */
const STALE_DAYS = 42

/** The handoff's roster grid: Name · Title · Rank · Code · Employment · Last seen · ›. */
const COLS = 'minmax(0,1.7fr) minmax(0,1.4fr) 130px 80px minmax(0,1.3fr) 100px 40px'

/**
 * The roster as the HR revamp draws it (2026-10-10, the handoff's variant A):
 * five cards over the whole roster, the search, the department filter
 * (2026-10-20, the user: "要多加一个 filter：这个 filter 是 drop down 来的，可以选
 * department") and Active · Inactive · All — their counts the department's —
 * then one grid — a walnut-ruled band per department (folds), a row per
 * person in ladder order, by their full name (last name, then first —
 * 2026-10-20). Click a row for their window; right-click for Invite user ·
 * Open card.
 */
export default function PeopleDirectory({ people, unattachedAccounts, canSeeActivity, onInvite }: Props) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<RosterStatus>('active')
  const [dept, setDept] = useState('')
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  const counts = useMemo(() => rosterCounts(people), [people])
  const departments = useMemo(() => rosterDepartments(people.filter(p => rosterMatches(p, '', status))), [people, status])
  // The pills count the department on show (every one when none is picked).
  const inDept = useMemo(() => rosterCounts(people.filter(p => rosterMatches(p, '', 'all', dept))), [people, dept])
  const searching = query.trim() !== ''
  const groups = useMemo(
    () => rosterGroups(people.filter(p => rosterMatches(p, query, status, dept)), compareByLadder),
    [people, query, status, dept],
  )

  // A click anywhere else, or Escape, puts the menu away.
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('click', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  function toggleFold(dept: string) {
    setFolded(prev => {
      const next = new Set(prev)
      if (next.has(dept)) next.delete(dept)
      else next.add(dept)
      return next
    })
  }

  function openMenu(e: MouseEvent<HTMLDivElement>, id: string) {
    e.preventDefault()
    const box = e.currentTarget.getBoundingClientRect()
    setMenu({ id, x: Math.min(e.clientX - box.left, box.width - 200), y: e.clientY - box.top })
  }

  function inviteFrom(p: PersonRow) {
    setMenu(null)
    if (!p.active) return flash(`${p.name} is not active`)
    // An invite link never used is invited again (2026-10-16); any other login is theirs already.
    if (p.accountEmail && !p.invitePending) return flash(`${p.name} already has a login`)
    if (!onInvite) return flash('Inviting needs HR view › Permissions · Create')
    if (p.inviteHeld) return flash(p.inviteHeld)
    onInvite(p.id)
  }

  return (
    <div className={s.directory}>
      <Cards label="The roster" style={{ marginBottom: 18 }}>
        {[
          { label: 'Active staff', value: counts.active, note: `${counts.total} on the roster`, tone: 'primary' as const },
          { label: 'Departments', value: counts.departments, note: null },
          { label: 'With a login', value: counts.withLogin, note: counts.invited > 0 ? `${counts.invited} invited` : 'Can sign in to the portal' },
          {
            label: 'Missing details',
            value: counts.incomplete,
            note: 'NRIC, bank or hire date',
            tone: counts.incomplete > 0 ? ('alert' as const) : undefined,
            title: 'Active people missing an NRIC, a bank account or a hire date — each blocks payroll or the InfoTech import',
          },
          { label: 'Inactive', value: counts.inactive, note: 'Resigned or deactivated' },
        ].map(c => (
          <Card
            key={c.label}
            label={c.label}
            value={String(c.value)}
            note={c.note}
            tone={c.tone}
            title={'title' in c ? c.title : undefined}
            minHeight={132}
            labelMinHeight={24}
            labelLineHeight="normal"
            valueSize={26}
            valueTracking="-.035em"
            valueLineHeight="normal"
            footPad={10}
          />
        ))}
      </Cards>

      <div className={`${hv.toolbar} ${s.toolbar}`}>
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search name, code, title or email…"
          className={`${hv.input} ${s.search}`}
          aria-label="Search people"
        />
        <Select value={dept} onChange={e => setDept(e.target.value)} aria-label="Department" className={s.deptFilter} data-picked={dept ? 'true' : undefined}>
          <option value="">All departments</option>
          {/* The one picked stays a choice when the employment filter leaves nobody in it. */}
          {dept && !departments.some(d => d.dept === dept) ? <option value={dept}>{dept} · 0</option> : null}
          {departments.map(d => (
            <option key={d.dept} value={d.dept}>
              {d.dept} · {d.count}
            </option>
          ))}
        </Select>
        <div className={s.pills} role="group" aria-label="Employment status">
          {(
            [
              ['active', 'Active', inDept.active],
              ['inactive', 'Inactive', inDept.inactive],
              ['all', 'All', inDept.total],
            ] as const
          ).map(([key, label, n]) => (
            <button key={key} type="button" className={hv.pill} aria-pressed={status === key} onClick={() => setStatus(key)}>
              {label}
              <span className={hv.pillCount}>{n}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={s.rosterWrap}>
        <GridTable label="People" scroll style={{ overflow: 'visible' }}>
          <GridHead cols={COLS} cells={['Name', 'Title', 'Rank', 'Code', 'Employment', 'Last seen', '']} cellStyle={{ padding: '11px 14px' }} />
          {groups.length === 0 ? <div className={hv.gtEmpty}>Nobody matches the current filter.</div> : null}
          {groups.map(group => {
            const unfolded = searching || !folded.has(group.dept)
            return (
              <Fragment key={group.dept}>
                <button type="button" className={s.band} aria-expanded={unfolded} onClick={() => toggleFold(group.dept)}>
                  <span className={s.bandChev} aria-hidden="true" data-open={unfolded ? 'true' : undefined}>
                    ▼
                  </span>
                  <span className={s.bandName}>{group.dept}</span>
                  <span className={s.bandCount}>
                    {group.rows.length} {group.rows.length === 1 ? 'person' : 'people'}
                    {group.incomplete > 0 ? <span className={s.bandMissing}> · {group.incomplete} incomplete</span> : null}
                  </span>
                </button>
                {unfolded
                  ? group.rows.map((p, i) => (
                      <GridRow
                        key={p.id}
                        cols={COLS}
                        zebra={i % 2 === 1}
                        onClick={() => {
                          if (menu) return setMenu(null)
                          setOpen(p.id)
                        }}
                        onContextMenu={e => openMenu(e, p.id)}
                        style={{ position: 'relative' }}
                      >
                        <span className={s.nameCell} data-faded={p.active ? undefined : 'true'}>
                          <span
                            className={s.tile}
                            data-login={p.accountEmail && !p.invitePending ? 'true' : undefined}
                            title={
                              p.invitePending
                                ? `Invited — ${p.accountEmail} has not chosen a password yet`
                                : p.accountEmail
                                  ? `Can sign in — ${p.accountEmail}`
                                  : 'No login yet'
                            }
                          >
                            {initialsOf(p.name)}
                          </span>
                          <span className={s.name}>{p.name}</span>
                        </span>
                        <span className={s.titleCell} data-faded={p.active ? undefined : 'true'}>
                          <span className={s.clip} title={p.title ?? undefined}>{p.title ?? '—'}</span>
                          {p.levelRank !== null ? (
                            <span className={s.level} title={`Level ${p.levelRank} · ${p.levelName}`}>
                              L{p.levelRank}
                            </span>
                          ) : null}
                        </span>
                        <span className={s.rankCell}>
                          {p.rankLabel ? (
                            <>
                              <span className={s.rankChip}>{p.rankLabel.replace(/^Rank\s+/i, '')}</span>
                              {p.rankRate != null ? <span className={s.rate}>{ratePct(p.rankRate)}</span> : null}
                            </>
                          ) : (
                            <span className={s.rate}>—</span>
                          )}
                        </span>
                        <span className={s.code}>{p.code ?? '—'}</span>
                        <span className={s.empCell}>
                          <Chip tone={p.active ? 'ledger' : 'danger'} soft>
                            {p.active ? 'Active' : p.resignedOn ? `Resigned ${dayjs(p.resignedOn).format('D MMM YYYY')}` : 'Inactive'}
                          </Chip>
                          {p.missing.length > 0 ? (
                            <span className={s.missing} title={`Missing ${p.missing.join(', ')} — blocks payroll or the InfoTech import`}>
                              {p.missing.length} missing
                            </span>
                          ) : null}
                        </span>
                        <span className={s.seen}>
                          <LastSeen person={p} />
                        </span>
                        <span className={s.chev} aria-hidden="true">›</span>
                        {menu?.id === p.id ? (
                          <div
                            className={s.menu}
                            role="menu"
                            aria-label={p.name}
                            style={{ left: menu.x, top: menu.y }}
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              role="menuitem"
                              className={s.menuItem}
                              data-quiet={!p.active || (p.accountEmail && !p.invitePending) || !onInvite || p.inviteHeld ? 'true' : undefined}
                              onClick={() => inviteFrom(p)}
                            >
                              {p.invitePending ? 'Invite again' : 'Invite user'}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className={s.menuItem}
                              onClick={() => {
                                setMenu(null)
                                setOpen(p.id)
                              }}
                            >
                              Open card
                            </button>
                          </div>
                        ) : null}
                      </GridRow>
                    ))
                  : null}
              </Fragment>
            )
          })}
        </GridTable>
      </div>

      {/* An account nobody is attached to can still sign in — worth seeing. */}
      {unattachedAccounts.length > 0 ? (
        <section className={s.accounts} aria-labelledby="accounts-title">
          <div className={s.accountsHead}>
            <h2 id="accounts-title" className={s.accountsTitle}>Accounts without a person</h2>
            <span className={s.accountsCount}>
              {unattachedAccounts.length} {unattachedAccounts.length === 1 ? 'ACCOUNT' : 'ACCOUNTS'}
            </span>
          </div>
          <GridTable label="Accounts without a person">
            <GridHead cols="minmax(0,1.2fr) minmax(0,1.6fr) 140px 120px" cells={['Account', 'Email', 'Role', 'Status']} cellStyle={{ padding: '11px 14px' }} />
            {unattachedAccounts.map((a, i) => (
              <GridRow key={a.id} cols="minmax(0,1.2fr) minmax(0,1.6fr) 140px 120px" zebra={i % 2 === 1}>
                <span className={s.accountName}>
                  {canSeeActivity ? <Link href={`/team/accounts/${a.id}`}>{a.name}</Link> : a.name}
                </span>
                <span className={s.code}>{a.email}</span>
                <span className={s.cell}>
                  <span className={s.rankChip}>{a.role}</span>
                </span>
                <span className={s.cell}>
                  <Chip tone={a.isActive ? 'ledger' : 'danger'} soft>
                    {a.isActive ? 'Active' : 'Disabled'}
                  </Chip>
                </span>
              </GridRow>
            ))}
          </GridTable>
        </section>
      ) : null}

      {open ? (
        <PersonWindow
          personId={open}
          onClose={() => setOpen(null)}
          onInvite={
            onInvite
              ? staffId => {
                  setOpen(null)
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
 * Last seen, as the handoff words it: "2 days ago", or a dash for nobody
 * signed in — with the two states worth acting on kept: a disabled login, and
 * an active one nobody has touched in six weeks.
 */
function LastSeen({ person }: { person: PersonRow }) {
  if (!person.accountEmail) return <span title="No login yet">—</span>
  if (person.accountActive === false) return <span className={s.seenWarn}>Disabled</span>
  if (person.invitePending) {
    return (
      <span className={s.seenWarn} title={`Invited ${person.accountEmail} — no password chosen yet`}>
        Invited
      </span>
    )
  }
  if (!person.lastSeenAt) return <span>never</span>
  const at = dayjs(person.lastSeenAt)
  const seenAt = officeTime(person.lastSeenAt).format('D MMM YYYY, HH:mm')
  return dayjs().diff(at, 'day') >= STALE_DAYS ? (
    <span className={s.seenWarn} title={`${seenAt} — no sign-in for ${STALE_DAYS}+ days`}>
      {at.fromNow()}
    </span>
  ) : (
    <span title={seenAt}>{at.fromNow()}</span>
  )
}
