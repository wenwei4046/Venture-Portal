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
] as const

export type CreateInvoiceMode = (typeof CREATE_INVOICE_MODES)[number]

export async function createManualInvoice(formData: FormData): Promise<void> {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const companyId = String(formData.get('company_id') ?? '')
  const rawPeriod = String(formData.get('period_month') ?? '')
  const rawMode = String(formData.get('billing_mode') ?? '')
  const rawAmount = String(formData.get('amount') ?? '')
  const invoiceDate = String(formData.get('invoice_date') ?? '').trim() || null
  const dueDate = String(formData.get('due_date') ?? '').trim() || null
  const description = String(formData.get('description') ?? '').trim() || null
  const referenceNo = String(formData.get('reference_no') ?? '').trim() || null

  if (!companyId) throw new Error('Subsidiary is required')
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
    company_id: companyId,
    period_month: period,
    billing_mode: billingMode,
    base_amount: amount,
    total_amount: amount,
    status: 'draft',
    invoice_date: invoiceDate,
    due_date: dueDate,
    description,
    reference_no: referenceNo,
    created_by: user.id,
  })

  if (error) throw new Error(`Failed to create invoice: ${error.message}`)

  revalidatePath('/billing')
  revalidatePath('/statements/invoices')
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
