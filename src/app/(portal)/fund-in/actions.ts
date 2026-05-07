'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { assertPeriodOpen } from '@/lib/period-lock'
import type { FundSourceType } from '@/types'

interface CreateFundSourceInput {
  source_type: FundSourceType
  from_id: string                  // company_id (subsidiary) or department_id (department_pool)
  from_freetext_name: string       // director_loan + outsource (Item 4)
  amount: number
  cost_rate_percent: number
  lock_in_months: number
  effective_date: string
  repayment_date: string
  notes?: string
}

// Item 4: 'outsource' added; director_loan keeps free-text input now.
const VALID_TYPES: FundSourceType[] = ['subsidiary', 'director_loan', 'department_pool', 'outsource']

export async function createFundSource(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const raw: CreateFundSourceInput = {
    source_type: formData.get('source_type') as FundSourceType,
    from_id: (formData.get('from_id') as string) ?? '',
    from_freetext_name: ((formData.get('from_freetext_name') as string) ?? '').trim(),
    amount: parseFloat((formData.get('amount') as string) ?? '0'),
    cost_rate_percent: parseFloat((formData.get('cost_rate_percent') as string) ?? '0'),
    lock_in_months: parseInt((formData.get('lock_in_months') as string) ?? '0', 10),
    effective_date: (formData.get('effective_date') as string) ?? '',
    repayment_date: (formData.get('repayment_date') as string) ?? '',
    notes: (formData.get('notes') as string) || undefined,
  }

  if (!VALID_TYPES.includes(raw.source_type)) {
    throw new Error('Invalid source type')
  }

  // Validate "from" input based on type. Director loan + outsource use a
  // free-text name (Item 4); subsidiary + dept pool still use FK ids.
  if (raw.source_type === 'subsidiary' && !raw.from_id) {
    throw new Error('Company is required for subsidiary')
  }
  if (raw.source_type === 'director_loan' && !raw.from_freetext_name) {
    throw new Error('Director name is required for director loan')
  }
  if (raw.source_type === 'department_pool' && !raw.from_id) {
    throw new Error('Department is required for department pool transfer')
  }
  if (raw.source_type === 'outsource' && !raw.from_freetext_name) {
    throw new Error('Outsource party name is required')
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
  if (!raw.repayment_date) {
    throw new Error('Repayment date is required')
  }
  if (dayjs(raw.repayment_date).isBefore(dayjs(raw.effective_date), 'day')) {
    throw new Error('Repayment date must be on or after effective date')
  }

  await assertPeriodOpen(supabase, raw.effective_date)

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
    repayment_date: raw.repayment_date,
    // Mig 12 trigger auto-fills maturity_date from effective_date + lock_in_months
    // when null. Set it explicitly to the user-entered repayment_date so the
    // detail page's "MATURES …" line matches what Finance promised.
    maturity_date: raw.repayment_date,
    early_withdrawal: false,
    // Phase 7: starts in pending_approval. Principal approval flips to 'active'
    // and posts the Venture Pool credit + bank balance bump.
    status: 'pending_approval' as const,
    notes: raw.notes ?? null,
    created_by: user.id,
  }

  // Polymorphic "from" slot based on type — see source_has_from CHECK constraint
  // (mig 224). subsidiary → from_company_id; department_pool → from_department_id;
  // director_loan + outsource → from_freetext_name (free text only since Item 4).
  let payload
  if (raw.source_type === 'subsidiary') {
    payload = {
      ...basePayload,
      from_company_id: raw.from_id || null,
      from_director_id: null,
      from_department_id: null,
      from_freetext_name: null,
    }
  } else if (raw.source_type === 'department_pool') {
    payload = {
      ...basePayload,
      from_company_id: null,
      from_director_id: null,
      from_department_id: raw.from_id || null,
      from_freetext_name: null,
    }
  } else {
    // director_loan + outsource
    payload = {
      ...basePayload,
      from_company_id: null,
      from_director_id: null,
      from_department_id: null,
      from_freetext_name: raw.from_freetext_name,
    }
  }

  const { data, error } = await supabase
    .from('fund_sources')
    .insert(payload)
    .select('id')
    .single()

  if (error) {
    throw new Error(`Failed to create fund source: ${error.message}`)
  }

  // Phase 7: no longer posts venture_pool.fund_in on submit. Money moves
  // when Principal approves — see approvals/actions.ts::approveRequest's
  // 'new_fund_source' branch. Here we only queue the approval request.
  const typeLabel =
    raw.source_type === 'subsidiary' ? 'subsidiary deposit'
    : raw.source_type === 'director_loan' ? `director loan (${raw.from_freetext_name})`
    : raw.source_type === 'outsource' ? `outsource (${raw.from_freetext_name})`
    : 'dept pool transfer'

  const { error: approvalError } = await supabase
    .from('approval_requests')
    .insert({
      request_type: 'new_fund_source' as const,
      reference_id: data.id,
      reference_table: 'fund_sources',
      submitted_by: user.id,
      description: `New fund source: ${typeLabel} — RM ${raw.amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${raw.cost_rate_percent}%/mo`,
      amount: raw.amount,
      status: 'pending' as const,
      workflow_state: 'submitted' as const,
    })

  if (approvalError) {
    // Best-effort rollback: delete the orphan fund_source so user can retry
    await supabase.from('fund_sources').delete().eq('id', data.id)
    throw new Error(`Failed to queue approval: ${approvalError.message}`)
  }

  revalidatePath('/fund-in')
  revalidatePath('/approvals')
  revalidatePath('/dashboard')
  redirect(`/fund-in/${data.id}`)
}

