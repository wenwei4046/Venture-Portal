'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { updatePaymentVoucher } from '../../../actions'

type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'

interface Category {
  code: string
  label: string
  account_type: AccountType | null
  gl_account_code: string | null
}

interface GlAccount {
  code: string
  name: string
  type: AccountType
}

interface SourceRow {
  pool: string
  amount: string
  category_code: string
  override_account_type?: AccountType | ''
  override_gl_account_code?: string
  override_reason?: string
}

interface Props {
  voucher: {
    id: string
    voucher_no: string | null
    voucher_type: string
    direction: 'debit' | 'credit'
    amount: number
    payee_name: string
    payee_company_id: string | null
    bank_account_id: string | null
    description: string
    notes: string | null
    payment_method: string | null
    target_pool: string | null
    fund_source_id: string | null
    loan_id: string | null
    repayment_breakdown: { principal: number; interest: number; penalty: number } | null
  }
  initialSources: SourceRow[]
  initialCreditCategoryCode: string | null
  companies: { id: string; name: string; short_code: string }[]
  bankAccounts: { id: string; bank_name: string; account_number: string; current_balance: number }[]
  categories: Category[]
  glAccounts: GlAccount[]
}

const POOL_OPTIONS = [
  { value: 'venture_pool', label: 'Venture Pool' },
  { value: 'dept_pool_hr', label: 'HR Dept Pool' },
  { value: 'dept_pool_finance', label: 'Finance Dept Pool' },
  { value: 'dept_pool_director_office', label: 'Director Office Dept Pool' },
  { value: 'dept_pool_director', label: 'Director Pool' },
  { value: 'dept_pool_marketing', label: 'Marketing Dept Pool' },
  { value: 'invoice_payout_pool', label: 'Invoice Payout Pool' },
]

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'netting', label: 'Netting / offset' },
]

const TYPE_BADGE: Record<AccountType, { label: string; className: string }> = {
  asset:     { label: 'BS · Asset',     className: 'text-info' },
  liability: { label: 'BS · Liability', className: 'text-info' },
  equity:    { label: 'BS · Equity',    className: 'text-info' },
  revenue:   { label: 'P&L · Revenue',  className: 'text-ledger' },
  expense:   { label: 'P&L · Expense',  className: 'text-danger' },
}

