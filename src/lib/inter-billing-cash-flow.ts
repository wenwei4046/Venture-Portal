// Inter-billing / own-share → cash-flow bridge.
//
// Internal cost reallocations between a department and Venture (Office) settle
// ONLY in the dept_pools management ledger — a conceptual cash transfer within
// the Hong Leong bank, with NO GL journal entry (there is no real bank movement;
// HV's cash is commingled). So the GL-driven Cash Flow, read from journal_lines,
// can't see them — a segment's closing cash comes out equal to its raw GL bank
// slice, diverging from its Dept Pool balance by the net it reallocated.
//
// Every reallocation is recorded as a PAIR sharing one `HV-OR-…` PV reference:
//   payer   : dept_pools `inter_billing_out`  (−, its slice down)
//   receiver: dept_pools `np_in`              (+, its slice up)
// Both directions occur — a dept paying Venture (Office) its share (inter-billing)
// AND Venture (Office) paying a dept back its own share (own-share). So the PAYER
// is always the `inter_billing_out` row (which may be a real dept OR Venture
// Office), and the RECEIVER is the `np_in` row carrying the same PV ref.
//
// To make each segment's Cash Flow tie to its Dept Pool, we feed SYNTHETIC lines
// into buildCashFlow — for each side, a bank leg + a Financing "Inter-billing"
// leg. These exist only in the report computation (never the GL); payer and
// receiver net to zero, so the consolidated (all-segments) Cash Flow is unchanged
// while each single-segment view now closes at its Dept Pool balance. This
// mirrors how an in-house-bank participant's cash flow carries a "transfer
// to/from the in-house bank" financing line.

import type { CoaAccount, GlLine } from './gl-reports'
import type { CashFlowLayout } from './cash-flow-custom'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Pseudo account code for the synthetic Financing transfer legs. */
export const INTERBILL_TRANSFER_CODE = 'IB-XFER'

/** Pseudo COA account so buildCashFlow files the transfer under Financing. */
export const interBillTransferAccount: CoaAccount = {
  code: INTERBILL_TRANSFER_CODE,
  name: 'Inter-billing (internal transfer)',
  type: 'equity', // unused for cash flow — cash_flow_category drives categorisation
  parent_code: null,
  cash_flow_category: 'financing',
}

/** Mig 20260721: payroll funding is a dept_pools-only reallocation too — each
 *  department hands its contribution to HR custody with NO per-dept GL bank
 *  line (only one hr-segment staging JE). Same bridge treatment, its own
 *  Financing line so the report reads "transfer to HR payroll custody". */
export const PAYROLL_XFER_CODE = 'PY-XFER'

export const payrollCustodyAccount: CoaAccount = {
  code: PAYROLL_XFER_CODE,
  name: 'Payroll custody (internal transfer)',
  type: 'equity',
  parent_code: null,
  cash_flow_category: 'financing',
}

/**
 * Slot the synthetic transfer account into a custom cash-flow layout's Financing
 * category, so the monthly (custom-layout) report files it under Financing
 * Activities instead of the red "Unassigned" bucket (a saved layout can't know a
 * synthetic code). Applied at render time — never mutates the stored layout.
 */
export function ensureInterBillCategory(layout: CashFlowLayout): CashFlowLayout {
  const codes = [INTERBILL_TRANSFER_CODE, PAYROLL_XFER_CODE]
  const missing = codes.filter(
    (code) => !layout.categories.some((c) => c.accounts.includes(code)),
  )
  if (missing.length === 0) return layout
  const cats = layout.categories.map((c) => ({ ...c, accounts: [...c.accounts] }))
  const fin = cats.find((c) => c.id === 'financing') ?? cats.find((c) => /financing/i.test(c.name))
  if (fin) fin.accounts.push(...missing)
  else cats.push({ id: 'financing', name: 'Financing Activities', accounts: [...missing] })
  return { categories: cats }
}

// Dept name → GL segment. Venture Office (the internal-bank hub) is 'corporate'.
const DEPT_TO_SEGMENT: Record<string, string> = {
  Marketing: 'marketing',
  HR: 'hr',
  Finance: 'finance',
  'Director Office': 'director_office',
  Director: 'director',
  'Venture Office': 'corporate',
}

const PVREF = /HV-OR-\d+-\d+/
const PVREF_PV = /HV-PV-\d+-\d+/

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export interface TransferSide {
  deptName: string
  amount: number
  date: string // YYYY-MM-DD (settle date)
  direction: 'out' | 'in'
  /** Which internal-transfer flavour this side belongs to (drives the pseudo
   *  Financing account + line labels). Default: 'interbill'. */
  kind?: 'interbill' | 'payroll'
}

function mkLine(
  entry_id: string,
  account_code: string,
  debit: number,
  credit: number,
  date: string,
  segment: string,
  description: string,
): GlLine {
  return {
    account_code,
    debit,
    credit,
    description,
    entry_id,
    date,
    entry_no: null,
    entry_description: description,
    segment,
    ref_type: 'inter_billing_transfer',
    ref_id: null,
    party: null,
  }
}

/**
 * Pure: turn reallocation sides into synthetic cash-flow lines. Each side is a
 * self-balancing 2-leg entry (bank + Financing transfer) tagged its segment;
 * 'out' drops that segment's cash, 'in' raises it.
 */