// ─── Update Fund Source (Finance, only pending_approval) ────────────────────
//
// Lets Finance fix typos / wrong amount / wrong rate / wrong dates before
// Principal approves. Once approved (status flips to 'active'), the row
// freezes — editing would mean rewriting the venture_pool credit + bank
// bump that already happened.
//
// Editable: amount, cost_rate_percent, lock_in_months, effective_date,
//   repayment_date (drives maturity_date), notes.
// Locked: source_type, from_company_id/from_director_id/from_department_id,
//   status, audit fields, created_by/at.
//
// Returns `{ error }` for validation failures so the message survives
// Next.js production error redaction.

export type FundSourceActionResult = { error: string } | undefined

export async function updateFundSource(formData: FormData): Promise<FundSourceActionResult> {
  await requireRole(['finance'])
  const supabase = await createClient()

  const id = (formData.get('id') as string) ?? ''
  if (!id) return { error: 'Fund source id is required' }

  const amount = parseFloat((formData.get('amount') as string) ?? '0')
  const costRatePercent = parseFloat((formData.get('cost_rate_percent') as string) ?? '0')
  const lockInMonths = parseInt((formData.get('lock_in_months') as string) ?? '0', 10)
  const effectiveDate = (formData.get('effective_date') as string) ?? ''
  const repaymentDate = (formData.get('repayment_date') as string) ?? ''
  const notes = (formData.get('notes') as string) || null

  if (isNaN(amount) || amount <= 0) return { error: 'Amount must be greater than 0' }
  if (isNaN(costRatePercent) || costRatePercent < 0 || costRatePercent >= 100) {
    return { error: 'Interest rate must be between 0 and 100%' }
  }
  if (isNaN(lockInMonths) || lockInMonths < 1) {
    return { error: 'Repayment period must be at least 1 month' }
  }
  if (!effectiveDate) return { error: 'Effective date is required' }
  if (dayjs(effectiveDate).isAfter(dayjs(), 'day')) {
    return { error: 'Effective date cannot be in the future' }
  }
  if (!repaymentDate) return { error: 'Repayment date is required' }
  if (dayjs(repaymentDate).isBefore(dayjs(effectiveDate), 'day')) {
    return { error: 'Repayment date must be on or after effective date' }
  }

  // Status guard — only pending_approval is editable.
  const { data: current } = await supabase
    .from('fund_sources')
    .select('id, status, source_type, amount')
    .eq('id', id)
    .single()
  if (!current) return { error: 'Fund source not found' }
  if (current.status !== 'pending_approval') {
    return {
      error: `Cannot edit fund source with status "${current.status}" — only pending_approval is editable`,
    }
  }

  await assertPeriodOpen(supabase, effectiveDate)

  const cost_rate = costRatePercent / 100

  // .select() forces Supabase to return matched rows so we detect the TOCTOU
  // race where Principal approves between our SELECT and UPDATE. Without it,
  // UPDATE matches 0 rows (status no longer pending_approval) and updErr stays
  // null — we'd silently corrupt an already-active fund source.
  const { data: updated, error: updErr } = await supabase
    .from('fund_sources')
    .update({
      amount,
      cost_rate,
      lock_in_months: lockInMonths || null,
      effective_date: effectiveDate,
      repayment_date: repaymentDate,
      maturity_date: repaymentDate,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending_approval')
    .select('id')

  if (updErr) return { error: `Failed to update fund source: ${updErr.message}` }
  if (!updated || updated.length === 0) {
    return {
      error: 'Fund source status changed mid-edit (already approved or cancelled) — refresh and try again',
    }
  }

  // If amount changed, refresh the approval_request so Principal sees the
  // updated number in the queue + email/digest descriptions.
  if (Number(current.amount) !== amount) {
    const typeLabel =
      current.source_type === 'subsidiary' ? 'subsidiary deposit'
      : current.source_type === 'director_loan' ? 'director loan'
      : 'dept pool transfer'
    await supabase
      .from('approval_requests')
      .update({
        description: `New fund source: ${typeLabel} — RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${costRatePercent}%/mo`,
        amount,
      })
      .eq('reference_id', id)
      .eq('reference_table', 'fund_sources')
      .eq('status', 'pending')
  }

  revalidatePath(`/fund-in/${id}`)
  revalidatePath('/fund-in')
  revalidatePath('/approvals')
  redirect(`/fund-in/${id}`)
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

// ─── List payable fund sources for Debit voucher ─────────────────────────────
//
// "HV pays out" to repay subs/directors. Pulls active fund_sources with
// outstanding > 0 + computes monthly principal/interest split + remaining
// periods. Consumed by Payment Voucher form's "this voucher is a loan
// repayment" checkbox (Finance-only).

export interface PayableFundSource {
  id: string
  label: string              // "CONTS — subsidiary · RM 300,000 @ 2.0%/mo · 6mo"
  source_type: string
  from_company_id: string | null
  from_director_id: string | null
  original_amount: number
  cost_rate: number
  lock_in_months: number | null
  outstanding: number
  monthly_payment: number
  monthly_principal: number
  monthly_interest: number
  total_periods: number
  periods_paid: number
  remaining_periods: number
}

export async function listPayableFundSources(): Promise<PayableFundSource[]> {
  await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  const [
    { data: outstanding },
    { data: sources },
    { data: companies },
    { data: departments },
    { data: repayments },
  ] = await Promise.all([
    supabase
      .from('fund_source_outstanding')
      .select('fund_source_id, source_type, from_company_id, from_director_id, from_department_id, original_amount, cost_rate, lock_in_months, outstanding, monthly_payment, total_principal_paid'),
    supabase.from('fund_sources').select('id, status'),
    supabase.from('companies').select('id, name, short_code'),
    supabase.from('departments').select('id, name'),
    supabase
      .from('fund_source_repayments')
      .select('fund_source_id, payment_type, payment_date')
      .eq('payment_type', 'principal'),
  ])

  const statusMap = new Map((sources ?? []).map((s) => [s.id, s.status]))
  const companyMap = new Map((companies ?? []).map((c) => [c.id, c]))
  const departmentMap = new Map((departments ?? []).map((d) => [d.id, d.name]))

  // Count distinct principal payment months per fund source (periods paid)
  const periodsPaidMap = new Map<string, Set<string>>()
  for (const r of repayments ?? []) {
    const ym = (r.payment_date as string).slice(0, 7)
    const set = periodsPaidMap.get(r.fund_source_id) ?? new Set<string>()
    set.add(ym)
    periodsPaidMap.set(r.fund_source_id, set)
  }

  return (outstanding ?? [])
    .filter((o): o is typeof o & { fund_source_id: string; source_type: string } => {
      if (o.fund_source_id == null || o.source_type == null) return false
      const status = statusMap.get(o.fund_source_id)
      return status === 'active' && Number(o.outstanding) > 0
    })
    .map((o) => {
      const amount = Number(o.original_amount)
      const rate = Number(o.cost_rate)
      const months = o.lock_in_months ?? 1
      const monthlyPayment = Number(o.monthly_payment)
      const monthlyInterest = months > 0 ? Number((amount * rate).toFixed(2)) : 0
      const monthlyPrincipal = Number((monthlyPayment - monthlyInterest).toFixed(2))
      const periodsPaid = periodsPaidMap.get(o.fund_source_id)?.size ?? 0
      const remaining = Math.max(0, months - periodsPaid)

      // Mig 194: dept-pool fund sources label by department name (not the
      // "Director" fallback that earlier versions showed for any row without
      // a from_company_id).
      let counterparty: string
      if (o.source_type === 'department_pool' && o.from_department_id) {
        counterparty = departmentMap.get(o.from_department_id) ?? 'Department'
      } else if (o.from_company_id) {
        const company = companyMap.get(o.from_company_id)
        counterparty = company ? `${company.short_code ?? company.name}` : 'Company'
      } else {
        counterparty = 'Director'
      }
      const label = `${counterparty} · RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} @ ${(rate * 100).toFixed(3)}%/mo · ${months}mo`

      return {
        id: o.fund_source_id,
        label,
        source_type: o.source_type,
        from_company_id: o.from_company_id,
        from_director_id: o.from_director_id,
        original_amount: amount,
        cost_rate: rate,
        lock_in_months: o.lock_in_months,
        outstanding: Number(o.outstanding),
        monthly_payment: monthlyPayment,
        monthly_principal: monthlyPrincipal,
        monthly_interest: monthlyInterest,
        total_periods: months,
        periods_paid: periodsPaid,
        remaining_periods: remaining,
      }
    })
    .sort((a, b) => b.remaining_periods - a.remaining_periods)
}
