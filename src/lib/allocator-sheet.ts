// The Billing Allocator on the sheet (2026-10-07; the user approved the
// allocator sample and picked 每家一栏 — the split as one column per company).
// The figures behind the summary cards, the matrix's columns and the By
// company table live here, so the Records tab and the page only draw them.

export interface SheetTxnDetail {
  /** company uuid, `dept:<uuid>` for a department, null = HV's own share. */
  companyId: string | null
  companyLabel: string
  amount: number
  isOwnShare: boolean
}

export interface SheetTxn {
  id: string
  txnNo: string
  description: string
  amount: number
  method: string
  /** invoices.reference_no of the batch that billed it; null = never billed. */
  billedRef: string | null
  /** true while that batch still has live invoices — the allocation is billed. */
  locked: boolean
  details: SheetTxnDetail[]
}

export interface SheetInvoice {
  id: string
  invoiceNo: string
  /** The bill-to target, encoded like a detail's companyId. */
  companyId: string
  status: string
}

export interface AllocatorSummary {
  /** Every expense allocated this month. */
  allocated: number
  txnCount: number
  /** Batches that still have live invoices. */
  batchCount: number
  /** What the allocations not yet billed would bill (HV's own share left out). */
  toBill: number
  toBillCount: number
  /** How many companies / departments those would bill. */
  toBillTargets: number
  /** What the billed allocations bill. */
  billed: number
  billedCount: number
  /** Live allocator invoices of the month, every batch. */
  invoiceCount: number
  /** What HV keeps — shown, never billed. */
  ownShare: number
}

const r2 = (n: number) => Math.round(n * 100) / 100
const DEPT_SUFFIX = / \(dept\)$/
const isDept = (id: string | null) => !!id && id.startsWith('dept:')
// (The matrix of one column per company went with the user's 2026-10-09 pick
// of the handoff's single Split column.)
const targetLabel = (label: string) => label.replace(DEPT_SUFFIX, '')

export function allocatorSummary(txns: SheetTxn[], invoices: SheetInvoice[]): AllocatorSummary {
  let allocated = 0
  let toBill = 0
  let toBillCount = 0
  let billed = 0
  let billedCount = 0
  let ownShare = 0
  const toBillTargets = new Set<string>()
  const batches = new Set<string>()
  for (const t of txns) {
    allocated += t.amount
    if (t.locked) {
      billedCount++
      if (t.billedRef) batches.add(t.billedRef)
    } else {
      toBillCount++
    }
    for (const d of t.details) {
      if (d.isOwnShare || d.companyId === null) {
        ownShare += d.amount
        continue
      }
      if (t.locked) billed += d.amount
      else {
        toBill += d.amount
        toBillTargets.add(d.companyId)
      }
    }
  }
  return {
    allocated: r2(allocated),
    txnCount: txns.length,
    batchCount: batches.size,
    toBill: r2(toBill),
    toBillCount,
    toBillTargets: toBillTargets.size,
    billed: r2(billed),
    billedCount,
    invoiceCount: invoices.length,
    ownShare: r2(ownShare),
  }
}

/** The Split column (2026-10-09, the handoff): each company's share of the
 *  amount as a percentage — "2990 3.9% · CAR 19.4%" — HV's own share left out. */
export function splitSummary(t: Pick<SheetTxn, 'amount' | 'details'>): string {
  const parts = t.details
    .filter((d) => !d.isOwnShare && d.companyId !== null)
    .map((d) => `${targetLabel(d.companyLabel)} ${t.amount > 0 ? ((d.amount / t.amount) * 100).toFixed(1) : '0.0'}%`)
  return parts.length > 0 ? parts.join(' · ') : '—'
}

export interface ByCompanyRow {
  id: string | null
  label: string
  own: boolean
  dept: boolean
  /** The target's share of the month, billed or not. */
  share: number
  billed: number
  toBill: number
  invoices: Array<{ id: string; invoiceNo: string; status: string }>
}

/** Each target's share of the month, what is billed, what is still to bill,
 *  and its invoices — largest share first, HV's own share at the end. */
