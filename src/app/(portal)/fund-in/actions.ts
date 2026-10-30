'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn, requireAnyActionOn, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { fetchAllRows } from '@/lib/paginate'
import { assertPeriodOpen } from '@/lib/period-lock'
import { officeMonth, officeToday } from '@/lib/office-time'
import type { FundSourceType } from '@/types'
import type { Json } from '@/lib/supabase/database.types'
import { buildTermsSegments, currentSegment, principalDueIn, principalPaidSince, segmentRemainingPeriods, segmentsGovern, termsChanged } from '@/lib/treasury-terms'
import { fetchTermsHistory, termsForFundSource } from '@/lib/treasury-terms-data'
import { remainingPeriods } from '@/lib/loan-monitor'
import { loadNewSourceOptions, type NewSourceOptions } from './_lib/new-source-options'
import { amendMonthWords, compoundSent, explainAmendRefusal, openFromSent, principalPerMonthSent } from '@/lib/fund-amend'
import { sourceEditPatch } from '@/lib/fund-source-edit'
import { minPayFromDate } from '@/lib/min-pay'

// ─── Amend an ACTIVE fund source: the terms in force recalculated ─────────────
// Principal is the top approval authority, so edits apply immediately via the
// amend_fund_source SECURITY DEFINER RPC (audited by fund_sources.updated_at).
// Only the fields the form sends are changed. The existing updateFundSource
// path stays for pending_approval edits by Finance. Treasury · Edit without
// Approve (2026-10-27, the user: "Finance 也能提交「从第一期起重算」给 Principal
// 核准") FILES the same change for the Principal — the rate, the periods,
// compounding — and the approval applies it (file_terms_change p_whole).
export async function amendFundSource(formData: FormData): Promise<{ error: string } | undefined> {
  const user = await requireAnyActionOn('/fund-in', ['treasury', 'approve'], ['treasury', 'edit'])
  const refused = canDo(user, 'treasury', 'approve') ? await amendFundSourceWork(formData) : await fileWholeFundSource(formData)
  if (refused) return refused
  redirect(`/fund-in/${formData.get('fund_source_id') as string}`)
}

/** The whole terms filed for the Principal: the rate, the periods (sent blank = no fixed term), compounding — never the repayment start. */
async function fileWholeFundSource(formData: FormData): Promise<{ error: string } | undefined> {
  const supabase = await createClient()

  const id = (formData.get('fund_source_id') as string) ?? ''
  if (!id) return { error: 'Fund source id is required' }
  const ratePctRaw = ((formData.get('cost_rate_percent') as string) ?? '').trim()
  let rate: number | null = null
  if (ratePctRaw !== '') {
    const ratePct = parseFloat(ratePctRaw)
    if (isNaN(ratePct) || ratePct < 0 || ratePct >= 100) return { error: 'The rate must be from 0 to 100%.' }
    rate = Math.round((ratePct / 100) * 1e6) / 1e6
  }
  let periods: number | null = null
  let noFixedTerm = false
  if (formData.has('lock_in_months')) {
    const raw = ((formData.get('lock_in_months') as string) ?? '').trim()
    if (raw === '') {
      noFixedTerm = true
    } else {
      const n = parseInt(raw, 10)
      if (isNaN(n) || n < 1 || n > 120) return { error: 'The periods are a whole number from 1 to 120, or blank for no fixed term.' }
      periods = n
    }
  }
  const compound = compoundSent(formData)
  // A fixed amount a month (2026-10-27), and the month the fixed term ends.
  const ppm = principalPerMonthSent(formData)
  if (!ppm.ok) return { error: ppm.error }
  if (ppm.value !== null && (periods !== null || noFixedTerm)) return { error: 'Choose a fixed amount a month, a number of months or no fixed term — one of them.' }
  const openFrom = openFromSent(formData)
  if (rate === null && periods === null && !noFixedTerm && compound === null && ppm.value === null && !openFrom) {
    return { error: 'Nothing was changed — change the rate, the repayment or compounding first.' }
  }
  const reason = ((formData.get('reason') as string) ?? '').trim()

  const { error } = await supabase.rpc('file_terms_change' as never, {
    p_record_kind: 'fund_source',
    p_record_id: id,
    // The database takes the month the terms in force began; a date is asked all the same.
    p_effective_from: officeToday(),
    p_rate: rate,
    p_remaining_months: periods,
    p_compound_interest: compound,
    p_no_fixed_term: noFixedTerm,
    p_reason: reason || null,
    p_whole: true,
    p_principal_per_month: ppm.value,
    p_open_from: openFrom ? `${openFrom}-01` : null,
  } as never)
  if (error) return { error: `Not submitted: ${error.message}` }
  revalidatePath(`/fund-in/${id}`)
  revalidatePath('/fund-in')
  revalidatePath('/approvals')
  return undefined
}

