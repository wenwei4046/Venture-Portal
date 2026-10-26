'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import { officeTime, officeToday } from '@/lib/office-time'
import { dayLabel, statusChip } from '@/lib/employment-status'
import { Chip, HistoryEvent, btn } from '@/components/hrv/kit'
import { CloseButton, Window } from '@/components/hrv/overlay'
import { Tabs } from '@/components/hrv/tabs'
import { initialsOf } from '@/lib/people-roster'
import { fullNameOf } from '@/lib/person-name'
import { MASKED } from '@/lib/sensitive'
import { isFullyCommissionBased, isVariablePay } from '@/lib/staff-form'
import { BASIC_FROM_COMMISSION } from '@/lib/person-record'
import PersonAccess from '../../_components/PersonAccess'
import { getPersonCard, type PersonCardData } from '../card-actions'
import s from './people.module.css'

type WindowTab = 'details' | 'permissions' | 'activity'

/**
 * One person, in the handoff's window (2026-10-10, the HR revamp): who they
 * are in a line and three chips, then Details · Permissions · Activity —
 * Details the eight fields the roster needs, a blank one marked "missing";
 * Permissions what their login may do (or, with none yet, Invite user);
 * Activity what the login has been doing. 760px, 900 on a login's
 * Permissions. Esc closes; Full page has the rest — editing, promoting,
 * ending their employment.
 */
export default function PersonWindow({
  personId,
  onClose,
  onInvite,
}: {
  personId: string
  onClose: () => void
  /** Opens Invite user for this person; absent for a reader who may not invite. */
  onInvite?: (staffId: string) => void
}) {
  const [data, setData] = useState<PersonCardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<WindowTab>('details')
  const [footSlot, setFootSlot] = useState<HTMLElement | null>(null)

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
    void load()
  }, [personId, load])

  const person = data
  const wide = tab === 'permissions' && !!person?.account
  // Their full name, as the roster row that opened it lists it (2026-10-20); Full page shows the two apart.
  const name = person ? fullNameOf(person.staff) : ''

  return (
    <Window open onClose={onClose} width={wide ? 900 : 760} label={name || 'Person'}>
      <div className={s.pwHead}>
        <span className={s.pwTile} aria-hidden="true">
          {initialsOf(name) || '··'}
        </span>
        <div className={s.pwWho}>
          <h2 className={s.pwName}>{person ? name.toUpperCase() : 'Loading…'}</h2>
          <div className={s.pwLine}>{person ? personLine(person) : ' '}</div>
          {person ? (
            <div className={s.pwChips}>
              {/* Probation, Permanent or Part time for the active (2026-10-23), as the roster's row reads. */}
              {person.active ? (
                <EmploymentChip staff={person.staff} />
              ) : (
                <Chip tone="danger" style={{ gap: 5, fontSize: 10.5 }}>
                  {person.resignedOn ? `Resigned ${person.resignedOn}` : 'Inactive'}
                </Chip>
              )}
              <Chip
                tone={person.account ? (person.account.invitePending ? 'alert' : person.account.isActive ? 'info' : 'danger') : 'plain'}
                style={{ gap: 5, fontSize: 10.5 }}
                title={person.account?.email}
              >
                {person.account
                  ? person.account.invitePending
                    ? 'Invited'
                    : person.account.isActive
                      ? 'Has login'
                      : 'Login disabled'
                  : 'No login'}
              </Chip>
              {person.missing.length > 0 ? (
                <Chip tone="alert" style={{ gap: 5, fontSize: 10.5 }} title={`Missing ${person.missing.join(', ')} — blocks payroll or the InfoTech import`}>
                  {person.missing.length} missing
                </Chip>
              ) : null}
            </div>
          ) : null}
        </div>
        <CloseButton onClick={onClose} />
      </div>

      <div className={s.pwTabs}>
        <Tabs
          items={[
            { key: 'details', label: 'Details' },
            { key: 'permissions', label: 'Permissions' },
            { key: 'activity', label: 'Activity' },
          ]}
          active={tab}
          onSelect={k => setTab(k as WindowTab)}
          size="small"
          label="Person"
        />
      </div>

      <div className={s.pwBody}>
        {error ? (
          <p className={s.pwError}>{error}</p>
        ) : !person ? (
          <p className={s.pwLoading}>Reading their record…</p>
        ) : tab === 'details' ? (
          <div className={s.pwFields}>
            {detailFields(person).map(f => (
              <div key={f.l}>
                <div className={s.pwLabel}>{f.l}</div>
                <div className={s.pwValue} data-mono={f.mono ? 'true' : undefined} data-missing={f.v ? undefined : 'true'}>
                  {f.v || 'missing'}
                </div>
              </div>
            ))}
          </div>
        ) : tab === 'permissions' ? (
          person.access && person.account ? (
            <PersonAccess access={person.access} canEdit={person.canManagePermissions} onSaved={() => void load()} personName={name} footSlot={footSlot} />
          ) : (
            <div className={s.pwEmpty}>
              {name} has no login yet, so there is nothing to set. Inviting them creates the account, and their title&apos;s
              permissions apply.
              {person.active && person.can.invite && onInvite ? (
                <div className={s.pwEmptyAction}>
                  <button type="button" className={`${btn('primary')} ${s.headBtn}`} onClick={() => onInvite(person.staff.id)}>
                    Invite user
                  </button>
                </div>
              ) : null}
            </div>
          )
        ) : person.activity ? (
          person.activity.length === 0 ? (
            <div className={s.pwEmpty}>Nothing recorded yet. Page visits are logged from the moment they next sign in.</div>
          ) : (
            <div>
              {person.activity.map((line, i) => (
                <HistoryEvent
                  key={`${line.at}-${i}`}
                  what={`${line.verb} ${line.target}`}
                  when={officeTime(line.at).format('D MMM HH:mm')}
                  who={line.detail ?? undefined}
                />
              ))}
            </div>
          )
        ) : (
          <div className={s.pwEmpty}>
            {person.account
              ? 'Activity is readable by the Principal and by the account itself.'
              : `${name} has no login, so nothing is logged.`}
          </div>
        )}
      </div>

      <div className={s.pwFoot}>
        <span className={s.pwHint}>Esc closes.</span>
        {/* Reset to title and Save, while Permissions is open (the handoff's footer). */}
        <span ref={setFootSlot} className={s.pwFootSlot} hidden={tab !== 'permissions'} />
        {/* An invite link never used (2026-10-16): a new one, or a password now. */}
        {person?.account?.invitePending && person.active && person.can.invite && onInvite ? (
          <button type="button" className={`${btn('outline')} ${s.pwFull}`} onClick={() => onInvite(person.staff.id)}>
            Invite again
          </button>
        ) : null}
        {person ? (
          <Link href={`/team/people/${person.staff.id}`} className={`${btn('outline')} ${s.pwFull}`}>
            Full page
          </Link>
        ) : null}
      </div>
    </Window>
  )
}

