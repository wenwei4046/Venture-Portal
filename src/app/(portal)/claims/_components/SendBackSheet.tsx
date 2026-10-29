'use client'

import { useEffect, useState, useTransition } from 'react'
import { DialogConfirm, FinDialog, TextArea } from '@/components/finv/Dialog'
import { sendBackRequests } from '@/lib/payment-requests/actions'
import { rmOf, type PaymentRequest } from '@/lib/payment-requests/model'

// Claim & approve's Reject (2026-10-29, PR ③ — the mockup's "Tell KHO WEI JIE what to fix — he can submit it again"):
// back to whoever sent each, with one reason for all of them, read on their Claim page.

export function SendBackSheet({ requests, onClose, onDone }: { requests: PaymentRequest[] | null; onClose: () => void; onDone: (n: number) => void }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()
  useEffect(() => {
    if (!requests) return
    setReason('')
    setError(null)
  }, [requests])
  const close = () => !busy && onClose()
  const one = requests?.length === 1 ? requests[0] : null
  const total = (requests ?? []).reduce((t, r) => t + r.total, 0)
  const confirm = () => {
    if (!requests?.length) return
    if (!reason.trim()) return setError('Say what to fix — they read it to send the request again.')
    setError(null)
    start(async () => {
      try {
        const res = await sendBackRequests(requests.map((r) => r.id), reason)
        if (!res.ok) return setError(res.reason)
        onDone(res.data.sentBack)
      } catch {
        setError('That did not go through. Try again.')
      }
    })
  }
  return (
    <FinDialog
      open={requests !== null}
      onClose={close}
      title={one ? `Send ${one.requestNo ?? 'this request'} back to ${one.requesterName}?` : `Send ${requests?.length ?? 0} requests back?`}
      sub={one ? `${one.description || 'Request'} · ${rmOf(one.total)}` : rmOf(total)}
      locked={busy}
    >
      <DialogConfirm
        text={
          one
            ? `Tell ${one.requesterName} what to fix — they can submit it again.`
            : 'Each goes back to whoever sent it, with this one reason, to fix and submit again.'
        }
        confirmLabel={busy ? 'Sending back…' : one ? `Send back to ${one.requesterName}` : 'Send back'}
        danger
        busy={busy}
        off={!reason.trim()}
        error={error}
        onCancel={close}
        onConfirm={confirm}
      >
        <TextArea
          rows={3}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value)
            if (e.target.value.trim()) setError(null)
          }}
          placeholder="What to fix (required) — they read it"
          aria-label="What to fix"
          maxLength={500}
        />
      </DialogConfirm>
    </FinDialog>
  )
}
