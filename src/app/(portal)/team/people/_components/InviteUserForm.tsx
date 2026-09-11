'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inviteUser } from '../invite-actions'

export interface InviteDepartment {
  id: string
  name: string
}

export interface InviteTitle {
  id: string
  name: string
  department_id: string | null
}

export interface InvitePerson {
  id: string
  name: string
  code: string | null
  departmentId: string
  hasAccount: boolean
}

export interface InvitePrefill {
  staffId: string
  name: string
  email: string
  phone: string
  departmentId: string
  titleId: string
  alreadyHasAccount: boolean
}

/**
 * The invite form.
 *
 * Department is chosen before Title on purpose: a title belongs to a
 * department, so the list narrows to that department's titles and a
 * Marketing hire cannot be filed as an Accounts Executive by mistake.
 *
 * Role is here because `users.role` is still what every gate in the portal
 * reads. When the permission matrix lands the title will decide it and this
 * field goes away.
 */
export default function InviteUserForm({
  prefill,
  departments,
  titles,
  people,
}: {
  prefill: InvitePrefill | null
  departments: InviteDepartment[]
  titles: InviteTitle[]
  people: InvitePerson[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [departmentId, setDepartmentId] = useState(prefill?.departmentId ?? '')

  const titlesForDept = useMemo(
    () => titles.filter(t => !t.department_id || t.department_id === departmentId),
    [titles, departmentId],
  )

  // Anybody can be a manager, including people without an account.
  const managers = useMemo(
    () =>
      people
        .filter(p => p.id !== prefill?.staffId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [people, prefill],
  )

  if (prefill?.alreadyHasAccount) {
    return (
      <div className="border border-hairline rounded-card bg-surface p-6 max-w-2xl">
        <p className="font-serif text-lg text-ink">{prefill.name} already has an account.</p>
        <p className="font-serif italic text-muted text-sm mt-2">
          One person, one login. Nothing to do here.
        </p>
      </div>
    )
  }

  return (
    <form
      action={(fd: FormData) => {
        setError(null)
        startTransition(async () => {
          try {
            await inviteUser(fd)
            router.push('/team/people')
            router.refresh()
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not create the account')
          }
        })
      }}
      className="max-w-2xl"
    >
      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-5 text-sm font-sans">
          {error}
        </div>
      ) : null}

      {prefill ? <input type="hidden" name="staff_id" value={prefill.staffId} /> : null}

      <section className="border border-hairline rounded-card bg-surface p-5 mb-5">
        <h2 className="font-serif italic text-ink text-md mb-4 pb-2 border-b border-hairline">
          The person
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Name" name="name" defaultValue={prefill?.name} required readOnly={!!prefill} />
          <Field label="Phone" name="phone" type="tel" defaultValue={prefill?.phone} />

          <label className="block">
            <span className="block font-sans text-xs uppercase tracking-wide text-graphite mb-1">
              Department
            </span>
            <select
              name="department_id"
              required
              value={departmentId}
              onChange={e => setDepartmentId(e.target.value)}
              className={SELECT}
            >
              <option value="">— Pick one</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block font-sans text-xs uppercase tracking-wide text-graphite mb-1">
              Title
            </span>
            <select name="title_id" defaultValue={prefill?.titleId ?? ''} className={SELECT}>
              <option value="">— No title</option>
              {titlesForDept.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {departmentId === '' ? (
              <span className="block font-serif italic text-muted text-xs mt-1">
                Pick a department first — titles belong to one.
              </span>
            ) : null}
          </label>

          <label className="block sm:col-span-2">
            <span className="block font-sans text-xs uppercase tracking-wide text-graphite mb-1">
              Reports to
            </span>
            <select name="reports_to" defaultValue="" className={SELECT}>
              <option value="">— Nobody</option>
              {managers.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.code ? ` · ${m.code}` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="border border-hairline rounded-card bg-surface p-5 mb-5">
        <h2 className="font-serif italic text-ink text-md mb-4 pb-2 border-b border-hairline">
          The login
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Email"
            name="email"
            type="email"
            defaultValue={prefill?.email}
            required
            autoComplete="off"
          />
          <Field
            label="Password"
            name="password"
            type="text"
            required
            minLength={6}
            autoComplete="new-password"
            hint="At least 6 characters. Shown in the clear so you can pass it on."
          />

          <label className="block sm:col-span-2">
            <span className="block font-sans text-xs uppercase tracking-wide text-graphite mb-1">
              Role
            </span>
            <select name="role" defaultValue="" required className={SELECT}>
              <option value="">— Pick one</option>
              <option value="principal">Principal — everything, including approvals</option>
              <option value="finance">Finance — treasury, billing, reports</option>
              <option value="hr">HR — staff costs, payroll, director salary</option>
              <option value="dept_manager">Dept Manager — their own department only</option>
              <option value="revenue_member">Revenue Member — own account, quotes and requests</option>
            </select>
            <span className="block font-serif italic text-muted text-xs mt-1">
              What the portal lets them touch today. The permission matrix on
              Permissions will take this over.
            </span>
          </label>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2.5 rounded-control transition-colors disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create account'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/team/people')}
          disabled={pending}
          className="text-sm text-graphite hover:text-ink font-sans transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

const INPUT =
  'w-full px-3 py-2 bg-paper border border-hairline rounded-control text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border'
const SELECT = 'w-full px-3 py-2 bg-paper border border-hairline rounded-control text-sm text-ink'

function Field({
  label,
  name,
  type = 'text',
  defaultValue,
  required,
  readOnly,
  minLength,
  autoComplete,
  hint,
}: {
  label: string
  name: string
  type?: string
  defaultValue?: string
  required?: boolean
  readOnly?: boolean
  minLength?: number
  autoComplete?: string
  hint?: string
}) {
  return (
    <label className="block">
      <span className="block font-sans text-xs uppercase tracking-wide text-graphite mb-1">
        {label}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        readOnly={readOnly}
        minLength={minLength}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        className={`${INPUT} ${readOnly ? 'text-graphite' : ''}`}
      />
      {hint ? (
        <span className="block font-serif italic text-muted text-xs mt-1">{hint}</span>
      ) : null}
    </label>
  )
}
