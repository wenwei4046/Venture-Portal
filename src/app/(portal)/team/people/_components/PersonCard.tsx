'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import PersonPermissions from '../../_components/PersonPermissions'
import EditStaffForm from './EditStaffForm'
import { getPersonCard, type PersonCardData } from '../card-actions'

dayjs.extend(relativeTime)

export type CardTab = 'details' | 'permissions' | 'activity'

interface Props {
  personId: string
  /** Opens straight into edit mode — what the pencil on a row does. */
  startEditing?: boolean
  onClose: () => void
}

/**
 * One person, in a floating window.
 *
 * Replaces two page loads. Reading somebody used to mean leaving the roster
 * for /team/people/[id], and editing them meant leaving that for /edit — so
 * you lost the list, its filter and your scroll position to change a phone
 * number. Here the roster stays behind the scrim and editing happens in the
 * same window it was read in.
 *
 * The three tabs are three different questions about the same person, which is
 * why they are tabs and not sections: what they are (Details), what their
 * account may do (Permissions), and what it has been doing (Activity).
 */
export default function PersonCard({ personId, startEditing, onClose }: Props) {
  const router = useRouter()
  const [data, setData] = useState<PersonCardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<CardTab>('details')
  const [editing, setEditing] = useState(!!startEditing)

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await getPersonCard(personId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that person.')
    }
  }, [personId])

  useEffect(() => {
    setData(null)
    setTab('details')
    setEditing(!!startEditing)
    void load()
  }, [personId, startEditing, load])

  // Escape closes; the page behind must not scroll while the card owns the screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const person = data
  const initials = (person?.staff.employee_name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()

  return (
    <div
      className="fixed inset-0 z-50 bg-scrim/45 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={person ? person.staff.employee_name : 'Person'}
        className="bg-paper border border-hairline rounded-panel shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        {/* Header — deliberately unchanged from the page it replaces (user
            2026-09-01 picked treatment ①): light ground, the identity line in
            one grey italic string. */}
        <div className="bg-surface border-b border-hairline px-5 pt-4">
          <div className="flex items-start gap-3">
            <span
              className={`mono-tile mono-tile-lg ${person?.account ? 'linked' : ''}`}
              aria-hidden
            >
              {initials || '··'}
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="font-serif text-xl text-ink leading-tight">
                {person ? person.staff.employee_name : 'Loading…'}
              </h2>
              <p className="font-serif italic text-graphite text-[12.5px] mt-0.5 truncate">
                {person
                  ? [person.code, person.title, person.department].filter(Boolean).join(' · ')
                  : ' '}
              </p>
              {person ? (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {person.active ? (
                    <span className="chip ledger">
                      <span className="dot" aria-hidden />
                      Active
                    </span>
                  ) : (
                    <span className="chip">
                      <span className="dot" aria-hidden />
                      {person.resignedOn ? `Resigned ${person.resignedOn}` : 'Inactive'}
                    </span>
                  )}
                  {person.account ? (
                    <>
                      {/* The address is a value, not a state, so it carries no
                          dot — a disabled login is a state and does. */}
                      {person.account.isActive ? (
                        <span className="chip accent">{person.account.email}</span>
                      ) : (
                        <span className="chip danger">
                          <span className="dot" aria-hidden />
                          Login disabled
                        </span>
                      )}
                      <span className="font-mono text-[11px] text-muted">
                        {person.account.lastSeenAt
                          ? `seen ${dayjs(person.account.lastSeenAt).fromNow()}`
                          : 'never signed in'}
                      </span>
                    </>
                  ) : (
                    <span className="chip">
                      <span className="dot" aria-hidden />
                      No login
                    </span>
                  )}
                  {person.missing.length > 0 ? (
                    <span
                      className="chip alert"
                      title={`Missing ${person.missing.join(', ')} — blocks payroll or the InfoTech import`}
                    >
                      <span className="dot" aria-hidden />
                      {person.missing.length} missing
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {person && !editing ? (
                <button
                  type="button"
                  onClick={() => {
                    setTab('details')
                    setEditing(true)
                  }}
                  className="icon-btn solid"
                  title="Edit"
                  aria-label={`Edit ${person.staff.employee_name}`}
                >
                  <PencilIcon />
                </button>
              ) : null}
              <button type="button" onClick={onClose} className="icon-btn solid" aria-label="Close">
                <CloseIcon />
              </button>
            </div>
          </div>

          <div className="flex gap-1 mt-3" role="tablist">
            {(
              [
                ['details', 'Details'],
                ['permissions', 'Permissions'],
                ['activity', 'Activity'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={tab === key}
                onClick={() => {
                  setTab(key)
                  setEditing(false)
                }}
                className={`font-serif italic text-sm px-3 py-2 border-b-2 transition-colors ${
                  tab === key
                    ? 'border-accent text-accent'
                    : 'border-transparent text-graphite hover:text-ink'
                }`}
              >
                {label}
                {key === 'permissions' && person?.permissions ? (
                  <span className="font-mono not-italic text-[10px] text-muted ml-1.5">
                    {person.permissions.rows.filter(r => (r.override ?? r.inherited)).length}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        {/* No bottom padding on the scroll box itself: a sticky element cannot
            be pushed past its containing block, so the form's Save bar would
            stop 20px short of the bottom and the next field would scroll
            through the gap under it. Each panel carries its own bottom space
            instead, and the edit form's bar takes the edge. */}
        <div className="overflow-y-auto px-5 pt-5">
          {error ? (
            <p className="font-serif italic text-danger text-sm pb-5">{error}</p>
          ) : !person ? (
            <p className="font-serif italic text-muted text-sm pb-5">Reading their record…</p>
          ) : tab === 'details' ? (
            editing ? (
              <EditStaffForm
                staff={person.staff}
                titles={person.titles}
                embedded
                onSaved={() => {
                  setEditing(false)
                  void load()
                  router.refresh()
                }}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <div className="pb-5">
                <Details person={person} />
              </div>
            )
          ) : tab === 'permissions' ? (
            person.permissions && person.account ? (
              <div className="pb-5">
                <PersonPermissions
                  userId={person.account.id}
                  rows={person.permissions.rows}
                  source={person.permissions.source}
                  canEdit={person.canManagePermissions}
                />
              </div>
            ) : (
              <EmptyPanel>
                {person.staff.employee_name} has no login, so there is nothing to resolve.
                Inviting them creates the account and this tab fills in.
              </EmptyPanel>
            )
          ) : person.activity ? (
            person.activity.length === 0 ? (
              <EmptyPanel>
                Nothing recorded yet. Page visits are logged from the moment they next sign in.
              </EmptyPanel>
            ) : (
              <ol className="border-t border-hairline pb-5">
                {person.activity.map((line, i) => (
                  <li
                    key={`${line.at}-${i}`}
                    className="py-2 border-b border-hairline last:border-0 flex items-baseline justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <span className="font-sans text-[11px] uppercase tracking-wide text-graphite mr-2">
                        {line.verb}
                      </span>
                      <span className="font-serif text-sm text-ink">{line.target}</span>
                      {line.detail ? (
                        <span className="font-mono text-[11px] text-muted ml-2">{line.detail}</span>
                      ) : null}
                    </div>
                    <time
                      dateTime={line.at}
                      title={dayjs(line.at).format('D MMM YYYY HH:mm:ss')}
                      className="font-mono text-[11px] text-muted shrink-0"
                    >
                      {dayjs(line.at).format('D MMM HH:mm')}
                    </time>
                  </li>
                ))}
              </ol>
            )
          ) : (
            <EmptyPanel>
              {person.account
                ? 'Activity is readable by the Principal and by the account itself.'
                : `${person.staff.employee_name} has no login, so nothing is logged.`}
            </EmptyPanel>
          )}
        </div>

        <div className="border-t border-hairline bg-surface px-5 py-3 flex items-center gap-2">
          <span className="font-serif italic text-muted text-xs mr-auto">
            {editing
              ? 'Saving updates the row behind this window — no page change.'
              : 'Esc closes.'}
          </span>
          {person && !editing ? (
            <>
              <Link
                href={`/team/people/${person.staff.id}`}
                className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-3 py-2 rounded-md transition-colors"
              >
                Full page
              </Link>
              {!person.account ? (
                <Link
                  href={`/team/people/invite?staff=${person.staff.id}`}
                  className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-3 py-2 rounded-md transition-colors"
                >
                  Invite
                </Link>
              ) : null}
            </>
          ) : null}
          {/* Save and Cancel live together in the form's own sticky bar, so
              this footer carries only the hint while editing. */}
        </div>
      </div>
    </div>
  )
}

function Details({ person }: { person: PersonCardData }) {
  const s = person.staff
  const tenure =
    s.hire_date && person.active
      ? dayjs(s.hire_date).fromNow(true)
      : null
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
      <Section title="Assignment">
        <Field label="Title" value={person.title} />
        <Field label="Department" value={person.department} />
        <Field label="Reports to" value={person.reportsTo} />
        <Field label="Account" value={person.account?.email ?? null} mono />
      </Section>
      <Section title="Identity">
        <Field label="Employee code" value={s.employee_code} mono />
        <Field label="NRIC" value={s.nric} mono />
        <Field
          label="Hire date"
          value={s.hire_date ? `${s.hire_date}${tenure ? `  ·  ${tenure}` : ''}` : null}
          mono
        />
        <Field label="Resigned" value={s.resignation_date} mono />
      </Section>
      <Section title="Contact">
        <Field label="Phone" value={s.contact_number} mono />
        <Field label="Email" value={s.email} />
        <Field label="Address" value={s.address} />
        <Field
          label="Emergency"
          value={
            s.emergency_contact_name
              ? [s.emergency_contact_name, s.emergency_contact_relationship, s.emergency_contact_phone]
                  .filter(Boolean)
                  .join(' · ')
              : null
          }
        />
      </Section>
      <Section title="Payroll">
        <Field label="Bank" value={[s.bank_name, s.bank_account_no].filter(Boolean).join(' · ') || null} />
        <Field label="Basic" value={s.basic_salary.toFixed(2)} mono />
        <Field label="Allowance" value={s.allowances.toFixed(2)} mono />
        <Field
          label="EPF"
          value={s.is_epf_exempt ? 'Exempt' : `Part ${s.epf_category}`}
        />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-sans text-[10px] uppercase tracking-[0.14em] text-accent mb-2 pb-1.5 border-b border-hairline">
        {title}
      </h3>
      <dl className="space-y-1.5">{children}</dl>
    </section>
  )
}

function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  const empty = value == null || value === ''
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 items-baseline">
      <dt className="font-sans text-[11px] uppercase tracking-wide text-graphite">{label}</dt>
      <dd
        className={`${mono && !empty ? 'font-mono tabular text-[13px]' : 'font-serif text-sm'} ${
          empty ? 'text-muted italic' : 'text-ink'
        }`}
      >
        {empty ? 'not recorded' : value}
      </dd>
    </div>
  )
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-serif italic text-muted text-sm py-8 pb-12 text-center max-w-md mx-auto">
      {children}
    </p>
  )
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px]">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-[15px] h-[15px]">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}
