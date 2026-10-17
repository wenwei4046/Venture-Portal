'use client'

import Link from 'next/link'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import { btn, Chip } from '@/components/hrv/kit'
import { NavIcon, type HrIconName } from '@/components/hrv/icons'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import { initialsOf } from '@/lib/people-roster'
import { keptParts } from '@/lib/person-name'
import { EPF_PARTS, PCB_CATEGORIES, SOCSO_CATEGORIES, type StaffRow, type TitleRow } from '@/lib/staff-form'
import type { UplineGroup } from '@/lib/upline-choices'
import {
  EPF_LABELS,
  BASIC_FROM_COMMISSION,
  LOGIN_EMAIL_LOCKED,
  PCB_LABELS,
  SOCSO_LABELS,
  asksPay,
  asksStatutory,
  changedFields,
  changedFormData,
  changesLabel,
  choosesByTick,
  payModeChoices,
  payModeLabel,
  payModeFields,
  payModeOf,
  type PayMode,
} from '@/lib/person-record'
import { updateStaff } from '../actions'
import PersonWell from '../../_components/PersonWell'
import s from './person-record.module.css'

/**
 * A person's record on their full page — a 360 since 2026-10-16 (the user
 * picked option C of three: "go with type c, then the wording maybe make more
 * 明显一点"). Who they are and where they stand sit in a card on the left —
 * their tile, name, chips, Department, Reports to, Level, Employment Type and
 * Hire date; the rest of the record in wells on the right.
 *
 * Edited where it stands (2026-10-14, the user: "when i press edit, no need
 * jump to another tab, it should be can edit key in column"): Edit turns each
 * fact into its field in the same place. The bar at the sheet's foot holds
 * Cancel and Save, and stays in view while the page scrolls. Save sends only
 * the fields that changed, so it never puts back what somebody else changed
 * since the page was opened. The old Edit page (`/team/people/[id]/edit`)
 * sends here with `?edit=1`.
 */

/** What the page reads, worded — and masked — by the server as this viewer may see it. */
export interface PersonRecordView {
  name: string
  /** What the apps call them (2026-10-17) — the full name above stays the one on their IC. */
  firstName: string | null
  lastName: string | null
  department: string
  code: string | null
  title: string | null
  /** The rung their title stands on ("L3"); null off the ladder. */
  level: string | null
  active: boolean
  /** Their login: signing in, switched off, or none. */
  login: 'active' | 'disabled' | null
  /** Who they report to — `href` only for a reader of the whole roster. */
  reportsTo: { name: string; title: string | null; href: string | null; active: boolean } | null
  /** As the page writes a date ("05 Jan 2026"). */
  hireDate: string | null
  /** How long they have been with the company ("9 months"). */
  tenure: string | null
  resignationDate: string | null
  nric: string | null
  infotechCode: string | null
  /** For somebody with a login, the email they sign in with. */
  contact: { phone: string | null; email: string | null; address: string | null }
  emergency: { name: string | null; relationship: string | null; phone: string | null }
  bank: { name1: string | null; no1: string | null; name2: string | null; no2: string | null }
  payMode: PayMode
  /** A department the commission engine pays (Revenue): a basic there is paid out of the commission. */
  commissionDept: boolean
  /** Formatted, or •••• where the viewer's title does not tick Salary amounts. */
  pay: { basic: string; allowances: string; nonStatutory: string }
  statutory: { epf: string; socso: string; pcb: string; children: string }
}

/**
 * Handed only to somebody who may edit (Team · Edit, the Salary tick — the
 * save writes pay — and the roster's own read). NRIC and the account numbers
 * come as their reader gave them; an unticked one shows, and is not sent.
 */
export interface PersonEditor {
  staff: StaffRow
  /** Every title, active or not — the row offers the department's. */
  titles: TitleRow[]
  canSee: { nric: boolean; bank: boolean }
  /** Who they report to now; null = nobody. */
  reportsTo: string | null
  /** The uplines they may have, a group per department — null while they are not on the active roster. */
  uplines: UplineGroup[] | null
}

/** The editor while editing; null while the page reads. */
const Editing = createContext<PersonEditor | null>(null)
/** The fields whose value is not the one they were drawn with. */
const Changed = createContext<ReadonlySet<string>>(new Set())

