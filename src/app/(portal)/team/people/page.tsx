import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { can } from '@/lib/permissions'
import { hasTab } from '@/lib/page-tabs'
import { readStaffPrivate } from '@/lib/private-fields'
import { onFile } from '@/lib/sensitive'
import { readDirectory, readsStaffTable } from '@/lib/team-directory'
import { loadPermissionsData, type PermissionsData } from '../_lib/permission-templates'
import type { PersonRow, AccountRow } from './_components/PeopleDirectory'
import type { InviteCandidate, PendingInvite } from './_components/InviteDialog'
import PeopleManagement from './_components/PeopleManagement'
import { fullAccessHeld, fullAccessTemplate, pendingLogins } from '@/lib/invite'
import { fullNameOf } from '@/lib/person-name'
import { officeToday } from '@/lib/office-time'
import { employmentStatusOf, statusChip } from '@/lib/employment-status'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

/** A roster row, whichever way it was read: the staff table, or the directory (PR4b). */
interface RosterRow {
  id: string
  employee_name: string
  /** The two the apps call them by (2026-10-17) — the roster lists them as one full name. The directory has neither. */
  first_name?: string | null
  last_name?: string | null
  employee_code: string | null
  designation: string | null
  user_id: string | null
  status: string | null
  resignation_date: string | null
  hire_date: string | null
  /** Probation, Permanent or Part time, a probation's last day and its reminder's acknowledgement (2026-10-23) — the
   *  staff table's; the directory has none, and its readers' chip reads Active as before. */
  employment_status?: string | null
  probation_end?: string | null
  probation_ack_end?: string | null
  title_id: string | null
  reports_to: string | null
  titles: { name: string; level_id: string | null; template_id: string | null } | null
  departments: { name: string } | null
  users: { email: string; is_active: boolean; last_seen_at: string | null } | null
}

/** Nothing to draw a template from: the directory's readers never see the Permissions tab. */
const NO_PERMISSIONS: PermissionsData = { functions: [], cellKeys: [], templates: [], titles: [], logins: [] }

/**
 * People Management — the roster, and a tab over, the permission templates
 * (2026-10-08, the Claude Design handoff: Permissions merged in from its own
 * page; Invite user became a drawer here).
 *
 * The staff table is the master list of people (settled with the user on
 * 2026-09-01), so this page leads with it. Login accounts hang off a person by
 * `user_id`; today not one of the four accounts is attached to anybody, so any
 * account still standing on its own is listed underneath rather than hidden —
 * an unattached account is exactly the thing somebody needs to see and fix.
 */
