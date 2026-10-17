'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

type Tab = 'overview' | 'history' | 'pnl'

interface Props {
  basePath: string
  // Extra tabs after History. Used for the P&L view. (The department's own Request Payment / Request Credit tabs —
  // the Dept Manager's — went with the kind, 2026-10-17.)
  extraTabs?: { key: Tab; label: string }[]
}

export default function DeptPoolTabs({ basePath, extraTabs }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeTab = (searchParams.get('tab') as Tab | null) ?? 'overview'

  const tabs: { key: Tab; label: string; href: string }[] = [
    { key: 'overview', label: 'Overview', href: basePath },
    { key: 'history', label: 'History', href: `${basePath}?tab=history` },
  ]
  for (const t of extraTabs ?? []) {
    tabs.push({ key: t.key, label: t.label, href: `${basePath}?tab=${t.key}` })
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