const fieldId = (name: string) => `person-${name}`

export default function PersonRecord({
  view,
  editor,
  inviteHref,
  startEditing = false,
}: {
  view: PersonRecordView
  editor: PersonEditor | null
  /** Invite user, while they have no login and the viewer may make one. */
  inviteHref: string | null
  /** Opened from the old Edit address. */
  startEditing?: boolean
}) {
  const [editing, setEditing] = useState(startEditing && editor !== null)
  const initialMode = editor ? payModeOf(editor.staff) : view.payMode
  const [mode, setMode] = useState<PayMode>(initialMode)
  const [changed, setChanged] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [saving, startSaving] = useTransition()
  const form = useRef<HTMLFormElement>(null)
  const editButton = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(editing)

  // Saved, and waiting for the page to read itself again: the fresh record
  // lands a moment after the save answers, and in that moment the page would
  // read the old values back as if nothing was saved (seen 2026-10-14).
  const [settling, setSettling] = useState(false)
  const savedFrom = useRef<PersonRecordView | null>(null)

  const ed = editing ? editor : null
  const count = changed.size + (ed && mode !== initialMode ? 1 : 0)
  const busy = saving || settling

  function enter() {
    setMode(initialMode)
    setChanged(new Set())
    setError(null)
    setEditing(true)
  }

  const leave = useCallback(() => {
    setEditing(false)
    setChanged(new Set())
    setError(null)
    // The old Edit address lands here with ?edit=1 — leaving edit leaves it.
    const url = new URL(window.location.href)
    if (url.searchParams.has('edit')) {
      url.searchParams.delete('edit')
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    }
  }, [])

  // The fresh record has arrived: read it, and say it was saved.
  useEffect(() => {
    if (!settling || view === savedFrom.current) return
    setSettling(false)
    leave()
    flash('Saved')
  }, [settling, view, leave])

  // …and should it never come, the page reads anyway.
  useEffect(() => {
    if (!settling) return
    const late = setTimeout(() => {
      setSettling(false)
      leave()
      flash('Saved')
    }, 6000)
    return () => clearTimeout(late)
  }, [settling, leave])

  // A pay basis that adds or takes away rows: count again over the rows now drawn.
  useLayoutEffect(() => {
    if (editing && form.current) setChanged(changedFields(form.current))
  }, [editing, mode])

  // Done editing: the keyboard goes back to Edit.
  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus()
    wasEditing.current = editing
  }, [editing])

  // Unsaved changes hold a reload or a closed tab (saved ones waiting for the
  // fresh record do not).
  useEffect(() => {
    if (!editing || count === 0 || settling) return
    const hold = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', hold)
    return () => window.removeEventListener('beforeunload', hold)
  }, [editing, count, settling])

  // A field changed: count again, and a refusal said about the last try goes.
  function edited() {
    if (form.current) setChanged(changedFields(form.current))
    setError(null)
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor || busy) return
    if (count === 0) {
      leave()
      return
    }
    // Only what changed goes (2026-10-14): a field left as it was drawn is not
    // sent, so the save cannot put back an older value over somebody else's
    // change made since this page was opened.
    const data = changedFormData(event.currentTarget, changedFields(event.currentTarget), mode !== initialMode ? payModeFields(mode) : {})
    setError(null)
    startSaving(async () => {
      try {
        const outcome = await updateStaff(editor.staff.id, data)
        if (outcome.ok) {
          savedFrom.current = view
          setSettling(true)
        } else {
          setError(outcome.reason)
        }
      } catch {
        setError('Could not save. Check the connection and try again.')
      }
    })
  }

  const titleChoices = useMemo(() => {
    if (!editor) return []
    const { department_id, title_id } = editor.staff
    // The department's active titles (and those of no department), plus the
    // one they hold whatever it is now — a save that leaves the row must not
    // drop a title since deactivated or moved.
    return editor.titles.filter(t => t.id === title_id || (t.is_active && (!t.department_id || t.department_id === department_id)))
  }, [editor])

  const shownMode = ed ? mode : view.payMode
  // Revenue's people: one tick on the Salary section, Basic from commission
  // (2026-10-14) — not the Employment Type select.
  const byTick = editor !== null && choosesByTick(editor.staff, initialMode)
  const basisRow = (checked: boolean) =>
    byTick
      ? () => (
          <label className={s.tick} data-dirty={mode !== initialMode ? 'true' : undefined}>
            <input
              id={fieldId('basic_from_commission')}
              type="checkbox"
              checked={checked}
              onChange={event => setMode(event.target.checked ? 'salaried' : 'full_commission')}
              className={s.check}
            />
            {BASIC_FROM_COMMISSION}
          </label>
        )
      : undefined

  const upline = view.reportsTo ? (
    <>
      {view.reportsTo.href ? (
        <Link href={view.reportsTo.href} className={s.person}>
          {view.reportsTo.name}
        </Link>
      ) : (
        view.reportsTo.name
      )}
      {view.reportsTo.title || !view.reportsTo.active ? (
        <span className={s.sub}>{[view.reportsTo.title, view.reportsTo.active ? null : 'inactive'].filter(Boolean).join(' · ')}</span>
      ) : null}
    </>
  ) : null

  // Their login's email reads as theirs: a word beside it, and no field.
  const email = view.contact.email ? (
    <>
      {view.contact.email}
      {view.login ? (
        <Chip tone="plain" soft style={{ marginLeft: 8, verticalAlign: 1 }}>
          Login
        </Chip>
      ) : null}
    </>
  ) : null

  const profile = (
    <aside className={s.profile} aria-label={view.name}>
      <span className={s.tile} data-login={view.login === 'active' ? 'true' : undefined} aria-hidden>
        {initialsOf(view.name)}
      </span>
      <div className={`page-eyebrow ${s.eyebrow}`}>
        <em>I.</em> PEOPLE · {view.department.toUpperCase()}
      </div>
      <h1 className={`page-title ${s.name}`}>
        {ed ? (
          <>
            <label htmlFor={fieldId('name')} className="sr-only">
              Name
            </label>
            <NameField defaultValue={ed.staff.employee_name} />
          </>
        ) : (
          view.name
        )}
      </h1>
      {view.code || view.title ? (
        // Plain text, so a long title wraps inside itself, never leaving the dot alone.
        <p className={s.line}>
          {view.code && <span className={s.mono}>{view.code}</span>}
          {view.code && view.title ? ' · ' : null}
          {view.title}
        </p>
      ) : null}
      <div className={s.chips}>
        <Chip tone={view.active ? 'ledger' : 'danger'}>
          {view.active ? 'Active' : view.resignationDate ? `Resigned ${view.resignationDate}` : 'Inactive'}
        </Chip>
        <Chip tone={view.login ? (view.login === 'active' ? 'info' : 'danger') : 'plain'}>
          {view.login ? (view.login === 'active' ? 'Has login' : 'Login disabled') : 'No login'}
        </Chip>
        {editing ? (
          <span className="chip accent">
            <span className="dot" aria-hidden />
            Editing
          </span>
        ) : null}
      </div>
      {!editing && (editor || inviteHref) ? (
        <div className={s.actions}>
          {editor ? (
            <button ref={editButton} type="button" onClick={enter} className={`${btn('primary')} ${s.action}`}>
              Edit
            </button>
          ) : null}
          {/* One person, one login — so this is offered only while they have
              none, and only to whoever may mint one. */}
          {inviteHref ? (
            <Link href={inviteHref} className={`${btn('outline')} ${s.action}`}>
              Invite
            </Link>
          ) : null}
        </div>
      ) : null}
      <dl className={s.sideFacts}>
        {ed ? (
          // Read, the title is the line under the name; edited, it is a field here.
          <SideFact
            label="Title"
            field="title_id"
            value={view.title}
            edit={e => (
              <SelectField
                name="title_id"
                defaultValue={e.staff.title_id ?? ''}
                options={[
                  { value: '', label: '— None' },
                  ...titleChoices.map(t => ({ value: t.id, label: t.is_active ? t.name : `${t.name} (inactive)` })),
                ]}
              />
            )}
          />
        ) : null}
        <SideFact label="Department" value={view.department} />
        <SideFact
          label="Reports to"
          field="reports_to"
          value={upline}
          // Saved by the one writer both charts use (moveReportingLine); not
          // offered while they are off the active roster, which it refuses.
          edit={editor?.uplines ? e => <UplineField current={e.reportsTo} groups={e.uplines ?? []} /> : undefined}
        />
        <SideFact label="Level" value={view.level} />
        <SideFact
          label="Employment Type"
          field="employment_mode"
          value={payModeLabel(shownMode, { commission_dept: view.commissionDept })}
          // A commission department answers it with the Salary section's tick.
          edit={byTick ? undefined : e => (
            // Not a field of its own: a new basis is sent as the old form's
            // ticks or its select (payModeFields), which updateStaff reads.
            <Select
              id={fieldId('employment_mode')}
              value={mode}
              onChange={event => setMode(event.target.value as PayMode)}
              className={s.select}
              data-dirty={mode !== initialMode ? 'true' : undefined}
            >
              {payModeChoices(e.staff, initialMode).map(m => (
                <option key={m} value={m}>
                  {payModeLabel(m, e.staff)}
                </option>
              ))}
            </Select>
          )}
        />
        <SideFact
          label="Hire Date"
          field="hire_date"
          value={view.hireDate ? [view.hireDate, view.tenure].filter(Boolean).join(' · ') : null}
          edit={e => <TextField name="hire_date" type="date" defaultValue={e.staff.hire_date} />}
        />
      </dl>
    </aside>
  )

  const wells = (
    <div className={s.wells}>
      <Well title="Identity" icon="idCard">
        {/* First and last name (2026-10-17, the user: "大家的名字需要拆分为 first name 和 last name"): what the apps
            call them — the Revenue app greets by the first. Filled from the full name's first word and the rest. */}
        <Fact
          label="First Name"
          field="first_name"
          value={view.firstName}
          edit={e => <TextField name="first_name" defaultValue={keptParts(e.staff).first} maxLength={80} autoComplete="off" />}
        />
        <Fact
          label="Last Name"
          field="last_name"
          value={view.lastName}
          edit={e => <TextField name="last_name" defaultValue={keptParts(e.staff).last} maxLength={120} autoComplete="off" />}
        />
        <Fact
          label="NRIC"
          field="nric"
          value={view.nric}
          mono
          edit={e =>
            e.canSee.nric ? (
              // The dash is escaped: unescaped between `9` and `\s` the
              // browser reads a range, throws under the `v` flag and drops
              // the constraint altogether.
              <TextField name="nric" defaultValue={e.staff.nric} pattern="[0-9\-\s]*" mono />
            ) : (
              <Locked value={e.staff.nric} why="NRIC / IC is not ticked for your title" />
            )
          }
        />
        <Fact
          label="Employee Code"
          field="employee_code"
          value={view.code}
          mono
          // Numbered by the database (HV + max + 1, 2026-09-12); a code is
          // never cleared, only corrected by typing another.
          edit={e => <TextField name="employee_code" defaultValue={e.staff.employee_code} mono />}
        />
        <Fact
          label="InfoTech No"
          field="infotech_code"
          value={view.infotechCode}
          mono
          edit={e => <TextField name="infotech_code" defaultValue={e.staff.infotech_code} mono />}
        />
        <Fact
          label="Resignation Date"
          field="resignation_date"
          value={view.resignationDate}
          edit={e => <TextField name="resignation_date" type="date" defaultValue={e.staff.resignation_date} />}
        />
      </Well>

      <Well title="Contact" icon="phone">
        <Fact
          label="Phone"
          field="contact_number"
          value={view.contact.phone}
          mono
          edit={e => <TextField name="contact_number" type="tel" defaultValue={e.staff.contact_number} mono />}
        />
        <Fact
          label="Email"
          field={view.login ? undefined : 'email'}
          value={email}
          edit={e =>
            view.login ? (
              <Locked value={view.contact.email} why={LOGIN_EMAIL_LOCKED} icon tag="Login" />
            ) : (
              <TextField name="email" type="email" defaultValue={e.staff.email} />
            )
          }
        />
        <Fact
          label="Address"
          field="address"
          value={view.contact.address}
          multiline
          wide
          edit={e => <AreaField name="address" defaultValue={e.staff.address} />}
        />
      </Well>

      <Well title="Emergency contact" icon="buoy">
        <Fact
          label="Name"
          field="emergency_contact_name"
          value={view.emergency.name}
          edit={e => <TextField name="emergency_contact_name" defaultValue={e.staff.emergency_contact_name} />}
        />
        <Fact
          label="Relationship"
          field="emergency_contact_relationship"
          value={view.emergency.relationship}
          edit={e => <TextField name="emergency_contact_relationship" defaultValue={e.staff.emergency_contact_relationship} />}
        />
        <Fact
          label="Phone"
          field="emergency_contact_phone"
          value={view.emergency.phone}
          mono
          edit={e => <TextField name="emergency_contact_phone" type="tel" defaultValue={e.staff.emergency_contact_phone} mono />}
        />
      </Well>

      <Well title="Bank accounts" icon="bank">
        <Fact
          label="Account 1 bank"
          field="bank_name"
          value={view.bank.name1}
          edit={e =>
            e.canSee.bank ? (
              <TextField name="bank_name" defaultValue={e.staff.bank_name} />
            ) : (
              <Locked value={e.staff.bank_name} why="Bank accounts is not ticked for your title" />
            )
          }
        />
        <Fact
          label="Account 1 number"
          field="bank_account_no"
          value={view.bank.no1}
          mono
          edit={e =>
            e.canSee.bank ? (
              <TextField name="bank_account_no" defaultValue={e.staff.bank_account_no} inputMode="numeric" autoComplete="off" mono />
            ) : (
              <Locked value={e.staff.bank_account_no} why="Bank accounts is not ticked for your title" />
            )
          }
        />
        {/* Account 2 is optional: both the bank and the number, or neither. */}
        <Fact
          label="Account 2 bank"
          field="bank_name_2"
          value={view.bank.name2}
          edit={e =>
            e.canSee.bank ? (
              <TextField name="bank_name_2" defaultValue={e.staff.bank_name_2} autoComplete="off" />
            ) : (
              <Locked value={e.staff.bank_name_2 ?? null} why="Bank accounts is not ticked for your title" />
            )
          }
        />
        <Fact
          label="Account 2 number"
          field="bank_account_no_2"
          value={view.bank.no2}
          mono
          edit={e =>
            e.canSee.bank ? (
              <TextField name="bank_account_no_2" defaultValue={e.staff.bank_account_no_2} inputMode="numeric" autoComplete="off" mono />
            ) : (
              <Locked value={e.staff.bank_account_no_2 ?? null} why="Bank accounts is not ticked for your title" />
            )
          }
        />
      </Well>

      {/* Paid 100% on commission: no basic, no allowances, statutory at 0 —
          so salary says so and statutory is neither shown nor asked. A save
          then leaves the categories as they were (payPatchForUpdate). */}
      {shownMode === 'full_commission' ? (
        <Well title="Salary" icon="payroll">
          <Fact label="Pay basis" value="Fully commission based" edit={basisRow(false)} />
          <Fact label="Basic" value="None — 100% of pay is commission" wide />
        </Well>
      ) : (
        <>
          <Well title="Salary" icon="payroll">
            {/* A basic in a commission department is paid out of the month's
                commission (lib/revenue-payroll.ts); each new month's payroll
                row starts from it (Comm Cal's close copies the basic). */}
            {view.commissionDept && shownMode === 'salaried' ? (
              <Fact label="Pay basis" value={BASIC_FROM_COMMISSION} edit={basisRow(true)} wide />
            ) : null}
            {asksPay(shownMode) ? (
              <>
                <Fact
                  label="Basic"
                  field="basic_salary"
                  value={view.pay.basic}
                  mono
                  edit={e => (
                    <TextField
                      name="basic_salary"
                      type="number"
                      step="0.01"
                      // Out of commission it has to be something: a basic of 0 is Fully commission based.
                      min={byTick ? '0.01' : '0'}
                      required
                      defaultValue={e.staff.basic_salary}
                      mono
                    />
                  )}
                />
                <Fact
                  label="Statutory Allowance"
                  field="allowances"
                  value={view.pay.allowances}
                  mono
                  edit={e => <TextField name="allowances" type="number" step="0.01" min="0" defaultValue={e.staff.allowances} mono />}
                />
                <Fact
                  label="Non-Statutory Allowance"
                  field="non_statutory_allowance"
                  value={view.pay.nonStatutory}
                  mono
                  edit={e => (
                    <TextField name="non_statutory_allowance" type="number" step="0.01" min="0" defaultValue={e.staff.non_statutory_allowance ?? 0} mono />
                  )}
                />
              </>
            ) : (
              // Variable pay (Director department): the month's figure is
              // keyed on that month's payroll — statutory still applies to it.
              <>
                <Fact label="Pay basis" value="Variable pay — keyed monthly" wide />
                <Fact label="Basic" value="None — worked out each month by the Director Salary engine" wide />
              </>
            )}
          </Well>

          {asksStatutory(shownMode) ? (
            <Well title="Statutory" icon="shield">
              <Fact
                label="EPF"
                field="epf_category"
                value={view.statutory.epf}
                edit={e => (
                  <span className={s.pair}>
                    <SelectField
                      name="epf_category"
                      defaultValue={e.staff.epf_category}
                      options={EPF_PARTS.map(p => ({ value: p, label: EPF_LABELS[p] }))}
                    />
                    <label className={s.tick}>
                      <CheckField name="is_epf_exempt" defaultChecked={e.staff.is_epf_exempt} />
                      Exempt
                    </label>
                  </span>
                )}
              />
              <Fact
                label="SOCSO"
                field="socso_category"
                value={view.statutory.socso}
                edit={e => (
                  <SelectField
                    name="socso_category"
                    defaultValue={e.staff.socso_category}
                    options={SOCSO_CATEGORIES.map(c => ({ value: c, label: SOCSO_LABELS[c] }))}
                  />
                )}
              />
              <Fact
                label="PCB"
                field="pcb_category"
                value={view.statutory.pcb}
                edit={e => (
                  <SelectField
                    name="pcb_category"
                    defaultValue={e.staff.pcb_category}
                    options={PCB_CATEGORIES.map(c => ({ value: c, label: PCB_LABELS[c] }))}
                  />
                )}
              />
              <Fact
                label="Children"
                field="children_count"
                value={view.statutory.children}
                mono
                edit={e => <TextField name="children_count" type="number" min="0" step="1" defaultValue={e.staff.children_count ?? 0} mono />}
              />
            </Well>
          ) : null}
        </>
      )}
    </div>
  )

  const layout = (
    <div className={s.layout} data-editing={ed ? 'true' : undefined}>
      {profile}
      <div className={s.main}>{wells}</div>
    </div>
  )

  // One element stands at the page's top level in both modes: the portal
  // settles a NEWLY inserted top-level block in from nothing (globals.css ›
  // route-fade), so a form put there by Edit made the whole record blink.
  return (
    <div>
      <Editing.Provider value={ed}>
        {ed ? (
          <Changed.Provider value={changed}>
            <form ref={form} onSubmit={save} onChange={edited} aria-label={`Edit ${view.name}`}>
              {layout}
              <div className={s.bar} role="region" aria-label="Save changes">
                <span className={s.barText} aria-live="polite">
                  {error ? (
                    <span className={s.barError} role="alert">
                      {error}
                    </span>
                  ) : (
                    <>
                      <b>Editing</b> · {changesLabel(count)}
                    </>
                  )}
                </span>
                <span className={s.barActions}>
                  <button type="button" className={btn('outline')} onClick={leave} disabled={busy}>
                    Cancel
                  </button>
                  <button type="submit" className={btn('primary')} disabled={busy || count === 0}>
                    {busy ? 'Saving…' : 'Save changes'}
                  </button>
                </span>
              </div>
            </form>
          </Changed.Provider>
        ) : (
          layout
        )}
      </Editing.Provider>
    </div>
  )
}

