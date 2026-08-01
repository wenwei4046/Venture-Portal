'use server'

// Billing Allocator server actions. The invoice handoff deliberately calls the
// SAME createMultiLineInvoice used by the manual multi-line Create Invoice
// button — numbering (mint_invoice_no), draft status, period-open check, line
// rollback and revalidation are therefore identical to a hand-made invoice.

import { revalidatePath } from 'next/cache'
import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  allocateExpense,
  type AllocMethod,
  type StaffSplit,
} from '@/lib/billing-allocator'
import { createMultiLineInvoice } from '../billing/actions'

// The alloc_* tables aren't in the generated database.types yet, so this file
// works through the untyped client — the same convention lib/cfo-reports.ts
// uses. Row shapes are narrowed manually at each read.
async function allocClient(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

const PERIOD_RE = /^\d{4}-\d{2}$/

function periodDate(period: string): string {
  if (!PERIOD_RE.test(period)) throw new Error(`Invalid period: ${period}`)
  return `${period}-01`
}

/** reference_no shared by every allocator invoice of a period — the link AND
 *  the dedupe key. */
const refFor = (period: string) => `ALC-${period.replace('-', '')}`

// Target encoding used across the allocator ("marketing 算inter-billing。单还是
// 要开", user 2026-08-01): a company uuid bills the subsidiary, `dept:<uuid>`
// bills the department (inter-billing dept_pool invoice), null = HV own share.
const DEPT_PREFIX = 'dept:'
const decodeTarget = (targetId: string | null): { companyId: string | null; departmentId: string | null } =>
  targetId === null
    ? { companyId: null, departmentId: null }
    : targetId.startsWith(DEPT_PREFIX)
      ? { companyId: null, departmentId: targetId.slice(DEPT_PREFIX.length) }
      : { companyId: targetId, departmentId: null }
const encodeTarget = (companyId: string | null, departmentId: string | null): string | null =>
  companyId ?? (departmentId ? `${DEPT_PREFIX}${departmentId}` : null)

// ─── Staff (Finance's own list) ──────────────────────────────────────────────

export interface StaffSplitInput {
  /** company uuid, `dept:<uuid>`, or null = HOUZS Venture (own share). */
  targetId: string | null
  pct: number
}

export async function saveAllocStaff(payload: {
  id?: string
  name: string
  status: 'active' | 'inactive'
  /** Free team/function label — display only, never touches the math. */
  department: string
  splits: StaffSplitInput[]
}): Promise<void> {
  const user = await requireRole(['finance', 'principal'])
  const supabase = await allocClient()

  const name = payload.name.trim()
  if (!name) throw new Error('Name is required')
  const department = payload.department.trim()
  const splits = (payload.splits ?? []).filter((s) => Number(s.pct) > 0)
  const total = Math.round(splits.reduce((s, x) => s + Number(x.pct), 0) * 100) / 100
  if (total > 100) throw new Error(`Splits total ${total}% — cannot exceed 100%`)

  let staffId = payload.id ?? null
  if (staffId) {
    const { error } = await supabase
      .from('alloc_staff')
      .update({ name, status: payload.status, department, updated_at: new Date().toISOString() })
      .eq('id', staffId)
    if (error) throw new Error(error.message)
    const { error: delErr } = await supabase.from('alloc_staff_splits').delete().eq('staff_id', staffId)
    if (delErr) throw new Error(delErr.message)
  } else {
    const { data, error } = await supabase
      .from('alloc_staff')
      .insert({ name, status: payload.status, department, created_by: user.id })
      .select('id')
      .single()
    if (error || !data) throw new Error(error?.message ?? 'insert failed')
    staffId = data.id as string
  }

  if (splits.length > 0) {
    const { error } = await supabase.from('alloc_staff_splits').insert(
      splits.map((s) => {
        const t = decodeTarget(s.targetId)
        return { staff_id: staffId, company_id: t.companyId, department_id: t.departmentId, pct: s.pct }
      }),
    )
    if (error) throw new Error(error.message)
  }

  // Script parity: every staff edit re-snapshots the CURRENT month.
  await snapshotPeriod(dayjs().format('YYYY-MM'))
  revalidatePath('/billing-allocator')
}

export async function deleteAllocStaff(id: string): Promise<void> {
  await requireRole(['finance', 'principal'])
  const supabase = await allocClient()
  const { error } = await supabase.from('alloc_staff').delete().eq('id', id)
  if (error) throw new Error(error.message)
  await snapshotPeriod(dayjs().format('YYYY-MM'))
  revalidatePath('/billing-allocator')
}

/** Replace `period`'s headcount snapshot with the live list. */
export async function saveAllocSnapshot(period: string): Promise<void> {
  await requireRole(['finance', 'principal'])
  await snapshotPeriod(period)
  revalidatePath('/billing-allocator')
}

async function snapshotPeriod(period: string): Promise<void> {
  const supabase = await allocClient()
  const pd = periodDate(period)

  const [{ data: staff, error: sErr }, { data: splits, error: spErr }] = await Promise.all([
    supabase.from('alloc_staff').select('id, name, status'),
    supabase.from('alloc_staff_splits').select('staff_id, company_id, department_id, pct'),
  ])
  if (sErr) throw new Error(sErr.message)
  if (spErr) throw new Error(spErr.message)

  const { error: delErr } = await supabase.from('alloc_staff_history').delete().eq('period_month', pd)
  if (delErr) throw new Error(delErr.message)

  const rows: Array<Record<string, unknown>> = []
  for (const st of staff ?? []) {
    const mine = (splits ?? []).filter((x) => x.staff_id === st.id)
    if (mine.length === 0) {
      rows.push({ period_month: pd, staff_id: st.id, staff_name: st.name, status: st.status, company_id: null, department_id: null, pct: 0 })
    } else {
      for (const m of mine) {
        rows.push({ period_month: pd, staff_id: st.id, staff_name: st.name, status: st.status, company_id: m.company_id, department_id: m.department_id, pct: m.pct })
      }
    }
  }
  if (rows.length > 0) {
    const { error } = await supabase.from('alloc_staff_history').insert(rows)
    if (error) throw new Error(error.message)
  }
}

/**
 * One-click seed from HR's allocation table (READ-ONLY on HR data; Finance
 * already reads it for invoice autofill). REPLACES the whole allocator list
 * with HR's staff×company×% for the chosen HR month — after that it is
 * Finance's independent copy again (HR edits do NOT flow through; re-import
 * to refresh). HR stores fractions (0.30 = 30%) and has no own-share concept:
 * a staff whose splits total under 100% gets the remainder as "HV own".
 */
export async function importAllocStaffFromHr(hrPeriod: string): Promise<{ imported: number }> {
  await requireRole(['finance', 'principal'])
  const supabase = await allocClient()
  const pd = periodDate(hrPeriod)

  const [{ data: hrRows, error: hrErr }, { data: deptRows }] = await Promise.all([
    supabase
      .from('hr_staff_allocation')
      .select('staff_id, company_id, allocation_pct, hr_staff_costs(employee_name, status, department_id)')
      .eq('period_month', pd),
    supabase.from('departments').select('id, name'),
  ])
  if (hrErr) throw new Error(hrErr.message)
  if (!hrRows || hrRows.length === 0) {
    throw new Error(`HR has no allocation rows for ${hrPeriod}`)
  }
  const deptNameById = new Map((deptRows ?? []).map((d) => [d.id as string, d.name as string]))

  type HrRow = {
    staff_id: string
    company_id: string
    allocation_pct: number | string
    hr_staff_costs: { employee_name: string; status: string; department_id: string | null } | null
  }
  const byStaff = new Map<string, { name: string; status: string; department: string; splits: { companyId: string; pct: number }[] }>()
  for (const r of hrRows as unknown as HrRow[]) {
    const name = r.hr_staff_costs?.employee_name ?? 'Unknown'
    const status = (r.hr_staff_costs?.status ?? 'active') === 'active' ? 'active' : 'inactive'
    const department = deptNameById.get(r.hr_staff_costs?.department_id ?? '') ?? ''
    if (!byStaff.has(r.staff_id)) byStaff.set(r.staff_id, { name, status, department, splits: [] })
    const pct = Math.round(Number(r.allocation_pct) * 100 * 100) / 100 // fraction → %
    if (pct > 0) byStaff.get(r.staff_id)!.splits.push({ companyId: r.company_id, pct })
  }

  // Replace-all: wipe the allocator list, then insert HR's.
  const { error: wipeErr } = await supabase
    .from('alloc_staff')
    .delete()
    .not('id', 'is', null)
  if (wipeErr) throw new Error(wipeErr.message)

  for (const s of byStaff.values()) {
    const { data: created, error } = await supabase
      .from('alloc_staff')
      .insert({ name: s.name, status: s.status, department: s.department })
      .select('id')
      .single()
    if (error || !created) throw new Error(error?.message ?? 'staff insert failed')
    const total = Math.round(s.splits.reduce((a, x) => a + x.pct, 0) * 100) / 100
    const rows: Array<{ staff_id: string; company_id: string | null; pct: number }> = s.splits.map((x) => ({
      staff_id: created.id as string,
      company_id: x.companyId,
      pct: x.pct,
    }))
    // HR under-100% remainder = HV's own share.
    const remainder = Math.round((100 - total) * 100) / 100
    if (remainder >= 0.01) rows.push({ staff_id: created.id as string, company_id: null, pct: remainder })
    if (rows.length > 0) {
      const { error: spErr } = await supabase.from('alloc_staff_splits').insert(rows)
      if (spErr) throw new Error(spErr.message)
    }
  }

  await snapshotPeriod(dayjs().format('YYYY-MM'))
  revalidatePath('/billing-allocator')
  return { imported: byStaff.size }
}

// ─── Categories ──────────────────────────────────────────────────────────────

export async function saveAllocCategory(payload: { id?: string; name: string; coaCode: string }): Promise<void> {
  await requireRole(['finance', 'principal'])
  const supabase = await allocClient()
  const name = payload.name.trim()
  if (!name) throw new Error('Category name is required')
  const coa = payload.coaCode.trim() || null
  if (coa) {
    const { data } = await supabase.from('chart_of_accounts').select('code').eq('code', coa).maybeSingle()
    if (!data) throw new Error(`COA code ${coa} does not exist`)
  }
  const { error } = payload.id
    ? await supabase.from('alloc_categories').update({ name, coa_code: coa }).eq('id', payload.id)
    : await supabase.from('alloc_categories').insert({ name, coa_code: coa })
  if (error) throw new Error(error.message)
  revalidatePath('/billing-allocator')
}

export async function deleteAllocCategory(id: string): Promise<void> {
  await requireRole(['finance', 'principal'])
  const supabase = await allocClient()
  const { error } = await supabase.from('alloc_categories').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/billing-allocator')
}

// ─── Templates ───────────────────────────────────────────────────────────────

export async function saveAllocTemplate(payload: {
  id?: string
  name: string
  method: AllocMethod
  amount: number
  categoryId: string | null
  status: 'active' | 'inactive'
  splits: { companyId: string; pct: number }[]
}): Promise<void> {
  await requireRole(['finance', 'principal'])
  const supabase = await allocClient()
  const name = payload.name.trim()
  if (!name) throw new Error('Template name is required')

  let templateId = payload.id ?? null
  const row = {
    name,
    default_method: payload.method,
    default_amount: Math.round(Number(payload.amount || 0) * 100) / 100,
    category_id: payload.categoryId,
    status: payload.status,
  }
  if (templateId) {
    const { error } = await supabase
      .from('alloc_templates')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', templateId)
    if (error) throw new Error(error.message)
    const { error: delErr } = await supabase.from('alloc_template_splits').delete().eq('template_id', templateId)
    if (delErr) throw new Error(delErr.message)
  } else {
    const { data, error } = await supabase.from('alloc_templates').insert(row).select('id').single()
    if (error || !data) throw new Error(error?.message ?? 'insert failed')
    templateId = data.id as string
  }

  const splits = (payload.splits ?? []).filter((s) => Number(s.pct) > 0)
  if (splits.length > 0) {
    const { error } = await supabase.from('alloc_template_splits').insert(
      splits.map((s) => ({ template_id: templateId, company_id: s.companyId, pct: s.pct })),
    )
    if (error) throw new Error(error.message)
  }
  revalidatePath('/billing-allocator')
}

export async function deleteAllocTemplate(id: string): Promise<void> {
  await requireRole(['finance', 'principal'])
  const supabase = await allocClient()
  const { error } = await supabase.from('alloc_templates').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/billing-allocator')
}

// ─── Save an allocation batch ────────────────────────────────────────────────

export interface ExpenseBatchInput {
  description: string
  amount: number
  method: AllocMethod
  categoryId: string | null
  percentSplits?: { companyId: string; pct: number }[]
  customSplits?: { companyId: string; amount: number }[]
}

/** Targets + headcount context for a period — shared by save and update. */
async function loadCalcContext(
  supabase: SupabaseClient,
  period: string,
  hcMode: 'current' | 'snapshot',
): Promise<{
  targets: { id: string; label: string }[]
  staffSplits: StaffSplit[]
  hcLabel: string
  hcPeriodCol: string | null
}> {
  const pd = periodDate(period)
  const [{ data: cos, error: coErr }, { data: depts, error: dErr }] = await Promise.all([
    supabase.from('companies').select('id, short_code, name').eq('is_active', true).order('name'),
    supabase.from('departments').select('id, name'),
  ])
  if (coErr) throw new Error(coErr.message)
  if (dErr) throw new Error(dErr.message)
  const companies = (cos ?? []).map((c) => ({ id: c.id as string, label: (c.short_code ?? c.name) as string }))
  const deptById = new Map((depts ?? []).map((d) => [d.id as string, d.name as string]))

  // Headcount source: the period's snapshot, or the live list. Targets are
  // encoded (company uuid / dept:<uuid> / null own) — opaque to the engine.
  let staffSplits: StaffSplit[] = []
  let hcLabel = 'current'
  let hcPeriodCol: string | null = null
  if (hcMode === 'snapshot') {
    const { data: hist, error } = await supabase
      .from('alloc_staff_history')
      .select('company_id, department_id, pct, status')
      .eq('period_month', pd)
    if (error) throw new Error(error.message)
    if (!hist || hist.length === 0) throw new Error(`No headcount snapshot for ${period} — save one on the Staff tab first`)
    staffSplits = hist
      .filter((h) => h.status === 'active')
      .map((h) => ({
        companyId: encodeTarget((h.company_id as string | null), (h.department_id as string | null)),
        pct: Number(h.pct),
      }))
    hcLabel = period
    hcPeriodCol = pd
  } else {
    const [{ data: staff, error: sErr }, { data: splits, error: spErr }] = await Promise.all([
      supabase.from('alloc_staff').select('id, status'),
      supabase.from('alloc_staff_splits').select('staff_id, company_id, department_id, pct'),
    ])
    if (sErr) throw new Error(sErr.message)
    if (spErr) throw new Error(spErr.message)
    const active = new Set((staff ?? []).filter((s) => s.status === 'active').map((s) => s.id))
    staffSplits = (splits ?? [])
      .filter((x) => active.has(x.staff_id))
      .map((x) => ({
        companyId: encodeTarget((x.company_id as string | null), (x.department_id as string | null)),
        pct: Number(x.pct),
      }))
  }

  // Billable targets = subsidiaries + the departments the headcount actually
  // references (so Equal/headcount include e.g. Marketing, matching the sheet
  // where "Marketing Department" sat in the Companies list).
  const referencedDepts = Array.from(
    new Set(
      staffSplits
        .map((s) => s.companyId)
        .filter((k): k is string => !!k && k.startsWith(DEPT_PREFIX)),
    ),
  )
  const targets = [
    ...companies,
    ...referencedDepts.map((k) => ({
      id: k,
      label: `${deptById.get(k.slice(DEPT_PREFIX.length)) ?? '?'} (dept)`,
    })),
  ]
  return { targets, staffSplits, hcLabel, hcPeriodCol }
}

/**
 * Recomputes SERVER-SIDE with the same engine the preview used — the client's
 * numbers are never trusted — then stores txns + details (own share included,
 * flagged). hcMode 'snapshot' uses the period's own headcount snapshot.
 */
export async function saveAllocBatch(payload: {
  period: string
  hcMode: 'current' | 'snapshot'
  expenses: ExpenseBatchInput[]
}): Promise<{ txnNos: string[] }> {
  const user = await requireRole(['finance', 'principal'])
  const supabase = await allocClient()
  const pd = periodDate(payload.period)
  if (!payload.expenses || payload.expenses.length === 0) throw new Error('No expenses to save')

  // Editing a period that already has allocator invoices would silently desync
  // the drafts — force the delete-drafts-first flow instead.
  await assertPeriodNotInvoiced(supabase, payload.period)

  const { targets, staffSplits, hcLabel, hcPeriodCol } = await loadCalcContext(
    supabase, payload.period, payload.hcMode,
  )

  // Allocate everything BEFORE writing anything — one bad expense aborts all.
  const computed = payload.expenses.map((exp) => ({
    exp,
    lines: allocateExpense(
      {
        description: exp.description,
        amount: exp.amount,
        method: exp.method,
        percentSplits: exp.percentSplits,
        customSplits: exp.customSplits,
      },
      { companies: targets, staffSplits, hcLabel },
    ),
  }))

  // ALC-YYYYMM-### — continue from the highest existing seq (deletes leave
  // gaps; parsing max avoids reusing a number, like the sheet did).
  const ref = payload.period.replace('-', '')
  const { data: existing } = await supabase
    .from('alloc_txns')
    .select('txn_no')
    .like('txn_no', `ALC-${ref}-%`)
  let seq = (existing ?? [])
    .map((r) => parseInt(String(r.txn_no).split('-').pop() ?? '0', 10) || 0)
    .reduce((a, b) => Math.max(a, b), 0)

  const txnNos: string[] = []
  for (const { exp, lines } of computed) {
    seq += 1
    const txnNo = `ALC-${ref}-${String(seq).padStart(3, '0')}`
    const { data: txn, error: txnErr } = await supabase
      .from('alloc_txns')
      .insert({
        txn_no: txnNo,
        period_month: pd,
        description: exp.description.trim(),
        amount: Math.round(Number(exp.amount) * 100) / 100,
        method: exp.method,
        category_id: exp.categoryId,
        hc_period: exp.method === 'headcount' ? hcPeriodCol : null,
        created_by: user.id,
      })
      .select('id')
      .single()
    if (txnErr || !txn) throw new Error(txnErr?.message ?? 'txn insert failed')

    const { error: detErr } = await supabase.from('alloc_txn_details').insert(
      lines.map((l) => {
        const t = decodeTarget(l.companyId)
        return {
          txn_id: txn.id,
          company_id: t.companyId,
          department_id: t.departmentId,
          method_detail: l.detail,
          amount: l.amount,
          is_own_share: l.isOwnShare,
        }
      }),
    )
    if (detErr) {
      await supabase.from('alloc_txns').delete().eq('id', txn.id)
      throw new Error(`Details failed for ${txnNo} (txn rolled back): ${detErr.message}`)
    }
    txnNos.push(txnNo)
  }

  revalidatePath('/billing-allocator')
  return { txnNos }
}

/**
 * Replace a saved allocation in place — same txn_no, freshly recomputed
 * details ("我如果有错无法更改", user 2026-08-01). Same lock as delete: an
 * invoiced period refuses edits until its drafts are gone.
 */
export async function updateAllocTxn(payload: {
  txnId: string
  hcMode: 'current' | 'snapshot'
  expense: ExpenseBatchInput
}): Promise<{ txnNo: string }> {
  await requireRole(['finance', 'principal'])
  const supabase = await allocClient()

  const { data: txn, error: getErr } = await supabase
    .from('alloc_txns')
    .select('id, txn_no, period_month')
    .eq('id', payload.txnId)
    .single()
  if (getErr || !txn) throw new Error('Allocation not found')
  const period = dayjs(txn.period_month as string).format('YYYY-MM')
  await assertPeriodNotInvoiced(supabase, period)

  const { targets, staffSplits, hcLabel, hcPeriodCol } = await loadCalcContext(
    supabase, period, payload.hcMode,
  )
  const exp = payload.expense
  const lines = allocateExpense(
    {
      description: exp.description,
      amount: exp.amount,
      method: exp.method,
      percentSplits: exp.percentSplits,
      customSplits: exp.customSplits,
    },
    { companies: targets, staffSplits, hcLabel },
  )

  const { error: updErr } = await supabase
    .from('alloc_txns')
    .update({
      description: exp.description.trim(),
      amount: Math.round(Number(exp.amount) * 100) / 100,
      method: exp.method,
      category_id: exp.categoryId,
      hc_period: exp.method === 'headcount' ? hcPeriodCol : null,
    })
    .eq('id', txn.id)
  if (updErr) throw new Error(updErr.message)

  const { error: delErr } = await supabase.from('alloc_txn_details').delete().eq('txn_id', txn.id)
  if (delErr) throw new Error(delErr.message)
  const { error: detErr } = await supabase.from('alloc_txn_details').insert(
    lines.map((l) => {
      const t = decodeTarget(l.companyId)
      return {
        txn_id: txn.id,
        company_id: t.companyId,
        department_id: t.departmentId,
        method_detail: l.detail,
        amount: l.amount,
        is_own_share: l.isOwnShare,
      }
    }),
  )
  if (detErr) throw new Error(detErr.message)

  revalidatePath('/billing-allocator')
  return { txnNo: txn.txn_no as string }
}

export async function deleteAllocTxn(id: string): Promise<void> {
  await requireRole(['finance', 'principal'])
  const supabase = await allocClient()
  const { data: txn, error: getErr } = await supabase
    .from('alloc_txns')
    .select('id, period_month')
    .eq('id', id)
    .single()
  if (getErr || !txn) throw new Error('Allocation not found')
  await assertPeriodNotInvoiced(supabase, dayjs(txn.period_month as string).format('YYYY-MM'))
  const { error } = await supabase.from('alloc_txns').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/billing-allocator')
}

async function assertPeriodNotInvoiced(
  supabase: SupabaseClient,
  period: string,
): Promise<void> {
  const { data } = await supabase
    .from('invoices')
    .select('invoice_no, status')
    .eq('reference_no', refFor(period))
    .limit(1)
  if (data && data.length > 0) {
    throw new Error(
      `Period ${period} already has allocator invoices (${data[0].invoice_no}, ${data[0].status}). ` +
        'Delete the draft invoices in /statements first, then edit and regenerate.',
    )
  }
}

// ─── Generate draft invoices ─────────────────────────────────────────────────

export interface GenerateResult {
  created: { company: string; invoiceNo: string | null }[]
  skipped: { company: string; reason: string }[]
}

/**
 * One DRAFT invoice per bill-to company for the period, through the exact same
 * path as the manual multi-line Create Invoice button. Companies that already
 * have an allocator invoice this period (any status) are skipped — delete the
 * draft in /statements to regenerate.
 */
export async function generateAllocatorInvoices(period: string): Promise<GenerateResult> {
  await requireRole(['finance', 'principal'])
  const supabase = await allocClient()
  const pd = periodDate(period)
  const ref = refFor(period)

  const [{ data: txns, error: tErr }, { data: cos, error: cErr }, { data: depts }, { data: cats }] = await Promise.all([
    supabase
      .from('alloc_txns')
      .select('id, txn_no, description, amount, method, category_id, alloc_txn_details(company_id, department_id, method_detail, amount, is_own_share)')
      .eq('period_month', pd)
      .order('txn_no'),
    supabase.from('companies').select('id, short_code, name').eq('is_active', true),
    supabase.from('departments').select('id, name'),
    supabase.from('alloc_categories').select('id, coa_code'),
  ])
  if (tErr) throw new Error(tErr.message)
  if (cErr) throw new Error(cErr.message)
  if (!txns || txns.length === 0) throw new Error(`No allocations saved for ${period}`)

  const coLabel = new Map((cos ?? []).map((c) => [c.id as string, (c.short_code ?? c.name) as string]))
  const deptName = new Map((depts ?? []).map((d) => [d.id as string, d.name as string]))
  const labelFor = (targetId: string) =>
    targetId.startsWith(DEPT_PREFIX)
      ? `${deptName.get(targetId.slice(DEPT_PREFIX.length)) ?? '?'} (dept)`
      : coLabel.get(targetId) ?? targetId
  const coaByCat = new Map((cats ?? []).map((c) => [c.id as string, (c.coa_code as string | null) ?? '']))

  const { data: existing } = await supabase
    .from('invoices')
    .select('company_id, billable_to_department_id, invoice_no, status')
    .eq('reference_no', ref)
  const already = new Map(
    (existing ?? []).map((r) => [
      encodeTarget((r.company_id as string | null), (r.billable_to_department_id as string | null)) ?? '',
      `${r.invoice_no} (${r.status})`,
    ]),
  )

  // Group billed detail lines by target (subsidiary or department), txn order.
  type Line = { description: string; amount: number; categoryCode: string }
  const byTarget = new Map<string, Line[]>()
  for (const t of txns) {
    const details = (t.alloc_txn_details ?? []) as Array<{
      company_id: string | null; department_id: string | null
      method_detail: string; amount: number | string; is_own_share: boolean
    }>
    for (const d of details) {
      const key = encodeTarget(d.company_id, d.department_id)
      if (d.is_own_share || !key) continue
      if (!byTarget.has(key)) byTarget.set(key, [])
      byTarget.get(key)!.push({
        description: `${t.description} — ${d.method_detail} · ${t.txn_no}`,
        amount: Number(d.amount),
        categoryCode: coaByCat.get(t.category_id as string) ?? '',
      })
    }
  }
  if (byTarget.size === 0) throw new Error('Nothing billable — every line is own share')

  const monthLabel = dayjs(pd).format('MMM YYYY')
  const today = dayjs().format('YYYY-MM-DD')
  const result: GenerateResult = { created: [], skipped: [] }

  // SEQUENTIAL — invoice numbering and draft-cleanup behave exactly like
  // clicking the manual button once per target. Companies bill as subsidiary;
  // departments as dept_pool (inter-billing) — SAME createMultiLineInvoice.
  for (const [targetId, lines] of byTarget) {
    const label = labelFor(targetId)
    if (already.has(targetId)) {
      result.skipped.push({ company: label, reason: already.get(targetId)! })
      continue
    }
    const t = decodeTarget(targetId)
    const { invoice_no } = await createMultiLineInvoice({
      billableType: t.departmentId ? 'dept_pool' : 'subsidiary',
      billingMode: 'venture_attribution',
      period,
      invoiceDate: today,
      dueDate: '',
      referenceNo: ref,
      headerDescription: `Shared expense allocation — ${monthLabel}`,
      companyId: t.companyId ?? undefined,
      departmentId: t.departmentId ?? undefined,
      lines,
    })
    result.created.push({ company: label, invoiceNo: invoice_no })
  }

  revalidatePath('/billing-allocator')
  revalidatePath('/statements')
  return result
}
