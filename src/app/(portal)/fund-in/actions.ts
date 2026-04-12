'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import type { FundSourceType } from '@/types'

interface CreateFundSourceInput {
  source_type: FundSourceType
  from_id: string
  amount: number
  cost_rate_percent: number
  lock_in_months: number
  effective_date: string
  notes?: string
}

// Only 3 types now (director_saving removed per user feedback)
const VALID_TYPES: FundSourceType[] = ['subsidiary_savings', 'director_loan', 'department_pool']

export async function createFundSource(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const raw: CreateFundSourceInput = {
    source_type: formData.get('source_type') as FundSourceType,
    from_id: (formData.get('from_id') as string) ?? '',
    amount: parseFloat((formData.get('amount') as string) ?? '0'),
    cost_rate_percent: parseFloat((formData.get('cost_rate_percent') as string) ?? '0'),
    lock_in_months: parseInt((formData.get('lock_in_months') as string) ?? '0', 10),
    effective_date: (formData.get('effective_date') as string) ?? '',
    notes: (formData.get('notes') as string) || undefined,
  }

  if (!VALID_TYPES.includes(raw.source_type)) {
    throw new Error('Invalid source type')
  }

  // Validate from_id based on type
  if (raw.source_type === 'subsidiary_savings' && !raw.from_id) {
    throw new Error('Company is required for subsidiary')
  }
  if (raw.source_type === 'director_loan' && !raw.from_id) {
    throw new Error('Director is required for director loan')
  }
  if (raw.source_type === 'department_pool' && !raw.from_id) {
    throw new Error('Department is required for department pool transfer')
  }

  if (isNaN(raw.amount) || raw.amount <= 0) {
    throw new Error('Amount must be greater than 0')
  }
  if (isNaN(raw.cost_rate_percent) || raw.cost_rate_percent < 0 || raw.cost_rate_percent >= 100) {
    throw new Error('Interest rate must be between 0 and 100%')
  }
  if (isNaN(raw.lock_in_months) || raw.lock_in_months < 1) {
    throw new Error('Repayment period must be at least 1 month')
  }
  if (!raw.effective_date) {
    throw new Error('Effective date is required')
  }
  if (dayjs(raw.effective_date).isAfter(dayjs(), 'day')) {
    throw new Error('Effective date cannot be in the future')
  }

  // ── Balance validation for department_pool ──
  if (raw.source_type === 'department_pool') {
    // Find department_id from from_id, then check dept_pool balance
    const { data: deptBalance } = await supabase
      .from('dept_pools')
      .select('amount, transaction_type')
      .eq('department_id', raw.from_id)

    const balance = (deptBalance ?? []).reduce((sum, row) => {
      return sum + (row.transaction_type === 'np_in' ? Number(row.amount) : -Number(row.amount))
    }, 0)

    if (balance < raw.amount) {
      // Get department name for error message
      const { data: dept } = await supabase.from('departments').select('name').eq('id', raw.from_id).single()
      const deptName = dept?.name ?? 'Department'
      throw new Error(
        `Insufficient balance. ${deptName} pool has RM ${balance.toFixed(2)} but you are requesting RM ${raw.amount.toFixed(2)}.`
      )
    }
  }

  const cost_rate = raw.cost_rate_percent / 100

  const basePayload = {
    source_type: raw.source_type,
    capital_type: 'paid' as const,
    amount: raw.amount,
    cost_rate,
    lock_in_months: raw.lock_in_months || null,
    effective_date: raw.effective_date,
    early_withdrawal: false,
    status: 'active' as const,
    notes: raw.notes ?? null,
    created_by: user.id,
  }

  // Polymorphic FK based on type
  let payload
  if (raw.source_type === 'subsidiary_savings' || raw.source_type === 'department_pool') {
    payload = { ...basePayload, from_company_id: raw.from_id || null, from_director_id: null }
  } else {
    payload = { ...basePayload, from_company_id: null, from_director_id: raw.from_id || null }
  }

  const { data, error } = await supabase
    .from('fund_sources')
    .insert(payload)
    .select('id')
    .single()

  if (error) {
    throw new Error(`Failed to create fund source: ${error.message}`)
  }

  revalidatePath('/fund-in')
  revalidatePath('/dashboard')
  redirect(`/fund-in/${data.id}`)
}

// ─── Cancel Fund Source (requires Principal approval) ────────────────────────

export async function cancelFundSource(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const id = formData.get('id') as string
  if (!id) throw new Error('Fund source id is required')

  // Fetch fund source for description
  const { data: source, error: fetchErr } = await supabase
    .from('fund_sources')
    .select('id, amount, source_type, status')
    .eq('id', id)
    .eq('status', 'active')
    .single()

  if (fetchErr || !source) throw new Error('Fund source not found or not active')

  // Create approval request for cancellation
  const { error: approvalErr } = await supabase
    .from('approval_requests')
    .insert({
      request_type: 'tier_change' as const, // reuse existing type for now; semantically "fund source cancel"
      reference_id: id,
      reference_table: 'fund_sources',
      submitted_by: user.id,
      description: `Cancel fund source: ${source.source_type.replace('_', ' ')} — RM ${Number(source.amount).toLocaleString('en-MY', { minimumFractionDigits: 2 })}`,
      amount: Number(source.amount),
      status: 'pending' as const,
      workflow_state: 'submitted' as const,
    })

  if (approvalErr) {
    throw new Error(`Failed to submit cancellation request: ${approvalErr.message}`)
  }

  revalidatePath('/fund-in')
  revalidatePath(`/fund-in/${id}`)
  revalidatePath('/approvals')
  revalidatePath('/dashboard')
}

export async function markFundSourceMatured(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const id = formData.get('id') as string
  if (!id) throw new Error('Fund source id is required')

  const { error } = await supabase
    .from('fund_sources')
    .update({ status: 'matured', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'active')

  if (error) {
    throw new Error(`Failed to mark matured: ${error.message}`)
  }

  void user
  revalidatePath('/fund-in')
  revalidatePath(`/fund-in/${id}`)
  revalidatePath('/dashboard')
}
