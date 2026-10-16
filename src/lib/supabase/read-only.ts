/**
 * The server client while somebody is viewed as (2026-10-11 — the user: "can
 * set a function is view as a user, same like in revenue app, i can view as a
 * member"): it READS and nothing else.
 *
 * View as a person draws the portal with that person's keys, actions and
 * tabs, so their buttons show — and pressing one must change nothing, as in
 * the Revenue app's View as (feedback: "只能看，不能送出"). The database still
 * answers as the Principal (auth.uid() is theirs), and some writes ask no app
 * gate at all (their function asks the database), so the guard sits on the
 * one client every server path writes through:
 *
 *   - a table: select / count go through; insert / update / upsert / delete
 *     answer "Read-only while viewing as somebody" instead of running;
 *   - a function: only one that cannot write — STABLE in the database, which
 *     refuses a write inside one (read off pg_proc on 2026-10-11), and the few
 *     VOLATILE ones read to write nothing — plus the access log, which records
 *     what is read;
 *   - storage: reading and signed links go through; uploads, moves and
 *     removals answer the same.
 *
 * A refusal comes back as `{ data: null, error }` exactly as a refused write
 * does, so a page or action that shows `error.message` says it in words. A
 * function the list does not know is refused — a new reader is added here.
 */

export const READ_ONLY_MESSAGE = 'Read-only while viewing as somebody — nothing is saved.'

/** Functions the portal calls that change nothing (STABLE, or read to write nothing). */
export const READS_WHILE_VIEWING_AS: ReadonlySet<string> = new Set([
  // STABLE in the database (2026-10-11):
  // People's invite links not used yet (mig 20261016170000): STABLE, reading only.
  'account_invite_states',
  // Sub-departments per person (mig 20261016180000): STABLE — the caller's reach, a person's window.
  'my_sub_department_reach', 'person_sub_department_reach',
  'ar_account_code_for', 'ar_account_for_invoice', 'audit_changes', 'audit_overview', 'bank_gl_codes', 'bridge_mirror_slices',
  'bridge_ref_flags', 'build_hr_cost_submission_payload', 'calculate_dept_np', 'claim_payment_queue', 'comm_home_sub_department',
  'comm_open_bill_on', 'comm_staff_can_recruit', 'commission_order_period_locked', 'crm_can_reply', 'crm_my_can', 'crm_people',
  'current_actions', 'current_permissions', 'current_sensitive_fields', 'current_tabs', 'dashboard_summary', 'department_modes',
  'dept_invoice_settlements', 'director_private_fields', 'erp_feed_month_closed', 'erp_sync_ignored_agents', 'erp_sync_sub_department',
  'erp_sync_unmatched_agents', 'get_dept_opex_rows', 'get_director_advance_opening_balance', 'get_director_ctc_by_company',
  'get_hr_cost_submissions_list', 'get_hr_cost_summary', 'get_payroll_accrual_totals', 'get_payroll_accrual_totals_for',
  'get_payroll_breakdown_by_pool', 'get_payroll_funding_paid', 'get_staff_billing_allocation', 'get_staff_own_share_allocation',
  'get_submitted_hr_summary', 'gl_net_by_account', 'hr_dashboard_summary', 'lookup_eis', 'lookup_epf', 'lookup_pcb', 'lookup_socso',
  'member_admin_brand_weeks', 'member_admin_claim_settings', 'member_admin_request_facts', 'member_admin_snapshot', 'member_capacity_of', 'member_catalogue',
  'member_memo_reads', 'member_sub_department_requests', 'member_waiting_form', 'member_waiting_transfer', 'next_staff_code',
  // Member services › Food claim (mig 20261013150000).
  'member_admin_food_claim',
  // The replacement list's form (mig 20261011130000).
  'member_replacement_form',
  // Documentation (mig 20261011070000): the page's read, a file's path, a member's documents.
  'hr_documentation', 'hr_documentation_file', 'member_documents',
  // …and the Data center's own folders and files, and one's path (mig 20261012220000).
  'hr_drive', 'hr_drive_file',
  // …Publish › Preview and a memo's file (mig 20261012210000): both STABLE, reading only.
  'hr_memo_preview', 'memo_attachment',
  // …and, the Revenue app's View as, one member's (mig 20261011110000) — Company and Personal since mig 20261014190000.
  'member_documents_of', 'my_documents_of',
  // Hiring (round 2): the board and where a file is — and the Talent Bank's folders (mig 20261013030000).
  'hiring_board', 'hiring_file_path', 'hiring_bank',
  // HOUZS Venture's director share — the grid's month (mig 20261013170000): STABLE.
  'director_hv_share_of',
  // The Revenue app's CRM chat button — one's own chats' unread (mig 20261014120000): STABLE.
  'crm_my_unread',
  'payroll_batch_accrual_sums', 'payroll_line_accounts', 'payroll_month_closed', 'payroll_month_status', 'permission_history',
  'revenue_costing_gaps', 'revenue_fair_calendar', 'revenue_fair_calendar_moves', 'revenue_month_orders', 'revenue_payroll_adjustments',
  'revenue_possible_double_claims', 'revenue_uncosted_products', 'rnp_invoice_events', 'staff_private_fields', 'team_directory',
  'team_org_chart', 'venue_event_organiser_for_order', 'view_as_people',
  // Admin › Meeting Rooms (mig 20261011090000):
  'meeting_rooms_range', 'meeting_rooms_booking', 'meeting_rooms_rooms', 'meeting_rooms_people',
  // HR › Attendance (mig 20261015030200; att_file, the file a short link is made for — mig 20261015200000):
  'att_config', 'att_month', 'att_requests_list', 'att_ledger', 'att_register', 'att_file',
  // Admin › Guest Link (mig 20261011091000):
  'guest_link_admin', 'guest_link_legend',
  // VOLATILE, read to write nothing:
  'comm_effective_direct_line_limits', 'commission_payroll_closed', 'next_account_code', 'revenue_pay_lines_closed', 'revenue_pay_preview',
  // Who is being viewed — sets auth.uid() for its own four reads and puts it back:
  'view_as_person',
  // The access log records what is read, while viewing as too:
  'log_data_access',
])

