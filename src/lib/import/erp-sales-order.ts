/**
 * Parser for the ERP "Sales Order listing" export (AutoCount-style), the
 * source of truth for Revenue Department commission.
 *
 * Shape confirmed against the user's `July SO.xlsx` (2026-08-31):
 * 3,261 rows → 691 orders → 40 agents, one sheet, 36 columns.
 *
 *   ONE ROW PER ORDER LINE. The order header (Doc. No. / Date / Debtor /
 *   Agent / SubTotal / Total / Cancelled / BALANCE) is REPEATED on every line
 *   of that order. Grouping is by `Doc. No.`.
 *
 * Column layout — two blocks that reuse header names, which is why columns are
 * resolved positionally *relative to `Item Group`* rather than by name alone:
 *
 *   [0 .. Item Group)   order-header block: Check, Doc. No., Date, Debtor Code,
 *                       Debtor Name, Agent, Curr. Code, Inclusive?,
 *                       SubTotal (Ex), Tax, **Total**, Local Total, Cancelled, …
 *   [Item Group .. end] line block: Item Group, Item Code, Detail Description,
 *                       UOM, Location, Detail Description 2, Qty, Unit Price,
 *                       Discount, Detail Tax Code, **Total**, Tax,
 *                       **Total (Ex)**, Total (Inc), …, BALANCE, PAYEMENT
 *
 * `Total` and `Tax` therefore appear TWICE. A naive header-name map silently
 * resolves the header-level `Total` to the LINE total and every order appears
 * to have a discount. It does not: across all 691 orders in the sample,
 * header `Total` === `SubTotal (Ex)` === Σ line `Total (Ex)` exactly, tax is
 * always 0 and `Discount` is never used.
 *
 * Two facts about the data that matter to the commission engine:
 *
 *  1. PACKAGE PRICING. 607 of 691 orders put the entire order value on ONE
 *     line (usually the mattress); the bundled bedframe/pillows/protectors are
 *     qty > 0 at amount 0. Per-line amounts are therefore NOT a per-product
 *     revenue split. The engine only ever sums them, so this is safe — but any
 *     future "revenue by product" report must not trust a single line.
 *  2. NO TIME OF DAY. Every `Date` cell is midnight. The order in which bills
 *     were written on a day can only come from the running `Doc. No.`
 *     (SO-012578 … SO-013266; sorting 688 orders by number produced just 2
 *     date inversions), which is what `sequenceInDay` exposes for the Open
 *     Bill suggestion.
 */

import { read, utils, type WorkBook } from 'xlsx'

export interface ErpSalesLine {
  lineNo: number
  itemGroup: string
  itemCode: string
  description: string
  description2: string | null
  uom: string | null
  location: string | null
  qty: number
  unitPrice: number
  /** ERP `Total (Ex)`. */
  lineAmount: number
}

export interface ErpSalesOrder {
  orderNo: string
  /** YYYY-MM-DD */
  orderDate: string
  /** YYYY-MM-01 — commission settles per calendar month. */
  periodMonth: string
  debtorCode: string | null
  customerName: string
  /** Agent exactly as written in the file, whitespace-trimmed. */
  agentName: string
  /** Upper-cased, whitespace-collapsed — the key used to match a salesperson. */
  agentKey: string
  /** Branch of the first line (KL / PG / SRW / SBH). */
  location: string | null
  /** ERP header `Total`. */
  orderTotal: number
  /** ERP `BALANCE` — outstanding amount. null when the column is empty. */
  balance: number | null
  cancelled: boolean
  /** 1-based position of this order among the agent's orders that day. */
  sequenceInDay: number
  lines: ErpSalesLine[]
}

