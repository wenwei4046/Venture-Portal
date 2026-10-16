import { requireAuth } from '@/lib/auth'
import { isPrincipalView } from '@/lib/finance-view'
import { loadMyProfile } from '@/lib/account/actions'
import { loginIsPersonal } from '@/lib/account/personal-login'
import { primedRegistryRows } from '@/lib/dept-registry'
import { readRooms } from '@/lib/rooms/read'
import { startRead } from '@/lib/start-read'
import { appHref } from '@/lib/fin-app/routes'
import { finAccountMenu, visibleAccountMenu } from '@/components/layout/fin-nav'
import ProfileScreen from '@/components/fin-app/ProfileScreen'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/profile` — the Finance app's Profile (2026-10-15, M17): the
 * desktop account menu's rows (`finAccountMenu` — Account for a login of one's
 * own, Admin for whoever opens each page), the profile read only for a
 * personal login, the rooms counted only for whoever may read them.
 */
export default async function FinAppProfile() {
  const user = await requireAuth()
  const personal = (await loginIsPersonal()) === true
  const groups = visibleAccountMenu(finAccountMenu(), { ...user, personalLogin: personal })
  const admin = groups.find((g) => g.title === 'Admin')?.items ?? []
  const roomsRead = admin.some((a) => a.key === 'rooms') ? startRead(readRooms()) : null
  const profile = personal ? await loadMyProfile() : null
  const rooms = roomsRead ? await roomsRead : null
  const departments = primedRegistryRows().length

  const sub: Record<string, string> = {
    audit: 'Every change, who and when',
    depts: `${departments} ${departments === 1 ? 'department' : 'departments'} · pools and heads`,
    rooms: rooms?.ok ? `${rooms.data.length} ${rooms.data.length === 1 ? 'room' : 'rooms'} · bookings` : 'Bookings',
  }

  return (
    <ProfileScreen
      view={isPrincipalView(user) ? 'principal' : 'finance'}
      name={profile?.name ?? user.name ?? (isPrincipalView(user) ? 'Principal' : 'Finance')}
      email={profile?.email ?? user.email ?? ''}
      phone={profile?.phone ?? ''}
      personal={personal}
      admin={admin.map((a) => ({ key: a.key, label: a.label, icon: a.icon, sub: sub[a.key] ?? '', href: appHref(a.key) }))}
      // The views of the one app, for an account that may switch them (as the HR app's More) — never while viewing as a person.
      canSwitch={!!user.canSwitchView && !user.viewingAs}
      // This phone's notifications (2026-10-17 — the Principal's own view lands here now, not on the portal's phone face).
      push={!user.viewingAs}
    />
  )
}
