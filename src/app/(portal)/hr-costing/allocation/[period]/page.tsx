import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { formatMoney } from '@/lib/utils'
import { comparePayrollOrder } from '@/lib/payroll-grid'
import { isTopupKind, type RowStatus } from '@/lib/payroll-lifecycle'
import { allocationRoster, moveParts, movePreview, splitLock, type DeptMoveRow } from '@/lib/staff-allocation'
import { costModelOf } from '@/lib/department-mode'
import { loadDepartmentModes } from '@/lib/department-mode-server'
import PeriodPicker from '../../payroll/_components/PeriodPicker'
import AllocationEditor, { type StaffAllocationData } from '../_components/AllocationEditor'
import CopyAllocationsButton from '../_components/CopyAllocationsButton'
import MovedIntoCard, { type MovedIn } from '../_components/MovedIntoCard'
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
//
// 2026-11-03 (method B — the user: "我说的意思是example 从director office split
// 薪水去hr, 也要开一张bill"): part of a person's cost may go to another
// department (+ Department), billed by an internal invoice. Centralized
// departments' people are listed now too, folded by department, with
// + Department only; and each receiving cost center with something moved in
// gets a "Moved into" card for its Bill to %.
export default async function AllocationPage({ params }: PageProps) {
  await requirePage('/hr-costing/allocation/[period]')
  const user = await requirePermission('hr_costing')
  const { period } = await params

  if (!/^\d{4}-\d{2}-01$/.test(period)) notFound()

  const supabase = await createClient()
  const prevPeriod = new Date(period + 'T00:00:00Z')
  prevPeriod.setUTCMonth(prevPeriod.getUTCMonth() - 1)
  const lastMonth = prevPeriod.toISOString().slice(0, 10)

  const [
    { data: payrollRows, error: payrollError },
    { data: allocRows, error: allocError },
    { data: companies },
    { data: monthClosed, error: closedError },
    { data: moveRows, error: movesError },
    { data: billToRows, error: billToError },
    departments,
  ] = await Promise.all([
    supabase
      .from('hr_monthly_payroll')
      .select(
        'staff_id, status, source, completed_at, topup_opened_at, topup_kind, gross, epf_er, socso_er, eis_er, basic_salary, prorata_days_worked, prorata_days_in_month, deduction_amount, hr_staff_costs (employee_name, department_id, departments (name, payroll_source, cost_model))',
      )
      .eq('period_month', period),
    supabase
      .from('hr_staff_allocation')
      .select('staff_id, company_id, allocation_pct')
      .eq('period_month', period)
      .gt('allocation_pct', 0),
    supabase.from('companies').select('id, name, short_code').order('short_code'),
    supabase.rpc('payroll_month_closed', { p_period: period }),
    supabase.from('hr_staff_dept_moves').select('staff_id, department_id, amount, pct').eq('period_month', period),
    supabase
      .from('hr_pool_allocation')
      .select('department_id, company_id, split_pct, period_month')
      .in('period_month', [period, lastMonth])
      .gt('split_pct', 0),
    loadDepartmentModes(),
  ])
  if (payrollError) throw new Error(`Could not load payroll: ${payrollError.message}`)
  if (allocError) throw new Error(`Could not load the splits: ${allocError.message}`)
  if (closedError) throw new Error(`Could not read whether the month is closed: ${closedError.message}`)
  if (movesError) throw new Error(`Could not load the department lines: ${movesError.message}`)
  if (billToError) throw new Error(`Could not load the Bill to %: ${billToError.message}`)

  // DB stores 0–1 fractions at 6dp; the form works in 0–100 percentages.
  const asPct = (fraction: unknown) => Math.round(Number(fraction) * 10000) / 100
  const movesByStaff = new Map<string, DeptMoveRow[]>()
  for (const m of moveRows ?? []) {
    const line: DeptMoveRow =
      m.pct != null
        ? { departmentId: m.department_id, kind: 'pct', value: asPct(m.pct) }
        : { departmentId: m.department_id, kind: 'amount', value: Number(m.amount) }
    movesByStaff.set(m.staff_id, [...(movesByStaff.get(m.staff_id) ?? []), line])
  }
  const billToOf = (deptId: string, month: string) =>
    (billToRows ?? [])
      .filter((r) => r.department_id === deptId && r.period_month === month)
      .map((r) => ({ companyId: r.company_id as string, pct: asPct(r.split_pct) }))

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
    // get_staff_billing_allocation's salary rule, so a move's items read as its invoice will.
    const basic = Number(r.basic_salary ?? 0)
    const daysIn = Number(r.prorata_days_in_month ?? 0)
    const earned = r.source === 'imported' ? basic : daysIn === 0 ? 0 : (basic * Number(r.prorata_days_worked ?? 0)) / daysIn
    const salaryComp = Math.max(Math.min(earned - Number(r.deduction_amount ?? 0), Number(r.gross)), 0)
    return {
      staffId: r.staff_id,
      name: (sc?.employee_name as string | undefined) ?? '—',
      dept: (sc?.departments?.name as string | undefined) ?? '—',
      departmentId: (sc?.department_id as string | undefined) ?? '',
      employerCost: Math.round(cost * 100) / 100,
      rows,
      moves: movesByStaff.get(r.staff_id) ?? [],
      pay: { gross: Number(r.gross), salaryComp, epfEr: Number(r.epf_er), socsoEr: Number(r.socso_er), eisEr: Number(r.eis_er) },
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
  // The cost centers' people as the roster lists them (a centralized one with a
  // split left from before among them); every other centralized person after,
  // for + Department (2026-11-03), folded by department in the editor.
  const { listed } = allocationRoster(everyone)
  const listedIds = new Set(listed.map((s) => s.staffId))
  const byPayrollOrder = (a: { dept: string; name: string }, b: { dept: string; name: string }) =>
    comparePayrollOrder({ dept_name: a.dept, staff_name: a.name }, { dept_name: b.dept, staff_name: b.name })
  const staff: StaffAllocationData[] = [
    ...listed.sort(byPayrollOrder),
    ...everyone.filter((s) => !listedIds.has(s.staffId)).sort(byPayrollOrder),
  ]
  const costCenterStaff = staff.filter((s) => !s.centralized)

  const staffWithAlloc = costCenterStaff.filter((s) => s.rows.length > 0 || s.moves.length > 0).length
  const lockedCount = costCenterStaff.filter((s) => s.lock.locked).length
  // Copy fills department lines for a centralized person too.
  const openCount = staff.filter((s) => !s.lock.locked).length
  // Editable by whoever edits payroll (HR Costing · Edit — the writes ask the
  // same; it was the HR kind until 2026-10-09, Q7).
  const readOnly = !canDo(user, 'hr_costing', 'edit')

  // The cost centers' figures: what goes to the companies, to departments, and HV's what is left.
  const previews = costCenterStaff.map((s) => movePreview(s.employerCost, s.rows, s.moves))
  const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100
  const totalCost = sum(costCenterStaff.map((s) => s.employerCost))
  const billedTotal = sum(previews.map((p) => p.billedTotal))
  const movedTotal = sum(previews.map((p) => p.movedTotal))
  const hvTotal = sum(previews.map((p) => p.hvAmount))

  // One "Moved into" card per receiving COST CENTER with something moved in:
  // a centralized receiver bears it as its own cost, with no Bill to.
  const receivers = departments.filter((d) => d.costModel === 'cost_center' && !d.isInternal && d.segmentKey)
  const movedInto = receivers
    .map((d) => {
      const incoming: MovedIn[] = []
      for (const s of everyone) {
        if (s.departmentId === d.id) continue
        const p = movePreview(s.employerCost, s.centralized ? [] : s.rows, s.moves)
        const line = p.moves.find((m) => m.departmentId === d.id)
        if (line && line.amount > 0) {
          incoming.push({ name: s.name, fromDept: s.dept, amount: line.amount, parts: moveParts(s.pay, line.amount) })
        }
      }
      return { department: d, incoming }
    })
    .filter((r) => r.incoming.length > 0)

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
                {staffWithAlloc} of {costCenterStaff.length} staff allocated
                {lockedCount > 0 &&
                  ` · ${lockedCount === costCenterStaff.length ? 'all' : lockedCount} locked with their payroll`}
              </>
            )}
          </p>
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
              value={`${staffWithAlloc} / ${costCenterStaff.length}`}
              icon="people"
              note={lockedCount > 0 ? `${lockedCount} locked with their payroll` : undefined}
            />
            <StatCard
              label="Billed to subsidiaries"
              value={formatMoney(billedTotal)}
              icon="building"
              note={movedTotal > 0 ? `${formatMoney(movedTotal)} to departments` : undefined}
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
            departments={departments}
            readOnly={readOnly}
          />

          {movedInto.length > 0 && (
            <section className="mt-8">
              <div className="sect-head">
                <h2>Moved into departments</h2>
                <span className="rule" aria-hidden />
                <span className="count">{movedInto.length} {movedInto.length === 1 ? 'DEPARTMENT' : 'DEPARTMENTS'}</span>
              </div>
              <div className="space-y-3">
                {movedInto.map(({ department, incoming }) => (
                  <MovedIntoCard
                    key={department.id}
                    period={period}
                    department={{ id: department.id, name: department.name }}
                    incoming={incoming}
                    billTo={billToOf(department.id, period)}
                    lastMonthBillTo={billToOf(department.id, lastMonth)}
                    companies={companies ?? []}
                    readOnly={readOnly}
                    locked={monthClosed === true}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
