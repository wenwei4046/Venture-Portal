'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import Link from 'next/link'
import { createPaymentVoucher } from '../actions'

interface InvoicePreset {
  id: string
  invoice_no: string | null
  // Item 5: company_id is null for invoices billed to non-subsidiary parties
  // (director / dept_pool / freetext). The form falls back to free-text payee.
  company_id: string | null
  company_name: string
  total_amount: number
  period_month: string
  billing_mode: string
  target_pool: string
}

interface PayableFundSource {
  id: string
  label: string
  source_type: string
  from_company_id: string | null
  from_director_id: string | null
  original_amount: number
  cost_rate: number
  lock_in_months: number | null
  outstanding: number
  monthly_payment: number
  monthly_principal: number
  monthly_interest: number
  total_periods: number
  periods_paid: number
  remaining_periods: number
}

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

interface Props {
  companies: { id: string; name: string; short_code: string }[]
  bankAccounts: { id: string; bank_name: string; account_number: string; current_balance: number }[]
  categories: Category[]
  glAccounts: GlAccount[]
  invoicePreset?: InvoicePreset | null
  nonBillablePreset?: boolean
  payableFundSources?: PayableFundSource[]
}

const TYPE_BADGE: Record<AccountType, { label: string; className: string }> = {
  asset:     { label: 'BS · Asset',     className: 'text-info' },
  liability: { label: 'BS · Liability', className: 'text-info' },
  equity:    { label: 'BS · Equity',    className: 'text-info' },
  revenue:   { label: 'P&L · Revenue',  className: 'text-ledger' },
  expense:   { label: 'P&L · Expense',  className: 'text-danger' },
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

interface SourceRow {
  pool: string
  amount: string
  category_code: string
  override_account_type?: AccountType | ''
  override_gl_account_code?: string
  override_reason?: string
}

export default function NewPaymentForm({ companies, bankAccounts, categories, glAccounts, invoicePreset, nonBillablePreset, payableFundSources = [] }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const isInvoicePay = !!invoicePreset
  const isNonBillable = !!nonBillablePreset && !isInvoicePay
  const [direction, setDirection] = useState<'debit' | 'credit'>(isInvoicePay ? 'credit' : 'debit')
  const [categoryCode, setCategoryCode] = useState(isInvoicePay ? 'billing_payment' : '')
  const [sourceRows, setSourceRows] = useState<SourceRow[]>(
    isNonBillable
      ? [{ pool: 'venture_pool', amount: '', category_code: '' }]
      : [{ pool: '', amount: '', category_code: isInvoicePay ? 'billing_payment' : '' }]
  )
  const [amount, setAmount] = useState(isInvoicePay ? invoicePreset!.total_amount.toFixed(2) : '')
  // Controlled payee fields so loan-repayment mode can auto-fill them
  const [payeeName, setPayeeName] = useState(isInvoicePay ? invoicePreset!.company_name : '')
  const [payeeCompanyId, setPayeeCompanyId] = useState(isInvoicePay ? (invoicePreset!.company_id ?? '') : '')
  // Loan repayment mode — HV repaying a fund source (subsidiary savings / director loan)
  const [isLoanRepayment, setIsLoanRepayment] = useState(false)
  const [fundSourceId, setFundSourceId] = useState<string>('')
  const [repayPrincipal, setRepayPrincipal] = useState('0.00')
  const [repayInterest, setRepayInterest] = useState('0.00')
  const [repayPenalty, setRepayPenalty] = useState('0.00')
  const repaymentSum =
    (parseFloat(repayPrincipal) || 0) +
    (parseFloat(repayInterest) || 0) +
    (parseFloat(repayPenalty) || 0)
  // In loan repayment mode, the voucher amount IS the repayment split sum — no separate mismatch possible.
  const repaymentSumMismatch = false
  // Phase 7 Step 10: pre-select Venture Pool when Credit (common case).
  const [targetPool, setTargetPool] = useState(
    isInvoicePay ? invoicePreset!.target_pool : direction === 'credit' ? 'venture_pool' : ''
  )
  const [files, setFiles] = useState<File[]>([])
  const [catList] = useState(categories)
  const formRef = useRef<HTMLFormElement>(null)

  const totalAmount = parseFloat(amount) || 0
  const sourceSum = sourceRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const sourceSumMismatch =
    direction === 'debit' && totalAmount > 0 && Math.abs(sourceSum - totalAmount) > 0.005

  // Auto-fill the first row's amount when there's exactly one row and the user
  // hasn't touched it yet — the common single-source case.
  useEffect(() => {
    if (direction !== 'debit') return
    if (sourceRows.length !== 1) return
    if (sourceRows[0].amount !== '') return
    if (!totalAmount) return
    setSourceRows([{ pool: sourceRows[0].pool, amount: totalAmount.toFixed(2), category_code: sourceRows[0].category_code }])
  }, [totalAmount, direction, sourceRows])

  // When a fund source is picked, auto-fill payee + monthly principal/interest
  // split (user can override). Payee = the company/director HV owes money to.
  const selectedFundSource = payableFundSources.find((fs) => fs.id === fundSourceId) ?? null
  useEffect(() => {
    if (!isLoanRepayment || !selectedFundSource) return
    const company = companies.find((c) => c.id === selectedFundSource.from_company_id)
    if (company) {
      setPayeeName(company.name)
      setPayeeCompanyId(company.id)
    } else if (selectedFundSource.from_director_id) {
      setPayeeName('Director')
      setPayeeCompanyId('')
    }
    setRepayPrincipal((prev) => (prev === '0.00' || prev === '' ? selectedFundSource.monthly_principal.toFixed(2) : prev))
    setRepayInterest((prev) => (prev === '0.00' || prev === '' ? selectedFundSource.monthly_interest.toFixed(2) : prev))
  }, [isLoanRepayment, selectedFundSource, companies])

  // Loan repayment mode: amount = sum of split; category auto-chosen by what's being paid.
  useEffect(() => {
    if (!isLoanRepayment) return
    setAmount(repaymentSum.toFixed(2))
    // If paying principal → classify as loan_principal, else loan_interest.
    const wantCat = (parseFloat(repayPrincipal) || 0) > 0 ? 'loan_principal' : 'loan_interest'
    if (catList.some((c) => c.code === wantCat)) {
      setCategoryCode(wantCat)
      // Mig 205: each source row owns its category. Apply auto-category to every row.
      setSourceRows(prev => prev.map(r => ({ ...r, category_code: wantCat })))
    }
  }, [isLoanRepayment, repaymentSum, repayPrincipal, catList])

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

    // Loan repayment validation (HV → fund source)
    if (isLoanRepayment) {
      if (!fundSourceId) {
        setError('Select a loan (fund source) before submitting as a loan repayment.')
        return
      }
      if (repaymentSumMismatch) {
        setError(
          `Repayment split sums RM ${repaymentSum.toFixed(2)} — voucher total is RM ${totalAmount.toFixed(2)}. Principal + interest + penalty must match.`
        )
        return
      }
      formData.set('fund_source_id', fundSourceId)
      formData.set('repayment_principal', repayPrincipal)
      formData.set('repayment_interest', repayInterest)
      formData.set('repayment_penalty', repayPenalty)
    }

    // Serialize multi-source rows into FormData
    formData.delete('source_pool') // replaced by source_rows for debit
    if (direction === 'debit') {
      formData.set('source_rows_count', String(sourceRows.length))
      for (let i = 0; i < sourceRows.length; i++) {
        const r = sourceRows[i]
        formData.set(`source_rows[${i}][pool]`, r.pool)
        formData.set(`source_rows[${i}][amount]`, r.amount)
        formData.set(`source_rows[${i}][category_code]`, r.category_code)
        // Per-row BS/PL + GL override (mig 218). All-or-none guard at DB level.
        if (r.override_account_type && r.override_gl_account_code && r.override_reason?.trim()) {
          formData.set(`source_rows[${i}][override_account_type]`, r.override_account_type)
          formData.set(`source_rows[${i}][override_gl_account_code]`, r.override_gl_account_code)
          formData.set(`source_rows[${i}][override_reason]`, r.override_reason.trim())
        } else if (r.override_account_type || r.override_gl_account_code || r.override_reason) {
          setError(`Source row ${i + 1}: override requires account type, GL account, AND reason — fill all three or clear all.`)
          return
        }
      }
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
              onClick={() => {
                setDirection('credit')
                if (!targetPool) setTargetPool('venture_pool')
              }}
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

      {/* ── Payee ── (hidden in loan-repayment mode; auto-filled from selected loan) */}
      {isLoanRepayment ? (
        <>
          <input type="hidden" name="payee_company_id" value={payeeCompanyId} />
          <input type="hidden" name="payee_name" value={payeeName} />
        </>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
          <div>
            <label htmlFor="payee_company_id" className="block text-sm font-sans font-medium text-graphite mb-1.5">
              Company
            </label>
            <select
              id="payee_company_id"
              name="payee_company_id"
              value={payeeCompanyId}
              onChange={(e) => {
                setPayeeCompanyId(e.target.value)
                const co = companies.find((c) => c.id === e.target.value)
                if (co && !payeeName) setPayeeName(co.name)
              }}
              className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
            >
              <option value="">Select company…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.short_code})</option>
              ))}
            </select>
            <p className="font-serif italic text-muted text-xs mt-1">
              Name auto-fills from company if left blank
            </p>
          </div>

          <div>
            <label htmlFor="payee_name" className="block text-sm font-sans font-medium text-graphite mb-1.5">
              {direction === 'debit' ? 'Pay to' : 'Received from'}
              <span className="text-muted font-normal ml-1">(auto from company)</span>
            </label>
            <input
              id="payee_name"
              name="payee_name"
              type="text"
              value={payeeName}
              onChange={(e) => setPayeeName(e.target.value)}
              className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
              placeholder={direction === 'debit' ? 'Recipient name' : 'Payer name'}
            />
          </div>
        </div>
      )}

      {/* Hidden reference fields (no longer type-driven) */}
      <input type="hidden" name="reference_type" value="" />
      <input type="hidden" name="reference_id" value="" />

      {/* ── Amount + Bank account ── (Amount is auto-computed in loan-repayment mode) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
        {isLoanRepayment ? (
          <>
            <input type="hidden" name="amount" value={amount} />
            <div className="flex flex-col justify-center">
              <div className="text-xs text-muted uppercase tracking-wide font-sans">Repayment total</div>
              <div className="font-serif text-2xl text-ink tabular">
                RM {repaymentSum.toFixed(2)}
              </div>
              <div className="text-xs text-muted font-mono mt-1">auto from split below</div>
            </div>
          </>
        ) : (
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
        )}

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

      {/* ── Loan repayment toggle (debit only) — HV repaying fund source ── */}
      {direction === 'debit' && !isInvoicePay && payableFundSources.length > 0 ? (
        <div className="mb-6 p-4 bg-paper border border-hairline rounded-md">
          <label className="flex items-center gap-2 text-sm font-sans font-medium text-graphite cursor-pointer">
            <input
              type="checkbox"
              checked={isLoanRepayment}
              onChange={(e) => setIsLoanRepayment(e.target.checked)}
              className="rounded border-hairline"
            />
            This voucher is a loan repayment
          </label>
          {isLoanRepayment ? (
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-sans text-graphite mb-1">Loan to repay</label>
                <select
                  value={fundSourceId}
                  onChange={(e) => {
                    setFundSourceId(e.target.value)
                    // Reset split so useEffect repopulates from the new source
                    setRepayPrincipal('0.00')
                    setRepayInterest('0.00')
                  }}
                  required
                  className="w-full px-3 py-2 bg-surface border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
                >
                  <option value="">Select loan…</option>
                  {payableFundSources.map((fs) => (
                    <option key={fs.id} value={fs.id}>
                      {fs.label} · {fs.remaining_periods} of {fs.total_periods} periods left
                    </option>
                  ))}
                </select>
                {selectedFundSource ? (
                  <p className="font-serif italic text-muted text-xs mt-1.5">
                    Monthly payment RM {selectedFundSource.monthly_payment.toFixed(2)} ·
                    outstanding principal RM {selectedFundSource.outstanding.toFixed(2)} ·
                    {selectedFundSource.remaining_periods} month
                    {selectedFundSource.remaining_periods === 1 ? '' : 's'} remaining
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-sans text-graphite mb-1">Principal</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={repayPrincipal}
                    onChange={(e) => setRepayPrincipal(e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
                  />
                </div>
                <div>
                  <label className="block text-xs font-sans text-graphite mb-1">Interest</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={repayInterest}
                    onChange={(e) => setRepayInterest(e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
                  />
                </div>
                <div>
                  <label className="block text-xs font-sans text-graphite mb-1">Penalty</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={repayPenalty}
                    onChange={(e) => setRepayPenalty(e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
                  />
                </div>
              </div>
              {totalAmount > 0 ? (
                <p className={`font-mono italic text-xs ${repaymentSumMismatch ? 'text-danger' : 'text-ledger'}`}>
                  {repaymentSumMismatch
                    ? `Split sum RM ${repaymentSum.toFixed(2)} ≠ voucher total RM ${totalAmount.toFixed(2)}`
                    : `Split sum RM ${repaymentSum.toFixed(2)} matches voucher total ✓`}
                </p>
              ) : null}
              <p className="font-serif italic text-muted text-xs">
                On execute, the system auto-inserts fund_source_repayments rows for this subsidiary/director.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Source pools (Debit, multi-row) / Target pool (Credit, single) ── */}
      {direction === 'debit' ? (
        <div className="mb-6">
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
          {/* Column headers for ≥2 rows */}
          {sourceRows.length > 1 ? (
            <div className="flex gap-2 items-center text-xs uppercase tracking-wide text-muted font-sans mb-1.5 px-0.5">
              <div className="flex-1">Pool</div>
              <div className="flex-1">Category</div>
              <div className="w-40">Amount</div>
              <div className="w-6"></div>
            </div>
          ) : null}
          <div className="space-y-3">
            {sourceRows.map((row, i) => {
              const cat = catList.find((c) => c.code === row.category_code)
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
                  disabled={isLoanRepayment}
                  className="flex-1 px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border disabled:opacity-60"
                >
                  <option value="">
                    {catList.length === 0 ? 'No categories — create one' : 'Select category…'}
                  </option>
                  {catList.map((c) => (
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
                ) : (
                  <div className="w-6" />
                )}
                </div>
                {/* BS/PL preview + override (mig 218 / Option B) */}
                {row.category_code && !isLoanRepayment ? (
                  <div className="mt-2 flex items-baseline justify-between gap-3">
                    <div className="text-xs font-mono">
                      {effType ? (
                        <span className={TYPE_BADGE[effType].className}>
                          → {TYPE_BADGE[effType].label} · {effGl ?? '—'}
                          {effGlName ? <span className="text-muted ml-1">({effGlName})</span> : null}
                          {hasOverride ? (
                            <span className="ml-2 text-alert font-serif italic">overridden</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-danger italic font-serif">
                          Category has no BS/PL classification — fix in Settings
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
                      placeholder="Reason for override (required — auditor will see this)"
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
                ? `Sum RM ${sourceSum.toFixed(2)} · voucher total RM ${totalAmount.toFixed(2)} · mismatch RM ${(totalAmount - sourceSum).toFixed(2)}`
                : `Sum RM ${sourceSum.toFixed(2)} matches voucher total ✓`}
            </p>
          ) : (
            <p className="font-serif italic text-muted text-xs mt-2">
              Each row: which pool pays, what category, and how much. Row amounts must sum to the voucher total.
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

      {/* ── Category ── (debit: per-source rows own it; credit: single voucher-level) */}
      {isLoanRepayment ? (
        // Loan repayment: auto-category (loan_principal/loan_interest) is applied
        // to each source row by the useEffect above. No explicit UI needed here.
        null
      ) : (
      <div className="mb-6">
        <div className="flex items-baseline justify-between mb-1.5">
          <label className="block text-sm font-sans font-medium text-graphite">
            {direction === 'credit' ? 'Category' : 'Manage categories'}
          </label>
          <Link
            href="/settings?tab=categories"
            target="_blank"
            className="text-xs text-accent hover:text-accent-hover font-serif italic"
          >
            Manage in Settings →
          </Link>
        </div>

        {direction === 'credit' ? (
          catList.length === 0 ? (
            <p className="font-serif italic text-muted text-sm py-2 px-3 bg-surface border border-hairline rounded-md">
              No categories yet — create one above to start.
            </p>
          ) : (
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
          )
        ) : (
          <p className="font-serif italic text-muted text-xs">
            Pick category per-row in the pool split above. New categories added here appear in every row&apos;s dropdown.
          </p>
        )}
        {direction === 'credit' ? (
          <p className="font-serif italic text-muted text-xs mt-1.5">
            For P&L classification. Create new categories as needed.
          </p>
        ) : null}
      </div>
      )}

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
          disabled={isPending || sourceSumMismatch || repaymentSumMismatch}
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
