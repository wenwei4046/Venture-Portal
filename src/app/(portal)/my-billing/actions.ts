'use server'

// Dept-manager self-service billing (2026-08-20, marketing user features).
// A manager creates DRAFT invoices for their OWN segment only — the
// invoices_dept_manager_insert RLS policy (mig 20260820010000) is the hard
// gate; approve/issue stays with Finance/Principal via the normal /billing
// flow, so a manager can never post revenue by themselves.

import { revalidatePath } from 'next/cache'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { assertPeriodOpen } from '@/lib/period-lock'
import { deptNameToSegment } from '@/lib/billing'

// gl_segment → the billing_mode whose revenue lands in that segment
// (inverse of BILLING_MODE_TO_SEGMENT in lib/invoice-settlement).
const SEGMENT_TO_BILLING_MODE: Record<string, string> = {
  marketing: 'marketing_project',
  hr: 'hr_attribution',
  finance: 'finance_attribution',
  director_office: 'director_office_attribution',
  director: 'director_attribution',
}

export async function createDeptInvoice(
  formData: FormData,
): Promise<{ error?: string; invoiceNo?: string }> {
  const user = await requireRole(['dept_manager'])
  const supabase = await createClient()

  if (!user.department_id) return { error: 'No department assigned to your account' }
  const { data: dept } = await supabase
    .from('departments')
    .select('name')
    .eq('id', user.department_id)
    .single()
  const segment = deptNameToSegment(dept?.name)
  const billingMode = segment ? SEGMENT_TO_BILLING_MODE[segment] : undefined
  if (!billingMode) return { error: `Department ${dept?.name ?? '?'} has no billing mode mapping` }

  const companyId = String(formData.get('company_id') ?? '').trim()
  const freetext = String(formData.get('billable_to_freetext_name') ?? '').trim()
  const contractId = String(formData.get('contract_id') ?? '').trim() || null
  const rawPeriod = String(formData.get('period_month') ?? '').trim()
  const rawAmount = String(formData.get('amount') ?? '').trim()
  const invoiceDate = String(formData.get('invoice_date') ?? '').trim() || null
  const dueDate = String(formData.get('due_date') ?? '').trim() || null
  const description = String(formData.get('description') ?? '').trim() || null

  if (!companyId && !freetext) return { error: '要选公司,或填 bill to 名字' }
  if (!/^\d{4}-\d{2}$/.test(rawPeriod)) return { error: 'Period is required (YYYY-MM)' }
  const amount = Number(rawAmount)
  if (!Number.isFinite(amount) || amount <= 0) return { error: '金额必须大于 0' }

  const period = dayjs(`${rawPeriod}-01`).format('YYYY-MM-DD')
  try {
    await assertPeriodOpen(supabase, period)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Period is locked' }
  }

  const { data: invoiceNo, error: mintErr } = await supabase.rpc('mint_invoice_no', {
    p_period: period,
  })
  if (mintErr || !invoiceNo) {
    return { error: `Failed to mint invoice number: ${mintErr?.message ?? 'unknown'}` }
  }

  const { error } = await supabase.from('invoices').insert({
    invoice_no: invoiceNo,
    period_month: period,
    billing_mode: billingMode,
    base_amount: amount,
    total_amount: amount,
    status: 'draft',
    // Default the document date to the period month-end (2026-08-13 rule) so
    // revenue lands in the billed month even when keyed later.
    invoice_date: invoiceDate ?? dayjs(period).endOf('month').format('YYYY-MM-DD'),
    due_date: dueDate,
    description,
    contract_id: contractId,
    created_by: user.id,
    billable_to_type: companyId ? 'subsidiary' : 'freetext',
    company_id: companyId || null,
    billable_to_freetext_name: companyId ? null : freetext,
  } as never)
  if (error) return { error: `Failed to create invoice: ${error.message}` }

  revalidatePath('/my-billing')
  revalidatePath('/billing')
  return { invoiceNo: String(invoiceNo) }
}
