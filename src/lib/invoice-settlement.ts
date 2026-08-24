// Pure helpers for consolidated invoice settlement. No Supabase/server
// imports so both the server action and the client list can use them.
// (dept-registry's primed store is plain module state — still client-safe.)

import { primedModeToSegment, primedSegmentToPool } from './dept-registry'

export interface SettleableInvoice {
  id: string
  status: string
  billable_to_type: string | null
  company_id: string | null
  billable_to_freetext_name: string | null
  total_amount: number | string
  /** Σ non-voided receipts already recorded against this invoice (partial
   *  payments, user 2026-08-11). Omitted/0 = untouched invoice. */
  paid_to_date?: number | string
  /** Σ APPROVED credit notes against this invoice (2026-08-19) — reduces the
   *  balance exactly like a receipt does. Draft CNs don't count. */
  credited_to_date?: number | string
}

/** Stable key identifying the payer. Subsidiary invoices key off company_id;
 *  director/freetext invoices key off the freetext payee name. */
export function payeeKey(inv: SettleableInvoice): string {
  if (inv.company_id) return `company:${inv.company_id}`
  return `freetext:${inv.billable_to_freetext_name ?? ''}`
}

export type ConsolidationCheck =
  | {
      ok: true
      payeeKey: string
      /** What this receipt collects: Σ remaining balances, or the partial amount. */
      total: number
      /** id → outstanding balance BEFORE this receipt (total − paid_to_date). */
      remainingById: Record<string, number>
      /** true when a partialAmount below the single invoice's balance was given —
       *  the invoice stays open (issued) after this receipt. */
      isPartial: boolean
    }
  | { ok: false; error: string }

/** A consolidated receipt may only cover issued, non-inter-billing invoices
 *  of a SINGLE payer. Collects each invoice's REMAINING balance (total −
 *  paid_to_date); a `partialAmount` is allowed only when exactly ONE invoice
 *  is selected and must be within its balance — below it, the receipt is a
 *  part-payment and the invoice stays open. */
export function validateConsolidation(
  invoices: SettleableInvoice[],
  opts?: { partialAmount?: number },
): ConsolidationCheck {
  if (invoices.length === 0) return { ok: false, error: 'No invoices selected' }
  for (const i of invoices) {
    if (i.status !== 'issued') {
      return { ok: false, error: `Invoice ${i.id} is ${i.status}, expected issued` }
    }
    if (i.billable_to_type === 'dept_pool') {
      return { ok: false, error: 'Inter-billing (dept_pool) invoices must be settled individually' }
    }
    if (!i.company_id && !i.billable_to_freetext_name) {
      return { ok: false, error: `Invoice ${i.id} has no identifiable payee` }
    }
  }
  const keys = new Set(invoices.map(payeeKey))
  if (keys.size > 1) {
    return { ok: false, error: '一张收据只能结同一家公司的单，请只勾选同一家公司的发票' }
  }
  // Sum in integer cents to avoid floating-point drift, then convert back.
  let totalCents = 0
  const remainingById: Record<string, number> = {}
  for (const i of invoices) {
    const cents = Math.round(Number(i.total_amount) * 100)
    if (Number.isNaN(cents)) {
      return { ok: false, error: `Invoice ${i.id} has an invalid total_amount` }
    }
    const paidCents = Math.round(Number(i.paid_to_date ?? 0) * 100)
    if (Number.isNaN(paidCents)) {
      return { ok: false, error: `Invoice ${i.id} has an invalid paid_to_date` }
    }
    const creditedCents = Math.round(Number(i.credited_to_date ?? 0) * 100)
    if (Number.isNaN(creditedCents)) {
      return { ok: false, error: `Invoice ${i.id} has an invalid credited_to_date` }
    }
    const remainingCents = cents - paidCents - creditedCents
    if (remainingCents <= 0) {
      return { ok: false, error: `Invoice ${i.id} is already fully collected` }
    }
    remainingById[i.id] = remainingCents / 100
    totalCents += remainingCents
  }

  let isPartial = false
  if (opts?.partialAmount != null) {
    if (invoices.length !== 1) {
      return { ok: false, error: 'A partial amount only works with a single invoice selected' }
    }
    const partialCents = Math.round(Number(opts.partialAmount) * 100)
    if (Number.isNaN(partialCents) || partialCents <= 0) {
      return { ok: false, error: 'Amount received must be greater than 0' }
    }
    if (partialCents > totalCents) {
      return {
        ok: false,
        error: `Amount received exceeds the invoice balance (RM ${(totalCents / 100).toFixed(2)})`,
      }
    }
    isPartial = partialCents < totalCents
    totalCents = partialCents
  }

  return { ok: true, payeeKey: [...keys][0], total: totalCents / 100, remainingById, isPartial }
}

