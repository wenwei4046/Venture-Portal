// Auto payroll accrual JVs (user 2026-08-07: "HR submit payroll fund request
// 给我，我希望同时直接帮我开jv" → trigger refined to run-approval for staff and
// submit-to-finance for directors, dated back to the payroll month:
// "payroll run 批准时，但是要放回去对的月份").
//
// Replicates Finance's manual month-end JVs EXACTLY — mapping verified to the
// sen against May/June across all five segments:
//   Dr 9030 = gross − non_statutory_allowance      (basic + OT etc, net of 扣)
//   Dr 9084 = non_statutory_allowance
//   Dr 9081/9082/9083 = EPF / SOCSO / EIS employer
//   Cr 4070 = net pay   · Cr 4071 = EPF er+ee · Cr 4072 = SOCSO er+ee
//   Cr 4072 (2nd line) = SKBBK · Cr 4073 = EIS er+ee · Cr 4074 = PCB
// One JV per segment, transaction_date = payroll month-end, tagged
// reference_type='payroll_accrual' for idempotency. If a segment's JV already
// exists with a DIFFERENT total, we refuse and tell Finance to reverse the old
// one first — never silently double-book or overwrite.

import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { postJournalEntry, type JournalLine } from '@/lib/journal'

const r2 = (n: number) => Math.round(n * 100) / 100

export interface AccrualSums {
  /** gross − non_statutory_allowance */
  basicEtc: number
  nonStatAllowance: number
  epfEr: number
  socsoEr: number
  eisEr: number
  net: number
  epfBoth: number
  socsoBoth: number
  skbbk: number
  eisBoth: number
  pcb: number
  withholdingTax?: number
}

/** Build the JV lines in Finance's manual order, skipping zero lines. */
export function buildAccrualLines(s: AccrualSums, monthLabel: string): JournalLine[] {
  const lines: JournalLine[] = []
  const dr = (accountCode: string, amount: number, label: string) => {
    if (r2(amount) > 0) lines.push({ accountCode, debit: r2(amount), description: `${label} - ${monthLabel}` })
  }
  const cr = (accountCode: string, amount: number, label: string) => {
    if (r2(amount) > 0) lines.push({ accountCode, credit: r2(amount), description: `${label} - ${monthLabel}` })
  }
  dr('9030', s.basicEtc, 'Basic Salary')
  dr('9084', s.nonStatAllowance, 'Allowance')
  dr('9081', s.epfEr, 'EPF Employer')
  dr('9082', s.socsoEr, 'SOCSO Employer')
  dr('9083', s.eisEr, 'EIS Employer')
  cr('4070', s.net, 'Salary Payable')
  cr('4071', s.epfBoth, 'EPF Payable')
  cr('4072', s.socsoBoth, 'SOCSO Payable')
  cr('4072', s.skbbk, 'SKBBK Payable')
  cr('4073', s.eisBoth, 'EIS Payable')
  cr('4074', s.pcb, 'PCB Payable')
  cr('4074', s.withholdingTax ?? 0, 'Withholding Tax Payable')
  return lines
}

export function accrualTotal(s: AccrualSums): number {
  return r2(s.basicEtc + s.nonStatAllowance + s.epfEr + s.socsoEr + s.eisEr)
}

interface PayrollRowLike {
  gross: number
  non_statutory_allowance: number
  epf_er: number
  epf_ee: number
  socso_er: number
  socso_ee: number
  eis_er: number
  eis_ee: number
  pcb: number
  withholding_tax?: number
  net: number
  skbbk_amount: number | null
}

export function sumPayrollRows(rows: PayrollRowLike[]): AccrualSums {
  const acc: AccrualSums = {
    basicEtc: 0, nonStatAllowance: 0, epfEr: 0, socsoEr: 0, eisEr: 0,
    net: 0, epfBoth: 0, socsoBoth: 0, skbbk: 0, eisBoth: 0, pcb: 0,
    withholdingTax: 0,
  }
  for (const p of rows) {
    acc.basicEtc = r2(acc.basicEtc + Number(p.gross) - Number(p.non_statutory_allowance))
    acc.nonStatAllowance = r2(acc.nonStatAllowance + Number(p.non_statutory_allowance))
    acc.epfEr = r2(acc.epfEr + Number(p.epf_er))
    acc.socsoEr = r2(acc.socsoEr + Number(p.socso_er))
    acc.eisEr = r2(acc.eisEr + Number(p.eis_er))
    acc.net = r2(acc.net + Number(p.net))
    acc.epfBoth = r2(acc.epfBoth + Number(p.epf_er) + Number(p.epf_ee))
    acc.socsoBoth = r2(acc.socsoBoth + Number(p.socso_er) + Number(p.socso_ee))
    acc.skbbk = r2(acc.skbbk + Number(p.skbbk_amount ?? 0))
    acc.eisBoth = r2(acc.eisBoth + Number(p.eis_er) + Number(p.eis_ee))
    acc.pcb = r2(acc.pcb + Number(p.pcb))
    acc.withholdingTax = r2((acc.withholdingTax ?? 0) + Number(p.withholding_tax ?? 0))
  }
  return acc
}

