'use client'

import { useState, useTransition } from 'react'
import { officeToday } from '@/lib/office-time'
import { recordRepayment } from '../actions'
import { formatMoney } from '@/lib/utils'
import type { PaymentType } from '@/types'

interface Props {
  loanId: string
  outstanding: number
}

const PAYMENT_TYPES: { value: PaymentType; label: string }[] = [
  { value: 'interest', label: 'Interest' },
  { value: 'principal', label: 'Principal' },
  { value: 'penalty', label: 'Penalty' },
  { value: 'netting', label: 'Netting' },
]

export default function RepaymentForm({ loanId, outstanding }: Props) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [paymentType, setPaymentType] = useState<PaymentType>('interest')

  const today = officeToday()

  async function handleSubmit(formData: FormData) {
    setMessage(null)
    startTransition(async () => {
      try {
        await recordRepayment(formData)
        setMessage({ type: 'success', text: 'Repayment recorded.' })
        // Reset form
        const form = document.getElementById('repayment-form') as HTMLFormElement
        if (form) form.reset()
      } catch (err) {
        setMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    })
  }

  return (
    <form
      id="repayment-form"
      action={handleSubmit}
      className="bg-surface border border-hairline rounded-md p-6 max-w-3xl"
    >
      <input type="hidden" name="loan_id" value={loanId} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        {/* Payment type */}
        <div>
          <label
            htmlFor="payment_type"
            className="block text-sm font-sans font-medium text-graphite mb-1.5"
          >
            Type
          </label>
          <select
            id="payment_type"
            name="payment_type"
            value={paymentType}
            onChange={(e) => setPaymentType(e.target.value as PaymentType)}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          >
            {PAYMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Amount */}
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
              max={paymentType === 'principal' ? outstanding : undefined}
              required
              className="w-full pl-10 pr-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border"
              placeholder="0.00"
            />
          </div>
          {paymentType === 'principal' ? (
            <p className="font-serif italic text-muted text-xs mt-1.5">
              Max: {formatMoney(outstanding)} (current outstanding)
            </p>
          ) : null}
        </div>

        {/* Payment date */}
        <div>
          <label
            htmlFor="payment_date"
            className="block text-sm font-sans font-medium text-graphite mb-1.5"
          >
            Payment date
          </label>
          <input
            id="payment_date"
            name="payment_date"
            type="date"
            required
            defaultValue={today}
            max={today}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
      </div>

      <div className="mb-4">
        <label
          htmlFor="notes"
          className="block text-sm font-sans font-medium text-graphite mb-1.5"
        >
          Notes <span className="text-muted font-normal">(optional)</span>
        </label>
        <input
          id="notes"
          name="notes"
          type="text"
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
          placeholder="Bank transfer reference, statement period, etc."
        />
      </div>

      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Recording…' : 'Record repayment'}
        </button>
        {message ? (
          <span
            className={
              message.type === 'success'
                ? 'text-sm font-serif italic text-ledger'
                : 'text-sm font-serif italic text-danger'
            }
            role="status"
          >
            {message.text}
          </span>
        ) : null}
      </div>
    </form>
  )
}
