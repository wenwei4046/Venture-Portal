'use client'

import { useRouter } from 'next/navigation'
import { SlidingTabs, type TabItem } from '@/components/motion/SlidingTabs'

export type TeamTab = 'people' | 'hierarchy' | 'roles'

const HREF: Record<TeamTab, string> = {
  people: '/team/people',
  hierarchy: '/team/hierarchy',
  roles: '/team/roles',
}

/** The Team module's tab rail. */
export default function TeamTabs({ active }: { active: TeamTab }) {
  const router = useRouter()

  const items: TabItem[] = [
    { key: 'people', label: 'People Management' },
    { key: 'hierarchy', label: 'Hierarchy' },
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