// IT wired 2026-09-03 (user "接上"): before this, IT staff rows mapped to no
// segment and postPayrollAccrualJVs silently DROPPED them — IT salary never
// even reached the GL accrual.
const SEGMENT_BY_DEPT: Record<string, string> = {
  HR: 'hr',
  Finance: 'finance',
  Marketing: 'marketing',
  'Director Office': 'director_office',
  IT: 'it',
}

const SEGMENT_LABEL: Record<string, string> = {
  hr: 'HR',
  finance: 'Finance',
  marketing: 'Marketing',
  director_office: 'Director Office',
  director: 'Director',
  it: 'IT',
  revenue_department: 'Revenue Department',
  // Venture Office's segment — its part of HOUZS Venture's director share (mig 20261013233000).
  corporate: 'Venture Office',
}

/** A segment as an accrual JV names it: "Venture Office Salary - Dec'27 · batch #1". */
export const segmentLabel = (segment: string): string => SEGMENT_LABEL[segment] ?? segment

export interface AccrualPostResult {
  posted: string[]
  skipped: string[]
}

interface BatchSegmentSums {
  segment: string
  gross: number | string
  non_statutory_allowance: number | string
  epf_er: number | string
  epf_ee: number | string
  socso_er: number | string
  socso_ee: number | string
  eis_er: number | string
  eis_ee: number | string
  pcb: number | string
  withholding_tax: number | string
  net: number | string
  skbbk: number | string
}

/** One segment of a batch's lines → the accrual JV's figures. */
export function batchAccrualSums(s: BatchSegmentSums): AccrualSums {
  const n = (v: number | string) => r2(Number(v ?? 0))
  return {
    basicEtc: r2(n(s.gross) - n(s.non_statutory_allowance)),
    nonStatAllowance: n(s.non_statutory_allowance),
    epfEr: n(s.epf_er),
    socsoEr: n(s.socso_er),
    eisEr: n(s.eis_er),
    net: n(s.net),
    epfBoth: r2(n(s.epf_er) + n(s.epf_ee)),
    socsoBoth: r2(n(s.socso_er) + n(s.socso_ee)),
    skbbk: n(s.skbbk),
    eisBoth: r2(n(s.eis_er) + n(s.eis_ee)),
    pcb: n(s.pcb),
    withholdingTax: n(s.withholding_tax),
  }
}

/**
 * The accrual JVs of ONE payroll batch (unified Payroll, 2026-09-27): one per
 * segment, dated to the payroll month's end, tagged with the batch as its
 * reference — so a first batch books its people in full and a resubmit books
 * only the difference it carries, directors included (segment 'director').
 * Idempotent per (batch, segment); a conflicting existing JV fails loud.
 * Sending the batch back reverses them (payroll_send_back_batch).
 */
export async function postPayrollBatchAccrualJVs(
  supabase: SupabaseClient,
  opts: { periodMonth: string; batchId: string; userId: string },
): Promise<AccrualPostResult> {
  const period = dayjs(opts.periodMonth).startOf('month').format('YYYY-MM-DD')
  const monthEnd = dayjs(period).endOf('month').format('YYYY-MM-DD')
  const monthLabel = dayjs(period).format("MMM[']YY")

  const [sumsRes, existingRes, batchRes] = await Promise.all([
    supabase.rpc('payroll_batch_accrual_sums', { p_batch_id: opts.batchId }),
    supabase.rpc('get_payroll_accrual_totals_for', { p_reference_id: opts.batchId }),
    supabase.from('payroll_batches').select('batch_no').eq('id', opts.batchId).single(),
  ])
  if (sumsRes.error) throw new Error(`Failed to read the batch: ${sumsRes.error.message}`)
  if (existingRes.error) throw new Error(`Failed to check existing accrual JVs: ${existingRes.error.message}`)
  if (batchRes.error) throw new Error(`Failed to read the batch: ${batchRes.error.message}`)
  const batchNo = (batchRes.data as { batch_no: number }).batch_no

  const existing = new Map<string, number>(
    ((existingRes.data ?? []) as Array<{ segment: string | null; total_amount: number | null }>).map(e => [
      e.segment ?? '',
      Number(e.total_amount ?? 0),
    ]),
  )

  const result: AccrualPostResult = { posted: [], skipped: [] }
  for (const row of (sumsRes.data ?? []) as BatchSegmentSums[]) {
    const segment = row.segment
    const sums = batchAccrualSums(row)
    const total = accrualTotal(sums)
    if (total <= 0.005) continue
    const prior = existing.get(segment)
    if (prior !== undefined) {
      if (Math.abs(prior - total) <= 0.01) {
        result.skipped.push(segment)
        continue
      }
      throw new Error(
        `${segmentLabel(segment)} already has an accrual JV for batch #${batchNo} at RM ${prior.toFixed(2)}, but the batch totals RM ${total.toFixed(2)} — reverse the old JV first, then retry.`,
      )
    }
    await postJournalEntry(supabase, {
      transactionDate: monthEnd,
      description: `${segmentLabel(segment)} Salary - ${monthLabel} · batch #${batchNo}`,
      referenceType: 'payroll_accrual',
      referenceId: opts.batchId,
      segment,
      lines: buildAccrualLines(sums, monthLabel),
      createdBy: opts.userId,
    })
    result.posted.push(segment)
  }
  return result
}

