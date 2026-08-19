'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { assertPeriodOpen } from '@/lib/period-lock'
import { postJournalEntry } from '@/lib/journal'
import { adjustPool } from '@/lib/voucher-paid-helpers'
import { validateConsolidation, poolAttributions, segmentForBillingMode, lineAttributions } from '@/lib/invoice-settlement'
import { deptNameToSegment, fallbackRevenueGlCode, invoiceJeDate } from '@/lib/billing'
import { payerExpenseSplits, type NatureSplit } from '@/lib/inter-billing-nature'
import { INVOICE_BILLING_MODE_TO_POOL } from '@/lib/cfo-reports'
import {
  buildConsolidatedInvoiceLines,
  periodShortLabel,
  PAYROLL_SEGMENT_LABEL,
  OWN_SHARE_SEGMENTS,
  type DeptComponentGroup,
  type PayrollSegment,
} from '@/lib/staff-allocation'

// Payer-side inter-billing splits BY NATURE (user 2026-07-24): the paying
// dept's expense JE debits what the charge actually was — rent share → 9094,
// utilities share → 9091, payroll share → 9030 — instead of one lumped 905x.
// The dept's 905x stays as the FALLBACK for uncategorised lines only.
// Sum must equal the invoice total or we fail loud (asymmetric JE otherwise).
async function interBillingNatureSplits(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string,
  invoiceTotal: number,
  fallbackCode: string,
): Promise<NatureSplit[]> {
  const [{ data: hdr }, { data: ilines }] = await Promise.all([
    supabase.from('invoices').select('category_code').eq('id', invoiceId).maybeSingle(),
    supabase.from('invoice_lines').select('category_code, amount').eq('invoice_id', invoiceId),
  ])
  const headerCategory = (hdr?.category_code as string | null) ?? null
  const cats = [
    ...new Set(
      [...(ilines ?? []).map((l) => l.category_code as string | null), headerCategory].filter(
        (c): c is string => !!c,
      ),
    ),
  ]
  const { data: coa } = cats.length
    ? await supabase.from('chart_of_accounts').select('code, type').in('code', cats)
    : { data: [] }
  const typeMap = new Map((coa ?? []).map((c) => [c.code as string, c.type as string]))
  const splits = payerExpenseSplits(
    (ilines ?? []).map((l) => ({ category_code: (l.category_code as string | null) ?? null, amount: Number(l.amount) })),
    invoiceTotal,
    headerCategory,
    (code) => typeMap.get(code),
    fallbackCode,
  )
  const sum = Math.round(splits.reduce((s, x) => s + x.amount, 0) * 100) / 100
  if (Math.abs(sum - invoiceTotal) > 0.005) {
    throw new Error(
      `Inter-billing nature split RM ${sum.toFixed(2)} does not match invoice total RM ${invoiceTotal.toFixed(2)}`,
    )
  }
  return splits
}

// Mig 200/P1-6a: invoice billing_mode → revenue GL code mapping.
// 2026-06-11: fallback now lives in lib/billing.ts (fallbackRevenueGlCode) —
// the four *_attribution modes are salary recharges and default to 5050
// Salary Income; everything else stays on 5011 Service Revenue — Subs.
function revenueGlCode(billingMode: string | null): string {
  return fallbackRevenueGlCode(billingMode)
}

// Note: invoices.category_code (added by mig 230) keeps its column name; only
// payment_voucher_sources.category_code was renamed by mig 238. Values stored
// here are chart_of_accounts.code post-unified-COA — the COA IS the GL now,
// so we trust whatever account the user picked as the credit side. Typical
// uses:
//   - revenue (5000-series)  → ordinary service billing
//   - other_income (9000)    → expense-recovery invoices
//   - receivable (3050-3071) → "bill-back / pay-on-behalf" — clearing the
//                              receivable originally booked when HV paid on
//                              someone's behalf
// Previously this function would silently force a non-revenue pick back to
// 5000, which mis-credited the GL on bill-back invoices.
async function resolveRevenueGlCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  categoryCode: string | null,
  billingMode: string | null,
): Promise<string> {
  if (categoryCode) {
    const { data: acct } = await supabase
      .from('chart_of_accounts')
      .select('code')
      .eq('code', categoryCode)
      .eq('is_active', true)
      .maybeSingle()
    if (acct?.code) return acct.code
  }
  return revenueGlCode(billingMode)
}

export interface GenerateInvoicesResult {
  generated: number
  skipped: number
  errors: string[]
  period: string
  mode_counts: Record<string, number>
}

// ─── Create one-off invoice (Finance, Stage 4) ─────────────────────────────
//
// Full-featured sibling of createOpexInvoice, used by the Create Invoice
// button on the billing page. Accepts the richer metadata Finance needs on
// an actual invoice (invoice_date, due_date, description, reference_no) on
// top of the existing company/period/amount/billing_mode fields.

const CREATE_INVOICE_MODES = [
  'hr_attribution',
  'finance_attribution',
  'director_office_attribution',
  'director_attribution',
  'marketing_project',
  'venture_attribution',
] as const

export type CreateInvoiceMode = (typeof CREATE_INVOICE_MODES)[number]

export type BillableToKind = 'subsidiary' | 'director' | 'dept_pool' | 'freetext'

export async function createManualInvoice(formData: FormData): Promise<void> {
  const user = await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  // Item 5: 4-way billable target. Subsidiary still uses the existing
  // company_id column; director/dept_pool/freetext use the new columns
  // added in mig 225.
  const billableToType = (String(formData.get('billable_to_type') ?? 'subsidiary')) as BillableToKind
  const companyId = String(formData.get('company_id') ?? '')
  const billableDeptId = String(formData.get('billable_to_department_id') ?? '')
  const billableFreetext = String(formData.get('billable_to_freetext_name') ?? '').trim()

  const rawPeriod = String(formData.get('period_month') ?? '')
  const rawMode = String(formData.get('billing_mode') ?? '')
  const rawAmount = String(formData.get('amount') ?? '')
  const invoiceDate = String(formData.get('invoice_date') ?? '').trim() || null
  const dueDate = String(formData.get('due_date') ?? '').trim() || null
  const description = String(formData.get('description') ?? '').trim() || null
  const referenceNo = String(formData.get('reference_no') ?? '').trim() || null
  const categoryCode = String(formData.get('category_code') ?? '').trim() || null

  if (!['subsidiary', 'director', 'dept_pool', 'freetext'].includes(billableToType)) {
    throw new Error(`Unsupported billable_to_type: ${billableToType}`)
  }
  if (billableToType === 'subsidiary' && !companyId) {
    throw new Error('Subsidiary is required')
  }
  if (billableToType === 'director' && !billableFreetext) {
    throw new Error('Director name is required')
  }
  if (billableToType === 'dept_pool' && !billableDeptId) {
    throw new Error('Department is required')
  }
  if (billableToType === 'freetext' && !billableFreetext) {
    throw new Error('Billable party name is required')
  }
  if (!rawPeriod) throw new Error('Period is required')
  if (!CREATE_INVOICE_MODES.includes(rawMode as CreateInvoiceMode)) {
    throw new Error(`Unsupported billing mode: ${rawMode}`)
  }
  const billingMode = rawMode as CreateInvoiceMode

  const amount = Number(rawAmount)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number')
  }

  const period = dayjs(rawPeriod).startOf('month').format('YYYY-MM-DD')
  await assertPeriodOpen(supabase, period)

  // P0-2: mint invoice_no via RPC so it holds the hv_invoice_no advisory lock.
  // Prevents collisions with concurrent generate_invoices_from_request calls.
  const { data: invoiceNo, error: mintErr } = await supabase.rpc('mint_invoice_no', {
    p_period: period,
  })
  if (mintErr || !invoiceNo) {
    throw new Error(`Failed to mint invoice number: ${mintErr?.message ?? 'unknown'}`)
  }

  const { error } = await supabase.from('invoices').insert({
    invoice_no: invoiceNo,
    period_month: period,
    billing_mode: billingMode,
    category_code: categoryCode,
    base_amount: amount,
    total_amount: amount,
    status: 'draft',
    invoice_date: invoiceDate,
    due_date: dueDate,
    description,
    reference_no: referenceNo,
    created_by: user.id,
    billable_to_type: billableToType,
    company_id: billableToType === 'subsidiary' ? companyId : null,
    billable_to_department_id: billableToType === 'dept_pool' ? billableDeptId : null,
    billable_to_freetext_name:
      billableToType === 'director' || billableToType === 'freetext' ? billableFreetext : null,
  })

  if (error) throw new Error(`Failed to create invoice: ${error.message}`)

  revalidatePath('/billing')
  revalidatePath('/statements')
}

// ─── Create multi-line invoice (Finance) ────────────────────────────────────
//
// One invoice with N line items: same bill-to + billing_mode for all lines,
// but each line has its own description, amount, and category_code.
// invoices.total_amount = SUM(lines.amount). Per-line categories feed the
// approve/issue JE (per-line Cr) so P&L attribution stays correct even when
// items hit different account codes.

export interface InvoiceLineInput {
  description: string
  amount: number
  categoryCode: string
}

