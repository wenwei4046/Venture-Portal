'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { VoucherDetail } from '../../_lib/voucher-detail'
import { useVoucherSteps } from '../../_components/voucher-steps'
import s from '@/components/finv/full.module.css'

// The full page's dark panel (2026-10-14, the Finance revamp v2 — D06): the
// steps this reader may take now, stacked — the same as the drawer's bar
// (voucher-steps.tsx), the primary in the accent, the rest translucent.

export default function FullPageSteps({ detail }: { detail: VoucherDetail }) {
  const router = useRouter()
  const { steps, busy, error, dialogs } = useVoucherSteps(detail, { onDone: () => router.refresh(), onFilesChanged: () => router.refresh() })
  if (steps.length === 0 && !error) return dialogs
  return (
    <>
      <div className={s.pBar}>
        {steps.map((step) =>
          step.href ? (
            <Link key={step.key} href={step.href} className={s.pBtn}>
              {step.label}
            </Link>
          ) : (
            <button
              key={step.key}
              type="button"
              className={s.pBtn}
              data-kind={step.kind === 'secondary' ? undefined : step.kind}
              disabled={busy && step.kind !== 'more'}
              aria-label={step.kind === 'more' ? 'More' : undefined}
              onClick={step.onClick}
            >
              {step.label}
            </button>
          ),
        )}
      </div>
      {error ? (
        <p className={s.pError} role="alert">
          {error}
        </p>
      ) : null}
      {dialogs}
    </>
  )
}
