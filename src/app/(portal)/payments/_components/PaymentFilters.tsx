'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useTransition, useEffect } from 'react'
import { useFinView } from '@/components/layout/fin-view'

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

// On the sheet the toolbar's own CSS sizes the fields (DESIGN.md › Sheet
// theme, `.sheet-toolbar`); these only set a label over its field.
const fieldCls = 'flex flex-col gap-1 text-[10px] font-medium uppercase tracking-[0.06em] text-graphite'
const inputCls = 'text-ink focus:outline-none'

export default function PaymentFilters({ side = 'payments' }: { side?: 'payments' | 'receipts' }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  // The search box in the handoff's words, on the Finance view (2026-10-10).
  const fin = useFinView()
  const searchHint = fin
    ? side === 'receipts'
      ? 'Search receipt #, from, description…'
      : 'Search voucher #, payee, description…'
    : 'voucher #, description, payee…'

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
    <form
      onSubmit={(e) => { e.preventDefault(); applyAll() }}
      className="sheet-toolbar"
      aria-label="Filters"
    >
      <label className={fieldCls + ' min-w-[220px] flex-[2]'}>
        Search
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchHint}
          className={inputCls}
        />
      </label>
      <label className={fieldCls}>
        Type
        <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
          {VOUCHER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>
      <label className={fieldCls}>
        Pool
        <select value={pool} onChange={(e) => setPool(e.target.value)} className={inputCls}>
          {POOLS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </label>
      <label className={fieldCls}>
        From
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls + ' font-mono'} />
      </label>
      <label className={fieldCls}>
        To
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls + ' font-mono'} />
      </label>
      <label className={fieldCls}>
        Amount (RM)
        <span className="flex items-center gap-1.5">
          <input
            type="number"
            step="0.01"
            min="0"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            placeholder="min"
            className={inputCls + ' w-24 font-mono tabular'}
          />
          <span className="text-muted text-xs">–</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder="max"
            className={inputCls + ' w-24 font-mono tabular'}
          />
        </span>
      </label>
      <span className="flex items-center gap-3 self-end pb-0.5">
        <button
          type="submit"
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-1.5 rounded-md transition-colors"
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
      </span>
    </form>
  )
}
