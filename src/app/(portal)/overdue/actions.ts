'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

// ─── Detect overdue loans (Finance) ───────────────────────────────────────────

export async function detectOverdue() {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const today = dayjs().format('YYYY-MM-DD')
  const periodMonth = dayjs().startOf('month').format('YYYY-MM-DD')

  // 1. Get all active loans
  const { data: activeLoans, error: loanError } = await supabase
    .from('loans')
    .select('id, principal, effective_rate')
    .eq('status', 'active')

  if (loanError) {
    throw new Error(`Failed to load active loans: ${loanError.message}`)
  }

  if (!activeLoans || activeLoans.length === 0) {
    return { detected: 0, message: 'No active loans to check.' }
  }

  // 2. Get outstanding amounts for all active loans
  const { data: outstandingRows } = await supabase
    .from('loan_outstanding')
    .select('loan_id, outstanding')
    .eq('status', 'active')

  const outstandingMap = new Map(
    (outstandingRows ?? []).map((r) => [r.loan_id, Number(r.outstanding)])
  )

  let detectedCount = 0

  // 3. For each loan, call Postgres helpers + upsert overdue_records
  for (const loan of activeLoans) {
    const { data: daysOverdue } = await supabase.rpc('calculate_days_overdue', {
      p_loan_id: loan.id,
      p_as_of_date: today,
    })

    const days = Number(daysOverdue ?? 0)
    if (days <= 0) continue

    // Look up stage + penalty rate
    const { data: stageRow } = await supabase.rpc('lookup_overdue_stage', {
      p_days_overdue: days,
    })

    const stage = stageRow?.[0]?.stage
    const penaltyRate = Number(stageRow?.[0]?.penalty_rate ?? 0)

    if (!stage) continue // shouldn't happen if overdue_config is seeded

    const outstanding = outstandingMap.get(loan.id) ?? Number(loan.principal)
    const penaltyAmount = outstanding * penaltyRate

    // Upsert (ON CONFLICT via UNIQUE (loan_id, period_month))
    const { error: upsertError } = await supabase.from('overdue_records').upsert(
      {
        loan_id: loan.id,
        period_month: periodMonth,
        overdue_days: days,
        overdue_stage: stage,
        penalty_rate: penaltyRate,
        penalty_amount: penaltyAmount,
        status: 'pending',
      },
      { onConflict: 'loan_id,period_month' }
    )

    if (upsertError) {
      console.error(`Failed to upsert overdue for loan ${loan.id}:`, upsertError.message)
      continue
    }

    detectedCount++
  }

  void user
  revalidatePath('/overdue')
  revalidatePath('/dashboard')
  return { detected: detectedCount, message: `Detected ${detectedCount} overdue loan(s).` }
}

// ─── Submit escalation (Finance → Principal approval) ────────────────────────

export async function submitEscalation(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const overdueId = (formData.get('overdue_id') as string) ?? ''
  if (!overdueId) throw new Error('Overdue record id is required')

  // Fetch overdue record + loan context
  const { data: overdue, error: overdueError } = await supabase
    .from('overdue_records')
    .select('*')
    .eq('id', overdueId)
    .single()

  if (overdueError || !overdue) {
    throw new Error('Overdue record not found')
  }

  if (overdue.overdue_stage !== 'escalation') {
    throw new Error(
      `Can only escalate stage=escalation records (current: ${overdue.overdue_stage})`
    )
  }

  const { data: loan } = await supabase
    .from('loans')
    .select('company_id, principal, companies(name, short_code)')
    .eq('id', overdue.loan_id)
    .single()

  if (!loan) throw new Error('Loan not found')

  // Create approval_request (escalation type)
  const { error: approvalError } = await supabase.from('approval_requests').insert({
    request_type: 'escalation',
    reference_id: overdue.id,
    reference_table: 'overdue_records',
    submitted_by: user.id,
    description: `Escalate ${loan.companies?.name}: ${overdue.overdue_days}d overdue, tier downgrade recommended`,
    amount: Number(loan.principal),
    status: 'pending',
    workflow_state: 'submitted',
  })

  if (approvalError) {
    throw new Error(`Failed to submit escalation: ${approvalError.message}`)
  }

  // Mark overdue_record as escalated
  await supabase
    .from('overdue_records')
    .update({ status: 'escalated' })
    .eq('id', overdueId)

  revalidatePath('/overdue')
  revalidatePath('/approvals')
  redirect('/overdue')
}

// ─── Mark overdue as paid (Finance — after payment received) ─────────────────

export async function markOverduePaid(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const id = (formData.get('id') as string) ?? ''
  if (!id) throw new Error('Overdue record id is required')

  const { error } = await supabase
    .from('overdue_records')
    .update({ status: 'paid' })
    .eq('id', id)
    .eq('status', 'pending')

  if (error) {
    throw new Error(`Failed to mark paid: ${error.message}`)
  }

  void user
  revalidatePath('/overdue')
  revalidatePath('/dashboard')
}
