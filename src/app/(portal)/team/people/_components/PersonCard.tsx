'use client'

import { useCallback, useEffect, useState } from 'react'
import { backdropDismiss } from '@/components/modal-dismiss'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { officeTime } from '@/lib/office-time'
import PersonAccess, { accessCount } from '../../_components/PersonAccess'
import EditStaffForm from './EditStaffForm'
import Promotion from './Promotion'
import Employment from './Employment'
import { isFullyCommissionBased, isVariablePay } from '@/lib/staff-form'
import { MASKED } from '@/lib/sensitive'
import { getPersonCard, type PersonCardData } from '../card-actions'

dayjs.extend(relativeTime)

export type CardTab = 'details' | 'permissions' | 'activity'

interface Props {
  personId: string
  /** Opens straight into edit mode — what the pencil on a row does. */
  startEditing?: boolean
  onClose: () => void
  /** Opens the invite drawer for this person, when the card sits on the roster. */
  onInvite?: (staffId: string) => void
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
export default function PersonCard({ personId, startEditing, onClose, onInvite }: Props) {
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
      {...backdropDismiss(onClose)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={person ? person.staff.employee_name : 'Person'}
        className="bg-surface border border-hairline rounded-panel shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        {/* Header — the page it replaced, in the sheet's lettering (user
            2026-09-01 picked treatment ①): light ground, the identity line in
            one string under the name. */}
        <div className="bg-surface px-5 pt-4">
          <div className="flex items-start gap-3">
            <span
              className={`mono-tile mono-tile-lg ${person?.account ? 'linked' : ''}`}
              aria-hidden
            >
              {initials || '··'}
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold leading-tight tracking-[-0.015em]">
                {person ? person.staff.employee_name : 'Loading…'}
              </h2>
              <p className="text-[12px] mt-0.5 truncate">
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
                      <span className="font-mono text-[11px]">
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
              {/* The edit form is built around pay, so it is offered only to a
                  viewer whose title ticks Salary amounts (2026-10-09, PR4). */}
              {person && !editing && person.canSee.salary ? (
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

          {/* The sheet's tab rail, run edge to edge so its rule is the
              header's bottom edge; `!mb-0` because the rail's own gap is the
              panel's `pt-5` here. */}
          <div className="sheet-tabs -mx-5 mt-3 px-5 !mb-0" role="tablist" aria-label="Person">
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
              >
                {label}
                {key === 'permissions' && person?.access ? (
                  <span className="sheet-count">{accessCount(person.access)}</span>
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
            <p className="sheet-danger mt-0 mb-5">{error}</p>
          ) : !person ? (
            <p className="text-sm pb-5">Reading their record…</p>
          ) : tab === 'details' ? (
            editing ? (
              <EditStaffForm
                staff={person.staff}
                titles={person.titles}
                canSee={person.canSee}
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
                {person.active ? (
                  <Promotion
                    personId={person.staff.id}
                    personName={person.staff.employee_name}
                    title={person.title}
                    department={person.department}
                    ladder={person.ladder}
                    onDone={() => {
                      void load()
                      router.refresh()
                    }}
                  />
                ) : null}
                <Employment
                  personId={person.staff.id}
                  personName={person.staff.employee_name}
                  active={person.active}
                  onDone={() => {
                    void load()
                    router.refresh()
                  }}
                />
              </div>
            )
          ) : tab === 'permissions' ? (
            person.access && person.account ? (
              <div className="pb-5">
                <PersonAccess
                  access={person.access}
                  canEdit={person.canManagePermissions}
                  onSaved={() => void load()}
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
              // The same table as the person page's Activity section.
              <div className="pb-5">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th className="w-[104px]">When</th>
                      <th className="w-[96px]">Action</th>
                      <th>Where</th>
                    </tr>
                  </thead>
                  <tbody>
                    {person.activity.map((line, i) => (
                      <tr key={`${line.at}-${i}`}>
                        <td className="whitespace-nowrap">
                          <time
                            dateTime={line.at}
                            title={officeTime(line.at).format('D MMM YYYY HH:mm:ss')}
                            className="font-mono text-[11px]"
                          >
                            {officeTime(line.at).format('D MMM HH:mm')}
                          </time>
                        </td>
                        <td className="text-[10.5px] font-medium uppercase tracking-[0.06em]">
                          {line.verb}
                        </td>
                        <td>
                          {line.target}
                          {line.detail ? (
                            <span className="font-mono text-[11px] ml-2">{line.detail}</span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <EmptyPanel>
              {person.account
                ? 'Activity is readable by the Principal and by the account itself.'
                : `${person.staff.employee_name} has no login, so nothing is logged.`}
            </EmptyPanel>
          )}
        </div>

        <div className="border-t border-hairline bg-surface-2 px-5 py-3 flex items-center gap-2">
          <span className="text-[11px] mr-auto">
            {editing
              ? 'Saving updates the row behind this window — no page change.'
              : 'Esc closes.'}
          </span>
          {person && !editing ? (
            <>
              <Link
                href={`/team/people/${person.staff.id}`}
                className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-3 py-2 rounded-control transition-colors"
              >
                Full page
              </Link>
              {!person.account && person.active ? (
                onInvite ? (
                  <button
                    type="button"
                    onClick={() => onInvite(person.staff.id)}
                    className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-3 py-2 rounded-control transition-colors"
                  >
                    Invite
                  </button>
                ) : (
                  <Link
                    href={`/team/people?invite=${person.staff.id}`}
                    className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-3 py-2 rounded-control transition-colors"
                  >
                    Invite
                  </Link>
                )
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
        <Field label="InfoTech No" value={s.infotech_code ?? null} mono />
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
        <Field label="Account 1" value={[s.bank_name, s.bank_account_no].filter(Boolean).join(' · ') || null} />
        <Field label="Account 2" value={[s.bank_name_2, s.bank_account_no_2].filter(Boolean).join(' · ') || null} />
        {isFullyCommissionBased(s) ? (
          // No basic, no allowance, statutory at 0 — the one line says it all.
          <Field label="Pay basis" value="Fully commission based" />
        ) : isVariablePay(s) ? (
          // No fixed figure on the record; the month's is keyed on payroll and
          // still attracts statutory, so the EPF category is worth showing.
          <>
            <Field label="Pay basis" value="Variable — keyed monthly" />
            <Field
              label="EPF"
              value={s.is_epf_exempt ? 'Exempt' : `Part ${s.epf_category}`}
            />
          </>
        ) : (
          <>
            <Field label="Basic" value={person.canSee.salary ? s.basic_salary.toFixed(2) : MASKED} mono />
            <Field label="Allowance" value={person.canSee.salary ? s.allowances.toFixed(2) : MASKED} mono />
            <Field
              label="EPF"
              value={s.is_epf_exempt ? 'Exempt' : `Part ${s.epf_category}`}
            />
          </>
        )}
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[10px] font-bold uppercase tracking-[0.1em] mb-2 pb-1.5 border-b border-hairline">
        {title}
      </h3>
      <dl className="space-y-1.5">{children}</dl>
    </section>
  )
}

/** On the sheet every grey is black, so "not recorded" is told apart from a
 *  value by fading it rather than by a lighter colour. */
function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  const empty = value == null || value === ''
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 items-baseline">
      <dt className="text-[10.5px] font-medium uppercase tracking-[0.06em]">{label}</dt>
      <dd
        className={
          empty
            ? 'text-[12px] text-ink/60'
            : mono
              ? 'font-mono tabular text-[12.5px]'
              : 'text-sm'
        }
      >
        {empty ? 'not recorded' : value}
      </dd>
    </div>
  )
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center mb-5">
      <p className="text-sm max-w-md mx-auto">{children}</p>
    </div>
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
