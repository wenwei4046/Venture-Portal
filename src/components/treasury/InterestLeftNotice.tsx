'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { DialogConfirm, FinDialog } from '@/components/finv/Dialog'
import { setLoanInterestWaived } from '@/app/(portal)/fund-out/actions'
import { setFundSourceInterestWaived } from '@/app/(portal)/fund-in/actions'
import { formatMoneyBare } from '@/lib/utils'
import c from './terms-request.module.css'

// A repaid deal with interest left unpaid (2026-11-27 — the user: CONTS's 10,000, its principal in and its 1,600.04
// interest not, "要收"; the deals settled some other way, "schedule 也别显示还欠" · "完全不显示"): over its schedule,
// still owed — the amount, and Waive the rest for Treasury · Edit; waived — said so, with Undo. Display only.

export default function InterestLeftNotice({
  kind,
  dealId,
  owed,
  waived,
  canEdit,
}: {
  kind: 'loan' | 'fund_source'
  dealId: string
  /** What its plan leaves unpaid. */
  owed: number
  waived: boolean
  canEdit: boolean
}) {
  const router = useRouter()
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const money = `RM ${formatMoneyBare(owed)}`
  const collect = kind === 'loan'

  const close = () => {
    if (busy) return
    setAsk(false)
    setError(null)
  }
  const save = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await (kind === 'loan' ? setLoanInterestWaived : setFundSourceInterestWaived)(dealId, !waived)
      if (res?.error) {
        setError(res.error)
        return
      }
      setAsk(false)
      flash(waived ? `${money} interest is owed again` : `${money} interest waived — the schedule shows it settled`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className={`${c.notice} ${c.flush}`} data-tone={waived ? 'ledger' : 'danger'} role="status">
        <div className={c.text}>
          <div className={c.title}>
            {waived ? `Repaid · ${money} interest waived` : `Principal repaid · ${money} interest still ${collect ? 'to collect' : 'to pay'}`}
          </div>
          <div className={c.meta}>
            {waived
              ? 'The interest left unpaid when it was repaid is not shown as owed. Display only — no journal.'
              : `It shows as owed here, on the Repayment Schedule and By company until it is ${collect ? 'received' : 'paid'} or waived.`}
          </div>
        </div>
        {canEdit ? (
          <div className={c.acts}>
            <button type="button" className={c.btn} onClick={() => setAsk(true)}>
              {waived ? 'Undo waive' : 'Waive the rest'}
            </button>
          </div>
        ) : null}
      </div>

      <FinDialog open={ask} onClose={close} locked={busy} title={waived ? 'Owe the interest again?' : `Waive ${money} interest?`}>
        <DialogConfirm
          text={
            waived
              ? `${money} shows as owed again, here and on the Repayment Schedule.`
              : `The ${money} left unpaid is no longer shown as owed — the schedule reads settled. Nothing is posted; Undo waive brings it back.`
          }
          confirmLabel={busy ? 'Working…' : waived ? 'Owe it again' : 'Waive'}
          danger={!waived}
          busy={busy}
          error={error}
          onCancel={close}
          onConfirm={() => void save()}
        />
      </FinDialog>
    </>
  )
}