async function amendFundSourceWork(formData: FormData): Promise<{ error: string } | undefined> {
  // Applied at once is Treasury · Approve's — the RPC asks it too.
  await requireActionOn('/fund-in', 'treasury', 'approve')
  const supabase = await createClient()

  const id = (formData.get('fund_source_id') as string) ?? ''
  if (!id) return { error: 'Fund source id is required' }

  // Only what the form sends is changed (lib/fund-amend — the forms send what was edited, 2026-10-16).
  const ratePctRaw = (formData.get('cost_rate_percent') as string) ?? ''
  const repaymentDate = (formData.get('repayment_date') as string) || null
  const compound = compoundSent(formData)
  const notes = (formData.get('notes') as string) ?? ''

  const payload: Record<string, Json> = {}
  if (compound !== null) payload.compound_interest = compound

  if (ratePctRaw.trim() !== '') {
    const ratePct = parseFloat(ratePctRaw)
    if (isNaN(ratePct) || ratePct < 0 || ratePct >= 100) return { error: 'The rate must be from 0 to 100%.' }
    payload.cost_rate = Math.round((ratePct / 100) * 1e6) / 1e6
  }
  // lock_in_months: sent empty => no fixed term (null); not sent => as it is.
  if (formData.has('lock_in_months')) {
    const lockRaw = (formData.get('lock_in_months') as string) ?? ''
    if (lockRaw.trim() === '') {
      payload.lock_in_months = null
    } else {
      const n = parseInt(lockRaw, 10)
      if (isNaN(n) || n < 1 || n > 120) return { error: 'The periods are a whole number from 1 to 120, or blank for no fixed term.' }
      payload.lock_in_months = n
    }
  }
  // A fixed amount a month (2026-10-27): its months are worked out from what the terms began on.
  const ppm = principalPerMonthSent(formData)
  if (!ppm.ok) return { error: ppm.error }
  if (ppm.value !== null) {
    if ('lock_in_months' in payload) return { error: 'Choose a fixed amount a month, a number of months or no fixed term — one of them.' }
    payload.principal_per_month = ppm.value
  }
  if (repaymentDate) payload.repayment_date = repaymentDate
  if (notes.trim()) payload.notes = notes.trim()

  const { error } = await supabase.rpc('amend_fund_source', { p_fund_source_id: id, p_payload: payload })
  if (error) return { error: `Not saved: ${error.message}` }
  // No fixed term from a later month: the terms just saved end their fixed term there, the interest kept on the same amount.
  const openFrom = openFromSent(formData)
  if (openFrom) {
    const { error: openErr } = await supabase.rpc('amend_fund_source_from', {
      p_fund_source_id: id,
      p_effective_from: `${openFrom}-01`,
      p_cost_rate: null,
      p_remaining_months: null,
      p_compound_interest: null,
      p_reason: ((formData.get('reason') as string) ?? '').trim() || null,
      p_no_fixed_term: true,
      p_interest_keeps_base: true,
    })
    if (openErr) {
      return { error: `The terms were saved, but their fixed term was not ended from ${amendMonthWords(openFrom)}: ${explainAmendRefusal(openErr.message) ?? openErr.message}` }
    }
  }

  revalidatePath(`/fund-in/${id}`)
  revalidatePath('/fund-in')
  revalidatePath('/repayment-schedule')
  revalidatePath('/dashboard')
  return undefined
}

// ─── 「从某月起生效」 (user 2026-09-21) ────────────────────────────────────────
// Same gate as amendFundSource (Principal), but the months before the chosen
// one keep their old terms — the RPC files them into treasury_terms_history
// and the record carries the new terms from that month (lib/treasury-terms).
// Treasury · Edit without Approve (2026-10-24, the user: "finance manager 可以改条款，但是经过principal approve"):
// the same change is FILED for the Principal (file_terms_change) and applied only once approved in Approvals.
export async function amendFundSourceFrom(formData: FormData): Promise<{ error: string } | undefined> {
  const user = await requireAnyActionOn('/fund-in', ['treasury', 'approve'], ['treasury', 'edit'])
  const refused = await amendFundSourceFromWork(formData, canDo(user, 'treasury', 'approve'))
  if (refused) return refused
  redirect(`/fund-in/${formData.get('fund_source_id') as string}`)
}

