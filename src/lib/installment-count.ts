// How many installments a deal runs for, and how many are still owed — for the
// 期数 / 还剩 columns of the two repayment pickers (2026-10-02, user on the fund
// out picker: "可以看到 installment 欠多少 total 多少期? 类似 03/06 期").
//
// Counted in MONEY — principal repaid ÷ one installment — never in "months that
// saw a payment". One payment can cover many installments: HC's 300k was paid 22
// at once, and the month count went on saying "22 of 36 left" beside a balance
// of exactly one installment.
//
// The rules are the Loan Monitor's, so a picker and the monitor cannot disagree:
//   loans         loanMonthlyInstallment(...).remainingPeriods — this module
//   fund sources  remainingPeriods (lib/loan-monitor) — applied where they are
//                 listed, in fund-in/actions listPayableFundSources
//   either, once its terms changed mid-life: the segment in force now, and the
//   principal repaid since that segment began.
// A deal with no fixed term — unscheduled, compounding, or no count at all —
// has no installments to show: null.

import { loanMonthlyInstallment } from '@/lib/treasury-schedule'
import {
  buildTermsSegments,
  currentSegment,
  principalPaidSince,
  segmentRemainingPeriods,
  segmentsGovern,
  type PositionTerms,
} from '@/lib/treasury-terms'

export interface InstallmentCount {
  /** Installments in the terms in force now. */
  total: number
  /** Of those, how many are not yet repaid. */
  remaining: number
}

export function loanInstallmentCount(args: {
  /** From termsForLoan — its `months` is already null for an unscheduled loan. */
  terms: PositionTerms
  /** All-time principal repaid (loan_outstanding.total_principal_paid). */
  principalPaid: number
  /** Principal repaid per 'YYYY-MM'. Only read when the terms changed, so a
   *  caller may leave it empty for a loan whose terms never did. */
  principalByMonth?: Record<string, number>
  currentYM: string
}): InstallmentCount | null {
  const { terms, principalPaid, currentYM } = args
  const byMonth = args.principalByMonth ?? {}
  const segments = buildTermsSegments(terms, byMonth)
  if (segmentsGovern(segments)) {
    const seg = currentSegment(segments, currentYM)
    if (seg.compounding || !seg.months) return null
    return { total: seg.months, remaining: segmentRemainingPeriods(seg, principalPaidSince(byMonth, seg.fromYM)) }
  }
  const months = terms.current.months
  if (terms.current.compounding || !months) return null
  return {
    total: months,
    remaining: loanMonthlyInstallment({
      principal: terms.principal,
      effectiveRate: terms.current.rate,
      tenureMonths: months,
      principalPaid,
    }).remainingPeriods,
  }
}