export interface AttributableInvoice {
  id: string
  invoice_no: string | null
  billing_mode: string
  total_amount: number | string
}

export interface PoolAttribution {
  pool: string
  amount: number
  invoiceNo: string
}

/** Split a consolidated settlement back to each invoice's dept pool.
 *  A consolidated receipt can span departments (e.g. a marketing_project
 *  invoice + a venture_attribution invoice on the same company), so the cash
 *  must be attributed PER INVOICE via its billing_mode — never lumped under a
 *  single pool. `modeToPool` is INVOICE_BILLING_MODE_TO_POOL; unmapped modes
 *  fall back to the venture pool. */
export function poolAttributions(
  invoices: AttributableInvoice[],
  modeToPool: Record<string, string>,
  fallbackPool = 'venture_pool',
): PoolAttribution[] {
  return invoices.map((i) => ({
    pool: modeToPool[i.billing_mode] ?? fallbackPool,
    amount: Math.round(Number(i.total_amount) * 100) / 100,
    invoiceNo: i.invoice_no ?? i.id.slice(0, 8),
  }))
}

// Mirrors the SQL billing_mode_to_segment (IMMUTABLE) so the TS settlement
// path tags the bank-in JE with the same segment the revenue used at issue.
// director_attribution → 'director': its settlement cash lands in the
// DIRECTOR pool (dept_pool_director), so the GL segment must match — the old
// 'director_office' mapping forked the two ledgers by 65,931.62 (mig
// 20260610010000 fixed the SQL side the same day).
const BILLING_MODE_TO_SEGMENT: Record<string, string> = {
  marketing_project: 'marketing',
  hr_attribution: 'hr',
  finance_attribution: 'finance',
  director_office_attribution: 'director_office',
  director_attribution: 'director',
}

export function segmentForBillingMode(
  mode: string,
  /** Dynamic full departments (dept-registry extraBillingModeToSegment). */
  extra?: Record<string, string>,
): string {
  return BILLING_MODE_TO_SEGMENT[mode] ?? extra?.[mode] ?? primedModeToSegment()[mode] ?? 'corporate'
}

// Inverse of the billing_mode→pool routing, keyed by gl_segment. Which dept
// pool a segment's revenue/cash credits. Mirrors INVOICE_BILLING_MODE_TO_POOL
// so a consolidated payroll invoice's per-line segments settle to the same
// pools the equivalent single-mode invoices would.
const SEGMENT_TO_POOL: Record<string, string> = {
  hr: 'dept_pool_hr',
  finance: 'dept_pool_finance',
  director_office: 'dept_pool_director_office',
  director: 'dept_pool_director',
  marketing: 'dept_pool_marketing',
}

export function segmentToPoolKey(
  segment: string,
  /** Dynamic full departments (dept-registry extraSegmentToPool). */
  extra?: Record<string, string>,
): string {
  return SEGMENT_TO_POOL[segment] ?? extra?.[segment] ?? primedSegmentToPool()[segment] ?? 'venture_pool'
}

export interface SegmentedLine {
  amount: number | string
  segment: string | null
}

export interface SegmentAttribution {
  segment: string
  pool: string
  amount: number
}

/** Group a consolidated invoice's lines by gl_segment, summing amounts in
 *  integer cents (no float drift). Lines with no segment fall back to the
 *  invoice-level billing_mode's segment, so a legacy single-mode invoice
 *  collapses to exactly one group == its whole total. Preserves first-seen
 *  segment order. Each group carries the dept pool its cash/revenue routes to. */
export function lineAttributions(
  lines: SegmentedLine[],
  invoiceBillingMode: string,
  /** Dynamic full departments — mode→segment and segment→pool extras. */
  extras?: { modeToSegment?: Record<string, string>; segmentToPool?: Record<string, string> },
): SegmentAttribution[] {
  const fallbackSeg = segmentForBillingMode(invoiceBillingMode, extras?.modeToSegment)
  const order: string[] = []
  const cents = new Map<string, number>()
  for (const ln of lines) {
    const seg = ln.segment ?? fallbackSeg
    if (!cents.has(seg)) {
      cents.set(seg, 0)
      order.push(seg)
    }
    cents.set(seg, cents.get(seg)! + Math.round(Number(ln.amount) * 100))
  }
  return order.map((seg) => ({
    segment: seg,
    pool: segmentToPoolKey(seg, extras?.segmentToPool),
    amount: cents.get(seg)! / 100,
  }))
}
