'use client'

import { useMemo, useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { updateStaff } from '../actions'
import { isFullyCommissionBased, titlesForDepartment, type TitleRow } from '@/lib/staff-form'

export interface StaffRow {
  id: string
  employee_name: string
  designation: string | null
  department_id: string
  department_name: string
  /** True in a department the commission engine pays (`payroll_source = 'commission'`). */
  commission_dept: boolean
  /** Authoritative since 2026-09-01; `designation` is the text it mirrors. */
  title_id: string | null
  basic_salary: number
  allowances: number
  non_statutory_allowance: number | null
  employee_code: string | null
  hire_date: string | null
  resignation_date: string | null
  epf_category: string
  socso_category: string
  is_epf_exempt: boolean
  pcb_category: string
  children_count: number
  employment_type: string
  bank_name: string | null
  bank_account_no: string | null
  nric: string | null
  contact_number: string | null
  email: string | null
  address: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  emergency_contact_relationship: string | null
}

interface Props {
  staff: StaffRow
  /** Every title, active or not — see `titleChoices` for which are offered. */
  titles: TitleRow[]
  /** Rendered inside the person card, which supplies its own panel and
   *  padding — so the form drops the card chrome it wears on its own page. */
  embedded?: boolean
  /** Told after a successful save, so the card can leave edit mode and the
   *  row behind it can be re-read. */
  onSaved?: () => void
  /** Shown beside Save when the form is embedded — leaving edit mode has to
   *  be reachable without scrolling back to the card header. */
  onCancel?: () => void
}

export default function EditStaffForm({ staff, titles, embedded, onSaved, onCancel }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  // The department's active titles, plus the one they already hold if it has
  // since been deactivated — so a plain re-save does not silently drop it.
  const titleChoices = useMemo(
    () =>
      titlesForDepartment(titles, staff.department_id).filter(
        t => t.is_active || t.id === staff.title_id,
      ),
    [titles, staff.department_id, staff.title_id],
  )

  // Fully commission based. In a commission department the tick stands in
  // for the Employment Type select, and while it is on the pay and statutory
  // fields are not asked at all — they would be 0, or decide nothing.
  const [fullCommission, setFullCommission] = useState(isFullyCommissionBased(staff))

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

  function handleSubmit(formData: FormData) {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        await updateStaff(staff.id, formData)
        setSaved(true)
        router.refresh()
        onSaved?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <form ref={formRef} action={handleSubmit} className={embedded ? '' : 'bg-surface border border-hairline rounded-md p-6 max-w-3xl'}>
      {/* Section 1 — Identity */}
      <h3 className="font-serif text-lg text-ink mb-4">Identity</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">Name</label>
          <input
            name="name"
            required
            defaultValue={staff.employee_name}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">Department</label>
          <input
            value={staff.department_name}
            readOnly
            disabled
            className="w-full px-3 py-2 bg-surface-2 border border-hairline rounded-md text-sm font-sans text-muted italic"
          />
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Designation{' '}
            <span className="text-xs text-muted ml-1 font-normal">
              (a title from Role &amp; Permission)
            </span>
          </label>
          <select
            name="title_id"
            defaultValue={staff.title_id ?? ''}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
          >
            <option value="">— None</option>
            {titleChoices.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.is_active ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Employee Code <span className="text-xs text-muted ml-1 font-normal">(optional, unique)</span>
          </label>
          <input
            name="employee_code"
            defaultValue={staff.employee_code ?? ''}
            placeholder="e.g. EMP-001"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            NRIC <span className="text-xs text-muted ml-1 font-normal">(12 digits, for statutory files)</span>
          </label>
          {/* The dash in the pattern has to be escaped: unescaped between `9`
              and `\s` the browser reads it as a range, throws under the `v`
              flag, and silently drops the constraint altogether. */}
          <input
            name="nric"
            defaultValue={staff.nric ?? ''}
            placeholder="850101141234"
            pattern="[0-9\-\s]*"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        {staff.commission_dept ? null : (
          <div>
            <label className="block text-sm font-sans font-medium text-graphite mb-1.5">Employment Type</label>
            <select
              name="employment_type"
              defaultValue={staff.employment_type}
              className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
            >
              <option value="salaried">Salaried (fixed basic)</option>
              <option value="commission_eligible">Commission-eligible (basic + commission rules)</option>
            </select>
          </div>
        )}
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Hire Date <span className="text-xs text-muted ml-1 font-normal">(nullable)</span>
          </label>
          <input
            name="hire_date"
            type="date"
            defaultValue={staff.hire_date ?? ''}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Resignation Date <span className="text-xs text-muted ml-1 font-normal">(leave blank if active)</span>
          </label>
          <input
            name="resignation_date"
            type="date"
            defaultValue={staff.resignation_date ?? ''}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
      </div>

      {/* Section 2 — Salary. In a commission department the tick below is
          the whole answer: while it is on, the pay and statutory fields are
          not on the form, and the save leaves the categories as they were. */}
      <h3 className="font-serif text-lg text-ink mb-4">Salary</h3>
      {staff.commission_dept ? (
        <label
          htmlFor="edit-full-commission"
          className="flex items-start gap-3 bg-surface-2 border border-hairline rounded-md p-3 mb-6 cursor-pointer"
        >
          <input
            id="edit-full-commission"
            type="checkbox"
            name="full_commission"
            checked={fullCommission}
            onChange={e => setFullCommission(e.target.checked)}
            className="w-4 h-4 accent-accent mt-0.5 shrink-0"
          />
          <span>
            <span className="block text-sm font-sans font-medium text-ink">
              Fully commission based
            </span>
            <span className="block font-serif italic text-graphite text-xs mt-0.5">
              No basic salary and no allowances — 100% of pay is commission from the sales
              import, so EPF / SOCSO / EIS come out at 0. Untick to give them a basic and set
              their statutory categories. Withholding Tax is ticked per person on the
              sub-department&apos;s Staff Hierarchy page.
            </span>
          </span>
        </label>
      ) : null}
      {fullCommission ? (
        <p className="font-serif italic text-muted text-sm mb-6">
          Saved as fully commission based — basic, statutory allowance and non-statutory
          allowance all 0.00.
        </p>
      ) : (
        <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Basic <span className="text-xs text-muted ml-1 font-normal">(RM)</span>
          </label>
          <input
            name="basic_salary"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={staff.basic_salary}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Statutory Allow. <span className="text-xs text-muted ml-1 font-normal">(RM, EPF)</span>
          </label>
          <input
            name="allowances"
            type="number"
            step="0.01"
            min="0"
            defaultValue={staff.allowances}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Non-Stat. Allow. <span className="text-xs text-muted ml-1 font-normal">(RM, no EPF)</span>
          </label>
          <input
            name="non_statutory_allowance"
            type="number"
            step="0.01"
            min="0"
            defaultValue={staff.non_statutory_allowance ?? 0}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
      </div>

      {/* Section 3 — Statutory categories */}
      <h3 className="font-serif text-lg text-ink mb-4">Statutory</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">EPF Category</label>
          <select
            name="epf_category"
            defaultValue={staff.epf_category}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
          >
            <option value="A">Part A (MYR citizen, under 60)</option>
            <option value="C">Part C (MYR citizen, 60+)</option>
            <option value="E">Part E (Non-citizen, under 60)</option>
            <option value="F">Part F (Non-citizen, 60+)</option>
          </select>
        </div>
        <div className="flex items-center pt-6">
          <label className="flex items-center gap-2 text-sm font-sans text-ink cursor-pointer">
            <input
              type="checkbox"
              name="is_epf_exempt"
              defaultChecked={staff.is_epf_exempt}
              className="w-4 h-4 accent-accent"
            />
            <span>EPF Exempt</span>
            <span className="text-xs text-muted italic ml-1">(contract, intern, etc.)</span>
          </label>
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">SOCSO Category</label>
          <select
            name="socso_category"
            defaultValue={staff.socso_category}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
          >
            <option value="first">First (under 60, citizen/PR)</option>
            <option value="second">Second (60+ or non-citizen)</option>
          </select>
        </div>
        <div>{/* spacer */}</div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">PCB Category</label>
          <select
            name="pcb_category"
            defaultValue={staff.pcb_category}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
          >
            <option value="KA1">KA1 (Single / unmarried)</option>
            <option value="KA2">KA2 (Married, spouse not working)</option>
            <option value="KA3">KA3 (Married, spouse working)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Children <span className="text-xs text-muted ml-1 font-normal">(for PCB relief)</span>
          </label>
          <input
            name="children_count"
            type="number"
            min="0"
            step="1"
            defaultValue={staff.children_count ?? 0}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
      </div>
        </>
      )}

      {/* Section 4 — Bank account (Spec 5) */}
      <h3 className="font-serif text-lg text-ink mb-4">Bank account</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Bank <span className="text-xs text-muted ml-1 font-normal">(e.g. Maybank, Hong Leong)</span>
          </label>
          <input
            name="bank_name"
            defaultValue={staff.bank_name ?? ''}
            placeholder="Maybank"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Account No <span className="text-xs text-muted ml-1 font-normal">(digits only)</span>
          </label>
          <input
            name="bank_account_no"
            defaultValue={staff.bank_account_no ?? ''}
            placeholder="1234567890"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
      </div>

      {/* Section 5 — Contact */}
      <h3 className="font-serif text-lg text-ink mb-4">Contact</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Phone <span className="text-xs text-muted ml-1 font-normal">(Malaysian format)</span>
          </label>
          <input
            name="contact_number"
            type="tel"
            defaultValue={staff.contact_number ?? ''}
            placeholder="012-345 6789"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">Email</label>
          <input
            name="email"
            type="email"
            defaultValue={staff.email ?? ''}
            placeholder="name@example.com"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">Address</label>
          <textarea
            name="address"
            rows={2}
            defaultValue={staff.address ?? ''}
            placeholder="Street, city, postcode"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border resize-y"
          />
        </div>
      </div>

      {/* Section 6 — Emergency Contact */}
      <h3 className="font-serif text-lg text-ink mb-4">Emergency Contact</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">Name</label>
          <input
            name="emergency_contact_name"
            defaultValue={staff.emergency_contact_name ?? ''}
            placeholder="Full name"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">Relationship</label>
          <input
            name="emergency_contact_relationship"
            defaultValue={staff.emergency_contact_relationship ?? ''}
            placeholder="Spouse, Parent, Sibling…"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">Phone</label>
          <input
            name="emergency_contact_phone"
            type="tel"
            defaultValue={staff.emergency_contact_phone ?? ''}
            placeholder="012-345 6789"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
      </div>

      {/* Embedded, this bar sticks to the bottom of the card's scroll area —
          the form is taller than the window it now opens in, and a Save button
          you have to scroll to find is a Save button people miss.
          `-mb-5 pb-5` pulls it over the scroll area's own bottom padding:
          without that the padding stays transparent and the next field scrolls
          through the gap under the bar, which reads as a bar that is not fixed
          to anything. */}
      <div
        className={`flex items-center gap-3 pt-4 border-t border-hairline ${
          embedded
            ? 'sticky bottom-0 z-10 -mx-5 -mb-5 px-5 pb-5 bg-paper shadow-[0_-10px_16px_-12px_rgba(0,0,0,0.28)]'
            : ''
        }`}
      >
        <button
          type="submit"
          disabled={isPending}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Saving...' : 'Save changes'}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-3 py-2 rounded-md transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        ) : null}
        {saved && <span className="text-sm font-serif italic text-ledger">Saved.</span>}
        {error && <span className="text-sm font-serif italic text-danger">{error}</span>}
      </div>
    </form>
  )
}
