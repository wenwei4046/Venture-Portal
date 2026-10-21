import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { APPROVE, scanReads, type Gate, type ReadSite, type Want } from './scan-reads'
import { TABLE_WRITES, type WriteCommand } from '@/lib/permission-table-writes'

/**
 * Every way a session READS a table, and who gets there (PR3d, 2026-10-09):
 * the app's reads (scan-reads.ts), with what the scan cannot see written down
 * here — a check made by hand, a branch of one page, a table chosen at run
 * time, a function nothing calls — and the database's own reads under the
 * caller's session: SECURITY INVOKER functions the app calls, INVOKER triggers
 * (they read as whoever wrote), the row policies' own subqueries, and the
 * table's writers (an UPDATE / DELETE … WHERE and a RETURNING read the rows).
 *
 * permission-table-reads.test.ts holds TABLE_READS to all of it; the
 * migration's list was derived from it.
 */

// ── What the scan cannot see ─────────────────────────────────────────────────

/** Checks written by hand, by `file#function`: whoever passes holds one of these. */
export const GUARDS: Readonly<Record<string, Gate>> = {
  'src/app/(member)/member/(app)/products/page.tsx#ProductListPage':
    { wants: ['product_list.view'], text: 'canOpenProductList (Product list · View, the session’s or the masked Principal’s)' },
  'src/app/(portal)/approvals/payroll-run/[id]/page.tsx#PayrollRunApprovalPage':
    { wants: ['approvals.view', ...APPROVE, 'hr_costing.view:own', 'treasury.view'], text: 'canSeeApprovals(user) || can(user, hr_costing, treasury)' },
  'src/lib/member/server.ts#loadDepartmentIncome':
    { wants: ['revenue.view:own'], text: 'isPrincipalAccount — the Principal, who holds every action' },
  'src/lib/member/server.ts#loadMemberIncome':
    { wants: ['service_role'], text: 'every read goes through adminClient(), after member_income_context authorised the session' },
  'src/app/(portal)/layout.tsx#PortalLayout':
    { wants: ['revenue.view:own'], text: 'canAccessRevenue(user) — the sidebar’s Revenue sub-departments (listSubDepartments)' },
  'src/components/layout/BottomTabBar.tsx#BottomTabBar':
    { wants: ['approvals.view', ...APPROVE], text: 'canApprove(viewer) — the phone’s approvals badge' },
  // 2026-10-17 — the Principal's own view opens the Finance app with an Approvals tab: its badge is read only
  // where the tab is drawn — the sidebar's Approvals row, `canApprove` and its page's tabs.
  'src/app/(fin-app)/fin-app/layout.tsx#FinAppLayout':
    { wants: ['approvals.view', ...APPROVE], text: 'hasApprovalsTab(user) — canApprove, the Principal’s Approvals tab badge' },
  'src/app/(portal)/payments/voucher-doc/route.tsx#readSubmissions':
    { wants: ['treasury.view'], text: 'can(user, treasury) — the voucher print’s approval requests, the treasury’s read only' },
  'src/lib/attendance/payroll-write.ts#payrollMarksFor':
    { wants: ['hr_costing.view:own'], text: 'can(user, hr_costing) with the Payroll tab open — Month close shows where each person’s payroll stands to a payroll reader only' },
  // 2026-10-17 — HR Mobile: a person's Call and Message dial People's own mobile column, read only while People is
  // open to them (appAccess(user).parts.people: can(team) || can(team_directory), with People's tab).
  'src/lib/hr-app/server.ts#mobiles':
    { wants: ['team.view:own'], text: 'appAccess(user).parts.people — People (team / team_directory) with its tab open' },
}

/**
 * A page that branches on the viewer's cells (lib/surfaces.ts) reads each
 * table in one branch: `file#function` → the action that opens a branch → the
 * tables read there.
 */
export const BRANCHES: Readonly<Record<string, Readonly<Record<Want, readonly string[]>>>> = {
  'src/app/(portal)/dashboard/page.tsx#DashboardPage': {
    // overviewFor → 'treasury': the summary, the bank accounts, the queues and their live amounts,
    // and (2026-10-09) every live deal's repayment plan — its terms over time — for the
    // Overdue instalments and Coming up sections (lib/repayment-book) — a
    // director's fund source by the director's name (2026-10-12).
    'treasury.view': [
      'approval_requests', 'bank_accounts', 'base_rate_history', 'dept_pools', 'directors', 'fund_source_repayments', 'fund_sources',
      'invoice_payout_pool', 'invoices', 'journal_entries', 'journal_lines', 'loans', 'overdue_records', 'payment_vouchers',
      'repayments', 'treasury_terms_history', 'venture_pool',
    ],
    // Finance's view (2026-10-14, the Finance revamp v2's Overview): this month's allocations not yet
    // billed — read only with the billing key, as the Invoice and allocator pages (canAccessBilling,
    // dashboard/_lib/finance-overview.ts).
    'billing.view': ['alloc_txns', 'invoices'],
    // HR's Overview (2026-10-14): Comm Cal opens the sub-department last picked — canAccessRevenue(user).
    'revenue.view:own': ['comm_sub_departments', 'comm_schemes'],
  },
  'src/app/(portal)/approvals/[id]/page.tsx#ApprovalDetailPage': {
    // The request is read first, and the page stops (notFound) unless a row
    // policy shows it: the queue, an approver of its kind, or the treasury.
    // (The department that raised its own expense went with the Dept
    // Manager, 2026-10-17.)
    'treasury.view': ['approval_requests', 'loans', 'payment_vouchers', 'payment_voucher_sources', 'payment_attachments', 'bank_accounts'],
    'approvals.view': ['approval_requests', 'loans', 'payment_vouchers', 'payment_voucher_sources', 'payment_attachments', 'bank_accounts'],
    ...Object.fromEntries(APPROVE.map(a => [a, ['approval_requests', 'loans', 'payment_vouchers', 'payment_voucher_sources', 'payment_attachments', 'bank_accounts']])),
  },
  // The Finance phone app's Overview (2026-10-15, M01) — the desktop Overview's counts
  // (loadFinanceOverviewCounts): the vouchers only for the treasury, the invoices and
  // this month's allocations only for Billing (canAccessTreasury / canAccessBilling).
  'src/app/(fin-app)/fin-app/page.tsx#FinAppOverview': {
    // …and, for the Principal's own view with the treasury (2026-10-17, loadPrincipalOverview), what waits for
    // its decision and the treasury dashboard's summary (dashboard_summary — the desktop Overview's own reads).
    'treasury.view': [
      'payment_vouchers', 'approval_requests', 'bank_accounts', 'base_rate_history', 'dept_pools', 'fund_source_repayments', 'fund_sources',
      'invoice_payout_pool', 'journal_entries', 'journal_lines', 'loans', 'overdue_records', 'repayments', 'venture_pool',
    ],
    'billing.view': ['alloc_txns', 'invoices'],
  },
}

