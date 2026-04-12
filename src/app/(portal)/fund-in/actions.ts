'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import type { FundSourceType, PaymentType } from '@/types'
import { postJournalEntry, r2 } from '@/lib/journal'
import { assertPeriodOpen } from '@/lib/period-lock'

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

  const VALID_TYPES: FundSourceType[] = ['subsidiary_savings', 'director_loan', 'department_pool', 'director_saving']
  if (!VALID_TYPES.includes(raw.source_type)) {
    throw new Error('Invalid source type')
  }

  // from_id is required for subsidiary_savings and director_loan;
  // for department_pool and director_saving, the from_id maps to internal pools
  const needsCompany = raw.source_type === 'subsidiary_savings'
  const needsDirector = raw.source_type === 'director_loan'
  if ((needsCompany || needsDirector) && !raw.from_id) {
    throw new Error(
      needsCompany
        ? 'Company is required for subsidiary savings'
        : 'Director is required for director loan'
    )
  }
  // department_pool and director_saving don't need from_id (source is internal)
  // but we still accept an optional from_id for traceability
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

  // Build polymorphic FK: exactly one of from_company_id or from_director_id (CHECK constraint)
  // department_pool and director_saving use from_company_id=null, from_director_id=null
  // but the DB CHECK constraint requires exactly one to be set, so we map:
  //   department_pool → from_company_id (the dept pool doesn't have a company, use null marker)
  //   director_saving → from_director_id (the saving pool doesn't have a director, use null marker)
  // For Phase 4 these types use approval-based transfers, not direct FK links
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

  const nowIso = new Date().toISOString()

  const { error } = await supabase
    .from('fund_sources')
    .update({
      status: 'repaid',
      repaid_at: nowIso,
      repaid_by: user.id,
      updated_at: nowIso,
    })
    .eq('id', id)
    .in('status', ['active', 'matured'])

  if (error) {
    throw new Error(`Failed to mark repaid: ${error.message}`)
  }

  revalidatePath('/fund-in')
  revalidatePath(`/fund-in/${id}`)
  revalidatePath('/dashboard')
  redirect('/fund-in')
}

// ─── Record fund source repayment (monthly principal/interest) ───────────────

const VALID_PAYMENT_TYPES: PaymentType[] = ['principal', 'interest', 'penalty', 'netting']

export async function recordFundSourceRepayment(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const fundSourceId = (formData.get('fund_source_id') as string) ?? ''
  const paymentType = (formData.get('payment_type') as PaymentType) ?? 'interest'
  const amount = parseFloat((formData.get('amount') as string) ?? '0')
  const paymentDate = (formData.get('payment_date') as string) ?? ''
  const notes = (formData.get('notes') as string) || null

  if (!fundSourceId) throw new Error('Fund source id is required')
  if (!VALID_PAYMENT_TYPES.includes(paymentType)) throw new Error('Invalid payment type')
  if (isNaN(amount) || amount <= 0) throw new Error('Amount must be greater than 0')
  if (!paymentDate) throw new Error('Payment date is required')
  if (dayjs(paymentDate).isAfter(dayjs(), 'day')) {
    throw new Error('Payment date cannot be in the future')
  }

  // Check period is open
  await assertPeriodOpen(supabase, paymentDate)

  // Verify fund source is active/matured
  const { data: source, error: fetchError } = await supabase
    .from('fund_sources')
    .select('id, amount, status')
    .eq('id', fundSourceId)
    .single()

  if (fetchError || !source) throw new Error('Fund source not found')
  if (!['active', 'matured'].includes(source.status)) {
    throw new Error(`Cannot record repayment on fund source with status "${source.status}"`)
  }

  // For principal payments, check amount ≤ outstanding
  if (paymentType === 'principal') {
    const { data: outstanding } = await supabase
      .from('fund_source_outstanding')
      .select('outstanding')
      .eq('fund_source_id', fundSourceId)
      .single()

    const currentOutstanding = Number(outstanding?.outstanding ?? source.amount)
    if (amount > currentOutstanding + 0.01) {
      throw new Error(
        `Principal payment (RM ${amount.toFixed(2)}) exceeds outstanding balance (RM ${currentOutstanding.toFixed(2)})`
      )
    }
  }

  const { error: insertError } = await supabase
    .from('fund_source_repayments')
    .insert({
      fund_source_id: fundSourceId,
      amount,
      payment_type: paymentType,
      payment_date: paymentDate,
      notes,
      created_by: user.id,
    })

  if (insertError) {
    throw new Error(`Failed to record repayment: ${insertError.message}`)
  }

  // ── Post GL journal entry (double-entry) ──
  // Principal repayment: debit Fund Sources Payable (2010), credit Bank (1010)
  // Interest payment:    debit Interest Expense (5010), credit Bank (1010)
  const debitAccount = paymentType === 'principal' ? '2010' : '5010'
  const roundedAmount = r2(amount)

  try {
    await postJournalEntry(supabase, {
      transactionDate: paymentDate,
      description: `Fund source repayment (${paymentType}): RM ${roundedAmount.toFixed(2)}`,
      referenceType: 'fund_source',
      referenceId: fundSourceId,
      lines: [
        { accountCode: debitAccount, debit: roundedAmount, description: `${paymentType} repayment` },
        { accountCode: '1010', credit: roundedAmount, description: 'Bank payment' },
      ],
      createdBy: user.id,
    })
  } catch {
    // GL posting non-blocking
    console.error('GL journal posting failed for fund source repayment', fundSourceId)
  }

  revalidatePath(`/fund-in/${fundSourceId}`)
  revalidatePath('/fund-in')
  revalidatePath('/dashboard')
}