/**
 * Post the per-segment accrual JVs for one payroll month.
 * kind 'staff' → hr_monthly_payroll grouped by department (4 segments)
 * kind 'director' → director_monthly_payroll (segment 'director')
 * Idempotent per (period, segment); a conflicting existing JV throws.
 */
export async function postPayrollAccrualJVs(
  supabase: SupabaseClient,
  opts: { periodMonth: string; kind: 'staff' | 'director'; runId?: string | null; userId: string },
): Promise<AccrualPostResult> {
  const period = dayjs(opts.periodMonth).startOf('month').format('YYYY-MM-DD')
  const monthEnd = dayjs(period).endOf('month').format('YYYY-MM-DD')
  const monthLabel = dayjs(period).format("MMM[']YY")

  // Existing accruals for the month (idempotency + conflict detection).
  // 2026-09-04: MUST go through the SECURITY DEFINER RPC. Reading
  // journal_entries directly returns NOTHING for the submitting HR user
  // (SELECT RLS wants treasury scope), so the check saw zero existing JVs and
  // an HR re-submit double-posted every segment (JE-202608-0585..0589
  // duplicating 0580..0584).
  const { data: existing, error: exErr } = await supabase.rpc('get_payroll_accrual_totals', {
    p_period: period,
  })
  if (exErr) throw new Error(`Failed to check existing accrual JVs: ${exErr.message}`)
  const existingBySegment = new Map<string, number>(
    ((existing ?? []) as Array<{ segment: string | null; total_amount: number | null }>).map((e) => [
      e.segment ?? '',
      Number(e.total_amount ?? 0),
    ]),
  )

  const bySegment = new Map<string, AccrualSums>()

  if (opts.kind === 'staff') {
    const { data: rows, error } = await supabase
      .from('hr_monthly_payroll')
      .select('gross, non_statutory_allowance, epf_er, epf_ee, socso_er, socso_ee, eis_er, eis_ee, pcb, withholding_tax, net, skbbk_amount, hr_staff_costs!inner(department_id, departments!inner(name, segment_key, payroll_source))')
      .eq('period_month', period)
    if (error) throw new Error(`Failed to read staff payroll: ${error.message}`)
    const byDept = new Map<string, PayrollRowLike[]>()
    for (const row of (rows ?? []) as unknown as Array<PayrollRowLike & { hr_staff_costs: { departments: { name: string; segment_key: string | null; payroll_source: string } } }>) {
      const dept = row.hr_staff_costs?.departments?.name
      const department = row.hr_staff_costs?.departments
      const segment = (dept ? SEGMENT_BY_DEPT[dept] : undefined) ?? (department?.payroll_source === 'commission' ? department.segment_key : undefined)
      if (!segment) continue
      const list = byDept.get(segment) ?? []
      list.push(row)
      byDept.set(segment, list)
    }
    for (const [segment, list] of byDept) bySegment.set(segment, sumPayrollRows(list))
  } else {
    const { data: rows, error } = await supabase
      .from('director_monthly_payroll')
      .select('gross, non_statutory_allowance, epf_er, epf_ee, socso_er, socso_ee, eis_er, eis_ee, pcb, net, skbbk_amount')
      .eq('period_month', period)
    if (error) throw new Error(`Failed to read director payroll: ${error.message}`)
    if ((rows ?? []).length > 0) bySegment.set('director', sumPayrollRows(rows as unknown as PayrollRowLike[]))
  }

  const result: AccrualPostResult = { posted: [], skipped: [] }
  for (const [segment, sums] of bySegment) {
    const total = accrualTotal(sums)
    if (total <= 0.005) continue
    const prior = existingBySegment.get(segment)
    if (prior !== undefined) {
      if (Math.abs(prior - total) <= 0.01) {
        result.skipped.push(segment)
        continue
      }
      throw new Error(
        `${segmentLabel(segment)} already has an accrual JV for ${monthLabel} at RM ${prior.toFixed(2)}, but this payroll totals RM ${total.toFixed(2)} — reverse the old JV first, then re-run.`,
      )
    }
    const lines = buildAccrualLines(sums, monthLabel)
    await postJournalEntry(supabase, {
      transactionDate: monthEnd,
      description: `${segmentLabel(segment)} Salary - ${monthLabel}`,
      referenceType: 'payroll_accrual',
      referenceId: opts.kind === 'staff' ? (opts.runId ?? undefined) : undefined,
      segment,
      lines,
      createdBy: opts.userId,
    })
    result.posted.push(segment)
  }
  return result
}