/** from(<chosen at run time>), by `file#function` → the tables it may name. */
export const DYNAMIC_TABLES: Readonly<Record<string, readonly string[]>> = {
  'src/lib/approval-amounts.ts#resolveLiveApprovalAmounts': ['payment_vouchers', 'fund_sources', 'loans'],
  'src/app/(member)/member/(app)/products/load.ts#count': ['erp_products', 'erp_product_models', 'erp_maintenance_options', 'erp_fabrics'],
  'src/app/(portal)/revenue/config-actions.ts#cloneSchemeChildren': ['comm_item_groups', 'comm_kpi_items', 'comm_cost_ratios', 'comm_kpi_thresholds', 'comm_open_bill_rules', 'comm_promotion_rules'],
  // The work of updatePaymentVoucher and its in-words twin (2026-10-16).
  'src/app/(portal)/payments/actions.ts#updatePaymentVoucherWork': ['payroll_voucher_lines', 'payroll_statutory_voucher_lines'],
  'src/lib/hierarchy-writes.ts#updateChecked': ['comm_hierarchy'],
}

/**
 * Reads made FOR WHOEVER MAY: the answer is whatever the viewer's own row
 * policies return, and less is not an error — `file#function` → why.
 */
export const WHOEVER_MAY: Readonly<Record<string, string>> = {
  'src/app/(portal)/audit-log/_lib/ref-labels.ts#loadRefLabels':
    'The names behind the ids in the audit log: a name the reader may not read stays a short id.',
}

/** Functions nothing calls (dead code): no session reaches their reads. */
export const NOT_CALLED: readonly string[] = [
  'src/lib/cfo-reports.ts#fetchBalanceSheet',
  'src/lib/cfo-reports.ts#fetchCashflowStatement',
  'src/lib/cfo-reports.ts#resolveLedgerSourceMeta',
  'src/lib/cfo-reports.ts#resolveSourceDescriptions',
  'src/lib/loans-coa.ts#resolveInterestSuspenseLeaf',
  'src/lib/slack.ts#notifyNewApproval',
  'src/lib/slack.ts#notifyOverdueDetected',
  'src/lib/slack.ts#notifyStatementIssued',
  'src/lib/voucher-paid-helpers.ts#debitVoucherPools',
]

// ── The database's own reads under the caller's session (production, 2026-10-09) ──

/**
 * SECURITY INVOKER functions the app calls → every table their bodies (and the
 * INVOKER functions they call) name. Read as the caller.
 */
