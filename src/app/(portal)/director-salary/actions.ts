'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAction } from '@/lib/auth'
import { assertPeriodOpen } from '@/lib/period-lock'
import {
  calculatePool,
  calculateDirectorPayout,
  type CTCRecord,
  type DirectorConfig,
  type StatutoryLookup,
  type PayoutMode,
} from '@/lib/salary'
import { notifyDirectorSalaryCalculated } from '@/lib/slack'
import dayjs from 'dayjs'
import { DIRECTOR_ROW_COLUMNS } from '@/lib/private-columns'

// ─── Save CTC ──────────────────────────────────────────────────────

export async function saveCTC(formData: FormData) {
  const user = await requireAction('director_salary', 'edit')
  const supabase = await createClient()

  const directorId = formData.get('director_id') as string
  const companyId = formData.get('company_id') as string
  const periodRaw = formData.get('period') as string
  const basic = parseFloat(formData.get('basic') as string) || 0
  const kpi = parseFloat(formData.get('kpi') as string) || 0
  const allowance = parseFloat(formData.get('allowance') as string) || 0

  const period = dayjs(periodRaw).startOf('month').format('YYYY-MM-DD')

  await assertPeriodOpen(supabase, period)

  // Upsert CTC record (trigger auto-computes statutory + total_ctc)
  const { error } = await supabase.from('director_ctc').upsert(
    {
      director_id: directorId,
      company_id: companyId,
      period_month: period,
      basic,
      kpi,
      allowance,
      created_by: user.id,
    },
    { onConflict: 'director_id,company_id,period_month' }
  )

  if (error) {
    if (error.code === '23505') throw new Error('CTC record already exists for this combination')
    throw new Error(`Failed to save CTC: ${error.message}`)
  }

  revalidatePath('/director-salary')
}

// ─── Batch Save CTC ────────────────────────────────────────────────

export interface BatchCTCInput {
  directorId: string
  companyId: string
  basic: number
  kpi: number
  allowance: number
  /** Manual ER override (mig 20260731100000): when true, the keyed employer
   *  values are stored as-is and the JADUAL trigger does not overwrite them. */
  erManual?: boolean
  employerEpf?: number
  employerSocso?: number
  employerEis?: number
}

export async function batchSaveCTC(period: string, records: BatchCTCInput[]) {
  const user = await requireAction('director_salary', 'edit')
  const supabase = await createClient()

  const periodNorm = dayjs(period).startOf('month').format('YYYY-MM-DD')

  await assertPeriodOpen(supabase, periodNorm)

  // An all-zero row is an explicit "this company has no CTC this month" —
  // delete its rows instead of silently skipping them (pre-2026-07-03 the
  // skip made a wrongly-entered company permanent: RLS blocked DELETE and
  // zeros never reached the server).
  const keep = records.filter(r => r.basic > 0 || r.kpi > 0 || r.allowance > 0)
  const clearedCompanyIds = records
    .filter(r => r.basic <= 0 && r.kpi <= 0 && r.allowance <= 0)
    .map(r => r.companyId)

  if (keep.length === 0 && clearedCompanyIds.length === 0) {
    throw new Error('No CTC data to save')
  }

  if (clearedCompanyIds.length > 0) {
    const { error: delErr } = await supabase
      .from('director_ctc')
      .delete()
      .eq('period_month', periodNorm)
      .in('company_id', clearedCompanyIds)
    if (delErr) throw new Error(`Failed to clear CTC rows: ${delErr.message}`)
  }

  if (keep.length > 0) {
    // Heads is a company rule (companies.director_heads, e.g. HC = 2), not a
    // grid input — stamp it server-side so SOCSO/EIS per-person caps always
    // apply regardless of what the client sends.
    const { data: headRows, error: headErr } = await supabase
      .from('companies')
      .select('id, director_heads')
      .in('id', keep.map(r => r.companyId))
    if (headErr) throw new Error(`Failed to read company heads: ${headErr.message}`)
    const headsByCompany = new Map((headRows ?? []).map(c => [c.id, Math.max(1, Number(c.director_heads ?? 1))]))

    const rows = keep.map(r => {
      const manual = r.erManual === true
      const nn = (v: number | undefined) => {
        const n = Number(v ?? 0)
        if (!Number.isFinite(n) || n < 0) throw new Error('ER override values must be non-negative numbers')
        return Math.round(n * 100) / 100
      }
      return {
        director_id: r.directorId,
        company_id: r.companyId,
        period_month: periodNorm,
        basic: r.basic,
        kpi: r.kpi,
        allowance: r.allowance,
        heads: headsByCompany.get(r.companyId) ?? 1,
        er_manual: manual,
        // Only meaningful when er_manual — otherwise the trigger recomputes
        // them from B+K and these are ignored.
        ...(manual
          ? {
              employer_epf: nn(r.employerEpf),
              employer_socso: nn(r.employerSocso),
              employer_eis: nn(r.employerEis),
            }
          : {}),
        created_by: user.id,
      }
    })

    const { error } = await supabase.from('director_ctc').upsert(rows, {
      onConflict: 'director_id,company_id,period_month',
    })

    if (error) throw new Error(`Failed to save CTC batch: ${error.message}`)
  }

  revalidatePath('/director-salary')
  return { saved: keep.length, cleared: clearedCompanyIds.length }
}

