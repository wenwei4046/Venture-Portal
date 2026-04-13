'use client'

import { useState, useTransition } from 'react'
import { verifyDirectorPin } from '@/app/(portal)/director-salary/pin-actions'

interface Props {
  children: React.ReactNode
  verified: boolean
}

export default function DirectorPinGate({ children, verified }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [unlocked, setUnlocked] = useState(verified)
  const [pin, setPin] = useState('')

  if (unlocked) return <>{children}</>

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const formData = new FormData()
      formData.append('pin', pin)
      const result = await verifyDirectorPin(formData)
      if (result.ok) {
        setUnlocked(true)
      } else {
        setError(result.error ?? 'Verification failed')
        setPin('')
      }
    })
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-surface border border-hairline rounded-md p-10 max-w-sm w-full text-center">
        <div className="font-serif text-2xl text-ink mb-2">Director Access</div>
        <p className="font-serif italic text-graphite text-sm mb-6">
          Enter your 6-digit PIN to continue.
        </p>

        {error ? (
          <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-4 text-sm font-sans">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            pattern="\d{6}"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="• • • • • •"
            autoFocus
            className="w-full text-center text-2xl tracking-[0.5em] px-4 py-3 bg-paper border border-hairline rounded-md font-mono text-ink focus:outline-none focus:border-accent-border"
          />
          <button
            type="submit"
            disabled={isPending || pin.length !== 6}
            className="w-full bg-accent hover:bg-accent-hover text-white font-serif italic text-sm py-2.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Verifying…' : 'Unlock'}
          </button>
        </form>

        <p className="text-xs text-muted mt-4 font-sans">
          PIN managed by Principal via Settings &gt; Directors
        </p>
      </div>
    </div>
  )
}
