import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { TreasuryConfig, TierConfig, OverdueConfig, Company } from '@/types'
import TreasuryConfigSection from './_components/TreasuryConfigSection'
import TierPremiumSection from './_components/TierPremiumSection'
import OverdueStagesSection from './_components/OverdueStagesSection'
import CompanyTierSection from './_components/CompanyTierSection'
import RentSplitSection from './_components/RentSplitSection'
import UtilitySplitSection from './_components/UtilitySplitSection'

interface SplitRow {
  id: string
  company_id: string | null
  is_hv_share: boolean
  split_pct: number
}

export default async function SettingsPage() {
  await requireRole(['principal'])

  const supabase = await createClient()

  const [
    { data: treasuryRows },
    { data: tierRows },
    { data: overdueRows },
    { data: companyRows },
    { data: rentRows },
    { data: utilityRows },
  ] = await Promise.all([
    supabase.from('treasury_config').select('*'),
    supabase.from('tier_config').select('*'),
    supabase.from('overdue_config').select('*'),
    supabase.from('companies').select('*').order('short_code'),
    supabase.from('rent_splits').select('id, company_id, is_hv_share, split_pct'),
    supabase.from('utility_splits').select('id, company_id, is_hv_share, split_pct'),
  ])

  const treasury = (treasuryRows ?? []) as TreasuryConfig[]
  const tiers = (tierRows ?? []) as TierConfig[]
  const overdueStages = (overdueRows ?? []) as OverdueConfig[]
  const companies = (companyRows ?? []) as Company[]
  const rentSplits = ((rentRows ?? []) as SplitRow[]).map((r) => ({
    id: r.id,
    company_id: r.company_id,
    is_hv_share: r.is_hv_share,
    split_pct: Number(r.split_pct),
  }))
  const utilitySplits = ((utilityRows ?? []) as SplitRow[]).map((r) => ({
    id: r.id,
    company_id: r.company_id,
    is_hv_share: r.is_hv_share,
    split_pct: Number(r.split_pct),
  }))

  const opMargin = Number(treasury.find((r) => r.config_key === 'op_margin')?.config_value ?? 0)
  const bufferAmount = Number(
    treasury.find((r) => r.config_key === 'buffer_amount')?.config_value ?? 0
  )
  const savingRate = Number(
    treasury.find((r) => r.config_key === 'saving_rate')?.config_value ?? 0
  )

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-serif text-3xl text-ink">Settings</h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          Treasury config, tier premiums, overdue stages, and{' '}
          <em>company tier assignment</em>. Principal only.
        </p>
      </div>

      <div className="space-y-6">
        <TreasuryConfigSection
          opMargin={opMargin}
          bufferAmount={bufferAmount}
          savingRate={savingRate}
        />

        <TierPremiumSection tiers={tiers} />

        <OverdueStagesSection stages={overdueStages} />

        <CompanyTierSection companies={companies} />

        <RentSplitSection
          companies={companies.map((c) => ({
            id: c.id,
            name: c.name,
            short_code: c.short_code,
          }))}
          initial={rentSplits}
        />

        <UtilitySplitSection
          companies={companies.map((c) => ({
            id: c.id,
            name: c.name,
            short_code: c.short_code,
          }))}
          initial={utilitySplits}
        />
      </div>
    </div>
  )
}
