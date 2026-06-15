'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import {
  ACCOUNT_TYPES,
  CASH_FLOW_CATEGORIES,
  defaultCashFlowCategoryFor,
  type AccountType,
  type CashFlowCategory,
} from '@/lib/coa'
import type { OverdueConfigStage } from '@/types'

// ─── Treasury Config (op_margin, saving_rate) ────────────────────────────────

export async function updateTreasuryConfig(formData: FormData) {
  const user = await requireRole(['principal'])
  const supabase = await createClient()

  const opMarginPercent = parseFloat((formData.get('op_margin') as string) ?? '0')
  const savingRatePercent = parseFloat((formData.get('saving_rate') as string) ?? '0')

  // Input validation
  if (isNaN(opMarginPercent) || opMarginPercent < 0 || opMarginPercent >= 100) {
    throw new Error('Op Margin must be between 0 and 100%')
  }
  if (isNaN(savingRatePercent) || savingRatePercent < 0 || savingRatePercent >= 100) {
    throw new Error('Saving Rate must be between 0 and 100%')
  }

  // Convert percent values (0-100) to decimal (0-1) for storage
  const opMarginDecimal = opMarginPercent / 100
  const updates: Array<{ key: string; value: number }> = [
    { key: 'op_margin', value: opMarginDecimal },
    { key: 'saving_rate', value: savingRatePercent / 100 },
  ]

  // Detect if op_margin actually changed so we only refresh base_rate_history
  // when the live rate would shift. Saving the form unchanged shouldn't
  // generate noise rows.
  const { data: existingOp } = await supabase
    .from('treasury_config')
    .select('config_value')
    .eq('config_key', 'op_margin')
    .maybeSingle()
  const opMarginChanged =
    existingOp == null ||
    Math.abs(Number(existingOp.config_value ?? 0) - opMarginDecimal) > 1e-9

  for (const { key, value } of updates) {
    const { error } = await supabase
      .from('treasury_config')
      .update({ config_value: value, updated_by: user.id })
      .eq('config_key', key)
    if (error) throw new Error(`Failed to update ${key}: ${error.message}`)
  }

  // Item 2: keep base_rate_history in sync with Settings. Without this, the
  // fund-out form keeps reading the stale approved snapshot and the user sees
  // 0.3% even after setting op_margin to 0. Principal is the gate for both
  // Settings and base rate, so we auto-approve here.
  if (opMarginChanged) {
    const { error: rateErr } = await supabase.rpc('refresh_base_rate', {
      p_op_margin: opMarginDecimal,
    })
    if (rateErr) {
      throw new Error(
        `Treasury config saved but base rate refresh failed: ${rateErr.message}`
      )
    }
  }

  revalidatePath('/settings')
  revalidatePath('/fund-out/new')
  revalidatePath('/dashboard')
}

// ─── Overdue Stages (grace / late_1 / late_2 / escalation) ────────────────────

export async function updateOverdueStages(formData: FormData) {
  const user = await requireRole(['principal'])
  const supabase = await createClient()

  const stages: OverdueConfigStage[] = ['grace', 'late_1', 'late_2', 'escalation']

  for (const stage of stages) {
    const daysFromRaw = formData.get(`${stage}_days_from`) as string | null
    const daysToRaw = formData.get(`${stage}_days_to`) as string | null
    const penaltyRaw = formData.get(`${stage}_penalty`) as string | null

    if (daysFromRaw === null || penaltyRaw === null) continue

    const daysFrom = parseInt(daysFromRaw, 10)
    const daysTo = daysToRaw && daysToRaw !== '' ? parseInt(daysToRaw, 10) : null
    const penaltyPercent = parseFloat(penaltyRaw)

    if (isNaN(daysFrom) || daysFrom < 0) {
      throw new Error(`${stage}: days from must be a non-negative integer`)
    }
    if (daysTo !== null && (isNaN(daysTo) || daysTo < daysFrom)) {
      throw new Error(`${stage}: days to must be >= days from`)
    }
    if (isNaN(penaltyPercent) || penaltyPercent < 0 || penaltyPercent >= 100) {
      throw new Error(`${stage}: penalty rate must be between 0 and 100%`)
    }

    const { error } = await supabase
      .from('overdue_config')
      .update({
        days_from: daysFrom,
        days_to: daysTo,
        penalty_rate: penaltyPercent / 100,
        updated_by: user.id,
      })
      .eq('stage', stage)
    if (error) throw new Error(`Failed to update ${stage}: ${error.message}`)
  }

  revalidatePath('/settings')
}

// ─── Rent / Utility Splits (Phase 2 Step 8) ──────────────────────────────────

interface SplitInput {
  id?: string
  company_id: string | null
  is_hv_share: boolean
  split_pct: number
}

