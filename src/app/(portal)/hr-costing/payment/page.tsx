import Link from 'next/link'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney, formatMoneyBare, getPeriodMonth } from '@/lib/utils'
import { paymentHeroTotal, round2 } from '@/lib/payroll-funding'
import RequestPayrollPaymentButton, {
  type RequestState,
} from '../payroll/_components/RequestPayrollPaymentButton'
import CreateDisbursementButton from './_components/CreateDisbursementButton'
import StatutoryTable, { type StatutoryRow } from './_components/StatutoryTable'

interface DeptBreakdown {
  dept_name: string
  staff_count: number
  total_net: number
  total_gross: number
}

export default async function HRPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  await requireRole(['principal', 'hr'])
  const supabase = await createClient()

  // Month selector (2026-07-21, user request): ?period=YYYY-MM-01 — a payroll
  // cycle often finishes in the FOLLOWING calendar month (June's payout runs
  // in July), so the page can't be pinned to the current month.
  const { period: periodParam } = await searchParams
  const period = /^\d{4}-\d{2}-01$/.test(periodParam ?? '')
    ? (periodParam as string)
    : getPeriodMonth()
  const prevPeriod = dayjs(period).subtract(1, 'month').format('YYYY-MM-01')
  const nextPeriod = dayjs(period).add(1, 'month').format('YYYY-MM-01')

  const [{ data: run }, { data: hrDept }, { data: payrollRows }, { data: directorRows }] = await Promise.all([
    supabase
      .from('payroll_runs')
      .select('id, status, total_amount')
      .eq('period_month', period)
      .neq('status', 'rejected')
      .maybeSingle(),
    supabase
      .from('departments')
      .select('id')
      .eq('name', 'HR')
      .single(),
    supabase
      .from('hr_monthly_payroll')
      .select(
        'id, net, gross, status, epf_er, epf_ee, socso_er, socso_ee, eis_er, eis_ee, pcb, skbbk_amount, hr_staff_costs(employee_name, departments(name))',
      )
      .eq('period_month', period),
    // Mig 20260730100000: director actuals live in director_monthly_payroll
    // (InfoTech import) — director_payouts is retired with the v2 engine.
    supabase
      .from('director_monthly_payroll')
      .select(
        'id, net, gross, epf_er, epf_ee, socso_er, socso_ee, eis_er, eis_ee, pcb, skbbk_amount, employee_name',
      )
      .eq('period_month', period),
  ])

  // Latest cycle anywhere — powers the "View the <month> cycle →" hint when
  // the selected month is empty (e.g. it's July but June is still in flight).
  const { data: latestRun } = await supabase
    .from('payroll_runs')
    .select('period_month')
    .neq('status', 'rejected')
    .order('period_month', { ascending: false })
    .limit(1)
    .maybeSingle()
  const latestRunPeriod = (latestRun?.period_month ?? null) as string | null

  // Mig 20260720140000 (custody model): funding parks every department's
  // contribution in HR's pool, so its balance IS the payroll war chest —
  // it swells at funding and drains back to HR's own money after payouts.
  const { data: poolRow } = hrDept
    ? await supabase
        .from('dept_pool_balances')
        .select('balance')
        .eq('department_id', hrDept.id)
        .maybeSingle()
    : { data: null }
  const poolBal = Number(poolRow?.balance ?? 0)
  const rows = payrollRows ?? []
  const dRows = (directorRows ?? []).filter(d => Number(d.net ?? 0) > 0)
  const staffNet = rows.reduce((s, r) => s + Number(r.net), 0)
  const staffGross = rows.reduce((s, r) => s + Number(r.gross), 0)
  const directorNet = dRows.reduce((s, d) => s + Number(d.net ?? 0), 0)
  const directorGross = dRows.reduce((s, d) => s + Number(d.gross ?? 0), 0)
  const totalNet = staffNet + directorNet
  const totalGross = staffGross + directorGross
  const erStat = (r: { epf_er?: unknown; socso_er?: unknown; eis_er?: unknown }) =>
    Number(r.epf_er ?? 0) + Number(r.socso_er ?? 0) + Number(r.eis_er ?? 0)
  // Hero spans staff + directors, same口径 as the "N staff · net" subtitle.
  // The staff funding request stays run.total_amount (staff-only) — directors
  // fund via their own run-less request (mig 20260727100000).
  const totalAmount = paymentHeroTotal({
    runTotal: run ? Number(run.total_amount) : null,
    staffGross,
    staffErStat: rows.reduce((s, r) => s + erStat(r), 0),
    directorGross,
    directorErStat: dRows.reduce((s, d) => s + erStat(d), 0),
  })
  const staffFundingAmount = Number(run?.total_amount ?? 0)
  const staffCount = rows.length + dRows.length
  const hasPayroll = staffCount > 0

  // ── Per-department breakdown ──────────────────────────────────────────────
  const byDept = new Map<string, DeptBreakdown>()
  for (const r of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staff = (r as any).hr_staff_costs
    const deptName = staff?.departments?.name ?? '—'
    if (!byDept.has(deptName)) {
      byDept.set(deptName, {
        dept_name: deptName,
        staff_count: 0,
        total_net: 0,
        total_gross: 0,
      })
    }
    const b = byDept.get(deptName)!
    b.staff_count++
    b.total_net += Number(r.net)
    b.total_gross += Number(r.gross)
  }
  // Directors count as their own dept row in the disbursement batch so the
  // "Create N vouchers" total matches what the RPC generates.
  if (dRows.length > 0) {
    byDept.set('Director', {
      dept_name: 'Director',
      staff_count: dRows.length,
      total_net: directorNet,
      total_gross: directorGross,
    })
  }
  const deptBreakdown = Array.from(byDept.values()).sort(
    (a, b) => b.total_gross - a.total_gross,
  )

  // ── Funding-request state ─────────────────────────────────────────────────
  const { data: requestRow } = run
    ? await supabase
        .from('payroll_payment_requests')
        .select('id, status, pv_id, requested_at')
        .eq('payroll_run_id', run.id)
        .in('status', ['submitted', 'pv_generated', 'completed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  // ── Disbursement voucher state — PER SCOPE (mig 20260721000000): staff and
  // director batches are generated/approved/paid independently. reference_id
  // on a disbursement voucher is an hr_monthly_payroll.id (staff) or a
  // director_monthly_payroll.id (directors); voided vouchers don't block a retry.
  const staffIds = rows.map(r => r.id as string)
  const directorIds = dRows.map(d => d.id as string)
  const { data: disbursementVouchers } = staffIds.length + directorIds.length
    ? await supabase
        .from('payment_vouchers')
        .select('id, reference_id, status')
        .eq('reference_type', 'payroll_disbursement')
        .in('reference_id', [...staffIds, ...directorIds])
        .in('status', ['draft', 'pending_approval', 'approved', 'paid'])
    : { data: null }
  const staffIdSet = new Set(staffIds)
  const staffVouchers = (disbursementVouchers ?? []).filter(v => staffIdSet.has(v.reference_id as string))
  const directorVouchers = (disbursementVouchers ?? []).filter(v => !staffIdSet.has(v.reference_id as string))

  const groupIdFor = async (voucherIds: string[]): Promise<string | null> => {
    if (voucherIds.length === 0) return null
    const { data: approvalRow } = await supabase
      .from('approval_requests')
      .select('group_id')
      .in('reference_id', voucherIds)
      .eq('reference_table', 'payment_vouchers')
      .not('group_id', 'is', null)
      .limit(1)
      .maybeSingle()
    return approvalRow?.group_id ?? null
  }
  const staffGroupId = await groupIdFor(staffVouchers.map(v => v.id as string))
  const directorGroupId = await groupIdFor(directorVouchers.map(v => v.id as string))
  const alreadyDisbursed = staffVouchers.length > 0 || directorVouchers.length > 0

  // Batch display state: any voucher still with Principal → pending; approval
  // executes payroll vouchers, so a fully-approved batch normally reads paid.
  const batchState = (vs: { status: string }[]): 'pending' | 'approved' | 'paid' | null => {
    if (vs.length === 0) return null
    if (vs.some(v => v.status === 'pending_approval' || v.status === 'draft')) return 'pending'
    if (vs.some(v => v.status === 'approved')) return 'approved'
    return 'paid'
  }

  // ── Statutory rows (mig 20260721000000): one row per institution, staff +
  // director amounts, matched to any existing non-voided voucher by payee.
  const { data: statutoryPvsRaw } = run
    ? await supabase
        .from('payment_vouchers')
        .select('id, voucher_no, payee_name, status, payment_date, source_pool')
        .eq('reference_type', 'payroll_statutory')
        .eq('reference_id', run.id)
        .neq('status', 'voided')
    : { data: [] }

  const staffSum = (f: (r: (typeof rows)[number]) => number) =>
    rows.reduce((s, r) => s + f(r), 0)
  const dirSum = (f: (d: (typeof dRows)[number]) => number) =>
    dRows.reduce((s, d) => s + f(d), 0)
  const n = (v: unknown) => Number(v ?? 0)

  const SCHEMES: Array<{ scheme: StatutoryRow['scheme']; payee: string; staff: number; directors: number }> = [
    { scheme: 'KWSP', payee: 'KWSP', staff: staffSum(r => n(r.epf_er) + n(r.epf_ee)), directors: dirSum(d => n(d.epf_er) + n(d.epf_ee)) },
    { scheme: 'SOCSO', payee: 'PERKESO (SOCSO)', staff: staffSum(r => n(r.socso_er) + n(r.socso_ee)), directors: dirSum(d => n(d.socso_er) + n(d.socso_ee)) },
    { scheme: 'EIS', payee: 'PERKESO (EIS)', staff: staffSum(r => n(r.eis_er) + n(r.eis_ee)), directors: dirSum(d => n(d.eis_er) + n(d.eis_ee)) },
    { scheme: 'PCB', payee: 'LHDN', staff: staffSum(r => n(r.pcb)), directors: dirSum(d => n(d.pcb)) },
    { scheme: 'SKBBK', payee: 'SKBBK', staff: staffSum(r => n(r.skbbk_amount)), directors: dirSum(d => n(d.skbbk_amount)) },
  ]
  // Which of those vouchers already carry a director source row? A combined
  // voucher (director actuals present at generation time) needs no top-up.
  const statutoryPvIds = (statutoryPvsRaw ?? []).map(v => v.id as string)
  const { data: dirSourceRows } = statutoryPvIds.length
    ? await supabase
        .from('payment_voucher_sources')
        .select('voucher_id')
        .in('voucher_id', statutoryPvIds)
        .eq('pool', 'dept_pool_director')
    : { data: [] }
  const dirCovered = new Set((dirSourceRows ?? []).map(r => r.voucher_id as string))

  const statutoryRows: StatutoryRow[] = SCHEMES.map(s => {
    // A payee can carry TWO vouchers since mig 20260731050000: the main one
    // (source_pool dept_pool_hr — staff, or staff+directors combined) and a
    // director-only top-up (source_pool dept_pool_director), raised when the
    // main one was generated before the director actuals existed (Jun 2026).
    const forPayee = (statutoryPvsRaw ?? []).filter(v => v.payee_name === s.payee)
    const pv = forPayee.find(v => v.source_pool !== 'dept_pool_director') ?? null
    const topup = forPayee.find(v => v.source_pool === 'dept_pool_director') ?? null
    const shape = (v: NonNullable<typeof pv>) => ({
      id: v.id as string,
      voucher_no: v.voucher_no,
      status: v.status as string,
      payment_date: (v.payment_date ?? null) as string | null,
    })
    return {
      scheme: s.scheme,
      payee: s.payee,
      staff: Math.round(s.staff * 100) / 100,
      directors: Math.round(s.directors * 100) / 100,
      pv: pv ? shape(pv) : null,
      topupPv: topup ? shape(topup) : null,
      directorsCovered: !!topup || (pv ? dirCovered.has(pv.id as string) : false),
    }
  })

  // No Principal costing approval since mig 278 — Submit to Finance lands the
  // run directly in 'approved', so there is no 'submitted'/'rejected' run state
  // to wait on here (the run query also filters rejected out).
  type Phase =
    | 'no-payroll'
    | 'drafts-pending'
    | 'approved-ready'
    | 'request-submitted'
    | 'pv-generated'
    | 'funded'

  let phase: Phase = 'no-payroll'
  if (!hasPayroll) phase = 'no-payroll'
  else if (!run) phase = 'drafts-pending'
  else if (run.status === 'approved') {
    if (!requestRow) phase = 'approved-ready'
    else if (requestRow.status === 'submitted') phase = 'request-submitted'
    else if (requestRow.status === 'pv_generated') phase = 'pv-generated'
    else if (requestRow.status === 'completed') phase = 'funded'
  } else if (run.status === 'paid') phase = 'funded'

  // Paid-so-far across this request's funding PVs — partial funding can split
  // one request into several vouchers, some already paid while the rest wait
  // for Principal, so the badge shows 已付/总额 instead of the request total.
  // RPC (mig 20260725) because payment_vouchers SELECT is finance/principal-only.
  let paidAmount = 0
  if (requestRow?.status === 'pv_generated') {
    const { data: paidSum } = await supabase.rpc('get_payroll_funding_paid', {
      p_request_id: requestRow.id,
    })
    paidAmount = round2(Number(paidSum ?? 0))
  }

  let requestState: RequestState = { kind: 'none' }
  if (requestRow) {
    if (requestRow.status === 'submitted') {
      requestState = {
        kind: 'submitted',
        requestId: requestRow.id,
        requestedAt: requestRow.requested_at,
      }
    } else if (requestRow.status === 'pv_generated') {
      requestState = {
        kind: 'pv_generated',
        pvId: requestRow.pv_id ?? '',
        requestId: requestRow.id,
        paidAmount,
      }
    } else if (requestRow.status === 'completed') {
      requestState = {
        kind: 'completed',
        pvId: requestRow.pv_id ?? '',
        completedAt: null,
      }
    }
  }

  const periodLabel = new Date(period + 'T00:00:00Z').toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> HR · PAYMENT · {periodLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Payment</h1>
        </div>
        {/* Month selector — a payroll cycle often completes in the FOLLOWING
            calendar month, so HR must be able to walk back to it. */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/hr-costing/payment?period=${prevPeriod}`}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-mono text-sm px-3 py-1.5 rounded-md transition-colors"
            aria-label="Previous month"
          >
            ←
          </Link>
          <span className="font-serif italic text-graphite text-sm w-32 text-center">
            {dayjs(period).format('MMMM YYYY')}
          </span>
          <Link
            href={`/hr-costing/payment?period=${nextPeriod}`}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-mono text-sm px-3 py-1.5 rounded-md transition-colors"
            aria-label="Next month"
          >
            →
          </Link>
        </div>
      </div>

      {/* Hero — Total Amount + HR Pool (payroll custody) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10 pb-10 border-b border-hairline">
        <div>
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide mb-2">
            Total amount this month
          </div>
          <div className="font-serif text-[44px] md:text-hero text-num-ink leading-none tabular tracking-[-0.01em]">
            {formatMoney(totalAmount)}
          </div>
          <div className="font-mono text-xs text-muted mt-2">
            {hasPayroll
              ? `${staffCount} staff · ${formatMoney(totalNet)} net`
              : 'No payroll imported yet'}
          </div>
        </div>
        <div>
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide mb-2">
            HR Pool · payroll custody
          </div>
          <div
            className={`font-serif text-[44px] md:text-hero leading-none tabular tracking-[-0.01em] ${
              poolBal >= 0 ? 'text-num-ink' : 'text-danger'
            }`}
          >
            {formatMoney(poolBal)}
          </div>
          <div className="font-mono text-xs text-muted mt-2">
            Departments&apos; contributions held here until payout
          </div>
        </div>
      </div>

      {/* Per-department breakdown */}
      {hasPayroll && (
        <section className="mb-10">
          <div className="sect-head">
            <h2>By department</h2>
            <span className="rule" aria-hidden />
            <span className="count">{deptBreakdown.length} DEPT{deptBreakdown.length === 1 ? '' : 'S'} · STAFF · NET · GROSS</span>
          </div>
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th className="right">Staff</th>
                  <th className="right">Net</th>
                  <th className="right">Gross</th>
                </tr>
              </thead>
              <tbody>
                {deptBreakdown.map(d => (
                  <tr key={d.dept_name}>
                    <td>
                      <div className="font-serif text-md text-ink">{d.dept_name}</div>
                    </td>
                    <td className="num text-graphite">{d.staff_count}</td>
                    <td className="num text-graphite">{formatMoney(d.total_net)}</td>
                    <td className="num">{formatMoney(d.total_gross)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-hairline bg-surface-2/40">
                  <td className="font-serif italic text-accent">Total</td>
                  <td className="num text-num-ink font-semibold">{staffCount}</td>
                  <td className="num text-num-ink font-semibold">{formatMoney(totalNet)}</td>
                  <td className="num text-num-ink font-semibold">{formatMoney(totalGross)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Phase-driven action */}
      <div className="mb-12">
        {phase === 'no-payroll' && (
          <div className="py-12 text-center border border-hairline rounded-md bg-surface">
            <p className="font-serif italic text-graphite text-lg mb-4">
              No payroll imported for this month yet.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link
                href="/hr-costing/payroll"
                className="inline-block bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
              >
                Go to Payroll →
              </Link>
              {latestRunPeriod && latestRunPeriod !== period ? (
                <Link
                  href={`/hr-costing/payment?period=${latestRunPeriod}`}
                  className="inline-block bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
                >
                  View the {dayjs(latestRunPeriod).format('MMMM YYYY')} cycle →
                </Link>
              ) : null}
            </div>
          </div>
        )}

        {phase === 'drafts-pending' && (
          <div className="py-12 text-center border border-hairline rounded-md bg-surface">
            <p className="font-serif italic text-graphite text-lg mb-2">
              Payroll hasn&apos;t been submitted to Finance yet.
            </p>
            <p className="font-serif italic text-muted text-sm mb-6">
              Finish editing the drafts and click Submit to Finance on the Payroll grid first.
            </p>
            <Link
              href="/hr-costing/payroll"
              className="inline-block bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
            >
              Open Payroll grid →
            </Link>
          </div>
        )}

        {(phase === 'approved-ready' ||
          phase === 'request-submitted' ||
          phase === 'pv-generated') &&
          run && (
            <div className="border border-hairline rounded-md bg-surface p-8">
              <h2 className="font-serif italic text-ink text-md mb-2">
                Funding from Finance
              </h2>
              <p className="font-serif italic text-graphite text-sm mb-6">
                {phase === 'approved-ready' ? (
                  <>
                    No active funding request — the previous one was cancelled. Re-file the{' '}
                    <strong className="num text-num-ink">RM {formatMoneyBare(staffFundingAmount)}</strong> staff request below.
                    Finance generates the Payment Voucher; Principal approves it, which books each department&apos;s
                    salary cost and moves the cash into the Alliance payroll account.
                  </>
                ) : (
                  <>
                    The staff funding request for <strong className="num text-num-ink">RM {formatMoneyBare(staffFundingAmount)}</strong> is filed automatically when you submit the payroll
                    (directors fund separately from the Director Salary submission).
                    Finance generates the Payment Voucher; Principal approves it, which books each department&apos;s
                    salary cost and moves the cash from Hong Leong into the Alliance payroll account.
                  </>
                )}
              </p>
              <RequestPayrollPaymentButton
                runId={run.id}
                totalAmount={staffFundingAmount}
                state={requestState}
              />
            </div>
          )}

        {phase === 'funded' && (
          <div className="border border-ledger/40 bg-surface rounded-md p-8">
            <div className="mb-4">
              <em className="font-serif italic text-ledger text-lg">✓ Funding complete — cash staged in Alliance</em>
              <p className="font-serif italic text-graphite text-sm mt-1">
                Ready to disburse to staff. Vouchers draw from the HR custody pool.
              </p>
            </div>

            <div className="mt-6 pt-6 border-t border-hairline">
              <h3 className="font-serif text-md text-ink mb-1">Pay salaries</h3>
              <p className="font-serif italic text-graphite text-sm mb-5">
                Staff and directors are separate batches — each with its own
                payment date and its own Principal approval, so they can be
                paid on different days.
              </p>

              <div className="mb-4">
                <CreateDisbursementButton
                  period={period}
                  scope="staff"
                  label="Staff batch"
                  total={staffNet}
                  count={rows.filter(r => Number(r.net) > 0).length}
                  alreadyGenerated={staffVouchers.length > 0}
                  batchState={batchState(staffVouchers)}
                  groupId={staffGroupId}
                  defaultDate={period.slice(0, 8) + '28'}
                />
              </div>
              <div className="mb-5">
                <CreateDisbursementButton
                  period={period}
                  scope="directors"
                  label="Director batch"
                  total={directorNet}
                  count={dRows.length}
                  alreadyGenerated={directorVouchers.length > 0}
                  batchState={batchState(directorVouchers)}
                  groupId={directorGroupId}
                  defaultDate={period.slice(0, 8) + '28'}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-hairline">
                <Link
                  href={`/hr-costing/payroll/${period}/bank-transfer?format=alliance`}
                  className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
                >
                  Download Alliance Bank CSV
                </Link>
                <span className="font-serif italic text-muted text-xs">
                  The bank file that actually moves money to staff accounts.
                </span>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-hairline">
              <h3 className="font-serif text-md text-ink mb-1">Statutory payments</h3>
              <p className="font-serif italic text-graphite text-sm mb-4">
                One institution at a time — generate each voucher when you are
                ready to pay that body, with its own payment date.
              </p>
              <StatutoryTable period={period} rows={statutoryRows} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
