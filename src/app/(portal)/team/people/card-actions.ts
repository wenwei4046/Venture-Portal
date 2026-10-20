'use server'

import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { pendingLogins } from '@/lib/invite'
import { requirePermission } from '@/lib/auth'
import { canAccessAuditLog, canInviteUsers, canManagePermissions } from '@/lib/roles'
import { hasTab } from '@/lib/page-tabs'
import { canDo } from '@/lib/permission-actions'
import { readDirectory, readOrgChart, readsStaffTable } from '@/lib/team-directory'
import { navLabelByPath } from '@/components/layout/nav-config'
import { describeActivity, type ActivityRow } from '@/lib/activity'
import { ladderAllows, nextRung, type LadderTitle, type Rung } from '@/lib/ladder'
import { offersVariablePay, type StaffRow, type TitleRow } from '@/lib/staff-form'
import { STAFF_ROW_COLUMNS } from '@/lib/private-columns'
import { readStaffPrivate } from '@/lib/private-fields'
import { onFile, sees } from '@/lib/sensitive'
import { listSubDepartments } from '../../revenue/_lib/sub-departments'
import { loadPersonAccess, type PersonAccessData } from '../_lib/person-permissions'

export interface CardActivityLine {
  /** ISO timestamp — formatted on the client so it can show "2h ago". */
  at: string
  verb: string
  target: string
  detail: string | null
}

export interface CardLadder {
  /** The rung their title stands on; null when the title is not placed. */
  level: string | null
  /** The next rung up in their department and the titles on it, if any. */
  next: { level: string; titles: Array<{ id: string; name: string }> } | null
  /** Why Promote is off even though there is a rung above. */
  blocker: string | null
}

export interface PersonCardData {
  staff: StaffRow
  /** For the edit form's title dropdown — every title, active or not. */
  titles: TitleRow[]
  code: string | null
  title: string | null
  department: string | null
  active: boolean
  resignedOn: string | null
  reportsTo: string | null
  ladder: CardLadder
  /** The same three payroll-blocking gaps the roster row marks. */
  missing: string[]
  /** `invitePending`: sent an invite link not used yet (2026-10-16) — known only to whoever may invite. */
  account: { id: string; email: string; role: string; isActive: boolean; lastSeenAt: string | null; invitePending?: boolean } | null
  /** Their title's template with their own cells — or, with no template yet, the old per-key view. */
  access: PersonAccessData | null
  canManagePermissions: boolean
  /** null when the reader may not read access_log — an empty list would read
   *  as "they did nothing", which is a different and wrong statement. */
  activity: CardActivityLine[] | null
  /** Which of the three the viewer's title ticks (2026-10-09, PR4). The
   *  `staff` above already carries •••• where it does not; the edit form uses
   *  this to show those fields without sending them. */
  canSee: { salary: boolean; nric: boolean; bank: boolean }
  /**
   * What the viewer may do from the card (2026-10-10, PR4b): edit them (Team ·
   * Edit, and the Salary tick — the form saves pay), promote or end their
   * employment (Team · Edit), invite them (Logins & invites · Create). A
   * directory reader — Team · View without the staff table — may none of it.
   */
  can: { edit: boolean; promote: boolean; invite: boolean }
}

/**
 * Everything the floating person card shows, in one round trip.
 *
 * The card replaced two page loads (the detail page and its edit page), so it
 * fetches what both of them did: the staff row itself, what the account's
 * permissions resolve to, and the account's recent activity. Read-gated by the
 * same `team` permission the roster is, and the two panels that are narrower
 * than that gate themselves — permissions editing on `canManagePermissions`,
 * activity on `canAccessAuditLog`.
 *
 * Since 2026-09-03 it also answers "what is the next level up": the rung
 * above theirs in their own department, and whether promoting them there
 * would put them above their line manager, which the ladder refuses.
 */