async function amendFundSourceFromWork(formData: FormData, direct = true): Promise<{ error: string } | undefined> {
  const supabase = await createClient()

  const id = (formData.get('fund_source_id') as string) ?? ''
  if (!id) return { error: 'Fund source id is required' }
  const fromYM = ((formData.get('effective_from') as string) ?? '').trim()
  if (!/^\d{4}-\d{2}$/.test(fromYM)) return { error: 'Choose the month it takes effect.' }

  const ratePctRaw = ((formData.get('cost_rate_percent') as string) ?? '').trim()
  let rate: number | null = null
  if (ratePctRaw !== '') {
    const ratePct = parseFloat(ratePctRaw)
    if (isNaN(ratePct) || ratePct < 0 || ratePct >= 100) return { error: 'The rate must be from 0 to 100%.' }
    rate = Math.round((ratePct / 100) * 1e6) / 1e6
  }
  const remainingRaw = ((formData.get('remaining_months') as string) ?? '').trim()
  let remaining: number | null = null
  if (remainingRaw !== '') {
    const n = parseInt(remainingRaw, 10)
    if (isNaN(n) || n < 1 || n > 120) return { error: 'The months left are a whole number from 1 to 120, or blank to keep the end month.' }
    remaining = n
  }
  const reason = ((formData.get('reason') as string) ?? '').trim()
  const noFixedTerm = formData.get('no_fixed_term') === 'on'
  const interestOnOriginal = formData.get('interest_on_original') === 'on'
  const interestKeepsBase = formData.get('interest_keeps_base') === 'on'
  if (interestOnOriginal && interestKeepsBase) return { error: 'Choose one amount for the interest to be charged on.' }
  // A fixed amount a month (2026-10-27), and the month the fixed term ends.
  const ppm = principalPerMonthSent(formData)
  if (!ppm.ok) return { error: ppm.error }
  if (ppm.value !== null && (noFixedTerm || remaining !== null)) return { error: 'Choose a fixed amount a month, a number of months or no fixed term — one of them.' }
  const openFrom = openFromSent(formData)
  if (openFrom && noFixedTerm) return { error: 'With no fixed term there is no fixed term to end later.' }
  if (openFrom && openFrom <= fromYM) return { error: `No fixed term from has to come after ${amendMonthWords(fromYM)}, when the new terms start.` }

  if (!direct) {
    const { error: fileErr } = await supabase.rpc('file_terms_change' as never, {
      p_record_kind: 'fund_source',
      p_record_id: id,
      p_effective_from: `${fromYM}-01`,
      p_rate: rate,
      p_remaining_months: noFixedTerm ? null : remaining,
      p_compound_interest: compoundSent(formData),
      p_no_fixed_term: noFixedTerm,
      p_interest_on_original: interestOnOriginal,
      p_interest_keeps_base: interestKeepsBase,
      p_reason: reason || null,
      p_principal_per_month: ppm.value,
      p_open_from: openFrom ? `${openFrom}-01` : null,
    } as never)
    if (fileErr) return { error: `Not submitted: ${explainAmendRefusal(fileErr.message) ?? fileErr.message}` }
    revalidatePath(`/fund-in/${id}`)
    revalidatePath('/fund-in')
    revalidatePath('/approvals')
    return undefined
  }

  // Applied at once is Treasury · Approve's — the RPC asks it too.
  await requireActionOn('/fund-in', 'treasury', 'approve')
  const { error } = await supabase.rpc('amend_fund_source_from', {
    p_fund_source_id: id,
    p_effective_from: `${fromYM}-01`,
    p_cost_rate: rate,
    p_remaining_months: noFixedTerm ? null : remaining,
    // Not sent = as it is (the RPC keeps a null).
    p_compound_interest: compoundSent(formData),
    p_reason: reason || null,
    p_no_fixed_term: noFixedTerm,
    p_interest_on_original: interestOnOriginal,
    p_interest_keeps_base: interestKeepsBase,
    p_principal_per_month: ppm.value,
  })
  if (error) return { error: `Not saved: ${explainAmendRefusal(error.message) ?? error.message}` }
  // No fixed term from a later month: the terms just applied end their fixed term there, the interest kept on the same amount.
  if (openFrom) {
    const { error: openErr } = await supabase.rpc('amend_fund_source_from', {
      p_fund_source_id: id,
      p_effective_from: `${openFrom}-01`,
      p_cost_rate: null,
      p_remaining_months: null,
      p_compound_interest: null,
      p_reason: reason || null,
      p_no_fixed_term: true,
      p_interest_keeps_base: true,
    })
    if (openErr) {
      return { error: `The new terms were applied, but their fixed term was not ended from ${amendMonthWords(openFrom)}: ${explainAmendRefusal(openErr.message) ?? openErr.message}` }
    }
  }

  revalidatePath(`/fund-in/${id}`)
  revalidatePath('/fund-in')
  revalidatePath('/repayment-schedule')
  revalidatePath('/reports/company-statement')
  revalidatePath('/reports/loan-aging')
  revalidatePath('/dashboard')
  return undefined
}

/**
 * Amend terms answered in words (2026-10-16, the Finance phone app's deal):
 * the same gate and work as `amendFundSource` / `amendFundSourceFrom`, without
 * the redirect to the portal's page — the app stays on its own screen.
 */
export async function amendFundSourceInWords(mode: 'from' | 'whole', formData: FormData): Promise<{ ok: true; filed?: boolean } | { ok: false; reason: string }> {
  // Treasury · Edit files either change for the Principal (the whole terms since 2026-10-27); Approve applies it.
  const user = await requireAnyActionOn('/fund-in', ['treasury', 'approve'], ['treasury', 'edit'])
  const direct = canDo(user, 'treasury', 'approve')
  try {
    const refused =
      mode === 'from' ? await amendFundSourceFromWork(formData, direct) : direct ? await amendFundSourceWork(formData) : await fileWholeFundSource(formData)
    return refused ? { ok: false, reason: refused.error } : { ok: true, filed: !direct }
  } catch (e) {
    return { ok: false, reason: e instanceof Error && e.message ? e.message : 'The terms could not be changed.' }
  }
}

/** Withdraw a terms change still waiting for the Principal — whoever filed it, or the Principal (mig 20261025110000). */
export async function withdrawTermsChange(kind: 'loan' | 'fund_source', dealId: string, requestId: string): Promise<{ error: string } | undefined> {
  await requireAnyActionOn(kind === 'loan' ? '/fund-out' : '/fund-in', ['treasury', 'edit'], ['treasury', 'approve'])
  const supabase = await createClient()
  if (!requestId) return { error: 'Request id is required' }
  const { error } = await supabase.rpc('withdraw_terms_change' as never, { p_request_id: requestId } as never)
  if (error) return { error: `The request was not withdrawn: ${error.message}` }
  revalidatePath(kind === 'loan' ? `/fund-out/${dealId}` : `/fund-in/${dealId}`)
  revalidatePath('/approvals')
  return undefined
}

