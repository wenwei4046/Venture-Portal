'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { assertPeriodOpen } from '@/lib/period-lock'
import { postJournalEntry } from '@/lib/journal'

// Mig 200/P1-6a: invoice billing_mode → revenue GL code mapping.
// Mig 238 reseed: revenue lives in the 5000-5999 range; 4030 / 4040 are now
// liability accounts (Statutory Payable / Director Invoice Payable). The
// b348724 GL-remap pass missed this fallback, so invoices issued without an
// explicit revenue category_code were silently crediting liabilities and
// inflating the balance sheet by their amount. Until per-billing-mode
// revenue sub-accounts exist, every fallback routes to Service Revenue — Subs
// (5000), the sole revenue account seeded in mig 238.
function revenueGlCode(_billingMode: string | null): string {
  return '5000'
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
  const user = await requireRole(['finance'])
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
  await requireRole(['finance'])
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
  await requireRole(['finance'])
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

  const categoryCode = String(formData.get('category_code') ?? '').trim() || null
  const description = String(formData.get('description') ?? '').trim() || null
  const invoiceDate = String(formData.get('invoice_date') ?? '').trim() || null
  const dueDate = String(formData.get('due_date') ?? '').trim() || null
  const referenceNo = String(formData.get('reference_no') ?? '').trim() || null

  const { error } = await supabase
    .from('invoices')
    .update({
      total_amount: amount,
      category_code: categoryCode,
      description,
      invoice_date: invoiceDate,
      due_date: dueDate,
      reference_no: referenceNo,
    })
    .eq('id', id)
    .eq('status', 'draft')

  if (error) throw new Error(`Failed to update invoice: ${error.message}`)

  revalidatePath('/billing')
  revalidatePath('/statements')
}

// ─── Approve / Issue Invoice (Finance — draft → issued) ────────────────────

export async function approveInvoice(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const id = (formData.get('id') as string) ?? ''
  if (!id) throw new Error('Invoice id is required')

  const { data: inv } = await supabase
    .from('invoices')
    .select('id, invoice_no, period_month, status, total_amount, billing_mode, company_id, category_code, billable_to_type, billable_to_department_id')
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
    const revenueCode = await resolveRevenueGlCode(supabase, inv.category_code, inv.billing_mode)
    try {
      // transaction_date = the day this JE is being booked (today), NOT the
      // end-of-period. period_month already captures which accounting period
      // the entry belongs to. Using endOf(period_month) creates future-dated
      // JEs that get excluded from BS snapshots run mid-period, leaving AR
      // looking "credit-only" when the invoice has already been settled.
      await postJournalEntry(supabase, {
        transactionDate: dayjs().format('YYYY-MM-DD'),
        description: `Invoice ${inv.invoice_no ?? inv.id} issued`,
        referenceType: 'invoice',
        referenceId: inv.id,
        createdBy: user.id,
        lines: [
          { accountCode: '3030', debit: amount, description: `AR — invoice ${inv.invoice_no ?? ''}`.trim() },
          { accountCode: revenueCode, credit: amount, description: 'Service billing revenue recognised' },
        ],
      })
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
      if (payingDept?.name) {
        const { data: expenseAcct } = await supabase
          .from('chart_of_accounts')
          .select('code')
          .eq('type', 'expense')
          .ilike('name', `Inter-billing % ${payingDept.name}`)
          .maybeSingle()
        if (expenseAcct?.code) {
          try {
            await postJournalEntry(supabase, {
              transactionDate: dayjs().format('YYYY-MM-DD'),
              description: `Invoice ${inv.invoice_no ?? inv.id} issued — inter-billing expense (${payingDept.name})`,
              referenceType: 'invoice',
              referenceId: inv.id,
              createdBy: user.id,
              lines: [
                { accountCode: expenseAcct.code, debit: amount, description: `Inter-billing expense — ${payingDept.name}` },
                { accountCode: '3030', credit: amount, description: `AR cleared — inter-billing ${inv.invoice_no ?? ''}`.trim() },
              ],
            })
          } catch (jeErr) {
            const msg = jeErr instanceof Error ? jeErr.message : 'unknown'
            throw new Error(`Invoice issued but inter-billing expense JE failed: ${msg}`)
          }
        }
      }
    }
  }

  revalidatePath('/billing')
  revalidatePath('/statements')
}

export async function approveInvoicesForPeriod(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const rawPeriod = (formData.get('period_month') as string) ?? ''
  if (!rawPeriod) throw new Error('Period month is required')
  const period = dayjs(rawPeriod).startOf('month').format('YYYY-MM-DD')

  await assertPeriodOpen(supabase, period)

  // Pull draft rows up-front so we can post AR accrual JEs after the bulk update.
  const { data: draftInvoices } = await supabase
    .from('invoices')
    .select('id, invoice_no, total_amount, billing_mode, category_code, billable_to_type, billable_to_department_id')
    .eq('period_month', period)
    .eq('status', 'draft')

  const { error, count } = await supabase
    .from('invoices')
    .update({ status: 'issued' }, { count: 'exact' })
    .eq('period_month', period)
    .eq('status', 'draft')

  if (error) throw new Error(`Failed to bulk issue invoices: ${error.message}`)

  // Mig 200/P1-6a: post AR accrual per newly-issued invoice.
  // transaction_date = today (when actually issued). period_month already
  // tracks accounting period via the journal_entries.period_month column.
  const txnDate = dayjs().format('YYYY-MM-DD')
  for (const row of draftInvoices ?? []) {
    const amount = Number(row.total_amount ?? 0)
    if (amount <= 0) continue
    const revenueCode = await resolveRevenueGlCode(supabase, row.category_code, row.billing_mode)
    try {
      await postJournalEntry(supabase, {
        transactionDate: txnDate,
        description: `Invoice ${row.invoice_no ?? row.id} issued (bulk)`,
        referenceType: 'invoice',
        referenceId: row.id,
        createdBy: user.id,
        lines: [
          { accountCode: '3030', debit: amount, description: `AR — invoice ${row.invoice_no ?? ''}`.trim() },
          { accountCode: revenueCode, credit: amount, description: 'Service billing revenue recognised' },
        ],
      })
    } catch (jeErr) {
      const msg = jeErr instanceof Error ? jeErr.message : 'unknown'
      throw new Error(`Bulk issue: JE post failed for invoice ${row.invoice_no ?? row.id}: ${msg}`)
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
      if (payingDept?.name) {
        const { data: expenseAcct } = await supabase
          .from('chart_of_accounts')
          .select('code')
          .eq('type', 'expense')
          .ilike('name', `Inter-billing % ${payingDept.name}`)
          .maybeSingle()
        if (expenseAcct?.code) {
          try {
            await postJournalEntry(supabase, {
              transactionDate: txnDate,
              description: `Invoice ${row.invoice_no ?? row.id} issued (bulk) — inter-billing expense (${payingDept.name})`,
              referenceType: 'invoice',
              referenceId: row.id,
              createdBy: user.id,
              lines: [
                { accountCode: expenseAcct.code, debit: amount, description: `Inter-billing expense — ${payingDept.name}` },
                { accountCode: '3030', credit: amount, description: `AR cleared — inter-billing ${row.invoice_no ?? ''}`.trim() },
              ],
            })
          } catch (jeErr) {
            const msg = jeErr instanceof Error ? jeErr.message : 'unknown'
            throw new Error(`Bulk issue: inter-billing expense JE failed for invoice ${row.invoice_no ?? row.id}: ${msg}`)
          }
        }
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
