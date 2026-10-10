'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import { officeTime } from '@/lib/office-time'
import { Chip, HistoryEvent, btn } from '@/components/hrv/kit'
import { CloseButton, Window } from '@/components/hrv/overlay'
import { Tabs } from '@/components/hrv/tabs'
import { initialsOf } from '@/lib/people-roster'
import { MASKED } from '@/lib/sensitive'
import { isFullyCommissionBased, isVariablePay } from '@/lib/staff-form'
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
  const name = person?.staff.employee_name ?? ''

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
              <Chip tone={person.active ? 'ledger' : 'danger'} style={{ gap: 5, fontSize: 10.5 }}>
                {person.active ? 'Active' : person.resignedOn ? `Resigned ${person.resignedOn}` : 'Inactive'}
              </Chip>
              <Chip
                tone={person.account ? (person.account.isActive ? 'info' : 'danger') : 'plain'}
                style={{ gap: 5, fontSize: 10.5 }}
                title={person.account?.email}
              >
                {person.account ? (person.account.isActive ? 'Has login' : 'Login disabled') : 'No login'}
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
            <PersonAccess access={person.access} canEdit={person.canManagePermissions} onSaved={() => void load()} />
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
        {person ? (
          <Link href={`/team/people/${person.staff.id}`} className={`${btn('outline')} ${s.pwFull}`}>
            Full page
          </Link>
        ) : null}
      </div>
    </Window>
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
  return st.employment_type === 'commission_eligible' ? 'Commission-eligible' : 'Salaried'
}