/** Undo the latest 从某月起 change on a loan or fund source (Principal). */
export async function revertTermsChange(
  kind: 'loan' | 'fund_source',
  id: string,
): Promise<{ error: string } | undefined> {
  await requireActionOn(kind === 'loan' ? '/fund-out' : '/fund-in', 'treasury', 'approve')
  const supabase = await createClient()
  if (!id) return { error: 'Record id is required' }
  const { error } = await supabase.rpc('revert_terms_change', { p_record_kind: kind, p_record_id: id })
  if (error) return { error: `The change was not reverted: ${error.message}` }
  revalidatePath(kind === 'loan' ? `/fund-out/${id}` : `/fund-in/${id}`)
  revalidatePath('/repayment-schedule')
  revalidatePath('/reports/company-statement')
  revalidatePath('/reports/loan-aging')
  revalidatePath('/dashboard')
  return undefined
}

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
  const user = await requireActionOn('/fund-in', 'treasury', 'create')
  const id = await createFundSourceInner(formData, user.id)
  sourceCreated()
  redirect(`/fund-in/${id}`)
}

/**
 * The hub's *Record fund in* (2026-10-15, the Finance revamp v2 — D12): the
 * same fund source as the form page's, every rule its own
 * (createFundSourceInner), answered in words instead of a redirect.
 */
export async function createFundSourceFromDialog(formData: FormData): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const user = await requireActionOn('/fund-in', 'treasury', 'create')
  try {
    const id = await createFundSourceInner(formData, user.id)
    sourceCreated()
    return { ok: true, id }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'The fund source could not be saved. Try again.' }
  }
}

/** What *Record fund in* chooses from — the form page's lists, read when the dialog opens (Treasury · Create). */
export async function openRecordFundIn(): Promise<NewSourceOptions> {
  await requireActionOn('/fund-in', 'treasury', 'create')
  return loadNewSourceOptions(await createClient())
}

/**
 * A pending fund source's Edit, its lists (2026-10-16, the Finance phone app's
 * sheet): the accounts it may be owed on and the banks it may land in — what
 * its edit page reads.
 */
export async function openSourceEditOptions(): Promise<Pick<NewSourceOptions, 'accounts' | 'banks'>> {
  await requireActionOn('/fund-in', 'treasury', 'edit')
  const { accounts, banks } = await loadNewSourceOptions(await createClient())
  return { accounts, banks }
}

function sourceCreated() {
  revalidatePath('/fund-in')
  revalidatePath('/approvals')
  revalidatePath('/dashboard')
}

/** Every rule of a new fund source: it checks, files it pending, and queues its approval request. Throws a refusal. */
async function createFundSourceInner(formData: FormData, userId: string): Promise<string> {
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
  // Mig 247: BS account ("Amount due to <party>") the deposit lands in.
  // Optional today (falls back to 4000 Fund Sources Payable at approval time)
  // so legacy data + transitional UI keep working.
  const accountCode = ((formData.get('account_code') as string) ?? '').trim() || null
  // Which HV bank receives the deposit. NULL = primary (approval falls back).
  const bankAccountId = ((formData.get('bank_account_id') as string) ?? '').trim() || null

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
  // Repayment type "A fixed amount a month" (2026-10-27): its periods are what clears the amount at it, the last
  // month taking what is left — no more than the 120 a number of months may be.
  const ppm = principalPerMonthSent(formData)
  if (!ppm.ok) throw new Error(ppm.error)
  if (ppm.value !== null) {
    const months = Math.max(1, Math.ceil(raw.amount / ppm.value - 1e-9))
    if (months > 120) {
      throw new Error(`At RM ${ppm.value.toLocaleString('en-MY', { minimumFractionDigits: 2 })} a month the amount takes ${months} months — the most is 120.`)
    }
    raw.lock_in_months = months
  }
  // Repayment period is OPTIONAL (2026-06-12): blank = 无固定期限. Interest
  // still accrues from the effective date; the deposit lands in the schedule's
  // "Compounding & no fixed term" tab until terms are set via the edit form.
  // Only validate the value when one was actually entered.
  if (!isNaN(raw.lock_in_months) && raw.lock_in_months < 1) {
    throw new Error('Repayment period must be at least 1 month (or leave blank for no fixed term)')
  }
  if (!raw.effective_date) {
    throw new Error('Effective date is required (interest accrues from this date)')
  }
  if (dayjs(raw.effective_date).isAfter(officeToday(), 'day')) {
    throw new Error('Effective date cannot be in the future')
  }
  // Repayment date is OPTIONAL too — only checked when provided.
  if (raw.repayment_date && dayjs(raw.repayment_date).isBefore(dayjs(raw.effective_date), 'day')) {
    throw new Error('Repayment date must be on or after effective date')
  }

  await assertPeriodOpen(supabase, raw.effective_date)

  // ── Balance validation for department_pool ──
  if (raw.source_type === 'department_pool') {
    // Find department_id from from_id, then check dept_pool balance — over
    // every row the pool has ever had, in 1000-row pages (2026-10-08): a
    // balance summed from a read PostgREST stopped at 1000 rows is wrong
    // without a word. A failed read still counts as an empty pool, as before.
    const deptBalance = await fetchAllRows((lo, hi) =>
      supabase
        .from('dept_pools')
        .select('amount, transaction_type')
        .eq('department_id', raw.from_id)
        .order('id')
        .range(lo, hi),
    ).catch(() => null)

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
  // 利滚利 — compound interest, settable at creation (2026-06-12; was edit-only).
  const compound = formData.get('compound_interest') === 'on'
  // 最低还息 — minimum-pay-interest flag, settable at creation (2026-09-04), and the month it is checked from
  // (2026-10-30): a later month's first day, or none — the first instalment.
  const minPayInterest = formData.get('min_pay_interest') === 'on'

  const basePayload = {
    source_type: raw.source_type,
    capital_type: 'paid' as const,
    amount: raw.amount,
    cost_rate,
    compound_interest: compound,
    min_pay_interest: minPayInterest,
    min_pay_interest_from: minPayInterest ? minPayFromDate(formData.get('min_pay_interest_from')) : null,
    // Blank → null (无固定期限). NaN (blank number) is falsy → null.
    lock_in_months: !isNaN(raw.lock_in_months) && raw.lock_in_months >= 1 ? raw.lock_in_months : null,
    principal_per_month: ppm.value,
    effective_date: raw.effective_date,
    repayment_date: raw.repayment_date || null,
    // Its month is also the schedule's first installment month (2026-09-22:
    // before this the New form's date was advisory and the schedule still
    // started the month after the effective date).
    repayment_start_month: raw.repayment_date ? dayjs(raw.repayment_date).startOf('month').format('YYYY-MM-DD') : null,
    account_code: accountCode,
    bank_account_id: bankAccountId,
    // Mig 12 trigger auto-fills maturity_date from effective_date + lock_in_months
    // when a lock-in exists. With no fixed term both stay null; the user-entered
    // repayment_date (when present) seeds maturity so the detail page matches.
    maturity_date: raw.repayment_date || null,
    early_withdrawal: false,
    // Phase 7: starts in pending_approval. Principal approval flips to 'active'
    // and posts the Venture Pool credit + bank balance bump.
    status: 'pending_approval' as const,
    notes: raw.notes ?? null,
    created_by: userId,
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
      submitted_by: userId,
      description: `New fund source: ${typeLabel} — RM ${raw.amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${raw.cost_rate_percent}%/mo`,
      amount: raw.amount,
      status: 'pending' as const,
      workflow_state: 'submitted' as const,
    })

  if (approvalError) {
    // The source just filed is cancelled — what Withdraw leaves of a pending
    // one — never deleted (2026-10-22): fund_sources refuses every session's
    // DELETE (fund_sources_no_delete USING (false)) without an error, so the
    // old .delete() left a source waiting for an approval nobody could see.
    const { data: cancelled, error: cancelErr } = await supabase
      .from('fund_sources')
      .update({ status: 'cancelled' })
      .eq('id', data.id)
      .eq('status', 'pending_approval')
      .select('id')
    const undone = !cancelErr && (cancelled?.length ?? 0) > 0
    throw new Error(`Failed to queue approval: ${approvalError.message.trim().replace(/\.+$/, '')}. ${undone
      ? 'The fund source was cancelled — nothing was booked; record it again.'
      : 'The fund source is left pending and could not be cancelled — withdraw it on its page.'}`)
  }

  return data.id as string
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
  await requireActionOn('/fund-in', 'treasury', 'edit')
  const refused = await updateFundSourceWork(formData)
  if (refused) return refused
  redirect(`/fund-in/${formData.get('id') as string}`)
}