// ─── Copy an existing invoice into a new DRAFT for the current month ──────────
// Monthly billing repeats with small tweaks, so let Finance duplicate a prior
// invoice (header + line items + who-to-bill + mode) as a fresh draft, then
// edit the amount / description via the inline Edit modal before issuing.
export async function copyInvoice(formData: FormData): Promise<void> {
  const user = await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  const sourceId = (formData.get('invoice_id') as string) ?? ''
  if (!sourceId) throw new Error('Invoice id is required')

  const { data: src, error: srcErr } = await supabase
    .from('invoices')
    .select('billing_mode, billable_to_type, company_id, billable_to_department_id, billable_to_freetext_name, billable_to_freetext_address, billable_to_freetext_phone, billable_to_freetext_email, category_code, base_amount, total_amount, description, reference_no')
    .eq('id', sourceId)
    .single()
  if (srcErr || !src) throw new Error('Source invoice not found')

  // New draft lands in the CURRENT billing month (copy last month → bill this).
  const period = dayjs().startOf('month').format('YYYY-MM-DD')
  await assertPeriodOpen(supabase, period)

  const { data: invoiceNo, error: mintErr } = await supabase.rpc('mint_invoice_no', { p_period: period })
  if (mintErr || !invoiceNo) {
    throw new Error(`Failed to mint invoice number: ${mintErr?.message ?? 'unknown'}`)
  }

  const { data: created, error: invErr } = await supabase
    .from('invoices')
    .insert({
      invoice_no: invoiceNo as string,
      period_month: period,
      billing_mode: src.billing_mode,
      category_code: src.category_code,
      base_amount: src.base_amount,
      total_amount: src.total_amount,
      status: 'draft',
      invoice_date: dayjs().format('YYYY-MM-DD'),
      due_date: null,
      description: src.description,
      reference_no: src.reference_no,
      created_by: user.id,
      billable_to_type: src.billable_to_type,
      company_id: src.company_id,
      billable_to_department_id: src.billable_to_department_id,
      billable_to_freetext_name: src.billable_to_freetext_name,
      billable_to_freetext_address: src.billable_to_freetext_address,
      billable_to_freetext_phone: src.billable_to_freetext_phone,
      billable_to_freetext_email: src.billable_to_freetext_email,
    })
    .select('id')
    .single()
  if (invErr || !created) throw new Error(`Failed to copy invoice: ${invErr?.message ?? 'unknown'}`)

  // Copy line items if the source is a multi-line invoice.
  const { data: lines } = await supabase
    .from('invoice_lines')
    .select('line_no, description, amount, category_code')
    .eq('invoice_id', sourceId)
    .order('line_no')
  if (lines && lines.length > 0) {
    const { error: linesErr } = await supabase.from('invoice_lines').insert(
      lines.map((l) => ({
        invoice_id: created.id,
        line_no: l.line_no,
        description: l.description,
        amount: l.amount,
        category_code: l.category_code,
      })),
    )
    if (linesErr) {
      await supabase.from('invoices').delete().eq('id', created.id).eq('status', 'draft')
      throw new Error(`Failed to copy invoice lines (rolled back): ${linesErr.message}`)
    }
  }

  revalidatePath('/billing')
  revalidatePath('/statements')
  redirect('/billing')
}

export async function createMultiLineInvoice(
  payload: {
    billableType: BillableToKind
    billingMode: CreateInvoiceMode
    period: string // YYYY-MM
    invoiceDate: string // YYYY-MM-DD
    dueDate: string
    referenceNo: string
    headerDescription: string
    companyId?: string
    departmentId?: string
    freetextName?: string
    freetextAddress?: string
    freetextPhone?: string
    freetextEmail?: string
    lines: InvoiceLineInput[]
  },
): Promise<{ id: string; invoice_no: string | null }> {
  const user = await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  if (!['subsidiary', 'director', 'dept_pool', 'freetext'].includes(payload.billableType)) {
    throw new Error(`Unsupported billable_to_type: ${payload.billableType}`)
  }
  if (!CREATE_INVOICE_MODES.includes(payload.billingMode)) {
    throw new Error(`Unsupported billing mode: ${payload.billingMode}`)
  }
  if (payload.billableType === 'subsidiary' && !payload.companyId) {
    throw new Error('Subsidiary is required')
  }
  if (payload.billableType === 'director' && !payload.freetextName?.trim()) {
    throw new Error('Director name is required')
  }
  if (payload.billableType === 'dept_pool' && !payload.departmentId) {
    throw new Error('Department is required')
  }
  if (payload.billableType === 'freetext' && !payload.freetextName?.trim()) {
    throw new Error('Billable party name is required')
  }
  if (!payload.period) throw new Error('Period is required')
  if (!payload.lines || payload.lines.length === 0) {
    throw new Error('At least one line item is required')
  }

  // Validate every line.
  for (let i = 0; i < payload.lines.length; i++) {
    const ln = payload.lines[i]
    if (!Number.isFinite(ln.amount) || ln.amount <= 0) {
      throw new Error(`Line ${i + 1}: amount must be a positive number`)
    }
    if (payload.lines.length >= 2 && !ln.description.trim()) {
      throw new Error(`Line ${i + 1}: description is required (with 2+ lines)`)
    }
    // category_code is optional but recommended; allow empty (will fall back
    // to revenueGlCode 5000 at issue time, same as single-line invoices).
  }

  const total = payload.lines.reduce((s, l) => s + Number(l.amount), 0)
  if (!(total > 0)) throw new Error('Total amount must be positive')
  const totalRounded = Math.round(total * 100) / 100

  const period = dayjs(payload.period).startOf('month').format('YYYY-MM-DD')
  await assertPeriodOpen(supabase, period)

  const { data: invoiceNo, error: mintErr } = await supabase.rpc('mint_invoice_no', {
    p_period: period,
  })
  if (mintErr || !invoiceNo) {
    throw new Error(`Failed to mint invoice number: ${mintErr?.message ?? 'unknown'}`)
  }

  const { data: created, error: invErr } = await supabase
    .from('invoices')
    .insert({
      invoice_no: invoiceNo as string,
      period_month: period,
      billing_mode: payload.billingMode,
      // Header description is just a summary; per-line descriptions are the
      // source of truth. Leave category_code NULL so issue flow knows to
      // fan out by line (Cr per line) rather than crediting one account.
      category_code: null,
      base_amount: totalRounded,
      total_amount: totalRounded,
      status: 'draft',
      invoice_date: payload.invoiceDate || null,
      due_date: payload.dueDate || null,
      description: payload.headerDescription.trim() || null,
      reference_no: payload.referenceNo.trim() || null,
      created_by: user.id,
      billable_to_type: payload.billableType,
      company_id: payload.billableType === 'subsidiary' ? payload.companyId : null,
      billable_to_department_id: payload.billableType === 'dept_pool' ? payload.departmentId : null,
      billable_to_freetext_name:
        payload.billableType === 'director' || payload.billableType === 'freetext'
          ? payload.freetextName?.trim() ?? null
          : null,
      billable_to_freetext_address:
        payload.billableType === 'freetext' ? payload.freetextAddress?.trim() || null : null,
      billable_to_freetext_phone:
        payload.billableType === 'freetext' ? payload.freetextPhone?.trim() || null : null,
      billable_to_freetext_email:
        payload.billableType === 'freetext' ? payload.freetextEmail?.trim() || null : null,
    })
    .select('id, invoice_no')
    .single()

  if (invErr || !created) {
    throw new Error(`Failed to create invoice: ${invErr?.message ?? 'unknown'}`)
  }

  // Insert lines. If this fails we should roll back the invoice — but
  // there's no atomic SQL transaction available via PostgREST, so on
  // failure we attempt to clean up.
  const lineRows = payload.lines.map((l, idx) => ({
    invoice_id: created.id,
    line_no: idx + 1,
    description: l.description.trim(),
    amount: Math.round(Number(l.amount) * 100) / 100,
    category_code: l.categoryCode.trim() || null,
  }))

  const { error: linesErr } = await supabase.from('invoice_lines').insert(lineRows)
  if (linesErr) {
    // Best-effort cleanup; the invoice is still draft so it's safe to delete.
    await supabase.from('invoices').delete().eq('id', created.id).eq('status', 'draft')
    throw new Error(`Failed to create invoice lines (invoice rolled back): ${linesErr.message}`)
  }

  revalidatePath('/billing')
  revalidatePath('/statements')

  return { id: created.id, invoice_no: created.invoice_no }
}

// ─── Director CTC per subsidiary (Finance auto-fill helper) ──────────────────
//
// Mig 206: when Finance opens Create Invoice with mode=director_attribution,
// pre-populate the per-sub amount rows from director_ctc (HR already entered).
// Aggregate-only — does NOT leak per-director breakdown. Returns [] when HR
// hasn't entered CTC yet for the period.

export interface DirectorCtcRow {
  companyId: string
  shortCode: string
  name: string
  totalCtc: number
}

export async function fetchDirectorCtcByCompany(
  periodMonth: string,
): Promise<DirectorCtcRow[]> {
  await requireRole(['principal', 'finance', 'hr'])
  const supabase = await createClient()

  const period = dayjs(periodMonth).startOf('month').format('YYYY-MM-DD')

  const { data, error } = await supabase.rpc('get_director_ctc_by_company', {
    p_period_month: period,
  })

  if (error) throw new Error(`Failed to fetch director CTC: ${error.message}`)

  return (data ?? []).map((r) => ({
    companyId: r.company_id,
    shortCode: r.company_short_code,
    name: r.company_name,
    totalCtc: Number(r.total_ctc),
  }))
}

// ─── Staff allocation per company for a dept (invoice auto-fill) ─────────────
//
// 2026-07-03: same idea as fetchDirectorCtcByCompany but for shared-services
// staff. HR enters per-employee % splits (/hr-costing/allocation); the RPC
// aggregates employer cost × pct per dept × company. Aggregate-only — no
// staff names or salaries. Used to pre-populate the per-sub amount rows when
// Finance opens Create Invoice with an *_attribution mode.

export interface StaffAllocationCompanyRow {
  companyId: string
  shortCode: string
  name: string
  amount: number
  /** Invoice line components (user sample 2026-07-03) — sum equals amount. */
  salary: number
  allowance: number
  epf: number
  socso: number
  eis: number
}

const MODE_TO_DEPT: Partial<Record<CreateInvoiceMode, string>> = {
  hr_attribution: 'HR',
  finance_attribution: 'Finance',
  director_office_attribution: 'Director Office',
}

export async function fetchStaffAllocationByCompany(
  periodMonth: string,
  mode: CreateInvoiceMode,
): Promise<StaffAllocationCompanyRow[]> {
  await requireRole(['principal', 'finance', 'hr'])
  const supabase = await createClient()

  const deptName = MODE_TO_DEPT[mode]
  if (!deptName) return []

  const period = dayjs(periodMonth).startOf('month').format('YYYY-MM-DD')

  const { data, error } = await supabase.rpc('get_staff_billing_allocation', {
    p_period_month: period,
  })

  if (error) throw new Error(`Failed to fetch staff allocation: ${error.message}`)

  return (data ?? [])
    // company_id NULL = the HV own-share row (dept total − billed). It is
    // display-only on the Billing page — never something Finance invoices.
    .filter((r) => r.department_name === deptName && r.company_id !== null)
    .map((r) => ({
      companyId: r.company_id as string,
      shortCode: r.company_short_code,
      name: r.company_name,
      amount: Number(r.amount),
      salary: Number(r.salary_amount),
      allowance: Number(r.allowance_amount),
      epf: Number(r.epf_amount),
      socso: Number(r.socso_amount),
      eis: Number(r.eis_amount),
    }))
}