export function byCompanyRows(txns: SheetTxn[], invoices: SheetInvoice[]): ByCompanyRow[] {
  const rows = new Map<string | null, ByCompanyRow>()
  const rowFor = (id: string | null, label: string): ByCompanyRow => {
    let row = rows.get(id)
    if (!row) {
      row = { id, label, own: id === null, dept: isDept(id), share: 0, billed: 0, toBill: 0, invoices: [] }
      rows.set(id, row)
    }
    return row
  }
  for (const t of txns) {
    for (const d of t.details) {
      const own = d.isOwnShare || d.companyId === null
      const row = own ? rowFor(null, 'HV own') : rowFor(d.companyId, targetLabel(d.companyLabel))
      row.share += d.amount
      if (own) continue
      if (t.locked) row.billed += d.amount
      else row.toBill += d.amount
    }
  }
  for (const inv of [...invoices].sort((a, b) => a.invoiceNo.localeCompare(b.invoiceNo))) {
    const row = rows.get(inv.companyId)
    if (row) row.invoices.push({ id: inv.id, invoiceNo: inv.invoiceNo, status: inv.status })
  }
  const out = [...rows.values()].map((r) => ({ ...r, share: r2(r.share), billed: r2(r.billed), toBill: r2(r.toBill) }))
  return out.sort((a, b) => Number(a.own) - Number(b.own) || b.share - a.share || a.label.localeCompare(b.label))
}

/** What the Batch column says: the batch's reference, or that it is not billed. */
export function batchLabel(t: Pick<SheetTxn, 'billedRef' | 'locked'>): string {
  return t.locked && t.billedRef ? t.billedRef : 'not billed'
}

const METHOD: Record<string, string> = { headcount: 'Headcount', percentage: 'Percentage', equal: 'Equal', custom: 'Custom' }

/** A method in words: Headcount, Percentage, Equal, Custom. */
export function methodLabel(method: string): string {
  return METHOD[method] ?? method
}

/** A record's line in Records (2026-10-14, the revamp v2's D11 — the design's
 *  *Headcount split · Batch 3 · Oct*): how it was split, and its batch. */
export function recordLine(t: Pick<SheetTxn, 'method' | 'billedRef' | 'locked'>): string {
  return `${methodLabel(t.method)} split · ${batchLabel(t)}`
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const money = (v: unknown) => (v == null || v === '' ? '—' : `RM ${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const hcList = (v: unknown) => (v ? `${MON[Number(String(v).slice(5, 7)) - 1]} ${String(v).slice(0, 4)} snapshot` : 'current list')

/** One change to an allocation (`alloc_txns`, as `audit_changes()` gives it), in a line — its full page's audit log (D06). */
export function allocationChangeLine(c: { op: 'INSERT' | 'UPDATE' | 'DELETE'; old_row: Record<string, unknown> | null; new_row: Record<string, unknown> | null; changed: string[] | null }): string {
  const after = c.new_row ?? {}
  const before = c.old_row ?? {}
  if (c.op === 'INSERT') return `Recorded ${after.txn_no ?? 'the allocation'} · ${money(after.amount)} · ${after.description ?? ''}`.trim()
  if (c.op === 'DELETE') return 'Deleted'
  const parts: string[] = []
  for (const key of c.changed ?? []) {
    if (key === 'billed_ref') parts.push(after.billed_ref ? (before.billed_ref ? `Billed again under ${after.billed_ref}` : `Billed under ${after.billed_ref}`) : `Released from ${before.billed_ref}`)
    else if (key === 'amount') parts.push(`Amount ${money(before.amount)} → ${money(after.amount)}`)
    else if (key === 'method') parts.push(`Method ${methodLabel(String(before.method ?? ''))} → ${methodLabel(String(after.method ?? ''))}`)
    else if (key === 'hc_period') parts.push(`Headcount ${hcList(before.hc_period)} → ${hcList(after.hc_period)}`)
    else if (key === 'description') parts.push('Description changed')
    else if (key === 'category_id') parts.push('Category changed')
    else if (key === 'updated_at') continue
    else parts.push(`${key.replace(/_id$/, '').replace(/_/g, ' ')} changed`.replace(/^./, (ch) => ch.toUpperCase()))
  }
  // A correction saved the same figures: its split was worked out again all the same.
  return parts.length > 0 ? parts.join(' · ') : 'Corrected — the split worked out again'
}

/** A share in words (the design's preview, *5 staff · 19.4%*): the heads
 *  behind a headcount share, an equal share as such, else its part of the
 *  amount. `detail` is the engine's — "Head: 3.25/16.75 (2026-09)",
 *  "Equal: 1/7", "17.5%", "Custom". */
export function shareLine(detail: string, amount: number, total: number): string {
  const pct = `${total > 0 ? ((amount / total) * 100).toFixed(1) : '0.0'}%`
  const heads = /^Head: ([\d.]+)\//.exec(detail)
  if (heads) return `${Number(heads[1])} staff · ${pct}`
  if (detail.startsWith('Equal')) return 'equal share'
  return pct
}