// Only the fields sent are written (lib/fund-source-edit — the forms send what
// was edited, 2026-10-16); the rules are checked on the row as it will stand.
async function updateFundSourceWork(formData: FormData): Promise<FundSourceActionResult> {
  const supabase = await createClient()

  const id = (formData.get('id') as string) ?? ''
  if (!id) return { error: 'Fund source id is required' }

  // Status guard — only pending_approval is editable.
  const { data: current } = await supabase
    .from('fund_sources')
    .select('id, status, source_type, amount, cost_rate, lock_in_months, effective_date, repayment_date')
    .eq('id', id)
    .single()
  if (!current) return { error: 'Fund source not found' }
  if (current.status !== 'pending_approval') {
    return {
      error: `Cannot edit fund source with status "${current.status}" — only pending_approval is editable`,
    }
  }

  const edit = sourceEditPatch(
    {
      amount: Number(current.amount),
      cost_rate: Number(current.cost_rate),
      lock_in_months: (current.lock_in_months as number | null) ?? null,
      effective_date: current.effective_date as string,
      repayment_date: (current.repayment_date as string | null) ?? null,
    },
    formData,
    officeToday(),
    new Date().toISOString(),
  )
  if (!edit.ok) return { error: edit.reason }

  await assertPeriodOpen(supabase, edit.effectiveDate)

  // .select() forces Supabase to return matched rows so we detect the TOCTOU
  // race where Principal approves between our SELECT and UPDATE. Without it,
  // UPDATE matches 0 rows (status no longer pending_approval) and updErr stays
  // null — we'd silently corrupt an already-active fund source.
  const { data: updated, error: updErr } = await supabase
    .from('fund_sources')
    .update(edit.patch)
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
  // updated number in the queue + email/digest descriptions. Mig 243 added
  // an RLS policy so the submitter can UPDATE their own pending approval;
  // before that, this UPDATE silently affected zero rows under finance and
  // the Principal queue kept showing the original (wrong) figure.
  const amount = edit.amount
  if (Number(current.amount) !== amount) {
    const typeLabel =
      current.source_type === 'subsidiary' ? 'subsidiary deposit'
      : current.source_type === 'director_loan' ? 'director loan'
      : 'dept pool transfer'
    const { data: updatedApprovals, error: apprErr } = await supabase
      .from('approval_requests')
      .update({
        description: `New fund source: ${typeLabel} — RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${edit.ratePct}%/mo`,
        amount,
      })
      .eq('reference_id', id)
      .eq('reference_table', 'fund_sources')
      .eq('status', 'pending')
      .select('id')
    if (apprErr) {
      return { error: `Failed to refresh approval queue: ${apprErr.message}` }
    }
    if (!updatedApprovals || updatedApprovals.length === 0) {
      return {
        error:
          'Failed to refresh approval queue (no pending approval matched). ' +
          'The approval may have been actioned mid-edit — refresh the page and try again.',
      }
    }
  }

  revalidatePath(`/fund-in/${id}`)
  revalidatePath('/fund-in')
  revalidatePath('/approvals')
  return undefined
}