export const INVOKER_READS: Readonly<Record<string, readonly string[]>> = {
  ar_account_code_for: ['chart_of_accounts', 'companies'],
  ar_account_for_invoice: ['chart_of_accounts', 'companies', 'invoices'],
  catalogue_add_combo: ['catalogue_combo_prices', 'catalogue_combos', 'catalogue_live_combos', 'erp_products'],
  catalogue_remove_combos: ['catalogue_combo_prices', 'catalogue_combos'],
  catalogue_save_kpi_items: ['comm_kpi_items', 'comm_schemes', 'erp_maintenance_options', 'erp_products'],
  comm_clear_first_paid_month: ['comm_cutovers'],
  commission_payroll_closed: [],
  comm_close_salespeople: ['comm_salesperson_closes', 'hr_staff_costs', 'users'],
  comm_reopen_salespeople: ['comm_salesperson_closes', 'users'],
  comm_replace_membership_position: ['comm_hierarchy'],
  comm_set_first_paid_month: ['comm_cutovers', 'comm_runs', 'users'],
  commission_order_period_locked: ['comm_order_releases', 'comm_runs'],
  commit_sales_import_batch: ['comm_order_releases', 'comm_runs', 'sales_import_batches', 'sales_order_open_bill_tags', 'sales_orders'],
  // Today's CRM chat button (mig 20261014120000): one's own chats' unread, under crm_contacts' own row policy.
  crm_my_unread: ['crm_contact_prefs', 'crm_contacts'],
  dashboard_summary: [
    'approval_requests', 'bank_accounts', 'base_rate_history', 'companies', 'departments', 'dept_pools', 'director_payouts',
    'fund_source_repayments', 'fund_sources', 'hr_staff_costs', 'invoice_payout_pool', 'invoices', 'journal_entries',
    'journal_lines', 'loans', 'overdue_records', 'repayments', 'users', 'venture_pool',
  ],
  employee_chart_lifecycle: ['comm_hierarchy', 'comm_ranks', 'comm_schemes', 'comm_sub_department_directors', 'comm_sub_departments', 'departments', 'hr_staff_costs', 'titles'],
  erp_feed_close_month: ['comm_sub_departments', 'departments', 'erp_feed_closed_months', 'users'],
  erp_feed_reopen_month: ['erp_feed_closed_months', 'erp_sync_events'],
  erp_sync_ignore_agent: ['comm_agent_aliases', 'comm_ignored_agents', 'comm_order_releases', 'comm_runs', 'comm_sub_departments', 'departments', 'sales_import_batches', 'sales_order_lines', 'sales_orders'],
  erp_sync_ignored_agents: ['comm_ignored_agents', 'sales_orders'],
  erp_sync_sub_department: ['comm_sub_departments', 'departments'],
  erp_sync_unignore_agent: ['comm_ignored_agents', 'comm_order_releases', 'comm_runs', 'comm_sub_departments', 'departments', 'sales_import_batches', 'sales_order_lines', 'sales_orders'],
  erp_sync_unmatched_agents: ['comm_sub_departments', 'departments', 'sales_import_batches', 'sales_orders'],
  get_director_advance_opening_balance: ['director_advance_offsets', 'director_payouts'],
  gl_net_by_account: ['journal_entries', 'journal_lines'],
  // The ERP's own path is the service role; Comm Cal's "reopen a month" replays
  // the held deliveries through it under the session (replayHeldErpEvents).
  // (Its body says "claims" only in a comment.)
  // Since 20261013010000 every way out also writes the ERP audit trail and asks
  // whether a salesperson's standing close gave the commission.
  ingest_erp_sales_order: [
    'comm_agent_aliases', 'comm_brands', 'comm_cutovers', 'comm_item_groups', 'comm_order_releases', 'comm_organisers',
    'comm_products', 'comm_runs', 'comm_salesperson_closes', 'comm_schemes', 'comm_sub_departments', 'comm_upsales',
    'comm_venue_events', 'comm_venues', 'departments', 'erp_feed_settings', 'erp_sync_events', 'sales_import_batches',
    'sales_order_erp_changes', 'sales_order_lines', 'sales_order_open_bill_tags', 'sales_orders',
  ],
  ladder_delete_level: ['title_levels', 'titles'],
  ladder_insert_level: ['title_levels'],
  lookup_eis: ['eis_act800_schedule'],
  lookup_epf: ['epf_third_schedule'],
  lookup_socso: ['socso_act4_schedule'],
  match_erp_salesperson: ['comm_agent_aliases', 'comm_order_releases', 'comm_runs', 'comm_sub_departments', 'departments', 'sales_import_batches', 'sales_order_lines', 'sales_order_open_bill_tags', 'sales_orders'],
  // Transfer from the waiting list (mig 20261010150000): the roster row as the caller; the request through two DEFINER functions.
  member_transfer_waiting: ['hr_staff_costs', 'titles'],
  next_account_code: ['chart_of_accounts'],
  recost_sales_order_lines: ['catalogue_combo_prices', 'catalogue_live_combos', 'catalogue_option_prices', 'catalogue_skus', 'comm_order_releases', 'comm_runs', 'erp_fabrics', 'erp_products', 'sales_import_batches', 'sales_order_lines', 'sales_orders'],
  revenue_apply_fair_calendar: ['comm_order_releases', 'comm_organisers', 'comm_runs', 'comm_venue_events', 'hr_staff_costs', 'sales_import_batches', 'sales_order_lines', 'sales_orders'],
  revenue_dismiss_double_claim: ['comm_double_claim_dismissals', 'comm_order_releases', 'comm_runs', 'hr_staff_costs', 'sales_import_batches', 'sales_orders', 'users'],
  revenue_exclude_order: ['comm_order_releases', 'comm_runs', 'comm_sub_departments', 'departments', 'sales_import_batches', 'sales_order_exclusions', 'sales_order_lines', 'sales_order_open_bill_tags', 'sales_orders', 'users'],
  revenue_fair_calendar: ['comm_organisers', 'comm_venue_events', 'comm_venues', 'sales_import_batches', 'sales_orders'],
  revenue_fair_calendar_moves: ['comm_order_releases', 'comm_organisers', 'comm_runs', 'comm_venue_events', 'hr_staff_costs', 'sales_import_batches', 'sales_orders'],
  revenue_include_order: ['comm_order_releases', 'comm_runs', 'comm_sub_departments', 'departments', 'sales_import_batches', 'sales_order_exclusions', 'sales_order_lines', 'sales_order_open_bill_tags', 'sales_orders', 'users'],
  revenue_move_order: ['comm_agent_aliases', 'comm_order_releases', 'comm_runs', 'comm_sub_departments', 'departments', 'sales_import_batches', 'sales_order_lines', 'sales_order_open_bill_tags', 'sales_order_reassignments', 'sales_order_shares', 'sales_orders', 'users'],
  revenue_month_orders: ['comm_cost_ratios', 'comm_item_groups', 'comm_kpi_items', 'comm_organisers', 'comm_schemes', 'comm_venue_events', 'comm_venues', 'hr_staff_costs', 'sales_import_batches', 'sales_order_lines', 'sales_order_open_bill_tags', 'sales_orders'],
  revenue_pay_lines_closed: [],
  revenue_possible_double_claims: ['comm_double_claim_dismissals', 'comm_order_releases', 'comm_runs', 'hr_staff_costs', 'sales_import_batches', 'sales_orders'],
  revenue_restore_double_claim: ['comm_double_claim_dismissals'],
  revenue_set_order_brand: ['comm_brands', 'comm_order_releases', 'comm_runs', 'sales_import_batches', 'sales_order_brand_picks', 'sales_order_lines', 'sales_orders', 'users'],
  revenue_uncosted_products: ['catalogue_skus', 'comm_item_groups', 'comm_schemes', 'erp_products', 'sales_import_batches', 'sales_order_lines', 'sales_orders'],
  venue_event_organiser_for_order: ['comm_organisers', 'comm_venue_events', 'comm_venues'],
}

/**
 * The functions the app calls that run as their OWNER (SECURITY DEFINER,
 * production 2026-10-09): their reads meet no row policy — each asks for its
 * own action (PR3b). A new rpc must be put here or in INVOKER_READS.
 */
