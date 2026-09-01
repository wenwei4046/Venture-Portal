'use client'

import { useRouter } from 'next/navigation'
import { SlidingTabs, type TabItem } from '@/components/motion/SlidingTabs'

export type TeamTab = 'people' | 'roles'

const HREF: Record<TeamTab, string> = {
  people: '/team/people',
  roles: '/team/roles',
}

/**
 * The Team module's tab rail.
 *
 * Hierarchy joins these two once the global org canvas lands; until it does,
 * an empty tab would be worse than a missing one.
 */
export default function TeamTabs({ active }: { active: TeamTab }) {
  const router = useRouter()

  const items: TabItem[] = [
    { key: 'people', label: 'People Management' },
    { key: 'roles', label: 'Role & Permission' },
  ]

  return (
    <SlidingTabs
      items={items}
      active={active}
      onTabChange={key => router.push(HREF[key as TeamTab])}
    />
  )
}
