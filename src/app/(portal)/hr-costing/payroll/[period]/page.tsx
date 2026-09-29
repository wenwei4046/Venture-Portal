import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import { revenuePath, subDeptSlug } from '@/lib/revenue'
import { round2 } from '@/lib/payroll-funding'
import { typedStatutory } from '@/lib/payroll-grid'
import {
  batchesHeadline,
  closeReadiness,
  isTopupKind,
  normaliseMonthStatus,
  statusCounts,
  submitPreview,
  type LifecycleRow,
  type RowStatus,
} from '@/lib/payroll-lifecycle'
import PayrollGrid, { type PayrollRowData } from '../_components/PayrollGrid'
import CopyFromLastMonthButton from '../_components/CopyFromLastMonthButton'
import CreatePeriodButton from '../_components/CreatePeriodButton'
import SubmitToFinanceButton from '../_components/SubmitToFinanceButton'
import SaveAllButton from '../_components/SaveAllButton'
import TotalCloseButton from '../_components/TotalCloseButton'
import PayrollBatches from '../_components/PayrollBatches'
import { PayrollDraftProvider } from '../_components/PayrollDraftContext'
import MoreActionsDropdown from '../_components/MoreActionsDropdown'
import { deletePayrollPeriod } from '../actions'
import PeriodPicker from '../_components/PeriodPicker'
import { StatCard, StatCards } from '@/components/sheet/StatCard'

interface PageProps {
  params: Promise<{ period: string }>
}

