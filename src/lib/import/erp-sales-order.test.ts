import { describe, it, expect } from 'vitest'
import {
  normaliseAgent,
  parseErpSalesGrid,
  periodOf,
  resolveColumns,
  selectPeriod,
  toIsoDate,
} from './erp-sales-order'

/** Excel 1900-system serial for an ISO date, computed in UTC. */
function serial(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86400000 + 25569
}

/**
 * The real export's 36 headers, verbatim. Note `Total` at 10 (order header)
 * AND at 26 (line), plus `Tax` at 9 and 27 — the duplication this parser has
 * to survive.
 */
const HEADERS = [
  'Check', 'Doc. No.', 'Date', 'Debtor Code', 'Debtor Name', 'Agent',
  'Curr. Code', 'Inclusive?', 'SubTotal (Ex)', 'Tax', 'Total', 'Local Total',
  'Cancelled', 'Remark 4', 'Sales Exemption Expiry Date', 'Processing Date',
  'Item Group', 'Item Code', 'Detail Description', 'UOM', 'Location',
  'Detail Description 2', 'Qty', 'Unit Price', 'Discount', 'Detail Tax Code',
  'Total', 'Tax', 'Total (Ex)', 'Total (Inc)', 'Creditor Code', 'Post to PO',
  'BALANCE', 'PAYEMENT', 'Remark6', 'Remark5',
]

type Cell = string | number | null
interface RowSpec {
  doc: string
  date: string
  agent: string
  customer?: string
  headerTotal: number
  cancelled?: 'T' | 'F'
  group: string
  code: string
  desc?: string
  qty: number
  unitPrice: number
  lineAmount: number
  location?: string
  balance?: number | null
}

function row(s: RowSpec): Cell[] {
  const r: Cell[] = new Array(36).fill(null)
  r[0] = 'Checked'
  r[1] = s.doc
  r[2] = serial(s.date)
  r[3] = '300-C002'
  r[4] = s.customer ?? 'A CUSTOMER'
  r[5] = s.agent
  r[6] = 'MYR'
  r[7] = 'T'
  r[8] = s.headerTotal
  r[9] = 0
  r[10] = s.headerTotal
  r[11] = s.headerTotal
  r[12] = s.cancelled ?? 'F'
  r[16] = s.group
  r[17] = s.code
  r[18] = s.desc ?? s.code
  r[19] = 'UNIT'
  r[20] = s.location ?? 'KL'
  r[22] = s.qty
  r[23] = s.unitPrice
  r[26] = s.lineAmount
  r[27] = 0
  r[28] = s.lineAmount
  r[29] = s.lineAmount
  r[31] = 'Checked'
  r[32] = s.balance === undefined ? 0 : s.balance
  return r
}

/**
 * Mirrors the real file's SO-012579: a 6,400 package where the mattress line
 * carries the whole amount and the bundled pillows / bolsters / protectors are
 * qty > 0 at 0.
 */
const GRID: Cell[][] = [
  HEADERS,
  row({ doc: 'SO-012579', date: '2026-07-01', agent: 'TAN KAR JIUN', headerTotal: 6400,
        group: 'MATTRESS', code: 'AK-GUARDIAN MATT (K)', qty: 1, unitPrice: 6400, lineAmount: 6400, balance: 4480 }),
  row({ doc: 'SO-012579', date: '2026-07-01', agent: 'TAN KAR JIUN', headerTotal: 6400,
        group: 'ACC', code: 'AK-CS AIRLOFT COMFY PIL', qty: 4, unitPrice: 0, lineAmount: 0, balance: 4480 }),
  row({ doc: 'SO-012579', date: '2026-07-01', agent: 'TAN KAR JIUN', headerTotal: 6400,
        group: 'ACC', code: 'AK- ESSENTIAL BOLSTER', qty: 4, unitPrice: 0, lineAmount: 0, balance: 4480 }),
  // Same agent, same day, LATER doc number → 2nd bill of the day.
  row({ doc: 'SO-012596', date: '2026-07-01', agent: 'TAN KAR JIUN', headerTotal: 8288,
        group: 'MATTRESS', code: 'AK-BASTION MATT (K)', qty: 1, unitPrice: 7083, lineAmount: 7083 }),
  row({ doc: 'SO-012596', date: '2026-07-01', agent: 'TAN KAR JIUN', headerTotal: 8288,
        group: 'TRANS', code: 'TRANSPORTATION CHARGES', qty: 1, unitPrice: 1205, lineAmount: 1205 }),
  // Trailing space + different case: the same human as row 1's agent? No —
  // this is MELVIN, used to prove key normalisation across two spellings.
  row({ doc: 'SO-012600', date: '2026-07-31', agent: 'MELVIN CHONG ', headerTotal: 5000,
        group: 'SOFA', code: 'DSL-9058 SOFA', qty: 1, unitPrice: 5000, lineAmount: 5000, location: 'PG' }),
  row({ doc: 'SO-012601', date: '2026-07-31', agent: 'Melvin  Chong', headerTotal: 1000,
        group: 'BEDFRAME', code: 'HOK-1007 (Q)', qty: 1, unitPrice: 1000, lineAmount: 1000, location: 'PG' }),
  // August order — same file, different period.
  row({ doc: 'SO-013200', date: '2026-08-05', agent: 'YUNY', headerTotal: 24000,
        group: 'MATTRESS', code: 'AK-EQUINOX MATT (K)', qty: 1, unitPrice: 24000, lineAmount: 24000 }),
  // Cancelled test order.
  row({ doc: 'ZZTEST-0001', date: '2026-07-11', agent: 'OTHERS', headerTotal: 950, cancelled: 'T',
        group: 'OTHER', code: 'Miscellaneous', qty: 1, unitPrice: 950, lineAmount: 950 }),
]