/**
 * A pending fund source's Edit answered in words (2026-10-16, the Finance
 * phone app's deal): the same gate and work as `updateFundSource`, without the
 * redirect to the portal's page.
 */
export async function updateFundSourceInWords(formData: FormData): Promise<{ ok: true } | { ok: false; reason: string }> {
  await requireActionOn('/fund-in', 'treasury', 'edit')
  try {
    const refused = await updateFundSourceWork(formData)
    return refused ? { ok: false, reason: refused.error } : { ok: true }
  } catch (e) {
    return { ok: false, reason: e instanceof Error && e.message ? e.message : 'The fund source could not be saved.' }
  }
}

// ─── Withdraw a PENDING fund source (Finance self-service) ───────────────────
// A pending_approval source has moved no money, so the submitter may pull it
// back without Principal: the withdraw_pending_fund_source RPC (SECURITY
// DEFINER, mig 20260724000000) flips it to cancelled AND closes its pending
// approval card in one transaction — Finance's own RLS can't touch
// approval_requests, so this must not be done with inline updates.
export async function withdrawFundSource(id: string): Promise<{ error: string } | undefined> {
  await requireActionOn('/fund-in', 'treasury', 'void')
  const supabase = await createClient()

  if (!id) return { error: 'Fund source id is required' }

  // Return (not throw) so WithdrawButton shows the message inline — a thrown
  // server-action error escalates to the app-wide error page (user hit this
  // when v1 of the RPC tripped no_self_approval).
  const { error } = await supabase.rpc('withdraw_pending_fund_source' as never, {
    p_fund_source_id: id,
  } as never)
  // In English, as the page around it is (2026-10-15 — it read 撤回失败).
  if (error) return { error: `The fund source was not withdrawn: ${error.message}` }

  revalidatePath('/fund-in')
  revalidatePath(`/fund-in/${id}`)
  revalidatePath('/approvals')
  revalidatePath('/dashboard')
  return undefined
}

// ─── Repayment start (Finance self-service, mig 20260724050000) ─────────────
// 2026-10-12 (user: 现在只能选月份不能选日期 → expected repayment 和 repayment
// start date 应该要一样): a date — the first instalment's, every later one on
// its day. The RPC keeps it as the Expected repayment (repayment_date) with its
// month as the start month (p_month carries the whole date).
export async function setFundSourceRepaymentStart(
  id: string,
  date: string
): Promise<{ error: string } | undefined> {
  await requireActionOn('/fund-in', 'treasury', 'edit')
  const supabase = await createClient()

  if (!id) return { error: 'Fund source id is required' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !dayjs(date).isValid()) return { error: 'Pick a date' }

  const { data: source } = await supabase.from('fund_sources').select('effective_date').eq('id', id).maybeSingle()
  if (!source) return { error: 'Fund source not found' }
  const effective = (source as { effective_date: string | null }).effective_date
  if (effective && date < effective) {
    return { error: `The repayment cannot start before the effective date, ${dayjs(effective).format('D MMM YYYY')}` }
  }

  const { error } = await supabase.rpc('set_fund_source_repayment_start' as never, {
    p_fund_source_id: id,
    p_month: date,
  } as never)
  if (error) return { error: `Could not save: ${error.message}` }

  revalidatePath(`/fund-in/${id}`)
  revalidatePath('/fund-in')
  revalidatePath('/dashboard')
  revalidatePath('/reports/loan-aging')
  revalidatePath('/reports/fund-summary')
  revalidatePath('/repayment-schedule')
  return undefined
}

// ─── 最低还息单 toggle (user 2026-09-04) ─────────────────────────────────────
// Flagged = "本金可以慢慢还，但每月利息一定要付". Drives the minimum-interest
// tracking on /repayment-schedule and the note on the company statement.
// Display/tracking metadata only — no GL impact. Turned on from a month (2026-10-30): `from` a later month's
// `YYYY-MM`, or none — the first instalment.
export async function setFundSourceMinPayInterest(
  id: string,
  value: boolean,
  from?: string | null
): Promise<{ error: string } | undefined> {
  await requireActionOn('/fund-in', 'treasury', 'edit')
  const supabase = await createClient()

  if (!id) return { error: 'Fund source id is required' }

  const { error } = await supabase.rpc('set_fund_source_min_pay_interest' as never, {
    p_fund_source_id: id,
    p_value: value,
    p_from: value ? minPayFromDate(from) : null,
  } as never)
  if (error) return { error: `Could not save: ${error.message}` }

  revalidatePath(`/fund-in/${id}`)
  revalidatePath('/repayment-schedule')
  revalidatePath('/reports/company-statement')
  return undefined
}

