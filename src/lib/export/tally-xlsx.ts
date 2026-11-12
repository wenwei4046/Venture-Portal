import * as XLSX from 'xlsx'
import {
  tallyDay, tallyMonthLong, tallyMonthShort, tallyOtherSide,
  type TallyBill, type TallyMonthExport,
} from '@/lib/commission/tally'
import { PCT_FINE, SheetDraft, money, type Cell, type Fmt } from './brand-billing-xlsx'

/**
 * Comm Cal › Tally's workbook for one month (2026-11-12): what the page sums,
 * listed whole — to lay beside what Houzs clears, bill by bill.
 *
 *   Summary        — the month by SO date and by fair date, the gap, what is
 *                    carried, what its closed salespeople are paid; then each
 *                    brand on both sides.
 *   By SO date     — every bill whose SO date is in the month (Houzs pays).
 *   By fair date   — every bill counted in the month (we pay salespeople on).
 *   In two months  — the bills the gap is made of, as the page lists them.
 */

const BILL_HEAD = [
  'ERP no.', 'Ref No.', 'Salesperson', 'Customer', 'Brand', 'Fair day', 'SO date',
  'Sales', 'Bill to HC %', 'Bill to HC', 'Fair month (we pay)', 'SO month (Houzs pays)', 'Note',
]
const BILL_FORMATS: Fmt[] = [...money(7, 9), { col: 8, z: PCT_FINE }]
const BILL_WIDTHS = [18, 14, 18, 26, 13, 12, 12, 13, 12, 13, 19, 21, 34]

/** What a bill's row says beyond its figures: the other side's month when it differs, its deposit, an old bill. */
function noteOf(bill: TallyBill, side: 'ours' | 'theirs', from: string | null): string {
  const notes: string[] = []
  if (bill.ourMonth !== bill.houzsMonth) notes.push(tallyOtherSide(bill, side, from).text)
  if (bill.oldBill) notes.push(`Old bill topped up · sold ${tallyDay(bill.soDate)}`)
  if (bill.belowDeposit) notes.push('Below deposit')
  if (bill.pct === null) notes.push('No Bill to HC % set')
  return notes.join(' · ')
}

function billRow(bill: TallyBill, side: 'ours' | 'theirs', from: string | null): Cell[] {
  return [
    bill.orderNo, bill.refNo ?? '', bill.salesperson, bill.customer ?? '', bill.brandName,
    bill.fairDate ?? '', bill.soDate, bill.sales, bill.pct, bill.bill,
    tallyMonthShort(bill.ourMonth), tallyMonthShort(bill.houzsMonth), noteOf(bill, side, from),
  ]
}

function totalRow(label: string, rows: readonly TallyBill[]): Cell[] {
  const sales = rows.reduce((sum, b) => sum + Math.round(b.sales * 100), 0) / 100
  const bill = rows.reduce((sum, b) => sum + Math.round((b.bill ?? 0) * 100), 0) / 100
  return [label, null, null, null, null, null, null, sales, null, bill, null, null, null]
}

function billSheet(rows: readonly TallyBill[], side: 'ours' | 'theirs', from: string | null): SheetDraft {
  const sheet = new SheetDraft()
  sheet.add(BILL_HEAD)
  for (const bill of rows) sheet.add(billRow(bill, side, from), BILL_FORMATS)
  sheet.add(totalRow(`${rows.length} bill${rows.length === 1 ? '' : 's'}`, rows), BILL_FORMATS)
  return sheet
}

export interface TallyWorkbook {
  /** "Revenue Team · Fair". */
  title: string
  month: TallyMonthExport
  /** What the month's closed salespeople are paid; null while nobody is closed. */
  commission: { total: number; closed: number } | null
}

export function buildTallyXlsx({ title, month, commission }: TallyWorkbook): Buffer {
  const wb = XLSX.utils.book_new()
  const { row, from } = month
  const long = tallyMonthLong(month.month)
  const short = tallyMonthShort(month.month)

  // ── Summary ────────────────────────────────────────────────────────────
  const s = new SheetDraft()
  s.add([`${title} · Tally · ${long}`])
  s.blank()
  s.add(['', 'Bills', 'Sales', 'Bill to HC'])
  s.add(['By SO date — Houzs pays', row.so.bills, row.so.sales, row.so.bill], money(2, 3))
  s.add(['By fair date — we pay', row.fair.bills, row.fair.sales, row.fair.bill], money(2, 3))
  s.add(['Gap (fair − SO)', row.gap.bills, row.gap.sales, row.gap.bill], money(2, 3))
  s.add([`Carried after ${long}`, row.carried.bills, row.carried.sales, row.carried.bill], money(2, 3))
  s.blank()
  s.add(
    ['Commission paid to salespeople', commission ? `${commission.closed} closed` : 'Nobody closed yet', null, commission?.total ?? null],
    money(3),
  )

  s.blank()
  s.blank()
  s.add(['By brand'])
  s.add([
    'Brand', 'Bill to HC %',
    'SO date · bills', 'SO date · sales', 'SO date · Bill to HC',
    'Fair date · bills', 'Fair date · sales', 'Fair date · Bill to HC',
    'Gap · Bill to HC',
  ])
  const brandFormats: Fmt[] = [{ col: 1, z: PCT_FINE }, ...money(3, 4, 6, 7, 8)]
  for (const b of month.brands) {
    s.add(
      [b.name, b.pct ?? 'Not set', b.so.bills, b.so.sales, b.so.bill, b.fair.bills, b.fair.sales, b.fair.bill, Math.round((b.fair.bill - b.so.bill) * 100) / 100],
      brandFormats,
    )
  }
  s.add(
    ['Total', null, row.so.bills, row.so.sales, row.so.bill, row.fair.bills, row.fair.sales, row.fair.bill, row.gap.bill],
    brandFormats,
  )
  XLSX.utils.book_append_sheet(wb, s.build([32, 13, 15, 16, 20, 16, 17, 21, 17]), 'Summary')

  // ── Every bill on each side ────────────────────────────────────────────
  XLSX.utils.book_append_sheet(wb, billSheet(month.so, 'theirs', from).build(BILL_WIDTHS), 'By SO date')
  XLSX.utils.book_append_sheet(wb, billSheet(month.fair, 'ours', from).build(BILL_WIDTHS), 'By fair date')

  // ── The bills in two months ────────────────────────────────────────────
  const two = new SheetDraft()
  two.add([`Fair date in ${short} · SO date in another month`])
  two.add(BILL_HEAD)
  for (const bill of row.ours) two.add(billRow(bill, 'ours', from), BILL_FORMATS)
  two.add(totalRow(`${row.ours.length} bill${row.ours.length === 1 ? '' : 's'}`, row.ours), BILL_FORMATS)
  two.blank()
  two.add([`SO date in ${short} · fair date in another month`])
  two.add(BILL_HEAD)
  for (const bill of row.theirs) two.add(billRow(bill, 'theirs', from), BILL_FORMATS)
  two.add(totalRow(`${row.theirs.length} bill${row.theirs.length === 1 ? '' : 's'}`, row.theirs), BILL_FORMATS)
  XLSX.utils.book_append_sheet(wb, two.build(BILL_WIDTHS), 'In two months')

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer
}
