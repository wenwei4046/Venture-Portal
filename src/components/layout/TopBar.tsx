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

interface TopBarProps {
  user: User
  onMenuClick?: () => void
}

export default function TopBar({ user, onMenuClick }: TopBarProps) {
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
    <div className="h-[60px] bg-paper border-b border-hairline px-4 md:px-8 flex items-center md:items-baseline justify-between shrink-0 gap-3">
      <div className="flex items-center md:items-baseline gap-3 min-w-0">
        {/* Hamburger — mobile only */}
        {onMenuClick ? (
          <button
            type="button"
            onClick={onMenuClick}
            className="md:hidden text-graphite hover:text-ink p-1 -ml-1"
            aria-label="Open navigation"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>
        ) : null}
        <div className="font-serif text-[15px] text-graphite truncate">
          {greeting}, <span className="italic text-accent">{displayName}</span>.
        </div>
      </div>

      <div className="flex items-baseline gap-4 md:gap-6 shrink-0">
        <div className="hidden sm:block font-mono text-xs text-muted">
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