// Notes are Finance self-service (user 2026-08-06: 「借给: X」 remark drives
// the Company Statement's repay-side badge). Terms amendment stays
// principal-only; this touches notes ONLY, via the mirror RPC.
export async function setFundSourceNotes(
  id: string,
  notes: string
): Promise<{ error: string } | undefined> {
  await requireActionOn('/fund-in', 'treasury', 'edit')
  const supabase = await createClient()

  if (!id) return { error: 'Fund source id is required' }

  const { error } = await supabase.rpc('set_fund_source_notes' as never, {
    p_fund_source_id: id,
    p_notes: notes,
  } as never)
  if (error) return { error: `Could not save: ${error.message}` }

  revalidatePath(`/fund-in/${id}`)
  revalidatePath('/reports/company-statement')
  return undefined
}

// ─── Cancel Fund Source (requires Principal approval) ────────────────────────

export async function cancelFundSource(formData: FormData) {
  const user = await requireActionOn('/fund-in', 'treasury', 'void')
  await fileFundSourceCancel(formData.get('id') as string, user.id)
}

/**
 * The full page's *Request cancellation* (2026-10-15, the Finance revamp v2 —
 * D06's panel): cancelFundSource's request, answered in words, never thrown.
 */
export async function requestFundSourceCancel(id: string): Promise<{ error: string } | undefined> {
  const user = await requireActionOn('/fund-in', 'treasury', 'void')
  try {
    await fileFundSourceCancel(id, user.id)
    return undefined
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'The cancellation was not filed. Try again.' }
  }
}

/** Files an active fund source's cancellation for the Principal (a tier_change request — the type it has always used). Throws a refusal. */
async function fileFundSourceCancel(id: string, userId: string) {
  const supabase = await createClient()
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
      submitted_by: userId,
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
  const user = await requireActionOn('/fund-in', 'treasury', 'edit')
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
  /** The lender's FULL name, for the two-step picker's party button — the
   *  label above abbreviates a company to its short code. */
  lender?: string
  /** 子公司 / 董事 / 部门 / 外部 — a word beside the name on that button. */
  lender_kind?: string
  /** The day the money came in (YYYY-MM-DD) — the picker lists a lender's
   *  deals oldest first. */
  effective_date?: string | null
  /** GL account the source is owed on (fund_sources.account_code, e.g. 4054);
   *  null on legacy rows without one. */
  account_code?: string | null
  /** 'YYYY-MM' the current terms took effect when they changed mid-life
   *  (2026-09-21); the monthly figures above then come from that segment,
   *  re-based on the principal still owed at its first month. */
  terms_from?: string | null
  /** True when this source has zero remaining outstanding but had a principal
   *  repayment in the month passed via opts.includeSettledInMonth. Lets the
   *  schedule render it as a 已付 (done) row in the full-plan view instead of
   *  dropping off entirely once fully repaid. */
  settled_in_month?: boolean
}