export interface ErpParseResult {
  orders: ErpSalesOrder[]
  sheetName: string
  /** Distinct agents, so the import wizard can drive the matching step. */
  agents: Array<{ name: string; key: string; orders: number; total: number }>
  /** Distinct item groups, so unclassified ones surface before a run. */
  itemGroups: Array<{ group: string; lines: number; qty: number; amount: number }>
  /** Calendar months present — the file may span more than the one you want. */
  periods: Array<{ periodMonth: string; orders: number; total: number }>
  skipped: Array<{ excelRow: number; reason: string }>
  /** Orders where header Total != Σ line amounts. Should always be empty. */
  tallyMismatches: Array<{ orderNo: string; headerTotal: number; lineSum: number }>
  cancelledCount: number
}

type Cell = string | number | boolean | Date | null | undefined
type Grid = Cell[][]

const HEADER_MARKER = 'Doc. No.'
const LINE_BLOCK_MARKER = 'Item Group'

// ─── Cell helpers ───────────────────────────────────────────────────────────

function text(v: Cell): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function num(v: Cell): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** Collapse internal runs of whitespace and upper-case — the matching key. */
export function normaliseAgent(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toUpperCase()
}

/**
 * Excel serial / Date / string → YYYY-MM-DD.
 *
 * Deliberately does its own serial arithmetic in UTC. Letting xlsx build a
 * local `Date` shifts a midnight cell across the date boundary in UTC+8 and
 * silently moves month-end orders into the wrong period.
 */
export function toIsoDate(v: Cell): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v <= 0) return null
    const ms = Math.round((v - 25569) * 86400000)
    return new Date(ms).toISOString().slice(0, 10)
  }
  if (v instanceof Date) {
    return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()))
      .toISOString()
      .slice(0, 10)
  }
  const s = String(v).trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }
  return null
}