async function upsertSplits(
  kind: 'rent' | 'utility',
  formData: FormData
): Promise<void> {
  const user = await requireRole(['principal'])
  const supabase = await createClient()

  const rawPayload = formData.get('splits') as string | null
  if (!rawPayload) throw new Error('splits payload is required')

  let splits: SplitInput[]
  try {
    const parsed = JSON.parse(rawPayload)
    if (!Array.isArray(parsed)) throw new Error('Payload must be an array')
    splits = parsed as SplitInput[]
  } catch {
    throw new Error('Invalid splits payload JSON')
  }

  // Validate total = 1.0 (allow small rounding tolerance)
  const total = splits.reduce((acc, s) => acc + Number(s.split_pct ?? 0), 0)
  if (Math.abs(total - 1) > 0.0001) {
    throw new Error(
      `${kind} splits must total 100%. Current total: ${(total * 100).toFixed(4)}%`
    )
  }

  // Validate at most one HV share row
  const hvRows = splits.filter((s) => s.is_hv_share)
  if (hvRows.length > 1) {
    throw new Error(`Only one HV share row allowed for ${kind}`)
  }
  for (const hv of hvRows) {
    if (hv.company_id !== null) {
      throw new Error('HV share row must have company_id = null')
    }
  }

  const table = kind === 'rent' ? 'rent_splits' : 'utility_splits'

  // Simple approach: delete all existing rows + insert the new payload.
  // Triggers the log_config_change audit for each UPDATE — for DELETE +
  // INSERT we lose fine-grained diff granularity in this pass but the
  // overall "what was the split on date X" is still reconstructible via
  // the changed_at ordering. A smarter upsert-by-company_id could use
  // UPDATE where matched, but for a small settings table this is fine.
  const { error: deleteErr } = await supabase.from(table).delete().neq(
    'id',
    '00000000-0000-0000-0000-000000000000'
  )
  if (deleteErr) {
    throw new Error(`Failed to clear ${kind} splits: ${deleteErr.message}`)
  }

  const rows = splits.map((s) => ({
    company_id: s.is_hv_share ? null : s.company_id,
    is_hv_share: s.is_hv_share,
    split_pct: s.split_pct,
    updated_by: user.id,
  }))

  if (rows.length === 0) {
    revalidatePath('/settings')
    return
  }

  const { error: insertErr } = await supabase.from(table).insert(rows)
  if (insertErr) {
    throw new Error(`Failed to insert ${kind} splits: ${insertErr.message}`)
  }

  revalidatePath('/settings')
  revalidatePath('/billing')
}

export async function updateRentSplits(formData: FormData) {
  await upsertSplits('rent', formData)
}

export async function updateUtilitySplits(formData: FormData) {
  await upsertSplits('utility', formData)
}

// ─── Director Salary Config ────────────────────────────────────────

export async function updateDirectorConfig(
  updates: { id: string; weightage: number; min_payout: number }[]
) {
  await requireRole(['principal'])
  const supabase = await createClient()

  for (const u of updates) {
    const { error } = await supabase
      .from('directors')
      .update({ weightage: u.weightage, min_payout: u.min_payout })
      .eq('id', u.id)

    if (error) throw new Error(`Failed to update director: ${error.message}`)
  }

  revalidatePath('/settings')
  revalidatePath('/director-salary')
}

// ─── Period Closing (Principal only) ────────────────────────────────────────

export async function closePeriod(formData: FormData) {
  const user = await requireRole(['principal'])
  const supabase = await createClient()

  const periodMonth = formData.get('period_month') as string
  if (!periodMonth) throw new Error('Period month is required')

  const notes = (formData.get('notes') as string) || null

  const { error } = await supabase
    .from('period_locks')
    .upsert(
      {
        period_month: periodMonth,
        closed_by: user.id,
        closed_at: new Date().toISOString(),
        is_locked: true,
        notes,
      },
      { onConflict: 'period_month' }
    )

  if (error) throw new Error(`Failed to close period: ${error.message}`)

  revalidatePath('/settings')
}

export async function reopenPeriod(formData: FormData) {
  const user = await requireRole(['principal'])
  const supabase = await createClient()

  const periodMonth = formData.get('period_month') as string
  if (!periodMonth) throw new Error('Period month is required')

  const { error } = await supabase
    .from('period_locks')
    .update({
      is_locked: false,
      reopened_by: user.id,
      reopened_at: new Date().toISOString(),
    })
    .eq('period_month', periodMonth)
    .eq('is_locked', true)

  if (error) throw new Error(`Failed to reopen period: ${error.message}`)

  revalidatePath('/settings')
}

// ─── Company Management (add / edit / toggle active) ─────────────────────────

