// Bank Reconciliation Report — pure maths, no supabase. One report per
// session (bank + month): the classic statement walking the bank's closing
// balance to the GL balance via reconciling items.
//
// Identity (verified live to the sen on Apr, May and open Jun 2026, HLB):
//   GL(month-end) = statement_closing
//                 + Σ outstanding book lines (dated ≤ month-end, unclaimed OR
//                   claimed by a LATER month's session — see as-at rule)
//                 − Σ statement items not in books (unmatched or ignored lines;
//                   'contra' lines cancel each other on the statement and are
//                   left out, the way book-side contra groups are
//                   of this bank's sessions up to this month)
//
// As-at rule: a book line claimed by a session whose month is AFTER the report
// month was still un-presented at this month-end — it stays on this month's
// report forever (May's BIG MATRIX lines remain May outstanding even after the
// user matches them inside June's session), so a finished month never drifts.
//
// Pre-baseline history (before the bank's first recon session) is absorbed by
// the first statement's opening balance (proven live: Apr opening 26,422.51 =
// Σ pre-Apr unclaimed exactly) — the report never lists legacy lines (user
// 2026-08-11: 旧系统已对完，不想再对了).
//
// Contra groups (Σ=0 book-only) are excluded everywhere: a zero-sum set cannot
// move the arithmetic, and the user chose to keep them out of the report.

import dayjs from 'dayjs'

const r2 = (n: number) => Math.round(n * 100) / 100

export type ReportBookLine = {
  id: string
  date: string // YYYY-MM-DD
  entryNo: string
  description: string
  /** Signed on the bank GL: debit +, credit −. */
  amount: number
  /** period_month (YYYY-MM-01) of the session whose match claimed this line;
   *  null = never claimed. */
  claimedByMonth: string | null
  /** Part of a book-only contra group (statement_line_id NULL claim). */
  contra: boolean
}

export type ReportStatementLine = {
  id: string
  date: string
  description: string
  /** Signed: deposit +, withdrawal −. */
  amount: number
  matchKind: 'auto' | 'manual' | 'ignored' | 'contra' | null
}

export type ReconReportItem = {
  date: string
  ref: string
  description: string
  amount: number
  ignored?: boolean
}

export type ReconReportModel = {
  periodMonth: string
  monthEnd: string
  statementOpening: number | null
  statementClosing: number | null
  glClosing: number
  outstandingReceipts: ReconReportItem[]
  outstandingPayments: ReconReportItem[]
  stmtReceiptsNotInBooks: ReconReportItem[]
  stmtPaymentsNotInBooks: ReconReportItem[]
  sums: {
    bookReceipts: number
    bookPayments: number
    stmtReceipts: number
    stmtPayments: number
  }
  /** statement_closing + book items − statement items; null without a closing
   *  balance (Excel/CSV uploads that carried none). */
  adjustedBank: number | null
  /** adjustedBank − glClosing */
  diff: number | null
  tie: boolean
}

/** Book-window start for a session's matching page: the −10d buffer, extended
 *  back to the bank's FIRST recon month so earlier months' unpresented lines
 *  stay matchable (user 2026-08-11: June must show May's in-transit items) —
 *  while everything before the recon era stays out. */
export function windowStart(periodMonth: string, firstSessionMonth: string | null): string {
  const buffer = dayjs(periodMonth).subtract(10, 'day')
  if (!firstSessionMonth) return buffer.format('YYYY-MM-DD')
  const baseline = dayjs(firstSessionMonth)
  return (baseline.isBefore(buffer) ? baseline : buffer).format('YYYY-MM-DD')
}

const byDateThenRef = (a: ReconReportItem, b: ReconReportItem) =>
  a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref)

export function buildReconReport(args: {
  periodMonth: string
  statementOpening: number | null
  statementClosing: number | null
  glClosing: number
  /** Dated [baseline .. month-end] on this bank's GL code, internal flips
   *  already excluded, zero amounts dropped. */
  bookLines: ReportBookLine[]
  /** Lines of THIS bank's sessions with period_month ≤ this month only. */
  statementLines: ReportStatementLine[]
}): ReconReportModel {
  const monthEnd = dayjs(args.periodMonth).endOf('month').format('YYYY-MM-DD')

  const outstanding = args.bookLines
    .filter(l => !l.contra && l.date <= monthEnd && l.amount !== 0)
    .filter(l => l.claimedByMonth === null || l.claimedByMonth > args.periodMonth)
    .map(l => ({ date: l.date, ref: l.entryNo, description: l.description, amount: l.amount }))
    .sort(byDateThenRef)
  const outstandingReceipts = outstanding.filter(i => i.amount > 0)
  const outstandingPayments = outstanding.filter(i => i.amount < 0)

  const stmtItems = args.statementLines
    .filter(l => (l.matchKind === null || l.matchKind === 'ignored') && l.amount !== 0)
    .map(l => ({
      date: l.date,
      ref: '',
      description: l.description,
      amount: l.amount,
      ...(l.matchKind === 'ignored' ? { ignored: true } : {}),
    }))
    .sort(byDateThenRef)
  const stmtReceiptsNotInBooks = stmtItems.filter(i => i.amount > 0)
  const stmtPaymentsNotInBooks = stmtItems.filter(i => i.amount < 0)

  const sum = (items: ReconReportItem[]) => r2(items.reduce((s, i) => s + i.amount, 0))
  const sums = {
    bookReceipts: sum(outstandingReceipts),
    bookPayments: sum(outstandingPayments),
    stmtReceipts: sum(stmtReceiptsNotInBooks),
    stmtPayments: sum(stmtPaymentsNotInBooks),
  }

  const adjustedBank =
    args.statementClosing == null
      ? null
      : r2(args.statementClosing + sums.bookReceipts + sums.bookPayments - sums.stmtReceipts - sums.stmtPayments)
  const diff = adjustedBank == null ? null : r2(adjustedBank - args.glClosing)
  const tie = diff !== null && Math.abs(diff) < 0.005

  return {
    periodMonth: args.periodMonth,
    monthEnd,
    statementOpening: args.statementOpening,
    statementClosing: args.statementClosing,
    glClosing: args.glClosing,
    outstandingReceipts,
    outstandingPayments,
    stmtReceiptsNotInBooks,
    stmtPaymentsNotInBooks,
    sums,
    adjustedBank,
    diff,
    tie,
  }
}