// ─── Column resolution ──────────────────────────────────────────────────────

describe('resolveColumns', () => {
  const map = resolveColumns(GRID)

  it('finds the header row', () => {
    expect(map.headerRow).toBe(0)
  })

  it('resolves the duplicated "Total" to the ORDER header column, not the line one', () => {
    // The bug this guards: a plain header-name map resolves "Total" to 26 (the
    // line total), which makes every package order look discounted.
    expect(map.headerTotal).toBe(10)
    expect(map.lineAmount).toBe(28)
    expect(map.itemGroup).toBe(16)
  })

  it('resolves the line block relative to Item Group', () => {
    expect(map.itemCode).toBe(17)
    expect(map.qty).toBe(22)
    expect(map.balance).toBe(32)
  })

  it('throws a readable error when the export is the wrong report', () => {
    expect(() => resolveColumns([['Emp. Name', 'Basic', 'Gross']])).toThrow(/header row/i)
  })

  it('throws when a required line column is missing', () => {
    const noTotalEx = [HEADERS.map(h => (h === 'Total (Ex)' ? 'Something Else' : h))]
    expect(() => resolveColumns(noTotalEx)).toThrow(/Total \(Ex\)/)
  })
})

// ─── Dates ──────────────────────────────────────────────────────────────────

describe('toIsoDate', () => {
  it('converts an Excel serial without timezone drift', () => {
    expect(toIsoDate(serial('2026-07-01'))).toBe('2026-07-01')
    expect(toIsoDate(serial('2026-07-31'))).toBe('2026-07-31')
  })

  it('keeps a month-end order in its own month', () => {
    // The trap: building a local Date from a midnight cell in UTC+8 rolls
    // 31 July back to 30 July and moves the order into the wrong run.
    expect(periodOf(toIsoDate(serial('2026-07-31'))!)).toBe('2026-07-01')
    expect(periodOf(toIsoDate(serial('2026-08-01'))!)).toBe('2026-08-01')
  })

  it('accepts ISO and d/m/Y strings', () => {
    expect(toIsoDate('2026-07-04')).toBe('2026-07-04')
    expect(toIsoDate('4/7/2026')).toBe('2026-07-04')
  })

  it('returns null for junk', () => {
    expect(toIsoDate('')).toBeNull()
    expect(toIsoDate(null)).toBeNull()
    expect(toIsoDate('not a date')).toBeNull()
  })
})

describe('normaliseAgent', () => {
  it('trims, collapses inner whitespace and upper-cases', () => {
    expect(normaliseAgent('MELVIN CHONG ')).toBe('MELVIN CHONG')
    expect(normaliseAgent('Melvin  Chong')).toBe('MELVIN CHONG')
    expect(normaliseAgent(' Lim Yau Wei')).toBe('LIM YAU WEI')
  })
})

// ─── Parsing ────────────────────────────────────────────────────────────────

