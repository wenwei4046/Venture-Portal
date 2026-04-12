'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import dayjs from 'dayjs'
import Link from 'next/link'
import { createFundSource } from '../actions'
import type { Company, Director, FundSourceType } from '@/types'

interface Props {
  companies: Company[]
  directors: Director[]
}

export default function NewFundSourceForm({ companies, directors }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sourceType, setSourceType] = useState<FundSourceType>('subsidiary_savings')
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

  async function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        await createFundSource(formData)
        // createFundSource redirects on success; this line only runs on error
      } catch (err) {
        // Next.js redirect() throws NEXT_REDIRECT which we should NOT catch
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) {
          throw err
        }
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <form ref={formRef} action={handleSubmit} className="bg-surface border border-hairline rounded-md p-8 max-w-3xl">
      {/* ───────── Type toggle ───────── */}
      <div className="mb-6">
        <label className="block text-sm font-sans font-medium text-graphite mb-2">
          Source type
        </label>
        <div className="flex gap-0 border border-hairline rounded-md overflow-hidden w-fit">
          <button
            type="button"
            onClick={() => setSourceType('subsidiary_savings')}
            className={
              sourceType === 'subsidiary_savings'
                ? 'px-4 py-2 bg-accent-bg text-accent font-serif italic text-sm'
                : 'px-4 py-2 text-graphite font-sans text-sm hover:bg-surface-2'
            }
          >
            Subsidiary savings
          </button>
          <button
            type="button"
            onClick={() => setSourceType('director_loan')}
            className={
              sourceType === 'director_loan'
                ? 'px-4 py-2 bg-accent-bg text-accent font-serif italic text-sm'
                : 'px-4 py-2 text-graphite font-sans text-sm hover:bg-surface-2 border-l border-hairline'
            }
          >
            Director loan
          </button>
        </div>
        <input type="hidden" name="source_type" value={sourceType} />
      </div>

      {/* ───────── From (company or director) ───────── */}
      <div className="mb-6">
        <label
          htmlFor="from_id"
          className="block text-sm font-sans font-medium text-graphite mb-1.5"
        >
          {sourceType === 'subsidiary_savings' ? 'Subsidiary' : 'Director'}
        </label>
        <select
          id="from_id"
          name="from_id"
          required
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
        >
          <option value="">
            {sourceType === 'subsidiary_savings' ? 'Select a subsidiary…' : 'Select a director…'}
          </option>
          {sourceType === 'subsidiary_savings'
            ? companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.short_code})
                </option>
              ))
            : directors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
        </select>
        <p className="font-serif italic text-muted text-xs mt-1.5">
          {sourceType === 'subsidiary_savings'
            ? 'The subsidiary depositing savings into HV'
            : 'The director extending a personal loan to HV'}
        </p>
      </div>

      {/* ───────── Amount + Rate (row) ───────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
        <div>
          <label
            htmlFor="amount"
            className="block text-sm font-sans font-medium text-graphite mb-1.5"
          >
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
          <label
            htmlFor="cost_rate_percent"
            className="block text-sm font-sans font-medium text-graphite mb-1.5"
          >
            Cost rate
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
              placeholder="0.800"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted font-mono">
              % /mo
            </span>
          </div>
          <p className="font-serif italic text-muted text-xs mt-1.5">
            Monthly interest rate HV pays on this capital
          </p>
        </div>
      </div>

      {/* ───────── Lock-in + Effective date (row) ───────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
        <div>
          <label
            htmlFor="lock_in_months"
            className="block text-sm font-sans font-medium text-graphite mb-1.5"
          >
            Lock-in period
          </label>
          <div className="relative">
            <input
              id="lock_in_months"
              name="lock_in_months"
              type="number"
              step="1"
              min="0"
              defaultValue="12"
              required
              className="w-full px-3 py-2 pr-12 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted font-mono">
              months
            </span>
          </div>
          <p className="font-serif italic text-muted text-xs mt-1.5">
            Maturity date auto-calculated from effective date
          </p>
        </div>

        <div>
          <label
            htmlFor="effective_date"
            className="block text-sm font-sans font-medium text-graphite mb-1.5"
          >
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

      {/* ───────── Notes ───────── */}
      <div className="mb-6">
        <label
          htmlFor="notes"
          className="block text-sm font-sans font-medium text-graphite mb-1.5"
        >
          Notes <span className="text-muted font-normal">(optional)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
          placeholder="Context on the deposit, reference to email, etc."
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
          {isPending ? 'Saving…' : 'Record fund source'}
        </button>
        <Link
          href="/fund-in"
          className="text-sm text-graphite hover:text-ink font-sans transition-colors"
        >
          Cancel
        </Link>
        <span className="text-xs text-muted italic font-serif ml-auto">
          Rate locks at save
        </span>
      </div>
    </form>
  )
}