export default async function PeopleManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; invite?: string }>
}) {
  await requirePage('/team/people')
  // The roster's own key — or Team · View without the Salary tick, which reads
  // it through the directory instead of the table (2026-10-10, PR4b).
  const user = await requirePermission('team', 'team_directory')
  const supabase = await createClient()
  const params = await searchParams
  if (!readsStaffTable(user)) return <DirectoryPeople supabase={supabase} user={user} />
  const canInvite = canDo(user, 'accounts', 'create') && hasTab(user.tabs, 'hr.permissions', 'create')

  const [{ data: staff }, { data: accounts }, { data: levels }, positions, permissions, privateFields, invites] = await Promise.all([
    supabase
      .from('hr_staff_costs')
      // Every status, not just 'active'. Deactivating somebody used to remove
      // them from the only page that lists people, which left no way back
      // except the database — the roster filters by status instead.
      .select(
        'id, employee_name, first_name, last_name, employee_code, designation, user_id, status, resignation_date, hire_date, employment_status, probation_end, probation_ack_end, title_id, reports_to, titles(name, level_id, template_id), departments(name), users!hr_staff_costs_user_id_fkey(email, is_active, last_seen_at)',
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
    // The Permissions tab and the invite drawer read the same templates.
    loadPermissionsData(supabase as unknown as SupabaseClient),
    // NRIC and the account number, only to say whether they are on file —
    // the table no longer hands them out (2026-10-09, PR4); the reader says
    // •••• to a viewer without the tick, which still counts as on file.
    readStaffPrivate(supabase, user, null),
    // Whose invite link is not used yet (2026-10-16) — Supabase Auth's to say,
    // so a function of its own, and only for whoever may invite them again.
    // Not fatal either: without it every login reads as before.
    canInvite
      ? (supabase as unknown as SupabaseClient).rpc('account_invite_states').then(
          r => r.data,
          () => null,
        )
      : Promise.resolve(null),
  ])
  const pending = pendingLogins(invites)

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

  // A full-access title (a Principal-kind template, or one that manages permissions) is given a login only by
  // whoever manages permissions (2026-10-20): for anybody else such a person is not offered, and says why.
  const managesPermissions = canDo(user, 'accounts', 'manage')
  const fullAccess = new Map(
    permissions.templates.filter(t => fullAccessTemplate(t.baseRole, !!t.grants.accounts?.manage)).map(t => [t.id, t.name]),
  )
  const heldFrom = (title: { name: string; template_id: string | null } | null): string | null => {
    const template = !managesPermissions && title?.template_id ? fullAccess.get(title.template_id) : undefined
    return template ? fullAccessHeld(title?.name, template) : null
  }
  const inviteHeld: Record<string, string> = {}
  const today = officeToday()

  const rows: PersonRow[] = untypedRows<RosterRow>(staff).map(r => {
    const held = canInvite ? heldFrom(r.titles) : null
    if (held) inviteHeld[r.id] = held
    return {
      ...personRow(r, rungs, rankByStaff.get(r.id) ?? null, privateFields.get(r.id), today),
      invitePending: !!r.user_id && pending.has(r.user_id),
      ...(held ? { inviteHeld: held } : {}),
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

  // Who the invite drawer may pick: active, on the roster, no login yet — with
  // the facts it shows read-only (their title, its rung and template, and who
  // they report to), all from the rows above.
  const staffRows = (staff ?? []) as unknown as Array<{
    id: string; employee_name: string; employee_code: string | null; user_id: string | null; status: string | null
    reports_to: string | null; titles: { name: string; level_id: string | null; template_id: string | null } | null
    departments: { name: string } | null; users: { email: string } | null
  }>
  const byId = new Map(staffRows.map(s => [s.id, s]))
  const candidates: InviteCandidate[] = staffRows
    .filter(s => s.status !== 'inactive' && !s.user_id && !inviteHeld[s.id])
    .map(s => {
      const manager = s.reports_to ? byId.get(s.reports_to) : undefined
      const rung = s.titles?.level_id ? rungs.get(s.titles.level_id) : undefined
      return {
        staffId: s.id,
        name: s.employee_name,
        code: s.employee_code,
        department: s.departments?.name ?? null,
        title: s.titles?.name ?? null,
        levelRank: rung?.rank ?? null,
        templateId: s.titles?.template_id ?? null,
        reportsTo: manager ? [manager.employee_name, manager.titles?.name].filter(Boolean).join(' · ') : null,
      }
    })

  // …and who may be invited again: a link sent and never used (2026-10-16).
  const pendingInvites: PendingInvite[] = staffRows
    .filter(s => s.status !== 'inactive' && s.user_id && pending.has(s.user_id) && s.users?.email && !inviteHeld[s.id])
    .map(s => ({ staffId: s.id, name: s.employee_name, email: s.users!.email, templateId: s.titles?.template_id ?? null }))

  const invite = params.invite
    ? { staffId: params.invite && UUID.test(params.invite) ? params.invite : null }
    : null

  return (
    <PeopleManagement
      people={rows}
      unattachedAccounts={unattached}
      canSeeActivity={can(user, 'audit_log')}
      permissions={permissions}
      // Changing them and inviting are HR view › Permissions' Edit and Create too (8b), on top of the actions;
      // reading the templates stays with the roster's readers, as before.
      showPermissions
      canManagePermissions={canDo(user, 'accounts', 'manage') && hasTab(user.tabs, 'hr.permissions', 'edit')}
      canSeeHistory={can(user, 'permissions_manage', 'audit_log')}
      canInvite={canInvite}
      canAddPeople={canDo(user, 'team', 'create')}
      candidates={candidates}
      pendingInvites={pendingInvites}
      inviteHeld={inviteHeld}
      initialTemplateId={params.template && UUID.test(params.template) ? params.template : null}
      initialInvite={invite}
    />
  )
}

/**
 * The roster for a Team · View holder who does not read the staff table — the
 * Executive office (everybody), a Department head (their department): the
 * directory's rows (lib/team-directory.ts), no unattached logins, no Rank
 * column (the commission positions answer to Revenue), no Permissions tab.
 * Nothing here writes: Team · Create / Edit still need the `team` key.
 */
async function DirectoryPeople({
  supabase,
  user,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  user: Awaited<ReturnType<typeof requirePermission>>
}) {
  const [directory, { data: levels }] = await Promise.all([
    readDirectory(supabase, user, null),
    supabase.from('title_levels').select('id, rank, name'),
  ])
  const rungs = new Map(
    ((levels ?? []) as Array<{ id: string; rank: number; name: string }>).map(l => [l.id, l]),
  )
  void supabase.rpc('log_data_access', {
    p_resource_type: 'hr_staff_costs',
    p_action: 'view',
    p_metadata: { staff_count: directory.length, via: 'team_directory' },
  })
  return (
    <PeopleManagement
      people={directory.map(r => personRow(r, rungs, null, r, officeToday()))}
      unattachedAccounts={[]}
      canSeeActivity={can(user, 'audit_log')}
      permissions={NO_PERMISSIONS}
      showPermissions={false}
      canManagePermissions={false}
      canSeeHistory={false}
      canInvite={false}
      canAddPeople={false}
      candidates={[]}
      pendingInvites={[]}
      inviteHeld={{}}
      initialTemplateId={null}
      initialInvite={null}
    />
  )
}

/** One roster row, as PeopleDirectory draws it — from either read. */
function personRow(
  r: RosterRow,
  rungs: Map<string, { id: string; rank: number; name: string }>,
  rank: { label: string; rate: number } | null,
  priv: { nric: string | null; bank_account_no: string | null } | undefined,
  /** The office's today — how near a probation's end reads on its chip. */
  today: string,
): PersonRow {
  const active = r.status !== 'inactive'
  const rung = r.titles?.level_id ? (rungs.get(r.titles.level_id) ?? null) : null
  // Probation, Permanent or Part time (2026-10-23): unknown (undefined) to a directory reader, whose rows carry none.
  const employmentStatus = r.employment_status === undefined ? undefined : employmentStatusOf(r.employment_status)
  const probationEnd = r.probation_end ?? null
  return {
    id: r.id,
    // Their full name, last name then first (2026-10-20); the full name on their IC is searched too.
    name: fullNameOf(r),
    icName: r.employee_name,
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
    // The Employment column (2026-10-23, the user: "permenant, part time and probation status follow by the hire date
    // start"): the status's chip — worked out here, on the office's today — then the hire date.
    employmentStatus,
    hireDate: r.hire_date ?? null,
    employmentChip: active
      ? statusChip({ status: employmentStatus, probationEnd, probationAcked: !!probationEnd && r.probation_ack_end === probationEnd }, today)
      : null,
    accountEmail: r.users?.email ?? null,
    accountActive: r.users?.is_active ?? null,
    lastSeenAt: r.users?.last_seen_at ?? null,
    // The three fields whose absence breaks something downstream: payroll
    // needs an NRIC for the statutory files and an account number to pay
    // into, and the InfoTech import matches on the hire date. Only asked of
    // people still employed — a resigned row missing a bank account is not
    // a chore anybody has to do. (•••• counts as on file.)
    missing: active
      ? [
          !onFile(priv?.nric) && 'NRIC',
          !onFile(priv?.bank_account_no) && 'bank account',
          !r.hire_date && 'hire date',
        ].filter((x): x is string => typeof x === 'string')
      : [],
  }
}
