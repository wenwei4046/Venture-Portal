import { formatMoney } from '@/lib/utils'
import s from './commission-workbench.module.css'

/**
 * Two figures on purpose (user 2026-09-26): the bill as the customer pays it,
 * and the part of it that earns. Reading one number for both is how a Kuching
 * bill's transport came to look like RM 13,332 of missing commission.
 */
export const SALES_VALUE_HINT = 'Everything on the bills — transport, disposal and every other charge included'
export const COMMISSIONABLE_HINT = 'The part of the bills that earns commission. Transport, disposal and other service lines are left out.'

/** The small line under a Commissionable value: what the bill carries that earns nothing. */
export default function NoCommission({ amount }: { amount: number }) {
  const value = Math.round(amount * 100) / 100
  if (Math.abs(value) < 0.005) return null
  return <small className={s.muted}>{formatMoney(value)} no commission</small>
}
