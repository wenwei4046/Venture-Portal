'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FinDrawer, drawerStyles as d } from '@/components/finv/Drawer'
import { fd } from '@/components/finv/DrawerParts'
import { openVoucherDrawer, type DrawerRefusal } from '../drawer-actions'
import type { VoucherDetail } from '../_lib/voucher-detail'
import { useVoucherSteps } from './voucher-steps'
import { REFUSED } from '../_lib/voucher-refusals'
import { VoucherDetailBody } from './VoucherDetailBody'

// A voucher in the hub's drawer (2026-10-14, the Finance revamp v2 — D05 of
// `.design/fin-r2/handoff`): the dark hero, the numbered groups, the files and
// the trail (VoucherDetailBody — the phone app's voucher screen draws the
// same), and at its foot what this reader may do in the state it is in
// (voucher-steps.tsx — the system's own steps, each confirmed where it cannot
// be undone).

export { fd }
export { STATUS_WORDS, LIGHT, sizeOf, stamp } from './VoucherDetailBody'
export { REFUSED }

const REFUSED_WORDS: Record<DrawerRefusal, string> = REFUSED

export function VoucherDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const router = useRouter()
  const [detail, setDetail] = useState<VoucherDetail | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [shownId, setShownId] = useState<string | null>(id)

  const load = useCallback((voucherId: string) => {
    void openVoucherDrawer(voucherId).then(
      (res) => {
        if (res.ok) {
          setDetail(res.detail)
          setRefused(null)
        } else {
          setDetail(null)
          setRefused(REFUSED_WORDS[res.reason])
        }
      },
      () => {
        setDetail(null)
        setRefused('This voucher could not be read just now. Try again.')
      },
    )
  }, [])

  useEffect(() => {
    if (!id) return
    setShownId(id)
    setDetail(null)
    setRefused(null)
    load(id)
  }, [id, load])

  const v = detail
  const { steps, busy, error, dialogs, openFile, addFiles } = useVoucherSteps(v, {
    onDone: () => {
      onChanged()
      if (v) load(v.id)
    },
    onFilesChanged: () => {
      if (v) load(v.id)
      router.refresh()
    },
  })
  const title = v ? (v.no ?? 'Draft') : ''

  const bar: ReactNode[] = steps.map((s) =>
    s.href ? (
      <Link key={s.key} href={s.href} className={d.barBtn}>
        {s.label}
      </Link>
    ) : (
      <button
        key={s.key}
        type="button"
        className={d.barBtn}
        data-kind={s.kind === 'secondary' ? undefined : s.kind}
        disabled={busy && s.kind !== 'more'}
        aria-label={s.kind === 'more' ? 'More' : undefined}
        onClick={s.onClick}
      >
        {s.label}
      </button>
    ),
  )

  return (
    <>
      <FinDrawer
        open={!!id}
        onClose={onClose}
        label={title || 'Voucher'}
        title={title || (shownId ? ' ' : '')}
        headActions={
          v ? (
            <>
              {v.credit ? null : (
                <Link href={`/payments/${v.id}`} className={d.headBtn}>
                  View full page ↗
                </Link>
              )}
              <a href={`/payments/voucher-doc?id=${v.id}`} target="_blank" rel="noopener noreferrer" className={d.headBtn}>
                Print
              </a>
            </>
          ) : null
        }
        bar={bar.length > 0 ? bar : null}
      >
        {!v ? (
          <div className={d.loading}>{refused ?? 'Loading…'}</div>
        ) : (
          <VoucherDetailBody v={v} error={error} busy={busy} openFile={openFile} addFiles={addFiles} />
        )}
      </FinDrawer>
      {dialogs}
    </>
  )
}