// ─── Calculate Director Salary ─────────────────────────────────────

export interface CalculateResult {
  success: boolean
  saved: number
  skipped: number
  advanceTotal: number
  period: string
  error?: string
}

export async function calculateDirectorSalary(
  period: string,
  mode: PayoutMode = 'split',
): Promise<CalculateResult> {
  const user = await requireAction('director_salary', 'edit')
  const supabase = await createClient()

  const fullyPaid = mode === 'fully_paid'
  const periodNorm = dayjs(period).startOf('month').format('YYYY-MM-DD')

  await assertPeriodOpen(supabase, periodNorm)

  // 1. Fetch CTC records for this period
  const { data: ctcRows, error: ctcErr } = await supabase
    .from('director_ctc')
    .select('*')
    .eq('period_month', periodNorm)

  if (ctcErr) throw new Error(`Failed to fetch CTC: ${ctcErr.message}`)

  // No CTC at all = HR cleared the month. Don't error out and strand the
  // previous calculation — wipe it via the same RPC a recalc uses (deletes
  // draft payouts + this period's 25% accumulation; refuses if anything is
  // already confirmed/paid). 2026-07-03: clearing the grid used to leave the
  // stale Per-Director Payouts on screen forever.
  if (!ctcRows || ctcRows.length === 0) {
    const { data: clearResult, error: clearErr } = await supabase.rpc(
      'save_director_salary_results',
      {
        p_data: {
          period_month: periodNorm,
          pool: {
            total_ctc_in: 0,
            total_pool: 0,
            basic_ratio: 0,
            kpi_ratio: 0,
            allowance_ratio: 0,
          },
          total_saving: 0,
          total_statutory_surplus: 0,
          payouts: [],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      },
    )
    if (clearErr) throw new Error(`Failed to clear old calculation: ${clearErr.message}`)

    const cr = clearResult as { success: boolean; error?: string }
    if (!cr.success) throw new Error(cr.error ?? 'Failed to clear old calculation')

    revalidatePath('/director-salary')
    revalidatePath('/dashboard')

    return { success: true, saved: 0, skipped: 0, advanceTotal: 0, period: periodNorm }
  }

  // 2. Fetch directors
  const { data: directors, error: dirErr } = await supabase
    .from('directors')
    .select(DIRECTOR_ROW_COLUMNS)
    .eq('status', 'active')
    .order('code')

  if (dirErr) throw new Error(`Failed to fetch directors: ${dirErr.message}`)
  if (!directors || directors.length === 0) throw new Error('No active directors found')

  // 3. Fetch saving rate from treasury_config (key-value table)
  const { data: savingConfig } = await supabase
    .from('treasury_config')
    .select('config_value')
    .eq('config_key', 'saving_rate')
    .maybeSingle()
  const savingRate = savingConfig?.config_value ? Number(savingConfig.config_value) : 0.05

  // 4. Build CTC records for calculatePool
  const ctcRecords: CTCRecord[] = ctcRows.map(r => ({
    directorId: r.director_id,
    companyId: r.company_id,
    basic: Number(r.basic),
    kpi: Number(r.kpi),
    allowance: Number(r.allowance),
    employerEpf: Number(r.employer_epf ?? 0),
    employerSocso: Number(r.employer_socso ?? 0),
    employerEis: Number(r.employer_eis ?? 0),
    totalCtc: Number(r.total_ctc ?? 0),
  }))

  // 5. Calculate pool
  const pool = calculatePool(ctcRecords)
  const totalWeightage = directors.reduce((s, d) => s + Number(d.weightage), 0)

  // 6. Calculate per director
  const payouts = []
  let totalSaving = 0
  let totalSurplus = 0

  for (const dir of directors) {
    const dirConfig: DirectorConfig = {
      id: dir.id,
      code: dir.code,
      weightage: Number(dir.weightage),
      minPayout: Number(dir.min_payout),
      pcbCategory: dir.pcb_category as 'KA1' | 'KA2' | 'KA3',
      childrenCount: dir.children_count,
    }

    // Opening advance balance (from prior confirmed/paid month, 0 if none).
    // Engine offsets this against director's post-saving allowance share
    // before the 75/25 split.
    const { data: openingBalRaw } = await supabase.rpc('get_director_advance_opening_balance', {
      p_director_id: dir.id,
      p_period: periodNorm,
    })
    const openingAdvanceBalance = Number(openingBalRaw ?? 0)

    // Provisional post-offset afterSaving for statutory lookup keys.
    // fully_paid = staff-style: no saving deducted (mirrors salary.ts Step 5).
    const grossAmount = pool.totalPool * dirConfig.weightage / totalWeightage
    const savingAmount = fullyPaid ? 0 : grossAmount * savingRate
    const afterSaving = grossAmount - savingAmount
    const allowanceShare = afterSaving * pool.allowanceRatio
    const advanceRepaidProvisional = Math.min(openingAdvanceBalance, allowanceShare)
    const afterOffset = afterSaving - advanceRepaidProvisional
    // fully_paid: 100% of afterOffset is the payroll portion, no invoice.
    const payrollCalc = fullyPaid ? afterOffset : afterOffset * 0.75
    const payrollGross = Math.max(payrollCalc, dirConfig.minPayout)
    const invoiceBase = fullyPaid ? 0 : afterOffset * 0.25

    // Statutory lookups for the payroll portion (based on B+K wages only —
    // the Allowance share carries no statutory in either mode)
    const payrollBkWages = payrollGross * pool.basicRatio
    const { data: epfPayroll } = await supabase.rpc('lookup_epf', { p_wages: payrollBkWages })
    const { data: socsoPayroll } = await supabase.rpc('lookup_socso', { p_wages: payrollBkWages })
    const { data: eisPayroll } = await supabase.rpc('lookup_eis', { p_wages: payrollBkWages })

    const payrollStat: StatutoryLookup = {
      epfEr: epfPayroll?.[0]?.employer ?? 0,
      epfEe: epfPayroll?.[0]?.employee ?? 0,
      socsoEr: socsoPayroll?.[0]?.employer ?? 0,
      socsoEe: socsoPayroll?.[0]?.employee ?? 0,
      eisEr: eisPayroll?.[0]?.employer ?? 0,
      eisEe: eisPayroll?.[0]?.employee ?? 0,
    }

    // Statutory lookups for the 25% invoice portion (skipped in fully_paid —
    // there is no invoice portion).
    let invoiceStat: StatutoryLookup = {
      epfEr: 0, epfEe: 0, socsoEr: 0, socsoEe: 0, eisEr: 0, eisEe: 0,
    }
    if (!fullyPaid) {
      const invoiceBkWages = invoiceBase * pool.basicRatio
      const { data: epfInv } = await supabase.rpc('lookup_epf', { p_wages: invoiceBkWages })
      const { data: socsoInv } = await supabase.rpc('lookup_socso', { p_wages: invoiceBkWages })
      const { data: eisInv } = await supabase.rpc('lookup_eis', { p_wages: invoiceBkWages })

      invoiceStat = {
        epfEr: epfInv?.[0]?.employer ?? 0,
        epfEe: 0,
        socsoEr: socsoInv?.[0]?.employer ?? 0,
        socsoEe: 0,
        eisEr: eisInv?.[0]?.employer ?? 0,
        eisEe: 0,
      }
    }

    // PCB lookup (auto-suggest)
    const taxableIncome = payrollGross - (epfPayroll?.[0]?.employee ?? 0)
    const { data: pcbAmount } = await supabase.rpc('lookup_pcb', {
      p_income: taxableIncome,
      p_category: dirConfig.pcbCategory,
      p_children: dirConfig.childrenCount,
    })

    const payout = calculateDirectorPayout(
      dirConfig, pool, totalWeightage, savingRate,
      payrollStat, invoiceStat, pcbAmount ?? 0,
      openingAdvanceBalance, mode
    )

    totalSaving += payout.savingAmount
    totalSurplus += payout.statutorySurplus

    payouts.push({
      ...payout,
      director_id: dir.id,
      director_code: dir.code,
      calculation_snapshot: {
        pool,
        director: dirConfig,
        payout_mode: mode,
        payroll_statutory: payrollStat,
        invoice_statutory: invoiceStat,
        pcb_lookup: pcbAmount ?? 0,
        saving_rate: savingRate,
        total_weightage: totalWeightage,
        calculated_at: new Date().toISOString(),
        calculated_by: user.id,
      },
    })
  }

  // 7. Atomic write via RPC
  const rpcPayload = {
    period_month: periodNorm,
    pool: {
      total_ctc_in: pool.totalCtcIn,
      total_pool: pool.totalPool,
      basic_ratio: pool.basicRatio,
      kpi_ratio: pool.kpiRatio,
      allowance_ratio: pool.allowanceRatio,
    },
    total_saving: totalSaving,
    total_statutory_surplus: totalSurplus,
    payouts: payouts.map(p => ({
      director_id: p.directorId,
      director_code: p.director_code,
      payout_mode: p.mode,
      gross_amount: p.grossAmount,
      saving_amount: p.savingAmount,
      after_saving: p.afterSaving,
      advance_opening_balance: p.advanceOpeningBalance,
      advance_repaid: p.advanceRepaid,
      advance_balance: p.advanceBalance,
      payroll_calc: p.payrollCalc,
      advance_amount: p.advanceAmount,
      payroll_gross: p.payrollGross,
      payroll_bk: p.payrollBk,
      payroll_allow: p.payrollAllow,
      payroll_epf_er: p.payrollEpfEr,
      payroll_epf_ee: p.payrollEpfEe,
      payroll_socso_er: p.payrollSocsoEr,
      payroll_socso_ee: p.payrollSocsoEe,
      payroll_eis_er: p.payrollEisEr,
      payroll_eis_ee: p.payrollEisEe,
      payroll_pcb: p.payrollPcb,
      payroll_net: p.payrollNet,
      invoice_base: p.invoiceBase,
      invoice_bk: p.invoiceBk,
      invoice_epf_er: p.invoiceEpfEr,
      invoice_socso_er: p.invoiceSocsoEr,
      invoice_eis_er: p.invoiceEisEr,
      invoice_total: p.invoiceTotal,
      statutory_er_in: p.statutoryErIn,
      statutory_er_out: p.statutoryErOut,
      statutory_surplus: p.statutorySurplus,
      calculation_snapshot: p.calculation_snapshot,
    })),
  }

  const { data: result, error: rpcErr } = await supabase.rpc(
    'save_director_salary_results',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { p_data: rpcPayload as any }
  )

  if (rpcErr) throw new Error(`Calculation save failed: ${rpcErr.message}`)

  revalidatePath('/director-salary')
  revalidatePath('/dashboard')

  const r = result as { success: boolean; saved: number; skipped: number; advance_total: number; period: string; error?: string }
  if (!r.success) throw new Error(r.error ?? 'Unknown error during save')

  // Slack notification (non-blocking)
  notifyDirectorSalaryCalculated(
    dayjs(periodNorm).format('MMMM YYYY'),
    r.saved,
    totalSaving
  ).catch(() => {})

  return {
    success: true,
    saved: r.saved,
    skipped: r.skipped,
    advanceTotal: r.advance_total,
    period: r.period,
  }
}

// ─── Update PCB ────────────────────────────────────────────────────

export async function updatePCB(payoutId: string, pcbAmount: number) {
  await requireAction('director_salary', 'edit')
  const supabase = await createClient()

  // Fetch current payout to recalculate net
  const { data: payout, error: fetchErr } = await supabase
    .from('director_payouts')
    .select('payroll_gross, payroll_epf_er, payroll_epf_ee, payroll_socso_er, payroll_socso_ee, payroll_eis_er, payroll_eis_ee, payroll_skbbk, status')
    .eq('id', payoutId)
    .single()

  if (fetchErr || !payout) throw new Error('Payout not found')
  if (payout.status !== 'draft') throw new Error('Cannot update PCB on a confirmed/paid payout')

  const totalDeductions = Number(payout.payroll_epf_er ?? 0) + Number(payout.payroll_epf_ee ?? 0)
    + Number(payout.payroll_socso_er ?? 0) + Number(payout.payroll_socso_ee ?? 0)
    + Number(payout.payroll_eis_er ?? 0) + Number(payout.payroll_eis_ee ?? 0)
    + Number(payout.payroll_skbbk ?? 0)
  const payrollNet = Number(payout.payroll_gross ?? 0) - totalDeductions - pcbAmount

  const { error } = await supabase
    .from('director_payouts')
    .update({ payroll_pcb: pcbAmount, payroll_net: payrollNet })
    .eq('id', payoutId)

  if (error) throw new Error(`Failed to update PCB: ${error.message}`)

  revalidatePath('/director-salary')
}

// ─── Override / Reset Statutory (Phase 11.2) ───────────────────────────────
//
// HR (and Principal) can override the JADUAL-driven EPF / SOCSO / EIS
// values per payout — e.g. director has a custom EPF rate, or HR adjusts
// for arrears. updateDirectorStatutory writes any subset of the 9 numeric
// fields and recomputes payroll_net. resetDirectorStatutoryToLookup
// re-runs the lookup RPCs against the row's stored payroll_bk / invoice_bk
// wage bases and overwrites all 9 fields back to the table value.

const PAYROLL_STAT_FIELDS = [
  'payroll_epf_er',
  'payroll_epf_ee',
  'payroll_socso_er',
  'payroll_socso_ee',
  'payroll_eis_er',
  'payroll_eis_ee',
  // SKBBK: net-only employee deduction, manual entry (no lookup table).
  // Rides the same override path so HR keys it inline like the others.
  'payroll_skbbk',
] as const
const INVOICE_STAT_FIELDS = [
  'invoice_epf_er',
  'invoice_socso_er',
  'invoice_eis_er',
] as const
type DirectorStatutoryField = (typeof PAYROLL_STAT_FIELDS)[number] | (typeof INVOICE_STAT_FIELDS)[number]

export type DirectorStatutoryUpdate = Partial<Record<DirectorStatutoryField, number>>

function recomputePayrollNet(row: {
  payroll_gross: number | null
  payroll_epf_er: number | null
  payroll_epf_ee: number | null
  payroll_socso_er: number | null
  payroll_socso_ee: number | null
  payroll_eis_er: number | null
  payroll_eis_ee: number | null
  payroll_pcb: number | null
  payroll_skbbk: number | null
}): number {
  const gross = Number(row.payroll_gross ?? 0)
  const deductions =
    Number(row.payroll_epf_er ?? 0) + Number(row.payroll_epf_ee ?? 0) +
    Number(row.payroll_socso_er ?? 0) + Number(row.payroll_socso_ee ?? 0) +
    Number(row.payroll_eis_er ?? 0) + Number(row.payroll_eis_ee ?? 0)
  const pcb = Number(row.payroll_pcb ?? 0)
  const skbbk = Number(row.payroll_skbbk ?? 0)
  return Math.round((gross - deductions - pcb - skbbk) * 100) / 100
}

export async function updateDirectorStatutory(payoutId: string, fields: DirectorStatutoryUpdate) {
  const user = await requireAction('director_salary', 'edit')
  const supabase = await createClient()

  // Validate inbound fields: numeric, non-negative, must be a recognised key.
  const allowed = new Set<DirectorStatutoryField>([...PAYROLL_STAT_FIELDS, ...INVOICE_STAT_FIELDS])
  const writes: Record<string, number> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (!allowed.has(k as DirectorStatutoryField)) {
      throw new Error(`Unknown statutory field: ${k}`)
    }
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`${k} must be a non-negative number`)
    }
    writes[k] = Math.round(n * 100) / 100
  }
  if (Object.keys(writes).length === 0) throw new Error('No statutory fields provided')

  const { data: row, error: fetchErr } = await supabase
    .from('director_payouts')
    .select(
      'id, status, payroll_gross, payroll_epf_er, payroll_epf_ee, payroll_socso_er, payroll_socso_ee, payroll_eis_er, payroll_eis_ee, payroll_pcb, payroll_skbbk',
    )
    .eq('id', payoutId)
    .single()
  if (fetchErr || !row) throw new Error('Payout not found')
  if (row.status !== 'draft') throw new Error('Cannot edit statutory on a confirmed/paid payout')

  // Merge incoming overrides with existing row values for net recompute.
  const merged = { ...row, ...writes }
  const payrollNet = recomputePayrollNet(merged)

  const { error: updErr } = await supabase
    .from('director_payouts')
    .update({
      ...writes,
      payroll_net: payrollNet,
      statutory_overridden_at: new Date().toISOString(),
      statutory_overridden_by: user.id,
    })
    .eq('id', payoutId)
    .eq('status', 'draft')
  if (updErr) throw new Error(`Failed to update statutory: ${updErr.message}`)

  revalidatePath('/director-salary')
}