/** A well of the record: its icon and title in caps over its facts, two to a row. */
function Well({ title, icon, children }: { title: string; icon: HrIconName; children: ReactNode }) {
  return (
    <PersonWell title={title} icon={icon}>
      <dl className={s.facts}>{children}</dl>
    </PersonWell>
  )
}

type FactProps = {
  label: string
  /** The field's name, which its label points at. */
  field?: string
  value: ReactNode
  mono?: boolean
  multiline?: boolean
  edit?: (editor: PersonEditor) => ReactNode
}

/**
 * One fact in a well: its label over its value — or, while editing, over the
 * field `edit` draws in the value's place. A fact with no `edit` reads the
 * same in both. `wide` takes the well's whole row.
 */
function Fact({ wide, ...fact }: FactProps & { wide?: boolean }) {
  return (
    <div className={s.fact} data-wide={wide ? 'true' : undefined}>
      <FactBody {...fact} />
    </div>
  )
}

/** One fact on the card, a hairline above it: its label over its value, or over its field while editing. */
function SideFact(fact: FactProps) {
  return (
    <div className={s.sideFact}>
      <FactBody {...fact} />
    </div>
  )
}

function FactBody({ label, field, value, mono, multiline, edit }: FactProps) {
  const editor = useContext(Editing)
  if (editor && edit) {
    return (
      <>
        <dt>
          <label htmlFor={field ? fieldId(field) : undefined} className={s.label}>
            {label}
          </label>
        </dt>
        <dd className={s.field}>{edit(editor)}</dd>
      </>
    )
  }
  const isEmpty = value == null || value === ''
  return (
    <>
      <dt className={s.label}>{label}</dt>
      <dd className={[s.value, mono && !isEmpty ? s.mono : '', multiline ? s.multiline : '', isEmpty ? s.empty : ''].filter(Boolean).join(' ')}>
        {isEmpty ? '—' : value}
      </dd>
    </>
  )
}

