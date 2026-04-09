'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

// ─── Submit department expense (Dept Manager) ────────────────────────────────

export async function submitDeptExpense(formData: FormData) {
  const user = await requireRole(['dept_manager'])
  const supabase = await createClient()

  // Lookup the user's department
  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select('department_id')
    .eq('id', user.id)
    .single()

  if (userErr || !userRow?.department_id) {
    throw new Error('Dept Manager has no department assigned')
  }

  const description = ((formData.get('description') as string) ?? '').trim()
  const amountRaw = (formData.get('amount') as string) ?? '0'
  const amount = parseFloat(amountRaw)

  if (!description) throw new Error('Description is required')
  if (isNaN(amount) || amount <= 0) throw new Error('Amount must be greater than 0')
  if (amount > 1_000_000) throw new Error('Amount exceeds RM 1M ceiling — split into multiple requests')

  // Submit to approval queue. On approval, the Step 2 approval_cascade
  // trigger will insert the matching dept_pools expense_out row.
  const { error } = await supabase.from('approval_requests').insert({
    request_type: 'dept_expense',
    reference_id: userRow.department_id,
    reference_table: 'departments',
    submitted_by: user.id,
    description,
    amount,
    status: 'pending',
    workflow_state: 'submitted',
  })

  if (error) {
    throw new Error(`Failed to submit expense: ${error.message}`)
  }

  revalidatePath('/dept-pool')
  revalidatePath('/dept-pool/marketing')
  revalidatePath('/approvals')
  revalidatePath('/dashboard')
  redirect('/dept-pool/marketing')
}
