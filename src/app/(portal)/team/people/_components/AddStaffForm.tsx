'use client'

import { useMemo, useState, useTransition, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { addStaff } from '../actions'
import {
  baseUnavailableReason,
  managersForDepartment,
  offersVariablePay,
  subDepartmentsForDepartment,
  titlesForDepartment,
  type ManagerOption,
  type SubDepartmentOption,
  type TitleOption,
} from '@/lib/staff-form'
import { BANK_NAMES } from '@/lib/banks'
import { Select } from '@/components/hrv/select'

export interface AddStaffDepartment {
  id: string
  name: string
  /** 'commission' is a department the commission engine pays (Revenue). */
  payroll_source: string
  /** 'director' is the department the Director Salary engine pays. */
  segment_key: string | null
}

interface Props {
  departments: AddStaffDepartment[]
  titles: TitleOption[]
  /** Every live sub-department, with the titles its ladder carries. */
  subDepartments: SubDepartmentOption[]
  /** The active roster, as candidates for the reporting line. */
  managers: ManagerOption[]
  /**
   * The employee code the person will get — `next_staff_code()`, HV + the
   * largest number on the roster + 1. The database hands it out when the row
   * is saved, so the form only shows it; null when the preview could not be
   * read, in which case the field says as much.
   */
  nextCode: string | null
  /** The adder's title ticks Bank accounts (2026-10-09, PR4). Without it the
   *  accounts are not asked here — somebody who has it adds them later.
   *  Absent: asked, as before. */
  canSeeBank?: boolean
}

const ZERO = '0.00'

// The sheet's form panel (DESIGN.md › "Sheet theme"): white fields on a tinted
// card, black lettering throughout — hierarchy from size and weight. A
// disabled field fades on the sheet by itself, so the locked pay fields and
// the code preview need no colour of their own.
const textInput =
  'w-full px-3 py-2 bg-surface border border-hairline rounded-control text-sm focus:outline-none focus:border-accent-border'
const monoInput =
  'w-full px-3 py-2 bg-surface border border-hairline rounded-control text-sm font-mono focus:outline-none focus:border-accent-border'
const readOnlyMono =
  'w-full px-3 py-2 bg-surface-2 border border-hairline rounded-control text-sm font-mono'
const moneyInput =
  'w-full pl-10 pr-3 py-2 bg-surface border border-hairline rounded-control text-sm font-mono tabular font-medium focus:outline-none focus:border-accent-border disabled:bg-surface-2 disabled:cursor-not-allowed'
const labelBase = 'block text-sm font-medium mb-1.5'
const hintBase = 'text-xs ml-1 font-normal'
const helpText = 'text-xs mt-1'
const rmPrefix =
  'absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono pointer-events-none'
/** A tick that changes what the form asks: peach and edged in orange while on. */
const tickTile = (on: boolean) =>
  `flex items-start gap-3 border rounded-card p-3 mb-4 cursor-pointer transition-colors ${
    on ? 'bg-accent-bg border-accent' : 'bg-surface border-hairline'
  }`

/**
 * Add Staff.
 *
 * Department comes first because two things hang off it. The titles on offer
 * — a title belongs to a department (`titlesForDepartment`), so a Marketing
 * hire cannot be filed as an Accounts Executive. And whether pay is asked at
 * all: a commission department's staff (the Revenue Department) carry no
 * basic and no statutory allowance, 100% of their pay is commission derived
 * from the sales import. Picking one ticks "Full commission" and locks the
 * three pay fields at 0.00; the tick can be cleared for the odd Revenue hire
 * who does draw a basic. The Director department (2026-09-11) offers
 * "Variable pay" the same way: a director's figure is worked out every month
 * by the Director Salary engine and keyed in for that month, so there is no
 * basic to file — the record is saved as `employment_type = 'variable'`.
 *
 * The employee code is not asked for (2026-09-12): the database numbers the
 * roster from the top of the ladder and gives a new person the largest HV
 * number plus one. The form shows which that will be and nothing more — a
 * disabled input is not submitted, which is the point.
 */
export default function AddStaffForm({ departments, titles, subDepartments, managers, nextCode, canSeeBank = true }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const [departmentId, setDepartmentId] = useState('')
  const [titleId, setTitleId] = useState('')
  const [homeSubDepartmentId, setHomeSubDepartmentId] = useState('')
  const [reportsTo, setReportsTo] = useState('')
  const [fullCommission, setFullCommission] = useState(false)
  const [variablePay, setVariablePay] = useState(false)
  const [pay, setPay] = useState({ basic: '', allowances: ZERO, nonStat: ZERO })

  const department = departments.find(d => d.id === departmentId) ?? null
  const isCommissionDept = department?.payroll_source === 'commission'
  const isDirectorDept = offersVariablePay(department)
  // Whichever tick is on, the three pay fields are locked at 0.00.
  const payLocked = fullCommission || variablePay
  const titleChoices = useMemo(
    () => titlesForDepartment(titles, departmentId),
    [titles, departmentId],
  )
  const subChoices = useMemo(
    () => subDepartmentsForDepartment(subDepartments, departmentId),
    [subDepartments, departmentId],
  )
  const managerChoices = useMemo(
    () => managersForDepartment(managers, departmentId, isCommissionDept),
    [managers, departmentId, isCommissionDept],
  )

  useEffect(() => {
    if (error && formRef.current) {
      formRef.current.classList.remove('shake-once')
      void formRef.current.offsetWidth
      formRef.current.classList.add('shake-once')
      const el = formRef.current
      const handler = () => el.classList.remove('shake-once')
      el.addEventListener('animationend', handler, { once: true })
      return () => el.removeEventListener('animationend', handler)
    }
  }, [error])

  // On, every pay field reads 0.00 so the locked fields say what will be
  // saved. Off again, a basic the tick had zeroed goes blank so `required`
  // asks for a real figure instead of accepting the 0.00 it left behind.
  function setPayLocked(on: boolean) {
    setPay(prev =>
      on
        ? { basic: ZERO, allowances: ZERO, nonStat: ZERO }
        : prev.basic === ZERO
          ? { ...prev, basic: '' }
          : prev,
    )
  }

  function setFullCommissionTo(on: boolean) {
    setFullCommission(on)
    setPayLocked(on)
  }

  function setVariablePayTo(on: boolean) {
    setVariablePay(on)
    setPayLocked(on)
  }

  /**
   * The base and the title ratchet against each other: the base carries the
   * company title, so a title with no rung on that ladder cannot be based
   * there. Changing either drops a pairing that has stopped being possible
   * rather than sending it to the database to be refused.
   */
  function pickTitle(id: string) {
    setTitleId(id)
    const chosen = subChoices.find(sub => sub.id === homeSubDepartmentId)
    if (chosen && baseUnavailableReason(chosen, id || null)) setHomeSubDepartmentId('')
  }

  function pickDepartment(id: string) {
    const dept = departments.find(d => d.id === id) ?? null
    setDepartmentId(id)
    setTitleId('')
    // The department's own default, so a hire nobody thinks about lands where
    // they would have landed before any of this existed.
    setHomeSubDepartmentId(subDepartmentsForDepartment(subDepartments, id).find(sub => sub.isHome)?.id ?? '')
    setReportsTo('')
    // Each department decides which tick it offers, on by default; switching
    // resets both so a tick from the old department never rides along hidden.
    const commission = dept?.payroll_source === 'commission'
    const variable = offersVariablePay(dept)
    setFullCommission(commission)
    setVariablePay(variable)
    setPayLocked(commission || variable)
  }

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        await addStaff(formData)
        router.push('/team/people')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  const payHint = (normal: string) =>
    fullCommission ? 'none on full commission' : variablePay ? 'keyed monthly on payroll' : normal

  return (
    <form
      ref={formRef}
      id="add-staff-form"
      action={handleSubmit}
      className="bg-surface-2 border border-hairline rounded-card p-6 max-w-2xl"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="staff-name" className={labelBase}>
            Name
          </label>
          <input id="staff-name" name="name" required className={textInput} />
        </div>
        <div>
          <label htmlFor="staff-department" className={labelBase}>
            Department
          </label>
          <Select bare
            id="staff-department"
            name="department_id"
            required
            value={departmentId}
            onChange={e => pickDepartment(e.target.value)}
            className={textInput}
          >
            <option value="">Select...</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="staff-sub-department" className={labelBase}>
            Sub-department <span className={hintBase}>(where they are based)</span>
          </label>
          <Select bare
            id="staff-sub-department"
            name="home_sub_department_id"
            value={homeSubDepartmentId}
            disabled={subChoices.length === 0}
            onChange={e => setHomeSubDepartmentId(e.target.value)}
            aria-describedby="staff-sub-department-hint"
            className={textInput}
          >
            <option value="">{subChoices.length === 0 ? '— none' : '— department default'}</option>
            {subChoices.map(sub => {
              const reason = baseUnavailableReason(sub, titleId || null)
              return (
                <option key={sub.id} value={sub.id} disabled={!!reason}>
                  {sub.name}
                  {sub.isHome ? ' · default' : ''}
                  {reason ? ` — ${reason}` : ''}
                </option>
              )
            })}
          </Select>
          <p id="staff-sub-department-hint" className={helpText}>
            {departmentId === ''
              ? 'Pick a department first.'
              : subChoices.length === 0
                ? `${department?.name} is not divided into sub-departments.`
                : 'The chart that draws them from the roster, and the ladder their title is read against.'}
          </p>
        </div>
        <div>
          <label htmlFor="staff-upline" className={labelBase}>
            Reporting upline <span className={hintBase}>(optional)</span>
          </label>
          <Select bare
            id="staff-upline"
            name="reports_to"
            value={reportsTo}
            onChange={e => setReportsTo(e.target.value)}
            aria-describedby="staff-upline-hint"
            className={textInput}
          >
            <option value="">— None</option>
            {managerChoices.map(person => (
              <option key={person.id} value={person.id}>
                {person.name}
                {person.code ? ` · ${person.code}` : ''}
                {person.departmentId !== departmentId && person.departmentName
                  ? ` — ${person.departmentName}`
                  : ''}
              </option>
            ))}
          </Select>
          <p id="staff-upline-hint" className={helpText}>
            {departmentId === ''
              ? 'Pick a department first.'
              : isCommissionDept
                ? 'Inside a commission department this line is also the commission upline, so it stays inside the department.'
                : 'Leave it blank to draw the line later on the hierarchy chart.'}
          </p>
        </div>
        <div>
          <label htmlFor="staff-title" className={labelBase}>
            Designation{' '}
            <span className={hintBase}>(optional · a title from Role &amp; Permission)</span>
          </label>
          <Select bare
            id="staff-title"
            name="title_id"
            value={titleId}
            onChange={e => pickTitle(e.target.value)}
            className={textInput}
          >
            <option value="">— None</option>
            {titleChoices.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          {departmentId === '' ? (
            <p className={helpText}>
              Pick a department first — titles belong to one.
            </p>
          ) : titleChoices.length === 0 ? (
            <p className={helpText}>
              No titles for {department?.name} yet —{' '}
              <Link href="/team/hierarchy?tab=roles" className="underline underline-offset-2 hover:no-underline">
                add one under Role &amp; Permission
              </Link>
              .
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="staff-code" className={labelBase}>
            Employee code <span className={hintBase}>assigned on save</span>
          </label>
          <input
            id="staff-code"
            value={nextCode ?? 'HV…'}
            readOnly
            disabled
            aria-describedby="staff-code-hint"
            className={readOnlyMono}
          />
          <p id="staff-code-hint" className={helpText}>
            {nextCode
              ? 'The next number after the highest on the roster.'
              : 'HV + the next number after the highest on the roster.'}
          </p>
        </div>
      </div>

      <div className="border-t border-hairline my-6" />

      {isCommissionDept && department ? (
        <label htmlFor="staff-full-commission" className={tickTile(fullCommission)}>
          <input
            id="staff-full-commission"
            type="checkbox"
            name="full_commission"
            checked={fullCommission}
            onChange={e => setFullCommissionTo(e.target.checked)}
            className="w-4 h-4 accent-accent mt-0.5 shrink-0"
          />
          <span>
            <span className="block text-sm font-medium">
              Fully commission based
            </span>
            <span className="block text-xs mt-0.5">
              {department.name} staff carry no basic salary and no statutory allowance — 100% of
              pay is commission from the sales import. EPF / SOCSO / EIS come out at 0 on their
              own; Withholding Tax is ticked per person on the sub-department&apos;s Staff
              Hierarchy page.
            </span>
          </span>
        </label>
      ) : null}

      {isDirectorDept && department ? (
        <label htmlFor="staff-variable-pay" className={tickTile(variablePay)}>
          <input
            id="staff-variable-pay"
            type="checkbox"
            name="variable_pay"
            checked={variablePay}
            onChange={e => setVariablePayTo(e.target.checked)}
            className="w-4 h-4 accent-accent mt-0.5 shrink-0"
          />
          <span>
            <span className="block text-sm font-medium">Variable pay</span>
            <span className="block text-xs mt-0.5">
              Calculated by variable — a {department.name} salary is worked out every month by
              the Director Salary engine and keyed in for that month, so there is no basic
              salary or allowance to file here. EPF / SOCSO / EIS follow whatever is keyed.
              Untick for a director who draws a fixed basic.
            </span>
          </span>
        </label>
      ) : null}

      <div className="grid grid-cols-1 gap-4 mb-4">
        <div>
          <label htmlFor="staff-basic" className={labelBase}>
            Basic Salary <span className={hintBase}>{payHint('attracts EPF / SOCSO / EIS')}</span>
          </label>
          <div className="relative">
            <span className={rmPrefix}>RM</span>
            <input
              id="staff-basic"
              name="basic_salary"
              type="number"
              step="0.01"
              min="0"
              required={!payLocked}
              disabled={payLocked}
              value={pay.basic}
              onChange={e => setPay(p => ({ ...p, basic: e.target.value }))}
              placeholder="0.00"
              className={moneyInput}
            />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="staff-allowances" className={labelBase}>
            Statutory Allow. <span className={hintBase}>{payHint('attracts EPF')}</span>
          </label>
          <div className="relative">
            <span className={rmPrefix}>RM</span>
            <input
              id="staff-allowances"
              name="allowances"
              type="number"
              step="0.01"
              min="0"
              disabled={payLocked}
              value={pay.allowances}
              onChange={e => setPay(p => ({ ...p, allowances: e.target.value }))}
              className={moneyInput}
            />
          </div>
        </div>
        <div>
          <label htmlFor="staff-non-stat" className={labelBase}>
            Non-Stat. Allow. <span className={hintBase}>{payHint('no EPF')}</span>
          </label>
          <div className="relative">
            <span className={rmPrefix}>RM</span>
            <input
              id="staff-non-stat"
              name="non_statutory_allowance"
              type="number"
              step="0.01"
              min="0"
              disabled={payLocked}
              value={pay.nonStat}
              onChange={e => setPay(p => ({ ...p, nonStat: e.target.value }))}
              className={moneyInput}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-hairline my-6" />

      {canSeeBank ? (<>
      <h3 className="sheet-heading mb-1">
        Account 1{' '}
        <span className={hintBase}>default receiving bank account</span>
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
        <div>
          <label htmlFor="staff-bank" className={labelBase}>
            Account 1 bank
          </label>
          <input
            id="staff-bank"
            name="bank_name"
            list="staff-bank-names"
            autoComplete="off"
            placeholder="Maybank"
            className={textInput}
          />
          <datalist id="staff-bank-names">
            {BANK_NAMES.map(b => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="staff-bank-account" className={labelBase}>
            Account 1 number <span className={hintBase}>digits only</span>
          </label>
          <input
            id="staff-bank-account"
            name="bank_account_no"
            inputMode="numeric"
            autoComplete="off"
            placeholder="1234567890"
            className={monoInput}
          />
        </div>
      </div>

      <div className="border-t border-hairline my-6" />

      <h3 className="sheet-heading">Account 2 <span className={hintBase}>optional</span></h3>
      <p className="sheet-subtitle">Enter both the bank and account number, or leave both blank.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
        <div>
          <label htmlFor="staff-bank-2" className={labelBase}>Account 2 bank</label>
          <input id="staff-bank-2" name="bank_name_2" list="staff-bank-names" autoComplete="off" placeholder="Maybank" className={textInput} />
        </div>
        <div>
          <label htmlFor="staff-bank-account-2" className={labelBase}>Account 2 number <span className={hintBase}>digits only</span></label>
          <input id="staff-bank-account-2" name="bank_account_no_2" inputMode="numeric" autoComplete="off" placeholder="1234567890" className={monoInput} />
        </div>
      </div>

      <div className="border-t border-hairline my-6" />
      </>) : null}

      <h3 className="sheet-heading mb-1">
        Contact <span className={hintBase}>optional, editable later</span>
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
        <div>
          <label htmlFor="staff-phone" className={labelBase}>
            Phone
          </label>
          <input
            id="staff-phone"
            name="contact_number"
            type="tel"
            placeholder="012-345 6789"
            className={monoInput}
          />
        </div>
        <div>
          <label htmlFor="staff-email" className={labelBase}>
            Email
          </label>
          <input
            id="staff-email"
            name="email"
            type="email"
            placeholder="name@example.com"
            className={textInput}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="staff-address" className={labelBase}>
            Address
          </label>
          <textarea
            id="staff-address"
            name="address"
            rows={2}
            placeholder="Street, city, postcode"
            className={`${textInput} resize-y`}
          />
        </div>
      </div>

      <div className="border-t border-hairline my-6" />

      <h3 className="sheet-heading mb-1">
        Emergency Contact <span className={hintBase}>optional</span>
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
        <div>
          <label htmlFor="staff-ec-name" className={labelBase}>
            Name
          </label>
          <input
            id="staff-ec-name"
            name="emergency_contact_name"
            placeholder="Full name"
            className={textInput}
          />
        </div>
        <div>
          <label htmlFor="staff-ec-rel" className={labelBase}>
            Relationship
          </label>
          <input
            id="staff-ec-rel"
            name="emergency_contact_relationship"
            placeholder="Spouse, Parent…"
            className={textInput}
          />
        </div>
        <div>
          <label htmlFor="staff-ec-phone" className={labelBase}>
            Phone
          </label>
          <input
            id="staff-ec-phone"
            name="emergency_contact_phone"
            type="tel"
            placeholder="012-345 6789"
            className={monoInput}
          />
        </div>
      </div>

      {/* A refusal is the sheet's red callout, on a line of its own under the
          button so a long database message has the width to be read. */}
      <div className="flex flex-wrap items-center gap-3 mt-6">
        <button
          type="submit"
          disabled={isPending}
          className="bg-accent hover:bg-accent-hover text-ink text-sm font-medium px-4 py-2 rounded-control transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Adding...' : 'Add Staff'}
        </button>
        {error && <p className="sheet-danger basis-full m-0">{error}</p>}
      </div>
    </form>
  )
}
