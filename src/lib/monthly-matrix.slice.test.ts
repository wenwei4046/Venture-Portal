import { describe, expect, it } from 'vitest'
import { sliceMatrixMonths, type MatrixColumn } from './monthly-matrix'

// 2026-10-09 — a month-by-month report over From – To (the Finance revamp
// handoff): the matrix is built through To, then cut to From.

const columns: MatrixColumn[] = [
  { key: 'acc', label: 'Accumulated' },
  { key: '2026-04', label: 'Apr 2026' },
  { key: '2026-03', label: 'Mar 2026' },
  { key: '2026-02', label: 'Feb 2026' },
  { key: '2026-01', label: 'Jan 2026' },
]
const rows = [
  { key: 'SALES', values: [1000, 400, 300, 200, 100] },
  { key: 'OPENING_CASH', values: [5000, 5600, 5300, 5100, 5000] },
  { key: 'CLOSING_CASH', values: [6000, 6000, 5600, 5300, 5100] },
  { key: 'AR_OUTSTANDING', values: [70, 70, 90, 40, 10] },
]

describe('a matrix cut to From', () => {
  it('keeps Accumulated and the months from From, latest first', () => {
    const out = sliceMatrixMonths(columns, rows, '2026-03', { base: [1000, 400, 300, 200, 100] })
    expect(out.columns.map((c) => c.key)).toEqual(['acc', '2026-04', '2026-03'])
    expect(out.rows[0].values).toEqual([700, 400, 300])
    expect(out.base).toEqual([700, 400, 300])
  })
  it('reads an opening on the first month, a closing or a balance on the last', () => {
    const out = sliceMatrixMonths(columns, rows, '2026-03')
    expect(out.rows[1].values).toEqual([5300, 5600, 5300])
    expect(out.rows[2].values).toEqual([6000, 6000, 5600])
    expect(out.rows[3].values).toEqual([70, 70, 90])
  })
  it('keeps the matrix as built from January', () => {
    const out = sliceMatrixMonths(columns, rows, '2026-01')
    expect(out.columns).toBe(columns)
    expect(out.rows).toBe(rows)
  })
})
