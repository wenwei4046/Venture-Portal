/**
 * The columns no session reads straight off its table since mig
 * 20261009050000 (2026-10-09, PR4 — salary, NRIC and bank accounts show only
 * where ticked). Their SELECT is revoked from `authenticated`, and with it any
 * `select('*')` on these tables; the readers in lib/private-fields.ts are the
 * only way to them, and they hand the value to a holder of the tick and ••••
 * to anybody else. private-fields.test.ts refuses a query that names one, or
 * asks for `*`, before the database has to.
 */
export const PRIVATE_COLUMNS = {
  hr_staff_costs: ['nric', 'bank_account_no', 'bank_account_no_2'],
  directors: ['nric'],
  payroll_voucher_lines: ['bank_account_no'],
  // A submission's per-person copies: the database's own functions read
  // them (calculate_dept_np), nobody's session does.
  hr_cost_submissions: ['staff_snapshot', 'staff_allocation_snapshot'],
} as const

export type PrivateTable = keyof typeof PRIVATE_COLUMNS

/**
 * Every other column of a staff row — what a page that used to read the
 * whole row (`*`) asks for instead. A literal, so supabase-js still types the
 * row from it. A column added to hr_staff_costs is granted to `authenticated`
 * by the migration that adds it (the migration's guard refuses otherwise),
 * and listed here when a page needs it.
 */
export const STAFF_ROW_COLUMNS =
  'id, employee_name, department_id, basic_salary, allowances, epf_er, socso_er, eis_er, total_ctc, status, created_by, created_at, updated_at, non_statutory_allowance, employee_code, hire_date, resignation_date, epf_category, socso_category, is_epf_exempt, pcb_category, children_count, employment_type, bank_name, address, contact_number, email, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, designation, tax_mode, withholding_rate, title_id, user_id, reports_to, bank_name_2, infotech_code, home_sub_department_id'

/** Every column of a director but the NRIC. */
export const DIRECTOR_ROW_COLUMNS =
  'id, name, code, tax_ref_no, pcb_category, children_count, weightage, min_payout, status, created_at, updated_at'
