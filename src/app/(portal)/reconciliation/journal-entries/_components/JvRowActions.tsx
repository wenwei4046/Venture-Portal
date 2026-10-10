'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { RowMenuItem } from '@/components/RowMenu'
import { deleteJournalVoucher } from '../actions'

// What a voucher of the list can do (user 2026-06-12: Copy / Edit / Delete
// 按钮要放出来). 2026-10-10 — the handoff: they leave the row's Actions column
// for its right-click menu (on a phone, the opened row's 更多 ⋯), under Open /
// Open in new tab. Delete is the reversing delete it always was.

interface Voucher {
  id: string
  entry_no: string | null
  /** The payroll accrual: its Edit is "Fix mistakes", as on its own page. */
  auto?: boolean
}

export function useJvRowActions({
  canCreate = false,
  canEdit = false,
}: {
  /** Reconciliation · Create — Copy raises a new voucher (2026-10-08, PR2). */
  canCreate?: boolean
  /** Reconciliation · Edit — Edit and Delete change this one. */
  canEdit?: boolean
}): { items: (v: Voucher) => RowMenuItem[]; error: string | null; isPending: boolean } {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete(v: Voucher) {
    if (!window.confirm(`Delete ${v.entry_no ?? 'this voucher'}? GL, bank and pool effects are reversed. This cannot be undone.`)) return
    setError(null)
    startTransition(async () => {
      try {
        await deleteJournalVoucher(v.id)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Delete failed')
      }
    })
  }

  const items = (v: Voucher): RowMenuItem[] => {
    const out: RowMenuItem[] = []
    if (canEdit) {
      out.push({
        key: 'edit',
        label: v.auto ? 'Fix mistakes' : 'Edit',
        disabled: isPending,
        onSelect: () => router.push(`/reconciliation/journal-entries/${v.id}/edit`),
      })
    }
    if (canCreate) {
      out.push({
        key: 'copy',
        label: 'Copy',
        hint: 'a new voucher from this one',
        disabled: isPending,
        onSelect: () => router.push(`/reconciliation/journal-entries/new?from=${v.id}`),
      })
    }
    if (canEdit) {
      out.push({ key: 'delete', label: 'Delete', hint: 'reverses it', danger: true, disabled: isPending, onSelect: () => handleDelete(v) })
    }
    return out
  }

  return { items, error, isPending }
}