export const DEFINER_RPCS: ReadonlySet<string> = new Set([
  // People › Invite user (mig 20261016170000): which logins have an invite link not used yet — auth.users, Logins & invites · View.
  'account_invite_states',
  // …and the login itself (mig 20261020190000): the portal user, put on the person — Permissions · Create.
  'account_attach_login',
  'adjust_revenue_payroll_commission', 'amend_fund_source', 'amend_fund_source_from', 'amend_issued_invoice', 'amend_loan',
  'amend_loan_from', 'amend_loan_repayment', 'amend_loan_repayment_date', 'amend_voucher_date', 'approve_dept_payment_expense',
  'approve_payroll_run', 'approve_single_voucher', 'approve_voucher_batch', 'approve_voucher_batch_partial', 'audit_changes', 'audit_overview',
  // The CRM (crm-actions.ts): each asks who may first — crm_me / crm_can_reply / crm_sees_all, the IR scope (migs 20261002*–20261009230000).
  'crm_can_reply', 'crm_my_can', 'crm_people', 'crm_record_out', 'crm_set_reaction',
  // Cold lead templates (mig 20261011140000): both ask crm_manages().
  'crm_template_statuses', 'crm_template_submitted',
  // CRM Desktop rev 1 (mig 20261013100000): asks crm_manages().
  'crm_save_showroom_extras',
  // CRM photos, videos and voice notes (mig 20261013240000): asks crm_can_reply().
  'crm_set_out_media',
  // CRM Desktop v2's Channels (mig 20261015100000): asks crm_manages().
  'crm_note_channel_save',
  // Settings › General (mig 20261018100000): crm_me() first — anybody in the CRM reads the reply lines and switches.
  'crm_settings_read',
  // An ad's name from Ads Manager (mig 20261019100000): the webhooks' service role alone — EXECUTE for nobody else.
  'crm_ads_unnamed', 'crm_meta_name_ad',
  // Auto-replies sent (mig 20261019120000): the webhooks' service role alone — EXECUTE for nobody else.
  'crm_auto_reply_due', 'crm_auto_reply_claim', 'crm_auto_reply_done',
  // The Product List (mig 20261014100000): a bill and a scheme never open to its key — the costing gaps ask
  // Product List · View, the cost setting Product List · Edit, both running as their owner.
  'revenue_costing_gaps', 'catalogue_save_cost_setting',
  'close_approvals_for_voided_voucher', 'create_loan_with_approval', 'create_payroll_disbursement_vouchers', 'save_director_salary_results',
  'bank_gl_codes', 'bridge_mirror_slices', 'bridge_ref_flags', 'build_hr_cost_submission_payload', 'bump_bank_balance',
  'bump_bank_for_paid_credit', 'calculate_dept_np', 'cancel_dept_payment_request', 'cancel_loan_and_approval',
  'change_account_type', 'claim_create_payment_voucher', 'claim_payment_queue', 'comm_effective_direct_line_limits',
  'comm_home_sub_department', 'comm_open_bill_on', 'comm_staff_can_recruit', 'create_manual_journal_voucher',
  'create_payroll_statutory_selection', 'current_actions', 'current_permissions', 'current_sensitive_fields', 'current_tabs',
  'delete_manual_journal_voucher', 'delete_voucher_attachment', 'department_modes', 'department_set_cost_model',
  'dept_invoice_settlements', 'dept_request_pv_rejected', 'director_payroll_complete', 'director_payroll_uncomplete',
  // HOUZS Venture's director share (migs 20261013170000 / 233000): Director Salary · View / Edit.
  'director_hv_share_of', 'director_hv_share_save',
  'director_private_fields', 'erp_feed_month_closed', 'erp_feed_secret', 'erp_link_drop_secret', 'erp_link_put_secret',
  'execute_fund_source_cancel', 'execute_loan_cancel', 'generate_invoices_from_request', 'generate_monthly_invoices',
  'generate_pv_for_dept_request', 'get_dept_opex_rows', 'get_director_ctc_by_company', 'get_hr_cost_submissions_list',
  'get_hr_cost_summary', 'get_payroll_accrual_totals', 'get_payroll_accrual_totals_for', 'get_payroll_breakdown_by_pool',
  'get_payroll_funding_paid', 'get_staff_billing_allocation', 'get_staff_own_share_allocation', 'get_submitted_hr_summary',
  'hr_dashboard_summary', 'log_data_access', 'lookup_pcb', 'mark_journal_entry_reversed', 'member_admin_brand_weeks',
  'member_admin_claim_settings', 'member_admin_save_claim_settings',
  // People › Member services › Food claim (mig 20261013150000): member_is_manager, and the save member.manage too.
  'member_admin_food_claim', 'member_admin_save_food_claim',
  // Transport claim's ⋯ — who may claim it (mig 20261020220000).
  'member_admin_transport_claim', 'member_admin_save_transport_claim',
  'member_capacity_of', 'member_process_all_queues',
  'member_sub_department_requests',
  // Sales Groups › Waiting list's flow (mig 20261010140000): each asks member_is_manager (the form also lets in member_requests).
  'member_waiting_form', 'member_save_waiting_form', 'member_fail_waiting', 'member_waiting_transfer',
  // …and the Replacement list's form (mig 20261011130000), the same gates.
  'member_replacement_form', 'member_save_replacement_form',
  // The waiting list's "+" (mig 20261011230000): member.manage and member_is_manager, both.
  'member_waiting_add', 'member_waiting_add_form',
  // …and an applicant's signed form uploaded in their drawer (mig 20261020130000): the same two.
  'member_waiting_attach_form',
  // …and the drawer's Edit (mig 20261020210000): the same two.
  'member_waiting_edit',
  // Member services' readers (mig 20261010160000): member_requests_manage / member_memos_manage.
  'member_admin_request_facts', 'member_memo_reads',
  // People › Documentation (mig 20261011070000): each asks has_any_action for its Documentation cell; the
  // member's two ask member_staff_id().
  'hr_documentation', 'hr_documentation_file', 'hr_documentation_log', 'hr_document_add', 'hr_document_delete',
  'hr_letter_type_add', 'hr_letter_type_set_compulsory', 'hr_letter_type_delete', 'hr_letter_file',
  'hr_publish_type_add', 'hr_publish_type_delete', 'hr_publish', 'member_documents', 'member_document_open',
  // Withdraw letter and files that really go (mig 20261011170000): each asks Documentation · Edit.
  'hr_letter_withdraw', 'hr_documentation_leftovers', 'hr_documentation_files_removed',
  // Withdraw a published memo (mig 20261011200000): Documentation · Edit.
  'hr_memo_withdraw',
  // The Data center as a Drive (mig 20261012220000): its read and a file's path ask Documentation · View, a folder or
  // a file made Create, renamed or deleted Edit.
  'hr_drive', 'hr_drive_file', 'hr_drive_log', 'hr_drive_folder_add', 'hr_drive_folder_rename', 'hr_drive_folder_delete',
  'hr_drive_file_add', 'hr_drive_file_delete',
  // …its Bin and Move to… (mig 20261013183000): Restore, Delete forever, Empty bin and a folder's move ask Edit; the
  // hourly sweep's purge and its "File deleted" are the service role's (api/member-queue).
  'hr_drive_bin_restore', 'hr_drive_bin_delete', 'hr_drive_bin_empty', 'hr_drive_folder_move', 'hr_drive_bin_purge',
  'hr_drive_bin_files_gone',
  // A person's own, View only me, Move / Copy (mig 20261014190000): a file's move, the copy's plan and its record, the two
  // settings and a letter's share ask Documentation (Create / Edit; the plan View and Create); one's own documents answer
  // for the caller's People record only; somebody else's (the Revenue app's View as) asks Documentation · View.
  'hr_drive_file_move', 'hr_drive_copy_plan', 'hr_drive_file_copy', 'hr_drive_folder_copy', 'hr_drive_private', 'hr_drive_member_view',
  'hr_letter_member_view', 'my_documents', 'my_document_open', 'my_documents_of',
  // …and the hourly sweep's day-old objects nobody recorded (mig 20261014230000): the service role's alone.
  'hr_drive_orphans',
  // The Revenue app's View as (mig 20261011110000): has_any_action(documentation.view).
  'member_documents_of',
  // A replacement runs itself on its date (mig 20261010170000): HR's two ask member_is_manager; the
  // hourly sweep is the service role's (api/member-queue).
  'member_schedule_replacement', 'member_unschedule_replacement', 'member_run_due_replacements',
  // The CRM's due notices (mig 20261014240000): the hourly sweep's, the service role's alone.
  'notify_crm_due',
  // The Revenue app's Waiting list & replacements (mig 20261010190000): member_requests, or member_is_manager for View as.
  'member_waiting_queue',
  // People › Permissions by view and tab (migs 20261011010000, 20261011020000): each asks has_perm('permissions_manage').
  'permission_template_tabs_save', 'permission_user_tabs_set', 'permission_template_delete', 'permission_title_move',
  // "+ New template"'s window (mig 20261011233200): has_any_action(accounts.manage), then the two above ask permissions_manage.
  'permission_template_new',
  // Hiring (migs 20261011080000, 20261011080100, 20261011160000, 20261011210000): each asks its Hiring cell itself (view / create / edit / approve).
  'hiring_board', 'hiring_file_path', 'hiring_resume_downloaded', 'hiring_submit', 'hiring_acknowledge', 'hiring_request_info',
  'hiring_decline', 'hiring_set_owner', 'hiring_set_assist', 'hiring_fill', 'hiring_cancel', 'hiring_reopen', 'hiring_candidate_add',
  'hiring_candidate_edit', 'hiring_candidate_stage', 'hiring_save_form_fields', 'hiring_save_candidate_fields', 'hiring_source_add',
  'hiring_source_set_active', 'hiring_source_remove', 'hiring_talent_save', 'hiring_talent_invite', 'hiring_talent_update',
  'hiring_talent_remove', 'hiring_files_add', 'hiring_file_replace', 'hiring_file_remove', 'hiring_file_type_add', 'hiring_file_downloaded',
  'hiring_orphan_files', 'hiring_file_type_rename', 'hiring_file_type_set_active',
  // The Talent Bank as a Drive (mig 20261013030000): its read asks Hiring · View, a folder, a talent or a file added
  // Create, renamed, deleted or moved Edit.
  'hiring_bank', 'hiring_bank_folder_add', 'hiring_bank_folder_rename', 'hiring_bank_folder_delete', 'hiring_bank_move',
  'hiring_bank_add_talent', 'hiring_bank_file_add', 'hiring_bank_file_delete', 'hiring_bank_folder_move', 'hiring_bank_move_all',
  // …its Bin (mig 20261013061500): Restore, Delete forever and Empty bin ask Edit.
  'hiring_bank_bin_restore', 'hiring_bank_bin_delete', 'hiring_bank_bin_empty',
  // …and Admin › Guest Link's department rename, which takes the bank's people along (guest_link.edit).
  'guest_link_rename_department',
  // The hourly sweep's (api/member-queue, the service role — mig 20261011210000): Hiring's day-old leftovers, and
  // (mig 20261013061500) what has waited 30 days in the Talent Bank's Bin.
  'hiring_leftovers', 'hiring_bank_bin_purge',
  // View as a person (mig 20261011050000): each asks has_perm(view_switch).
  'view_as_person', 'view_as_people',
  // Admin › Meeting Rooms (mig 20261011090000): each asks has_any_action(rooms.*), a member's revenue_app.view:own.
  'meeting_rooms_range', 'meeting_rooms_booking', 'meeting_rooms_rooms', 'meeting_rooms_people', 'meeting_rooms_book',
  'meeting_rooms_cancel', 'meeting_rooms_save_room', 'meeting_rooms_delete_room',
  // HR › Attendance (mig 20261015030200): each asks has_any_action(attendance.*); a person's own request / punch asks their own staff record.
  'att_config', 'att_month', 'att_requests_list', 'att_ledger', 'att_save_setting', 'att_delete_setting', 'att_set_days', 'att_clear_days',
  'att_set_day_override', 'att_invalidate_punch', 'att_create_request', 'att_decide', 'att_ledger_add', 'att_decide_day', 'att_close_month',
  'att_reopen_month', 'att_register',
  // …the user's answers (mig 20261015200000): a file named for its short link asks View, Remind all Edit.
  'att_file', 'att_remind',
  // Me (mig 20261017100000): each answers for the caller's own People record only — one's month, today, line, team,
  // record and paid payslips — and writes only one's own (the punch notice read, one's photo); one's punch and an MC
  // filed on one's own request ask their own staff record (mig 20261015200000).
  'att_me', 'att_me_today', 'att_my_team', 'att_my_org', 'my_record', 'my_payslips', 'att_punch_notice_ack', 'my_photo_set',
  'att_punch', 'att_request_attach',
  // Admin › Guest Link (mig 20261011091000): each asks has_any_action(guest_link.* / rooms.view); the guest page's
  // five (page, day, book, cancel, hire) are anon's by name and check the link's code instead.
  'guest_link_admin', 'guest_link_set', 'guest_link_new_code', 'guest_link_room', 'guest_link_save_subsidiary',
  'guest_link_remove_subsidiary', 'guest_link_legend', 'guest_link_page', 'guest_link_day', 'guest_link_book', 'guest_link_cancel', 'guest_link_hire',
  // Notifications and phone push (mig 20261011180000): each asks a sign-in and answers only the caller’s own; the outbox asks the server’s secret.
  'notifications_mine', 'notifications_read', 'notification_topics_sync', 'push_subscribe', 'push_unsubscribe', 'push_outbox_take', 'push_outbox_done',
  // Change password (mig 20261012000000): whether the caller's own login is one a People record names — nothing else.
  'my_login_is_personal',
  // Request to change email (mig 20261016190000): one's own request and latest (their People record), Withdraw
  // through the module's own (their own while it waits); HR's last step on a login's email asks Attendance · Approve.
  'request_my_email_change', 'my_email_change', 'att_cancel_request', 'att_login_email_change',
  // IT support (mig 20261021020100): a request sent and one's own read by any active sign-in; everybody's and a note's
  // status by IT requests · View / Edit (a sender replies on their own); a file's path to its sender or View; the desk's topic.
  'it_request_submit', 'my_it_requests', 'it_requests_desk', 'it_request_note', 'it_request_file', 'it_desk_listen',
  // An exact request, including older than either list (mig 20261021030000): active sender or IT requests · View.
  'it_request_get',
  // Share order (mig 20261021150100): a bill's share sheet, a request sent and withdrawn by the salesperson on the bill
  // (the send also asks Profile · Requests · Create); answered by a colleague it names; one's own list (View as: the
  // Principal's member context); Comm Cal's Requests read by Revenue · View / Edit, decided by Revenue · Edit.
  'member_share_order_context', 'member_share_order_send', 'member_share_order_answer', 'member_share_order_cancel',
  'member_share_requests', 'revenue_share_requests', 'revenue_share_request_decide',
  // One's own memos, in every view (mig 20261012210000): the login's own memos and receipt (a sign-in, their People
  // record); a memo's file to its person or to Documentation · View; Publish › Preview asks Documentation · View.
  'my_memos', 'my_memo_mark', 'memo_attachment', 'hr_memo_preview',
  // A memo acknowledged with a signature (mig 20261021013000): one's own signature on a memo one acknowledged (a
  // sign-in, their own receipt); a Data center letter's, to Documentation · View.
  'my_memo_signature', 'hr_letter_signature',
  // Sub-departments per person (mig 20261016180000): the caller's own reach; a person's, to whoever reads their
  // boxes; their ticks, by whoever manages permissions.
  'my_sub_department_reach', 'person_sub_department_reach', 'permission_user_reach_set',
  // A person's own Salary / NRIC / Bank (mig 20261016210000): by whoever manages permissions.
  'permission_user_sensitive_set',
  'mint_credit_note_no', 'mint_invoice_no', 'next_staff_code', 'payroll_batch_accrual_sums', 'payroll_cancel_topup',
  'payroll_close_month', 'payroll_complete_rows', 'payroll_line_accounts', 'payroll_month_closed', 'payroll_month_status',
  'payroll_open_topup', 'payroll_reopen_month', 'payroll_send_back_batch', 'payroll_submit_batch', 'payroll_uncomplete_rows',
  'permission_history', 'permission_template_create', 'permission_template_save', 'permission_title_set_template',
  'permission_user_cells_set', 'permission_user_clear_legacy', 'post_journal_entry_as_caller', 'provision_full_department',
  'reassign_invoice_gl_account', 'reassign_voucher_gl_account', 'refresh_base_rate', 'reject_dept_payment_request',
  'reject_invoice_request', 'reject_payroll_run', 'rename_account_code', 'reopen_payroll_run', 'request_loan_cancel',
  'return_voucher_to_draft', 'revenue_pay_preview', 'revenue_payroll_adjustments', 'revenue_save_pay_lines',
  'reverse_voucher_pool_rows', 'revert_terms_change', 'rnp_invoice_events', 'save_revenue_payroll_row',
  'set_fund_source_min_pay_interest', 'set_fund_source_notes', 'set_fund_source_repayment_start', 'set_loan_funding_source',
  'set_loan_min_pay_interest', 'set_loan_repayment_start', 'staff_private_fields',
  'team_directory', 'team_org_chart', 'update_manual_journal_voucher', 'void_issued_invoice', 'void_loan_repayment',
  'withdraw_pending_fund_source',
])

