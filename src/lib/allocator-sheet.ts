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

export interface MatrixColumn {
  /** null = HV's own share. */
  id: string | null
  label: string
  own: boolean
}

/** One column per target the month allocates to — the companies in the order
 *  given (the pickers' order), the departments after them, HV own last — and
 *  no column for a company the month never touched. */
export function matrixColumns(txns: SheetTxn[], companies: Array<{ id: string; label: string }>): MatrixColumn[] {
  const seen = new Map<string, string>()
  let own = false
  for (const t of txns) {
    for (const d of t.details) {
      if (d.isOwnShare || d.companyId === null) {
        own = true
        continue
      }
      if (!seen.has(d.companyId)) seen.set(d.companyId, targetLabel(d.companyLabel))
    }
  }
  const out: MatrixColumn[] = []
  for (const c of companies) {
    if (seen.has(c.id)) {
      out.push({ id: c.id, label: c.label, own: false })
      seen.delete(c.id)
    }
  }
  // Departments and anything else the companies list does not carry (a
  // switched-off company in an old month), in first-seen order.
  const rest = [...seen.entries()].sort((a, b) => Number(isDept(b[0])) - Number(isDept(a[0])) || 0)
  for (const [id, label] of rest) out.push({ id, label, own: false })
  if (own) out.push({ id: null, label: 'HV own', own: true })
  return out
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
