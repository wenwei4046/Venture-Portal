'use client'

import { useRef } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@/types'
import { getRoleLabel } from '@/lib/roles'
import { isPrincipalAccount, isMasked } from '@/lib/view-as'
import { setViewAs } from './view-as-actions'
import ThemeToggle from './ThemeToggle'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

interface TopBarProps {
  user: User
}

export default function TopBar({ user }: TopBarProps) {
  const router = useRouter()
  const viewAsFormRef = useRef<HTMLFormElement>(null)
  const principalAccount = isPrincipalAccount(user)
  const masked = isMasked(user)

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

  // The header is a floating chrome panel — a peer of the sidebar rail, same
  // tone and same 10px inset, not a band bolted to the top of the page.
  //
  // It used to carry a bottom rule that stopped dead where the sidebar edge
  // began, leaving an L-shape that never closed. Removing the rule fixed the
  // corner but overshot: on `bg-paper` the header had no definition left at
  // all and dissolved into the page. Giving it the rail's surface resolves
  // both — the chrome now reads as two panels, and nothing has to butt up
  // against anything.
  //
  // Desktop insets by 10px to line up with the rail; mobile stays full-bleed
  // (the rail is off-canvas there) and relies on the tone alone. Inner padding
  // is 22px on md so text lands on the same 32px gutter as the page content
  // below (10px margin + 22px padding).
  return (
    <div className="h-[60px] bg-chrome px-4 md:px-[22px] md:mt-2.5 md:mx-2.5 md:rounded-panel md:border md:border-hairline flex items-center justify-between shrink-0 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {/* The hamburger used to live here. Removed 2026-08-31 when mobile nav
            became a bottom tab bar — the greeting now gets the full width it
            was being squeezed out of ("Good ..." at 390px). */}
        {/* Below sm the greeting clause is dropped rather than truncated: an
            ellipsis eats the name ("Good even…") and the name is the half that
            carries meaning. */}
        {/* pr-1: `truncate` clips overflow, and the name renders in italic —
            without the gutter the final letter's tail is shaved off. */}
        <div className="font-serif text-[18px] md:text-[20px] text-ink truncate leading-none pr-1">
          <span className="hidden sm:inline">{greeting}, </span>
          <span className="italic text-accent">{displayName}</span>
          <span className="hidden sm:inline">.</span>
        </div>
      </div>

      <div className="flex items-center gap-4 md:gap-5 shrink-0">
        {/* View-as switcher — Principal account only. Flips the entire
            app-layer experience (sidebar, gates, buttons) to the chosen
            role; auth identity stays the Principal. Always visible (also on
            mobile) so a masked session can switch back anywhere. */}
        {principalAccount ? (
          <form
            ref={viewAsFormRef}
            action={setViewAs}
            className="inline-flex items-baseline gap-1.5"
            title="Switch the whole portal to another role's view — you stay signed in as Principal"
          >
            <span
              aria-hidden
              className={`w-[5px] h-[5px] rounded-full inline-block translate-y-[-2px] ${masked ? 'bg-alert' : 'bg-ledger'}`}
            />
            <select
              key={user.role}
              name="role"
              defaultValue={user.role}
              onChange={() => viewAsFormRef.current?.requestSubmit()}
              aria-label="View portal as role"
              className="bg-transparent font-serif italic text-[13.5px] text-graphite hover:text-accent cursor-pointer focus:outline-none"
            >
              <option value="principal">Principal</option>
              <option value="finance">Finance view</option>
              <option value="hr">HR view</option>
            </select>
          </form>
        ) : null}
        <div className="hidden sm:flex items-baseline gap-3 font-mono text-[11px] text-muted tracking-[0.02em]">
          {!principalAccount ? (
            <span className="inline-flex items-baseline gap-1.5 font-serif italic text-[13.5px] text-graphite">
              <span aria-hidden className="w-[5px] h-[5px] rounded-full bg-ledger inline-block translate-y-[-2px]" />
              {getRoleLabel(user.role)}
            </span>
          ) : null}
          <span>{dateLabel}</span>
          <span className="text-muted/70">·</span>
          <span>{quarter}</span>
        </div>
        <ThemeToggle />
        {/* Sign out is in the More sheet on mobile — repeating it here cost
            ~90px of header width and truncated the greeting to "Good even…". */}
        <button
          onClick={handleSignOut}
          className="hidden md:inline font-sans text-[11px] text-muted hover:text-accent transition-colors uppercase tracking-[0.1em]"
          aria-label="Sign out"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