/**
 * An INVOKER function whose reads of some tables are FOR WHOEVER MAY: its
 * caller's gate does not open them, and their part of the answer is what the
 * caller's own other actions show. dashboard_summary's director payouts and
 * staff are the Principal's (Director Salary, HR Costing), never Finance's.
 */
export const INVOKER_PARTIAL: Readonly<Record<string, readonly string[]>> = {
  dashboard_summary: ['director_payouts', 'hr_staff_costs'],
}

/** SECURITY INVOKER trigger functions → the tables they read, as whoever wrote. */
export const TRIGGER_READS: Readonly<Record<string, readonly string[]>> = {
  coa_reject_child_under_posted_account: ['chart_of_accounts', 'journal_lines'],
  guard_commission_release_scope: ['comm_runs'],
  comm_rank_defs_propagate: ['comm_ranks'],
  comm_ranks_follow_rank_def: ['comm_rank_defs'],
  guard_commission_run_scope: ['comm_schemes', 'comm_statement_lines', 'comm_statements', 'sales_import_batches', 'sales_order_lines', 'sales_orders'],
  comm_upsales_after_settled: [],
  comm_upsales_closed_month_guard: ['hr_staff_costs'],
  comm_upsales_guard: ['comm_order_releases', 'comm_runs'],
  comm_venue_events_canonical: ['comm_venues'],
  comm_venue_events_restamp_orders: ['comm_order_releases', 'comm_runs', 'comm_venue_events', 'comm_venues', 'sales_import_batches', 'sales_orders'],
  comm_venues_alias_depth: ['comm_venues'],
  comm_venues_merge_events: ['comm_venue_events'],
  block_repayment_on_inactive_fund_source: ['fund_sources'],
  fund_sources_validate_account_code: ['chart_of_accounts', 'fund_sources'],
  journal_entries_set_segment: ['claims', 'departments', 'dept_payment_requests', 'director_monthly_payroll', 'director_payouts', 'directors', 'hr_monthly_payroll', 'invoices', 'payment_vouchers', 'payroll_voucher_lines'],
  journal_lines_reject_header_post: ['chart_of_accounts', 'journal_lines'],
  recompute_statement_totals: ['monthly_statement_lines', 'monthly_statements'],
  pvs_enforce_sum_matches_voucher: ['payment_voucher_sources', 'payment_vouchers'],
  mark_invoice_paid_on_voucher_insert: ['credit_notes', 'invoices', 'payment_vouchers'],
  mark_invoice_paid_on_voucher_paid: ['credit_notes', 'invoices', 'payment_vouchers'],
  validate_payroll_payment_request_insert: ['director_monthly_payroll', 'director_salary_submissions', 'directors', 'payroll_batch_lines', 'payroll_batches', 'payroll_runs'],
  block_repayment_on_inactive_loan: ['loans'],
  guard_commission_batch_scope: ['comm_order_releases', 'comm_runs', 'comm_sub_departments', 'departments'],
  sales_order_brand_picks_guard: ['comm_order_releases', 'comm_runs', 'sales_import_batches', 'sales_orders'],
  sales_order_exclusions_apply: ['sales_orders'],
  sales_order_exclusions_guard: ['comm_order_releases', 'comm_runs', 'sales_import_batches', 'sales_orders'],
  sales_order_reassignments_apply: ['comm_agent_aliases', 'sales_orders'],
  sales_order_reassignments_guard: ['comm_order_releases', 'comm_runs', 'sales_import_batches', 'sales_orders'],
  guard_commission_order_child: ['comm_order_releases', 'comm_runs', 'sales_import_batches', 'sales_orders'],
  sales_order_lines_apply_combos: ['catalogue_combo_prices', 'catalogue_live_combos', 'catalogue_option_prices', 'erp_products', 'sales_order_lines', 'sales_orders'],
  sales_order_lines_fill_cost: ['catalogue_option_prices', 'catalogue_skus', 'erp_fabrics', 'erp_products', 'sales_orders'],
  guard_open_bill_scope: ['sales_import_batches', 'sales_orders'],
  sales_order_shares_guard: ['comm_order_releases', 'comm_runs', 'sales_import_batches', 'sales_order_shares', 'sales_orders'],
  guard_commission_order_scope: ['comm_order_releases', 'comm_runs', 'sales_import_batches'],
  sales_orders_resolve_fair: ['comm_venue_events', 'comm_venues'],
}