export async function getPersonCard(id: string): Promise<PersonCardData> {
  // The roster's own key — or Team · View without the Salary tick, which reads
  // them through the directory, inside its reach (2026-10-10, PR4b).
  const viewer = await requirePermission('team', 'team_directory')
  const supabase = await createClient()
  const direct = readsStaffTable(viewer)

  // One read of the title table serves both the edit form's dropdown (every
  // title, active or not) and the ladder (active ones, with their rung).
  const [{ data: tableRow }, { data: titleRows }, { data: levels }, privateFields, directory] = await Promise.all([
    direct
      ? supabase
          .from('hr_staff_costs')
          .select(
            `${STAFF_ROW_COLUMNS}, departments(name, payroll_source, segment_key), titles(id, name, level_id, template_id), users!hr_staff_costs_user_id_fkey(id, name, email, role, is_active, last_seen_at)` as const,
          )
          .eq('id', id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('titles').select('id, name, department_id, level_id, is_active').order('name'),
    supabase.from('title_levels').select('id, rank, name'),
    // NRIC and the account numbers, through the reader (2026-10-09, PR4).
    direct
      ? readStaffPrivate(supabase, viewer, [id])
      : Promise.resolve(new Map<string, { nric: string | null; bank_account_no: string | null; bank_account_no_2: string | null }>()),
    // The directory carries them itself, masked as the ticks say.
    direct ? Promise.resolve([]) : readDirectory(supabase, viewer, [id]),
  ])

  const directoryRow = directory[0] ?? null
  const staff = tableRow ?? directoryRow
  if (!staff) throw new Error('That person is no longer on the roster.')
  const priv = directoryRow
    ? { nric: directoryRow.nric, bank_account_no: directoryRow.bank_account_no, bank_account_no_2: directoryRow.bank_account_no_2 }
    : (privateFields.get(id) ?? { nric: null, bank_account_no: null, bank_account_no_2: null })
  const seesSalary = sees(viewer, 'salary')

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const row = staff as any
  const deptName: string | null = row.departments?.name ?? null
  const titleName: string | null = row.titles?.name ?? row.designation ?? null
  const acct = row.users as
    | { id: string; name: string; email: string; role: string; is_active: boolean; last_seen_at: string | null }
    | null

  // Whoever they report to is a staff row, not a join on this select. Their
  // title's rung matters too: a promotion may not climb past it.
  let reportsTo: string | null = null
  let manager: { name: string; title: string | null; levelId: string | null } | null = null
  if (row.reports_to) {
    // A directory reader's manager may stand outside their reach (a
    // Department head's line runs up out of the department): the chart names
    // everybody active, which is all the card says of a manager.
    const { data: mgr } = direct
      ? await supabase
          .from('hr_staff_costs')
          .select('employee_name, status, titles(name, level_id)')
          .eq('id', row.reports_to)
          .maybeSingle()
      : { data: await managerFromChart(supabase, row.reports_to) }
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const m = mgr as any
    if (m) {
      reportsTo = m.employee_name
      if (m.status === 'active') {
        manager = {
          name: m.employee_name,
          title: m.titles?.name ?? null,
          levelId: m.titles?.level_id ?? null,
        }
      }
    }
  }

  // What their login may do: beside the roster's own key only. And, for
  // whoever may invite, whether it is an invite link not used yet (2026-10-16).
  const mayInvite = direct && canInviteUsers(viewer) && hasTab(viewer.tabs, 'hr.permissions', 'create')
  const [access, invitePending] = await Promise.all([
    acct && direct
      ? loadPersonAccess(
          supabase,
          { id: acct.id, role: acct.role },
          { id: row.title_id ?? null, name: titleName, templateId: row.titles?.template_id ?? null },
        )
      : Promise.resolve(null),
    acct && mayInvite
      ? (supabase as unknown as SupabaseClient)
          .rpc('account_invite_states', { p_logins: [acct.id] })
          .then(
            r => pendingLogins(r.data).has(acct.id),
            () => false,
          )
      : Promise.resolve(false),
  ])

  const allTitles = titleRows ?? []
  const rungs: Rung[] = (levels ?? []).map(l => ({ id: l.id, rank: l.rank, name: l.name }))
  const ladderTitles: LadderTitle[] = allTitles
    .filter(t => t.is_active)
    .map(t => ({
      id: t.id,
      name: t.name,
      departmentId: t.department_id,
      levelId: t.level_id,
    }))
  const ownRung = rungs.find(r => r.id === row.titles?.level_id) ?? null
  const next = row.title_id ? nextRung(ladderTitles, rungs, row.title_id) : null

  let blocker: string | null = null
  if (next && manager) {
    const mgrRung = rungs.find(r => r.id === manager.levelId) ?? null
    if (!ladderAllows(next.rung.rank, mgrRung?.rank ?? null)) {
      blocker =
        `Would stand above ${manager.name} (${manager.title ?? 'no title'}, ` +
        `${mgrRung?.name ?? 'not on the ladder'}), who they report to — move the line first.`
    }
  }

  let activity: CardActivityLine[] | null = null
  if (acct && canAccessAuditLog(viewer)) {
    const [{ data: log }, subDepts] = await Promise.all([
      supabase
        .from('access_log')
        .select('resource_type, resource_id, action, metadata, created_at')
        .eq('user_id', acct.id)
        .order('created_at', { ascending: false })
        .limit(25),
      listSubDepartments(),
    ])
    const labels = navLabelByPath({
      revenueSubDepts: subDepts.map(s => ({ slug: s.slug, name: s.name })),
    })
    activity = ((log ?? []) as ActivityRow[]).map(r => {
      const line = describeActivity(r, labels)
      return { at: r.created_at, verb: line.verb, target: line.target, detail: line.detail }
    })
  }

  return {
    staff: {
      id: row.id,
      employee_name: row.employee_name,
      first_name: row.first_name ?? null,
      last_name: row.last_name ?? null,
      designation: row.designation ?? null,
      department_id: row.department_id,
      department_name: deptName ?? '—',
      commission_dept: row.departments?.payroll_source === 'commission',
      director_dept: offersVariablePay(row.departments),
      title_id: row.title_id ?? null,
      // Not sent at all to a viewer whose title does not tick Salary amounts
      // — the card shows •••• (canSee below), and the figure never reaches
      // their browser.
      basic_salary: seesSalary ? Number(row.basic_salary ?? 0) : 0,
      allowances: seesSalary ? Number(row.allowances ?? 0) : 0,
      non_statutory_allowance: seesSalary ? Number(row.non_statutory_allowance ?? 0) : 0,
      employee_code: row.employee_code ?? null,
      infotech_code: row.infotech_code ?? null,
      hire_date: row.hire_date ?? null,
      resignation_date: row.resignation_date ?? null,
      epf_category: row.epf_category,
      socso_category: row.socso_category,
      is_epf_exempt: !!row.is_epf_exempt,
      pcb_category: row.pcb_category,
      children_count: row.children_count ?? 0,
      employment_type: row.employment_type,
      bank_name: row.bank_name ?? null,
      bank_account_no: priv.bank_account_no,
      bank_name_2: row.bank_name_2 ?? null,
      bank_account_no_2: priv.bank_account_no_2,
      nric: priv.nric,
      contact_number: row.contact_number ?? null,
      email: row.email ?? null,
      address: row.address ?? null,
      // Its six parts (2026-10-20) — what the person's page edits.
      address_line1: row.address_line1 ?? null,
      address_line2: row.address_line2 ?? null,
      address_postcode: row.address_postcode ?? null,
      address_city: row.address_city ?? null,
      address_state: row.address_state ?? null,
      address_country: row.address_country ?? null,
      emergency_contact_name: row.emergency_contact_name ?? null,
      emergency_contact_phone: row.emergency_contact_phone ?? null,
      emergency_contact_relationship: row.emergency_contact_relationship ?? null,
    },
    titles: allTitles.map(t => ({
      id: t.id,
      name: t.name,
      department_id: t.department_id,
      is_active: t.is_active,
    })) as TitleRow[],
    code: row.employee_code ?? null,
    title: titleName,
    department: deptName,
    active: row.status !== 'inactive',
    resignedOn: row.resignation_date ? dayjs(row.resignation_date).format('D MMM YYYY') : null,
    reportsTo,
    ladder: {
      level: ownRung?.name ?? null,
      next: next
        ? {
            level: next.rung.name,
            titles: next.titles.map(t => ({ id: t.id, name: t.name })),
          }
        : null,
      blocker,
    },
    missing:
      row.status !== 'inactive'
        ? [
            !onFile(priv.nric) && 'NRIC',
            !onFile(priv.bank_account_no) && 'bank account',
            !row.hire_date && 'hire date',
          ].filter((x): x is string => typeof x === 'string')
        : [],
    account: acct
      ? {
          id: acct.id,
          email: acct.email,
          role: acct.role,
          isActive: acct.is_active,
          lastSeenAt: acct.last_seen_at,
          invitePending,
        }
      : null,
    access,
    // HR view › Permissions · Edit too (2026-10-11, 8b): a tab can take it away, never give it.
    canManagePermissions: canManagePermissions(viewer) && hasTab(viewer.tabs, 'hr.permissions', 'edit'),
    activity,
    canSee: { salary: seesSalary, nric: sees(viewer, 'nric'), bank: sees(viewer, 'bank') },
    can: {
      edit: direct && canDo(viewer, 'team', 'edit') && seesSalary,
      promote: direct && canDo(viewer, 'team', 'edit'),
      invite: mayInvite,
    },
  }
}

/** The manager as the chart names them: active people only, an inactive one reads as nobody's line. */
async function managerFromChart(
  supabase: Awaited<ReturnType<typeof createClient>>,
  managerId: string,
): Promise<{ employee_name: string; status: string; titles: { name: string; level_id: string | null } | null } | null> {
  const m = (await readOrgChart(supabase)).people.find(p => p.id === managerId)
  return m ? { employee_name: m.employee_name, status: 'active', titles: m.titles ? { name: m.titles.name, level_id: m.titles.level_id } : null } : null
}
