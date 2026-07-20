'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import Link from 'next/link'
import { updateFundSource } from '../../../actions'
import { expectedFullRepaymentDate } from '@/lib/fund-source-dates'
import AccountPicker, { type AccountOption } from '@/components/AccountPicker'

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
    account_code: string | null
    bank_account_id: string | null
  }
  liabilityAccounts: AccountOption[]
  /** Active HV banks — which one receives the deposit (primary listed first). */
  banks: { id: string; bank_name: string; account_number: string; is_primary: boolean }[]
}

export default function EditFundSourceForm({ id, typeLabel, fromLabel, initial, liabilityAccounts, banks }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [repaymentDate, setRepaymentDate] = useState<string>(initial.repayment_date)
  const [lockInMonths, setLockInMonths] = useState<number>(initial.lock_in_months)
  const [accountCode, setAccountCode] = useState<string>(initial.account_code ?? '')
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

      {/* ───────── Liability account (mig 247) ───────── */}
      <div className="mb-6">
        <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
          Amount due to (BS account){' '}
          <span className="text-muted font-normal">(optional)</span>
        </label>
        <AccountPicker
          accounts={liabilityAccounts}
          value={accountCode}
          onChange={setAccountCode}
          name="account_code"
          typeFilter={['liability', 'equity']}
          placeholder="Pick the payable sub-account…"
        />
        <p className="font-serif italic text-muted text-xs mt-1.5">
          Leave blank to fall back to the umbrella &quot;4000 Fund Sources Payable&quot;.
        </p>
      </div>

      {/* ───────── Receiving bank (mig 20260708100000) ───────── */}
      <div className="mb-6">
        <label
          htmlFor="bank_account_id"
          className="block text-sm font-sans font-medium text-graphite mb-1.5"
        >
          Receive into bank
        </label>
        <select
          id="bank_account_id"
          name="bank_account_id"
          defaultValue={initial.bank_account_id ?? banks.find((b) => b.is_primary)?.id ?? banks[0]?.id ?? ''}
          disabled={isPending}
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border disabled:opacity-60"
        >
          {banks.length === 0 ? (
            <option value="">No active banks</option>
          ) : (
            banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.bank_name} — {b.account_number}
                {b.is_primary ? ' (primary)' : ''}
              </option>
            ))
          )}
        </select>
        <p className="font-serif italic text-muted text-xs mt-1.5">
          Which HV account the money lands in. Applied when Principal approves —
          that bank&apos;s balance and its GL cash account are the ones that move.
        </p>
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
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                if (!isNaN(v) && v >= 1) setLockInMonths(v)
              }}
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
          onChange={(e) => setRepaymentDate(e.target.value)}
          className="w-full max-w-sm px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
        />
        <p className="font-serif italic text-muted text-xs mt-1.5">
          Date the first installment is due. Must be on or after the effective date.
        </p>
        {repaymentDate && lockInMonths >= 1 ? (
          <p className="font-serif italic text-muted text-xs mt-1.5">
            Fully repaid by ~{expectedFullRepaymentDate(repaymentDate, lockInMonths)} ({lockInMonths} installment{lockInMonths === 1 ? '' : 's'})
          </p>
        ) : null}
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
