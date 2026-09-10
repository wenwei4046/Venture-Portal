import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import PeopleDirectory, { type PersonRow, type AccountRow } from './_components/PeopleDirectory'

/** Cast once, at the boundary — the revenue side's convention, see
 *  `revenue/_components/config/load.ts`. */
function untypedRows<T>(data: unknown): T[] {
  return (data ?? []) as T[]
}

/**
 * One open commission position, with the rank it is placed on. PostgREST
 * hands an embedded row back as an object or as a one-element array
 * depending on how it reads the relationship, so both are unwrapped (again,
 * load.ts does the same).
 */
interface OpenPosition {
  staff_id: string
  scheme_id: string
  comm_ranks:
    | { label: string; product_rate: number | string }
    | { label: string; product_rate: number | string }[]
    | null
  /** The sub-department's age decides which position the roster shows: the oldest is home. */
  comm_schemes:
    | { comm_sub_departments: { created_at: string } | { created_at: string }[] | null }
    | Array<{ comm_sub_departments: { created_at: string } | { created_at: string }[] | null }>
    | null
}

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

  const [{ data: staff }, { data: accounts }, { data: levels }, positions] = await Promise.all([
    supabase
      .from('hr_staff_costs')
      // Every status, not just 'active'. Deactivating somebody used to remove
      // them from the only page that lists people, which left no way back
      // except the database — the roster filters by status instead.
      .select(
        'id, employee_name, employee_code, designation, user_id, status, resignation_date, nric, bank_account_no, hire_date, titles(name, level_id), departments(name), users!hr_staff_costs_user_id_fkey(email, is_active, last_seen_at)',
      )
      .order('employee_name'),
    supabase.from('users').select('id, name, email, role, is_active').order('name'),
    // The ladder: inside each department the roster reads from the top down.
    supabase.from('title_levels').select('id, rank, name'),
    // Everybody's OPEN commission position, for the Rank column. The comm_*
    // tables postdate database.types.ts, so this goes through the untyped
    // client the revenue side already uses.
    //
    // Deliberately not fatal. /team/people is reachable by every title holding
    // `team`, and the commission tables answer only to `revenue` — a Finance
    // reader losing the entire roster because RLS refused one embedded select
    // would be the wrong trade by a mile. The refusal costs the Rank column
    // and nothing else: every row reads a dash.
    (supabase as unknown as SupabaseClient)
      .from('comm_hierarchy')
      .select('staff_id, scheme_id, comm_ranks (label, product_rate), comm_schemes (comm_sub_departments (created_at))')
      .is('effective_to', null)
      .then(
        r => r.data,
        () => null,
      ),
  ])

  const rungs = new Map(
    ((levels ?? []) as Array<{ id: string; rank: number; name: string }>).map(l => [l.id, l]),
  )

  // A person may hold one position per sub-department (2026-09-10). The roster
  // shows the HOME one — the department's oldest sub-department, the one the
  // company title belongs to — so the rows are sorted by that sub-department's
  // age and the first position per person wins. `product_rate` comes out of
  // Postgres as numeric-as-string; Number() it here so nothing downstream has
  // to wonder.
  const rankByStaff = new Map<string, { label: string; rate: number }>()
  const createdAt = (pos: OpenPosition): string => {
    const scheme = Array.isArray(pos.comm_schemes) ? (pos.comm_schemes[0] ?? null) : pos.comm_schemes
    const sub = Array.isArray(scheme?.comm_sub_departments)
      ? (scheme?.comm_sub_departments[0] ?? null)
      : (scheme?.comm_sub_departments ?? null)
    return sub?.created_at ?? '9999'
  }
  for (const pos of [...untypedRows<OpenPosition>(positions)].sort((a, b) => createdAt(a).localeCompare(createdAt(b)))) {
    if (rankByStaff.has(pos.staff_id)) continue
    const rank = Array.isArray(pos.comm_ranks) ? (pos.comm_ranks[0] ?? null) : pos.comm_ranks
    if (rank) {
      rankByStaff.set(pos.staff_id, { label: rank.label, rate: Number(rank.product_rate) })
    }
  }

  void supabase.rpc('log_data_access', {
    p_resource_type: 'hr_staff_costs',
    p_action: 'view',
    p_metadata: { staff_count: staff?.length ?? 0 },
  })

  const rows: PersonRow[] = (staff ?? []).map(s => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const r = s as any
    const active = r.status !== 'inactive'
    const rung = r.titles?.level_id ? (rungs.get(r.titles.level_id) ?? null) : null
    const rank = rankByStaff.get(r.id) ?? null
    return {
      id: r.id,
      name: r.employee_name,
      code: r.employee_code ?? null,
      // title_id is authoritative; designation is the free text it was
      // backfilled from and still what the InfoTech import writes.
      title: r.titles?.name ?? r.designation ?? null,
      levelRank: rung?.rank ?? null,
      levelName: rung?.name ?? null,
      rankLabel: rank?.label ?? null,
      rankRate: rank?.rate ?? null,
      department: r.departments?.name ?? null,
      active,
      resignedOn: r.resignation_date ?? null,
      accountEmail: r.users?.email ?? null,
      accountActive: r.users?.is_active ?? null,
      lastSeenAt: r.users?.last_seen_at ?? null,
      // The three fields whose absence breaks something downstream: payroll
      // needs an NRIC for the statutory files and an account number to pay
      // into, and the InfoTech import matches on the hire date. Only asked of
      // people still employed — a resigned row missing a bank account is not
      // a chore anybody has to do.
      missing: active
        ? [
            !r.nric && 'NRIC',
            !r.bank_account_no && 'bank account',
            !r.hire_date && 'hire date',
          ].filter((x): x is string => typeof x === 'string')
        : [],
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
            <em>I.</em> PEOPLE · MANAGEMENT
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

      <PeopleDirectory
        people={rows}
        unattachedAccounts={unattached}
        canSeeActivity={user.role === 'principal'}
      />
    </div>
  )
}
