import { describe, expect, it } from 'vitest'
import {
  checkHvSplit,
  leftFigure,
  parseFigure,
  percentAmounts,
  readHvDepartments,
  readHvShare,
  switchMode,
  type HvDraftLine,
} from './director-hv-share'

const NAMES: Record<string, string> = { mkt: 'Marketing', rev: 'Revenue Department', vo: 'Venture Office', dir: 'Director' }
const nameOf = (id: string) => NAMES[id] ?? id
const line = (departmentId: string, value: string): HvDraftLine => ({ departmentId, value })

describe('percentAmounts — the database’s arithmetic (director_hv_share_save)', () => {
  it('gives each its share to the sen and the rounding to the biggest percentage', () => {
    // The production dry run of mig 20261013170000: RM 15,056.05 at 50 / 30 / 15 / 5.
    // 7,528.025 rounds up to 7,528.03, 4,516.815 to 4,516.82, 2,258.4075 to 2,258.41,
    // 752.8025 to 752.80 — a sen too many, taken back from the biggest (Marketing).
    expect(percentAmounts(15056.05, [50, 30, 15, 5])).toEqual([7528.02, 4516.82, 2258.41, 752.8])
  })

  it('adds up to the total exactly, whatever the percentages', () => {
    for (const [total, pcts] of [
      [1000, [33.3333, 33.3333, 33.3334]],
      [99.99, [12.5, 12.5, 25, 50]],
      [123456.78, [0.0001, 99.9999]],
      [10, [70, 30]],
    ] as Array<[number, number[]]>) {
      const amounts = percentAmounts(total, pcts)
      expect(Math.round(amounts.reduce((s, a) => s + a, 0) * 100)).toBe(Math.round(total * 100))
    }
  })

  it('takes what rounding leaves from the first of equal biggest percentages', () => {
    // 100 / 3 = 33.333…: each rounds to 33.33, one sen left — the first 33.3334 is the biggest.
    expect(percentAmounts(100, [33.3333, 33.3334, 33.3333])).toEqual([33.33, 33.34, 33.33])
    expect(percentAmounts(100, [50, 50])).toEqual([50, 50])
  })
})

describe('checkHvSplit', () => {
  it('lets a split by amount go once it is the total to the sen', () => {
    const ok = checkHvSplit(15056.05, 'amount', [line('mkt', '10,000'), line('rev', '5056.05')], nameOf)
    expect(ok.problem).toBeNull()
    expect(ok.amounts).toEqual([10000, 5056.05])
    expect(ok.left).toBe(0)
  })

  it('says what is left, or how much too much', () => {
    expect(checkHvSplit(1000, 'amount', [line('mkt', '600')], nameOf)).toMatchObject({ left: 400, problem: 'RM 400.00 left to place' })
    expect(checkHvSplit(1000, 'amount', [line('mkt', '600'), line('rev', '500')], nameOf)).toMatchObject({
      left: -100,
      problem: "RM 100.00 more than HOUZS Venture's total",
    })
  })

  it('lets a split by percentage go at 100%, with the amounts it will save', () => {
    const ok = checkHvSplit(15056.05, 'percent', [line('mkt', '50'), line('rev', '30'), line('vo', '15'), line('dir', '5')], nameOf)
    expect(ok.problem).toBeNull()
    expect(ok.amounts).toEqual([7528.02, 4516.82, 2258.41, 752.8])
    expect(ok.pctPlaced).toBe(100)
  })

  it('says how much of 100% is left', () => {
    expect(checkHvSplit(1000, 'percent', [line('mkt', '50'), line('rev', '30')], nameOf).problem).toBe('80% placed — 20% left')
    expect(checkHvSplit(1000, 'percent', [line('mkt', '70'), line('rev', '40')], nameOf).problem).toBe('110% placed — 10% too much')
    expect(checkHvSplit(1000, 'percent', [line('mkt', '33.3333'), line('rev', '33.3333')], nameOf).problem).toBe('66.6666% placed — 33.3334% left')
    expect(checkHvSplit(1000, 'percent', [line('mkt', '120')], nameOf).problem).toBe('A percentage is at most 100%')
  })

  it('wants a department on every line, and each only once', () => {
    expect(checkHvSplit(1000, 'amount', [line('', '1000')], nameOf).problem).toBe('Pick a department on every line')
    expect(checkHvSplit(1000, 'amount', [line('mkt', '500'), line('mkt', '500')], nameOf).problem).toBe('Marketing is picked twice')
    expect(checkHvSplit(1000, 'amount', [], nameOf).problem).toBe('Add a department')
  })

  it('wants a figure above zero on each line', () => {
    expect(checkHvSplit(1000, 'amount', [line('mkt', '1000'), line('rev', '')], nameOf).problem).toBe('Every department needs an amount')
    expect(checkHvSplit(1000, 'percent', [line('mkt', '100'), line('rev', '0')], nameOf).problem).toBe('Every department needs a percentage')
    expect(checkHvSplit(1000, 'amount', [line('mkt', 'abc')], nameOf).problem).toBe('Every department needs an amount')
  })

  it('has nothing to split when HOUZS Venture pays nothing', () => {
    expect(checkHvSplit(0, 'amount', [line('mkt', '1')], nameOf).problem).toBe('HOUZS Venture has nothing to split')
  })
})

