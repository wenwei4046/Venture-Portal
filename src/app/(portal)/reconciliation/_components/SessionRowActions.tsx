'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { RowMenuItem } from '@/components/RowMenu'
import { deleteSession, setSessionStatus } from '../actions'

// What a monthly reconciliation can do besides opening it: its report, Mark
// done / Reopen, Delete. 2026-10-10 — the handoff: the row keeps its one
// button (Continue / Open) and these move to its right-click menu (on a
// phone, the opened row's 更多 ⋯). A refusal is now said, not swallowed.

export function useSessionRowActions(): {
  items: (s: { id: string; status: string }) => RowMenuItem[]
  error: string | null
} {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run(fn: () => Promise<{ error?: string } | void>) {
    setError(null)
    startTransition(async () => {
      try {
        const r = await fn()
        if (r && r.error) {
          setError(r.error)
          return
        }
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Action failed')
      }
    })
  }

  const items = (s: { id: string; status: string }): RowMenuItem[] => [
    { key: 'report', label: 'Report', hint: 'matched and open items', onSelect: () => router.push(`/reconciliation/${s.id}/report`) },
    {
      key: 'status',
      label: s.status === 'done' ? 'Reopen' : 'Mark done',
      disabled: isPending,
      onSelect: () => run(() => setSessionStatus(s.id, s.status === 'done' ? 'open' : 'done')),
    },
    {
      key: 'delete',
      label: 'Delete',
      hint: 'statement lines and matches',
      danger: true,
      disabled: isPending,
      onSelect: () => {
        if (!window.confirm('Delete this reconciliation (statement lines and matches)?')) return
        run(() => deleteSession(s.id))
      },
    },
  ]

  return { items, error }
}
