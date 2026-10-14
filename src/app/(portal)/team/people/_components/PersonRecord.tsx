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
import { btn } from '@/components/hrv/kit'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import { EPF_PARTS, PCB_CATEGORIES, SOCSO_CATEGORIES, type StaffRow, type TitleRow } from '@/lib/staff-form'
import {
  EPF_LABELS,
  PAY_MODE_LABEL,
  PCB_LABELS,
  SOCSO_LABELS,
  asksPay,
  asksStatutory,
  changedFields,
  changedFormData,
  changesLabel,
  payModeChoices,
  payModeFields,
  payModeOf,
  type PayMode,
} from '@/lib/person-record'
import { updateStaff } from '../actions'
import s from './person-record.module.css'

/**
 * A person's record on their full page, read — and edited where it stands
 * (2026-10-14, the user: "when i press edit, no need jump to another tab, it
 * should be can edit key in column"). Edit turns each fact into its field in
 * the same row of the same section; Department, Account and Role stay as they
 * read. The bar at the sheet's foot holds Cancel and Save, and stays in view
 * while the page scrolls. Save sends only the fields that changed, so it never
 * puts back what somebody else changed since the page was opened. The old
 * Edit page (`/team/people/[id]/edit`) sends here with `?edit=1`.
 */

/** What the page reads, worded — and masked — by the server as this viewer may see it. */
export interface PersonRecordView {
  name: string
  department: string
  code: string | null
  title: string | null
  resignationDate: string | null
  account: { email: string; role: string } | null
  nric: string | null
  infotechCode: string | null
  hireDate: string | null
  contact: { phone: string | null; email: string | null; address: string | null }
  emergency: { name: string | null; relationship: string | null; phone: string | null }
  bank: { name1: string | null; no1: string | null; name2: string | null; no2: string | null }
  payMode: PayMode
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

  const head = (
    <div className="page-head">
      <div className={ed ? 'flex-1 min-w-0' : undefined}>
        <div className="page-eyebrow">
          <em>I.</em> PEOPLE · {view.department.toUpperCase()}
        </div>
        {ed ? (
          <h1 className="page-title">
            <label htmlFor={fieldId('name')} className="sr-only">
              Name
            </label>
            <NameField defaultValue={ed.staff.employee_name} />
          </h1>
        ) : (
          <h1 className="page-title">{view.name}</h1>
        )}
        <p className="text-sm mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          {view.code && <span className="font-mono">{view.code}</span>}
          {view.code && view.title ? <span aria-hidden>·</span> : null}
          {view.title && <span>{view.title}</span>}
          {/* Resigned is a state, so it is a word on the red wash. */}
          {view.resignationDate && (
            <span className="chip danger">
              <span className="dot" aria-hidden />
              Resigned {view.resignationDate}
            </span>
          )}
          {!view.code && !view.title && !view.resignationDate && <span>Active employee.</span>}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {editing ? (
          <span className="chip accent">
            <span className="dot" aria-hidden />
            Editing
          </span>
        ) : (
          <>
            {/* One person, one login — so this is offered only while they
                have none, and only to whoever may mint one. */}
            {inviteHref ? (
              <Link
                href={inviteHref}
                className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors"
              >
                Invite
              </Link>
            ) : null}
            {editor ? (
              <button
                ref={editButton}
                type="button"
                onClick={enter}
                className="bg-accent hover:bg-accent-hover text-ink text-sm px-4 py-2 rounded-control transition-colors"
              >
                Edit
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  )

  const sections = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-2 max-w-5xl">
      <Section title="Assignment">
        <Row
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
        <Row label="Department" value={view.department} />
        <Row label="Account" value={view.account?.email ?? null} mono={!!view.account} />
        <Row label="Role" value={view.account?.role ?? null} />
      </Section>

      <Section title="Identity">
        <Row
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
        <Row
          label="Employee Code"
          field="employee_code"
          value={view.code}
          mono
          // Numbered by the database (HV + max + 1, 2026-09-12); a code is
          // never cleared, only corrected by typing another.
          edit={e => <TextField name="employee_code" defaultValue={e.staff.employee_code} mono />}
        />
        <Row
          label="InfoTech No"
          field="infotech_code"
          value={view.infotechCode}
          mono
          edit={e => <TextField name="infotech_code" defaultValue={e.staff.infotech_code} mono />}
        />
        <Row
          label="Employment Type"
          field="employment_mode"
          value={PAY_MODE_LABEL[view.payMode]}
          edit={e => (
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
                  {PAY_MODE_LABEL[m]}
                </option>
              ))}
            </Select>
          )}
        />
        <Row label="Hire Date" field="hire_date" value={view.hireDate} edit={e => <TextField name="hire_date" type="date" defaultValue={e.staff.hire_date} />} />
        <Row
          label="Resignation Date"
          field="resignation_date"
          value={view.resignationDate}
          edit={e => <TextField name="resignation_date" type="date" defaultValue={e.staff.resignation_date} />}
        />
      </Section>

      <Section title="Contact">
        <Row
          label="Phone"
          field="contact_number"
          value={view.contact.phone}
          mono
          edit={e => <TextField name="contact_number" type="tel" defaultValue={e.staff.contact_number} mono />}
        />
        <Row
          label="Email"
          field="email"
          value={view.contact.email}
          edit={e => <TextField name="email" type="email" defaultValue={e.staff.email} />}
        />
        <Row
          label="Address"
          field="address"
          value={view.contact.address}
          multiline
          edit={e => <AreaField name="address" defaultValue={e.staff.address} />}
        />
      </Section>

      <Section title="Emergency Contact">
        <Row
          label="Name"
          field="emergency_contact_name"
          value={view.emergency.name}
          edit={e => <TextField name="emergency_contact_name" defaultValue={e.staff.emergency_contact_name} />}
        />
        <Row
          label="Relationship"
          field="emergency_contact_relationship"
          value={view.emergency.relationship}
          edit={e => (
            <TextField name="emergency_contact_relationship" defaultValue={e.staff.emergency_contact_relationship} />
          )}
        />
        <Row
          label="Phone"
          field="emergency_contact_phone"
          value={view.emergency.phone}
          mono
          edit={e => <TextField name="emergency_contact_phone" type="tel" defaultValue={e.staff.emergency_contact_phone} mono />}
        />
      </Section>

      <Section title="Bank Accounts">
        <Row
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
        <Row
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
        <Row
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
        <Row
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
      </Section>

      {/* Paid 100% on commission: no basic, no allowances, statutory at 0 —
          so salary says so and statutory is neither shown nor asked. A save
          then leaves the categories as they were (payPatchForUpdate). */}
      {shownMode === 'full_commission' ? (
        <Section title="Salary">
          <Row label="Pay basis" value="Fully commission based" />
          <Row label="Basic" value="None — 100% of pay is commission" />
        </Section>
      ) : (
        <>
          <Section title="Salary">
            {asksPay(shownMode) ? (
              <>
                <Row
                  label="Basic"
                  field="basic_salary"
                  value={view.pay.basic}
                  mono
                  edit={e => <TextField name="basic_salary" type="number" step="0.01" min="0" required defaultValue={e.staff.basic_salary} mono />}
                />
                <Row
                  label="Statutory Allowance"
                  field="allowances"
                  value={view.pay.allowances}
                  mono
                  edit={e => <TextField name="allowances" type="number" step="0.01" min="0" defaultValue={e.staff.allowances} mono />}
                />
                <Row
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
                <Row label="Pay basis" value="Variable pay — keyed monthly" />
                <Row label="Basic" value="None — worked out each month by the Director Salary engine" />
              </>
            )}
          </Section>

          {asksStatutory(shownMode) ? (
            <Section title="Statutory">
              <Row
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
              <Row
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
              <Row
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
              <Row
                label="Children"
                field="children_count"
                value={view.statutory.children}
                mono
                edit={e => <TextField name="children_count" type="number" min="0" step="1" defaultValue={e.staff.children_count ?? 0} mono />}
              />
            </Section>
          ) : null}
        </>
      )}
    </div>
  )

