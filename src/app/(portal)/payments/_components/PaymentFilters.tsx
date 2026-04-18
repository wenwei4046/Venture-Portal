'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useTransition, useEffect } from 'react'

const VOUCHER_TYPES = [
  { value: '', label: 'Any type' },
  { value: 'expense', label: 'Expense' },
  { value: 'billing_payment', label: 'Billing payment' },
  { value: 'loan_repayment', label: 'Loan repayment' },
  { value: 'claim_payout', label: 'Claim payout' },
  { value: 'salary_payout', label: 'Salary payout' },
  { value: 'internal_transfer', label: 'Internal transfer' },
  { value: 'receive_payment', label: 'Receive payment' },
  { value: 'other', label: 'Other' },
]

const POOLS = [
  { value: '', label: 'Any pool' },
  { value: 'venture_pool', label: 'Venture Pool' },
  { value: 'dept_pool_hr', label: 'HR' },
  { value: 'dept_pool_finance', label: 'Finance' },
  { value: 'dept_pool_director_office', label: 'Director Office' },
  { value: 'dept_pool_director', label: 'Director' },
  { value: 'dept_pool_marketing', label: 'Marketing' },
  { value: 'invoice_payout_pool', label: 'Invoice Payout' },
]

export default function PaymentFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  // Local state mirrors URL — initialized from URL on mount/URL change
  const [q, setQ] = useState(searchParams.get('q') ?? '')
  const [type, setType] = useState(searchParams.get('type') ?? '')
  const [pool, setPool] = useState(searchParams.get('pool') ?? '')
  const [from, setFrom] = useState(searchParams.get('from') ?? '')
  const [to, setTo] = useState(searchParams.get('to') ?? '')
  const [min, setMin] = useState(searchParams.get('min') ?? '')
  const [max, setMax] = useState(searchParams.get('max') ?? '')

  // Re-sync local state when URL changes externally
  useEffect(() => {
    setQ(searchParams.get('q') ?? '')
    setType(searchParams.get('type') ?? '')
    setPool(searchParams.get('pool') ?? '')
    setFrom(searchParams.get('from') ?? '')
    setTo(searchParams.get('to') ?? '')
    setMin(searchParams.get('min') ?? '')
    setMax(searchParams.get('max') ?? '')
  }, [searchParams])

  function pushParams(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, val] of Object.entries(next)) {
      if (val) params.set(key, val)
      else params.delete(key)
    }
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  function applyAll() {
    pushParams({ q, type, pool, from, to, min, max })
  }

  function clearAll() {
    setQ(''); setType(''); setPool(''); setFrom(''); setTo(''); setMin(''); setMax('')
    const params = new URLSearchParams(searchParams.toString())
    ;['q', 'type', 'pool', 'from', 'to', 'min', 'max'].forEach(k => params.delete(k))
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  const hasAny = q || type || pool || from || to || min || max

  return (
    <div className="mb-6 border border-hairline rounded-md bg-surface p-4">
      <form
        onSubmit={(e) => { e.preventDefault(); applyAll() }}
        className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
      >
        {/* Search */}
        <div className="md:col-span-4">
          <label className="block text-xs uppercase tracking-wide text-muted font-sans mb-1.5">Search</label>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="voucher #, description, payee…"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          />
        </div>

        {/* Type */}
        <div className="md:col-span-2">
          <label className="block text-xs uppercase tracking-wide text-muted font-sans mb-1.5">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          >
            {VOUCHER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {/* Pool */}
        <div className="md:col-span-2">
          <label className="block text-xs uppercase tracking-wide text-muted font-sans mb-1.5">Pool</label>
          <select
            value={pool}
            onChange={(e) => setPool(e.target.value)}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          >
            {POOLS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        {/* Date range */}
        <div className="md:col-span-2">
          <label className="block text-xs uppercase tracking-wide text-muted font-sans mb-1.5">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full px-2 py-2 bg-paper border border-hairline rounded-md text-xs font-mono text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs uppercase tracking-wide text-muted font-sans mb-1.5">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full px-2 py-2 bg-paper border border-hairline rounded-md text-xs font-mono text-ink focus:outline-none focus:border-accent-border"
          />
        </div>

        {/* Amount range */}
        <div className="md:col-span-3">
          <label className="block text-xs uppercase tracking-wide text-muted font-sans mb-1.5">Amount (RM)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              value={min}
              onChange={(e) => setMin(e.target.value)}
              placeholder="min"
              className="w-full px-2 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
            />
            <span className="text-muted text-xs">–</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={max}
              onChange={(e) => setMax(e.target.value)}
              placeholder="max"
              className="w-full px-2 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
            />
          </div>
        </div>

        {/* Apply / Clear */}
        <div className="md:col-span-3 flex items-center gap-3">
          <button
            type="submit"
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            Apply
          </button>
          {hasAny ? (
            <button
              type="button"
              onClick={clearAll}
              className="text-sm text-graphite hover:text-ink font-serif italic"
            >
              Clear
            </button>
          ) : null}
        </div>
      </form>
    </div>
  )
}
