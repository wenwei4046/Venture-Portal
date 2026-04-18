'use client'

import { useState, useTransition } from 'react'

interface Props {
  voucherId: string
  status: string
  amount: number
  bankBalance: number | null
  bankName: string | null
  isPrincipal: boolean
  isFinance: boolean
  submitForApproval: (formData: FormData) => Promise<void>
  approveVoucher: (formData: FormData) => Promise<void>
  voidVoucher: (formData: FormData) => Promise<void>
}

export default function VoucherActions({
  voucherId,
  status,
  amount,
  bankBalance,
  bankName,
  isPrincipal,
  isFinance,
  submitForApproval,
  approveVoucher,
  voidVoucher,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [confirmAction, setConfirmAction] = useState<'approve' | null>(null)
  const [notes, setNotes] = useState('')

  async function handleAction(action: (fd: FormData) => Promise<void>, extraFields?: Record<string, string>) {
    setMessage(null)
    const fd = new FormData()
    fd.set('id', voucherId)
    if (extraFields) {
      Object.entries(extraFields).forEach(([k, v]) => fd.set(k, v))
    }
    startTransition(async () => {
      try {
        await action(fd)
        setMessage({ type: 'success', text: 'Done.' })
        setConfirmAction(null)
      } catch (err) {
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err
        setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Unknown error' })
      }
    })
  }

  // Status-driven rendering
  if (status === 'paid' || status === 'voided') {
    return (
      <div className="bg-surface border border-hairline rounded-md p-4 max-w-3xl">
        <p className="font-serif italic text-graphite text-sm">
          This voucher has been <em className={status === 'paid' ? 'text-ledger' : 'text-danger'}>{status}</em>.
          No further actions available.
        </p>
      </div>
    )
  }

  return (
    <section className="border-t border-hairline pt-8 max-w-3xl">
      <h2 className="font-serif text-xl text-ink mb-4">Actions</h2>

      {/* Draft: Finance can submit or void */}
      {status === 'draft' && isFinance ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleAction(submitForApproval)}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50"
          >
            {isPending ? 'Submitting…' : 'Submit for approval'}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleAction(voidVoucher)}
            className="text-sm text-muted hover:text-danger font-sans transition-colors px-2"
          >
            Void
          </button>
        </div>
      ) : null}

      {/* Pending: Principal can approve; Finance can void */}
      {status === 'pending_approval' ? (
        <>
          {isPrincipal && !confirmAction ? (
            <div>
              {/* Bank balance info for Principal */}
              {bankBalance !== null && bankName ? (
                <div className={`mb-4 p-3 rounded-md text-sm ${bankBalance < amount ? 'bg-danger-bg border border-danger' : 'bg-surface border border-hairline'}`}>
                  <span className="font-serif text-graphite">{bankName} balance: </span>
                  <span className={`font-mono tabular font-medium ${bankBalance < amount ? 'text-danger' : 'text-ledger'}`}>
                    RM {bankBalance.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                  </span>
                  {bankBalance < amount ? (
                    <span className="font-serif italic text-danger ml-2">
                      — insufficient for RM {amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} payment
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={bankBalance !== null && bankBalance < amount}
                  onClick={() => setConfirmAction('approve')}
                  className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bankBalance !== null && bankBalance < amount ? 'Insufficient balance' : 'Approve'}
                </button>
              </div>
            </div>
          ) : null}

          {isPrincipal && confirmAction === 'approve' ? (
            <div className="bg-surface border border-hairline rounded-md p-6">
              <h3 className="font-serif text-lg text-ink mb-2">Confirm approval</h3>
              <p className="font-serif italic text-graphite text-sm mb-4">
                Approving <em>pays this voucher immediately</em> — bank balance, Dept Pool,
                and GL journal all update in the same step. <em>This cannot be undone.</em>
              </p>
              <div className="mb-4">
                <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
                  Notes <span className="text-muted font-normal">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
                  placeholder="Any context for the audit trail"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleAction(approveVoucher, { notes })}
                  className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50"
                >
                  {isPending ? 'Approving & paying…' : 'Approve & Pay'}
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirmAction(null); setNotes('') }}
                  className="text-sm text-graphite hover:text-ink font-sans transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {isFinance && !isPrincipal ? (
            <div>
              <div className="bg-surface border border-hairline rounded-md p-4 mb-3">
                <p className="font-serif italic text-graphite text-sm">
                  Awaiting Principal approval. <em>You can track the status here.</em>
                </p>
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleAction(voidVoucher)}
                className="text-sm text-muted hover:text-danger font-sans transition-colors px-2"
              >
                Void this voucher
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {/* Message */}
      {message ? (
        <div className={`mt-4 text-sm font-serif italic ${message.type === 'success' ? 'text-ledger' : 'text-danger'}`}>
          {message.text}
        </div>
      ) : null}
    </section>
  )
}
