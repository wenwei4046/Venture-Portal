import { Suspense } from 'react'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/paginate'
import type { TreasuryConfig, OverdueConfig, Company } from '@/types'
import type { AccountType, CashFlowCategory } from '@/lib/coa'
import TreasuryConfigSection from './_components/TreasuryConfigSection'
import OverdueStagesSection from './_components/OverdueStagesSection'
import RentSplitSection from './_components/RentSplitSection'
import UtilitySplitSection from './_components/UtilitySplitSection'
import DirectorSalarySection from './_components/DirectorSalarySection'
import BaseRateSimulator from './_components/BaseRateSimulator'
import BankAccountsSection from './_components/BankAccountsSection'
import CompaniesSection from './_components/CompaniesSection'
import DepartmentsSection from './_components/DepartmentsSection'
import AccountsSection from './_components/AccountsSection'
import PeriodsSection from './_components/PeriodsSection'
import SettingsTabs, { type SettingsTab } from './_components/SettingsTabs'

const VALID_TABS: SettingsTab[] = ['treasury', 'overdue', 'splits', 'directors', 'companies', 'departments', 'banks', 'accounts', 'periods', 'simulator']
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
  // Finance is allowed in for the Categories tabs only — every other tab
  // re-checks role inside the conditional below and renders nothing otherwise.
  // SettingsTabs hides the disallowed tabs from the rail.
  //
  // HR is no longer admitted at all: Commission and Product List moved out
  // (user 2026-08-31) and they were the only reason HR was ever here. They now
  // live under /revenue — the Revenue Department's own group (2026-09-01).
  const user = await requirePermission('categories')
  const isPrincipal = user.role === 'principal'

  const { tab: rawTab } = await searchParams
  const defaultTab: SettingsTab = isPrincipal ? 'treasury' : 'accounts'
  const activeTab: SettingsTab = isValidTab(rawTab) ? rawTab : defaultTab

  // Someone hitting a tab they are not allowed on via a direct URL falls back
  // to their own default. Mirrors FINANCE_TABS in SettingsTabs.
  const allowedTabs: SettingsTab[] | null = isPrincipal ? null : ['accounts', 'departments']
  const activeTabResolved: SettingsTab =
    allowedTabs && !allowedTabs.includes(activeTab) ? defaultTab : activeTab

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
    { data: accountRows },
    { data: departmentRows },
  ] = await Promise.all([
    supabase.from('treasury_config').select('*'),
    supabase.from('overdue_config').select('*'),
    supabase.from('companies').select('*').order('short_code'),
    supabase.from('rent_splits').select('id, company_id, is_hv_share, split_pct'),
    supabase.from('utility_splits').select('id, company_id, is_hv_share, split_pct'),
    supabase.from('directors').select('id, code, name, weightage, min_payout').eq('status', 'active').order('code'),
    fetchAllRows((lo, hi) => supabase.from('fund_sources').select('amount, cost_rate').eq('status', 'active').order('id', { ascending: true }).range(lo, hi)).then((data) => ({ data })),
    supabase.from('base_rate_history').select('weighted_cost, op_margin, base_rate').order('approved_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('bank_accounts').select('*').order('is_primary', { ascending: false }),
    supabase.from('period_locks').select('period_month, is_locked, closed_at, notes').order('period_month', { ascending: false }),
    supabase
      .from('chart_of_accounts')
      .select('code, name, type, cash_flow_category, parent_code, is_active, sort_order')
      .order('type')
      .order('sort_order')
      .order('code'),
    supabase.from('departments').select('id, name, is_internal, created_at, segment_key, pool_gl_code, billing_mode_key').order('created_at'),
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
            ar_account_code: (c as { ar_account_code?: string | null }).ar_account_code ?? null,
          }))}
          arAccounts={(accountRows ?? [])
            .filter((a) => (a as { parent_code: string | null }).parent_code === '3030' && a.is_active)
            .map((a) => ({ code: a.code as string, name: a.name as string }))}
        />
      )}

      {activeTabResolved === 'departments' && (
        <DepartmentsSection
          departments={(departmentRows ?? []).map((d) => ({
            id: d.id as string,
            name: d.name as string,
            is_internal: Boolean(d.is_internal),
            created_at: (d.created_at as string | null) ?? null,
            segment_key: ((d as { segment_key?: string | null }).segment_key as string | null) ?? null,
            pool_gl_code: ((d as { pool_gl_code?: string | null }).pool_gl_code as string | null) ?? null,
            billing_mode_key: ((d as { billing_mode_key?: string | null }).billing_mode_key as string | null) ?? null,
            own_share_billback: Boolean((d as { own_share_billback?: boolean }).own_share_billback),
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

      {activeTabResolved === 'accounts' && (
        <AccountsSection
          accounts={(accountRows ?? []).map((a) => ({
            code: a.code,
            name: a.name,
            type: a.type as AccountType,
            cash_flow_category: a.cash_flow_category as CashFlowCategory,
            parent_code: (a as { parent_code: string | null }).parent_code ?? null,
            is_active: a.is_active,
            sort_order: a.sort_order,
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