describe('parseErpSalesGrid', () => {
  const result = parseErpSalesGrid(GRID, 'Sheet')

  it('groups the repeated header rows into orders', () => {
    expect(result.orders).toHaveLength(6)
    const so = result.orders.find(o => o.orderNo === 'SO-012579')!
    expect(so.lines).toHaveLength(3)
    expect(so.orderTotal).toBe(6400)
    expect(so.customerName).toBe('A CUSTOMER')
    expect(so.orderDate).toBe('2026-07-01')
    expect(so.periodMonth).toBe('2026-07-01')
  })

  it('seeds the event day from the order date, as its own field', () => {
    // A bill belongs to the day it was written. The ERP has nothing better than
    // the order date, but a roadshow straddling a cut-off needs the two to be
    // separately editable later.
    const so = result.orders.find(o => o.orderNo === 'SO-012579')!
    expect(so.eventDate).toBe(so.orderDate)
    expect(so.eventDate).toBe('2026-07-01')
  })

  it('keeps package pricing intact — one priced line, the rest at zero', () => {
    const so = result.orders.find(o => o.orderNo === 'SO-012579')!
    expect(so.lines.map(l => l.lineAmount)).toEqual([6400, 0, 0])
    expect(so.lines.map(l => l.qty)).toEqual([1, 4, 4])
  })

  it('reads the order header Total, not the first line total', () => {
    const so = result.orders.find(o => o.orderNo === 'SO-012596')!
    expect(so.orderTotal).toBe(8288) // NOT 7083
    expect(result.tallyMismatches).toEqual([])
  })

  it('flags an order whose lines do not add up to its header total', () => {
    const broken = [HEADERS, row({
      doc: 'SO-BAD', date: '2026-07-02', agent: 'X', headerTotal: 1000,
      group: 'MATTRESS', code: 'M', qty: 1, unitPrice: 900, lineAmount: 900,
    })]
    const r = parseErpSalesGrid(broken)
    expect(r.tallyMismatches).toEqual([{ orderNo: 'SO-BAD', headerTotal: 1000, lineSum: 900 }])
  })

  it('carries the outstanding balance through', () => {
    expect(result.orders.find(o => o.orderNo === 'SO-012579')!.balance).toBe(4480)
  })

  it('marks the cancelled order without dropping it at parse time', () => {
    const zz = result.orders.find(o => o.orderNo === 'ZZTEST-0001')!
    expect(zz.cancelled).toBe(true)
    expect(result.cancelledCount).toBe(1)
  })

  it('collapses two spellings of an agent onto one key', () => {
    const melvin = result.agents.find(a => a.key === 'MELVIN CHONG')!
    expect(melvin.orders).toBe(2)
    expect(melvin.total).toBe(6000)
    expect(result.agents.filter(a => a.key.startsWith('MELVIN'))).toHaveLength(1)
  })

  it('ranks agents by value so the wizard shows the big ones first', () => {
    expect(result.agents[0].key).toBe('YUNY')
  })

  it('reports every item group so unclassified ones surface', () => {
    const groups = Object.fromEntries(result.itemGroups.map(g => [g.group, g.amount]))
    expect(groups.MATTRESS).toBe(37483)
    expect(groups.TRANS).toBe(1205)
    expect(groups.ACC).toBe(0)
    expect(groups.OTHER).toBe(950)
  })

  it('reports the calendar months present — an export is a range, not a month', () => {
    expect(result.periods).toEqual([
      { periodMonth: '2026-07-01', orders: 5, total: 21638 },
      { periodMonth: '2026-08-01', orders: 1, total: 24000 },
    ])
  })

  it('numbers each agent-day by running doc number — "#2 of the day" on All bills', () => {
    expect(result.orders.find(o => o.orderNo === 'SO-012579')!.sequenceInDay).toBe(1)
    expect(result.orders.find(o => o.orderNo === 'SO-012596')!.sequenceInDay).toBe(2)
    // Different agent, different day → each is their own 1st bill.
    expect(result.orders.find(o => o.orderNo === 'SO-013200')!.sequenceInDay).toBe(1)
  })

  it('numbers by doc number even when the rows arrive out of order', () => {
    const reversed = [GRID[0], GRID[4], GRID[5], GRID[1], GRID[2], GRID[3]]
    const r = parseErpSalesGrid(reversed)
    expect(r.orders.find(o => o.orderNo === 'SO-012579')!.sequenceInDay).toBe(1)
    expect(r.orders.find(o => o.orderNo === 'SO-012596')!.sequenceInDay).toBe(2)
  })

  it('skips a row with no Doc. No. and says why', () => {
    const withBlank = [...GRID, ['', '', '', '', '', 'GHOST'] as Cell[]]
    const r = parseErpSalesGrid(withBlank)
    expect(r.skipped).toHaveLength(1)
    expect(r.skipped[0].reason).toMatch(/No Doc. No./)
  })
})

// ─── Period selection ───────────────────────────────────────────────────────

describe('selectPeriod', () => {
  const { orders } = parseErpSalesGrid(GRID)

  it('keeps only the month being paid and drops cancelled orders', () => {
    const { selected, outOfPeriod, cancelled } = selectPeriod(orders, '2026-07-01')
    expect(selected.map(o => o.orderNo)).toEqual([
      'SO-012579', 'SO-012596', 'SO-012600', 'SO-012601',
    ])
    expect(outOfPeriod).toBe(1) // the August order
    expect(cancelled).toBe(1) // ZZTEST-0001
  })

  it('selects August from the very same file', () => {
    const { selected, outOfPeriod } = selectPeriod(orders, '2026-08-01')
    expect(selected.map(o => o.orderNo)).toEqual(['SO-013200'])
    expect(outOfPeriod).toBe(5)
  })
})
