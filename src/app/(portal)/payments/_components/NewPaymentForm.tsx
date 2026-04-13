'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import Link from 'next/link'
import { createPaymentVoucher, createPaymentCategory } from '../actions'

interface Props {
  companies: { id: string; name: string; short_code: string }[]
  bankAccounts: { id: string; bank_name: string; account_number: string; current_balance: number }[]
  categories: { code: string; label: string }[]
}

const POOL_OPTIONS = [
  { value: 'hv_operating_fund', label: 'Venture Pool' },
  { value: 'salary_pool', label: 'Director Salary Pool' },
  { value: 'dept_pool_marketing', label: 'Marketing Dept Pool' },
  { value: 'dept_pool_finance', label: 'Finance Dept Pool' },
  { value: 'dept_pool_hr', label: 'HR Dept Pool' },
  { value: 'invoice_payout_pool', label: 'Invoice Payout Pool' },
]

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'netting', label: 'Netting / offset' },
]

export default function NewPaymentForm({ companies, bankAccounts, categories }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [direction, setDirection] = useState<'debit' | 'credit'>('debit')
  const [categoryCode, setCategoryCode] = useState('')
  const [sourcePool, setSourcePool] = useState('')
  const [targetPool, setTargetPool] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCatLabel, setNewCatLabel] = useState('')
  const [catList, setCatList] = useState(categories)
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

    // Append files to formData for server action
    files.forEach((f, i) => formData.append(`attachment_${i}`, f))
    formData.set('attachment_count', String(files.length))

    startTransition(async () => {
      try {
        await createPaymentVoucher(formData)
      } catch (err) {
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <form ref={formRef} action={handleSubmit} className="bg-surface border border-hairline rounded-md p-8 max-w-3xl">
      {/* ── Direction toggle (Debit / Credit) ── */}
      <div className="mb-6">
        <label className="block text-sm font-sans font-medium text-graphite mb-2">
          Direction
        </label>
        <div className="flex gap-0 border border-hairline rounded-md overflow-hidden w-fit">
          <button
            type="button"
            onClick={() => { setDirection('debit'); setTargetPool('') }}
            className={direction === 'debit'
              ? 'px-5 py-2 bg-accent-bg text-accent font-serif italic text-sm'
              : 'px-5 py-2 text-graphite font-sans text-sm hover:bg-surface-2'}
          >
            Debit (pay out)
          </button>
          <button
            type="button"
            onClick={() => { setDirection('credit'); setSourcePool('') }}
            className={direction === 'credit'
              ? 'px-5 py-2 bg-accent-bg text-accent font-serif italic text-sm border-l border-hairline'
              : 'px-5 py-2 text-graphite font-sans text-sm hover:bg-surface-2 border-l border-hairline'}
          >
            Credit (receive)
          </button>
        </div>
        <input type="hidden" name="direction" value={direction} />
        {/* Auto-set voucher_type based on direction */}
        <input type="hidden" name="voucher_type" value={direction === 'debit' ? 'expense' : 'receive_payment'} />
      </div>

      {/* ── Payee ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
        <div>
          <label htmlFor="payee_name" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            {direction === 'debit' ? 'Pay to' : 'Received from'}
          </label>
          <input
            id="payee_name"
            name="payee_name"
            type="text"
            required
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
            placeholder={direction === 'debit' ? 'Recipient name' : 'Payer name'}
          />
        </div>

        <div>
          <label htmlFor="payee_company_id" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Company <span className="text-muted font-normal">(optional)</span>
          </label>
          <select
            id="payee_company_id"
            name="payee_company_id"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          >
            <option value="">Select company…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.short_code})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Hidden reference fields (no longer type-driven) */}
      <input type="hidden" name="reference_type" value="" />
      <input type="hidden" name="reference_id" value="" />

      {/* ── Amount + Bank account ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
        <div>
          <label htmlFor="amount" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Amount
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted font-mono">RM</span>
            <input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              className="w-full pl-10 pr-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border"
              placeholder="0.00"
            />
          </div>
        </div>

        <div>
          <label htmlFor="bank_account_id" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            {direction === 'debit' ? 'Pay from account' : 'Receive into account'}
          </label>
          <select
            id="bank_account_id"
            name="bank_account_id"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          >
            <option value="">Select bank account…</option>
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.bank_name} — {b.account_number} (bal: RM {Number(b.current_balance).toLocaleString('en-MY', { minimumFractionDigits: 2 })})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Payment method ── */}
      <div className="mb-6">
        <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
          Payment method
        </label>
        <select
          name="payment_method"
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border max-w-xs"
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* ── Source pool (Debit) / Target pool (Credit) ── */}
      {direction === 'debit' ? (
        <div className="mb-6">
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Deduct from pool <span className="text-danger">*</span>
          </label>
          <select
            name="source_pool"
            value={sourcePool}
            onChange={(e) => setSourcePool(e.target.value)}
            required
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          >
            <option value="">Select pool…</option>
            {POOL_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <p className="font-serif italic text-muted text-xs mt-1.5">
            Which pool should this payment be deducted from?
          </p>
          <input type="hidden" name="target_pool" value="" />
        </div>
      ) : (
        <div className="mb-6">
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Receive into pool <span className="text-danger">*</span>
          </label>
          <select
            name="target_pool"
            value={targetPool}
            onChange={(e) => setTargetPool(e.target.value)}
            required
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          >
            <option value="">Select pool…</option>
            {POOL_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <p className="font-serif italic text-muted text-xs mt-1.5">
            Which pool should this incoming payment be recorded under?
          </p>
          <input type="hidden" name="source_pool" value="" />
        </div>
      )}

      {/* ── Category ── */}
      <div className="mb-6">
        <div className="flex items-baseline justify-between mb-1.5">
          <label className="block text-sm font-sans font-medium text-graphite">
            Category
          </label>
          <button
            type="button"
            onClick={() => setShowNewCategory(!showNewCategory)}
            className="text-xs text-accent hover:text-accent-hover font-serif italic"
          >
            {showNewCategory ? 'Cancel' : '+ Create new'}
          </button>
        </div>

        {showNewCategory ? (
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newCatLabel}
              onChange={(e) => setNewCatLabel(e.target.value)}
              placeholder="e.g. Logistics, Insurance..."
              className="flex-1 px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
            />
            <button
              type="button"
              onClick={async () => {
                if (!newCatLabel.trim()) return
                const code = newCatLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
                const fd = new FormData()
                fd.set('code', code)
                fd.set('label', newCatLabel.trim())
                try {
                  await createPaymentCategory(fd)
                  setCatList((prev) => [...prev, { code, label: newCatLabel.trim() }])
                  setCategoryCode(code)
                  setNewCatLabel('')
                  setShowNewCategory(false)
                } catch {
                  // ignore — category might already exist
                  setCategoryCode(code)
                  setShowNewCategory(false)
                }
              }}
              className="px-3 py-2 bg-accent text-white text-sm font-serif italic rounded-md hover:bg-accent-hover"
            >
              Add
            </button>
          </div>
        ) : null}

        <select
          name="category_code"
          value={categoryCode}
          onChange={(e) => setCategoryCode(e.target.value)}
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
        >
          <option value="">Select category…</option>
          {catList.map((c) => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
        <p className="font-serif italic text-muted text-xs mt-1.5">
          For P&L classification. Create new categories as needed.
        </p>
      </div>

      {/* ── Description ── */}
      <div className="mb-6">
        <label htmlFor="description" className="block text-sm font-sans font-medium text-graphite mb-1.5">
          Description <span className="text-danger">*</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          required
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
          placeholder="What is this payment for? Include reference numbers, invoice numbers, etc."
        />
      </div>

      {/* ── Attachments ── */}
      <div className="mb-6">
        <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
          Attachments <span className="text-muted font-normal">(optional)</span>
        </label>
        <div className="border border-hairline rounded-md bg-paper p-4">
          <input
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            onChange={(e) => {
              const selected = Array.from(e.target.files ?? [])
              setFiles((prev) => [...prev, ...selected])
            }}
            className="text-sm text-ink file:mr-4 file:py-2 file:px-4 file:rounded-md file:border file:border-hairline file:text-sm file:font-serif file:italic file:text-accent file:bg-accent-bg file:cursor-pointer hover:file:bg-surface-2"
          />
          <p className="font-serif italic text-muted text-xs mt-2">
            Attach transfer slip, invoice, receipt, or approval code. Optional for all payments.
          </p>
          {files.length > 0 ? (
            <div className="mt-3 space-y-1">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs text-ink truncate max-w-[300px]">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="text-xs text-muted hover:text-danger ml-2"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <p className="font-mono text-xs text-muted mt-1">{files.length} file{files.length === 1 ? '' : 's'} selected</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Notes ── */}
      <div className="mb-6">
        <label htmlFor="notes" className="block text-sm font-sans font-medium text-graphite mb-1.5">
          Internal notes <span className="text-muted font-normal">(optional)</span>
        </label>
        <input
          id="notes"
          name="notes"
          type="text"
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
          placeholder="For Finance team reference only"
        />
      </div>

      {/* ── Error ── */}
      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-6 text-sm font-sans">
          {error}
        </div>
      ) : null}

      {/* ── Submit ── */}
      <div className="flex items-center gap-4 pt-4 border-t border-hairline">
        <button
          type="submit"
          disabled={isPending}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Creating…' : 'Create voucher (draft)'}
        </button>
        <Link href="/payments" className="text-sm text-graphite hover:text-ink font-sans transition-colors">
          Cancel
        </Link>
        <span className="text-xs text-muted italic font-serif ml-auto">
          Saved as draft — submit for approval next
        </span>
      </div>
    </form>
  )
}