// ─── Generate monthly invoices for a period (Finance) ────────────────────────

export async function generateMonthlyInvoices(
  formData: FormData
): Promise<GenerateInvoicesResult> {
  await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  const rawPeriod = (formData.get('period_month') as string) ?? ''
  if (!rawPeriod) throw new Error('Period month is required')

  const period = dayjs(rawPeriod).startOf('month').format('YYYY-MM-DD')

  await assertPeriodOpen(supabase, period)

  // Optional: generate only specific billing modes
  const modesRaw = formData.get('modes') as string | null
  const modes = modesRaw ? modesRaw.split(',').filter(Boolean) : null

  const { data, error } = await supabase.rpc('generate_monthly_invoices', {
    p_period_month: period,
    ...(modes ? { p_modes: modes } : {}),
  })

  if (error) {
    if (error.message.includes('No HR cost submission')) {
      throw new Error(
        `No HR cost submission for ${dayjs(period).format('MMM YYYY')}. Ask HR to submit via /hr-costing before generating invoices.`
      )
    }
    throw new Error(`Failed to generate invoices: ${error.message}`)
  }

  const result = data as unknown as GenerateInvoicesResult

  revalidatePath('/billing')
  revalidatePath('/statements')
  revalidatePath('/dashboard')

  return {
    generated: Number(result.generated ?? 0),
    skipped: Number(result.skipped ?? 0),
    errors: Array.isArray(result.errors) ? result.errors.map(String) : [],
    period: String(result.period ?? period),
    mode_counts: (result.mode_counts ?? {}) as Record<string, number>,
  }
}

// ─── Create marketing project contract (Finance) ────────────────────────────

