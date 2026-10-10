import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { formatMoney } from '@/lib/utils'
import { comparePayrollOrder } from '@/lib/payroll-grid'
import { isTopupKind, type RowStatus } from '@/lib/payroll-lifecycle'
import { allocationRoster, splitLock } from '@/lib/staff-allocation'
import { costModelOf } from '@/lib/department-mode'
import PeriodPicker from '../../payroll/_components/PeriodPicker'
import AllocationEditor, { type StaffAllocationData } from '../_components/AllocationEditor'
import CopyAllocationsButton from '../_components/CopyAllocationsButton'
import { StatCard, StatCards } from '@/components/sheet/StatCard'

interface PageProps {
  params: Promise<{ period: string }>
}

function formatPeriodLabel(period: string): string {
  const d = new Date(period + 'T00:00:00Z')
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

// Staff billing allocation editor — HR splits each employee's employer cost
// (gross + EPF/SOCSO/EIS ER, the same CTC basis Finance bills) across
// subsidiaries by %. The remainder is HV's own share and is never billed.
// Finance reads the aggregate per dept × company on /billing (RPC
// get_staff_billing_allocation) — no names, no individual salaries.
//
// One card per payroll row of the month in a COST-CENTER department, in the
// Payroll grid's order (2026-09-30): every split row belongs to a payroll row,
// and a centralized department (Director, Marketing, Revenue) bills by invoice
// instead of being split, so its people are named in the header rather than
// listed (`allocationRoster`). A card locks with its payroll row: Completed,
// with Finance or paid, the split stays as it left (`splitLock`).
export default async function AllocationPage({ params }: PageProps) {
  await requirePage('/hr-costing/allocation/[period]')
  const user = await requirePermission('hr_costing')
  const { period } = await params

  if (!/^\d{4}-\d{2}-01$/.test(period)) notFound()

  const supabase = await createClient()

  const [
    { data: payrollRows, error: payrollError },
    { data: allocRows, error: allocError },
    { data: companies },
    { data: monthClosed, error: closedError },
  ] = await Promise.all([
    supabase
      .from('hr_monthly_payroll')
      .select(
        'staff_id, status, source, completed_at, topup_opened_at, topup_kind, gross, epf_er, socso_er, eis_er, hr_staff_costs (employee_name, departments (name, payroll_source, cost_model))',
      )
      .eq('period_month', period),
    supabase
      .from('hr_staff_allocation')
      .select('staff_id, company_id, allocation_pct')
      .eq('period_month', period)
      .gt('allocation_pct', 0),
    supabase.from('companies').select('id, name, short_code').order('short_code'),
    supabase.rpc('payroll_month_closed', { p_period: period }),
  ])
  if (payrollError) throw new Error(`Could not load payroll: ${payrollError.message}`)
  if (allocError) throw new Error(`Could not load the splits: ${allocError.message}`)
  if (closedError) throw new Error(`Could not read whether the month is closed: ${closedError.message}`)

  const allocByStaff = new Map<string, Array<{ companyId: string; pct: number }>>()
  for (const r of allocRows ?? []) {
    const list = allocByStaff.get(r.staff_id) ?? []
    // DB stores 0–1 fractions at 6dp; the form works in 0–100 percentages.
    list.push({ companyId: r.company_id, pct: Math.round(Number(r.allocation_pct) * 10000) / 100 })
    allocByStaff.set(r.staff_id, list)
  }

  const everyone = (payrollRows ?? []).map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sc = (r as any).hr_staff_costs
    const cost =
      Number(r.gross) + Number(r.epf_er) + Number(r.socso_er) + Number(r.eis_er)
    const rows = allocByStaff.get(r.staff_id) ?? []
    return {
      staffId: r.staff_id,
      name: (sc?.employee_name as string | undefined) ?? '—',
      dept: (sc?.departments?.name as string | undefined) ?? '—',
      employerCost: Math.round(cost * 100) / 100,
      rows,
      hasSplit: rows.length > 0,
      centralized: costModelOf(sc?.departments?.cost_model) === 'centralized',
      lock: splitLock({
        status: r.status as RowStatus,
        revenue: r.source === 'commission' || sc?.departments?.payroll_source === 'commission',
        completedAt: r.completed_at,
        topupOpenedAt: r.topup_opened_at,
        topupKind: isTopupKind(r.topup_kind) ? r.topup_kind : null,
        monthClosed: monthClosed === true,
      }),
    }
  })
  const { listed, notListed } = allocationRoster(everyone)
  const staff: StaffAllocationData[] = listed.sort((a, b) =>
    comparePayrollOrder({ dept_name: a.dept, staff_name: a.name }, { dept_name: b.dept, staff_name: b.name }),
  )

  const staffWithAlloc = staff.filter((s) => s.rows.length > 0).length
  const lockedCount = staff.filter((s) => s.lock.locked).length
  const openCount = staff.filter((s) => !s.lock.locked && !s.centralized).length
  // Editable by whoever edits payroll (HR Costing · Edit — the writes ask the
  // same; it was the HR kind until 2026-10-09, Q7).
  const readOnly = !canDo(user, 'hr_costing', 'edit')
  // "Marketing (12) and Revenue Department (32)"
  const notListedLine = notListed.map((d) => `${d.dept} (${d.people})`).join(', ').replace(/, ([^,]*)$/, ' and $1')

  const totalCost = staff.reduce((s, r) => s + r.employerCost, 0)
  const billedTotal = staff.reduce(
    (s, r) =>
      s + r.rows.reduce((a, row) => a + Math.round(r.employerCost * row.pct) / 100, 0),
    0,
  )
  const hvTotal = Math.round((totalCost - billedTotal) * 100) / 100

  return (
    <div>
      <Link
        href={`/hr-costing/payroll/${period}`}
        className="text-sm hover:text-accent transition-colors"
      >
        ← Back to Payroll
      </Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>II.</em> HR · BILLING ALLOCATION · {formatPeriodLabel(period).toUpperCase()}
          </div>
          <h1 className="page-title">Billing Allocation</h1>
          <p className="text-sm mt-3">
            {staff.length === 0 ? (
              everyone.length === 0 ? 'No payroll rows for this period.' : 'Nobody to split this month.'
            ) : (
              <>
                {staffWithAlloc} of {staff.length} staff allocated
                {lockedCount > 0 &&
                  ` · ${lockedCount === staff.length ? 'all' : lockedCount} locked with their payroll`}
                {' · unallocated share stays with HV'}
              </>
            )}
          </p>
          {notListed.length > 0 ? (
            <p className="text-xs mt-1.5">
              Not listed: {notListedLine} — centralized, they bill the subsidiaries by invoice from their
              own pool. Switch a department in{' '}
              <Link href="/settings?tab=departments" className="underline hover:text-accent">
                Settings › Departments
              </Link>
              .
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-3">
          <PeriodPicker period={period} basePath="/hr-costing/allocation" />
          {/* Copy fills only people whose split can still change. */}
          {!readOnly && openCount > 0 && <CopyAllocationsButton period={period} />}
        </div>
      </div>

      {staff.length === 0 ? (
        <div className="border border-hairline rounded-card bg-surface-2 px-6 py-12 text-center">
          {/* `.sheet-heading` owns its margin, so the air sits on its neighbours. */}
          <h2 className="sheet-heading">
            Nothing to allocate for {formatPeriodLabel(period)}.
          </h2>
          <p className="text-sm mt-2 mb-6 max-w-md mx-auto">
            {everyone.length === 0
              ? "The allocation splits each employee's payroll cost across subsidiaries, so it needs the month's payroll rows first."
              : 'Everybody on this payroll is in a centralized department — billed by invoice, not split.'}
          </p>
          <Link
            href={`/hr-costing/payroll/${period}`}
            className="inline-block bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors"
          >
            Go to Payroll →
          </Link>
        </div>
      ) : (
        <>
          {/* The month in four figures. The employer cost is what the page
              splits, so it is the sheet's one walnut card; the last two are
              where that cost goes. */}
          <StatCards label={`Billing allocation for ${formatPeriodLabel(period)}`}>
            <StatCard
              label="Total employer cost"
              value={formatMoney(totalCost)}
              icon="coin"
              tone="primary"
              note="Gross + employer statutory"
            />
            <StatCard
              label="Staff allocated"
              value={`${staffWithAlloc} / ${staff.length}`}
              icon="people"
              note={lockedCount > 0 ? `${lockedCount} locked with their payroll` : undefined}
            />
            <StatCard
              label="Billed to subsidiaries"
              value={formatMoney(billedTotal)}
              icon="building"
            />
            <StatCard
              label="HV — Venture own share"
              value={formatMoney(hvTotal)}
              icon="briefcase"
              note="Not billed"
            />
          </StatCards>

          <AllocationEditor
            period={period}
            staff={staff}
            companies={companies ?? []}
            readOnly={readOnly}
          />
        </>
      )}
    </div>
  )
}
