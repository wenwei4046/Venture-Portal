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
import CategoriesSection from './_components/CategoriesSection'
import PeriodsSection from './_components/PeriodsSection'
import SettingsTabs, { type SettingsTab } from './_components/SettingsTabs'

const VALID_TABS: SettingsTab[] = ['treasury', 'overdue', 'splits', 'directors', 'companies', 'banks', 'categories', 'periods', 'simulator']
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
  // Finance is allowed in for the Categories tab only — every other tab
  // re-checks role inside the conditional below and renders nothing for
  // non-Principal. SettingsTabs hides the disallowed tabs from the rail.
  const user = await requireRole(['principal', 'finance'])
  const isPrincipal = user.role === 'principal'

  const { tab: rawTab } = await searchParams
  const defaultTab: SettingsTab = isPrincipal ? 'treasury' : 'categories'
  const activeTab: SettingsTab = isValidTab(rawTab) ? rawTab : defaultTab

  // Finance hitting a Principal-only tab via direct URL falls back to Categories.
  const activeTabResolved: SettingsTab = !isPrincipal && activeTab !== 'categories'
    ? 'categories'
    : activeTab

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
    { data: categoryRows },
    { data: glRows },
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
    supabase.from('payment_categories').select('code, label, account_type, gl_account_code, is_active').order('sort_order').order('label'),
    supabase.from('chart_of_accounts').select('code, name, type').eq('is_active', true).order('code'),
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
        <SettingsTabs active={activeTabResolved} role={user.role} />
      </Suspense>

      {activeTabResolved === 'treasury' && (
        <TreasuryConfigSection
          opMargin={opMargin}
          savingRate={savingRate}
        />
      )}

      {activeTabResolved === 'overdue' && (
        <OverdueStagesSection stages={overdueStages} />
      )}

      {activeTabResolved === 'splits' && (
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

      {activeTabResolved === 'directors' && (
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

      {activeTabResolved === 'companies' && (
        <CompaniesSection
          companies={companies.map((c) => ({
            id: c.id,
            name: c.name,
            short_code: c.short_code,
            is_active: c.is_active,
          }))}
        />
      )}

      {activeTabResolved === 'banks' && (
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

      {activeTabResolved === 'categories' && (
        <CategoriesSection
          categories={(categoryRows ?? []).map((c) => ({
            code: c.code,
            label: c.label,
            account_type: c.account_type as 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | null,
            gl_account_code: c.gl_account_code,
            is_active: c.is_active,
          }))}
          glAccounts={(glRows ?? []).map((g) => ({
            code: g.code,
            name: g.name,
            type: g.type as 'asset' | 'liability' | 'equity' | 'revenue' | 'expense',
          }))}
        />
      )}

      {activeTabResolved === 'periods' && (
        <PeriodsSection
          locks={(periodLockRows ?? []).map((l) => ({
            period_month: l.period_month,
            is_locked: l.is_locked,
            closed_at: l.closed_at,
            notes: l.notes,
          }))}
        />
      )}

      {activeTabResolved === 'simulator' && (
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