export async function addCompany(formData: FormData) {
  await requireRole(['principal'])
  const supabase = await createClient()

  const name = (formData.get('name') as string)?.trim()
  const shortCode = (formData.get('short_code') as string)?.trim().toUpperCase()

  if (!name) throw new Error('Company name is required')
  if (!shortCode || shortCode.length > 10) throw new Error('Short code is required (max 10 chars)')

  const { error } = await supabase.from('companies').insert({
    name,
    short_code: shortCode,
    is_active: true,
  })

  if (error) {
    if (error.code === '23505') throw new Error(`Short code "${shortCode}" already exists`)
    throw new Error(`Failed to add company: ${error.message}`)
  }

  revalidatePath('/settings')
}

export async function updateCompany(formData: FormData) {
  await requireRole(['principal'])
  const supabase = await createClient()

  const id = formData.get('id') as string
  const name = (formData.get('name') as string)?.trim()
  const shortCode = (formData.get('short_code') as string)?.trim().toUpperCase()

  if (!id) throw new Error('Company ID is required')
  if (!name) throw new Error('Company name is required')
  if (!shortCode || shortCode.length > 10) throw new Error('Short code is required (max 10 chars)')

  const { error } = await supabase
    .from('companies')
    .update({ name, short_code: shortCode, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    if (error.code === '23505') throw new Error(`Short code "${shortCode}" already exists`)
    throw new Error(`Failed to update company: ${error.message}`)
  }

  revalidatePath('/settings')
}

export async function toggleCompanyActive(formData: FormData) {
  await requireRole(['principal'])
  const supabase = await createClient()

  const id = formData.get('id') as string
  const isActive = formData.get('is_active') === 'true'

  if (!id) throw new Error('Company ID is required')

  const { error } = await supabase
    .from('companies')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(`Failed to update company: ${error.message}`)

  revalidatePath('/settings')
}

// ─── Chart of Accounts (unified COA, mig 237/238) ────────────────────────────
// Replaces the old createPaymentCategory / updatePaymentCategory pair. The COA
// IS the GL now, so creating an "account" inserts directly into
// chart_of_accounts. The code is auto-allocated by the next_account_code RPC
// so users can't pick a colliding number.

export type AccountActionResult = { error?: string; message?: string } | undefined

export async function createAccount(formData: FormData): Promise<AccountActionResult> {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const type = ((formData.get('type') as string) ?? '').trim() as AccountType
  const name = ((formData.get('name') as string) ?? '').trim()
  const rawCfc = ((formData.get('cash_flow_category') as string) ?? '').trim()
  // Mig 246: optional parent. Must exist and have the same type — the
  // coa_enforce_parent_type trigger will fail the insert otherwise.
  const rawParent = ((formData.get('parent_code') as string) ?? '').trim()
  const parentCode = rawParent === '' ? null : rawParent

  if (!type || !ACCOUNT_TYPES.includes(type)) {
    return { error: 'Invalid account type' }
  }
  if (!name) return { error: 'Account name is required' }

  const cashFlowCategory: CashFlowCategory =
    rawCfc && CASH_FLOW_CATEGORIES.includes(rawCfc as CashFlowCategory)
      ? (rawCfc as CashFlowCategory)
      : defaultCashFlowCategoryFor(type)

  // Atomic code allocation via SECURITY DEFINER RPC.
  const { data: code, error: rpcErr } = await supabase.rpc('next_account_code', {
    p_type: type,
  })
  if (rpcErr || !code) {
    return { error: `Failed to generate code: ${rpcErr?.message ?? 'unknown'}` }
  }

  const { error } = await supabase.from('chart_of_accounts').insert({
    code,
    name,
    type,
    cash_flow_category: cashFlowCategory,
    parent_code: parentCode,
  })
  if (error) return { error: `Failed to create account: ${error.message}` }

  revalidatePath('/settings')
  revalidatePath('/payments/new')
}

// Drag-and-drop reparenting: move an account under another parent (or detach
// with an empty parent). Same-type + no-cycle + posted-parent rules are all
// enforced by DB triggers (migs 246 / 256 / 20260611000000) — their messages
// surface as the error.
export async function moveAccount(formData: FormData): Promise<AccountActionResult> {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const code = ((formData.get('code') as string) ?? '').trim()
  const rawParent = ((formData.get('parent_code') as string) ?? '').trim()
  if (!code) return { error: 'Account code is required' }
  if (rawParent === code) return { error: 'An account cannot be its own parent' }

  const { error } = await supabase
    .from('chart_of_accounts')
    .update({ parent_code: rawParent === '' ? null : rawParent })
    .eq('code', code)
  if (error) return { error: `Move failed: ${error.message}` }

  revalidatePath('/settings')
  revalidatePath('/payments/new')
}

export async function updateAccount(formData: FormData): Promise<AccountActionResult> {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const code = ((formData.get('code') as string) ?? '').trim()
  const name = ((formData.get('name') as string) ?? '').trim()
  const rawCfc = ((formData.get('cash_flow_category') as string) ?? '').trim()
  const isActive =
    formData.get('is_active') === 'on' || formData.get('is_active') === 'true'
  // Mig 246: editable parent. Form always sends the field (empty string = detach).
  // Whether the form sent it is detectable via .has(); guard so legacy
  // callers that omit it don't unintentionally null out parent_code.
  const sentParent = formData.has('parent_code')
  const rawParent = ((formData.get('parent_code') as string) ?? '').trim()
  const parentCode = rawParent === '' ? null : rawParent

  if (!code) return { error: 'Account code is required' }
  if (!name) return { error: 'Account name is required' }

  // Type change (mig 20260612080000): a new type forces the code into the new
  // range, so change_account_type allocates a fresh code there and re-points
  // ALL history. Runs FIRST so a same-call code rename / cfc / parent edit
  // applies to the resulting new code. Mutually exclusive with new_code in
  // practice (the type change picks the code).
  const rawNewType = ((formData.get('new_type') as string) ?? '').trim()
  let typedCode = code
  let typeNote = ''
  if (rawNewType) {
    const { data: cur } = await supabase
      .from('chart_of_accounts')
      .select('type')
      .eq('code', code)
      .maybeSingle()
    if (cur && cur.type !== rawNewType) {
      const { data: res, error: typeErr } = await supabase.rpc('change_account_type' as never, {
        p_old: code,
        p_new_type: rawNewType,
      } as never)
      if (typeErr) return { error: `Type change failed: ${typeErr.message}` }
      const r = (res ?? {}) as { new_code?: string; repointed?: Record<string, number> }
      typedCode = r.new_code ?? code
      const moved = Object.entries(r.repointed ?? {})
        .filter(([, n]) => Number(n) > 0)
        .map(([k, n]) => `${k}: ${n}`)
        .join(', ')
      typeNote = `Type → ${rawNewType}, code ${code} → ${typedCode}.${moved ? ` Re-pointed — ${moved}.` : ''}`
    }
  }
  // After a type change the working code is the new one; a code rename in the
  // same submit applies on top of it (rare, but consistent).
  const baseCode = typedCode

  // Code rename (mig 20260612070000): the rename_account_code RPC clones the
  // row under the new code and re-points EVERY historical reference
  // (journal_lines, PV sources, bank GL codes, fund sources, invoice/credit
  // note/statement category codes, children) in one transaction. The rest of
  // this update then applies to the NEW code.
  const rawNewCode = ((formData.get('new_code') as string) ?? '').trim()
  let effectiveCode = baseCode
  let renameNote = ''
  // A type change already moved the code; only honor an explicit rename if it
  // targets something different from where the type change landed.
  if (rawNewCode && rawNewCode !== baseCode && !rawNewType) {
    const { data: counts, error: renameErr } = await supabase.rpc('rename_account_code' as never, {
      p_old: baseCode,
      p_new: rawNewCode,
    } as never)
    if (renameErr) return { error: `Rename failed: ${renameErr.message}` }
    effectiveCode = rawNewCode
    const c = (counts ?? {}) as Record<string, number>
    const moved = Object.entries(c)
      .filter(([, n]) => Number(n) > 0)
      .map(([k, n]) => `${k}: ${n}`)
      .join(', ')
    renameNote = `Code ${code} → ${rawNewCode}.${moved ? ` Re-pointed — ${moved}.` : ' No historical rows referenced it.'}`
  }

  // type + code are immutable post-create. name / cash_flow_category /
  // is_active / parent_code are editable. parent_code rejection (same-type,
  // no cycles) is enforced by the coa_enforce_parent_type trigger from
  // mig 246 — we just pass the value through.
  const updates: {
    name: string
    is_active: boolean
    cash_flow_category?: CashFlowCategory
    parent_code?: string | null
  } = { name, is_active: isActive }
  if (rawCfc) {
    if (!CASH_FLOW_CATEGORIES.includes(rawCfc as CashFlowCategory)) {
      return { error: 'Invalid cash flow category' }
    }
    updates.cash_flow_category = rawCfc as CashFlowCategory
  }
  // On a type change the RPC already detached the parent (the old parent is
  // the old type — a cross-type parent is rejected). Don't re-apply the form's
  // stale parent; leave the account top-level for the user to re-home.
  if (sentParent && !rawNewType) {
    updates.parent_code = parentCode
  }

  const { error } = await supabase
    .from('chart_of_accounts')
    .update(updates)
    .eq('code', effectiveCode)
  if (error) return { error: `Failed to update account: ${error.message}` }

  revalidatePath('/settings')
  revalidatePath('/payments/new')
  const note = [typeNote, renameNote].filter(Boolean).join(' ')
  if (note) return { message: note }
}