export async function listPayableFundSources(
  opts?: { includeSettledInMonth?: string },
): Promise<PayableFundSource[]> {
  await requirePermission('treasury')
  const supabase = await createClient()

  const [
    { data: outstanding },
    { data: sources },
    { data: companies },
    { data: departments },
    { data: directors },
    { data: repayments },
  ] = await Promise.all([
    supabase
      .from('fund_source_outstanding')
      .select('fund_source_id, source_type, from_company_id, from_director_id, from_department_id, original_amount, cost_rate, lock_in_months, outstanding, monthly_payment, total_principal_paid'),
    supabase.from('fund_sources').select('id, status, from_freetext_name, account_code, effective_date, repayment_start_month, compound_interest, terms_effective_from, principal_per_month'),
    supabase.from('companies').select('id, name, short_code'),
    // is_internal=false — the 'Venture Office' pseudo-dept is not a fund source.
    supabase.from('departments').select('id, name').eq('is_internal', false),
    supabase.from('directors').select('id, name'),
    fetchAllRows((lo, hi) => supabase
      .from('fund_source_repayments')
      .select('fund_source_id, payment_type, payment_date, amount')
      .eq('payment_type', 'principal')
      .order('id', { ascending: true })
      .range(lo, hi)).then((data) => ({ data })),
  ])

  const statusMap = new Map((sources ?? []).map((s) => [s.id, s.status]))
  const freetextMap = new Map((sources ?? []).map((s) => [s.id, (s as { from_freetext_name: string | null }).from_freetext_name]))
  // The GL account the source is owed on (4054 / 4058 …) — the repayment PV
  // form defaults its principal row to it (lib/repayment-source-rows).
  const accountMap = new Map((sources ?? []).map((s) => [s.id, (s as { account_code: string | null }).account_code ?? null]))
  const sourceById = new Map((sources ?? []).map((s) => [s.id, s as unknown as { effective_date: string | null; repayment_start_month: string | null; compound_interest: boolean | null; terms_effective_from: string | null; principal_per_month: number | string | null }]))
  // Terms that changed mid-life (2026-09-21): the monthly figures come from
  // the segment in force now, not the day-one terms — as they do for a fixed
  // amount a month (2026-10-27), whose principal the view's equal parts miss.
  const history = await fetchTermsHistory(supabase, 'fund_source', (sources ?? []).map((s) => s.id))
  const principalByMonth = new Map<string, Record<string, number>>()
  for (const r of repayments ?? []) {
    const m = principalByMonth.get(r.fund_source_id) ?? {}
    const k = (r.payment_date as string).slice(0, 7)
    m[k] = Math.round(((m[k] ?? 0) + Number((r as { amount?: number | string }).amount ?? 0)) * 100) / 100
    principalByMonth.set(r.fund_source_id, m)
  }
  const companyMap = new Map((companies ?? []).map((c) => [c.id, c]))
  const departmentMap = new Map((departments ?? []).map((d) => [d.id, d.name]))
  const directorMap = new Map((directors ?? []).map((d) => [d.id, d.name]))

  // Count distinct principal payment months per fund source (periods paid)
  const periodsPaidMap = new Map<string, Set<string>>()
  for (const r of repayments ?? []) {
    const ym = (r.payment_date as string).slice(0, 7)
    const set = periodsPaidMap.get(r.fund_source_id) ?? new Set<string>()
    set.add(ym)
    periodsPaidMap.set(r.fund_source_id, set)
  }

  const settleMonth = opts?.includeSettledInMonth ?? null
  return (outstanding ?? [])
    .filter((o): o is typeof o & { fund_source_id: string; source_type: string } => {
      if (o.fund_source_id == null || o.source_type == null) return false
      const status = statusMap.get(o.fund_source_id)
      if (status === 'active' && Number(o.outstanding) > 0) return true
      // Optionally also surface sources fully repaid (principal paid) in the
      // requested month, so the schedule can show them as a 已付 row even
      // though they now carry zero outstanding.
      if (settleMonth && Number(o.outstanding) <= 0) {
        return periodsPaidMap.get(o.fund_source_id)?.has(settleMonth) ?? false
      }
      return false
    })
    .map((o) => {
      const amount = Number(o.original_amount)
      let rate = Number(o.cost_rate)
      let months = o.lock_in_months ?? 1
      let monthlyPayment = Number(o.monthly_payment)
      let monthlyInterest = months > 0 ? Number((amount * rate).toFixed(2)) : 0
      let monthlyPrincipal = Number((monthlyPayment - monthlyInterest).toFixed(2))
      // Installments are counted in MONEY — principal repaid ÷ one installment —
      // not in months that saw a payment: one payment can cover many. (HC's
      // 300k was paid 22 at once and went on reading "22 of 36 left" beside a
      // balance of one installment, 2026-10-02.) The Loan Monitor's rule. A
      // source with no lock-in has no installments; it keeps the month count,
      // which only orders the list.
      const monthsPaid = periodsPaidMap.get(o.fund_source_id)?.size ?? 0
      let remaining = o.lock_in_months
        ? remainingPeriods(amount, months, Number(o.total_principal_paid ?? 0))
        : Math.max(0, months - monthsPaid)
      let periodsPaid = o.lock_in_months ? months - remaining : monthsPaid
      let termsFrom: string | null = null
      const meta = sourceById.get(o.fund_source_id)
      if (meta) {
        const segs = buildTermsSegments(
          termsForFundSource({ amount, cost_rate: o.cost_rate ?? 0, lock_in_months: o.lock_in_months, compound_interest: meta.compound_interest, effective_date: meta.effective_date, repayment_start_month: meta.repayment_start_month, terms_effective_from: meta.terms_effective_from, principal_per_month: meta.principal_per_month }, history.get(o.fund_source_id) ?? []),
          principalByMonth.get(o.fund_source_id) ?? {},
        )
        if (segmentsGovern(segs)) {
          const seg = currentSegment(segs, officeMonth())
          rate = seg.rate
          months = seg.months ?? months
          // The month's own principal: a fixed amount's last month asks what is left.
          monthlyPrincipal = principalDueIn(seg, officeMonth())
          monthlyInterest = seg.interestPerMonth
          monthlyPayment = Number((monthlyPrincipal + monthlyInterest).toFixed(2))
          remaining = seg.months ? segmentRemainingPeriods(seg, principalPaidSince(principalByMonth.get(o.fund_source_id) ?? {}, seg.fromYM)) : remaining
          periodsPaid = seg.months ? seg.months - remaining : periodsPaid
          termsFrom = termsChanged(segs) ? seg.fromYM : null
        }
      }

      // Mig 194: dept-pool fund sources label by department name (not the
      // "Director" fallback that earlier versions showed for any row without
      // a from_company_id).
      let counterparty: string
      // The same party, spelled out and classified, for the picker (2026-10-02).
      let lender: string
      let lenderKind: string
      if (o.source_type === 'department_pool' && o.from_department_id) {
        counterparty = departmentMap.get(o.from_department_id) ?? 'Department'
        lender = counterparty
        lenderKind = '部门'
      } else if (o.from_company_id) {
        const company = companyMap.get(o.from_company_id)
        counterparty = company ? `${company.short_code ?? company.name}` : 'Company'
        lender = company?.name ?? counterparty
        lenderKind = '子公司'
      } else if (o.from_director_id) {
        counterparty = directorMap.get(o.from_director_id) ?? 'Director'
        lender = counterparty
        lenderKind = '董事'
      } else if (freetextMap.get(o.fund_source_id)) {
        counterparty = freetextMap.get(o.fund_source_id) as string
        lender = counterparty
        lenderKind = '外部'
      } else {
        counterparty = 'Director'
        lender = counterparty
        lenderKind = '董事'
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
        settled_in_month: !(statusMap.get(o.fund_source_id) === 'active' && Number(o.outstanding) > 0),
        account_code: accountMap.get(o.fund_source_id) ?? null,
        terms_from: termsFrom,
        lender,
        lender_kind: lenderKind,
        effective_date: meta?.effective_date ?? null,
      }
    })
    .sort((a, b) => b.remaining_periods - a.remaining_periods)
}
