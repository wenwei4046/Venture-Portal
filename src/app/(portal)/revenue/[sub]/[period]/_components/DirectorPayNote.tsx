import { directorIncentiveEarned } from '@/lib/commission/director-pay'
import type { DirectorTerms, Statement } from '@/lib/commission/types'
import { formatMoney } from '@/lib/utils'
import s from './commission-workbench.module.css'

interface Props {
  terms: DirectorTerms
  /** Their live statement; null before anything is computed. */
  statement: Statement | null
  /** The month's Commissionable value (Comm Cal's card), or null when it was not read. */
  monthValue: number | null
  /** "September 2026". */
  monthLabel: string
}

/**
 * What a Revenue Director is paid this month beside their own bills
 * (Rules › Directors, 2026-09-27): the fixed amount, and the incentive with
 * whether the month's Commissionable value has reached its threshold — the
 * same card figure the engine judged.
 */
export default function DirectorPayNote({ terms, statement, monthValue, monthLabel }: Props) {
  const threshold = terms.salesThreshold
  const hasIncentive = terms.incentiveAmount > 0 && threshold !== null && threshold > 0
  const earned = hasIncentive && directorIncentiveEarned(terms, monthValue)
  const paid = (statement?.directorFixed ?? 0) + (statement?.directorIncentive ?? 0)
  return (
    <p className={s.notice} role="note" aria-label="Director pay">
      <strong>Director pay · {monthLabel} · {formatMoney(paid)}</strong>
      {terms.fixedAmount > 0 && <> Fixed amount {formatMoney(terms.fixedAmount)}.</>}
      {hasIncentive && (
        <>
          {' '}Incentive {formatMoney(terms.incentiveAmount)} once the month&apos;s Commissionable value reaches {formatMoney(threshold)}:{' '}
          {monthValue === null
            ? 'the month figure was not read.'
            : earned
              ? <>reached — {formatMoney(monthValue)}.</>
              : <>not yet — {formatMoney(monthValue)}, {formatMoney(threshold - monthValue)} to go.</>}
        </>
      )}
    </p>
  )
}