/** Which table each INVOKER trigger fires on, and for what. */
export const TRIGGERS: ReadonlyArray<{ table: string; fn: string; events: readonly WriteCommand[] }> = [
  { table: 'chart_of_accounts', fn: 'coa_reject_child_under_posted_account', events: ['INSERT', 'UPDATE'] },
  { table: 'comm_order_releases', fn: 'guard_commission_release_scope', events: ['INSERT', 'UPDATE'] },
  { table: 'comm_rank_defs', fn: 'comm_rank_defs_propagate', events: ['UPDATE'] },
  { table: 'comm_ranks', fn: 'comm_ranks_follow_rank_def', events: ['INSERT', 'UPDATE'] },
  { table: 'comm_runs', fn: 'guard_commission_run_scope', events: ['INSERT', 'UPDATE'] },
  { table: 'comm_upsales', fn: 'comm_upsales_after_settled', events: ['INSERT', 'UPDATE'] },
  { table: 'comm_upsales', fn: 'comm_upsales_closed_month_guard', events: ['INSERT', 'DELETE', 'UPDATE'] },
  { table: 'comm_upsales', fn: 'comm_upsales_guard', events: ['INSERT', 'DELETE', 'UPDATE'] },
  { table: 'comm_venue_events', fn: 'comm_venue_events_canonical', events: ['INSERT', 'UPDATE'] },
  { table: 'comm_venue_events', fn: 'comm_venue_events_restamp_orders', events: ['INSERT', 'DELETE', 'UPDATE'] },
  { table: 'comm_venues', fn: 'comm_venues_alias_depth', events: ['INSERT', 'UPDATE'] },
  { table: 'comm_venues', fn: 'comm_venues_merge_events', events: ['UPDATE'] },
  { table: 'fund_source_repayments', fn: 'block_repayment_on_inactive_fund_source', events: ['INSERT'] },
  { table: 'fund_sources', fn: 'fund_sources_validate_account_code', events: ['INSERT', 'UPDATE'] },
  { table: 'journal_entries', fn: 'journal_entries_set_segment', events: ['INSERT'] },
  { table: 'journal_lines', fn: 'journal_lines_reject_header_post', events: ['INSERT', 'UPDATE'] },
  { table: 'monthly_statement_lines', fn: 'recompute_statement_totals', events: ['INSERT', 'DELETE', 'UPDATE'] },
  { table: 'payment_voucher_sources', fn: 'pvs_enforce_sum_matches_voucher', events: ['INSERT', 'DELETE', 'UPDATE'] },
  { table: 'payment_vouchers', fn: 'mark_invoice_paid_on_voucher_insert', events: ['INSERT'] },
  { table: 'payment_vouchers', fn: 'mark_invoice_paid_on_voucher_paid', events: ['UPDATE'] },
  { table: 'payroll_payment_requests', fn: 'validate_payroll_payment_request_insert', events: ['INSERT'] },
  { table: 'repayments', fn: 'block_repayment_on_inactive_loan', events: ['INSERT'] },
  { table: 'sales_import_batches', fn: 'guard_commission_batch_scope', events: ['INSERT', 'DELETE', 'UPDATE'] },
  { table: 'sales_order_brand_picks', fn: 'sales_order_brand_picks_guard', events: ['INSERT', 'DELETE', 'UPDATE'] },
  { table: 'sales_order_exclusions', fn: 'sales_order_exclusions_apply', events: ['INSERT', 'DELETE'] },
  { table: 'sales_order_exclusions', fn: 'sales_order_exclusions_guard', events: ['INSERT', 'DELETE', 'UPDATE'] },
  { table: 'sales_order_reassignments', fn: 'sales_order_reassignments_apply', events: ['INSERT', 'DELETE', 'UPDATE'] },
  { table: 'sales_order_reassignments', fn: 'sales_order_reassignments_guard', events: ['INSERT', 'DELETE', 'UPDATE'] },
  { table: 'sales_order_lines', fn: 'guard_commission_order_child', events: ['INSERT', 'DELETE', 'UPDATE'] },
  { table: 'sales_order_lines', fn: 'sales_order_lines_apply_combos', events: ['INSERT'] },
  { table: 'sales_order_lines', fn: 'sales_order_lines_fill_cost', events: ['INSERT'] },
  { table: 'sales_order_open_bill_tags', fn: 'guard_commission_order_child', events: ['INSERT', 'DELETE', 'UPDATE'] },
  { table: 'sales_order_open_bill_tags', fn: 'guard_open_bill_scope', events: ['INSERT', 'UPDATE'] },
  { table: 'sales_order_shares', fn: 'sales_order_shares_guard', events: ['INSERT', 'DELETE', 'UPDATE'] },
  { table: 'sales_orders', fn: 'guard_commission_order_scope', events: ['INSERT', 'DELETE', 'UPDATE'] },
  { table: 'sales_orders', fn: 'sales_orders_resolve_fair', events: ['INSERT', 'UPDATE'] },
]