  if (!ed) {
    return (
      <Editing.Provider value={null}>
        {head}
        {sections}
      </Editing.Provider>
    )
  }

  return (
    <Editing.Provider value={ed}>
      <Changed.Provider value={changed}>
        <form ref={form} onSubmit={save} onChange={edited} aria-label={`Edit ${view.name}`}>
          {head}
          {sections}
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
    </Editing.Provider>
  )
}

/** A section is the sheet's section head — its title over the rule — and its rows. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const editing = useContext(Editing) !== null
  return (
    <section className="mb-8">
      <div className="sect-head">
        <h2>{title}</h2>
        <span className="rule" aria-hidden />
      </div>
      <dl className={editing ? 'space-y-2' : 'space-y-3'}>{children}</dl>
    </section>
  )
}

/** A row while editing: label | field from 640px up, the label over its field below. */
const EDIT_ROW = 'grid grid-cols-1 gap-1.5 sm:grid-cols-[140px_1fr] sm:gap-4 sm:items-center'

/**
 * One fact: its label, and its value — or, while editing, the field `edit`
 * draws in the value's place. A row with no `edit` reads the same in both.
 */
function Row({
  label,
  field,
  value,
  mono,
  multiline,
  edit,
}: {
  label: string
  /** The field's name, which its label points at. */
  field?: string
  value: string | null | undefined
  mono?: boolean
  multiline?: boolean
  edit?: (editor: PersonEditor) => ReactNode
}) {
  const editor = useContext(Editing)
  if (editor && edit) {
    return (
      // On a phone the label stands over its field, so the field has the width.
      <div className={EDIT_ROW}>
        <dt>
          <label htmlFor={field ? fieldId(field) : undefined} className="text-[10px] font-medium uppercase tracking-[0.06em]">
            {label}
          </label>
        </dt>
        <dd className="min-w-0">{edit(editor)}</dd>
      </div>
    )
  }
  const isEmpty = value == null || value === ''
  return (
    <div className={editor ? `${EDIT_ROW} sm:min-h-[32px]` : 'grid grid-cols-[140px_1fr] gap-4 items-baseline'}>
      <dt className="text-[10px] font-medium uppercase tracking-[0.06em]">{label}</dt>
      <dd className={[mono && !isEmpty ? 'font-mono tabular text-[12.5px]' : 'text-sm', multiline ? 'whitespace-pre-line' : ''].join(' ')}>
        {isEmpty ? '—' : value}
      </dd>
    </div>
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
      className={mono ? `${s.input} ${s.mono}` : s.input}
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
      className={s.name}
    />
  )
}

/**
 * A value this editor may not change (DESIGN.md › A hidden value): shown as
 * the reader gave it — •••• when on file — with no field behind it, so the
 * save leaves it as it was. Why, on hover.
 */
function Locked({ value, why }: { value: string | null; why: string }) {
  return (
    <span className={s.locked} title={why}>
      {value ? value : '—'}
    </span>
  )
}