/**
 * Their employment's chip — a probation's or a contract's names its end ("Probation · ends 31 Dec 2026", "Contract · ends
 * 30 Sep 2027"), which the window has room for.
 */
function EmploymentChip({ staff }: { staff: PersonCardData['staff'] }) {
  const end = staff.employment_status === 'probation' ? (staff.probation_end ?? null) : null
  const contractEnd = staff.employment_status === 'contract' ? (staff.contract_end ?? null) : null
  const ack = staff.employment_status === 'contract'
    ? { ackEnd: staff.contract_ack_end ?? null, ackAt: staff.contract_ack_at ?? null, ackName: staff.contract_ack_name ?? null }
    : { ackEnd: staff.probation_ack_end ?? null, ackAt: staff.probation_ack_at ?? null, ackName: staff.probation_ack_name ?? null }
  const chip = statusChip({ status: staff.employment_status, probationEnd: end, contractEnd, ack }, officeToday())
  const label = chip.label === 'Probation' && end ? `Probation · ends ${dayLabel(end)}`
    : chip.label === 'Contract' && contractEnd ? `Contract · ends ${dayLabel(contractEnd)}`
    : chip.label
  return (
    <Chip tone={chip.tone} style={{ gap: 5, fontSize: 10.5 }} title={chip.title}>
      {label}
    </Chip>
  )
}

/** "HV008 · TEAM LEADER · Revenue" — the handoff's identity line. */
export function personLine(p: Pick<PersonCardData, 'code' | 'title' | 'department'>): string {
  return [p.code, p.title?.toUpperCase(), p.department].filter(Boolean).join(' · ')
}

/** The eight fields the window opens on, in the handoff's order; a blank one reads "missing". */
export function detailFields(p: PersonCardData): Array<{ l: string; v: string; mono?: boolean }> {
  const st = p.staff
  const bank = [st.bank_name, st.bank_account_no].filter(Boolean).join(' · ')
  return [
    { l: 'Title', v: p.title ?? '' },
    { l: 'Department', v: p.department ?? '' },
    { l: 'Employee Code', v: st.employee_code ?? '', mono: true },
    { l: 'Employment Type', v: employmentType(st) },
    { l: 'Hire Date', v: st.hire_date ? dayjs(st.hire_date).format('D MMM YYYY') : '' },
    { l: 'Phone', v: st.contact_number ?? '', mono: true },
    { l: 'Email', v: st.email ?? p.account?.email ?? '' },
    { l: 'Account 1 bank', v: bank === MASKED ? MASKED : bank },
  ]
}

/** The handoff's "Commission" for somebody paid wholly on it; the record's other two in words. */
function employmentType(st: PersonCardData['staff']): string {
  if (isFullyCommissionBased(st)) return 'Commission'
  if (isVariablePay(st)) return 'Variable pay'
  // A basic in a commission department is paid out of the commission (2026-10-14).
  if (st.commission_dept && st.employment_type === 'salaried') return BASIC_FROM_COMMISSION
  return st.employment_type === 'commission_eligible' ? 'Commission-eligible' : 'Salaried'
}