export async function resetDirectorStatutoryToLookup(payoutId: string) {
  await requireAction('director_salary', 'edit')
  const supabase = await createClient()

  const { data: row, error: fetchErr } = await supabase
    .from('director_payouts')
    .select(
      'id, status, payroll_bk, invoice_bk, payroll_gross, payroll_pcb, payroll_skbbk',
    )
    .eq('id', payoutId)
    .single()
  if (fetchErr || !row) throw new Error('Payout not found')
  if (row.status !== 'draft') throw new Error('Cannot reset statutory on a confirmed/paid payout')

  const payrollBk = Number(row.payroll_bk ?? 0)
  const invoiceBk = Number(row.invoice_bk ?? 0)

  // Re-run the same lookups the calculate action uses.
  const [{ data: epfP }, { data: socsoP }, { data: eisP }, { data: epfI }, { data: socsoI }, { data: eisI }] =
    await Promise.all([
      supabase.rpc('lookup_epf', { p_wages: payrollBk }),
      supabase.rpc('lookup_socso', { p_wages: payrollBk }),
      supabase.rpc('lookup_eis', { p_wages: payrollBk }),
      supabase.rpc('lookup_epf', { p_wages: invoiceBk }),
      supabase.rpc('lookup_socso', { p_wages: invoiceBk }),
      supabase.rpc('lookup_eis', { p_wages: invoiceBk }),
    ])

  const payrollEpfEr = Number(epfP?.[0]?.employer ?? 0)
  const payrollEpfEe = Number(epfP?.[0]?.employee ?? 0)
  const payrollSocsoEr = Number(socsoP?.[0]?.employer ?? 0)
  const payrollSocsoEe = Number(socsoP?.[0]?.employee ?? 0)
  const payrollEisEr = Number(eisP?.[0]?.employer ?? 0)
  const payrollEisEe = Number(eisP?.[0]?.employee ?? 0)

  const merged = {
    payroll_gross: row.payroll_gross,
    payroll_epf_er: payrollEpfEr,
    payroll_epf_ee: payrollEpfEe,
    payroll_socso_er: payrollSocsoEr,
    payroll_socso_ee: payrollSocsoEe,
    payroll_eis_er: payrollEisEr,
    payroll_eis_ee: payrollEisEe,
    payroll_pcb: row.payroll_pcb,
    // SKBBK is manual (no lookup) — reset keeps it, net recompute includes it.
    payroll_skbbk: row.payroll_skbbk,
  }
  const payrollNet = recomputePayrollNet(merged)

  const { error: updErr } = await supabase
    .from('director_payouts')
    .update({
      payroll_epf_er: payrollEpfEr,
      payroll_epf_ee: payrollEpfEe,
      payroll_socso_er: payrollSocsoEr,
      payroll_socso_ee: payrollSocsoEe,
      payroll_eis_er: payrollEisEr,
      payroll_eis_ee: payrollEisEe,
      invoice_epf_er: Number(epfI?.[0]?.employer ?? 0),
      invoice_socso_er: Number(socsoI?.[0]?.employer ?? 0),
      invoice_eis_er: Number(eisI?.[0]?.employer ?? 0),
      payroll_net: payrollNet,
      statutory_overridden_at: null,
      statutory_overridden_by: null,
    })
    .eq('id', payoutId)
    .eq('status', 'draft')
  if (updErr) throw new Error(`Failed to reset statutory: ${updErr.message}`)

  revalidatePath('/director-salary')
}

