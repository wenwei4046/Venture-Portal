'use client'

import { usePathname, useRouter } from 'next/navigation'
import { financePageTitle } from '@/lib/finance-view'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@/types'
import { getRoleLabel } from '@/lib/roles'
import { officeClock } from '@/lib/office-clock'
import PortalViewSwitcher from './PortalViewSwitcher'
import { useNavOwner } from './nav-owner'
import ThemeToggle from './ThemeToggle'

interface TopBarProps {
  user: User
  /** The Finance view (2026-10-09): on a phone the bar is the handoff's — an
   *  H tile, the role, the page's name. The desktop bar is unchanged. */
  fin?: boolean
}

export default function TopBar({ user, fin = false }: TopBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  // A receipt is Receipt's though it opens under /payments (2026-10-10).
  const owner = useNavOwner(pathname)
  // Ultimate full access (`view_switch`, 2026-10-08) — the Principal role
  // used to be the test, which Full access now shares without the switcher.
  const canSwitchView = user.canSwitchView === true

  const handleSignOut = async () => {
    const supabase = createClient()
    // This device only. Given no options supabase-js signs out 'global' —
    // every session of the account, on every phone and PC — and the shared
    // accounts are switched on the office PC several times a day (2026-10-08).
    await supabase.auth.signOut({ scope: 'local' })
    router.push('/login')
    router.refresh()
  }

  const clock = officeClock()
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
    <>
    {fin ? (
      <div data-testid="fin-topbar" className="fin-topbar md:hidden">
        <span className="fin-topbar-tile" aria-hidden>H</span>
        <span className="fin-topbar-text">
          <span className="fin-topbar-kicker">{getRoleLabel(user.role)}</span>
          <span className="fin-topbar-page">{owner?.title ?? (financePageTitle(pathname) || 'Overview')}</span>
        </span>
        <span className="ml-auto flex items-center gap-3">
          {canSwitchView ? <PortalViewSwitcher value={user.role} /> : null}
          <ThemeToggle />
        </span>
      </div>
    ) : null}
    <div className={`h-[60px] bg-chrome px-4 md:px-[22px] md:mt-2.5 md:mx-2.5 md:rounded-panel md:border md:border-hairline ${fin ? 'hidden md:flex' : 'flex'} items-center justify-between shrink-0 gap-3`}>
      <div className="flex items-center gap-3 min-w-0">
        {/* The hamburger used to live here. Removed 2026-08-31 when mobile nav
            became a bottom tab bar — the greeting now gets the full width it
            was being squeezed out of ("Good ..." at 390px). */}
        {/* Below sm the greeting clause is dropped rather than truncated: an
            ellipsis eats the name ("Good even…") and the name is the half that
            carries meaning. */}
        <div className="font-sans text-[13px] font-normal text-ink truncate leading-none pr-1">
          {/* suppressHydrationWarning covers the sliver the fixed zone cannot:
              server and client render the same string unless the request and
              the hydration land either side of an hour boundary, which is a
              sub-second window. Scoped to the clock, never to anything else. */}
          <span className="hidden sm:inline" suppressHydrationWarning>
            {clock.greeting},{' '}
          </span>
          <span className="text-accent">{displayName}</span>
          <span className="hidden sm:inline">.</span>
        </div>
      </div>

      <div className="flex items-center gap-4 md:gap-5 shrink-0">
        {/* View-as switcher — Ultimate full access only. Flips the entire
            app-layer experience (sidebar, gates, buttons) to the chosen
            role; auth identity stays the Principal. Always visible (also on
            mobile) so a masked session can switch back anywhere. */}
        {canSwitchView ? <PortalViewSwitcher value={user.role} /> : null}
        <div className="hidden sm:flex items-baseline gap-3 font-mono text-[11px] text-muted tracking-[0.02em]">
          {!canSwitchView ? (
            <span className="inline-flex items-baseline gap-1.5 font-sans font-normal text-[13.5px] text-graphite">
              <span aria-hidden className="w-[5px] h-[5px] rounded-full bg-ledger inline-block translate-y-[-2px]" />
              {getRoleLabel(user.role)}
            </span>
          ) : null}
          <span suppressHydrationWarning>{clock.date}</span>
          <span className="text-muted/70">·</span>
          <span suppressHydrationWarning>{clock.quarter}</span>
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
    </>
  )
}