export async function createContract(formData: FormData) {
  const user = await requireRole(['finance', 'dept_manager', 'principal'])
  const supabase = await createClient()

  const companyId = (formData.get('company_id') as string) ?? ''
  const description = (formData.get('description') as string) ?? ''
  const amount = parseFloat((formData.get('amount') as string) ?? '0')
  const startDate = (formData.get('start_date') as string) || null
  const endDate = (formData.get('end_date') as string) || null
  const returnPath = (formData.get('return_path') as string) || '/billing'

  if (!companyId) throw new Error('Company is required')
  if (!description.trim()) throw new Error('Description is required')
  if (isNaN(amount) || amount <= 0) throw new Error('Amount must be > 0')

  // Fetch Marketing department ID
  const { data: mktDept } = await supabase
    .from('departments')
    .select('id')
    .eq('name', 'Marketing')
    .single()

  if (!mktDept) throw new Error('Marketing department not found')

  // Dept Manager: must be Marketing's manager. Mig 207 RLS also enforces this,
  // but fail fast here with a clean error instead of a generic RLS failure.
  if (user.role === 'dept_manager' && user.department_id !== mktDept.id) {
    throw new Error('Only Marketing department manager can create Marketing contracts')
  }

  // Insert contract (active but not yet approved)
  const { data: contract, error } = await supabase
    .from('service_contracts')
    .insert({
      department_id: mktDept.id,
      company_id: companyId,
      billing_mode: 'marketing_project',
      description,
      amount,
      start_date: startDate,
      end_date: endDate,
      status: 'active',
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !contract) {
    throw new Error(`Failed to create contract: ${error?.message ?? 'unknown'}`)
  }

  // Create approval request for Principal
  const { data: company } = await supabase
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .single()

  await supabase.from('approval_requests').insert({
    request_type: 'new_contract',
    reference_id: contract.id,
    reference_table: 'service_contracts',
    submitted_by: user.id,
    description: `Marketing contract: ${description} (${company?.name ?? companyId})`,
    amount,
    status: 'pending',
    workflow_state: 'submitted',
  })

  revalidatePath('/billing')
  revalidatePath('/dept-pool')
  revalidatePath('/approvals')
  redirect(returnPath)
}

// ─── Update marketing project contract (Finance) ────────────────────────────

export async function updateContract(formData: FormData) {
  await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  const id = (formData.get('id') as string) ?? ''
  const companyId = (formData.get('company_id') as string) ?? ''
  const description = (formData.get('description') as string) ?? ''
  const amount = parseFloat((formData.get('amount') as string) ?? '0')
  const startDate = (formData.get('start_date') as string) || null
  const endDate = (formData.get('end_date') as string) || null

  if (!id) throw new Error('Contract id is required')
  if (!companyId) throw new Error('Company is required')
  if (!description.trim()) throw new Error('Description is required')
  if (isNaN(amount) || amount <= 0) throw new Error('Amount must be > 0')

  const { error } = await supabase
    .from('service_contracts')
    .update({
      company_id: companyId,
      description,
      amount,
      start_date: startDate,
      end_date: endDate,
    })
    .eq('id', id)
    .eq('billing_mode', 'marketing_project')

  if (error) {
    throw new Error(`Failed to update contract: ${error.message}`)
  }

  revalidatePath('/billing')
  redirect('/billing')
}

// ─── Credit Notes (Finance creates, Principal approves) ─────────────────────

export async function createCreditNote(formData: FormData) {
  const user = await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  const invoiceId = (formData.get('invoice_id') as string) ?? ''
  const amount = parseFloat((formData.get('amount') as string) ?? '0')
  const reason = (formData.get('reason') as string)?.trim() ?? ''
  // Phase 11: each CN carries its own pool + category for GL routing.
  // Optional on action input — caller may omit to inherit from invoice.
  const rawBillingMode = String(formData.get('billing_mode') ?? '').trim() || null
  const billingMode =
    rawBillingMode && CREATE_INVOICE_MODES.includes(rawBillingMode as CreateInvoiceMode)
      ? (rawBillingMode as CreateInvoiceMode)
      : null
  const categoryCode = String(formData.get('category_code') ?? '').trim() || null

  if (!invoiceId) throw new Error('Invoice is required')
  if (isNaN(amount) || amount <= 0) throw new Error('Amount must be greater than 0')
  if (!reason) throw new Error('Reason is required')

  // Item 5: credit note inherits billable_to from its parent invoice. The
  // 4 polymorphic columns are mirrored across — saves needing a separate
  // selector on the credit-note form.
  // Phase 11: also inherit billing_mode if the caller didn't override.
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select(
      'id, company_id, total_amount, billable_to_type, billable_to_department_id, billable_to_freetext_name, billing_mode'
    )
    .eq('id', invoiceId)
    .single()

  if (invErr || !invoice) throw new Error('Invoice not found')
  if (amount > Number(invoice.total_amount)) {
    throw new Error(`Credit note amount cannot exceed invoice total (RM ${Number(invoice.total_amount).toFixed(2)})`)
  }

  // Mint CN number under advisory lock (mig 227). Replaces the old
  // SELECT count(*) + 1 pattern which collided under concurrent creates.
  const { data: creditNoteNo, error: mintErr } = await supabase.rpc('mint_credit_note_no', {
    p_period: dayjs().format('YYYY-MM-DD'),
  })
  if (mintErr || !creditNoteNo) {
    throw new Error(`Failed to mint credit note number: ${mintErr?.message ?? 'unknown'}`)
  }

  const { data, error } = await supabase
    .from('credit_notes')
    .insert({
      credit_note_no: creditNoteNo,
      invoice_id: invoiceId,
      company_id: invoice.company_id,
      billable_to_type: invoice.billable_to_type,
      billable_to_department_id: invoice.billable_to_department_id,
      billable_to_freetext_name: invoice.billable_to_freetext_name,
      billing_mode: billingMode ?? invoice.billing_mode,
      category_code: categoryCode,
      amount,
      reason,
      status: 'draft',
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create credit note: ${error.message}`)

  revalidatePath('/billing')
  return data.id
}

// ─── Delete draft invoice (Finance — soft to recover from mistakes) ───────

export async function deleteDraftInvoice(formData: FormData): Promise<void> {
  await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  const id = String(formData.get('id') ?? '').trim()
  if (!id) throw new Error('Invoice id is required')

  const { data: inv } = await supabase
    .from('invoices')
    .select('id, status, period_month, invoice_no')
    .eq('id', id)
    .single()
  if (!inv) throw new Error('Invoice not found')
  if (inv.status !== 'draft') {
    throw new Error(`Cannot delete: invoice ${inv.invoice_no ?? inv.id} is ${inv.status}`)
  }
  await assertPeriodOpen(supabase, inv.period_month)

  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', id)
    .eq('status', 'draft') // guard against races

  if (error) throw new Error(`Failed to delete invoice: ${error.message}`)

  revalidatePath('/billing')
  revalidatePath('/statements')
}

// ─── Update draft invoice (Finance — fix typos before approving) ──────────
//
// Only edits the "soft" fields: amount, category, description, dates,
// reference. Hard structural fields (billing_mode, billable_to_*, company)
// stay locked — those are essentially "which pool / who to bill", changing
// them = delete + recreate. Per user request 2026-05-27.

export async function updateDraftInvoice(formData: FormData): Promise<void> {
  await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  const id = String(formData.get('id') ?? '').trim()
  if (!id) throw new Error('Invoice id is required')

  const { data: inv } = await supabase
    .from('invoices')
    .select('id, status, period_month, invoice_no')
    .eq('id', id)
    .single()
  if (!inv) throw new Error('Invoice not found')
  if (inv.status !== 'draft') {
    throw new Error(`Cannot edit: invoice ${inv.invoice_no ?? inv.id} is ${inv.status}`)
  }
  await assertPeriodOpen(supabase, inv.period_month)

  const rawAmount = String(formData.get('amount') ?? '')
  const amount = Number(rawAmount)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number')
  }

  // Multi-line invoices: total_amount must stay = SUM(lines). Until a line
  // editor exists, an amount change here would silently break that tie.
  const { data: lineRows } = await supabase
    .from('invoice_lines')
    .select('amount')
    .eq('invoice_id', id)
  if (lineRows && lineRows.length > 0) {
    const lineSum = lineRows.reduce((s, l) => s + Number(l.amount), 0)
    if (Math.abs(lineSum - amount) > 0.005) {
      throw new Error(
        `This invoice has ${lineRows.length} line items summing RM ${lineSum.toFixed(2)} — the total must match. Edit or recreate the lines instead of overriding the total.`,
      )
    }
  }

  const categoryCode = String(formData.get('category_code') ?? '').trim() || null
  const description = String(formData.get('description') ?? '').trim() || null
  const invoiceDate = String(formData.get('invoice_date') ?? '').trim() || null
  const dueDate = String(formData.get('due_date') ?? '').trim() || null
  const referenceNo = String(formData.get('reference_no') ?? '').trim() || null

  // Structural fields — fully editable while draft (user 2026-06-12). Drafts
  // have no GL/pool/statement footprint (everything posts at issue), so the
  // same validation as createManualInvoice is all that's needed.
  const updates: {
    total_amount: number
    base_amount: number
    category_code: string | null
    description: string | null
    invoice_date: string | null
    due_date: string | null
    reference_no: string | null
    billing_mode?: CreateInvoiceMode
    billable_to_type?: BillableToKind
    company_id?: string | null
    billable_to_department_id?: string | null
    billable_to_freetext_name?: string | null
    period_month?: string
  } = {
    total_amount: amount,
    base_amount: amount,
    category_code: categoryCode,
    description,
    invoice_date: invoiceDate,
    due_date: dueDate,
    reference_no: referenceNo,
  }

  const rawMode = String(formData.get('billing_mode') ?? '').trim()
  if (rawMode) {
    if (!CREATE_INVOICE_MODES.includes(rawMode as CreateInvoiceMode)) {
      throw new Error(`Unsupported billing mode: ${rawMode}`)
    }
    updates.billing_mode = rawMode as CreateInvoiceMode
  }

  const rawBillableType = String(formData.get('billable_to_type') ?? '').trim()
  if (rawBillableType) {
    if (!['subsidiary', 'director', 'dept_pool', 'freetext'].includes(rawBillableType)) {
      throw new Error(`Unsupported billable_to_type: ${rawBillableType}`)
    }
    const companyId = String(formData.get('company_id') ?? '').trim()
    const billableDeptId = String(formData.get('billable_to_department_id') ?? '').trim()
    const billableFreetext = String(formData.get('billable_to_freetext_name') ?? '').trim()
    if (rawBillableType === 'subsidiary' && !companyId) throw new Error('Subsidiary is required')
    if (rawBillableType === 'dept_pool' && !billableDeptId) throw new Error('Department is required')
    if ((rawBillableType === 'director' || rawBillableType === 'freetext') && !billableFreetext) {
      throw new Error('Billable party name is required')
    }
    updates.billable_to_type = rawBillableType as BillableToKind
    updates.company_id = rawBillableType === 'subsidiary' ? companyId : null
    updates.billable_to_department_id = rawBillableType === 'dept_pool' ? billableDeptId : null
    updates.billable_to_freetext_name =
      rawBillableType === 'director' || rawBillableType === 'freetext' ? billableFreetext : null
  }

  const rawPeriod = String(formData.get('period_month') ?? '').trim()
  if (rawPeriod) {
    const newPeriod = dayjs(rawPeriod).startOf('month').format('YYYY-MM-DD')
    if (newPeriod !== inv.period_month) {
      await assertPeriodOpen(supabase, newPeriod)
      updates.period_month = newPeriod
    }
  }

  const { error } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', id)
    .eq('status', 'draft')

  if (error) throw new Error(`Failed to update invoice: ${error.message}`)

  revalidatePath('/billing')
  revalidatePath('/statements')
}

// ─── Full draft edit (Finance) ───────────────────────────────────────────────
// The edit modal mirrors the create form 1:1 (user 2026-06-12: "edit 时和我开
// invoice 时一样，全部都能改，multi-line 也一样"). Same payload contract +
// validation as createMultiLineInvoice; lines are REPLACED wholesale.
// Format rule: 2+ lines → multi-line shape (invoice_lines rows, header
// category NULL so issue fans the Cr out per line); exactly 1 line → simple
// shape (no line rows; the line's description/category live on the header,
// same as createManualInvoice would have written).
export async function updateDraftInvoiceFull(payload: {
  id: string
  billableType: BillableToKind
  billingMode: CreateInvoiceMode
  period: string // YYYY-MM
  invoiceDate: string
  dueDate: string
  referenceNo: string
  headerDescription: string
  companyId?: string
  departmentId?: string
  freetextName?: string
  freetextAddress?: string
  freetextPhone?: string
  freetextEmail?: string
  lines: InvoiceLineInput[]
}): Promise<void> {
  await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  if (!payload.id) throw new Error('Invoice id is required')
  if (!['subsidiary', 'director', 'dept_pool', 'freetext'].includes(payload.billableType)) {
    throw new Error(`Unsupported billable_to_type: ${payload.billableType}`)
  }
  if (!CREATE_INVOICE_MODES.includes(payload.billingMode)) {
    throw new Error(`Unsupported billing mode: ${payload.billingMode}`)
  }
  if (payload.billableType === 'subsidiary' && !payload.companyId) throw new Error('Subsidiary is required')
  if (payload.billableType === 'dept_pool' && !payload.departmentId) throw new Error('Department is required')
  if (
    (payload.billableType === 'director' || payload.billableType === 'freetext') &&
    !payload.freetextName?.trim()
  ) {
    throw new Error('Billable party name is required')
  }
  if (!payload.period) throw new Error('Period is required')
  if (!payload.lines || payload.lines.length === 0) {
    throw new Error('At least one line item is required')
  }
  for (let i = 0; i < payload.lines.length; i++) {
    const ln = payload.lines[i]
    if (!Number.isFinite(ln.amount) || ln.amount <= 0) {
      throw new Error(`Line ${i + 1}: amount must be a positive number`)
    }
    if (payload.lines.length >= 2 && !ln.description.trim()) {
      throw new Error(`Line ${i + 1}: description is required (with 2+ lines)`)
    }
  }

  const { data: inv } = await supabase
    .from('invoices')
    .select('id, status, period_month, invoice_no')
    .eq('id', payload.id)
    .single()
  if (!inv) throw new Error('Invoice not found')
  if (inv.status !== 'draft') {
    throw new Error(`Cannot edit: invoice ${inv.invoice_no ?? inv.id} is ${inv.status}`)
  }
  await assertPeriodOpen(supabase, inv.period_month)
  const period = dayjs(payload.period).startOf('month').format('YYYY-MM-DD')
  if (period !== inv.period_month) await assertPeriodOpen(supabase, period)

  const total = payload.lines.reduce((s, l) => s + Number(l.amount), 0)
  const totalRounded = Math.round(total * 100) / 100
  // Mirror createMultiLineInvoice: header description is independent of the
  // lines, lines always persist (even a single one), and category lives per
  // line (header category_code stays NULL so issue fans Cr out by line). This
  // keeps the edit round-trip symmetric — the header no longer collapses into
  // line 1 the way the old 1-line "simple" shape did.
  const { error: updErr } = await supabase
    .from('invoices')
    .update({
      period_month: period,
      billing_mode: payload.billingMode,
      category_code: null,
      base_amount: totalRounded,
      total_amount: totalRounded,
      invoice_date: payload.invoiceDate || null,
      due_date: payload.dueDate || null,
      description: payload.headerDescription.trim() || null,
      reference_no: payload.referenceNo.trim() || null,
      billable_to_type: payload.billableType,
      company_id: payload.billableType === 'subsidiary' ? payload.companyId : null,
      billable_to_department_id: payload.billableType === 'dept_pool' ? payload.departmentId : null,
      billable_to_freetext_name:
        payload.billableType === 'director' || payload.billableType === 'freetext'
          ? payload.freetextName?.trim() ?? null
          : null,
      billable_to_freetext_address:
        payload.billableType === 'freetext' ? payload.freetextAddress?.trim() || null : null,
      billable_to_freetext_phone:
        payload.billableType === 'freetext' ? payload.freetextPhone?.trim() || null : null,
      billable_to_freetext_email:
        payload.billableType === 'freetext' ? payload.freetextEmail?.trim() || null : null,
    })
    .eq('id', payload.id)
    .eq('status', 'draft')
  if (updErr) throw new Error(`Failed to update invoice: ${updErr.message}`)

  // Replace the line set. Wholesale delete+insert keeps line_no contiguous.
  const { error: delErr } = await supabase
    .from('invoice_lines')
    .delete()
    .eq('invoice_id', payload.id)
  if (delErr) throw new Error(`Failed to replace invoice lines: ${delErr.message}`)
  const { error: insErr } = await supabase.from('invoice_lines').insert(
    payload.lines.map((l, i) => ({
      invoice_id: payload.id,
      line_no: i + 1,
      description: l.description.trim(),
      amount: Math.round(Number(l.amount) * 100) / 100,
      category_code: l.categoryCode.trim() || null,
    })),
  )
  if (insErr) throw new Error(`Failed to write invoice lines: ${insErr.message}`)

  revalidatePath('/billing')
  revalidatePath('/statements')
}

// ─── Consolidated invoice settlement (Finance) ─────────────────────────────
// Settle N issued invoices of the SAME payer into ONE Official Receipt voucher.
// Cross-payer selections are rejected (one receipt = one company). Replaces the
// older per-invoice batch settle — see invoices.settlement_voucher_id (mig 276).
export async function settleInvoicesConsolidated(payload: {
  invoiceIds: string[]
  bankAccountId: string
  paymentDate: string // YYYY-MM-DD
  /** Partial payment (user 2026-08-11): allowed only when ONE invoice is
   *  selected. Below the balance → the invoice stays issued and further
   *  receipts are accepted until it is fully collected. */
  partialAmount?: number
}): Promise<{ voucherId: string; voucherNo: string; settledCount: number; total: number; isPartial: boolean }> {
  const user = await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  if (!payload.invoiceIds?.length) throw new Error('No invoices selected')
  if (!payload.bankAccountId) throw new Error('Bank account is required')
  if (!payload.paymentDate) throw new Error('Payment date is required')

  // Bank + its GL cash account
  const { data: bank } = await supabase
    .from('bank_accounts')
    .select('id, gl_account_code')
    .eq('id', payload.bankAccountId)
    .maybeSingle()
  if (!bank) throw new Error('Bank account not found')
  const bankGlCode = bank.gl_account_code ?? '3000'

  // Fetch selected invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select(
      'id, invoice_no, company_id, total_amount, status, billable_to_type, billable_to_freetext_name, billing_mode',
    )
    .in('id', payload.invoiceIds)
  if (!invoices || invoices.length === 0) throw new Error('No invoices found')

  // Prior receipts per invoice (partial payments) — an issued invoice's
  // balance is total − Σ non-voided credit vouchers linked via invoice_id.
  const { data: priorRows } = await supabase
    .from('payment_vouchers')
    .select('invoice_id, amount')
    .in('invoice_id', invoices.map((i) => i.id))
    .eq('direction', 'credit')
    .neq('status', 'voided')
  const paidById = new Map<string, number>()
  for (const r of priorRows ?? []) {
    if (!r.invoice_id) continue
    paidById.set(r.invoice_id, (paidById.get(r.invoice_id) ?? 0) + Number(r.amount))
  }

  // Same-company + issued + non-dept_pool + balance validation (pure helper)
  const check = validateConsolidation(
    invoices.map((i) => ({
      id: i.id,
      status: i.status,
      billable_to_type: i.billable_to_type,
      company_id: i.company_id,
      billable_to_freetext_name: i.billable_to_freetext_name,
      total_amount: i.total_amount,
      paid_to_date: paidById.get(i.id) ?? 0,
    })),
    { partialAmount: payload.partialAmount },
  )
  if (!check.ok) throw new Error(check.error)
  if (check.isPartial && invoices[0].billing_mode === 'payroll_consolidated') {
    throw new Error('Consolidated payroll invoices must be settled in full')
  }
  const total = check.total
  // What this receipt collects per invoice: the partial amount, else the
  // remaining balance (which equals total_amount for untouched invoices).
  const collectFor = (invoiceId: string): number =>
    check.isPartial ? check.total : check.remainingById[invoiceId]

  // Payee label
  const companyId = invoices[0].company_id
  let payeeName = invoices[0].billable_to_freetext_name ?? '—'
  if (companyId) {
    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .maybeSingle()
    payeeName = company?.name ?? '—'
  }

  // Mint OR voucher_no — period from the chosen payment date
  const period = dayjs(payload.paymentDate).format('YYYYMM')
  const { count } = await supabase
    .from('payment_vouchers')
    .select('*', { count: 'exact', head: true })
  const seq = (count ?? 0) + 1
  const voucherNo = `HV-OR-${period}-${String(seq).padStart(4, '0')}`

  const nowIso = new Date().toISOString()
  const invoiceNos = invoices.map((i) => i.invoice_no ?? i.id.slice(0, 8)).join(', ')
  const description = check.isPartial
    ? `Partial payment — ${payeeName} (${invoiceNos}): RM ${total.toFixed(2)} of RM ${check.remainingById[invoices[0].id].toFixed(2)} balance`
    : `Settle ${invoices.length} invoice(s) — ${payeeName} (${invoiceNos})`

  // ONE Official Receipt voucher for the whole group. Full settle: invoice_id
  // NULL, link via invoices.settlement_voucher_id below. PARTIAL: link via
  // invoice_id so the balance maths (Σ receipts per invoice) can find it, and
  // the invoice deliberately keeps status 'issued'.
  const { data: pv, error: pvErr } = await supabase
    .from('payment_vouchers')
    .insert({
      voucher_no: voucherNo,
      voucher_type: 'billing_payment',
      direction: 'credit',
      source_pool: null,
      target_pool: 'venture_pool',
      status: 'paid',
      amount: total,
      payee_name: payeeName,
      payee_company_id: companyId,
      bank_account_id: payload.bankAccountId,
      invoice_id: check.isPartial ? invoices[0].id : null,
      description,
      payment_method: 'bank_transfer',
      created_by: user.id,
      approved_by: user.id,
      approved_at: nowIso,
      executed_by: user.id,
      executed_at: nowIso,
      payment_date: payload.paymentDate,
    })
    .select('id')
    .single()
  if (pvErr || !pv) throw new Error(`voucher insert failed: ${pvErr?.message ?? 'unknown'}`)

  // Primary source row (AR clearing account)
  const { error: srcErr } = await supabase
    .from('payment_voucher_sources')
    .insert({ voucher_id: pv.id, pool: 'venture_pool', amount: total, account_code: '3030' })
  if (srcErr) throw new Error(`source row insert failed: ${srcErr.message}`)

  // Bank cache — fail loud (2026-06-11 audit): a swallowed bump drifts the
  // bank cache vs GL and the next big approval bounces on "insufficient".
  const { error: bumpErr } = await supabase.rpc('bump_bank_for_paid_credit', {
    p_voucher_id: pv.id,
  })
  if (bumpErr) {
    throw new Error(`Receipt ${voucherNo} created but bank balance update failed: ${bumpErr.message}`)
  }

  // Consolidated payroll invoices route PER LINE (each line's gl_segment), not
  // by the invoice-level billing_mode. Fetch their lines so both the pool credit
  // and the GL split below can expand them per department.
  const consolidatedIds = invoices
    .filter((i) => i.billing_mode === 'payroll_consolidated')
    .map((i) => i.id)
  const linesByInvoice = new Map<string, Array<{ amount: number; segment: string | null }>>()
  if (consolidatedIds.length > 0) {
    const { data: cLines } = await supabase
      .from('invoice_lines')
      .select('invoice_id, amount, segment')
      .in('invoice_id', consolidatedIds)
    for (const ln of cLines ?? []) {
      const arr = linesByInvoice.get(ln.invoice_id as string) ?? []
      arr.push({ amount: Number(ln.amount), segment: (ln.segment as string | null) ?? null })
      linesByInvoice.set(ln.invoice_id as string, arr)
    }
  }

  // Pool credit — attribute EACH invoice to its OWN dept pool. A consolidated
  // receipt can span departments (a consolidated payroll invoice alone spans
  // HR/Finance/Director Office), so cash is split per invoice-line-segment (or
  // per invoice billing_mode for single-mode invoices) — NEVER lumped under one
  // pool. (Earlier bug: everything went to venture_pool / "Office".)
  const attributions = invoices.flatMap((i) => {
    if (i.billing_mode === 'payroll_consolidated') {
      const invNo = i.invoice_no ?? i.id.slice(0, 8)
      return lineAttributions(linesByInvoice.get(i.id) ?? [], i.billing_mode).map((g) => ({
        pool: g.pool,
        amount: g.amount,
        invoiceNo: `${invNo} (${g.segment})`,
      }))
    }
    // Partial payments: attribute what THIS receipt collects (the partial /
    // remaining balance), never the printed invoice total.
    return poolAttributions(
      [{ id: i.id, invoice_no: i.invoice_no, billing_mode: i.billing_mode, total_amount: collectFor(i.id) }],
      INVOICE_BILLING_MODE_TO_POOL,
    )
  })
  for (const a of attributions) {
    await adjustPool(
      supabase,
      a.pool,
      'in',
      a.amount,
      `PV ${voucherNo}: settle ${a.invoiceNo}`,
      user.id,
      null,
      nowIso,
    )
  }

  // GL: Dr Bank / Cr 3030, SPLIT per department segment so the GL-derived
  // Venture figure (corporate+treasury bank) doesn't absorb dept settlements.
  // Group by segment: consolidated invoices split per line-segment; others by
  // segmentForBillingMode(billing_mode). One JE per segment.
  const bySegment = new Map<string, number>()
  for (const inv of invoices) {
    if (inv.billing_mode === 'payroll_consolidated') {
      for (const g of lineAttributions(linesByInvoice.get(inv.id) ?? [], inv.billing_mode)) {
        bySegment.set(g.segment, Math.round(((bySegment.get(g.segment) ?? 0) + g.amount) * 100) / 100)
      }
    } else {
      const seg = segmentForBillingMode(inv.billing_mode)
      bySegment.set(seg, Math.round(((bySegment.get(seg) ?? 0) + collectFor(inv.id)) * 100) / 100)
    }
  }
  for (const [seg, segAmount] of bySegment) {
    if (segAmount <= 0) continue
    try {
      await postJournalEntry(supabase, {
        transactionDate: payload.paymentDate,
        description: `PV ${voucherNo}: ${description} [${seg}]`,
        referenceType: 'payment_voucher',
        referenceId: pv.id,
        segment: seg,
        lines: [
          { accountCode: bankGlCode, debit: segAmount, description: `Bank deposit — ${voucherNo}` },
          { accountCode: '3030', credit: segAmount, description: `Payment received — ${payeeName}` },
        ],
        createdBy: user.id,
      })
    } catch (jeErr) {
      // Fail loud (2026-06-11 audit): a swallowed JE leaves the settlement
      // cash missing from the GL — bank-segment recon and the statements
      // silently drift until someone hunts it down.
      const msg = jeErr instanceof Error ? jeErr.message : 'unknown'
      throw new Error(`Receipt ${voucherNo} created but settlement GL posting failed (segment ${seg}): ${msg}`)
    }
  }

  // Mark every invoice paid + link to this voucher (race-guarded on issued).
  // PARTIAL receipts skip this on purpose — the invoice stays 'issued' with a
  // reduced balance until receipts cover the full total.
  // NOTE: the credit_dept_pool_on_invoice_paid trigger does NOT fire here — it
  // keys off payment_vouchers.reference_type='invoice' + reference_id, which a
  // consolidated voucher (invoice_id NULL, many invoices) deliberately leaves
  // unset. Dept-pool attribution is handled by the per-invoice adjustPool loop
  // above instead.
  if (!check.isPartial) {
    const { error: updErr } = await supabase
      .from('invoices')
      .update({ status: 'paid', settlement_voucher_id: pv.id } as never)
      .in('id', invoices.map((i) => i.id))
      .eq('status', 'issued')
    if (updErr) throw new Error(`invoice status update failed: ${updErr.message}`)
  }

  revalidatePath('/billing')
  revalidatePath('/statements')
  revalidatePath('/payments')
  revalidatePath('/dashboard')

  return { voucherId: pv.id, voucherNo, settledCount: invoices.length, total, isPartial: check.isPartial }
}

// ─── Approve / Issue Invoice (Finance — draft → issued) ────────────────────

// ─── Consolidated payroll invoice (2026-07-03) ───────────────────────────────
// One draft invoice per subsidiary combining HR + Finance + Director Office.
// Each line carries its own gl_segment (invoice_lines.segment) so issue /
// settlement / P&L route PER LINE, not by the invoice-level billing_mode.
// The HV own-share row (company_id IS NULL) is never billed.

interface AllocationRpcRow {
  department_name: string
  company_id: string | null
  company_name: string
  company_short_code: string
  salary_amount: number | string
  allowance_amount: number | string
  epf_amount: number | string
  socso_amount: number | string
  eis_amount: number | string
}

const PAYROLL_DEPT_TO_SEGMENT: Record<string, PayrollSegment> = {
  HR: 'hr',
  Finance: 'finance',
  'Director Office': 'director_office',
}
const PAYROLL_DEPT_ORDER: PayrollSegment[] = ['hr', 'finance', 'director_office']

export interface ConsolidatedCompanyPreview {
  companyId: string
  shortCode: string
  name: string
  groups: DeptComponentGroup[]
  total: number
}

function groupPayrollAllocation(rows: AllocationRpcRow[]): ConsolidatedCompanyPreview[] {
  const byCompany = new Map<string, ConsolidatedCompanyPreview>()
  for (const r of rows) {
    if (!r.company_id) continue // HV own-share — never billed
    const seg = PAYROLL_DEPT_TO_SEGMENT[r.department_name]
    if (!seg) continue // only the three payroll depts
    let entry = byCompany.get(r.company_id)
    if (!entry) {
      entry = { companyId: r.company_id, shortCode: r.company_short_code, name: r.company_name, groups: [], total: 0 }
      byCompany.set(r.company_id, entry)
    }
    entry.groups.push({
      deptLabel: PAYROLL_SEGMENT_LABEL[seg],
      segment: seg,
      components: {
        salary: Number(r.salary_amount ?? 0),
        allowance: Number(r.allowance_amount ?? 0),
        epf: Number(r.epf_amount ?? 0),
        socso: Number(r.socso_amount ?? 0),
        eis: Number(r.eis_amount ?? 0),
      },
    })
  }
  const out = [...byCompany.values()]
  for (const c of out) {
    c.groups.sort(
      (a, b) => PAYROLL_DEPT_ORDER.indexOf(a.segment) - PAYROLL_DEPT_ORDER.indexOf(b.segment),
    )
    const grand = c.groups.reduce((s, g) => {
      const k = g.components
      return s + k.salary + k.allowance + k.epf + k.socso + k.eis
    }, 0)
    c.total = Math.round(grand * 100) / 100
  }
  out.sort((a, b) => a.shortCode.localeCompare(b.shortCode))
  return out
}

/** Preview for the review modal: what one consolidated invoice per subsidiary
 *  will contain for the given period. Reads live HR allocation; no writes. */
export async function fetchConsolidatedPayrollPreview(
  periodMonth: string,
): Promise<ConsolidatedCompanyPreview[]> {
  await requireRole(['finance', 'principal'])
  const supabase = await createClient()
  const period = dayjs(periodMonth).startOf('month').format('YYYY-MM-DD')
  const { data, error } = await supabase.rpc('get_staff_billing_allocation', {
    p_period_month: period,
  })
  if (error) throw new Error(`Failed to load payroll allocation: ${error.message}`)
  return groupPayrollAllocation((data ?? []) as unknown as AllocationRpcRow[])
}

/** Generate one DRAFT consolidated invoice per subsidiary for the period.
 *  Amounts come server-side from get_staff_billing_allocation (authoritative);
 *  `categoryCode` is the user-chosen revenue category applied to every line
 *  (default 5020 in the UI). Idempotent — clears existing drafts first. */
export async function generateConsolidatedPayrollInvoices(
  periodMonth: string,
  categoryCode: string | null,
): Promise<{ generated: number; companies: string[] }> {
  const user = await requireRole(['finance', 'principal'])
  const supabase = await createClient()
  const period = dayjs(periodMonth).startOf('month').format('YYYY-MM-DD')
  await assertPeriodOpen(supabase, period)

  const { data, error } = await supabase.rpc('get_staff_billing_allocation', {
    p_period_month: period,
  })
  if (error) throw new Error(`Failed to load payroll allocation: ${error.message}`)
  const companies = groupPayrollAllocation((data ?? []) as unknown as AllocationRpcRow[])

  // Idempotent: clear existing DRAFT consolidated invoices (+ their lines) for
  // this period so re-running regenerates cleanly. Issued/paid are untouched.
  const { data: existing } = await supabase
    .from('invoices')
    .select('id')
    .eq('period_month', period)
    .eq('billing_mode', 'payroll_consolidated')
    .eq('status', 'draft')
  const existingIds = (existing ?? []).map((r) => r.id as string)
  if (existingIds.length > 0) {
    await supabase.from('invoice_lines').delete().in('invoice_id', existingIds)
    await supabase.from('invoices').delete().in('id', existingIds).eq('status', 'draft')
  }

  const periodShort = periodShortLabel(period)
  const invoiceDate = dayjs(period).endOf('month').format('YYYY-MM-DD')
  const category = categoryCode && categoryCode.trim() ? categoryCode.trim() : null

  const generatedCompanies: string[] = []
  for (const c of companies) {
    const lines = buildConsolidatedInvoiceLines(c.groups, periodShort)
    if (lines.length === 0) continue
    const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100

    const { data: invoiceNo, error: mintErr } = await supabase.rpc('mint_invoice_no', {
      p_period: period,
    })
    if (mintErr || !invoiceNo) {
      throw new Error(`Failed to mint invoice number: ${mintErr?.message ?? 'unknown'}`)
    }

    const { data: created, error: invErr } = await supabase
      .from('invoices')
      .insert({
        invoice_no: invoiceNo as string,
        period_month: period,
        billing_mode: 'payroll_consolidated',
        // Header category NULL — issue fans out per line (each line carries the
        // chosen category + its own segment).
        category_code: null,
        base_amount: total,
        total_amount: total,
        status: 'draft',
        invoice_date: invoiceDate,
        due_date: null,
        description: `Payroll cost share — ${periodShort}`,
        created_by: user.id,
        billable_to_type: 'subsidiary',
        company_id: c.companyId,
      })
      .select('id')
      .single()
    if (invErr || !created) {
      throw new Error(
        `Failed to create consolidated invoice for ${c.shortCode}: ${invErr?.message ?? 'unknown'}`,
      )
    }

    const { error: linesErr } = await supabase.from('invoice_lines').insert(
      lines.map((l, i) => ({
        invoice_id: created.id,
        line_no: i + 1,
        description: l.description,
        amount: l.amount,
        category_code: category,
        segment: l.segment,
      })),
    )
    if (linesErr) {
      await supabase.from('invoices').delete().eq('id', created.id).eq('status', 'draft')
      throw new Error(
        `Failed to insert lines for ${c.shortCode} (rolled back): ${linesErr.message}`,
      )
    }
    generatedCompanies.push(c.shortCode)
  }

  revalidatePath('/billing')
  revalidatePath('/statements')
  return { generated: generatedCompanies.length, companies: generatedCompanies }
}

// ─── Own-share inter-billing to Venture (Office) (2026-07) ───────────────────
// The HV own-share of each staff-attribution dept's payroll (the portion NOT
// billed to any subsidiary) is inter-billed to the internal "Venture Office"
// pseudo-dept: each dept RECOVERS its own-share, Venture (Office) BEARS it.
// ONE consolidated invoice, billable_to_type='dept_pool' → Venture Office,
// billing_mode='payroll_consolidated', per-dept segment lines. Direction is the
// reverse of the subsidiary consolidated invoice (Venture Office pays, depts
// receive). Marketing is a direct cost centre and is excluded (its segment is
// not in OWN_SHARE_SEGMENTS). Source: get_staff_own_share_allocation RPC, which
// (unlike get_staff_billing_allocation) emits every dept's residual, including
// depts that are 100% HV-absorbed.

interface OwnShareRpcRow {
  department_name: string
  staff_count: number
  amount: number | string
  salary_amount: number | string
  allowance_amount: number | string
  epf_amount: number | string
  socso_amount: number | string
  eis_amount: number | string
}

const OWN_SHARE_ORDER: PayrollSegment[] = ['hr', 'finance', 'director_office', 'director']

function groupOwnShareAllocation(rows: OwnShareRpcRow[]): DeptComponentGroup[] {
  const groups: DeptComponentGroup[] = []
  for (const r of rows) {
    const seg = deptNameToSegment(r.department_name)
    // Only the staff-attribution depts (hr/finance/director_office/director) —
    // excludes Marketing (a direct cost centre) and anything unmapped.
    if (!seg || !OWN_SHARE_SEGMENTS.includes(seg as PayrollSegment)) continue
    groups.push({
      deptLabel: PAYROLL_SEGMENT_LABEL[seg as PayrollSegment],
      segment: seg as PayrollSegment,
      components: {
        salary: Number(r.salary_amount ?? 0),
        allowance: Number(r.allowance_amount ?? 0),
        epf: Number(r.epf_amount ?? 0),
        socso: Number(r.socso_amount ?? 0),
        eis: Number(r.eis_amount ?? 0),
      },
    })
  }
  groups.sort((a, b) => OWN_SHARE_ORDER.indexOf(a.segment) - OWN_SHARE_ORDER.indexOf(b.segment))
  return groups
}

export interface OwnShareInvoicePreview {
  groups: DeptComponentGroup[]
  total: number
}

/** Preview for the own-share review modal: the single Venture (Office) invoice's
 *  per-dept groups + grand total. Reads live own-share allocation; no writes. */
export async function fetchOwnShareInvoicePreview(periodMonth: string): Promise<OwnShareInvoicePreview> {
  await requireRole(['finance', 'principal'])
  const supabase = await createClient()
  const period = dayjs(periodMonth).startOf('month').format('YYYY-MM-DD')
  const { data, error } = await supabase.rpc('get_staff_own_share_allocation' as never, { p_period_month: period } as never)
  if (error) throw new Error(`Failed to load own-share allocation: ${error.message}`)
  const groups = groupOwnShareAllocation((data ?? []) as unknown as OwnShareRpcRow[])
  const total = Math.round(
    groups.reduce((s, g) => {
      const k = g.components
      return s + k.salary + k.allowance + k.epf + k.socso + k.eis
    }, 0) * 100,
  ) / 100
  return { groups, total }
}

/** Generate ONE draft own-share invoice for the period, billed to Venture
 *  (Office). Amounts come server-side from get_staff_own_share_allocation;
 *  `categoryCode` (default 5020) applies to every line. Idempotent — clears the
 *  period's existing Venture-Office own-share draft first. */
export async function generateOwnShareInvoice(
  periodMonth: string,
  categoryCode: string | null,
): Promise<{ generated: number; total: number }> {
  const user = await requireRole(['finance', 'principal'])
  const supabase = await createClient()
  const period = dayjs(periodMonth).startOf('month').format('YYYY-MM-DD')
  await assertPeriodOpen(supabase, period)

  const { data, error } = await supabase.rpc('get_staff_own_share_allocation' as never, { p_period_month: period } as never)
  if (error) throw new Error(`Failed to load own-share allocation: ${error.message}`)
  const groups = groupOwnShareAllocation((data ?? []) as unknown as OwnShareRpcRow[])

  const { data: ventureOffice, error: voErr } = await supabase
    .from('departments')
    .select('id')
    .eq('is_internal', true)
    .eq('name', 'Venture Office')
    .maybeSingle()
  if (voErr || !ventureOffice?.id) {
    throw new Error(`'Venture Office' pseudo-department not found${voErr ? `: ${voErr.message}` : ''}`)
  }
  const ventureOfficeId = ventureOffice.id as string

  // Idempotent: clear the period's existing DRAFT own-share invoice (dept_pool →
  // Venture Office). Filter tightly so the SUBSIDIARY consolidated drafts (same
  // billing_mode + period, but billable_to_type='subsidiary') are NOT clobbered.
  const { data: existing } = await supabase
    .from('invoices')
    .select('id')
    .eq('period_month', period)
    .eq('billing_mode', 'payroll_consolidated')
    .eq('billable_to_type', 'dept_pool')
    .eq('billable_to_department_id', ventureOfficeId)
    .eq('status', 'draft')
  const existingIds = (existing ?? []).map((r) => r.id as string)
  if (existingIds.length > 0) {
    await supabase.from('invoice_lines').delete().in('invoice_id', existingIds)
    await supabase.from('invoices').delete().in('id', existingIds).eq('status', 'draft')
  }

  const periodShort = periodShortLabel(period)
  const lines = buildConsolidatedInvoiceLines(groups, periodShort)
  if (lines.length === 0) {
    revalidatePath('/billing')
    revalidatePath('/statements')
    return { generated: 0, total: 0 }
  }
  const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100
  const invoiceDate = dayjs(period).endOf('month').format('YYYY-MM-DD')
  const category = categoryCode && categoryCode.trim() ? categoryCode.trim() : null

  const { data: invoiceNo, error: mintErr } = await supabase.rpc('mint_invoice_no', { p_period: period })
  if (mintErr || !invoiceNo) {
    throw new Error(`Failed to mint invoice number: ${mintErr?.message ?? 'unknown'}`)
  }

  const { data: created, error: invErr } = await supabase
    .from('invoices')
    .insert({
      invoice_no: invoiceNo as string,
      period_month: period,
      billing_mode: 'payroll_consolidated',
      category_code: null,
      base_amount: total,
      total_amount: total,
      status: 'draft',
      invoice_date: invoiceDate,
      due_date: null,
      description: `HV own-share payroll — ${periodShort}`,
      created_by: user.id,
      billable_to_type: 'dept_pool',
      billable_to_department_id: ventureOfficeId,
      company_id: null,
    })
    .select('id')
    .single()
  if (invErr || !created) {
    throw new Error(`Failed to create own-share invoice: ${invErr?.message ?? 'unknown'}`)
  }

  const { error: linesErr } = await supabase.from('invoice_lines').insert(
    lines.map((l, i) => ({
      invoice_id: created.id,
      line_no: i + 1,
      description: l.description,
      amount: l.amount,
      category_code: category,
      segment: l.segment,
    })),
  )
  if (linesErr) {
    await supabase.from('invoices').delete().eq('id', created.id).eq('status', 'draft')
    throw new Error(`Failed to insert own-share lines (rolled back): ${linesErr.message}`)
  }

  revalidatePath('/billing')
  revalidatePath('/statements')
  return { generated: 1, total }
}

export async function approveInvoice(formData: FormData) {
  const user = await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  const id = (formData.get('id') as string) ?? ''
  if (!id) throw new Error('Invoice id is required')

  const { data: inv } = await supabase
    .from('invoices')
    .select('id, invoice_no, invoice_date, period_month, status, total_amount, billing_mode, company_id, category_code, billable_to_type, billable_to_department_id')
    .eq('id', id)
    .single()
  if (!inv) throw new Error('Invoice not found')
  if (inv.status !== 'draft') throw new Error(`Invoice is already ${inv.status}`)

  await assertPeriodOpen(supabase, inv.period_month)

  const { error } = await supabase
    .from('invoices')
    .update({ status: 'issued' })
    .eq('id', id)
    .eq('status', 'draft')

  if (error) throw new Error(`Failed to issue invoice: ${error.message}`)

  // Mig 200/P1-6a: AR accrual at invoice issue.
  //   dr 1040 AR — Subs   / cr <category.gl_account_code or fallback> Revenue
  // Paired with the invoice-paid flow which settles AR via
  //   dr Bank / cr 1040 AR (approve_single_voucher billing_payment branch)
  const amount = Number(inv.total_amount ?? 0)
  if (amount > 0) {
    // Mig 275: multi-line invoices have rows in invoice_lines, each with its
    // own category_code. Fan out the Cr side per line so P&L attribution
    // stays correct when items span different accounts. Falls back to the
    // legacy single-line path when no lines exist.
    const { data: invoiceLines } = await supabase
      .from('invoice_lines')
      .select('line_no, description, amount, category_code, segment')
      .eq('invoice_id', inv.id)
      .order('line_no')
    // transaction_date = the INVOICE date (user 2026-06-11): revenue belongs to
    // the month printed on the invoice, not the day Finance clicked Issue.
    // invoiceJeDate falls back to period month-end, then today.
    const jeDate = invoiceJeDate(
      (inv as { invoice_date?: string | null }).invoice_date,
      inv.period_month,
      dayjs().format('YYYY-MM-DD'),
    )
    // Consolidated payroll invoice: each line carries its own gl_segment, so
    // post ONE AR-accrual JE PER segment (Dr 3030 dept-subtotal / Cr revenue per
    // line, segment FORCED) — each department's revenue lands in its own P&L,
    // mirroring how the payroll payment PV splits into per-dept JEs.
    const isConsolidated =
      inv.billing_mode === 'payroll_consolidated' ||
      (!!invoiceLines && invoiceLines.some((l) => (l as { segment?: string | null }).segment))
    try {
      if (isConsolidated && invoiceLines && invoiceLines.length > 0) {
        const order: string[] = []
        const bySeg = new Map<string, typeof invoiceLines>()
        for (const ln of invoiceLines) {
          const seg = (ln as { segment?: string | null }).segment ?? segmentForBillingMode(inv.billing_mode)
          if (!bySeg.has(seg)) {
            bySeg.set(seg, [])
            order.push(seg)
          }
          bySeg.get(seg)!.push(ln)
        }
        for (const seg of order) {
          const segLines = bySeg.get(seg)!
          const subtotal = Math.round(segLines.reduce((s, l) => s + Number(l.amount), 0) * 100) / 100
          const jeLines: Array<{ accountCode: string; debit?: number; credit?: number; description: string }> = [
            { accountCode: '3030', debit: subtotal, description: `AR — invoice ${inv.invoice_no ?? ''} (${seg})`.trim() },
          ]
          for (const ln of segLines) {
            const code = await resolveRevenueGlCode(supabase, ln.category_code, inv.billing_mode)
            jeLines.push({ accountCode: code, credit: Number(ln.amount), description: ln.description ?? 'Line item' })
          }
          await postJournalEntry(supabase, {
            transactionDate: jeDate,
            segment: seg,
            description: `Invoice ${inv.invoice_no ?? inv.id} issued — ${seg}`,
            referenceType: 'invoice',
            referenceId: inv.id,
            createdBy: user.id,
            lines: jeLines,
          })
        }
      } else {
        // Legacy / single-mode invoice: one JE. Per-line Cr when lines exist
        // (mig 275), else a single Cr for the full amount. Segment is derived
        // downstream from the invoice's billing_mode.
        const jeLines: Array<{ accountCode: string; debit?: number; credit?: number; description: string }> = [
          { accountCode: '3030', debit: amount, description: `AR — invoice ${inv.invoice_no ?? ''}`.trim() },
        ]
        if (invoiceLines && invoiceLines.length > 0) {
          for (const ln of invoiceLines) {
            const code = await resolveRevenueGlCode(supabase, ln.category_code, inv.billing_mode)
            jeLines.push({ accountCode: code, credit: Number(ln.amount), description: ln.description ?? 'Line item' })
          }
        } else {
          const revenueCode = await resolveRevenueGlCode(supabase, inv.category_code, inv.billing_mode)
          jeLines.push({ accountCode: revenueCode, credit: amount, description: 'Service billing revenue recognised' })
        }
        await postJournalEntry(supabase, {
          transactionDate: jeDate,
          description: `Invoice ${inv.invoice_no ?? inv.id} issued`,
          referenceType: 'invoice',
          referenceId: inv.id,
          createdBy: user.id,
          lines: jeLines,
        })
      }
    } catch (jeErr) {
      const msg = jeErr instanceof Error ? jeErr.message : 'unknown'
      throw new Error(`Invoice issued but AR accrual JE failed: ${msg}`)
    }

    // Inter-billing: post expense JE at invoice issue so that the paying
    // dept's P&L expense is recognised in the same period as the receiver's
    // revenue (symmetric PNL). GL: Dr 9051-9055 / Cr 3030 — net with JE1
    // above = Dr expense / Cr revenue, AR nets to zero immediately.
    // Cash-flow effect is tracked at settlement via the billing_payment PV
    // mirror row (payments/actions.ts), keeping PNL and CF on independent dates.
    const billableType = (inv as { billable_to_type?: string | null }).billable_to_type
    const billableDeptId = (inv as { billable_to_department_id?: string | null }).billable_to_department_id
    if (billableType === 'dept_pool' && billableDeptId) {
      const { data: payingDept } = await supabase
        .from('departments')
        .select('name')
        .eq('id', billableDeptId)
        .maybeSingle()
      // Fail loud (2026-06-11): a silent skip here posts the receiver's
      // revenue but never the payer's expense — asymmetric P&L with no trace.
      if (!payingDept?.name) {
        throw new Error(
          `Invoice issued but inter-billing expense JE skipped: paying department ${billableDeptId} not found`,
        )
      }
      const { data: expenseAcct } = await supabase
        .from('chart_of_accounts')
        .select('code')
        .eq('type', 'expense')
        .ilike('name', `Inter-billing % ${payingDept.name}`)
        .maybeSingle()
      if (!expenseAcct?.code) {
        throw new Error(
          `Invoice issued but inter-billing expense JE skipped: no active expense account named "Inter-billing — ${payingDept.name}" in the COA (9051–9055 range)`,
        )
      }
      const natureSplits = await interBillingNatureSplits(supabase, inv.id, amount, expenseAcct.code)
      try {
        await postJournalEntry(supabase, {
          transactionDate: invoiceJeDate(
            (inv as { invoice_date?: string | null }).invoice_date,
            inv.period_month,
            dayjs().format('YYYY-MM-DD'),
          ),
          // The EXPENSE belongs to the PAYING dept's P&L, not the
          // invoice's billing_mode segment (user 2026-06-11). The internal
          // 'Venture Office' pseudo-dept isn't in deptNameToSegment → its
          // overhead belongs to 'corporate' (the cash-page Venture (Office)
          // slice), so fall back to corporate (own-share inter-billing 2026-07).
          segment: deptNameToSegment(payingDept.name) ?? 'corporate',
          description: `Invoice ${inv.invoice_no ?? inv.id} issued — inter-billing expense (${payingDept.name})`,
          referenceType: 'invoice',
          referenceId: inv.id,
          createdBy: user.id,
          lines: [
            ...natureSplits.map((s) => ({ accountCode: s.accountCode, debit: s.amount, description: `Inter-billing (${payingDept.name}) — by nature` })),
            { accountCode: '3030', credit: amount, description: `AR cleared — inter-billing ${inv.invoice_no ?? ''}`.trim() },
          ],
        })
      } catch (jeErr) {
        const msg = jeErr instanceof Error ? jeErr.message : 'unknown'
        throw new Error(`Invoice issued but inter-billing expense JE failed: ${msg}`)
      }
    }
  }

  revalidatePath('/billing')
  revalidatePath('/statements')
}

export async function approveInvoicesForPeriod(formData: FormData) {
  const user = await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  const rawPeriod = (formData.get('period_month') as string) ?? ''
  if (!rawPeriod) throw new Error('Period month is required')
  const period = dayjs(rawPeriod).startOf('month').format('YYYY-MM-DD')

  await assertPeriodOpen(supabase, period)

  // Pull draft rows up-front so we can post AR accrual JEs after the bulk update.
  // Consolidated payroll invoices post ONE AR JE PER department segment (handled
  // in the loop below); everything else posts a single JE.
  const { data: draftInvoices } = await supabase
    .from('invoices')
    .select('id, invoice_no, invoice_date, total_amount, billing_mode, category_code, billable_to_type, billable_to_department_id')
    .eq('period_month', period)
    .eq('status', 'draft')

  const { error, count } = await supabase
    .from('invoices')
    .update({ status: 'issued' }, { count: 'exact' })
    .eq('period_month', period)
    .eq('status', 'draft')

  if (error) throw new Error(`Failed to bulk issue invoices: ${error.message}`)

  // Mig 200/P1-6a: post AR accrual per newly-issued invoice.
  // transaction_date = the INVOICE date (user 2026-06-11): a May-31 invoice
  // bulk-issued on June 4 must land in May's P&L, not June's.
  const todayStr = dayjs().format('YYYY-MM-DD')
  for (const row of draftInvoices ?? []) {
    const amount = Number(row.total_amount ?? 0)
    if (amount <= 0) continue
    const txnDate = invoiceJeDate(
      (row as { invoice_date?: string | null }).invoice_date,
      period,
      todayStr,
    )

    // Consolidated payroll invoice: one AR JE PER department segment (Dr 3030
    // dept-subtotal / Cr revenue per line, segment forced). Subsidiary ones stop
    // here; the own-share variant (billable_to_type='dept_pool' → Venture Office)
    // must ALSO fall through to the inter-billing expense JE below, so we do NOT
    // `continue` — we skip only the single-JE revenue block via the else.
    if (row.billing_mode === 'payroll_consolidated') {
      const { data: rowLines } = await supabase
        .from('invoice_lines')
        .select('description, amount, category_code, segment')
        .eq('invoice_id', row.id)
        .order('line_no')
      const order: string[] = []
      const bySeg = new Map<string, NonNullable<typeof rowLines>>()
      for (const ln of rowLines ?? []) {
        const seg = (ln.segment as string | null) ?? segmentForBillingMode(row.billing_mode)
        if (!bySeg.has(seg)) {
          bySeg.set(seg, [])
          order.push(seg)
        }
        bySeg.get(seg)!.push(ln)
      }
      for (const seg of order) {
        const segLines = bySeg.get(seg)!
        const subtotal = Math.round(segLines.reduce((s, l) => s + Number(l.amount), 0) * 100) / 100
        const jeLines: Array<{ accountCode: string; debit?: number; credit?: number; description: string }> = [
          { accountCode: '3030', debit: subtotal, description: `AR — invoice ${row.invoice_no ?? ''} (${seg})`.trim() },
        ]
        for (const ln of segLines) {
          const code = await resolveRevenueGlCode(supabase, ln.category_code, row.billing_mode)
          jeLines.push({ accountCode: code, credit: Number(ln.amount), description: ln.description ?? 'Line item' })
        }
        try {
          await postJournalEntry(supabase, {
            transactionDate: txnDate,
            segment: seg,
            description: `Invoice ${row.invoice_no ?? row.id} issued (bulk) — ${seg}`,
            referenceType: 'invoice',
            referenceId: row.id,
            createdBy: user.id,
            lines: jeLines,
          })
        } catch (jeErr) {
          const msg = jeErr instanceof Error ? jeErr.message : 'unknown'
          throw new Error(`Bulk issue: per-segment JE failed for invoice ${row.invoice_no ?? row.id} (${seg}): ${msg}`)
        }
      }
    } else {
      // Mig 275 parity with the SINGLE issue path: multi-line invoices credit
      // per line by each line's category_code. The bulk path predated that and
      // credited everything to the mode default — the allocator invoices'
      // hand-set 9095/7012 lines all landed in 5000 (user caught it
      // 2026-08-01). Legacy single-credit stays for invoices with no lines.
      const { data: rowLines } = await supabase
        .from('invoice_lines')
        .select('line_no, description, amount, category_code')
        .eq('invoice_id', row.id)
        .order('line_no')
      const jeLines: Array<{ accountCode: string; debit?: number; credit?: number; description: string }> = [
        { accountCode: '3030', debit: amount, description: `AR — invoice ${row.invoice_no ?? ''}`.trim() },
      ]
      if (rowLines && rowLines.length > 0) {
        for (const ln of rowLines) {
          const code = await resolveRevenueGlCode(supabase, ln.category_code, row.billing_mode)
          jeLines.push({ accountCode: code, credit: Number(ln.amount), description: ln.description ?? 'Line item' })
        }
      } else {
        const revenueCode = await resolveRevenueGlCode(supabase, row.category_code, row.billing_mode)
        jeLines.push({ accountCode: revenueCode, credit: amount, description: 'Service billing revenue recognised' })
      }
      try {
        await postJournalEntry(supabase, {
          transactionDate: txnDate,
          description: `Invoice ${row.invoice_no ?? row.id} issued (bulk)`,
          referenceType: 'invoice',
          referenceId: row.id,
          createdBy: user.id,
          lines: jeLines,
        })
      } catch (jeErr) {
        const msg = jeErr instanceof Error ? jeErr.message : 'unknown'
        throw new Error(`Bulk issue: JE post failed for invoice ${row.invoice_no ?? row.id}: ${msg}`)
      }
    }

    // Inter-billing: expense JE at invoice issue — see approveInvoice for details.
    const rowBillableType = (row as { billable_to_type?: string | null }).billable_to_type
    const rowBillableDeptId = (row as { billable_to_department_id?: string | null }).billable_to_department_id
    if (rowBillableType === 'dept_pool' && rowBillableDeptId) {
      const { data: payingDept } = await supabase
        .from('departments')
        .select('name')
        .eq('id', rowBillableDeptId)
        .maybeSingle()
      // Fail loud (2026-06-11): a silent skip posts the receiver's revenue
      // but never the payer's expense — asymmetric P&L with no trace.
      if (!payingDept?.name) {
        throw new Error(
          `Bulk issue: inter-billing expense JE skipped for invoice ${row.invoice_no ?? row.id}: paying department ${rowBillableDeptId} not found`,
        )
      }
      const { data: expenseAcct } = await supabase
        .from('chart_of_accounts')
        .select('code')
        .eq('type', 'expense')
        .ilike('name', `Inter-billing % ${payingDept.name}`)
        .maybeSingle()
      if (!expenseAcct?.code) {
        throw new Error(
          `Bulk issue: inter-billing expense JE skipped for invoice ${row.invoice_no ?? row.id}: no active expense account named "Inter-billing — ${payingDept.name}" in the COA (9051–9055 range)`,
        )
      }
      const natureSplits = await interBillingNatureSplits(supabase, row.id, amount, expenseAcct.code)
      try {
        await postJournalEntry(supabase, {
          transactionDate: txnDate,
          // The EXPENSE belongs to the PAYING dept's P&L (user 2026-06-11);
          // 'Venture Office' → corporate (own-share inter-billing 2026-07).
          segment: deptNameToSegment(payingDept.name) ?? 'corporate',
          description: `Invoice ${row.invoice_no ?? row.id} issued (bulk) — inter-billing expense (${payingDept.name})`,
          referenceType: 'invoice',
          referenceId: row.id,
          createdBy: user.id,
          lines: [
            ...natureSplits.map((s) => ({ accountCode: s.accountCode, debit: s.amount, description: `Inter-billing (${payingDept.name}) — by nature` })),
            { accountCode: '3030', credit: amount, description: `AR cleared — inter-billing ${row.invoice_no ?? ''}`.trim() },
          ],
        })
      } catch (jeErr) {
        const msg = jeErr instanceof Error ? jeErr.message : 'unknown'
        throw new Error(`Bulk issue: inter-billing expense JE failed for invoice ${row.invoice_no ?? row.id}: ${msg}`)
      }
    }
  }

  revalidatePath('/billing')
  revalidatePath('/statements')
  return { issued: count ?? 0, period }
}

export async function approveCreditNote(formData: FormData) {
  const user = await requireRole(['principal'])
  const supabase = await createClient()

  const id = formData.get('id') as string
  if (!id) throw new Error('Credit note id is required')

  await assertPeriodOpen(supabase, new Date())

  const { error } = await supabase
    .from('credit_notes')
    .update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'draft')

  if (error) throw new Error(`Failed to approve credit note: ${error.message}`)

  revalidatePath('/billing')
}