export function periodOf(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`
}

// ─── Column resolution ──────────────────────────────────────────────────────

export interface ColumnMap {
  headerRow: number
  docNo: number
  date: number
  debtorCode: number
  debtorName: number
  agent: number
  cancelled: number
  headerTotal: number
  balance: number
  itemGroup: number
  itemCode: number
  description: number
  description2: number
  uom: number
  location: number
  qty: number
  unitPrice: number
  lineAmount: number
}

function findHeaderRow(grid: Grid): number {
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const row = grid[i] ?? []
    if (row.some(c => text(c) === HEADER_MARKER)) return i
  }
  return -1
}

/** First column in [from, to) whose header equals `name` (case-insensitive). */
function col(headers: string[], name: string, from = 0, to = headers.length): number {
  const want = name.toLowerCase()
  for (let i = from; i < Math.min(to, headers.length); i++) {
    if (headers[i].toLowerCase() === want) return i
  }
  return -1
}

export function resolveColumns(grid: Grid): ColumnMap {
  const headerRow = findHeaderRow(grid)
  if (headerRow < 0) {
    throw new Error(
      `Could not find the header row — no "${HEADER_MARKER}" cell in the first 30 rows. Is this the Sales Order listing export?`,
    )
  }
  const headers = (grid[headerRow] ?? []).map(text)

  const itemGroup = col(headers, LINE_BLOCK_MARKER)
  if (itemGroup < 0) {
    throw new Error(
      `Could not find the "${LINE_BLOCK_MARKER}" column, which separates the order-header columns from the line columns.`,
    )
  }

  // Header block lives strictly BEFORE Item Group; line block from it onward.
  // This is what keeps the duplicated "Total" / "Tax" headers apart.
  const map: ColumnMap = {
    headerRow,
    docNo: col(headers, 'Doc. No.', 0, itemGroup),
    date: col(headers, 'Date', 0, itemGroup),
    debtorCode: col(headers, 'Debtor Code', 0, itemGroup),
    debtorName: col(headers, 'Debtor Name', 0, itemGroup),
    agent: col(headers, 'Agent', 0, itemGroup),
    cancelled: col(headers, 'Cancelled', 0, itemGroup),
    headerTotal: col(headers, 'Total', 0, itemGroup),
    balance: col(headers, 'BALANCE', itemGroup),
    itemGroup,
    itemCode: col(headers, 'Item Code', itemGroup),
    description: col(headers, 'Detail Description', itemGroup),
    description2: col(headers, 'Detail Description 2', itemGroup),
    uom: col(headers, 'UOM', itemGroup),
    location: col(headers, 'Location', itemGroup),
    qty: col(headers, 'Qty', itemGroup),
    unitPrice: col(headers, 'Unit Price', itemGroup),
    lineAmount: col(headers, 'Total (Ex)', itemGroup),
  }

  const required: Array<[keyof ColumnMap, string]> = [
    ['docNo', 'Doc. No.'],
    ['date', 'Date'],
    ['agent', 'Agent'],
    ['headerTotal', 'Total (order header)'],
    ['itemCode', 'Item Code'],
    ['qty', 'Qty'],
    ['lineAmount', 'Total (Ex)'],
  ]
  const missing = required.filter(([k]) => map[k] < 0).map(([, label]) => label)
  if (missing.length > 0) {
    throw new Error(`Sales Order export is missing required column(s): ${missing.join(', ')}`)
  }

  return map
}

// ─── Parse ──────────────────────────────────────────────────────────────────

export function parseErpSalesGrid(grid: Grid, sheetName = ''): ErpParseResult {
  const map = resolveColumns(grid)
  const skipped: ErpParseResult['skipped'] = []

  const byOrder = new Map<string, ErpSalesOrder>()
  const lineCounter = new Map<string, number>()

  for (let r = map.headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const excelRow = r + 1

    const orderNo = text(row[map.docNo])
    if (!orderNo) {
      if (row.some(c => text(c) !== '')) {
        skipped.push({ excelRow, reason: 'No Doc. No. on the row' })
      }
      continue
    }

    const isoDate = toIsoDate(row[map.date])
    if (!isoDate) {
      skipped.push({ excelRow, reason: `Unreadable Date for ${orderNo}` })
      continue
    }

    let order = byOrder.get(orderNo)
    if (!order) {
      const agentName = text(row[map.agent])
      order = {
        orderNo,
        orderDate: isoDate,
        periodMonth: periodOf(isoDate),
        debtorCode: map.debtorCode >= 0 ? text(row[map.debtorCode]) || null : null,
        customerName: map.debtorName >= 0 ? text(row[map.debtorName]) : '',
        agentName,
        agentKey: normaliseAgent(agentName),
        location: map.location >= 0 ? text(row[map.location]) || null : null,
        orderTotal: num(row[map.headerTotal]),
        balance:
          map.balance >= 0 && text(row[map.balance]) !== '' ? num(row[map.balance]) : null,
        // The ERP marks a cancelled order 'T'; everything live is 'F'.
        cancelled: map.cancelled >= 0 && text(row[map.cancelled]).toUpperCase() === 'T',
        sequenceInDay: 0, // filled in below
        lines: [],
      }
      byOrder.set(orderNo, order)
      lineCounter.set(orderNo, 0)
    }

    const lineNo = (lineCounter.get(orderNo) ?? 0) + 1
    lineCounter.set(orderNo, lineNo)

    order.lines.push({
      lineNo,
      itemGroup: map.itemGroup >= 0 ? text(row[map.itemGroup]) : '',
      itemCode: text(row[map.itemCode]),
      description: map.description >= 0 ? text(row[map.description]) : '',
      description2:
        map.description2 >= 0 ? text(row[map.description2]) || null : null,
      uom: map.uom >= 0 ? text(row[map.uom]) || null : null,
      location: map.location >= 0 ? text(row[map.location]) || null : null,
      qty: num(row[map.qty]),
      unitPrice: map.unitPrice >= 0 ? num(row[map.unitPrice]) : 0,
      lineAmount: num(row[map.lineAmount]),
    })
  }

  const orders = [...byOrder.values()]

  // Running Doc. No. is the only usable proxy for "which bill came first
  // today" — the Date cells carry no time. Numeric suffix when there is one,
  // otherwise fall back to lexical order so mixed prefixes still sort stably.
  const docRank = (o: ErpSalesOrder) => {
    const m = o.orderNo.match(/(\d+)\s*$/)
    return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER
  }
  const dayBuckets = new Map<string, ErpSalesOrder[]>()
  for (const o of orders) {
    const key = `${o.agentKey}|${o.orderDate}`
    const list = dayBuckets.get(key)
    if (list) list.push(o)
    else dayBuckets.set(key, [o])
  }
  for (const list of dayBuckets.values()) {
    list
      .sort((a, b) => docRank(a) - docRank(b) || a.orderNo.localeCompare(b.orderNo))
      .forEach((o, i) => {
        o.sequenceInDay = i + 1
      })
  }

  // ── Diagnostics ────────────────────────────────────────────────────────
  const agentMap = new Map<string, { name: string; key: string; orders: number; total: number }>()
  const groupMap = new Map<string, { group: string; lines: number; qty: number; amount: number }>()
  const periodMap = new Map<string, { periodMonth: string; orders: number; total: number }>()
  const tallyMismatches: ErpParseResult['tallyMismatches'] = []
  let cancelledCount = 0

  for (const o of orders) {
    if (o.cancelled) cancelledCount++

    const a = agentMap.get(o.agentKey) ?? { name: o.agentName, key: o.agentKey, orders: 0, total: 0 }
    a.orders++
    a.total = round2(a.total + o.orderTotal)
    agentMap.set(o.agentKey, a)

    const p = periodMap.get(o.periodMonth) ?? { periodMonth: o.periodMonth, orders: 0, total: 0 }
    p.orders++
    p.total = round2(p.total + o.orderTotal)
    periodMap.set(o.periodMonth, p)

    let lineSum = 0
    for (const l of o.lines) {
      lineSum = round2(lineSum + l.lineAmount)
      const key = l.itemGroup || '(blank)'
      const g = groupMap.get(key) ?? { group: key, lines: 0, qty: 0, amount: 0 }
      g.lines++
      g.qty = round2(g.qty + l.qty)
      g.amount = round2(g.amount + l.lineAmount)
      groupMap.set(key, g)
    }
    if (Math.abs(lineSum - o.orderTotal) > 0.005) {
      tallyMismatches.push({ orderNo: o.orderNo, headerTotal: o.orderTotal, lineSum })
    }
  }

  return {
    orders,
    sheetName,
    agents: [...agentMap.values()].sort((a, b) => b.total - a.total),
    itemGroups: [...groupMap.values()].sort((a, b) => b.amount - a.amount),
    periods: [...periodMap.values()].sort((a, b) => a.periodMonth.localeCompare(b.periodMonth)),
    skipped,
    tallyMismatches,
    cancelledCount,
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Parse a workbook buffer. Uses the first sheet unless `sheetName` is given. */
export function parseErpSalesOrders(
  data: ArrayBuffer | Uint8Array,
  sheetName?: string,
): ErpParseResult {
  const wb: WorkBook = read(data, { cellDates: false })
  const name = sheetName ?? wb.SheetNames[0]
  const ws = wb.Sheets[name]
  if (!ws) throw new Error(`Sheet "${name}" not found. Sheets: ${wb.SheetNames.join(', ')}`)
  const grid = utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null })
  return parseErpSalesGrid(grid, name)
}

/**
 * Narrow a parsed file to the month being paid, dropping cancelled orders.
 * The export is a date RANGE, not a month: the user's "July SO" file actually
 * ran 2026-07-01 → 2026-08-15, so importing it wholesale would pay August
 * orders inside the July run.
 */
export function selectPeriod(
  orders: ErpSalesOrder[],
  periodMonth: string,
): { selected: ErpSalesOrder[]; outOfPeriod: number; cancelled: number } {
  let outOfPeriod = 0
  let cancelled = 0
  const selected: ErpSalesOrder[] = []
  for (const o of orders) {
    if (o.periodMonth !== periodMonth) {
      outOfPeriod++
      continue
    }
    if (o.cancelled) {
      cancelled++
      continue
    }
    selected.push(o)
  }
  return { selected, outOfPeriod, cancelled }
}