function formatPeriodLabel(period: string): string {
  const d = new Date(period + 'T00:00:00Z')
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

interface LineRow {
  scope: 'staff' | 'directors'
  row_id: string
  ctc: number | string
  payroll_batches: { batch_no: number; status: string } | null
}

/**
 * HR › Payroll for one month — the unified Payroll (2026-09-27).
 *
 * Everybody's pay on one grid: staff keyed here, the Revenue team closed on
 * Comm Cal, Directors Completed on Director Salary. Each person moves
 * draft → completed → submitted → paid; Submit to Finance sends the Completed
 * as a batch and stays pressable for the next one; where each batch's money
 * stands is shown beside it (Submissions), never on the button. Right-click
 * somebody already sent to Resubmit them or add a Second payroll; Total Close ends the month.
 */
export default async function PayrollGridPage({ params }: PageProps) {
  const user = await requirePermission('hr_costing')
  const { period } = await params
  if (!/^\d{4}-\d{2}-01$/.test(period)) notFound()

  const supabase = await createClient()
  const monthName = formatPeriodLabel(period)

  const [
    { data: rows, error: payrollError },
    { data: directorRows, error: directorError },
    { data: statusRaw, error: statusError },
    { data: lineRows, error: lineError },
    { data: closeRows },
    { data: commRunRows },
  ] = await Promise.all([
    supabase
      .from('hr_monthly_payroll')
      .select(`
        id, staff_id, period_month, status, source, completed_at, topup_opened_at, topup_kind,
        basic_salary, statutory_allowance, non_statutory_allowance,
        ot_hours, ot_amount, commission_amount, commission_balance, payout_split_version, basic_pay_net, pcb_override_amount, unpaid_leave_days,
        commission_synced_amount, commission_adjustment_amount, commission_adjustment_reason, commission_adjusted_at,
        deduction_amount, skbbk_amount, pay_line_earnings, pay_line_deductions,
        prorata_days_worked, prorata_days_in_month,
        epf_er, epf_ee, socso_er, socso_ee, eis_er, eis_ee, pcb, withholding_tax,
        epf_er_override_amount, epf_ee_override_amount, socso_er_override_amount,
        socso_ee_override_amount, eis_er_override_amount, eis_ee_override_amount,
        statutory_overridden_at,
        gross, net,
        hr_staff_costs (employee_name, tax_mode, departments (name, payroll_source))
      `)
      .eq('period_month', period)
      .order('id'),
    supabase
      .from('director_monthly_payroll')
      .select(`
        id, director_id, employee_name, status, completed_at, topup_opened_at, topup_kind,
        basic_salary, statutory_allowance, non_statutory_allowance, ot_amount, commission_amount,
        no_pay_amount, deduction_amount, skbbk_amount,
        epf_er, epf_ee, socso_er, socso_ee, eis_er, eis_ee, pcb, gross, net
      `)
      .eq('period_month', period)
      .order('employee_name'),
    supabase.rpc('payroll_month_status', { p_period: period }),
    supabase
      .from('payroll_batch_lines')
      .select('scope, row_id, ctc, payroll_batches (batch_no, status)')
      .eq('period_month', period),
    // A salesperson's standing close on Comm Cal is their Complete.
    // (comm_* postdates database.types.ts — untyped-client convention.)
    (supabase as unknown as SupabaseClient)
      .from('comm_salesperson_closes')
      .select('staff_id, closed_at, total_commission, comm_sub_departments (name)')
      .eq('period_month', period)
      .is('reopened_at', null),
    supabase
      .from('comm_runs')
      .select('id, comm_sub_departments (name)')
      .eq('period_month', period)
      .in('status', ['applied', 'locked']),
  ])
  if (payrollError) throw new Error(`Could not load payroll: ${payrollError.message}`)
  if (directorError) throw new Error(`Could not load director payroll: ${directorError.message}`)
  if (statusError) throw new Error(`Could not load the month's batches: ${statusError.message}`)
  if (lineError) throw new Error(`Could not load the month's batch lines: ${lineError.message}`)

  const monthStatus = normaliseMonthStatus(statusRaw)
  const closed = monthStatus.closed

  // What each person's standing batches already sent, and which batches.
  const sent = new Map<string, { ctc: number; nos: number[] }>()
  for (const l of (lineRows ?? []) as unknown as LineRow[]) {
    const batch = Array.isArray(l.payroll_batches) ? l.payroll_batches[0] : l.payroll_batches
    if (!batch || batch.status !== 'submitted') continue
    const key = `${l.scope}:${l.row_id}`
    const s = sent.get(key) ?? { ctc: 0, nos: [] }
    s.ctc = round2(s.ctc + Number(l.ctc))
    s.nos.push(batch.batch_no)
    sent.set(key, s)
  }
  for (const s of sent.values()) s.nos.sort((a, b) => a - b)

  // Comm Cal: the sub-department(s) a salesperson was closed in, for the link.
  const closes = new Map<string, { at: string; subs: string[] }>()
  for (const c of (closeRows ?? []) as unknown as Array<{ staff_id: string; closed_at: string; comm_sub_departments: { name: string } | null }>) {
    const x = closes.get(c.staff_id) ?? { at: c.closed_at, subs: [] }
    if (c.closed_at > x.at) x.at = c.closed_at
    if (c.comm_sub_departments?.name) x.subs.push(c.comm_sub_departments.name)
    closes.set(c.staff_id, x)
  }

  // Statements of an applied run (the whole-month path, retired 2026-09-27):
  // older months still link their commission to them.
  const commRuns = (commRunRows ?? []) as unknown as Array<{ id: string; comm_sub_departments: { name: string } | null }>
  const subDeptOfRun = new Map(commRuns.map(r => [r.id, r.comm_sub_departments?.name ?? null]))
  const { data: commStatementRows } = commRuns.length
    ? await supabase.from('comm_statements').select('staff_id, run_id, total_commission').in('run_id', commRuns.map(r => r.id))
    : { data: null }
  const statementsByStaff = new Map<string, { label: string; href: string }[]>()
  const confirmedCommissionByStaff = new Map<string, number>()
  for (const r of (commStatementRows ?? []) as Array<{ staff_id: string; run_id: string; total_commission: number }>) {
    confirmedCommissionByStaff.set(r.staff_id, round2((confirmedCommissionByStaff.get(r.staff_id) ?? 0) + Number(r.total_commission)))
    const name = subDeptOfRun.get(r.run_id)
    if (name) {
      const statements = statementsByStaff.get(r.staff_id) ?? []
      statements.push({ label: name, href: revenuePath(subDeptSlug(name), period, 'statement', r.staff_id) })
      statementsByStaff.set(r.staff_id, statements)
    }
  }

  const staffRows: PayrollRowData[] = (rows ?? []).map(r => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staff = (r as any).hr_staff_costs
    const revenue = r.source === 'commission' || staff?.departments?.payroll_source === 'commission'
    const close = closes.get(r.staff_id)
    const s = sent.get(`staff:${r.id}`)
    const commCalSub = close?.subs[0] ?? null
    return {
      id: r.id,
      staff_id: r.staff_id,
      staff_name: staff?.employee_name ?? '—',
      dept_name: staff?.departments?.name ?? '—',
      status: r.status,
      source: r.source,
      scope: 'staff',
      origin: revenue ? 'revenue' : 'staff',
      completed_at: r.completed_at,
      topup_opened_at: r.topup_opened_at,
      topup_kind: r.topup_kind,
      batch_nos: s?.nos ?? [],
      submitted_ctc: s?.ctc ?? 0,
      comm_cal_href: revenue && commCalSub ? `${revenuePath(subDeptSlug(commCalSub), period)}?person=${r.staff_id}` : null,
      basic_salary: Number(r.basic_salary),
      statutory_allowance: Number(r.statutory_allowance),
      non_statutory_allowance: Number(r.non_statutory_allowance),
      ot_hours: Number(r.ot_hours),
      ot_amount: Number(r.ot_amount),
      commission_amount: Number(r.commission_amount),
      commission_synced_amount: r.commission_synced_amount == null ? null : Number(r.commission_synced_amount),
      commission_confirmed_amount: confirmedCommissionByStaff.get(r.staff_id) ?? null,
      commission_adjustment_amount: Number(r.commission_adjustment_amount ?? 0),
      commission_adjustment_reason: r.commission_adjustment_reason,
      commission_adjusted_at: r.commission_adjusted_at,
      commission_balance: r.commission_balance == null ? null : Number(r.commission_balance),
      payout_split_version: r.payout_split_version,
      basic_pay_net: r.basic_pay_net == null ? null : Number(r.basic_pay_net),
      pcb_override_amount: r.pcb_override_amount == null ? null : Number(r.pcb_override_amount),
      unpaid_leave_days: Number(r.unpaid_leave_days),
      deduction_amount: Number(r.deduction_amount),
      skbbk_amount: Number(r.skbbk_amount ?? 0),
      pay_line_earnings: Number(r.pay_line_earnings ?? 0),
      pay_line_deductions: Number(r.pay_line_deductions ?? 0),
      prorata_days_worked: r.prorata_days_worked,
      prorata_days_in_month: r.prorata_days_in_month,
      epf_er: Number(r.epf_er),
      epf_ee: Number(r.epf_ee),
      socso_er: Number(r.socso_er),
      socso_ee: Number(r.socso_ee),
      eis_er: Number(r.eis_er),
      eis_ee: Number(r.eis_ee),
      pcb: Number(r.pcb),
      withholding_tax: Number(r.withholding_tax ?? 0),
      statutory_typed: typedStatutory(r),
      statutory_overridden_at: r.statutory_overridden_at,
      tax_mode: staff?.tax_mode ?? 'pcb',
      gross: Number(r.gross),
      net: Number(r.net),
      revenue_payroll: r.source === 'commission' && r.commission_balance != null,
      commission_is_derived: revenue,
      commission_statements: statementsByStaff.get(r.staff_id) ?? [],
      commission_statement_href: statementsByStaff.get(r.staff_id)?.[0]?.href ?? null,
    }
  })

  // Directors: worked out and Completed on Director Salary, read-only here.
  const directorHref = `/director-salary?period=${period.slice(0, 7)}&tab=submission`
  const directors: PayrollRowData[] = (directorRows ?? []).map(d => {
    const s = sent.get(`directors:${d.id}`)
    return {
      id: d.id,
      staff_id: d.director_id ?? d.id,
      staff_name: d.employee_name,
      dept_name: 'Director',
      status: d.status,
      source: 'director',
      scope: 'directors',
      origin: 'director',
      completed_at: d.completed_at,
      topup_opened_at: d.topup_opened_at,
      topup_kind: d.topup_kind,
      batch_nos: s?.nos ?? [],
      submitted_ctc: s?.ctc ?? 0,
      director_href: directorHref,
      basic_salary: Number(d.basic_salary),
      statutory_allowance: Number(d.statutory_allowance),
      non_statutory_allowance: Number(d.non_statutory_allowance),
      ot_hours: 0,
      ot_amount: Number(d.ot_amount),
      commission_amount: Number(d.commission_amount),
      unpaid_leave_days: 0,
      deduction_amount: round2(Number(d.deduction_amount) + Number(d.no_pay_amount)),
      skbbk_amount: Number(d.skbbk_amount),
      prorata_days_worked: 0,
      prorata_days_in_month: 0,
      epf_er: Number(d.epf_er),
      epf_ee: Number(d.epf_ee),
      socso_er: Number(d.socso_er),
      socso_ee: Number(d.socso_ee),
      eis_er: Number(d.eis_er),
      eis_ee: Number(d.eis_ee),
      pcb: Number(d.pcb),
      withholding_tax: 0,
      gross: Number(d.gross),
      net: Number(d.net),
      commission_is_derived: false,
      commission_statement_href: null,
    }
  })

  const gridRows = [...staffRows, ...directors]

  if (gridRows.length === 0) {
    return (
      <div>
        <div className="page-head">
          <div>
            <div className="page-eyebrow">
              <em>I.</em> HR · PAYROLL · {monthName.toUpperCase()}
            </div>
            <h1 className="page-title">{monthName}</h1>
          </div>
          <div className="flex flex-col items-end gap-3">
            <PeriodPicker period={period} />
          </div>
        </div>
        {/* Act on THIS month directly — create draft rows from the staff
            master, or import the InfoTech file for this period. */}
        <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center mb-12">
          <p className="text-sm mb-4">No staff rows for this period yet.</p>
          <div className="flex items-start justify-center gap-3 flex-wrap">
            {closed ? null : <CreatePeriodButton period={period} />}
            <Link
              href={`/hr-costing/payroll/${period}/import`}
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors"
            >
              Import InfoTech →
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const lifecycle: LifecycleRow[] = gridRows.map(r => ({
    id: r.id,
    scope: r.scope,
    origin: r.origin,
    status: r.status as RowStatus,
    name: r.staff_name,
    dept: r.dept_name,
    ctc: round2(r.gross + r.epf_er + r.socso_er + r.eis_er),
    submittedCtc: r.submitted_ctc,
    batchNos: r.batch_nos,
    completedAt: r.completed_at,
    topupOpenedAt: r.topup_opened_at,
    topupKind: isTopupKind(r.topup_kind) ? r.topup_kind : null,
  }))
  const preview = submitPreview(lifecycle)
  const counts = statusCounts(lifecycle)
  const readiness = closeReadiness(lifecycle, !!closed)
  const headline = batchesHeadline(monthStatus.batches)
  const standingBatches = monthStatus.batches.filter(b => b.status === 'submitted').length

  const totals = {
    staff: staffRows.length,
    directors: directors.length,
    gross: gridRows.reduce((s, r) => s + r.gross, 0),
    net: gridRows.reduce((s, r) => s + r.net, 0),
    epf_er: gridRows.reduce((s, r) => s + r.epf_er, 0),
    socso_er: gridRows.reduce((s, r) => s + r.socso_er, 0),
    eis_er: gridRows.reduce((s, r) => s + r.eis_er, 0),
    pcb: gridRows.reduce((s, r) => s + r.pcb, 0),
  }
  // Cost to Company = gross + employer statutory: what Finance funds, and the
  // basis on which shared-services staff are recharged to the subsidiaries.
  const totalCtc = totals.gross + totals.epf_er + totals.socso_er + totals.eis_er
  const peopleNote = `${totals.staff} staff${totals.directors > 0 ? ` · ${totals.directors} director${totals.directors > 1 ? 's' : ''}` : ''}`

  return (
    <PayrollDraftProvider>
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> HR · PAYROLL · {monthName.toUpperCase()}
          </div>
          <h1 className="page-title">{monthName}</h1>
          <p className="pay-status-line text-sm mt-3">
            <span>{peopleNote}</span>
            {closed ? (
              <span className="chip ledger"><span className="dot" />Closed for good · {new Date(closed.at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}{closed.by ? ` · ${closed.by}` : ''}</span>
            ) : (
              <>
                {counts.draft > 0 && <span className="chip"><span className="dot" />{counts.draft} draft</span>}
                {counts.completed > 0 && <span className="chip accent"><span className="dot" />{counts.completed} completed</span>}
                {counts.submitted > 0 && <span className="chip alert"><span className="dot" />{counts.submitted} with Finance</span>}
                {counts.paid > 0 && <span className="chip ledger"><span className="dot" />{counts.paid} paid</span>}
                {counts.topups > counts.secondPayrolls && <span className="chip accent"><span className="dot" />{counts.topups - counts.secondPayrolls} resubmitting</span>}
                {counts.secondPayrolls > 0 && <span className="chip accent"><span className="dot" />{counts.secondPayrolls} second payroll</span>}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <PeriodPicker period={period} />
          <div className="flex items-start gap-2 flex-wrap justify-end">
            {!closed && <SaveAllButton />}
            {!closed && <SubmitToFinanceButton period={period} preview={preview} />}
            <TotalCloseButton
              period={period}
              monthName={monthName}
              readiness={readiness}
              closed={closed}
              canReopen={user.role === 'principal'}
            />
          </div>
        </div>
      </div>

      {/* Secondary actions. Import is always available; Copy-from-last only
          while nothing of the month has gone to Finance, since it overwrites. */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          {!closed && (
            <Link
              href={`/hr-costing/payroll/${period}/import`}
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-3 py-2 rounded-control transition-colors"
            >
              Import InfoTech
            </Link>
          )}
          {!closed && standingBatches === 0 && <CopyFromLastMonthButton period={period} />}
          <Link
            href={`/hr-costing/allocation/${period}`}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-3 py-2 rounded-control transition-colors"
            title="Split each employee's cost across subsidiaries for billing"
          >
            Billing Allocation
          </Link>
        </div>
        <MoreActionsDropdown
          dangerAction={
            !closed && standingBatches === 0 && staffRows.length > 0
              ? {
                  label: 'Delete imported / manual draft rows',
                  confirmText:
                    `Delete imported and manual draft payroll rows for ${monthName}? Revenue commission rows stay linked to Commission Calculation. ` +
                    `This wipes the whole month — use it for test/wrongly-created periods. ` +
                    `Re-create via Import InfoTech or Create Period.`,
                  action: deletePayrollPeriod.bind(null, period),
                }
              : undefined
          }
          actions={[
            { label: 'Bank CSV (Alliance Bank)', href: `/hr-costing/payroll/${period}/bank-transfer?format=alliance`, title: 'Bulk payment file for the Alliance Bank portal' },
            { label: 'KWSP file', href: `/hr-costing/payroll/${period}/statutory?file=kwsp` },
            { label: 'SOCSO file', href: `/hr-costing/payroll/${period}/statutory?file=socso` },
            { label: 'EIS file', href: `/hr-costing/payroll/${period}/statutory?file=eis` },
            { label: 'LHDN CP39 file', href: `/hr-costing/payroll/${period}/statutory?file=pcb` },
          ]}
        />
      </div>

      {/* Staff + Directors. Total CTC leads: HV's full cost and what Finance funds. */}
      <StatCards label={`Payroll totals for ${monthName}`}>
        <StatCard label="Total CTC" value={formatMoney(totalCtc)} icon="coin" tone="primary" note="Gross + employer statutory" />
        <StatCard label="Total gross" value={formatMoney(totals.gross)} icon="wallet" note={peopleNote} />
        <StatCard label="Total net" value={formatMoney(totals.net)} icon="bank" note="To the bank" />
        <StatCard label="EPF ER" value={formatMoney(totals.epf_er)} icon="shield" note="Employer" />
        <StatCard label="SOCSO + EIS ER" value={formatMoney(totals.socso_er + totals.eis_er)} icon="layers" note="Employer" />
        <StatCard label="Total PCB" value={formatMoney(totals.pcb)} icon="receipt" note="Tax withheld" />
      </StatCards>

      {monthStatus.batches.length > 0 && (
        <PayrollBatches period={period} batches={monthStatus.batches} headline={headline} closed={!!closed} />
      )}

      <PayrollGrid rows={gridRows} period={period} monthClosed={!!closed} />
    </div>
    </PayrollDraftProvider>
  )
}
