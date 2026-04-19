'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import type { UserRole } from '@/types'

type Tab = 'overview' | 'history' | 'pnl' | 'request-payment' | 'request-credit'

interface Props {
  basePath: string
  role: UserRole
  isOwnDept: boolean
  // Extra tabs inserted between History and the Request tabs. Used by Marketing
  // for the P&L view; other dept pools don't pass this.
  extraTabs?: { key: Tab; label: string }[]
}

export default function DeptPoolTabs({ basePath, role, isOwnDept, extraTabs }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeTab = (searchParams.get('tab') as Tab | null) ?? 'overview'

  const showRequestTabs = role === 'dept_manager' && isOwnDept

  const tabs: { key: Tab; label: string; href: string }[] = [
    { key: 'overview', label: 'Overview', href: basePath },
    { key: 'history', label: 'History', href: `${basePath}?tab=history` },
  ]
  for (const t of extraTabs ?? []) {
    tabs.push({ key: t.key, label: t.label, href: `${basePath}?tab=${t.key}` })
  }
  if (showRequestTabs) {
    tabs.push(
      { key: 'request-payment', label: 'Request Payment', href: `${basePath}?tab=request-payment` },
      { key: 'request-credit', label: 'Request Credit', href: `${basePath}?tab=request-credit` },
    )
  }

  return (
    <nav className="flex items-center gap-1 border-b border-hairline mb-8" aria-label="Department pool tabs">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key && pathname === basePath
        return (
          <Link
            key={tab.key}
            href={tab.href}
            scroll={false}
            className={
              isActive
                ? 'px-4 py-2.5 -mb-px border-b-2 border-accent text-accent font-serif italic text-sm'
                : 'px-4 py-2.5 -mb-px border-b-2 border-transparent text-graphite hover:text-ink text-sm font-sans'
            }
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
