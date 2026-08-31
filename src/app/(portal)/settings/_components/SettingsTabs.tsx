'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { SlidingTabs, type TabItem } from '@/components/motion/SlidingTabs'
import type { UserRole } from '@/types'

export type SettingsTab =
  | 'treasury'
  | 'overdue'
  | 'splits'
  | 'directors'
  | 'companies'
  | 'departments'
  | 'banks'
  | 'accounts'
  | 'periods'
  | 'simulator'
  | 'commission'
  | 'products'

const ALL_TABS: TabItem[] = [
  { key: 'treasury', label: 'Treasury' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'splits', label: 'Splits' },
  { key: 'directors', label: 'Directors' },
  { key: 'companies', label: 'Companies' },
  { key: 'departments', label: 'Departments' },
  { key: 'banks', label: 'Bank Accounts' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'periods', label: 'Periods' },
  { key: 'simulator', label: 'Simulator' },
  { key: 'commission', label: 'Commission' },
  { key: 'products', label: 'Product List' },
]

// Finance sees Accounts (the unified COA) + Departments (add-only, 2026-08-24)
// — every other Settings tab is Principal-only (treasury config, period locks,
// base rate simulator, splits).
const FINANCE_TABS: SettingsTab[] = ['accounts', 'departments']

// HR runs the commission payroll, so they configure its rules — but not what a
// product COSTS, which stays with the Principal (user 2026-08-31).
const HR_TABS: SettingsTab[] = ['commission']

export function isSettingsTab(s: string | undefined): s is SettingsTab {
  return !!s && ALL_TABS.some((t) => t.key === s)
}

export default function SettingsTabs({ active, role }: { active: SettingsTab; role?: UserRole }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const allowed =
    role === 'finance' ? FINANCE_TABS : role === 'hr' ? HR_TABS : null
  const tabs = allowed
    ? ALL_TABS.filter((t) => allowed.includes(t.key as SettingsTab))
    : ALL_TABS

  function handleTabChange(key: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', key)
    router.push(`/settings?${params.toString()}`)
  }

  return <SlidingTabs items={tabs} active={active} onTabChange={handleTabChange} />
}
