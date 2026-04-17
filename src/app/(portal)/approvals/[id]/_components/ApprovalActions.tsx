'use client'

import { useState, useTransition } from 'react'
import type { ApprovalRequestType } from '@/types'
import { approveRequest, rejectRequest } from '../../actions'

interface Props {
  approvalId: string
  requestType: ApprovalRequestType
}

// Per-request-type dialog copy. Each entry is the lead clause — the common
// suffix ("and records your decision in the audit trail" / "A written reason
// is required") is appended in the JSX below. Record<> enforces exhaustiveness
// so new enum values can't sneak past the type checker.
const APPROVE_LEAD: Record<ApprovalRequestType, string> = {
  new_loan: 'Approving activates the loan',
  new_contract: 'Approving stamps the service contract as approved',
  contract_change: 'Approving applies the contract change',
  dept_expense: 'Approving posts the expense to the department pool',
  advance: 'Approving releases the director advance',
  base_rate: 'Approving applies the new base rate',
  tier_change: 'Approving applies the tier change',
  escalation: 'Approving acknowledges the escalation',
  invoice_pool_release: 'Approving releases the invoice pool funds',
  profit_withdrawal: 'Approving authorises the profit withdrawal',
  payment_voucher: 'Approving authorises the payment for execution',
  new_fund_source: 'Approving activates the fund source and credits the Venture Pool',
  hr_costing: 'Approving locks in the HR costing snapshot for Finance to execute',
  payroll_run: 'Approving pays out the monthly payroll to every employee and director',
}

const REJECT_LEAD: Record<ApprovalRequestType, string> = {
  new_loan: 'Rejecting cancels the loan',
  new_contract: 'Rejecting cancels the contract',
  contract_change: 'Rejecting keeps the contract as-is',
  dept_expense: 'Rejecting discards the expense — the pool is unchanged',
  advance: 'Rejecting cancels the advance request',
  base_rate: 'Rejecting keeps the current base rate',
  tier_change: 'Rejecting keeps the current tier',
  escalation: 'Rejecting dismisses the escalation',
  invoice_pool_release: 'Rejecting keeps the funds in the invoice pool',
  profit_withdrawal: 'Rejecting denies the withdrawal',
  payment_voucher: 'Rejecting cancels the payment — no funds will be transferred',
  new_fund_source: 'Rejecting cancels the fund source — no capital will be posted',
  hr_costing: 'Rejecting keeps the HR snapshot as-is and blocks execution',
  payroll_run: 'Rejecting sends the payroll back to HR as draft — no one gets paid',
}

export default function ApprovalActions({ approvalId, requestType }: Props) {
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<'idle' | 'approving' | 'rejecting'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')

  async function handleConfirm() {
    if (mode === 'idle') return
    setError(null)

    const formData = new FormData()
    formData.append('id', approvalId)
    formData.append('notes', notes)

    startTransition(async () => {
      try {
        if (mode === 'approving') {
          await approveRequest(formData)
        } else {
          await rejectRequest(formData)
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) {
          throw err
        }
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  if (mode === 'idle') {
    return (
      <div className="flex items-center gap-3 max-w-3xl">
        <button
          type="button"
          onClick={() => setMode('approving')}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-base px-5 py-2.5 rounded-md transition-colors"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => setMode('rejecting')}
          className="border border-hairline text-graphite hover:text-danger hover:border-danger font-sans text-sm px-4 py-2.5 rounded-md transition-colors"
        >
          Reject
        </button>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-hairline rounded-md p-6 max-w-3xl">
      <h3 className="font-serif text-lg text-ink mb-2">
        {mode === 'approving' ? 'Confirm approval' : 'Reject with reason'}
      </h3>
      <p className="font-serif italic text-graphite text-sm mb-4">
        {mode === 'approving' ? (
          <>
            {APPROVE_LEAD[requestType]} and records your decision in the audit
            trail. <em>This cannot be undone.</em>
          </>
        ) : (
          <>
            {REJECT_LEAD[requestType]}. A written reason is <em>required</em>.
          </>
        )}
      </p>

      <div className="mb-4">
        <label
          htmlFor="notes"
          className="block text-sm font-sans font-medium text-graphite mb-1.5"
        >
          {mode === 'approving' ? (
            <>
              Notes <span className="text-muted font-normal">(optional)</span>
            </>
          ) : (
            <>Reason (required)</>
          )}
        </label>
        <textarea
          id="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          required={mode === 'rejecting'}
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
          placeholder={
            mode === 'approving'
              ? 'Any context for the audit trail'
              : 'Why is this being rejected?'
          }
        />
      </div>

      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-4 text-sm font-sans">
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isPending || (mode === 'rejecting' && !notes.trim())}
          className={
            mode === 'approving'
              ? 'bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
              : 'bg-danger hover:opacity-90 text-white font-serif italic text-sm px-5 py-2 rounded-md transition-opacity disabled:opacity-50 disabled:cursor-not-allowed'
          }
        >
          {isPending
            ? 'Submitting…'
            : mode === 'approving'
              ? 'Yes, approve'
              : 'Yes, reject'}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('idle')
            setNotes('')
            setError(null)
          }}
          className="text-sm text-graphite hover:text-ink font-sans transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
