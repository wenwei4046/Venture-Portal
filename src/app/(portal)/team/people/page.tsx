import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import TeamTabs from '../_components/TeamTabs'
import PeopleDirectory, { type PersonRow, type AccountRow } from './_components/PeopleDirectory'

/**
 * People Management — the roster.
 *
 * The staff table is the master list of people (settled with the user on
 * 2026-09-01), so this page leads with it. Login accounts hang off a person by
 * `user_id`; today not one of the four accounts is attached to anybody, so any
 * account still standing on its own is listed underneath rather than hidden —
 * an unattached account is exactly the thing somebody needs to see and fix.
 */
export default async function PeopleManagementPage() {
  const user = await requirePermission('team')
  const supabase = await createClient()

  const [{ data: staff }, { data: accounts }] = await Promise.all([
    supabase
      .from('hr_staff_costs')
      .select(
        'id, employee_name, employee_code, designation, user_id, status, titles(name), departments(name), users!hr_staff_costs_user_id_fkey(email, is_active)',
      )
      .eq('status', 'active')
      .order('employee_name'),
    supabase.from('users').select('id, name, email, role, is_active').order('name'),
  ])

  void supabase.rpc('log_data_access', {
    p_resource_type: 'hr_staff_costs',
    p_action: 'view',
    p_metadata: { staff_count: staff?.length ?? 0 },
  })

  const rows: PersonRow[] = (staff ?? []).map(s => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const r = s as any
    return {
      id: r.id,
      name: r.employee_name,
      code: r.employee_code ?? null,
      // title_id is authoritative; designation is the free text it was
      // backfilled from and still what the InfoTech import writes.
      title: r.titles?.name ?? r.designation ?? null,
      department: r.departments?.name ?? null,
      accountEmail: r.users?.email ?? null,
      accountActive: r.users?.is_active ?? null,
    }
  })

  const attached = new Set(rows.map(r => r.accountEmail).filter(Boolean))
  const unattached: AccountRow[] = (accounts ?? [])
    .filter(a => !attached.has(a.email))
    .map(a => ({
      id: a.id,
      name: a.name,
      email: a.email,
      role: a.role,
      isActive: a.is_active,
    }))

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TEAM · PEOPLE MANAGEMENT
          </div>
          <h1 className="page-title">People</h1>
          <p className="font-serif italic text-graphite text-base mt-3 max-w-2xl">
            Everyone on the payroll, the title they hold and the department it
            sits under. An account is what lets somebody sign in — most of the
            roster has none yet.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {user.role === 'principal' ? (
            <Link
              href="/team/people/invite"
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-3 py-2 rounded-md transition-colors"
            >
              Invite user
            </Link>
          ) : null}
          <Link
            href="/team/people/import"
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-3 py-2 rounded-md transition-colors"
          >
            Import InfoTech
          </Link>
          <Link
            href="/team/people/new"
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            + Add person
          </Link>
        </div>
      </div>

      <TeamTabs active="people" />

      <PeopleDirectory
        people={rows}
        unattachedAccounts={unattached}
        canSeeActivity={user.role === 'principal'}
      />
    </div>
  )
}
