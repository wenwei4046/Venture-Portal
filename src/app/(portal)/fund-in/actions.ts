'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import type { FundSourceType } from '@/types'

interface CreateFundSourceInput {
  source_type: FundSourceType
  from_id: string // company_id or director_id depending on type
  amount: number
  cost_rate_percent: number // entered as percent, stored as decimal
  lock_in_months: number
  effective_date: string // ISO date
  notes?: string
}

export async function createFundSource(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  // Parse + validate
  const raw: CreateFundSourceInput = {
    source_type: formData.get('source_type') as FundSourceType,
    from_id: (formData.get('from_id') as string) ?? '',
    amount: parseFloat((formData.get('amount') as string) ?? '0'),
    cost_rate_percent: parseFloat((formData.get('cost_rate_percent') as string) ?? '0'),
    lock_in_months: parseInt((formData.get('lock_in_months') as string) ?? '0', 10),
    effective_date: (formData.get('effective_date') as string) ?? '',
    notes: (formData.get('notes') as string) || undefined,
  }

  if (!['subsidiary_savings', 'director_loan'].includes(raw.source_type)) {
    throw new Error('Invalid source type')
  }
  if (!raw.from_id) {
    throw new Error(
      raw.source_type === 'subsidiary_savings'
        ? 'Company is required for subsidiary savings'
        : 'Director is required for director loan'
    )
  }
  if (isNaN(raw.amount) || raw.amount <= 0) {
    throw new Error('Amount must be greater than 0')
  }
  if (isNaN(raw.cost_rate_percent) || raw.cost_rate_percent < 0 || raw.cost_rate_percent >= 100) {
    throw new Error('Cost rate must be between 0 and 100%')
  }
  if (isNaN(raw.lock_in_months) || raw.lock_in_months < 0) {
    throw new Error('Lock-in months must be a non-negative integer')
  }
  if (!raw.effective_date) {
    throw new Error('Effective date is required')
  }
  // Compare by day to avoid timezone edge cases (user in UTC+8 vs server UTC)
  if (dayjs(raw.effective_date).isAfter(dayjs(), 'day')) {
    throw new Error('Effective date cannot be in the future')
  }

  // Convert percent to decimal for DB storage
  const cost_rate = raw.cost_rate_percent / 100

  // Build insert payload based on source_type (CHECK constraint enforces exactly one)
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

  const payload =
    raw.source_type === 'subsidiary_savings'
      ? { ...basePayload, from_company_id: raw.from_id, from_director_id: null }
      : { ...basePayload, from_company_id: null, from_director_id: raw.from_id }

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

export async function cancelFundSource(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const id = formData.get('id') as string
  if (!id) throw new Error('Fund source id is required')

  const { error } = await supabase
    .from('fund_sources')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'active')

  if (error) {
    throw new Error(`Failed to cancel fund source: ${error.message}`)
  }

  void user
  revalidatePath('/fund-in')
  revalidatePath('/dashboard')
  redirect('/fund-in')
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

export async function repayFundSource(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const id = formData.get('id') as string
  if (!id) throw new Error('Fund source id is required')

  const { error } = await supabase
    .from('fund_sources')
    .update({ status: 'repaid', updated_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', ['active', 'matured'])

  if (error) {
    throw new Error(`Failed to mark repaid: ${error.message}`)
  }

  void user
  revalidatePath('/fund-in')
  revalidatePath(`/fund-in/${id}`)
  revalidatePath('/dashboard')
  redirect('/fund-in')
}
