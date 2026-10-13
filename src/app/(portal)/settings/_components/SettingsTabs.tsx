'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { SlidingTabs, type TabItem } from '@/components/motion/SlidingTabs'

export type SettingsTab =
  | 'treasury'
  | 'splits'
  | 'directors'
  | 'companies'
  | 'departments'
  | 'banks'
  | 'accounts'
  | 'periods'
  | 'simulator'

const ALL_TABS: TabItem[] = [
  { key: 'treasury', label: 'Treasury' },
  // Overdue went with the Overdue page (2026-10-14, user: 一起拿掉).
  { key: 'splits', label: 'Splits' },
  { key: 'directors', label: 'Directors' },
  { key: 'companies', label: 'Companies' },
  { key: 'departments', label: 'Departments' },
  { key: 'banks', label: 'Bank Accounts' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'periods', label: 'Periods' },
  { key: 'simulator', label: 'Simulator' },
]

// Finance sees Accounts (the unified COA) + Departments (add-only, 2026-08-24)
// — every other Settings tab is Principal-only (treasury config, period locks,
// base rate simulator, splits).
const FINANCE_TABS: SettingsTab[] = ['accounts', 'departments']

export function isSettingsTab(s: string | undefined): s is SettingsTab {
  return !!s && ALL_TABS.some((t) => t.key === s)
}

export default function SettingsTabs({ active, allTabs = false }: { active: SettingsTab; allTabs?: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const allowed = allTabs ? null : FINANCE_TABS
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
