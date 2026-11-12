import * as XLSX from 'xlsx'
import {
  tallyDay, tallyMonthLong, tallyMonthShort,
  type TallyBill, type TallyMonthExport, type TallySide,
} from '@/lib/commission/tally'
import { PCT_FINE, SheetDraft, money, type Cell, type Fmt } from './brand-billing-xlsx'

/**
 * Comm Cal › Tally's workbook for one month (2026-11-12): what the page sums,
 * listed whole — to lay beside what Houzs clears, bill by bill.
 *
 *   Summary        — what Houzs pays and what we pay in the month, how much of
 *                    ours waits for a close, the gap, what is carried, the bills
 *                    under their deposit, what its closed salespeople are paid;
 *                    then each brand on both sides.
 *   Houzs pays     — every bill Houzs pays in the month (its deposit reached,
 *                    by its SO date — or the day the deposit came, when later).
 *   We pay         — every bill the month's closes paid, or will.
 *   Paid apart     — the bills the gap is made of, as the page lists them.
 *   Below deposit  — the month's bills neither side pays yet.
 */

const BILL_HEAD = [
  'ERP no.', 'Ref No.', 'Salesperson', 'Customer', 'Brand', 'Fair day', 'SO date', 'Deposit reached',
  'Sales', 'Bill to HC %', 'Bill to HC', 'We pay', 'Houzs pays', 'Note',
]
const BILL_FORMATS: Fmt[] = [...money(8, 10), { col: 9, z: PCT_FINE }]
const BILL_WIDTHS = [18, 14, 18, 26, 13, 12, 12, 16, 13, 12, 13, 24, 16, 34]

/** A bill's "We pay" cell: the month, and how it stands there. */
export function ourColumn(bill: TallyBill): string {
  if (bill.ourMonth === null) return 'Held · below deposit'
  const month = tallyMonthShort(bill.ourMonth)
  if (bill.ours === 'open') return `${month} · not closed yet`
  if (bill.ours === 'by_hand') return `${month} · by hand`
  return month
}

/** A bill's "Houzs pays" cell: the month, or why there is none. */
export function houzsColumn(bill: TallyBill): string {
  if (bill.houzs === 'no_fair') return 'No fair in ERP'
  if (bill.houzsMonth === null) return 'Below deposit'
  return tallyMonthShort(bill.houzsMonth)
}

/** What a bill's row says beyond its two months: an old bill, a brand with no %. */
function noteOf(bill: TallyBill): string {
  const notes: string[] = []
  if (bill.oldBill) notes.push(`Old bill topped up · sold ${tallyDay(bill.soDate)}`)
  if (bill.pct === null) notes.push('No Bill to HC % set')
  return notes.join(' · ')
}

function billRow(bill: TallyBill): Cell[] {
  return [
    bill.orderNo, bill.refNo ?? '', bill.salesperson, bill.customer ?? '', bill.brandName,
    bill.fairDate ?? '', bill.soDate, bill.reachedOn ?? '', bill.sales, bill.pct, bill.bill,
    ourColumn(bill), houzsColumn(bill), noteOf(bill),
  ]
}

const sen = (rows: readonly TallyBill[], of: (b: TallyBill) => number) => rows.reduce((sum, b) => sum + Math.round(of(b) * 100), 0) / 100

function totalRow(label: string, rows: readonly TallyBill[]): Cell[] {
  return [label, null, null, null, null, null, null, null, sen(rows, b => b.sales), null, sen(rows, b => b.bill ?? 0), null, null, null]
}

const count = (n: number) => `${n} bill${n === 1 ? '' : 's'}`

/** A list of bills under its heading: the head, a row each, their total. */
function addList(sheet: SheetDraft, title: string | null, rows: readonly TallyBill[]) {
  if (title) sheet.add([title])
  sheet.add(BILL_HEAD)
  for (const bill of rows) sheet.add(billRow(bill), BILL_FORMATS)
  sheet.add(totalRow(count(rows.length), rows), BILL_FORMATS)
}

function sideOf(rows: readonly TallyBill[]): TallySide {
  return { bills: rows.length, sales: sen(rows, b => b.sales), bill: sen(rows, b => b.bill ?? 0) }
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
  const { row } = month
  const long = tallyMonthLong(month.month)
  const short = tallyMonthShort(month.month)
  const held = sideOf(row.held)

  // ── Summary ────────────────────────────────────────────────────────────
  const s = new SheetDraft()
  s.add([`${title} · Tally · ${long}`])
  s.blank()
  s.add(['', 'Bills', 'Sales', 'Bill to HC'])
  s.add(['Houzs pays', row.houzs.bills, row.houzs.sales, row.houzs.bill], money(2, 3))
  s.add(['We pay', row.we.bills, row.we.sales, row.we.bill], money(2, 3))
  s.add(['  of which not closed yet', row.open.bills, row.open.sales, row.open.bill], money(2, 3))
  s.add(['Gap (we − Houzs)', row.gap.bills, row.gap.sales, row.gap.bill], money(2, 3))
  s.add([`Carried after ${long}`, row.carried.bills, row.carried.sales, row.carried.bill], money(2, 3))
  s.add(['Below deposit — neither pays', held.bills, held.sales, held.bill], money(2, 3))
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
    'Houzs pays · bills', 'Houzs pays · sales', 'Houzs pays · Bill to HC',
    'We pay · bills', 'We pay · sales', 'We pay · Bill to HC',
    'Gap · Bill to HC',
  ])
  const brandFormats: Fmt[] = [{ col: 1, z: PCT_FINE }, ...money(3, 4, 6, 7, 8)]
  for (const b of month.brands) {
    s.add(
      [b.name, b.pct ?? 'Not set', b.houzs.bills, b.houzs.sales, b.houzs.bill, b.we.bills, b.we.sales, b.we.bill, Math.round((b.we.bill - b.houzs.bill) * 100) / 100],
      brandFormats,
    )
  }
  s.add(
    ['Total', null, row.houzs.bills, row.houzs.sales, row.houzs.bill, row.we.bills, row.we.sales, row.we.bill, row.gap.bill],
    brandFormats,
  )
  XLSX.utils.book_append_sheet(wb, s.build([32, 17, 17, 18, 22, 15, 15, 19, 17]), 'Summary')

  // ── Every bill on each side ────────────────────────────────────────────
  const houzs = new SheetDraft()
  addList(houzs, null, month.houzs)
  XLSX.utils.book_append_sheet(wb, houzs.build(BILL_WIDTHS), 'Houzs pays')
  const we = new SheetDraft()
  addList(we, null, month.we)
  XLSX.utils.book_append_sheet(wb, we.build(BILL_WIDTHS), 'We pay')

  // ── The bills the two sides pay apart ──────────────────────────────────
  const apart = new SheetDraft()
  addList(apart, `We pay in ${short} · Houzs does not`, row.ours)
  apart.blank()
  addList(apart, `Houzs pays in ${short} · we do not`, row.theirs)
  XLSX.utils.book_append_sheet(wb, apart.build(BILL_WIDTHS), 'Paid apart')

  // ── The bills neither side pays ────────────────────────────────────────
  const below = new SheetDraft()
  addList(below, `Below deposit in ${short} · neither pays`, row.held)
  XLSX.utils.book_append_sheet(wb, below.build(BILL_WIDTHS), 'Below deposit')

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer
}
