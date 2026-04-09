'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import type { CompanyTier, OverdueConfigStage } from '@/types'

// ─── Treasury Config (op_margin, buffer_amount, saving_rate) ──────────────────

export async function updateTreasuryConfig(formData: FormData) {
  const user = await requireRole(['principal'])
  const supabase = await createClient()

  const opMarginPercent = parseFloat((formData.get('op_margin') as string) ?? '0')
  const bufferAmount = parseFloat((formData.get('buffer_amount') as string) ?? '0')
  const savingRatePercent = parseFloat((formData.get('saving_rate') as string) ?? '0')

  // Input validation
  if (isNaN(opMarginPercent) || opMarginPercent < 0 || opMarginPercent >= 100) {
    throw new Error('Op Margin must be between 0 and 100%')
  }
  if (isNaN(bufferAmount) || bufferAmount < 0) {
    throw new Error('Buffer Amount must be non-negative')
  }
  if (isNaN(savingRatePercent) || savingRatePercent < 0 || savingRatePercent >= 100) {
    throw new Error('Saving Rate must be between 0 and 100%')
  }

  // Convert percent values (0-100) to decimal (0-1) for storage
  const updates: Array<{ key: string; value: number }> = [
    { key: 'op_margin', value: opMarginPercent / 100 },
    { key: 'buffer_amount', value: bufferAmount },
    { key: 'saving_rate', value: savingRatePercent / 100 },
  ]

  for (const { key, value } of updates) {
    const { error } = await supabase
      .from('treasury_config')
      .update({ config_value: value, updated_by: user.id })
      .eq('config_key', key)
    if (error) throw new Error(`Failed to update ${key}: ${error.message}`)
  }

  revalidatePath('/settings')
}

// ─── Tier Premiums (T1-T4) ────────────────────────────────────────────────────

export async function updateTierPremiums(formData: FormData) {
  const user = await requireRole(['principal'])
  const supabase = await createClient()

  const tiers: CompanyTier[] = ['T1', 'T2', 'T3', 'T4']

  for (const tier of tiers) {
    const raw = formData.get(`tier_${tier}`) as string | null
    if (!raw) continue

    const percent = parseFloat(raw)
    if (isNaN(percent) || percent < 0 || percent >= 100) {
      throw new Error(`Tier ${tier} premium must be between 0 and 100%`)
    }

    const { error } = await supabase
      .from('tier_config')
      .update({ premium_rate: percent / 100, updated_by: user.id })
      .eq('tier', tier)
    if (error) throw new Error(`Failed to update tier ${tier}: ${error.message}`)
  }

  revalidatePath('/settings')
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

// ─── Company Tier Assignment ──────────────────────────────────────────────────

export async function updateCompanyTier(formData: FormData) {
  const user = await requireRole(['principal'])
  const supabase = await createClient()

  const companyId = formData.get('company_id') as string
  const tier = formData.get('tier') as CompanyTier

  if (!companyId) throw new Error('Company id is required')
  if (!['T1', 'T2', 'T3', 'T4'].includes(tier)) {
    throw new Error('Invalid tier')
  }

  const { error } = await supabase
    .from('companies')
    .update({ tier, updated_at: new Date().toISOString() })
    .eq('id', companyId)

  if (error) throw new Error(`Failed to update company tier: ${error.message}`)

  // Audit note: tier changes are significant — CEO review Exp 6 recommended
  // tracking tier history. Phase 1.5 will add a company_tier_history table.
  void user

  revalidatePath('/settings')
}
