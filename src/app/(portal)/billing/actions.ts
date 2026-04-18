'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { assertPeriodOpen } from '@/lib/period-lock'

export interface GenerateInvoicesResult {
  generated: number
  skipped: number
  errors: string[]
  period: string
  mode_counts: Record<string, number>
}

export interface FixedSplitResult {
  generated: number
  rent_invoices: number
  utility_invoices: number
  hv_rent_share: number
  hv_utility_share: number
  total_headcount: number
  hv_headcount: number
  period: string
}

export interface HeadcountEntry {
  company_id: string | null
  headcount: number
}

// ─── Manual OPEX invoice creation (Finance, Task 4) ─────────────────────────
//
// Unlike generate_monthly_invoices (which auto-splits via billing rules),
// this action lets Finance type a specific amount for a specific subsidiary
// under one of the OPEX billing modes. Created invoice starts in 'draft';
// Finance issues it separately via the existing billing flow, then the
// knock-off trigger (migration 133 + 155) credits the correct pool.
//
// Used by the Director Office OPEX + Director OPEX sections on
// Statement > Invoice. Could be extended to HR/Finance OPEX rows later
// if Finance wants fully-manual control over those too (user's Task 4
// eventual goal; still manual-only for the director modes for now).

const MANUAL_OPEX_BILLING_MODES = [
  'hr_pool_split',
  'finance_attribution',
  'director_office_attribution',
  'director_attribution',
] as const

export type ManualOpexBillingMode = (typeof MANUAL_OPEX_BILLING_MODES)[number]

export async function createOpexInvoice(formData: FormData): Promise<void> {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const companyId = (formData.get('company_id') as string | null) ?? ''
  const rawPeriod = (formData.get('period_month') as string | null) ?? ''
  const rawBillingMode = (formData.get('billing_mode') as string | null) ?? ''
  const rawAmount = (formData.get('amount') as string | null) ?? ''

  if (!companyId) throw new Error('Subsidiary is required')
  if (!rawPeriod) throw new Error('Period is required')
  if (!MANUAL_OPEX_BILLING_MODES.includes(rawBillingMode as ManualOpexBillingMode)) {
    throw new Error(`Unsupported billing mode for manual OPEX invoice: ${rawBillingMode}`)
  }
  const billingMode = rawBillingMode as ManualOpexBillingMode

  const amount = Number(rawAmount)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number')
  }

  const period = dayjs(rawPeriod).startOf('month').format('YYYY-MM-DD')
  await assertPeriodOpen(supabase, period)

  // Refuse if an invoice already exists for this (company, period, billing_mode)
  const { data: existing } = await supabase
    .from('invoices')
    .select('id, invoice_no')
    .eq('company_id', companyId)
    .eq('period_month', period)
    .eq('billing_mode', billingMode)
    .limit(1)

  if (existing && existing.length > 0) {
    throw new Error(
      `Invoice already exists for this subsidiary + period + billing mode (${existing[0].invoice_no}). Edit that one instead.`,
    )
  }

  // Sequence: count existing invoices for this period + 1
  const { count } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('period_month', period)

  const yyyymm = dayjs(period).format('YYYYMM')
  const seq = (count ?? 0) + 1
  const invoiceNo = `HV-INV-${yyyymm}-${String(seq).padStart(4, '0')}`

  const { error } = await supabase.from('invoices').insert({
    invoice_no: invoiceNo,
    company_id: companyId,
    period_month: period,
    billing_mode: billingMode,
    base_amount: amount,
    total_amount: amount,
    status: 'draft',
    version: 1,
    created_by: user.id,
  })

  if (error) throw new Error(`Failed to create invoice: ${error.message}`)

  revalidatePath('/statements/invoices')
  revalidatePath('/billing')
}

// ─── Generate monthly invoices for a period (Finance) ────────────────────────

