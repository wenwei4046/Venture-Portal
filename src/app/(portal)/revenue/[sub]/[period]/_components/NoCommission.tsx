import { formatMoney } from '@/lib/utils'
import s from './commission-workbench.module.css'

/**
 * Two figures on purpose (user 2026-09-26): the bill as the customer pays it,
 * and the part of it that earns. Reading one number for both is how a Kuching
 * bill's transport came to look like RM 13,332 of missing commission.
 */
export const SALES_VALUE_HINT = 'Everything on the bills — transport, disposal and every other charge included'
export const COMMISSIONABLE_HINT = 'The part of the bills that earns commission. Transport, disposal and other service lines are left out.'
/** Not bills: what was added to, or taken off, bills already settled (2026-09-26). */
export const UPSELL_HINT = 'Added to bills already settled — paid this month at the salesperson’s own rate'
export const DROP_HINT = 'Taken off bills already settled — this month’s commission gives it back'
/** A SALES figure, not pay: what promotion is measured on (moved up from the saved-run table, 2026-09-26). */
export const GROUP_SALES_HINT = 'Own sales that earn the rate plus the whole downline’s, counting only bills whose deposit has cleared — what promotion is measured on. The below-margin penalty does not reduce it.'
export const DEPOSIT_HINT = 'The share of the bill the customer must have paid before any of its commission is released'

/** The small line under a Commissionable value: what the bill carries that earns nothing. */
export default function NoCommission({ amount }: { amount: number }) {
  const value = Math.round(amount * 100) / 100
  if (Math.abs(value) < 0.005) return null
  return <small className={s.muted}>{formatMoney(value)} no commission</small>
}