/** Row policies that read another table: whoever P's policy is asked for must read Q. */
export const POLICY_READS: ReadonlyArray<{ on: string; command: 'SELECT' | WriteCommand; reads: string }> = [
  { on: 'hr_monthly_payroll', command: 'SELECT', reads: 'hr_staff_costs' },
  { on: 'invoice_lines', command: 'DELETE', reads: 'invoices' },
  { on: 'invoice_lines', command: 'UPDATE', reads: 'invoices' },
  { on: 'journal_lines', command: 'INSERT', reads: 'journal_entries' },
  { on: 'journal_lines', command: 'SELECT', reads: 'journal_entries' },
  { on: 'monthly_statement_lines', command: 'DELETE', reads: 'monthly_statements' },
  { on: 'payment_attachments', command: 'SELECT', reads: 'payment_vouchers' },
  { on: 'payment_voucher_sources', command: 'DELETE', reads: 'payment_vouchers' },
]

/** Views that read under the caller's own policies (security_invoker) → their tables. */
export const INVOKER_VIEWS: Readonly<Record<string, readonly string[]>> = {
  approval_requests_with_target: ['approval_requests', 'users'],
  catalogue_live_combos: ['catalogue_combos'],
  fund_sources_weighted_cost: ['fund_sources'],
  invoice_payout_pool_balance: ['invoice_payout_pool'],
  loan_outstanding: ['loans', 'repayments'],
  trial_balance: ['chart_of_accounts', 'journal_entries', 'journal_lines'],
  venture_pool_balance: ['venture_pool'],
  // Owner-rights until 20261009070000 — every signed-in session read them whole.
  dept_pool_balances: ['dept_pools'],
  fund_source_outstanding: ['fund_sources', 'fund_source_repayments'],
  hr_monthly_payroll_summary: ['hr_monthly_payroll', 'hr_staff_costs', 'departments'],
}