describe('the window’s helpers', () => {
  it('reads a figure with commas, and nothing else', () => {
    expect(parseFigure('1,234.50')).toBe(1234.5)
    expect(parseFigure(' 12 ')).toBe(12)
    expect(parseFigure('-5')).toBeNaN()
    expect(parseFigure('1e3')).toBeNaN()
    expect(parseFigure('')).toBeNaN()
  })

  it('starts a new line with what is left', () => {
    expect(leftFigure(1000, 'amount', [line('mkt', '600')])).toBe('400.00')
    expect(leftFigure(1000, 'amount', [line('mkt', '1000')])).toBe('')
    expect(leftFigure(1000, 'percent', [line('mkt', '62.5')])).toBe('37.5')
    expect(leftFigure(1000, 'percent', [])).toBe('100')
  })

  it('switches amounts to percentages that still make 100, and back', () => {
    const pct = switchMode(15056.05, 'amount', [line('mkt', '7528.02'), line('rev', '4516.82'), line('vo', '2258.41'), line('dir', '752.80')])
    expect(pct.map(l => l.value)).toEqual(['50', '30', '15', '5'])
    // Amounts no percentage of four places gives exactly still make 100 in all:
    const thirds = switchMode(100, 'amount', [line('mkt', '33.33'), line('rev', '33.33'), line('vo', '33.34')])
    expect(thirds.map(l => l.value)).toEqual(['33.33', '33.33', '33.34'])
    expect(thirds.reduce((s, l) => s + Math.round(Number(l.value) * 10_000), 0)).toBe(1_000_000)
    const back = switchMode(15056.05, 'percent', [line('mkt', '50'), line('rev', '30'), line('vo', '15'), line('dir', '5')])
    expect(back.map(l => l.value)).toEqual(['7528.02', '4516.82', '2258.41', '752.80'])
  })

  it('leaves a blank line blank when it switches', () => {
    expect(switchMode(1000, 'amount', [line('mkt', '1000'), line('', '')]).map(l => l.value)).toEqual(['100', ''])
  })
})

describe('reading what the database answers', () => {
  it('reads a share with its lines and, for HR, its components', () => {
    const share = readHvShare({
      id: 's1',
      period_month: '2026-10-01',
      total_ctc: 15056.05,
      split_mode: 'percent',
      status: 'transferred',
      submitted_at: '2026-10-13T01:00:00+00:00',
      submitted_by: 'HR Manager',
      transferred_at: '2026-10-14T02:00:00+00:00',
      transfer_date: '2026-10-14',
      transferred_by: 'Finance Manager',
      lines: [
        { department_id: 'mkt', department: 'Marketing', amount: 7528.02, pct: 50, invoice_id: 'i1', invoice_no: 'HV-INV-202610-0060', voucher_id: 'v1', voucher_no: 'HV-OR-202610-0530' },
        { department_id: 'dir', department: 'Director', stays: true, amount: 752.8, pct: 5, invoice_id: null, invoice_no: null, voucher_id: null, voucher_no: null },
      ],
      basic: 10000, kpi: 2000, allowance: 1500, employer_epf: 1440, employer_socso: 104.15, employer_eis: 11.9, er_manual: false,
    })
    expect(share).toMatchObject({
      id: 's1', totalCtc: 15056.05, splitMode: 'percent', status: 'transferred', transferDate: '2026-10-14',
      components: { basic: 10000, kpi: 2000, allowance: 1500, employerEpf: 1440, employerSocso: 104.15, employerEis: 11.9, erManual: false },
    })
    expect(share?.lines.map(l => [l.department, l.stays, l.amount, l.pct, l.invoiceNo, l.voucherNo])).toEqual([
      ['Marketing', false, 7528.02, 50, 'HV-INV-202610-0060', 'HV-OR-202610-0530'],
      ['Director', true, 752.8, 5, null, null],
    ])
  })

  it('reads Finance’s share without components, and nothing as nothing', () => {
    expect(readHvShare({ id: 's2', total_ctc: 10, split_mode: 'amount', status: 'with_finance', lines: [] })?.components).toBeNull()
    expect(readHvShare(null)).toBeNull()
    expect(readHvShare({})).toBeNull()
  })

  it('reads the departments to pick from', () => {
    expect(readHvDepartments([{ id: 'a', name: 'Marketing', internal: false }, { id: 'b', name: 'Venture Office', internal: true }, { id: 'c' }])).toEqual([
      { id: 'a', name: 'Marketing', internal: false },
      { id: 'b', name: 'Venture Office', internal: true },
    ])
    expect(readHvDepartments(null)).toEqual([])
  })
})
