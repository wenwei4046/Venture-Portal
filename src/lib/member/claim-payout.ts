/**
 * Where an approved member claim's money comes from (2026-10-08).
 *
 * HR decides a Revenue member's claim ONCE, in Member Services, and picks one of
 * two ways to pay it (user: "Add on 进他的 payroll 里面 … 变成 request payment"):
 *
 *   payroll   a Special claim pay line in the member's Revenue payroll — the
 *             month the claim was sent, or the next month still open for them
 *             (`member_claim_payroll_month`); paid with the salary.
 *   payment   a payment request to Finance, who raise the voucher on Payments ›
 *             Claim requests; the Principal approves it like any other.
 *
 * `member_request_json` carries it as `payout`; this file reads it and says it
 * in words, for HR's queue and the member's own request page alike. Pure.
 */

import { formatIntlDate } from '@/lib/utils'

export type ClaimPayoutRoute = 'payroll' | 'payment'

export interface ClaimPayout {
  route: ClaimPayoutRoute
  /** The first of the month the pay line went into; null for a payment. */
  payrollMonth: string | null
  /** The voucher Finance raised, once they have. */
  voucherNo: string | null
  voucherStatus: string | null
}

/** The `payout` of a request as the database sends it, or null when there is none. */
export function readClaimPayout(raw: unknown): ClaimPayout | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.route !== 'payroll' && r.route !== 'payment') return null
  const text = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null)
  return {
    route: r.route,
    payrollMonth: text(r.payrollMonth),
    voucherNo: text(r.voucherNo),
    voucherStatus: text(r.voucherStatus),
  }
}

/** "Oct 2026" — a month is three letters (DESIGN.md › Date format). */
export function payrollMonthLabel(month: string): string {
  return formatIntlDate(new Date(`${month.slice(0, 10)}T00:00:00Z`), { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/**
 * One line on where the money is, for the claim's status as it stands.
 * `viewer` = who reads it: HR in Member Services, or the member themselves.
 */
export function claimPayoutLine(payout: ClaimPayout | null, status: string, viewer: 'hr' | 'member'): string | null {
  if (!payout) return null
  if (payout.route === 'payroll') {
    const month = payout.payrollMonth ? payrollMonthLabel(payout.payrollMonth) : null
    if (status === 'paid') return month ? `Paid with the ${month} salary` : 'Paid with the salary'
    if (viewer === 'member') return month ? `Comes with your ${month} salary` : 'Comes with your salary'
    return month ? `Added to the ${month} payroll as a special claim` : 'Added to the payroll as a special claim'
  }
  if (status === 'paid') return payout.voucherNo ? `Paid by ${payout.voucherNo}` : 'Paid'
  if (payout.voucherNo) return `${payout.voucherNo} is waiting for approval`
  return viewer === 'member' ? 'Finance is arranging the payment' : 'Payment requested — waiting for Finance'
}
