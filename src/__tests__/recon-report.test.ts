import { describe, it, expect } from 'vitest'
import {
  buildReconReport,
  windowStart,
  type ReportBookLine,
  type ReportStatementLine,
} from '@/lib/recon-report'

// Live HLB May 2026 numbers: statement closed 81,019.05; three BIG MATRIX
// payments booked 20 May cleared the bank on 1 June; GL at 31 May 79,108.15.
const bigMatrix = (claimedByMonth: string | null): ReportBookLine[] => [
  { id: 'b1', date: '2026-05-20', entryNo: 'PV-000078', description: 'BIG MATRIX [corporate]', amount: -430.43, claimedByMonth, contra: false },
  { id: 'b2', date: '2026-05-20', entryNo: 'PV-000079', description: 'BIG MATRIX', amount: -1067.3, claimedByMonth, contra: false },
  { id: 'b3', date: '2026-05-20', entryNo: 'PV-000078', description: 'BIG MATRIX [marketing]', amount: -413.17, claimedByMonth, contra: false },
]

describe('windowStart', () => {
  it('reaches back to the bank baseline for later months', () => {
    expect(windowStart('2026-06-01', '2026-04-01')).toBe('2026-04-01')
  })
  it('keeps the −10d buffer for the first session (baseline = own month)', () => {
    expect(windowStart('2026-04-01', '2026-04-01')).toBe('2026-03-22')
  })
  it('keeps the −10d buffer when the bank has no session yet', () => {
    expect(windowStart('2026-07-01', null)).toBe('2026-06-21')
  })
})

