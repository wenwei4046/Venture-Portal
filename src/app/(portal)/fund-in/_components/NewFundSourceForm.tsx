'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import dayjs from 'dayjs'
import Link from 'next/link'
import { createFundSource } from '../actions'
import type { Company, FundSourceType } from '@/types'

interface Department {
  id: string
  name: string
}

interface Props {
  companies: Company[]
  departments: Department[]
}

const SOURCE_TYPES: { value: FundSourceType; label: string; hint: string }[] = [
  { value: 'subsidiary', label: 'Subsidiary', hint: 'Loan from a subsidiary company' },
  { value: 'director_loan', label: 'Director Loan', hint: 'Personal loan from a director (free text)' },
  { value: 'department_pool', label: 'Dept Pool', hint: 'Idle funds from a department pool' },
  { value: 'outsource', label: 'Outsource', hint: 'External party — bank, vendor, individual investor (free text)' },
]

export default function NewFundSourceForm({ companies, departments }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sourceType, setSourceType] = useState<FundSourceType>('subsidiary')
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

  const today = dayjs().format('YYYY-MM-DD')

  // Determine which "from" input to show based on source type
  const needsCompanySelect = sourceType === 'subsidiary'
  const needsFreetextInput = sourceType === 'director_loan' || sourceType === 'outsource'
  const needsDeptSelect = sourceType === 'department_pool'

  async function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        await createFundSource(formData)
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
      {/* ───────── Type toggle (4 options) ───────── */}
      <div className="mb-6">
        <label className="block text-sm font-sans font-medium text-graphite mb-2">
          Source type
        </label>
        <div className="flex flex-wrap gap-0 border border-hairline rounded-md overflow-hidden w-fit">
          {SOURCE_TYPES.map((t, i) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setSourceType(t.value)}
              className={
                sourceType === t.value
                  ? 'px-4 py-2 bg-accent-bg text-accent font-serif italic text-sm'
                  : `px-4 py-2 text-graphite font-sans text-sm hover:bg-surface-2${i > 0 ? ' border-l border-hairline' : ''}`
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="font-serif italic text-muted text-xs mt-1.5">
          {SOURCE_TYPES.find((t) => t.value === sourceType)?.hint}
        </p>
        <input type="hidden" name="source_type" value={sourceType} />
      </div>

      {/* ───────── From (company, director, or department) ───────── */}
      {needsCompanySelect ? (
        <div className="mb-6">
          <label htmlFor="from_id" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Subsidiary
          </label>
          <select
            id="from_id"
            name="from_id"
            required
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          >
            <option value="">Select a subsidiary…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.short_code})
              </option>
            ))}
          </select>
          <p className="font-serif italic text-muted text-xs mt-1.5">
            The subsidiary lending money to HV
          </p>
        </div>
      ) : needsFreetextInput ? (
        <div className="mb-6">
          <label htmlFor="from_freetext_name" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            {sourceType === 'director_loan' ? 'Director name' : 'Outsource party name'}
          </label>
          <input
            id="from_freetext_name"
            name="from_freetext_name"
            type="text"
            required
            maxLength={120}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
            placeholder={sourceType === 'director_loan' ? 'e.g., Tan Wei Liang' : 'e.g., Maybank, ABC Holdings, John Smith'}
          />
          <p className="font-serif italic text-muted text-xs mt-1.5">
            {sourceType === 'director_loan'
              ? 'Free text — the director extending a personal loan to HV'
              : 'Free text — external party lending to HV (bank, vendor, individual)'}
          </p>
        </div>
      ) : needsDeptSelect ? (
        <div className="mb-6">
          <label htmlFor="from_id" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Department
          </label>
          <select
            id="from_id"
            name="from_id"
            required
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          >
            <option value="">Select a department…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <p className="font-serif italic text-muted text-xs mt-1.5">
            Transfer idle funds from this department pool into Venture Pool
          </p>
        </div>
      ) : null}

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
              className="w-full pl-10 pr-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border"
              placeholder="100000.00"
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
              className="w-full px-3 py-2 pr-12 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border"
              placeholder="2.000"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted font-mono">
              % /mo
            </span>
          </div>
          <p className="font-serif italic text-muted text-xs mt-1.5">
            Monthly interest rate. Enter 0 if interest-free. Fixed rate × original principal × months.
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
              defaultValue="12"
              required
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
            defaultValue={today}
            max={today}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
          />
          <p className="font-serif italic text-muted text-xs mt-1.5">
            Day HV receives the capital
          </p>
        </div>
      </div>

      {/* ───────── Repayment date (Phase 7) ───────── */}
      <div className="mb-6">
        <label htmlFor="repayment_date" className="block text-sm font-sans font-medium text-graphite mb-1.5">
          Expected repayment date <span className="text-danger">*</span>
        </label>
        <input
          id="repayment_date"
          name="repayment_date"
          type="date"
          required
          defaultValue={dayjs().add(12, 'month').format('YYYY-MM-DD')}
          className="w-full max-w-sm px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
        />
        <p className="font-serif italic text-muted text-xs mt-1.5">
          Target date HV repays the full principal. Must be on or after the effective date.
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
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
          placeholder="Context, reference to email, approval reference, etc."
        />
      </div>

      {/* ───────── Error banner ───────── */}
      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-6 text-sm font-sans">
          {error}
        </div>
      ) : null}

      {/* ───────── Actions ───────── */}
      <div className="flex items-center gap-4 pt-4 border-t border-hairline">
        <button
          type="submit"
          disabled={isPending}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Submitting…' : 'Submit for approval'}
        </button>
        <Link
          href="/fund-in"
          className="text-sm text-graphite hover:text-ink font-sans transition-colors"
        >
          Cancel
        </Link>
        <span className="text-xs text-muted italic font-serif ml-auto">
          Rate locks at save · Principal must approve before money moves
        </span>
      </div>
    </form>
  )
}
