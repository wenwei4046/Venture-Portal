'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { generateAllocatorInvoices, type GenerateResult } from '../actions'
import { unwrap } from './unwrap'

// The handoff's "Generate invoices" (2026-10-10) on an unbilled record's own
// page. One draft invoice per company for every unbilled allocation of the
// month; the month's billed batches are never touched. What it made, and what
// it skipped, shows under it. (The hub has its own since 2026-10-14 — the
// design's head and drawer, asked first.)

export default function AllocGenerateButton({ period }: { period: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function generate() {
    setError(null)
    setResult(null)
    startTransition(async () => {
      try {
        setResult(unwrap(await generateAllocatorInvoices(period)))
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Generate failed')
      }
    })
  }

  return (
    <div className="bil-gen">
      <button type="button" className="bil-btn primary" onClick={generate} disabled={isPending}>
        {isPending ? 'Generating…' : 'Generate invoices'}
      </button>
      {result ? (
        <div className="bil-gen-result" role="status">
          {result.created.map((c) => (
            <div key={c.company} className="text-ledger">
              ✓ {c.company} → {c.invoiceNo}
            </div>
          ))}
          {result.skipped.map((s) => (
            <div key={s.company} className="text-muted">
              – {s.company} skipped: already has {s.reason}
            </div>
          ))}
          {result.created.length === 0 && result.skipped.length === 0 ? <div className="text-muted">Nothing to bill.</div> : null}
          <button type="button" onClick={() => setResult(null)} className="text-xs text-muted hover:text-ink">
            Dismiss
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="bil-gen-result text-danger" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  )
}
