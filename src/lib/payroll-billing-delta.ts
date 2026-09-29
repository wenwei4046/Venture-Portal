// 对数补差 (user 2026-09-04): after HR corrects payroll POST-issue, compare
// what each subsidiary SHOULD be billed (live get_staff_billing_allocation)
// against what the period's issued/paid consolidated invoices actually billed,
// per segment. Positive deltas (under-billed) become one adjustment invoice
// per company; negative deltas (over-billed) are REPORT-ONLY — consolidated
// invoices take no credit notes, so Finance handles those by hand.
//
// 2026-09-29: the gap is also split per component (Salary / Allowance / EPF /
// SOCSO / EIS), so an adjustment reads like the original invoice instead of one
// lump "payroll adjustment" line (user: "补回的我要明细拆成 salary, epf, socso,
// eis"). The split is only offered when it can be trusted — see componentDeltas.

import { PAYROLL_COMPONENTS, type AllocationComponents } from './staff-allocation'

const r2 = (n: number) => Math.round(n * 100) / 100

/** Below half a sen the difference is rounding noise, not a billing gap. */
const EPS = 0.005

export type ComponentKey = keyof AllocationComponents

const ZERO: AllocationComponents = { salary: 0, allowance: 0, epf: 0, socso: 0, eis: 0 }

export interface ShouldBillRow {
  companyId: string
  shortCode: string
  name: string
  segment: string
  deptLabel: string
  amount: number
  /** The same amount, split the way the invoice itemises it. Omit it and the
   *  segment simply falls back to a single adjustment line. */
  components?: AllocationComponents
}

export interface BilledRow {
  companyId: string
  segment: string
  amount: number
  /** Which itemised component this line was, read off its description; null
   *  when the description names none (a lump adjustment line, or anything the
   *  labels do not cover). One such line makes the whole segment unsplittable. */
  component?: ComponentKey | null
}

export interface ComponentDelta {
  key: ComponentKey
  label: string
  amount: number
}

export interface SegmentDelta {
  segment: string
  deptLabel: string
  should: number
  billed: number
  /** should − billed; positive = under-billed. */
  delta: number
  /** The positive per-component top-ups, summing EXACTLY to `delta`. Null when
   *  the split cannot be trusted: a component was over-billed while the segment
   *  as a whole was under-billed, or a billed line could not be attributed. The
   *  caller then falls back to a single line, which is always right in total. */
  componentDeltas: ComponentDelta[] | null
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

interface Cell {
  should: number
  billed: number
  shouldC: AllocationComponents
  billedC: AllocationComponents
  /** A billed line whose description named no component. */
  billedUnattributed: boolean
}

/** The positive component gaps, made to sum to `delta` to the sen. Returns null
 *  when the split would be a guess rather than a reading. */
function splitDelta(c: Cell, delta: number): ComponentDelta[] | null {
  if (delta <= EPS || c.billedUnattributed) return null
  const raw = PAYROLL_COMPONENTS.map(([key, label]) => ({
    key,
    label,
    amount: r2(c.shouldC[key] - c.billedC[key]),
  }))
  // One component over-billed inside an under-billed segment: the top-up is not
  // simply "the positive parts", so leave it as one line rather than invent it.
  if (raw.some((x) => x.amount < -EPS)) return null
  const positives = raw.filter((x) => x.amount > EPS)
  if (positives.length === 0) return null
  // Each component was rounded on its own; hand the remainder to the biggest so
  // the lines still add up to the gap exactly.
  const residual = r2(delta - r2(positives.reduce((s, x) => s + x.amount, 0)))
  if (residual !== 0) {
    const biggest = positives.reduce((a, b) => (b.amount > a.amount ? b : a))
    biggest.amount = r2(biggest.amount + residual)
  }
  return positives
}

/** Which itemised component a billed line was, read off its description.
 *  Both line builders write "<Label> - <period>…", and an adjustment writes
 *  "<Dept> <Label> adjustment - <period>", so a second 对数补差 run on the
 *  same period can read back what the first one billed. Anything else — a
 *  lump adjustment from before 2026-09-29, a hand-typed line — returns null,
 *  and that segment is topped up as one line instead of a split that would
 *  not be a reading. */
export function componentOfLine(description: string | null): ComponentKey | null {
  const text = (description ?? '').trim()
  for (const [key, label] of PAYROLL_COMPONENTS) {
    if (text.startsWith(`${label} - `) || text.includes(`${label} adjustment - `)) return key
  }
  return null
}

export function computeBillingDeltas(
  should: ShouldBillRow[],
  billed: BilledRow[],
  labelBySegment: Record<string, string>,
  companyMetaById: Map<string, { shortCode: string; name: string }>,
): CompanyBillingDelta[] {
  // companyId → segment → cell
  const byCompany = new Map<string, Map<string, Cell>>()
  const meta = new Map<string, { shortCode: string; name: string }>()

  const cell = (companyId: string, segment: string): Cell => {
    let segs = byCompany.get(companyId)
    if (!segs) {
      segs = new Map()
      byCompany.set(companyId, segs)
    }
    let c = segs.get(segment)
    if (!c) {
      c = { should: 0, billed: 0, shouldC: { ...ZERO }, billedC: { ...ZERO }, billedUnattributed: false }
      segs.set(segment, c)
    }
    return c
  }

  for (const s of should) {
    const c = cell(s.companyId, s.segment)
    c.should = r2(c.should + s.amount)
    for (const [key] of PAYROLL_COMPONENTS) c.shouldC[key] = r2(c.shouldC[key] + (s.components?.[key] ?? 0))
    if (!meta.has(s.companyId)) meta.set(s.companyId, { shortCode: s.shortCode, name: s.name })
  }
  for (const b of billed) {
    const c = cell(b.companyId, b.segment)
    c.billed = r2(c.billed + b.amount)
    if (b.component) c.billedC[b.component] = r2(c.billedC[b.component] + b.amount)
    else c.billedUnattributed = true
  }

  const out: CompanyBillingDelta[] = []
  for (const [companyId, segs] of byCompany) {
    const m = meta.get(companyId) ?? companyMetaById.get(companyId) ?? { shortCode: '—', name: '—' }
    const segments: SegmentDelta[] = []
    for (const [segment, c] of segs) {
      const raw = r2(c.should - c.billed)
      const delta = Math.abs(raw) <= EPS ? 0 : raw
      segments.push({
        segment,
        deptLabel: labelBySegment[segment] ?? segment,
        should: r2(c.should),
        billed: r2(c.billed),
        delta,
        componentDeltas: splitDelta(c, delta),
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
