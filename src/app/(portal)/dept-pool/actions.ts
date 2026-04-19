'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

// ─── Submit Request Payment (Dept Manager → Principal #1 → Finance PV → Principal #2)

export async function submitRequestPayment(args: {
  payeeCompanyId: string | null
  payeeName: string
  amount: number
  description: string
  categoryCode: string | null
}) {
  await requireRole(['dept_manager'])
  const supabase = await createClient()

  if (!args.payeeName.trim()) throw new Error('Payee name is required')
  if (!args.description.trim()) throw new Error('Description is required')
  if (!Number.isFinite(args.amount) || args.amount <= 0) {
    throw new Error('Amount must be greater than 0')
  }
  if (args.amount > 1_000_000) {
    throw new Error('Amount exceeds RM 1M ceiling — split into multiple requests')
  }

  // Supabase types generator marks nullable UUID/TEXT params as required
  // strings; cast to satisfy the generated signature.
  const { error } = await supabase.rpc('submit_dept_payment_request', {
    p_payee_company_id: (args.payeeCompanyId ?? null) as unknown as string,
    p_payee_name: args.payeeName.trim(),
    p_amount: args.amount,
    p_description: args.description.trim(),
    p_category_code: (args.categoryCode ?? undefined) as unknown as string | undefined,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/dept-pool/marketing')
  revalidatePath('/approvals')
}

// ─── Submit Request Credit (Invoice Submission) ─────────────────────────────

export async function submitRequestCredit(args: {
  period: string
  invoiceDate: string
  dueDate: string
  description: string
  referenceNo: string | null
  lineItems: { subsidiary_id: string; amount: number }[]
}) {
  await requireRole(['dept_manager'])
  const supabase = await createClient()

  if (args.lineItems.length === 0) throw new Error('At least one line item is required')
  for (const item of args.lineItems) {
    if (!item.subsidiary_id) throw new Error('Subsidiary is required for every line')
    if (!Number.isFinite(item.amount) || item.amount <= 0) {
      throw new Error('Amount must be greater than 0 for every line')
    }
  }

  const { error } = await supabase.rpc('submit_invoice_request', {
    p_period_month: args.period,
    p_invoice_date: args.invoiceDate,
    p_due_date: args.dueDate,
    p_description: args.description.trim(),
    p_reference_no: (args.referenceNo ?? '') as string,
    p_line_items: args.lineItems,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/dept-pool/marketing')
  revalidatePath('/billing/requests')
}