function useChanged(name: string): 'true' | undefined {
  return useContext(Changed).has(name) ? 'true' : undefined
}

function TextField({
  name,
  defaultValue,
  mono,
  ...rest
}: { name: string; defaultValue: string | number | null | undefined; mono?: boolean } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'name' | 'defaultValue' | 'id' | 'className'
>) {
  return (
    <input
      id={fieldId(name)}
      name={name}
      defaultValue={defaultValue ?? ''}
      data-dirty={useChanged(name)}
      className={mono ? `${s.input} ${s.inputMono}` : s.input}
      {...rest}
    />
  )
}

function AreaField({ name, defaultValue }: { name: string; defaultValue: string | null }) {
  return (
    <textarea
      id={fieldId(name)}
      name={name}
      rows={2}
      defaultValue={defaultValue ?? ''}
      data-dirty={useChanged(name)}
      className={`${s.input} ${s.area}`}
    />
  )
}

function SelectField({ name, defaultValue, options }: { name: string; defaultValue: string; options: Array<{ value: string; label: string }> }) {
  return (
    <Select id={fieldId(name)} name={name} defaultValue={defaultValue} data-dirty={useChanged(name)} className={s.select}>
      {options.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  )
}

/**
 * Reports to: "— None", then the uplines a department at a time, theirs
 * first, and last everybody the line may not go to, greyed with why after
 * their name (lib/upline-choices.ts).
 */
function UplineField({ current, groups }: { current: string | null; groups: UplineGroup[] }) {
  return (
    <Select id={fieldId('reports_to')} name="reports_to" defaultValue={current ?? ''} data-dirty={useChanged('reports_to')} className={s.select}>
      <option value="">— None</option>
      {groups.map(g => (
        <optgroup key={g.name} label={g.name}>
          {g.choices.map(c => (
            <option key={c.value} value={c.value} disabled={c.disabled}>
              {c.label}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  )
}

function CheckField({ name, defaultChecked }: { name: string; defaultChecked: boolean }) {
  return <input type="checkbox" name={name} defaultChecked={defaultChecked} data-dirty={useChanged(name)} className={s.check} />
}

/** The name, in the title's place and face. */
function NameField({ defaultValue }: { defaultValue: string }) {
  return (
    <input
      id={fieldId('name')}
      name="name"
      required
      defaultValue={defaultValue}
      autoComplete="off"
      data-dirty={useChanged('name')}
      className={s.nameField}
    />
  )
}

/**
 * A value this editor may not change (DESIGN.md › A hidden value): shown as
 * the reader gave it — •••• when on file — with no field behind it, so the
 * save leaves it as it was. Why, on hover. A login's email wears a padlock
 * and its word.
 */
function Locked({ value, why, icon = false, tag }: { value: string | null; why: string; icon?: boolean; tag?: string }) {
  return (
    <span className={s.locked} title={why}>
      {icon ? (
        <span className={s.lockedIcon} aria-hidden>
          <NavIcon name="lock" size={14} />
        </span>
      ) : null}
      <span className={s.lockedValue}>{value ? value : '—'}</span>
      {tag ? (
        <Chip tone="plain" soft>
          {tag}
        </Chip>
      ) : null}
    </span>
  )
}
