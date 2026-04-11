'use client'

import { useEffect } from 'react'
import Link from 'next/link'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
}

export default function PortalError({ error, reset }: Props) {
  useEffect(() => {
    // Log to console for dev — in production this would flow to telemetry.
    console.error('[portal error boundary]', error)
  }, [error])

  return (
    <div className="py-20 max-w-xl">
      <div className="font-serif italic text-accent text-base mb-2">
        Something went wrong.
      </div>
      <h1 className="font-serif text-3xl text-ink mb-3">
        This page didn&apos;t load.
      </h1>
      <p className="font-serif italic text-graphite text-base mb-6">
        The ledger is fine. A single page hit a snag and stopped short of
        drawing the last stroke. Try again, or head back to the dashboard.
      </p>

      {error.digest ? (
        <p className="font-mono text-xs text-muted mb-8">
          Reference · <span className="text-graphite">{error.digest}</span>
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          onClick={reset}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="font-serif italic text-sm text-graphite hover:text-ink transition-colors px-3 py-2"
        >
          ← Back to dashboard
        </Link>
      </div>
    </div>
  )
}
