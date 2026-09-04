// 对数补差 (user 2026-09-04): after HR corrects payroll POST-issue, compare
// what each subsidiary SHOULD be billed (live get_staff_billing_allocation)
// against what the period's issued/paid consolidated invoices actually billed,
// per segment. Positive deltas (under-billed) become one adjustment invoice
// per company; negative deltas (over-billed) are REPORT-ONLY — consolidated
// invoices take no credit notes, so Finance handles those by hand.

const r2 = (n: number) => Math.round(n * 100) / 100

/** Below half a sen the difference is rounding noise, not a billing gap. */
const EPS = 0.005

export interface ShouldBillRow {
  companyId: string
  shortCode: string
  name: string
  segment: string
  deptLabel: string
  amount: number
}

export interface BilledRow {
  companyId: string
  segment: string
  amount: number
}

export interface SegmentDelta {
  segment: string
  deptLabel: string
  should: number
  billed: number
  /** should − billed; positive = under-billed. */
  delta: number
}

export interface CompanyBillingDelta {
  companyId: string
  shortCode: string
  name: string
  should: number
  billed: number
  delta: number
  segments: SegmentDelta[]
  /** The company has at least one issued/paid consolidated invoice this period.
   *  Without one, the gap is a MISSING invoice — use the normal generator. */
  hasIssuedInvoice: boolean
  /** Σ positive segment deltas — the adjustment invoice amount. */
  positiveTotal: number
  /** Over-billed segments (delta < 0) — surfaced, never auto-adjusted. */
  negatives: SegmentDelta[]
}

export function computeBillingDeltas(
  should: ShouldBillRow[],
  billed: BilledRow[],
  labelBySegment: Record<string, string>,
  companyMetaById: Map<string, { shortCode: string; name: string }>,
): CompanyBillingDelta[] {
  // companyId → segment → {should, billed}
  const byCompany = new Map<string, Map<string, { should: number; billed: number }>>()
  const meta = new Map<string, { shortCode: string; name: string }>()

  const cell = (companyId: string, segment: string) => {
    let segs = byCompany.get(companyId)
    if (!segs) {
      segs = new Map()
      byCompany.set(companyId, segs)
    }
    let c = segs.get(segment)
    if (!c) {
      c = { should: 0, billed: 0 }
      segs.set(segment, c)
    }
    return c
  }

  for (const s of should) {
    cell(s.companyId, s.segment).should = r2(cell(s.companyId, s.segment).should + s.amount)
    if (!meta.has(s.companyId)) meta.set(s.companyId, { shortCode: s.shortCode, name: s.name })
  }
  for (const b of billed) {
    cell(b.companyId, b.segment).billed = r2(cell(b.companyId, b.segment).billed + b.amount)
  }

  const out: CompanyBillingDelta[] = []
  for (const [companyId, segs] of byCompany) {
    const m = meta.get(companyId) ?? companyMetaById.get(companyId) ?? { shortCode: '—', name: '—' }
    const segments: SegmentDelta[] = []
    for (const [segment, c] of segs) {
      const delta = r2(c.should - c.billed)
      segments.push({
        segment,
        deptLabel: labelBySegment[segment] ?? segment,
        should: r2(c.should),
        billed: r2(c.billed),
        delta: Math.abs(delta) <= EPS ? 0 : delta,
      })
    }
    segments.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.segment.localeCompare(b.segment))
    const shouldTotal = r2(segments.reduce((s, x) => s + x.should, 0))
    const billedTotal = r2(segments.reduce((s, x) => s + x.billed, 0))
    const positiveTotal = r2(segments.filter((x) => x.delta > 0).reduce((s, x) => s + x.delta, 0))
    out.push({
      companyId,
      shortCode: m.shortCode,
      name: m.name,
      should: shouldTotal,
      billed: billedTotal,
      delta: r2(shouldTotal - billedTotal),
      segments,
      hasIssuedInvoice: billedTotal > EPS,
      positiveTotal,
      negatives: segments.filter((x) => x.delta < 0),
    })
  }
  out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.shortCode.localeCompare(b.shortCode))
  return out
}