export async function generateMonthlyInvoices(
  formData: FormData
): Promise<GenerateInvoicesResult> {
  await requireRole(['finance'])
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

// ─── Generate fixed split invoices (Rent + Utility) ─────────────────────────

export async function generateFixedSplitInvoices(
  formData: FormData
): Promise<FixedSplitResult> {
  await requireRole(['finance'])
  const supabase = await createClient()

  const rawPeriod = (formData.get('period_month') as string) ?? ''
  const rentTotal = parseFloat((formData.get('rent_total') as string) ?? '0')
  const utilityTotal = parseFloat(
    (formData.get('utility_total') as string) ?? '0'
  )
  const headcountsRaw = (formData.get('headcounts') as string) ?? '[]'

  if (!rawPeriod) throw new Error('Period month is required')
  if (rentTotal <= 0 && utilityTotal <= 0) {
    throw new Error('Enter at least one total (rent or utility)')
  }

  let headcounts: HeadcountEntry[]
  try {
    headcounts = JSON.parse(headcountsRaw)
  } catch {
    throw new Error('Invalid headcounts payload')
  }
  if (!Array.isArray(headcounts) || headcounts.length === 0) {
    throw new Error('Enter headcounts for at least one company')
  }
  const totalHc = headcounts.reduce((s, h) => s + (Number(h.headcount) || 0), 0)
  if (totalHc <= 0) {
    throw new Error('Total headcount must be greater than 0')
  }

  const period = dayjs(rawPeriod).startOf('month').format('YYYY-MM-DD')

  await assertPeriodOpen(supabase, period)

  const { data, error } = await supabase.rpc('generate_fixed_split_invoices', {
    p_period_month: period,
    p_rent_total: rentTotal,
    p_utility_total: utilityTotal,
    // Supabase generated type narrows JSONB to a recursive Json; HeadcountEntry
    // is structurally fine but won't match the recursive shape.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    p_headcounts: headcounts as any,
  })

  if (error) {
    throw new Error(`Failed to generate fixed split invoices: ${error.message}`)
  }

  const result = data as unknown as FixedSplitResult

  // Auto-deduct HV's non-billable share from Venture Pool
  const hvRent = Number(result.hv_rent_share ?? 0)
  const hvUtility = Number(result.hv_utility_share ?? 0)
  const user = await requireRole(['finance', 'principal'])

  if (hvRent > 0) {
    await supabase.from('hv_operating_fund').insert({
      transaction_type: 'expense_out' as const,
      amount: hvRent,
      description: `HV rent share — ${dayjs(period).format('MMM YYYY')}`,
      reference_table: 'invoices',
      created_by: user.id,
    })
  }
  if (hvUtility > 0) {
    await supabase.from('hv_operating_fund').insert({
      transaction_type: 'expense_out' as const,
      amount: hvUtility,
      description: `HV utility share — ${dayjs(period).format('MMM YYYY')}`,
      reference_table: 'invoices',
      created_by: user.id,
    })
  }

  revalidatePath('/billing')
  revalidatePath('/statements')
  revalidatePath('/dashboard')
  revalidatePath('/operating-fund')

  return {
    generated: Number(result.generated ?? 0),
    rent_invoices: Number(result.rent_invoices ?? 0),
    utility_invoices: Number(result.utility_invoices ?? 0),
    hv_rent_share: hvRent,
    hv_utility_share: hvUtility,
    total_headcount: Number(result.total_headcount ?? totalHc),
    hv_headcount: Number(result.hv_headcount ?? 0),
    period: String(result.period ?? period),
  }
}

// ─── Create marketing project contract (Finance) ────────────────────────────

export async function createContract(formData: FormData) {
  const user = await requireRole(['finance', 'dept_manager'])
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
  await requireRole(['finance'])
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
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const invoiceId = (formData.get('invoice_id') as string) ?? ''
  const amount = parseFloat((formData.get('amount') as string) ?? '0')
  const reason = (formData.get('reason') as string)?.trim() ?? ''

  if (!invoiceId) throw new Error('Invoice is required')
  if (isNaN(amount) || amount <= 0) throw new Error('Amount must be greater than 0')
  if (!reason) throw new Error('Reason is required')

  // Fetch invoice to get company_id and validate amount
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('id, company_id, total_amount')
    .eq('id', invoiceId)
    .single()

  if (invErr || !invoice) throw new Error('Invoice not found')
  if (amount > Number(invoice.total_amount)) {
    throw new Error(`Credit note amount cannot exceed invoice total (RM ${Number(invoice.total_amount).toFixed(2)})`)
  }

  // Generate credit note number
  const period = dayjs().format('YYYYMM')
  const { count } = await supabase
    .from('credit_notes')
    .select('*', { count: 'exact', head: true })
  const seq = (count ?? 0) + 1
  const creditNoteNo = `HV-CN-${period}-${String(seq).padStart(4, '0')}`

  const { data, error } = await supabase
    .from('credit_notes')
    .insert({
      credit_note_no: creditNoteNo,
      invoice_id: invoiceId,
      company_id: invoice.company_id,
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

// ─── Approve / Issue Invoice (Finance — draft → issued) ────────────────────

export async function approveInvoice(formData: FormData) {
  await requireRole(['finance'])
  const supabase = await createClient()

  const id = (formData.get('id') as string) ?? ''
  if (!id) throw new Error('Invoice id is required')

  const { data: inv } = await supabase
    .from('invoices')
    .select('period_month, status')
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

  revalidatePath('/billing')
  revalidatePath('/statements')
}

export async function approveInvoicesForPeriod(formData: FormData) {
  await requireRole(['finance'])
  const supabase = await createClient()

  const rawPeriod = (formData.get('period_month') as string) ?? ''
  if (!rawPeriod) throw new Error('Period month is required')
  const period = dayjs(rawPeriod).startOf('month').format('YYYY-MM-DD')

  await assertPeriodOpen(supabase, period)

  const { error, count } = await supabase
    .from('invoices')
    .update({ status: 'issued' }, { count: 'exact' })
    .eq('period_month', period)
    .eq('status', 'draft')

  if (error) throw new Error(`Failed to bulk issue invoices: ${error.message}`)

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
