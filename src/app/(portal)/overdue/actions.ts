'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { assertPeriodOpen } from '@/lib/period-lock'

// ─── Detect overdue loans (Finance) — Phase 7 Step 12 calendar-month rule ────
//
// A loan is overdue for a calendar month M if:
//   1. Today is AFTER the last day of month M (month has ended), AND
//   2. The interest expected for month M (principal * effective_rate) was
//      not paid via repayments during month M, AND
//   3. The loan still has outstanding principal.
//
// Current detection checks the PREVIOUS calendar month only. Historical rows
// keep their overdue_stage value; new rows leave stage NULL and set
// is_overdue=true.

export async function detectOverdue() {
  const user = await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  const now = dayjs()
  // Check the previous calendar month (current month isn't due yet)
  const periodStart = now.subtract(1, 'month').startOf('month')
  const periodEnd = periodStart.endOf('month')
  const periodMonth = periodStart.format('YYYY-MM-DD')

  // Only relevant if today is past previous month's end (almost always true).
  if (!now.isAfter(periodEnd, 'day')) {
    return { detected: 0, message: 'Previous month not yet closed — nothing to check.' }
  }

  const { data: activeLoans, error: loanError } = await supabase
    .from('loans')
    .select('id, principal, effective_rate, disbursement_date')
    .eq('status', 'active')

  if (loanError) throw new Error(`Failed to load active loans: ${loanError.message}`)
  if (!activeLoans || activeLoans.length === 0) {
    return { detected: 0, message: 'No active loans to check.' }
  }

  const { data: outstandingRows } = await supabase
    .from('loan_outstanding')
    .select('loan_id, outstanding')
    .eq('status', 'active')
  const outstandingMap = new Map(
    (outstandingRows ?? []).map((r) => [r.loan_id, Number(r.outstanding)])
  )

  // Repayments in the target period, grouped by loan.
  const { data: periodRepayments } = await supabase
    .from('repayments')
    .select('loan_id, amount, payment_type, payment_date')
    .gte('payment_date', periodStart.format('YYYY-MM-DD'))
    .lte('payment_date', periodEnd.format('YYYY-MM-DD'))
    .in('payment_type', ['interest', 'principal', 'netting'])

  const paidInPeriod = new Map<string, number>()
  for (const r of periodRepayments ?? []) {
    paidInPeriod.set(
      r.loan_id,
      (paidInPeriod.get(r.loan_id) ?? 0) + Number(r.amount)
    )
  }

  const daysOverdue = now.diff(periodEnd, 'day')
  let detectedCount = 0

  for (const loan of activeLoans) {
    // Skip loans disbursed AFTER the period ended — nothing accrued yet.
    if (loan.disbursement_date && dayjs(loan.disbursement_date).isAfter(periodEnd, 'day')) {
      continue
    }

    const outstanding = outstandingMap.get(loan.id) ?? Number(loan.principal)
    if (outstanding <= 0) continue

    const expectedInterest = Number(loan.principal) * Number(loan.effective_rate)
    const paid = paidInPeriod.get(loan.id) ?? 0
    if (paid >= expectedInterest) continue // interest covered

    const { error: upsertError } = await supabase.from('overdue_records').upsert(
      {
        loan_id: loan.id,
        period_month: periodMonth,
        overdue_days: daysOverdue,
        overdue_stage: null, // calendar-month rule — no stage ladder
        is_overdue: true,
        penalty_rate: 0,
        penalty_amount: 0,
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
  return {
    detected: detectedCount,
    message: `Detected ${detectedCount} overdue loan(s) for ${periodStart.format('MMM YYYY')}.`,
  }
}

// ─── Submit escalation (Finance → Principal approval) ────────────────────────

export async function submitEscalation(formData: FormData) {
  const user = await requireRole(['finance', 'principal'])
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
  const user = await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  const id = (formData.get('id') as string) ?? ''
  if (!id) throw new Error('Overdue record id is required')

  await assertPeriodOpen(supabase, new Date())

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
