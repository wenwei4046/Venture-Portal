'use client'

import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@/types'
import { getRoleLabel } from '@/lib/roles'
import ThemeToggle from './ThemeToggle'

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
    <div className="h-[60px] bg-paper border-b border-hairline px-4 md:px-8 flex items-baseline justify-between shrink-0 gap-3">
      <div className="flex items-baseline gap-3 min-w-0">
        {/* Hamburger — mobile only */}
        {onMenuClick ? (
          <button
            type="button"
            onClick={onMenuClick}
            className="md:hidden text-graphite hover:text-ink p-1 -ml-1 self-center"
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
        <div className="font-serif text-[18px] md:text-[20px] text-ink truncate leading-none">
          {greeting}, <span className="italic text-accent">{displayName}</span>.
        </div>
      </div>

      <div className="flex items-baseline gap-4 md:gap-5 shrink-0">
        <div className="hidden sm:flex items-baseline gap-3 font-mono text-[11px] text-muted tracking-[0.02em]">
          <span className="inline-flex items-baseline gap-1.5 font-serif italic text-[13.5px] text-graphite">
            <span aria-hidden className="w-[5px] h-[5px] rounded-full bg-ledger inline-block translate-y-[-2px]" />
            {getRoleLabel(user.role)}
          </span>
          <span>{dateLabel}</span>
          <span className="text-muted/70">·</span>
          <span>{quarter}</span>
        </div>
        <ThemeToggle />
        <button
          onClick={handleSignOut}
          className="font-sans text-[11px] text-muted hover:text-accent transition-colors uppercase tracking-[0.1em]"
          aria-label="Sign out"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