// ─── Complete (unified Payroll, 2026-09-27) ─────────────────────────
//
// Director Salary's Submit to Finance became Complete (user's choice): the
// directors' pay is checked and locked, the billing snapshot Finance invoices
// the subsidiaries from is written as before — and the money goes to Finance
// with HR › Payroll's Submit to Finance, in the same batches as everybody
// else, funded from the Director pool. Their accrual JVs post with the batch.

export async function completeDirectorSalary(period: string) {
  await requireAction('director_salary', 'edit')
  const supabase = await createClient()

  const periodNorm = dayjs(period).startOf('month').format('YYYY-MM-DD')
  await assertPeriodOpen(supabase, periodNorm)

  const { error } = await supabase.rpc('director_payroll_complete', { p_period: periodNorm })
  if (error) throw new Error(`Complete failed: ${error.message}`)

  revalidatePath('/director-salary')
  revalidatePath(`/hr-costing/payroll/${periodNorm}`)
  revalidatePath('/billing')
  revalidatePath('/dashboard')
}

/**
 * Take a Complete back before the directors went to Finance: they are
 * editable again, and the billing snapshot goes unless somebody is already
 * with Finance. Anybody already sent is resubmitted from HR › Payroll.
 */
export async function reopenDirectorSalary(period: string) {
  await requireAction('director_salary', 'edit')
  const supabase = await createClient()

  const periodNorm = dayjs(period).startOf('month').format('YYYY-MM-DD')
  await assertPeriodOpen(supabase, periodNorm)

  const { error } = await supabase.rpc('director_payroll_uncomplete', { p_period: periodNorm })
  if (error) throw new Error(`Reopen failed: ${error.message}`)

  revalidatePath('/director-salary')
  revalidatePath(`/hr-costing/payroll/${periodNorm}`)
  revalidatePath('/billing')
  revalidatePath('/dashboard')
}
