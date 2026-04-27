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
  | 'banks'
  | 'categories'
  | 'periods'
  | 'simulator'

const ALL_TABS: TabItem[] = [
  { key: 'treasury', label: 'Treasury' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'splits', label: 'Splits' },
  { key: 'directors', label: 'Directors' },
  { key: 'companies', label: 'Companies' },
  { key: 'banks', label: 'Bank Accounts' },
  { key: 'categories', label: 'Categories' },
  { key: 'periods', label: 'Periods' },
  { key: 'simulator', label: 'Simulator' },
]

// Finance only sees Categories — every other Settings tab is Principal-only
// (treasury config, period locks, base rate simulator, dept splits, etc.)
const FINANCE_TABS: SettingsTab[] = ['categories']

export function isSettingsTab(s: string | undefined): s is SettingsTab {
  return !!s && ALL_TABS.some((t) => t.key === s)
}

export default function SettingsTabs({ active, role }: { active: SettingsTab; role?: UserRole }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const tabs = role === 'finance'
    ? ALL_TABS.filter((t) => FINANCE_TABS.includes(t.key as SettingsTab))
    : ALL_TABS

  function handleTabChange(key: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', key)
    router.push(`/settings?${params.toString()}`)
  }

  return <SlidingTabs items={tabs} active={active} onTabChange={handleTabChange} />
}
