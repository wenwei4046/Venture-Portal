import type { CommissionOrderRow, WorkbenchPerson } from './workbench'
import type { RowOrigin } from './row-origin'

/**
 * SALES BY BRAND & BILLING (2026-11-11, the user: an Export on the Comm Cal
 * month page, "the detail same as the attached Excel" —
 * Revenue-Team-Sep-2026-Sales-by-Brand-Billing.xlsx, which HR built by hand
 * for September). One report, drawn as an Excel workbook or a PDF:
 *
 *   Summary      — each salesperson's Sales (with below deposit), Top-up
 *                  deposit, Upsales, Drop sales and total; the same totals by
 *                  brand; each brand's split; and "Houzs Venture bill to Houzs
 *                  Century" = each brand's total × its Bill to HC %.
 *   All records  — every line, one row each.
 *   one per name — that person's lines and their total.
 *
 * Only a salesperson's OWN lines (the ledger's Personal tab): overriding is
 * not sales. The brand is read off the paper's Ref No. prefix (the user chose
 * it over the bill's brand_code): HC = Akemi, ZNT = Zanotti … — each brand's
 * prefixes are set in Rules › Brands & margin bands; a Ref No. no prefix
 * claims (the ERP's own document number) falls back to the bill's brand.
 * The headers are Chinese, as the user's file (asked 2026-11-11).
 */

export type LineType = 'sales' | 'shared' | 'below_deposit' | 'topup' | 'upsell' | 'drop'

export interface BrandDef {
  code: string
  name: string
  refPrefixes: readonly string[]
  /** 0.14 = 14%; null = not set in Rules. */
  hcBillPct: number | null
}

export interface ExportLine {
  staffId: string
  name: string
  type: LineType
  erpNo: string
  refNo: string
  /** `YYYY-MM-DD`, or '' for an upsell / drop (no bill of its own). */
  date: string
  venue: string
  customer: string
  /** A brand's code, or '' when nothing names one. */
  brandCode: string
  /** The whole bill (transport included) — null on an upsell / drop. */
  wholeTotal: number | null
  /** This holder's part of the bill, 0–1 — null on an upsell / drop. */
  sharePct: number | null
  /** What earns commission, this holder's part. */
  sales: number
  rate: number
  commission: number
  source: string
  note: string
}

/** What the ledger knows of a row beyond the row itself. */
export interface LineContext {
  /** The Status the ledger shows (`rowOrigin`); null for the month's own bill. */
  originOf: (row: CommissionOrderRow) => RowOrigin | null
  /** An upsell / drop's bill: its paper and ERP document. */
  upsaleOf: (row: CommissionOrderRow) => { originalRef: string; erpDocNo: string | null } | null
  customerOf: (orderId: string) => string | null
  /** The bill's own brand (`sales_orders.brand_code`) — the fallback when its Ref No. names none. */
  billBrandOf: (orderId: string) => string | null
}

export const TYPE_LABEL: Record<LineType, string> = {
  sales: 'Sales',
  shared: 'Sales（shared bill）',
  below_deposit: 'Sales（below deposit，未给佣金）',
  topup: 'Top-up deposit',
  upsell: 'Upsales',
  drop: 'Drop sales',
}

const TYPE_ORDER: Record<LineType, number> = { sales: 0, shared: 0, below_deposit: 0, topup: 1, upsell: 2, drop: 3 }

const r2 = (n: number) => Math.round(n * 100) / 100

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "2026-10-01" → "October 2026". */
export function monthLong(period: string): string {
  const [y, m] = period.slice(0, 7).split('-').map(Number)
  return `${MONTHS_LONG[m - 1]} ${y}`
}

/** "2026-10-01" → 10. */
function monthNo(period: string): number {
  return Number(period.slice(5, 7))
}

