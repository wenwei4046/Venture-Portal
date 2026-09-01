'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { addStaff } from '../actions'

interface Props {
  departments: { id: string; name: string }[]
}

export default function AddStaffForm({ departments }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

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
    startTransition(async () => {
      try {
        await addStaff(formData)
        router.push('/team/people')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  const moneyInputBase =
    'w-full pl-10 pr-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border'
  const labelBase = 'block text-sm font-sans font-medium text-graphite mb-1.5'
  const hintBase = 'text-xs text-muted ml-1 font-normal'
  const rmPrefix =
    'absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted pointer-events-none'

  return (
    <form ref={formRef} id="add-staff-form" action={handleSubmit} className="bg-surface border border-hairline rounded-md p-6 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelBase}>Name</label>
          <input
            name="name"
            required
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className={labelBase}>Department</label>
          <select
            name="department_id"
            required
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
          >
            <option value="">Select...</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelBase}>Designation <span className={hintBase}>(optional)</span></label>
          <input
            name="designation"
            placeholder="e.g. Marketing Executive"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
      </div>

      <div className="border-t border-hairline my-6" />

      <div className="grid grid-cols-1 gap-4 mb-4">
        <div>
          <label className={labelBase}>
            Basic Salary <span className={hintBase}>attracts EPF / SOCSO / EIS</span>
          </label>
          <div className="relative">
            <span className={rmPrefix}>RM</span>
            <input
              name="basic_salary"
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="0.00"
              className={moneyInputBase}
            />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelBase}>
            Statutory Allow. <span className={hintBase}>attracts EPF</span>
          </label>
          <div className="relative">
            <span className={rmPrefix}>RM</span>
            <input
              name="allowances"
              type="number"
              step="0.01"
              min="0"
              defaultValue="0.00"
              className={moneyInputBase}
            />
          </div>
        </div>
        <div>
          <label className={labelBase}>
            Non-Stat. Allow. <span className={hintBase}>no EPF</span>
          </label>
          <div className="relative">
            <span className={rmPrefix}>RM</span>
            <input
              name="non_statutory_allowance"
              type="number"
              step="0.01"
              min="0"
              defaultValue="0.00"
              className={moneyInputBase}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-hairline my-6" />

      <h3 className="font-serif text-md text-ink mb-1">Contact <span className={hintBase}>optional, editable later</span></h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
        <div>
          <label className={labelBase}>Phone</label>
          <input
            name="contact_number"
            type="tel"
            placeholder="012-345 6789"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className={labelBase}>Email</label>
          <input
            name="email"
            type="email"
            placeholder="name@example.com"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelBase}>Address</label>
          <textarea
            name="address"
            rows={2}
            placeholder="Street, city, postcode"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border resize-y"
          />
        </div>
      </div>

      <div className="border-t border-hairline my-6" />

      <h3 className="font-serif text-md text-ink mb-1">Emergency Contact <span className={hintBase}>optional</span></h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
        <div>
          <label className={labelBase}>Name</label>
          <input
            name="emergency_contact_name"
            placeholder="Full name"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className={labelBase}>Relationship</label>
          <input
            name="emergency_contact_relationship"
            placeholder="Spouse, Parent…"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className={labelBase}>Phone</label>
          <input
            name="emergency_contact_phone"
            type="tel"
            placeholder="012-345 6789"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-6">
        <button
          type="submit"
          disabled={isPending}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Adding...' : 'Add Staff'}
        </button>
        {error && <span className="text-sm font-serif italic text-danger">{error}</span>}
      </div>
    </form>
  )
}