// ── Putting it together ──────────────────────────────────────────────────────

/**
 * Each function's reaches (permission_functions.scopes): as the migration that
 * seeds them wrote them, then as a later one narrowed them (`UPDATE
 * public.permission_functions SET scopes = ARRAY[…] WHERE key IN (…);` — Dept
 * Pool, OPEX and Department reports to All when the Dept Manager went,
 * 20261017160000).
 */
export function functionScopes(): Record<string, string[]> {
  const dir = resolve(process.cwd(), 'supabase/migrations')
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  const sqlOf = (f: string) => readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n')
  const seed = files.find(f => f.startsWith('20261008120000'))!
  const out: Record<string, string[]> = {}
  for (const m of sqlOf(seed).matchAll(/\('([a-z_]+)',\s+'[^']*',\s+'[A-Za-z]+',\s+ARRAY\[[^\]]*\], ARRAY\[([^\]]*)\]/g)) {
    out[m[1]] = [...m[2].matchAll(/'([a-z]+)'/g)].map(s => s[1])
  }
  for (const f of files.filter(f => f > seed)) {
    for (const m of sqlOf(f).matchAll(/UPDATE public\.permission_functions SET scopes = ARRAY\[([^\]]*)\] WHERE key IN \(([^)]*)\);/g)) {
      const scopes = [...m[1].matchAll(/'([a-z]+)'/g)].map(s => s[1])
      for (const k of m[2].matchAll(/'([a-z_]+)'/g)) out[k[1]] = scopes
    }
  }
  return out
}

/** Each function's least reach (functionScopes). */
export function leastReach(): Record<string, string> {
  return Object.fromEntries(Object.entries(functionScopes()).map(([fn, scopes]) =>
    [fn, ['own', 'dept', 'all'].find(s => scopes.includes(s)) ?? 'all']))
}

/** One way to a table read: the gates of one path (somebody who reads holds one action of one of them). */
export interface Need {
  table: string
  /** Every gate of the path; ONE of them covered is enough. Empty = the reader is the service role. */
  gates: Gate[]
  source: string
}

/** A read that reaches no gate and is none of the above. */
export interface Loose { table: string; root: string; source: string }

export function readNeeds(): { needs: Need[]; loose: Loose[]; sites: ReadSite[] } {
  const sites = scanReads(process.cwd(), leastReach(), GUARDS).filter(s => !/^src\/app\/api\//.test(s.file))
  const needs: Need[] = []
  const loose: Loose[] = []
  const expand = (t: string): string[] => [t, ...(INVOKER_VIEWS[t] ?? [])]
  const NOT_CALLED_SET = new Set(NOT_CALLED)
  for (const s of sites) {
    const key = `${s.file}#${s.fn}`
    if (key in WHOEVER_MAY) continue
    const at = `${s.file}:${s.line}`
    let tables: string[]
    if (s.rpc) {
      const partial = new Set(INVOKER_PARTIAL[s.rpc] ?? [])
      tables = (INVOKER_READS[s.rpc] ?? []).filter(t => !partial.has(t)).flatMap(expand)
    } else if (s.dynamic) {
      tables = (DYNAMIC_TABLES[key] ?? []).flatMap(expand)
      if (!DYNAMIC_TABLES[key]) loose.push({ table: '(dynamic)', root: key, source: at })
    } else {
      tables = [s.table!, ...(s.embeds ?? [])].flatMap(expand)
    }
    for (const table of new Set(tables)) {
      const source = `${at}${s.rpc ? ` rpc ${s.rpc}` : ''}`
      for (const path of s.paths) {
        const service = path.some(g => g.wants.includes('service_role'))
        needs.push({ table, gates: service ? [] : path, source })
      }
      for (const root of s.roots) {
        if (NOT_CALLED_SET.has(root)) continue
        const branch = BRANCHES[root]
        if (branch) {
          const opening = Object.entries(branch).filter(([, ts]) => ts.includes(table)).map(([w]) => w)
          if (opening.length) needs.push({ table, gates: [{ wants: opening, text: `${root} branch` }], source })
          else loose.push({ table, root, source })
          continue
        }
        loose.push({ table, root, source })
      }
    }
  }
  // The table's own writers read the rows they change.
  for (const [table, commands] of Object.entries(TABLE_WRITES)) {
    for (const [command, wants] of Object.entries(commands)) {
      if (wants?.length) needs.push({ table, gates: [{ wants: [...wants], text: `writes ${command}` }], source: `TABLE_WRITES ${command}` })
    }
  }
  // INVOKER triggers read as whoever wrote.
  for (const tr of TRIGGERS) {
    for (const ev of tr.events) {
      const wants = TABLE_WRITES[tr.table]?.[ev]
      if (!wants?.length) continue
      for (const table of TRIGGER_READS[tr.fn] ?? []) {
        needs.push({ table, gates: [{ wants: [...wants], text: `${tr.fn} on ${tr.table} ${ev}` }], source: `trigger ${tr.fn}` })
      }
    }
  }
  return { needs, loose, sites }
}

/** The policies' subqueries: whoever P lets in (its list, or its writers) must read Q. */
export function policyNeeds(lists: Readonly<Record<string, readonly string[]>>): Need[] {
  return POLICY_READS.flatMap(p => {
    const wants = p.command === 'SELECT' ? lists[p.on] ?? [] : TABLE_WRITES[p.on]?.[p.command] ?? []
    return wants.length ? [{ table: p.reads, gates: [{ wants: [...wants], text: `policy on ${p.on} ${p.command}` }], source: `policy on ${p.on}` }] : []
  })
}