const TABLE_WRITES = new Set(['insert', 'update', 'upsert', 'delete'])
const STORAGE_WRITES = new Set(['upload', 'update', 'remove', 'move', 'copy', 'uploadToSignedUrl', 'createSignedUploadUrl'])

const refusal = () => ({
  data: null,
  error: { message: READ_ONLY_MESSAGE, code: 'VIEW_AS', details: '', hint: '' },
  count: null,
  status: 403,
  statusText: 'Read-only',
})

/** A refused call: chains like a query builder (`.select().single()`), and resolves to the refusal. */
function refused(): unknown {
  const handler: ProxyHandler<() => void> = {
    // `receiver` is the refused call itself, so every link of a chain hands it back.
    get(_target, prop, receiver) {
      if (prop === 'then') return (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(refusal()).then(resolve, reject)
      return () => receiver
    },
    apply: () => refused(),
  }
  return new Proxy(() => {}, handler)
}

function guard<T extends object>(target: T, writes: ReadonlySet<string>): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (typeof prop === 'string' && writes.has(prop)) return () => refused()
      const value = Reflect.get(t, prop, receiver)
      return typeof value === 'function' ? value.bind(t) : value
    },
  })
}

/** The client every server path uses, reading only. */
export function readOnly<T extends object>(client: T): T {
  return new Proxy(client, {
    get(t, prop, receiver) {
      if (prop === 'from') {
        const from = Reflect.get(t, prop, receiver) as (table: string) => object
        return (table: string) => guard(from.call(t, table), TABLE_WRITES)
      }
      if (prop === 'rpc') {
        const rpc = Reflect.get(t, prop, receiver) as (fn: string, ...rest: unknown[]) => unknown
        return (fn: string, ...rest: unknown[]) => (READS_WHILE_VIEWING_AS.has(fn) ? rpc.call(t, fn, ...rest) : refused())
      }
      if (prop === 'storage') {
        const storage = Reflect.get(t, prop, receiver) as { from: (bucket: string) => object }
        return new Proxy(storage, {
          get(s, p, r) {
            if (p === 'from') return (bucket: string) => guard(storage.from(bucket), STORAGE_WRITES)
            const value = Reflect.get(s, p, r)
            return typeof value === 'function' ? value.bind(s) : value
          },
        })
      }
      const value = Reflect.get(t, prop, receiver)
      return typeof value === 'function' ? value.bind(t) : value
    },
  })
}
