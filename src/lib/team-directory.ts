import 'server-only'
import { can, type PermissionHolder } from '@/lib/permissions'
import { sees, shown, type SensitiveHolder } from '@/lib/sensitive'

/**
 * People for a Team · View holder who does not read the staff table
 * (2026-10-10, PR4b of the People Management revamp; the user chose 1b / 2b).
 *
 * The `team` key — HR's, the Principal's — opens `hr_staff_costs` itself, pay
 * columns and all, which is why PR1 opened it only with the Salary tick. A
 * title holding Team · View without that tick (the Executive office at All, a
 * Department head at Dept) gets `team_directory` instead and reads People
 * through two database readers (mig 20261010010000), never the table:
 *
 *   readDirectory   the rows their Team · View reaches — everybody at All,
 *                   their department at Dept, themselves at Own — with every
 *                   column a person page shows except pay (NULL without
 *                   Salary amounts) and the NRIC / account numbers (•••• without
 *                   their ticks): 1b, everything but salary, NRIC and bank.
 *   readOrgChart    every active person's chart facts — name, code, title,
 *                   department, reporting line — whatever their reach: 2b, a
 *                   Department head reads the whole company's chart, names and
 *                   titles only.
 *
 * Reading only: Team · Create / Edit / Manage still ask for the `team` key.
 */

/** Reads the staff table itself under its row policies — HR and the Principal. */
export function readsStaffTable(viewer: PermissionHolder): boolean {
  return can(viewer, 'team')
}

export interface DirectoryRow {
  id: string
  employee_name: string
  /** What the apps call them (2026-10-17) — read by the directory since mig 20261020230000. */
  first_name?: string | null
  last_name?: string | null
  employee_code: string | null
  designation: string | null
  status: string
  department_id: string | null
  home_sub_department_id: string | null
  title_id: string | null
  reports_to: string | null
  user_id: string | null
  infotech_code: string | null
  hire_date: string | null
  resignation_date: string | null
  employment_type: string | null
  tax_mode: string | null
  epf_category: string | null
  socso_category: string | null
  is_epf_exempt: boolean | null
  pcb_category: string | null
  children_count: number | null
  contact_number: string | null
  email: string | null
  address: string | null
  /** The address in its six parts (2026-10-20, mig 20261020230000) — `address` is them put together. */
  address_line1?: string | null
  address_line2?: string | null
  address_postcode?: string | null
  address_city?: string | null
  address_state?: string | null
  address_country?: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  emergency_contact_relationship: string | null
  bank_name: string | null
  bank_name_2: string | null
  created_by: string | null
  created_at: string | null
  updated_at: string | null
  /** Pay: null unless the viewer's title ticks Salary amounts. */
  basic_salary: number | null
  allowances: number | null
  non_statutory_allowance: number | null
  epf_er: number | null
  socso_er: number | null
  eis_er: number | null
  total_ctc: number | null
  withholding_rate: number | null
  /** The value, •••• without the tick, null when not on file. */
  nric: string | null
  bank_account_no: string | null
  bank_account_no_2: string | null
  departments: { name: string; payroll_source: string | null; segment_key: string | null } | null
  titles: { id: string; name: string; level_id: string | null; template_id: string | null; is_department_head: boolean | null } | null
  users: { id: string; name: string | null; email: string; role: string; is_active: boolean; last_seen_at: string | null } | null
}

export interface ChartRow {
  id: string
  employee_name: string
  employee_code: string | null
  reports_to: string | null
  designation: string | null
  title_id: string | null
  department_id: string | null
  titles: { name: string; level_id: string | null; is_department_head: boolean | null } | null
  departments: { name: string; payroll_source: string } | null
}

const PAY = ['basic_salary', 'allowances', 'non_statutory_allowance', 'epf_er', 'socso_er', 'eis_er', 'total_ctc', 'withholding_rate'] as const

const asNumber = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v))

/**
 * The reader's answer, as this viewer may see it: the database answers for the
 * signed-in account, the page for the view it is drawn in (lib/private-fields.ts
 * does the same) — numbers come back as numbers.
 */
export function directoryRowsFromJson(value: unknown, viewer: SensitiveHolder): DirectoryRow[] {
  if (!Array.isArray(value)) return []
  const pay = sees(viewer, 'salary')
  return value
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string')
    .map(r => {
      const row = { ...r } as Record<string, unknown>
      for (const k of PAY) row[k] = pay ? asNumber(r[k]) : null
      row.children_count = asNumber(r.children_count)
      row.nric = shown(viewer, 'nric', r.nric as string | null)
      row.bank_account_no = shown(viewer, 'bank', r.bank_account_no as string | null)
      row.bank_account_no_2 = shown(viewer, 'bank', r.bank_account_no_2 as string | null)
      return row as unknown as DirectoryRow
    })
}

/** The company chart: its people, and the Revenue sub-departments with their directors. */
export interface OrgChart {
  people: ChartRow[]
  subDepartments: Array<{ id: string; name: string; department_id: string; created_at: string }>
  directors: Array<{ staff_id: string; sub_department_id: string }>
}

const withId = (r: unknown): boolean => !!r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string'

/** team_org_chart()'s answer; null (no Team · View) reads as an empty chart. */
export function orgChartFromJson(value: unknown): OrgChart {
  const v = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>
  const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])
  return {
    people: list(v.people).filter(withId) as ChartRow[],
    subDepartments: list(v.sub_departments).filter(withId) as OrgChart['subDepartments'],
    directors: list(v.directors).filter(
      d => !!d && typeof d === 'object' && typeof (d as { staff_id?: unknown }).staff_id === 'string',
    ) as OrgChart['directors'],
  }
}

type RpcClient = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> }

/** The rows of these people (null: everybody they reach) — the directory's answer. */
export async function readDirectory(
  supabase: unknown,
  viewer: SensitiveHolder,
  ids: readonly string[] | null,
): Promise<DirectoryRow[]> {
  const { data, error } = await (supabase as RpcClient).rpc('team_directory', { p_staff_ids: ids ? [...new Set(ids)] : null })
  if (error) throw new Error(`Could not read the people directory: ${error.message}`)
  return directoryRowsFromJson(data, viewer)
}

/** Everybody active, as the chart draws them — names, titles, reporting lines — and the Revenue directors. */
export async function readOrgChart(supabase: unknown): Promise<OrgChart> {
  const { data, error } = await (supabase as RpcClient).rpc('team_org_chart')
  if (error) throw new Error(`Could not read the org chart: ${error.message}`)
  return orgChartFromJson(data)
}
