'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import Link from 'next/link'
import { createPaymentVoucher, createPaymentCategory } from '../actions'

interface InvoicePreset {
  id: string
  invoice_no: string | null
  company_id: string
  company_name: string
  total_amount: number
  period_month: string
  billing_mode: string
  target_pool: string
}

interface Props {
  companies: { id: string; name: string; short_code: string }[]
  bankAccounts: { id: string; bank_name: string; account_number: string; current_balance: number }[]
  categories: { code: string; label: string }[]
  invoicePreset?: InvoicePreset | null
  nonBillablePreset?: boolean
}

const POOL_OPTIONS = [
  { value: 'hv_operating_fund', label: 'Venture Pool' },
  { value: 'dept_pool_director', label: 'Director Pool' },
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

interface SourceRow {
  pool: string
  amount: string
}

export default function NewPaymentForm({ companies, bankAccounts, categories, invoicePreset, nonBillablePreset }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const isInvoicePay = !!invoicePreset
  const isNonBillable = !!nonBillablePreset && !isInvoicePay
  const [direction, setDirection] = useState<'debit' | 'credit'>(isInvoicePay ? 'credit' : 'debit')
  const [categoryCode, setCategoryCode] = useState(isInvoicePay ? 'billing_payment' : '')
  const [sourceRows, setSourceRows] = useState<SourceRow[]>(
    isNonBillable ? [{ pool: 'hv_operating_fund', amount: '' }] : [{ pool: '', amount: '' }]
  )
  const [amount, setAmount] = useState(isInvoicePay ? invoicePreset!.total_amount.toFixed(2) : '')
  const [targetPool, setTargetPool] = useState(isInvoicePay ? invoicePreset!.target_pool : '')
  const [files, setFiles] = useState<File[]>([])
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCatLabel, setNewCatLabel] = useState('')
  const [catList, setCatList] = useState(categories)
  const formRef = useRef<HTMLFormElement>(null)

  const totalAmount = parseFloat(amount) || 0
  const sourceSum = sourceRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const sourceSumMismatch =
    direction === 'debit' && totalAmount > 0 && Math.abs(sourceSum - totalAmount) > 0.005
  const canAddRow = sourceRows.length < 3

  // Auto-fill the first row's amount when there's exactly one row and the user
  // hasn't touched it yet — the common single-source case.
  useEffect(() => {
    if (direction !== 'debit') return
    if (sourceRows.length !== 1) return
    if (sourceRows[0].amount !== '') return
    if (!totalAmount) return
    setSourceRows([{ pool: sourceRows[0].pool, amount: totalAmount.toFixed(2) }])
  }, [totalAmount, direction, sourceRows])

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

    // Client-side sum check before submit (debit only)
    if (direction === 'debit') {
      if (sourceRows.some(r => !r.pool)) {
        setError('Every source row needs a pool selected.')
        return
      }
      if (sourceSumMismatch) {
        setError(
          `Source rows sum RM ${sourceSum.toFixed(2)} — voucher total is RM ${totalAmount.toFixed(2)}. Adjust to match before submitting.`
        )
        return
      }
    }

    // Serialize multi-source rows into FormData
    formData.delete('source_pool') // replaced by source_rows for debit
    if (direction === 'debit') {
      formData.set('source_rows_count', String(sourceRows.length))
      sourceRows.forEach((r, i) => {
        formData.set(`source_rows[${i}][pool]`, r.pool)
        formData.set(`source_rows[${i}][amount]`, r.amount)
      })
      // Back-compat: write source_pool = first row's pool (Step 16 drops this)
      formData.set('source_pool', sourceRows[0]?.pool ?? '')
    }

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
      {/* Direction: toggle for standalone vouchers, locked to credit when settling an invoice */}
      {isInvoicePay ? (
        <input type="hidden" name="direction" value="credit" />
      ) : (
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
              onClick={() => setDirection('credit')}
              className={direction === 'credit'
                ? 'px-5 py-2 bg-accent-bg text-accent font-serif italic text-sm border-l border-hairline'
                : 'px-5 py-2 text-graphite font-sans text-sm hover:bg-surface-2 border-l border-hairline'}
            >
              Credit (receive)
            </button>
          </div>
          <input type="hidden" name="direction" value={direction} />
        </div>
      )}
      {/* voucher_type: billing_payment when settling, else derived from direction */}
      <input
        type="hidden"
        name="voucher_type"
        value={isInvoicePay ? 'billing_payment' : direction === 'debit' ? 'expense' : 'receive_payment'}
      />
      {isInvoicePay ? <input type="hidden" name="invoice_id" value={invoicePreset!.id} /> : null}

      {isInvoicePay ? (
        <div className="mb-6 border border-accent-border rounded-md bg-accent-bg p-4">
          <div className="font-serif italic text-accent text-sm mb-1">Settling invoice</div>
          <div className="font-mono text-sm text-ink mb-1">{invoicePreset!.invoice_no}</div>
          <div className="font-serif text-sm text-graphite">
            {invoicePreset!.company_name} paid RM {invoicePreset!.total_amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
          </div>
        </div>
      ) : null}

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
            defaultValue={isInvoicePay ? invoicePreset!.company_name : ''}
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
            defaultValue={isInvoicePay ? invoicePreset!.company_id : ''}
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
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              readOnly={isInvoicePay}
              className="w-full pl-10 pr-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border read-only:bg-surface-2 read-only:cursor-not-allowed"
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

      {/* ── Source pools (Debit, multi-row) / Target pool (Credit, single) ── */}
      {direction === 'debit' ? (
        <div className="mb-6">
          <div className="flex items-baseline justify-between mb-1.5">
            <label className="block text-sm font-sans font-medium text-graphite">
              Deduct from pools <span className="text-danger">*</span>
            </label>
            <button
              type="button"
              disabled={!canAddRow}
              onClick={() => setSourceRows([...sourceRows, { pool: '', amount: '' }])}
              className="text-xs text-accent hover:text-accent-hover font-serif italic disabled:text-muted disabled:cursor-not-allowed"
            >
              + Add source{!canAddRow ? ' (max 3)' : ''}
            </button>
          </div>
          <div className="space-y-2">
            {sourceRows.map((row, i) => (
              <div key={i} className="flex gap-2 items-start">
                <select
                  value={row.pool}
                  onChange={(e) => {
                    const next = [...sourceRows]
                    next[i] = { ...next[i], pool: e.target.value }
                    setSourceRows(next)
                  }}
                  required
                  className="flex-1 px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
                >
                  <option value="">Select pool…</option>
                  {POOL_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <div className="relative w-40">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted font-mono">RM</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={row.amount}
                    onChange={(e) => {
                      const next = [...sourceRows]
                      next[i] = { ...next[i], amount: e.target.value }
                      setSourceRows(next)
                    }}
                    className="w-full pl-10 pr-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
                    placeholder="0.00"
                  />
                </div>
                {sourceRows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setSourceRows(sourceRows.filter((_, j) => j !== i))}
                    className="px-2 py-2 text-muted hover:text-danger text-lg font-mono"
                    title="Remove this source"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {totalAmount > 0 ? (
            <p className={`font-mono italic text-xs mt-2 ${sourceSumMismatch ? 'text-danger' : 'text-ledger'}`}>
              {sourceSumMismatch
                ? `Sum RM ${sourceSum.toFixed(2)} · voucher total RM ${totalAmount.toFixed(2)} · mismatch RM ${(totalAmount - sourceSum).toFixed(2)}`
                : `Sum RM ${sourceSum.toFixed(2)} matches voucher total ✓`}
            </p>
          ) : (
            <p className="font-serif italic text-muted text-xs mt-2">
              Split the voucher total across up to 3 pools. Row amounts must sum to the voucher total.
            </p>
          )}
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
          defaultValue={
            isInvoicePay
              ? `Settle invoice ${invoicePreset!.invoice_no} — ${invoicePreset!.company_name}`
              : ''
          }
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
          disabled={isPending || sourceSumMismatch}
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
