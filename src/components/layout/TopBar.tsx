'use client'

import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@/types'
import { getRoleLabel } from '@/lib/roles'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function TopBar({ user }: { user: User }) {
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const greeting = getGreeting()
  const now = dayjs()
  const dateLabel = now.format('ddd D MMM YYYY')
  const quarter = `Q${Math.floor(now.month() / 3) + 1} ${now.year()}`
  const displayName = user.name || getRoleLabel(user.role)

  return (
    <div className="h-[60px] bg-paper border-b border-hairline px-8 flex items-baseline justify-between shrink-0">
      <div className="font-serif text-[15px] text-graphite">
        {greeting}, <span className="italic text-accent">{displayName}</span>.
      </div>

      <div className="flex items-baseline gap-6">
        <div className="font-mono text-xs text-muted">
          {dateLabel} · {quarter}
        </div>
        <button
          onClick={handleSignOut}
          className="text-xs text-muted hover:text-accent font-sans transition-colors"
          aria-label="Sign out"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
