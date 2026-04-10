'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import {
  calculatePool,
  calculateDirectorPayout,
  type CTCRecord,
  type DirectorConfig,
  type StatutoryLookup,
} from '@/lib/salary'
import { notifyDirectorSalaryCalculated } from '@/lib/slack'
import dayjs from 'dayjs'

// ─── Save CTC ──────────────────────────────────────────────────────

export async function saveCTC(formData: FormData) {
  const user = await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  const directorId = formData.get('director_id') as string
  const companyId = formData.get('company_id') as string
  const periodRaw = formData.get('period') as string
  const basic = parseFloat(formData.get('basic') as string) || 0
  const kpi = parseFloat(formData.get('kpi') as string) || 0
  const allowance = parseFloat(formData.get('allowance') as string) || 0

  const period = dayjs(periodRaw).startOf('month').format('YYYY-MM-DD')

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
}

export async function batchSaveCTC(period: string, records: BatchCTCInput[]) {
  const user = await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  const periodNorm = dayjs(period).startOf('month').format('YYYY-MM-DD')

  const rows = records
    .filter(r => r.basic > 0 || r.kpi > 0 || r.allowance > 0)
    .map(r => ({
      director_id: r.directorId,
      company_id: r.companyId,
      period_month: periodNorm,
      basic: r.basic,
      kpi: r.kpi,
      allowance: r.allowance,
      created_by: user.id,
    }))

  if (rows.length === 0) throw new Error('No CTC data to save')

  const { error } = await supabase.from('director_ctc').upsert(rows, {
    onConflict: 'director_id,company_id,period_month',
  })

  if (error) throw new Error(`Failed to save CTC batch: ${error.message}`)

  revalidatePath('/director-salary')
  return { saved: rows.length }
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

export async function calculateDirectorSalary(period: string): Promise<CalculateResult> {
  const user = await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  const periodNorm = dayjs(period).startOf('month').format('YYYY-MM-DD')

  // 1. Fetch CTC records for this period
  const { data: ctcRows, error: ctcErr } = await supabase
    .from('director_ctc')
    .select('*')
    .eq('period_month', periodNorm)

  if (ctcErr) throw new Error(`Failed to fetch CTC: ${ctcErr.message}`)
  if (!ctcRows || ctcRows.length === 0) throw new Error('No CTC data for this period. Please enter CTC first.')

  // 2. Fetch directors
  const { data: directors, error: dirErr } = await supabase
    .from('directors')
    .select('*')
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

    // Calculate payroll gross for statutory lookups
    const grossAmount = pool.totalPool * dirConfig.weightage / totalWeightage
    const savingAmount = grossAmount * savingRate
    const afterSaving = grossAmount - savingAmount
    const payrollCalc = afterSaving * 0.75
    const payrollGross = Math.max(payrollCalc, dirConfig.minPayout)
    const invoiceBase = afterSaving * 0.25

    // Statutory lookups for 75% payroll (based on B+K wages)
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

    // Statutory lookups for 25% invoice (based on B+K wages of invoice portion)
    const invoiceBkWages = invoiceBase * pool.basicRatio
    const { data: epfInv } = await supabase.rpc('lookup_epf', { p_wages: invoiceBkWages })
    const { data: socsoInv } = await supabase.rpc('lookup_socso', { p_wages: invoiceBkWages })
    const { data: eisInv } = await supabase.rpc('lookup_eis', { p_wages: invoiceBkWages })

    const invoiceStat: StatutoryLookup = {
      epfEr: epfInv?.[0]?.employer ?? 0,
      epfEe: 0,
      socsoEr: socsoInv?.[0]?.employer ?? 0,
      socsoEe: 0,
      eisEr: eisInv?.[0]?.employer ?? 0,
      eisEe: 0,
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
      payrollStat, invoiceStat, pcbAmount ?? 0
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
      gross_amount: p.grossAmount,
      saving_amount: p.savingAmount,
      after_saving: p.afterSaving,
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: result, error: rpcErr } = await supabase.rpc(
    'save_director_salary_results',
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
  await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  // Fetch current payout to recalculate net
  const { data: payout, error: fetchErr } = await supabase
    .from('director_payouts')
    .select('payroll_gross, payroll_epf_er, payroll_epf_ee, payroll_socso_er, payroll_socso_ee, payroll_eis_er, payroll_eis_ee, status')
    .eq('id', payoutId)
    .single()

  if (fetchErr || !payout) throw new Error('Payout not found')
  if (payout.status !== 'draft') throw new Error('Cannot update PCB on a confirmed/paid payout')

  const totalDeductions = Number(payout.payroll_epf_er ?? 0) + Number(payout.payroll_epf_ee ?? 0)
    + Number(payout.payroll_socso_er ?? 0) + Number(payout.payroll_socso_ee ?? 0)
    + Number(payout.payroll_eis_er ?? 0) + Number(payout.payroll_eis_ee ?? 0)
  const payrollNet = Number(payout.payroll_gross ?? 0) - totalDeductions - pcbAmount

  const { error } = await supabase
    .from('director_payouts')
    .update({ payroll_pcb: pcbAmount, payroll_net: payrollNet })
    .eq('id', payoutId)

  if (error) throw new Error(`Failed to update PCB: ${error.message}`)

  revalidatePath('/director-salary')
}

// ─── Confirm Payouts ───────────────────────────────────────────────

export async function confirmPayouts(period: string) {
  await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  const periodNorm = dayjs(period).startOf('month').format('YYYY-MM-DD')

  const { error, count } = await supabase
    .from('director_payouts')
    .update({ status: 'confirmed' })
    .eq('period_month', periodNorm)
    .eq('status', 'draft')

  if (error) throw new Error(`Failed to confirm payouts: ${error.message}`)

  revalidatePath('/director-salary')
  revalidatePath('/dashboard')
  return { confirmed: count ?? 0 }
}