function monthShort(period: string): string {
  const [y, m] = period.slice(0, 7).split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

/**
 * The brand a paper Ref No. names: the longest prefix of any brand that the
 * Ref No. starts with AND is followed by a digit — so HC6316 is HC's, while
 * HC-SO-2609-071 (an ERP document number standing in for a missing paper) is
 * nobody's. Null when no prefix claims it.
 */
export function brandOfRef(refNo: string | null | undefined, brands: readonly BrandDef[]): string | null {
  const ref = (refNo ?? '').replace(/\s+/g, '').toUpperCase()
  if (!ref) return null
  let best: { code: string; len: number } | null = null
  for (const brand of brands) {
    for (const raw of brand.refPrefixes) {
      const prefix = raw.trim().toUpperCase()
      if (!prefix || !ref.startsWith(prefix) || !/\d/.test(ref.charAt(prefix.length))) continue
      if (!best || prefix.length > best.len) best = { code: brand.code, len: prefix.length }
    }
  }
  return best?.code ?? null
}

function money(n: number): string {
  return Math.abs(n).toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function pctWord(p: number): string {
  return `${Math.round(p * 1000) / 10}%`
}

/** Every line of each salesperson's own ledger the month counts as sales. */
export function exportLines(
  people: readonly WorkbenchPerson[],
  period: string,
  brands: readonly BrandDef[],
  ctx: LineContext,
): ExportLine[] {
  const month = period.slice(0, 10)
  const lines: ExportLine[] = []
  for (const person of people) {
    for (const row of person.personalRows) {
      const line = lineOf(person, row, month, brands, ctx)
      if (line) lines.push(line)
    }
  }
  return sortLines(lines)
}

function lineOf(
  person: WorkbenchPerson, row: CommissionOrderRow, month: string, brands: readonly BrandDef[], ctx: LineContext,
): ExportLine | null {
  if (row.status === 'excluded' || row.status === 'already_released') return null
  const origin = ctx.originOf(row)
  const base = {
    staffId: person.staffId,
    name: person.name,
    rate: row.productRate,
    sales: r2(row.commissionableValue),
    commission: r2(row.totalCommission),
  }

  if (row.upsale) {
    const fact = ctx.upsaleOf(row)
    const drop = origin ? origin.kind === 'drop' : row.commissionableValue < 0
    const ref = fact?.originalRef ?? ''
    const notes: string[] = []
    if (origin?.fromMonth) notes.push(`${monthShort(origin.fromMonth)} 的单`)
    if (origin && origin.label !== 'Drop sales' && origin.label !== 'Upsell') notes.push(origin.label)
    return {
      ...base,
      type: drop ? 'drop' : 'upsell',
      erpNo: fact?.erpDocNo ?? '',
      refNo: ref,
      date: '',
      venue: '',
      customer: '',
      brandCode: brandOfRef(ref, brands) ?? '',
      wholeTotal: null,
      sharePct: null,
      source: fact?.erpDocNo ? 'ERP' : '人手',
      note: notes.join('；'),
    }
  }

  const own = row.periodMonth.slice(0, 10)
  let type: LineType
  const notes: string[] = []
  // A bill of an earlier month (or an old bill from before the feed, 2026-11-07)
  // still waiting on its deposit is not this month's at all.
  if (origin?.kind === 'held') return null
  if (origin?.kind === 'deposit' || (own < month && origin?.kind !== 'late')) {
    // Released by its deposit: the Top-up deposit.
    type = 'topup'
    const from = origin?.fromMonth ?? own
    notes.push(`${monthShort(from)} 的单，顾客补够 deposit，现在补上`)
    if (origin?.detail && origin.detail !== `${monthShort(from)} bill`) notes.push(origin.detail)
  } else if (own < month) {
    // Keyed late: a sale, paid here.
    type = row.share ? 'shared' : 'sales'
    notes.push(`Late key-in：${monthShort(origin?.fromMonth ?? own)} 的单`)
  } else if (row.status === 'deposit_pending') {
    type = 'below_deposit'
    notes.push(`顾客付了 RM ${money(row.paidAmount)}，未够 deposit，补够后才给佣金`)
  } else {
    type = row.share ? 'shared' : 'sales'
    if (origin?.kind === 'late' || origin?.kind === 'early') notes.push(`${origin.label}：${origin.detail}`)
    if (origin?.kind === 'after_close') notes.push('这个月已 close，下个月才付佣金')
  }

  let sharePct = 1
  let wholeTotal = row.orderTotal
  if (row.share) {
    const mine = row.share.parts.find(part => part.staffId === person.staffId)
    sharePct = mine?.pct ?? 1
    wholeTotal = row.share.wholeTotal
    const others = row.share.parts
      .filter(part => part.staffId !== person.staffId)
      .map(part => `${part.name} ${pctWord(part.pct)}`)
      .join('、')
    const wholeSales = sharePct > 0 ? r2(row.commissionableValue / sharePct) : row.commissionableValue
    notes.unshift(`Shared bill：跟 ${others} 分（整张算佣金的 RM ${money(wholeSales)}）`)
  }

  const ref = row.refNo ?? ''
  const brandCode = brandOfRef(ref, brands) ?? ctx.billBrandOf(row.orderId) ?? row.brands[0] ?? ''
  if (!brandOfRef(ref, brands) && brandCode) {
    notes.push(ref ? `Ref No. 没有对上品牌，品牌用 ERP 的 ${brandCode}` : `没有纸单号，品牌用 ERP 的 ${brandCode}`)
  }

  return {
    ...base,
    commission: type === 'below_deposit' ? 0 : base.commission,
    type,
    erpNo: row.orderNo,
    refNo: ref,
    date: row.orderDate.slice(0, 10),
    venue: row.venue ?? '',
    customer: ctx.customerOf(row.orderId) ?? '',
    brandCode,
    wholeTotal: r2(wholeTotal),
    sharePct,
    source: 'ERP',
    note: notes.join('；'),
  }
}

/** By name; within a name its sales by date, then top-ups, upsells, drops. */
export function sortLines(lines: readonly ExportLine[]): ExportLine[] {
  return [...lines].sort((a, b) =>
    a.name.localeCompare(b.name)
    || TYPE_ORDER[a.type] - TYPE_ORDER[b.type]
    || a.date.localeCompare(b.date)
    || a.erpNo.localeCompare(b.erpNo)
    || a.refNo.localeCompare(b.refNo))
}

// ─── The report ──────────────────────────────────────────────────────────────

export interface PersonSummary {
  staffId: string
  name: string
  rate: number
  bills: number
  sales: number
  belowDeposit: number
  topup: number
  upsell: number
  drop: number
  total: number
  commission: number
}

export interface BrandColumn {
  /** '' = no brand. */
  code: string
  name: string
}

export interface BrandTotal {
  code: string
  name: string
  sales: number
  topup: number
  upsell: number
  drop: number
  total: number
  hcBillPct: number | null
  /** total × Bill to HC %; null when the % is not set. */
  bill: number | null
}

export interface BrandBillingReport {
  period: string
  /** "Revenue Team · Fair · October 2026". */
  title: string
  people: PersonSummary[]
  totals: Omit<PersonSummary, 'staffId' | 'name' | 'rate'>
  brands: BrandColumn[]
  /** staffId → brand code → total sales. */
  byBrand: Map<string, Map<string, number>>
  brandTotals: BrandTotal[]
  billTotal: number
  lines: ExportLine[]
}

const SALES_TYPES: ReadonlySet<LineType> = new Set(['sales', 'shared', 'below_deposit'])

export function brandBillingReport(
  lines: readonly ExportLine[],
  brands: readonly BrandDef[],
  period: string,
  subDepartmentName: string,
  /** Each salesperson's rate — the ledger's head. */
  rates: ReadonlyMap<string, number> = new Map(),
): BrandBillingReport {
  const sorted = sortLines(lines)
  const people = new Map<string, PersonSummary>()
  const byBrand = new Map<string, Map<string, number>>()
  const brandSums = new Map<string, Omit<BrandTotal, 'code' | 'name' | 'hcBillPct' | 'bill'>>()

  for (const line of sorted) {
    const p = people.get(line.staffId) ?? {
      staffId: line.staffId, name: line.name, rate: rates.get(line.staffId) ?? line.rate,
      bills: 0, sales: 0, belowDeposit: 0, topup: 0, upsell: 0, drop: 0, total: 0, commission: 0,
    }
    if (SALES_TYPES.has(line.type)) {
      p.bills += 1
      p.sales += line.sales
      if (line.type === 'below_deposit') p.belowDeposit += line.sales
    } else if (line.type === 'topup') p.topup += line.sales
    else if (line.type === 'upsell') p.upsell += line.sales
    else p.drop += line.sales
    p.total += line.sales
    p.commission += line.commission
    people.set(line.staffId, p)

    const mine = byBrand.get(line.staffId) ?? new Map<string, number>()
    mine.set(line.brandCode, (mine.get(line.brandCode) ?? 0) + line.sales)
    byBrand.set(line.staffId, mine)

    const b = brandSums.get(line.brandCode) ?? { sales: 0, topup: 0, upsell: 0, drop: 0, total: 0 }
    if (SALES_TYPES.has(line.type)) b.sales += line.sales
    else if (line.type === 'topup') b.topup += line.sales
    else if (line.type === 'upsell') b.upsell += line.sales
    else b.drop += line.sales
    b.total += line.sales
    brandSums.set(line.brandCode, b)
  }

  const round = <T extends object>(o: T): T =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' && k !== 'rate' && k !== 'bills' ? r2(v) : v])) as T

  const peopleList = [...people.values()].map(round).sort((a, b) => a.name.localeCompare(b.name))
  const totals = peopleList.reduce(
    (t, p) => ({
      bills: t.bills + p.bills, sales: t.sales + p.sales, belowDeposit: t.belowDeposit + p.belowDeposit,
      topup: t.topup + p.topup, upsell: t.upsell + p.upsell, drop: t.drop + p.drop,
      total: t.total + p.total, commission: t.commission + p.commission,
    }),
    { bills: 0, sales: 0, belowDeposit: 0, topup: 0, upsell: 0, drop: 0, total: 0, commission: 0 },
  )

  const nameOf = new Map(brands.map(b => [b.code, b.name]))
  const pctOf = new Map(brands.map(b => [b.code, b.hcBillPct]))
  // Biggest brand first, as the user's file; "No brand" last.
  const brandTotals: BrandTotal[] = [...brandSums.entries()]
    .map(([code, s]) => {
      const pct = code ? (pctOf.get(code) ?? null) : null
      const total = r2(s.total)
      return {
        code,
        name: code ? (nameOf.get(code) ?? code) : '没有品牌',
        sales: r2(s.sales), topup: r2(s.topup), upsell: r2(s.upsell), drop: r2(s.drop), total,
        hcBillPct: pct,
        bill: pct === null ? null : r2(total * pct),
      }
    })
    .sort((a, b) => (a.code === '' ? 1 : 0) - (b.code === '' ? 1 : 0) || b.total - a.total || a.name.localeCompare(b.name))

  return {
    period: period.slice(0, 10),
    title: `Revenue Team · ${subDepartmentName} · ${monthLong(period)}`,
    people: peopleList,
    totals: round(totals),
    brands: brandTotals.map(b => ({ code: b.code, name: b.name })),
    byBrand,
    brandTotals,
    billTotal: r2(brandTotals.reduce((t, b) => t + (b.bill ?? 0), 0)),
    lines: sorted,
  }
}

// ─── The words (Chinese, as the user's file) ────────────────────────────────

/** Every fixed piece of text the report prints — the PDF's Chinese font covers these. */
export function reportWords(period: string) {
  const m = monthNo(period)
  return {
    summaryTitle: '每个人的 Sales（含 Top-up deposit / Upsales / Drop sales）',
    summaryNote:
      'Sales = 算佣金的部分（不含运费等）；Upsales / Top-up deposit = 加；Drop sales = 减（负数）。不含 overriding。',
    personHead: ['名字', '佣金 %', '单数', `Sales（${m} 月的单）`, '其中 below deposit', 'Top-up deposit', 'Upsales', 'Drop sales', '总 Sales'],
    byBrandTitle: '按 Brand 分（看 Ref No. 开头）· 总 Sales',
    brandHead: ['Brand', `Sales（${m} 月的单）`, 'Top-up deposit', 'Upsales', 'Drop sales', '总 Sales'],
    brandSplitTitle: '每个 Brand 的合计 · 分开 Sales / Top-up deposit / Upsales / Drop sales',
    billTitle: `Houzs Venture bill to Houzs Century · ${monthLong(period)} · Bill = 总 Sales × Overriding %`,
    billHead: ['Brand', '总 Sales', 'Overriding %', 'Bill amount'],
    notSet: '未设定',
    name: '名字',
    total: '合计',
    recordsSheet: 'All records',
    summarySheet: 'Summary',
    recordHead: ['名字', '类型', 'ERP 单号', 'Ref No.（纸单）', '日期', 'Venue', '顾客', 'Brand（按 Ref No.）', '整张单金额', '我的份', 'Sales amount', '佣金 %', '佣金', '来源', '备注'],
  }
}

/** Every Chinese character the report may print outside the data itself. */
export const FIXED_CJK_TEXT = [
  ...Object.values(TYPE_LABEL),
  JSON.stringify(reportWords('2026-12-01')),
  '的单，顾客补够 deposit，现在补上',
  '顾客付了 RM ，未够 deposit，补够后才给佣金',
  '这个月已 close，下个月才付佣金',
  'Shared bill：跟 、分（整张算佣金的 RM ）',
  'Ref No. 没有对上品牌，品牌用 ERP 的',
  '没有纸单号，品牌用 ERP 的',
  'Late key-in：的单；人手没有品牌',
  '一二三四五六七八九十月第页共',
].join('')
