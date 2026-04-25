import { Suspense } from 'react'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { TreasuryConfig, OverdueConfig, Company } from '@/types'
import TreasuryConfigSection from './_components/TreasuryConfigSection'
import OverdueStagesSection from './_components/OverdueStagesSection'
import RentSplitSection from './_components/RentSplitSection'
import UtilitySplitSection from './_components/UtilitySplitSection'
import DirectorSalarySection from './_components/DirectorSalarySection'
import BaseRateSimulator from './_components/BaseRateSimulator'
import BankAccountsSection from './_components/BankAccountsSection'
import CompaniesSection from './_components/CompaniesSection'
import PeriodsSection from './_components/PeriodsSection'
import SettingsTabs, { type SettingsTab } from './_components/SettingsTabs'

const VALID_TABS: SettingsTab[] = ['treasury', 'overdue', 'splits', 'directors', 'companies', 'banks', 'periods', 'simulator']
function isValidTab(s: string | undefined): s is SettingsTab {
  return !!s && (VALID_TABS as string[]).includes(s)
}

interface SplitRow {
  id: string
  company_id: string | null
  is_hv_share: boolean
  split_pct: number
}

interface Props {
  searchParams: Promise<{ tab?: string }>
}

export default async function SettingsPage({ searchParams }: Props) {
  await requireRole(['principal'])

  const { tab: rawTab } = await searchParams
  const activeTab: SettingsTab = isValidTab(rawTab) ? rawTab : 'treasury'

  const supabase = await createClient()

  const [
    { data: treasuryRows },
    { data: overdueRows },
    { data: companyRows },
    { data: rentRows },
    { data: utilityRows },
    { data: directorRows },
    { data: fundSourceRows },
    { data: latestBaseRate },
    { data: bankAccountRows },
    { data: periodLockRows },
  ] = await Promise.all([
    supabase.from('treasury_config').select('*'),
    supabase.from('overdue_config').select('*'),
    supabase.from('companies').select('*').order('short_code'),
    supabase.from('rent_splits').select('id, company_id, is_hv_share, split_pct'),
    supabase.from('utility_splits').select('id, company_id, is_hv_share, split_pct'),
    supabase.from('directors').select('id, code, name, weightage, min_payout').eq('status', 'active').order('code'),
    supabase.from('fund_sources').select('amount, cost_rate').eq('status', 'active'),
    supabase.from('base_rate_history').select('weighted_cost, op_margin, base_rate').order('approved_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('bank_accounts').select('*').order('is_primary', { ascending: false }),
    supabase.from('period_locks').select('period_month, is_locked, closed_at, notes').order('period_month', { ascending: false }),
  ])

  const treasury = (treasuryRows ?? []) as TreasuryConfig[]
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
  const savingRate = Number(
    treasury.find((r) => r.config_key === 'saving_rate')?.config_value ?? 0
  )

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> ADMIN · CONFIGURATION
          </div>
          <h1 className="page-title">Settings</h1>
        </div>
      </div>

      <Suspense fallback={null}>
        <SettingsTabs active={activeTab} />
      </Suspense>

      {activeTab === 'treasury' && (
        <TreasuryConfigSection
          opMargin={opMargin}
          savingRate={savingRate}
        />
      )}

      {activeTab === 'overdue' && (
        <OverdueStagesSection stages={overdueStages} />
      )}

      {activeTab === 'splits' && (
        <div className="space-y-6">
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
      )}

      {activeTab === 'directors' && (
        <DirectorSalarySection
          directors={(directorRows ?? []).map((d) => ({
            id: d.id,
            code: d.code,
            name: d.name ?? d.code,
            weightage: Number(d.weightage),
            min_payout: Number(d.min_payout),
          }))}
        />
      )}

      {activeTab === 'companies' && (
        <CompaniesSection
          companies={companies.map((c) => ({
            id: c.id,
            name: c.name,
            short_code: c.short_code,
            is_active: c.is_active,
          }))}
        />
      )}

      {activeTab === 'banks' && (
        <BankAccountsSection
          accounts={(bankAccountRows ?? []).map((a) => ({
            id: a.id,
            bank_name: a.bank_name,
            account_number: a.account_number,
            account_holder: a.account_holder,
            account_type: a.account_type,
            is_primary: a.is_primary,
            current_balance: Number(a.current_balance),
            opening_balance: Number(a.opening_balance),
            gl_account_code: a.gl_account_code,
            status: a.status,
            notes: a.notes,
          }))}
        />
      )}

      {activeTab === 'periods' && (
        <PeriodsSection
          locks={(periodLockRows ?? []).map((l) => ({
            period_month: l.period_month,
            is_locked: l.is_locked,
            closed_at: l.closed_at,
            notes: l.notes,
          }))}
        />
      )}

      {activeTab === 'simulator' && (
        <BaseRateSimulator
          currentPaidCapital={(fundSourceRows ?? []).reduce((s, f) => s + Number(f.amount), 0)}
          currentWeightedCost={Number(latestBaseRate?.weighted_cost ?? 0)}
          opMargin={Number(latestBaseRate?.op_margin ?? opMargin)}
          currentBaseRate={Number(latestBaseRate?.base_rate ?? 0)}
        />
      )}
    </div>
  )
}