describe('buildReconReport', () => {
  it('ties a fully matched month with no reconciling items (Apr live numbers)', () => {
    const m = buildReconReport({
      periodMonth: '2026-04-01',
      statementOpening: 26422.51,
      statementClosing: 45890.89,
      glClosing: 45890.89,
      bookLines: [],
      statementLines: [],
    })
    expect(m.adjustedBank).toBe(45890.89)
    expect(m.diff).toBe(0)
    expect(m.tie).toBe(true)
  })

  it('outstanding payments walk the bank balance down to GL (May live numbers)', () => {
    const m = buildReconReport({
      periodMonth: '2026-05-01',
      statementOpening: 45890.89,
      statementClosing: 81019.05,
      glClosing: 79108.15,
      bookLines: bigMatrix(null),
      statementLines: [],
    })
    expect(m.outstandingPayments).toHaveLength(3)
    expect(m.sums.bookPayments).toBe(-1910.9)
    expect(m.adjustedBank).toBe(79108.15)
    expect(m.tie).toBe(true)
  })

  it('as-at: lines claimed by a LATER month stay outstanding on this report', () => {
    const m = buildReconReport({
      periodMonth: '2026-05-01',
      statementOpening: null,
      statementClosing: 81019.05,
      glClosing: 79108.15,
      bookLines: bigMatrix('2026-06-01'),
      statementLines: [],
    })
    expect(m.outstandingPayments).toHaveLength(3)
    expect(m.tie).toBe(true)
  })

  it('as-at: lines claimed by this month (or earlier) are settled', () => {
    const m = buildReconReport({
      periodMonth: '2026-05-01',
      statementOpening: null,
      statementClosing: 81019.05,
      glClosing: 79108.15,
      bookLines: bigMatrix('2026-05-01'),
      statementLines: [],
    })
    expect(m.outstandingPayments).toHaveLength(0)
    expect(m.adjustedBank).toBe(81019.05)
    expect(m.tie).toBe(false)
    expect(m.diff).toBe(1910.9)
  })

  it('holds mid-recon for an open month (June live numbers)', () => {
    const juneBook: ReportBookLine[] = [
      ...bigMatrix(null),
      { id: 'j1', date: '2026-06-25', entryNo: 'JE-202606-0177', description: 'PV 0069 marketing', amount: -1600, claimedByMonth: null, contra: false },
      { id: 'j2', date: '2026-06-25', entryNo: 'JE-202606-0178', description: 'PV 0069 marketing', amount: -527.47, claimedByMonth: null, contra: false },
      { id: 'j3', date: '2026-06-25', entryNo: 'JE-202606-0179', description: 'PV 0069 venture', amount: -3000, claimedByMonth: null, contra: false },
      { id: 'j4', date: '2026-06-29', entryNo: 'JE-202606-0181', description: 'PV 0071 marketing', amount: -160, claimedByMonth: null, contra: false },
    ]
    const juneStmt: ReportStatementLine[] = [
      { id: 's1', date: '2026-06-01', description: 'JomPAY BIG MATRIX', amount: -843.6, matchKind: null },
      { id: 's2', date: '2026-06-01', description: 'JomPAY BIG MATRIX', amount: -1067.3, matchKind: null },
    ]
    const m = buildReconReport({
      periodMonth: '2026-06-01',
      statementOpening: 81019.05,
      statementClosing: 16933.98,
      glClosing: 11646.51,
      bookLines: juneBook,
      statementLines: juneStmt,
    })
    // 16,933.98 − 7,198.37 − (−1,910.90) = 11,646.51
    expect(m.sums.bookPayments).toBe(-7198.37)
    expect(m.sums.stmtPayments).toBe(-1910.9)
    expect(m.adjustedBank).toBe(11646.51)
    expect(m.tie).toBe(true)
  })

  it('contra lines never appear regardless of claim timing', () => {
    const contraPair: ReportBookLine[] = [
      { id: 'c1', date: '2026-05-02', entryNo: 'JE-202605-0115', description: 'fund in', amount: 98000, claimedByMonth: '2026-06-01', contra: true },
      { id: 'c2', date: '2026-05-02', entryNo: 'JE-202605-0116', description: 'loan out', amount: -98000, claimedByMonth: '2026-06-01', contra: true },
    ]
    const m = buildReconReport({
      periodMonth: '2026-05-01',
      statementOpening: null,
      statementClosing: 100,
      glClosing: 100,
      bookLines: contraPair,
      statementLines: [],
    })
    expect(m.outstandingReceipts).toHaveLength(0)
    expect(m.outstandingPayments).toHaveLength(0)
    expect(m.tie).toBe(true)
  })

  it('ignored statement lines are reconciling items and carry the flag', () => {
    const m = buildReconReport({
      periodMonth: '2026-05-01',
      statementOpening: null,
      statementClosing: 100,
      glClosing: 150,
      bookLines: [],
      statementLines: [
        { id: 's1', date: '2026-05-09', description: 'BANK FEE', amount: -50, matchKind: 'ignored' },
      ],
    })
    expect(m.stmtPaymentsNotInBooks).toEqual([
      { date: '2026-05-09', ref: '', description: 'BANK FEE', amount: -50, ignored: true },
    ])
    // 100 − (−50) = 150 → ties: an ignored bank payment explains a higher GL.
    expect(m.adjustedBank).toBe(150)
    expect(m.tie).toBe(true)
  })

  it('splits receipts vs payments on both sides and rounds float sums', () => {
    const m = buildReconReport({
      periodMonth: '2026-05-01',
      statementOpening: null,
      statementClosing: 0,
      glClosing: 0,
      bookLines: [
        { id: 'b1', date: '2026-05-03', entryNo: 'OR-1', description: 'receipt', amount: 0.1, claimedByMonth: null, contra: false },
        { id: 'b2', date: '2026-05-04', entryNo: 'OR-2', description: 'receipt', amount: 0.2, claimedByMonth: null, contra: false },
        { id: 'b3', date: '2026-05-05', entryNo: 'PV-1', description: 'payment', amount: -0.3, claimedByMonth: null, contra: false },
      ],
      statementLines: [
        { id: 's1', date: '2026-05-06', description: 'deposit', amount: 5, matchKind: null },
        { id: 's2', date: '2026-05-07', description: 'charge', amount: -5, matchKind: null },
      ],
    })
    expect(m.sums.bookReceipts).toBe(0.3)
    expect(m.sums.bookPayments).toBe(-0.3)
    expect(m.sums.stmtReceipts).toBe(5)
    expect(m.sums.stmtPayments).toBe(-5)
    expect(m.adjustedBank).toBe(0)
    expect(m.tie).toBe(true)
  })

  it('reports no tie verdict without a statement closing balance', () => {
    const m = buildReconReport({
      periodMonth: '2026-05-01',
      statementOpening: null,
      statementClosing: null,
      glClosing: 100,
      bookLines: [],
      statementLines: [],
    })
    expect(m.adjustedBank).toBeNull()
    expect(m.diff).toBeNull()
    expect(m.tie).toBe(false)
  })
})
