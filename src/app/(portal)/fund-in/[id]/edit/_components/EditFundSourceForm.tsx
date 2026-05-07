'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import Link from 'next/link'
import { updateFundSource } from '../../../actions'

interface Props {
  id: string
  typeLabel: string
  fromLabel: string
  initial: {
    amount: number
    cost_rate_percent: number
    lock_in_months: number
    effective_date: string
    repayment_date: string
    notes: string
  }
}

export default function EditFundSourceForm({ id, typeLabel, fromLabel, initial }: Props) {
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

  async function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        const result = await updateFundSource(formData)
        if (result?.error) setError(result.error)
      } catch (err) {
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) {
          throw err
        }
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <form ref={formRef} action={handleSubmit} className="bg-surface border border-hairline rounded-md p-8 max-w-3xl">
      <input type="hidden" name="id" value={id} />

      {/* ───────── Read-only context (source_type + from are locked) ───────── */}
      <div className="mb-6 p-4 bg-paper border border-hairline rounded-md grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-muted uppercase tracking-wide font-sans mb-1">
            Source type
          </div>
          <div className="font-serif italic text-ink text-sm">{typeLabel}</div>
        </div>
        <div>
          <div className="text-xs text-muted uppercase tracking-wide font-sans mb-1">
            From
          </div>
          <div className="font-serif italic text-ink text-sm">{fromLabel}</div>
        </div>
        <div className="sm:col-span-2 text-xs text-muted italic font-serif">
          Source type and counterparty are locked once submitted. To change them, cancel and create a new fund source.
        </div>
      </div>

      {/* ───────── Amount + Rate (row) ───────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
        <div>
          <label htmlFor="amount" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Amount
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted font-mono">
              RM
            </span>
            <input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              defaultValue={initial.amount.toFixed(2)}
              className="w-full pl-10 pr-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border"
            />
          </div>
          <p className="font-serif italic text-muted text-xs mt-1.5">
            Principal amount in MYR
          </p>
        </div>

        <div>
          <label htmlFor="cost_rate_percent" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Interest rate <span className="text-danger">*</span>
          </label>
          <div className="relative">
            <input
              id="cost_rate_percent"
              name="cost_rate_percent"
              type="number"
              step="0.001"
              min="0"
              max="99.999"
              required
              defaultValue={initial.cost_rate_percent.toFixed(3)}
              className="w-full px-3 py-2 pr-12 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted font-mono">
              % /mo
            </span>
          </div>
          <p className="font-serif italic text-muted text-xs mt-1.5">
            Monthly interest rate. Enter 0 if interest-free.
          </p>
        </div>
      </div>

      {/* ───────── Lock-in + Effective date (row) ───────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
        <div>
          <label htmlFor="lock_in_months" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Repayment period
          </label>
          <div className="relative">
            <input
              id="lock_in_months"
              name="lock_in_months"
              type="number"
              step="1"
              min="1"
              max="120"
              required
              defaultValue={initial.lock_in_months}
              className="w-full px-3 py-2 pr-16 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted font-mono">
              months
            </span>
          </div>
          <p className="font-serif italic text-muted text-xs mt-1.5">
            Total repayment = (Principal + Interest) ÷ months
          </p>
        </div>

        <div>
          <label htmlFor="effective_date" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Effective date
          </label>
          <input
            id="effective_date"
            name="effective_date"
            type="date"
            required
            defaultValue={initial.effective_date}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
          />
          <p className="font-serif italic text-muted text-xs mt-1.5">
            Day HV receives the capital
          </p>
        </div>
      </div>

      {/* ───────── Repayment date ───────── */}
      <div className="mb-6">
        <label htmlFor="repayment_date" className="block text-sm font-sans font-medium text-graphite mb-1.5">
          Expected repayment date <span className="text-danger">*</span>
        </label>
        <input
          id="repayment_date"
          name="repayment_date"
          type="date"
          required
          defaultValue={initial.repayment_date}
          className="w-full max-w-sm px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
        />
        <p className="font-serif italic text-muted text-xs mt-1.5">
          Target date HV repays the full principal. Drives the maturity date shown on the detail view.
        </p>
      </div>

      {/* ───────── Notes ───────── */}
      <div className="mb-6">
        <label htmlFor="notes" className="block text-sm font-sans font-medium text-graphite mb-1.5">
          Notes <span className="text-muted font-normal">(optional)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={initial.notes}
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
          placeholder="Context, reference to email, approval reference, etc."
        />
      </div>

      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-6 text-sm font-sans">
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-4 pt-4 border-t border-hairline">
        <button
          type="submit"
          disabled={isPending}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Saving…' : 'Save changes'}
        </button>
        <Link
          href={`/fund-in/${id}`}
          className="text-sm text-graphite hover:text-ink font-sans transition-colors"
        >
          Cancel
        </Link>
        <span className="text-xs text-muted italic font-serif ml-auto">
          Editable while pending · locks once Principal approves
        </span>
      </div>
    </form>
  )
}