export function buildInterBillingCashFlowLines(sides: TransferSide[], bankCode: string): GlLine[] {
  const lines: GlLine[] = []
  let i = 0
  for (const s of sides) {
    const seg = DEPT_TO_SEGMENT[s.deptName]
    const amt = round2(s.amount)
    const date = (s.date ?? '').slice(0, 10)
    if (!seg || !(amt > 0) || !date) continue
    const payroll = s.kind === 'payroll'
    const xferCode = payroll ? PAYROLL_XFER_CODE : INTERBILL_TRANSFER_CODE
    const id = `${payroll ? 'pyx' : 'ibx'}-${s.direction}-${i++}`
    if (s.direction === 'out') {
      lines.push(
        mkLine(id, bankCode, 0, amt, date, seg,
          payroll ? 'Transfer to HR payroll custody' : 'Inter-billing transfer out'),
        mkLine(id, xferCode, amt, 0, date, seg,
          payroll ? `Payroll custody paid in — ${s.deptName}` : `Inter-billing paid — ${s.deptName}`),
      )
    } else {
      lines.push(
        mkLine(id, bankCode, amt, 0, date, seg,
          payroll ? 'Payroll custody received' : 'Inter-billing transfer in'),
        mkLine(id, xferCode, 0, amt, date, seg,
          payroll ? `Payroll custody received — ${s.deptName}` : `Inter-billing received — ${s.deptName}`),
      )
    }
  }
  return lines
}

interface PoolRow {
  amount: number | null
  created_at: string | null
  description: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  departments: any
}

/**
 * Fetch reallocation settles and return synthetic cash-flow lines + the pseudo
 * account. Payer = every `inter_billing_out`; receiver = the `np_in` carrying the
 * same `HV-OR-…` PV ref (which excludes ordinary external receipts). Resilient:
 * on any read error (e.g. a dept_manager RLS-blocked from dept_pools) it returns
 * no lines, so the Cash Flow still renders (just un-adjusted, as before).
 */
export async function fetchInterBillingCashFlow(
  supabase: SupabaseClient,
  bankCodes: ReadonlySet<string>,
): Promise<{ lines: GlLine[]; account: CoaAccount; payrollAccount: CoaAccount }> {
  const bankCode = bankCodes.has('3000')
    ? '3000'
    : (bankCodes.values().next().value ?? '3000')
  try {
    const [payRes, recRes, custodyRes, fundRes] = await Promise.all([
      supabase
        .from('dept_pools')
        .select('amount, created_at, description, departments!inner(name)')
        .eq('transaction_type', 'inter_billing_out'),
      supabase
        .from('dept_pools')
        .select('amount, created_at, description, departments!inner(name)')
        .eq('transaction_type', 'np_in')
        .like('description', 'PV HV-OR-%'),
      // Payroll custody receipts — the funding PV parks the FULL round in HR's
      // pool; unique marker written by approve_single_voucher.
      supabase
        .from('dept_pools')
        .select('amount, created_at, description, departments!inner(name)')
        .eq('transaction_type', 'np_in')
        .like('description', '%payroll fund → HR custody%'),
      // Payroll funding drains — each department's typed contribution.
      supabase
        .from('dept_pools')
        .select('amount, created_at, description, departments!inner(name)')
        .eq('transaction_type', 'expense_out')
        .like('description', 'PV HV-PV-%: Payroll bank transfer%'),
    ])
    if (payRes.error) throw payRes.error
    if (recRes.error) throw recRes.error
    if (custodyRes.error) throw custodyRes.error
    if (fundRes.error) throw fundRes.error

    const payRows = (payRes.data ?? []) as unknown as PoolRow[]
    const recRows = (recRes.data ?? []) as unknown as PoolRow[]
    const custodyRows = (custodyRes.data ?? []) as unknown as PoolRow[]
    const fundRows = (fundRes.data ?? []) as unknown as PoolRow[]

    const pvref = (d: string | null): string | null => d?.match(PVREF)?.[0] ?? null
    const payerPvrefs = new Set(payRows.map((r) => pvref(r.description)).filter(Boolean) as string[])

    const sides: TransferSide[] = []
    for (const r of payRows) {
      sides.push({
        deptName: (r.departments?.name as string) ?? '',
        amount: Number(r.amount ?? 0),
        date: String(r.created_at ?? '').slice(0, 10),
        direction: 'out',
      })
    }
    // Receivers: only np_in whose PV ref matches a payer (a reallocation, not a
    // real external receipt — those never share a PV with an inter_billing_out).
    for (const r of recRows) {
      const ref = pvref(r.description)
      if (ref && payerPvrefs.has(ref)) {
        sides.push({
          deptName: (r.departments?.name as string) ?? '',
          amount: Number(r.amount ?? 0),
          date: String(r.created_at ?? '').slice(0, 10),
          direction: 'in',
        })
      }
    }

    // Payroll custody: pair funding drains to custody receipts by the funding
    // PV ref, so only true custody rounds bridge (any similarly-worded drain
    // without a custody twin is left alone).
    const pvrefPv = (d: string | null): string | null => d?.match(PVREF_PV)?.[0] ?? null
    const custodyRefs = new Set(custodyRows.map((r) => pvrefPv(r.description)).filter(Boolean) as string[])
    for (const r of fundRows) {
      const ref = pvrefPv(r.description)
      if (ref && custodyRefs.has(ref)) {
        sides.push({
          deptName: (r.departments?.name as string) ?? '',
          amount: Number(r.amount ?? 0),
          date: String(r.created_at ?? '').slice(0, 10),
          direction: 'out',
          kind: 'payroll',
        })
      }
    }
    for (const r of custodyRows) {
      sides.push({
        deptName: (r.departments?.name as string) ?? '',
        amount: Number(r.amount ?? 0),
        date: String(r.created_at ?? '').slice(0, 10),
        direction: 'in',
        kind: 'payroll',
      })
    }

    return {
      lines: buildInterBillingCashFlowLines(sides, bankCode),
      account: interBillTransferAccount,
      payrollAccount: payrollCustodyAccount,
    }
  } catch {
    return { lines: [], account: interBillTransferAccount, payrollAccount: payrollCustodyAccount }
  }
}
