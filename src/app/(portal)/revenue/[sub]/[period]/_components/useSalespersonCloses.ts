'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import type { SalespersonClose } from '@/lib/commission/closes'
import { closeSalespeople, reopenSalespeople } from '../../../close-actions'

/** Somebody the page would close: who, and the figure it is showing for them. */
export interface CloseTarget {
  staffId: string
  name: string
  total: number
}

/**
 * The closes of one month on the page (2026-09-27): who is closed, who is
 * ticked on the list, and the two writes. Shared by the list's bar and the
 * ledger's header, so a close made in either shows in both at once.
 */
export function useSalespersonCloses({ subDepartmentId, period, closes }: {
  subDepartmentId: string
  period: string
  closes: readonly SalespersonClose[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  // Which write is in flight — until the page has refreshed onto its result.
  const [kind, setKind] = useState<'close' | 'reopen'>('close')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set())
  const closedById = useMemo(() => new Map(closes.map(c => [c.staffId, c])), [closes])

  function toggle(staffId: string) {
    setTicked(prev => {
      const next = new Set(prev)
      if (next.has(staffId)) next.delete(staffId)
      else next.add(staffId)
      return next
    })
  }

  function tickAll(staffIds: readonly string[], on: boolean) {
    setTicked(prev => {
      const next = new Set(prev)
      for (const id of staffIds) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  function untick(staffIds: readonly string[]) {
    tickAll(staffIds, false)
  }

  function run(kind: 'close' | 'reopen', write: () => Promise<string>, after?: () => void) {
    setError('')
    setNotice('')
    setKind(kind)
    startTransition(async () => {
      try {
        setNotice(await write())
        after?.()
        router.refresh()
      } catch (err) {
        const text = err instanceof Error ? err.message : 'That did not save'
        if (!text.includes('NEXT_REDIRECT')) setError(text)
      }
    })
  }

  /** Close these people at the figures the page is showing for them. */
  function close(targets: readonly CloseTarget[], after?: () => void) {
    if (targets.length === 0) return
    run('close', async () => {
      const { closed, names } = await closeSalespeople({
        subDepartmentId,
        period,
        people: targets.map(t => ({ staffId: t.staffId, expectedTotal: t.total })),
      })
      untick(targets.map(t => t.staffId))
      const locked = formatMoney(targets.reduce((a, t) => a + t.total, 0))
      return closed === 1 ? `${names[0]} closed — ${locked} locked.` : `${closed} salespeople closed — ${locked} locked.`
    }, after)
  }

  function reopen(targets: readonly Pick<CloseTarget, 'staffId' | 'name'>[], after?: () => void) {
    if (targets.length === 0) return
    run('reopen', async () => {
      const { reopened } = await reopenSalespeople({ subDepartmentId, period, staffIds: targets.map(t => t.staffId) })
      untick(targets.map(t => t.staffId))
      return reopened === 1 && targets.length === 1
        ? `${targets[0].name} reopened — the live figure counts again.`
        : `${reopened} salespeople reopened — their live figures count again.`
    }, after)
  }

  return {
    closedById,
    ticked,
    toggle,
    tickAll,
    clearTicks: () => setTicked(new Set()),
    close,
    reopen,
    busy: pending ? kind : null,
    error,
    notice,
    dismiss: () => { setError(''); setNotice('') },
  }
}

export type SalespersonCloses = ReturnType<typeof useSalespersonCloses>
