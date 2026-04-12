'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { SlidingTabs, type TabItem } from '@/components/motion/SlidingTabs'

export type SettingsTab =
  | 'treasury'
  | 'tiers'
  | 'overdue'
  | 'splits'
  | 'directors'
  | 'simulator'

const TABS: TabItem[] = [
  { key: 'treasury', label: 'Treasury' },
  { key: 'tiers', label: 'Tiers' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'splits', label: 'Splits' },
  { key: 'directors', label: 'Directors' },
  { key: 'simulator', label: 'Simulator' },
]

export function isSettingsTab(s: string | undefined): s is SettingsTab {
  return !!s && TABS.some((t) => t.key === s)
}

export default function SettingsTabs({ active }: { active: SettingsTab }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleTabChange(key: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', key)
    router.push(`/settings?${params.toString()}`)
  }

  return <SlidingTabs items={TABS} active={active} onTabChange={handleTabChange} />
}