export default function EditPaymentForm({
  voucher, initialSources, initialCreditCategoryCode,
  companies, bankAccounts, categories, glAccounts,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const isDebit = voucher.direction === 'debit'
  const amountLocked = !!voucher.repayment_breakdown && (voucher.fund_source_id || voucher.loan_id)

  const [amount, setAmount] = useState(voucher.amount.toFixed(2))
  const [payeeName, setPayeeName] = useState(voucher.payee_name)
  const [payeeCompanyId, setPayeeCompanyId] = useState(voucher.payee_company_id ?? '')
  const [bankAccountId, setBankAccountId] = useState(voucher.bank_account_id ?? '')
  const [description, setDescription] = useState(voucher.description)
  const [paymentMethod, setPaymentMethod] = useState(voucher.payment_method ?? 'bank_transfer')
  const [notes, setNotes] = useState(voucher.notes ?? '')
  const [targetPool, setTargetPool] = useState(voucher.target_pool ?? '')
  const [categoryCode, setCategoryCode] = useState(initialCreditCategoryCode ?? '')
  const [sourceRows, setSourceRows] = useState<SourceRow[]>(
    initialSources.length > 0 ? initialSources : [{ pool: '', amount: '', category_code: '' }],
  )

  const totalAmount = parseFloat(amount) || 0
  const sourceSum = sourceRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const sourceSumMismatch =
    isDebit && totalAmount > 0 && Math.abs(sourceSum - totalAmount) > 0.005

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const formData = new FormData(e.currentTarget)
    formData.set('id', voucher.id)
    formData.set('amount', amount)
    formData.set('payee_name', payeeName)
    formData.set('payee_company_id', payeeCompanyId)
    formData.set('bank_account_id', bankAccountId)
    formData.set('description', description)
    formData.set('payment_method', paymentMethod)
    formData.set('notes', notes)

    if (isDebit) {
      if (sourceSumMismatch) {
        setError(`Source sum RM ${sourceSum.toFixed(2)} ≠ voucher RM ${totalAmount.toFixed(2)}`)
        return
      }
      formData.set('source_rows_count', String(sourceRows.length))
      for (let i = 0; i < sourceRows.length; i++) {
        const r = sourceRows[i]
        formData.set(`source_rows[${i}][pool]`, r.pool)
        formData.set(`source_rows[${i}][amount]`, r.amount)
        formData.set(`source_rows[${i}][category_code]`, r.category_code)
        if (r.override_account_type && r.override_gl_account_code && r.override_reason?.trim()) {
          formData.set(`source_rows[${i}][override_account_type]`, r.override_account_type)
          formData.set(`source_rows[${i}][override_gl_account_code]`, r.override_gl_account_code)
          formData.set(`source_rows[${i}][override_reason]`, r.override_reason.trim())
        } else if (r.override_account_type || r.override_gl_account_code || r.override_reason) {
          setError(`Source row ${i + 1}: override requires account type + GL + reason — fill all or clear all`)
          return
        }
      }
    } else {
      formData.set('target_pool', targetPool)
      formData.set('category_code', categoryCode)
    }

    startTransition(async () => {
      try {
        await updatePaymentVoucher(formData)
      } catch (err) {
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err
        setError(err instanceof Error ? err.message : 'Save failed')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
      {error ? (
        <div className="p-3 border border-danger bg-danger-bg rounded-md text-sm text-danger font-serif">
          {error}
        </div>
      ) : null}

      {/* Locked metadata */}
      <div className="grid grid-cols-2 gap-4 p-4 border border-hairline rounded-md bg-surface text-sm">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted mb-1">Voucher</div>
          <div className="font-mono text-ink">{voucher.voucher_no ?? 'Draft'}</div>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted mb-1">Type · Direction</div>
          <div className="font-serif italic text-graphite">
            {voucher.voucher_type.replace(/_/g, ' ')} · {voucher.direction}
          </div>
        </div>
      </div>

      {/* Amount */}
      <div>
        <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
          Amount <span className="text-danger">*</span>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted font-mono">RM</span>
          <input
            type="number"
            step="0.01"
            min="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={!!amountLocked}
            className="w-full pl-10 pr-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border disabled:bg-stone disabled:text-graphite"
          />
        </div>
        {amountLocked ? (
          <p className="font-serif italic text-muted text-xs mt-1.5">
            Locked — loan repayment with fixed principal/interest/penalty breakdown. Void + recreate if amount must change.
          </p>
        ) : null}
      </div>

      {/* Payee */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            {isDebit ? 'Pay to' : 'Received from'} <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            required
            value={payeeName}
            onChange={(e) => setPayeeName(e.target.value)}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Company (optional)
          </label>
          <select
            value={payeeCompanyId}
            onChange={(e) => setPayeeCompanyId(e.target.value)}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          >
            <option value="">—</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.short_code})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Bank account + payment method */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Bank account
          </label>
          <select
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          >
            <option value="">—</option>
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.bank_name} — {b.account_number}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Payment method
          </label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          >
            {PAYMENT_METHODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Source rows (debit) */}
      {isDebit ? (
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <label className="block text-sm font-sans font-medium text-graphite">
              Deduct from pools <span className="text-danger">*</span>
            </label>
            <button
              type="button"
              onClick={() => setSourceRows([...sourceRows, { pool: '', amount: '', category_code: '' }])}
              className="text-xs text-accent hover:text-accent-hover font-serif italic"
            >
              + Add source
            </button>
          </div>
          <div className="space-y-3">
            {sourceRows.map((row, i) => {
              const cat = categories.find((c) => c.code === row.category_code)
              const derivedType = cat?.account_type ?? null
              const derivedGl = cat?.gl_account_code ?? null
              const hasOverride = !!row.override_account_type
              const effType = (row.override_account_type || derivedType) as AccountType | null
              const effGl = row.override_gl_account_code || derivedGl
              const effGlName = glAccounts.find((g) => g.code === effGl)?.name
              const overrideGlOptions = row.override_account_type
                ? glAccounts.filter((g) => g.type === row.override_account_type)
                : []
              return (
                <div key={i} className="border border-hairline rounded-md p-3 bg-surface">
                  <div className="flex gap-2 items-start">
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
                    <select
                      value={row.category_code}
                      onChange={(e) => {
                        const next = [...sourceRows]
                        next[i] = { ...next[i], category_code: e.target.value }
                        setSourceRows(next)
                      }}
                      className="flex-1 px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
                    >
                      <option value="">Select category…</option>
                      {categories.map((c) => (
                        <option key={c.code} value={c.code}>{c.label}</option>
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
                    ) : (
                      <div className="w-6" />
                    )}
                  </div>
                  {/* BS/PL preview + override */}
                  {row.category_code ? (
                    <div className="mt-2 flex items-baseline justify-between gap-3">
                      <div className="text-xs font-mono">
                        {effType ? (
                          <span className={TYPE_BADGE[effType].className}>
                            → {TYPE_BADGE[effType].label} · {effGl ?? '—'}
                            {effGlName ? <span className="text-muted ml-1">({effGlName})</span> : null}
                            {hasOverride ? <span className="ml-2 text-alert font-serif italic">overridden</span> : null}
                          </span>
                        ) : (
                          <span className="text-danger italic font-serif">
                            Category has no BS/PL classification
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...sourceRows]
                          if (hasOverride) {
                            next[i] = { ...next[i], override_account_type: '', override_gl_account_code: '', override_reason: '' }
                          } else {
                            next[i] = { ...next[i], override_account_type: derivedType ?? 'expense', override_gl_account_code: derivedGl ?? '', override_reason: '' }
                          }
                          setSourceRows(next)
                        }}
                        className="text-xs text-graphite hover:text-accent font-serif italic"
                      >
                        {hasOverride ? 'Clear override' : 'Override'}
                      </button>
                    </div>
                  ) : null}
                  {hasOverride ? (
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 border border-alert/40 bg-alert/5 rounded">
                      <select
                        value={row.override_account_type}
                        onChange={(e) => {
                          const next = [...sourceRows]
                          next[i] = { ...next[i], override_account_type: e.target.value as AccountType, override_gl_account_code: '' }
                          setSourceRows(next)
                        }}
                        className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
                      >
                        <option value="asset">BS · Asset</option>
                        <option value="liability">BS · Liability</option>
                        <option value="equity">BS · Equity</option>
                        <option value="revenue">P&L · Revenue</option>
                        <option value="expense">P&L · Expense</option>
                      </select>
                      <select
                        value={row.override_gl_account_code ?? ''}
                        onChange={(e) => {
                          const next = [...sourceRows]
                          next[i] = { ...next[i], override_gl_account_code: e.target.value }
                          setSourceRows(next)
                        }}
                        className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
                      >
                        <option value="">Select GL…</option>
                        {overrideGlOptions.map((g) => (
                          <option key={g.code} value={g.code}>{g.code} — {g.name}</option>
                        ))}
                      </select>
                      <textarea
                        value={row.override_reason ?? ''}
                        onChange={(e) => {
                          const next = [...sourceRows]
                          next[i] = { ...next[i], override_reason: e.target.value }
                          setSourceRows(next)
                        }}
                        placeholder="Reason for override (required)"
                        rows={2}
                        className="sm:col-span-2 px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
                      />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
          {totalAmount > 0 ? (
            <p className={`font-mono italic text-xs mt-2 ${sourceSumMismatch ? 'text-danger' : 'text-ledger'}`}>
              {sourceSumMismatch
                ? `Sum RM ${sourceSum.toFixed(2)} · voucher RM ${totalAmount.toFixed(2)} · diff RM ${(totalAmount - sourceSum).toFixed(2)}`
                : `Sum RM ${sourceSum.toFixed(2)} matches ✓`}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div>
            <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
              Receive into pool <span className="text-danger">*</span>
            </label>
            <select
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
          </div>
          <div>
            <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
              Category
            </label>
            <select
              value={categoryCode}
              onChange={(e) => setCategoryCode(e.target.value)}
              className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
            >
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* Description + notes */}
      <div>
        <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
          Description <span className="text-danger">*</span>
        </label>
        <textarea
          rows={3}
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
        />
      </div>

      <div>
        <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
          Notes (optional)
        </label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
        />
      </div>

      <div className="flex items-center gap-3 pt-4 border-t border-hairline">
        <button
          type="submit"
          disabled={isPending || sourceSumMismatch}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Saving…' : 'Save changes'}
        </button>
        <Link
          href={`/payments/${voucher.id}`}
          className="text-sm text-graphite hover:text-ink font-sans transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
