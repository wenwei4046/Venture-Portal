'use server'

import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { canAccessAuditLog, canManagePermissions } from '@/lib/roles'
import { navLabelByPath } from '@/components/layout/nav-config'
import { describeActivity, type ActivityRow } from '@/lib/activity'
import type { TitleRow } from '@/lib/staff-form'
import { listSubDepartments } from '../../revenue/_lib/sub-departments'
import { resolvePersonPermissions } from '../_lib/person-permissions'
import type { PersonPermissionRow } from '../_components/PersonPermissions'
import type { StaffRow } from './_components/EditStaffForm'

export interface CardActivityLine {
  /** ISO timestamp — formatted on the client so it can show "2h ago". */
  at: string
  verb: string
  target: string
  detail: string | null
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
  /** The same three payroll-blocking gaps the roster row marks. */
  missing: string[]
  account: { id: string; email: string; role: string; isActive: boolean; lastSeenAt: string | null } | null
  permissions: { rows: PersonPermissionRow[]; source: string } | null
  canManagePermissions: boolean
  /** null when the reader may not read access_log — an empty list would read
   *  as "they did nothing", which is a different and wrong statement. */
  activity: CardActivityLine[] | null
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
 */
export async function getPersonCard(id: string): Promise<PersonCardData> {
  const viewer = await requirePermission('team')
  const supabase = await createClient()

  const [{ data: staff }, { data: titles }] = await Promise.all([
    supabase
      .from('hr_staff_costs')
      .select(
        '*, departments(name, payroll_source), titles(id, name), users!hr_staff_costs_user_id_fkey(id, name, email, role, is_active, last_seen_at)',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase.from('titles').select('id, name, department_id, is_active').order('name'),
  ])

  if (!staff) throw new Error('That person is no longer on the roster.')

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const row = staff as any
  const deptName: string | null = row.departments?.name ?? null
  const titleName: string | null = row.titles?.name ?? row.designation ?? null
  const acct = row.users as
    | { id: string; name: string; email: string; role: string; is_active: boolean; last_seen_at: string | null }
    | null

  // Whoever they report to is a staff row, not a join on this select.
  let reportsTo: string | null = null
  if (row.reports_to) {
    const { data: mgr } = await supabase
      .from('hr_staff_costs')
      .select('employee_name')
      .eq('id', row.reports_to)
      .maybeSingle()
    reportsTo = (mgr as { employee_name: string } | null)?.employee_name ?? null
  }

  const permissions = acct
    ? await resolvePersonPermissions(
        supabase,
        { id: acct.id, role: acct.role },
        { id: row.title_id ?? null, name: titleName },
      )
    : null

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
      designation: row.designation ?? null,
      department_id: row.department_id,
      department_name: deptName ?? '—',
      commission_dept: row.departments?.payroll_source === 'commission',
      title_id: row.title_id ?? null,
      basic_salary: Number(row.basic_salary ?? 0),
      allowances: Number(row.allowances ?? 0),
      non_statutory_allowance: Number(row.non_statutory_allowance ?? 0),
      employee_code: row.employee_code ?? null,
      hire_date: row.hire_date ?? null,
      resignation_date: row.resignation_date ?? null,
      epf_category: row.epf_category,
      socso_category: row.socso_category,
      is_epf_exempt: !!row.is_epf_exempt,
      pcb_category: row.pcb_category,
      children_count: row.children_count ?? 0,
      employment_type: row.employment_type,
      bank_name: row.bank_name ?? null,
      bank_account_no: row.bank_account_no ?? null,
      nric: row.nric ?? null,
      contact_number: row.contact_number ?? null,
      email: row.email ?? null,
      address: row.address ?? null,
      emergency_contact_name: row.emergency_contact_name ?? null,
      emergency_contact_phone: row.emergency_contact_phone ?? null,
      emergency_contact_relationship: row.emergency_contact_relationship ?? null,
    },
    titles: (titles ?? []) as TitleRow[],
    code: row.employee_code ?? null,
    title: titleName,
    department: deptName,
    active: row.status !== 'inactive',
    resignedOn: row.resignation_date ? dayjs(row.resignation_date).format('D MMM YYYY') : null,
    reportsTo,
    missing:
      row.status !== 'inactive'
        ? [
            !row.nric && 'NRIC',
            !row.bank_account_no && 'bank account',
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
        }
      : null,
    permissions,
    canManagePermissions: canManagePermissions(viewer),
    activity,
  }
}
