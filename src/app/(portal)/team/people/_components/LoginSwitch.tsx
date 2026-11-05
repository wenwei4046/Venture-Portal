'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { btn } from '@/components/hrv/kit'
import { setLoginEnabled } from '../login-actions'

// Disable / enable a login on the person's page (2026-11-05 — the user: People › Deactivate left the person able to sign
// in, "这个需要"). Turning one off asks first; turning it back on does not. A login this viewer may not touch — a
// full-access one, for HR — shows why instead of the button. The database asks every rule again (account_set_login).

export default function LoginSwitch({
  userId,
  enabled,
  held,
  className,
}: {
  userId: string
  enabled: boolean
  /** Why this viewer may not turn it off or on (a full-access login); null when they may. */
  held: string | null
  className?: string
}) {
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()

  const send = (on: boolean) => {
    setError(null)
    start(async () => {
      const r = await setLoginEnabled(userId, on)
      if (!r.ok) {
        setError(r.reason)
        return
      }
      setAsking(false)
      router.refresh()
    })
  }

  if (held) {
    return (
      <button type="button" className={`${btn('outline')} ${className ?? ''}`} disabled title={held}>
        {enabled ? 'Disable login' : 'Enable login'}
      </button>
    )
  }
  return (
    <>
      {!enabled ? (
        <button type="button" className={`${btn('primary')} ${className ?? ''}`} onClick={() => send(true)} disabled={busy}>
          {busy ? 'Enabling…' : 'Enable login'}
        </button>
      ) : asking ? (
        <>
          <button type="button" className={`${btn('dangerSolid')} ${className ?? ''}`} onClick={() => send(false)} disabled={busy}>
            {busy ? 'Disabling…' : 'Confirm — disable login'}
          </button>
          <button type="button" className={`${btn('outline')} ${className ?? ''}`} onClick={() => setAsking(false)} disabled={busy}>
            Cancel
          </button>
        </>
      ) : (
        <button type="button" className={`${btn('danger')} ${className ?? ''}`} onClick={() => setAsking(true)}>
          Disable login
        </button>
      )}
      {asking && !error ? <p className="text-xs text-graphite mt-1 mb-0">They are signed out on their next click and cannot sign in until it is enabled again.</p> : null}
      {error ? <p className="sheet-danger text-xs mt-1 mb-0">{error}</p> : null}
    </>
  )
}
