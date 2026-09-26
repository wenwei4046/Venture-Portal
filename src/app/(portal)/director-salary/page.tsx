// Director Salary — v2 flow (2026-07-17): the calculation engine
// (75/25 split · 5% saving · advance) is retired. Two lines now run
// straight through to Finance:
//   1. Pool Breakdown (Billing)  — HR keys CTC per subsidiary → Save
//   2. Director Payroll (InfoTech) — actual run imported verbatim
// Submit (Submission tab) snapshots BOTH: payroll totals from the InfoTech
// table + the per-subsidiary CTC split for billing.

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import {
  calculateDirectorGap,
  type GapSettings,
  type GapDirector,
} from '@/lib/director-gap'
import dayjs from 'dayjs'
import Link from 'next/link'
import CTCInputGrid from './_components/CTCInputGrid'
import SubmitDirectorSalaryButton from './_components/SubmitDirectorSalaryButton'
import ReopenDirectorSalaryButton from './_components/ReopenDirectorSalaryButton'
import DirectorPayrollActualGrid, {
  DirectorPayrollEmptyState,
  type DirectorPayrollRowData,
} from './_components/DirectorPayrollActualGrid'
import DirectorPeriodPicker from './_components/DirectorPeriodPicker'
import LedgerRow from '@/components/LedgerRow'
import { StatCard, StatCards } from '@/components/sheet/StatCard'

interface Props {
  searchParams: Promise<{ period?: string; tab?: string }>
}

interface ByCompanyRow {
  company_id: string
  company_name: string
  company_short_code: string
  // Component breakdown (2026-07-13). Optional: submissions snapshotted
  // before the breakdown existed only carry total_ctc — render '—' then.
  basic?: number | null
  kpi?: number | null
  allowance?: number | null
  epf_er?: number | null
  socso_er?: number | null
  eis_er?: number | null
  total_ctc: number
}

export default async function DirectorSalaryPage({ searchParams }: Props) {
  await requirePermission('director_salary')
  const supabase = await createClient()

  const { period: rawPeriod, tab: rawTab } = await searchParams
  const period = dayjs(rawPeriod ?? getPeriodMonth()).startOf('month').format('YYYY-MM-DD')
  const periodLabel = dayjs(period).format('MMMM YYYY')
  const tab = rawTab === 'submission' ? 'submission' : 'calculation'

  const [
    { data: directors },
    { data: companies },
    { data: ctcRows },
    { data: submission },
    { data: liveByCompany },
    { data: actualPayrollRows },
    { data: fundingRequest },
    { data: dpSettings },
  ] = await Promise.all([
    supabase.from('directors').select('id, name, code, weightage, min_payout').eq('status', 'active').order('code'),
    supabase.from('companies').select('id, name, short_code, director_heads').eq('is_active', true).order('name'),
    supabase.from('director_ctc').select('*').eq('period_month', period),
    supabase
      .from('director_salary_submissions')
      .select('*')
      .eq('period_month', period)
      .maybeSingle(),
    supabase.rpc('get_director_ctc_by_company', { p_period_month: period }),
    supabase
      .from('director_monthly_payroll')
      .select('*')
      .eq('period_month', period)
      .order('employee_name'),
    // Auto-filed at submit (mig 20260727100000) — run-less director request.
    supabase
      .from('payroll_payment_requests')
      .select('id, amount, status')
      .is('payroll_run_id', null)
      .eq('period_month', period)
      .in('status', ['submitted', 'pv_generated', 'completed'])
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Saving / 75-25 split rates for the billing-vs-payroll reconciliation.
    // Same source the /director-pool calculator reads — never hardcoded here.
    supabase.from('dp_settings').select('saving_pct, gb_pct').eq('id', 1).maybeSingle(),
  ])

  // Director actual payroll (InfoTech import) — verbatim rows + director code.
  const actualRows: DirectorPayrollRowData[] = (actualPayrollRows ?? []).map(r => ({
    id: r.id,
    director_id: r.director_id,
    director_code: directors?.find(d => d.id === r.director_id)?.code ?? null,
    employee_code: r.employee_code,
    employee_name: r.employee_name,
    dept_name: r.dept_name,
    basic_salary: Number(r.basic_salary),
    statutory_allowance: Number(r.statutory_allowance),
    non_statutory_allowance: Number(r.non_statutory_allowance),
    ot_amount: Number(r.ot_amount),
    commission_amount: Number(r.commission_amount),
    no_pay_amount: Number(r.no_pay_amount),
    deduction_amount: Number(r.deduction_amount),
    skbbk_amount: Number(r.skbbk_amount),
    epf_er: Number(r.epf_er),
    epf_ee: Number(r.epf_ee),
    socso_er: Number(r.socso_er),
    socso_ee: Number(r.socso_ee),
    eis_er: Number(r.eis_er),
    eis_ee: Number(r.eis_ee),
    pcb: Number(r.pcb),
    gross: Number(r.gross),
    net: Number(r.net),
    source: r.source,
  }))
  const hasActualPayroll = actualRows.length > 0
  const hasCtc = (ctcRows?.length ?? 0) > 0

  // Live preview totals for the Submission tab — computed from the InfoTech
  // table EXACTLY the way submit_director_salary_to_finance v2 computes the
  // snapshot, so what HR previews is what Finance receives.
  const liveTotals = hasActualPayroll
    ? actualRows.reduce(
        (acc, r) => ({
          gross: acc.gross + r.gross,
          payrollGross: acc.payrollGross + r.gross,
          payrollNet: acc.payrollNet + r.net,
          statutoryEr: acc.statutoryEr + r.epf_er + r.socso_er + r.eis_er,
          invoice: 0,
          saving: 0,
          directors: acc.directors + 1,
        }),
        { gross: 0, payrollGross: 0, payrollNet: 0, statutoryEr: 0, invoice: 0, saving: 0, directors: 0 },
      )
    : null

  const tabHref = (t: 'calculation' | 'submission') =>
    `/director-salary?period=${dayjs(period).format('YYYY-MM')}${t === 'submission' ? '&tab=submission' : ''}`

  const companyCount = companies?.length ?? 0

  return (
    <div>
      {/* Header — the month rides in the eyebrow; the picker moves it. */}
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> DIRECTOR · SALARY ENGINE · {periodLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Director Salary</h1>
        </div>
        <DirectorPeriodPicker
          period={period}
          basePath="/director-salary"
          extraQuery={tab === 'submission' ? '&tab=submission' : ''}
        />
      </div>

      {/* Tabs — Calculation | Director Payroll Submission. They are links
          (?tab=), so the rail is a <nav> and the pick is aria-current. */}
      <nav className="sheet-tabs" aria-label="Director Salary views">
        <Link href={tabHref('calculation')} aria-current={tab === 'calculation' ? 'page' : undefined}>
          Calculation
        </Link>
        <Link href={tabHref('submission')} aria-current={tab === 'submission' ? 'page' : undefined}>
          Director Payroll Submission
          {submission ? (
            <span className="chip ledger"><span className="dot" />submitted</span>
          ) : null}
        </Link>
      </nav>

      {tab === 'calculation' ? (
        <>
          {/* CTC Input Section — billing side */}
          <section className="mb-12">
            <div className="sect-head">
              <h2>Pool Breakdown (Billing)</h2>
              <span className="rule" aria-hidden />
              <span className="count">
                {companyCount} COMPAN{companyCount === 1 ? 'Y' : 'IES'}
              </span>
            </div>
            <p className="text-sm -mt-2 mb-4">
              What Finance bills each subsidiary · Save here, then submit on the{' '}
              <Link href={tabHref('submission')} className="text-accent hover:text-accent-hover">
                Submission tab →
              </Link>
            </p>

            <CTCInputGrid
              directors={(directors ?? []).map(d => ({
                id: d.id,
                code: d.code,
                name: d.name ?? d.code,
              }))}
              companies={(companies ?? []).map(c => ({
                id: c.id,
                name: c.name,
                short_code: c.short_code,
                director_heads: Number(c.director_heads ?? 1),
              }))}
              existingCTC={(ctcRows ?? []).map(r => ({
                director_id: r.director_id,
                company_id: r.company_id,
                basic: Number(r.basic),
                kpi: Number(r.kpi),
                allowance: Number(r.allowance),
                employer_epf: r.employer_epf ? Number(r.employer_epf) : null,
                employer_socso: r.employer_socso ? Number(r.employer_socso) : null,
                employer_eis: r.employer_eis ? Number(r.employer_eis) : null,
                total_ctc: r.total_ctc ? Number(r.total_ctc) : null,
                er_manual: r.er_manual === true,
              }))}
              period={period}
            />
          </section>

          {/* Director Payroll (InfoTech actual) — payroll side */}
          <section className="mb-12">
            <div className="sect-head">
              <h2>Director Payroll (InfoTech)</h2>
              <span className="rule" aria-hidden />
              <span className="count">
                {actualRows.length} DIRECTOR{actualRows.length === 1 ? '' : 'S'}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 -mt-2 mb-5">
              <p className="text-sm">
                Actual payroll run imported from InfoTech ·{' '}
                <Link href={tabHref('submission')} className="text-accent hover:text-accent-hover">
                  {submission ? 'View submission →' : 'Submit to Finance →'}
                </Link>
              </p>
              <Link
                href={`/director-salary/import?period=${dayjs(period).format('YYYY-MM')}`}
                className="self-start sm:self-auto shrink-0 bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors"
              >
                Import InfoTech →
              </Link>
            </div>

            {actualRows.length === 0 ? (
              <DirectorPayrollEmptyState period={period} />
            ) : (
              <DirectorPayrollActualGrid rows={actualRows} period={period} />
            )}
          </section>
        </>
      ) : (
        <SubmissionTab
          period={period}
          periodLabel={periodLabel}
          submission={submission}
          fundingRequest={fundingRequest ?? null}
          hasActualPayroll={hasActualPayroll}
          hasCtc={hasCtc}
          liveTotals={liveTotals}
          gapSettings={{
            savingPct: Number(dpSettings?.saving_pct ?? 0),
            gbPct: Number(dpSettings?.gb_pct ?? 0),
          }}
          gapDirectors={(directors ?? []).map(d => ({
            code: d.code,
            weightage: Number(d.weightage),
            minPayout: Number(d.min_payout),
          }))}
          payrollRows={actualRows}
          liveByCompany={((liveByCompany as ByCompanyRow[] | null) ?? []).map(r => ({
            ...r,
            basic: r.basic == null ? null : Number(r.basic),
            kpi: r.kpi == null ? null : Number(r.kpi),
            allowance: r.allowance == null ? null : Number(r.allowance),
            epf_er: r.epf_er == null ? null : Number(r.epf_er),
            socso_er: r.socso_er == null ? null : Number(r.socso_er),
            eis_er: r.eis_er == null ? null : Number(r.eis_er),
            total_ctc: Number(r.total_ctc),
          }))}
        />
      )}
    </div>
  )
}

// Sum a component column for the totals row — '—' when no row carries the
// breakdown (legacy snapshots written before the component fields existed).
function sumOrDash(rows: ByCompanyRow[], pick: (r: ByCompanyRow) => number | null | undefined) {
  const vals = rows.map(pick).filter((v): v is number => v != null)
  if (vals.length === 0) return '—'
  return formatMoney(vals.reduce((s, v) => s + v, 0))
}

// ─── Director Payroll Submission tab ─────────────────────────────────────────
// v2: payroll totals come from director_monthly_payroll (InfoTech actuals);
// the per-subsidiary split still comes from director_ctc. Both must exist
// before Submit is enabled. Transparency rule: every total the RPC writes is
// previewed here by-source BEFORE submitting.
interface SubmissionTotals {
  gross: number
  payrollGross: number
  payrollNet: number
  statutoryEr: number
  invoice: number
  saving: number
  directors: number
}

function SubmissionTab({
  period,
  periodLabel,
  submission,
  fundingRequest,
  hasActualPayroll,
  hasCtc,
  liveTotals,
  gapSettings,
  gapDirectors,
  payrollRows,
  liveByCompany,
}: {
  period: string
  periodLabel: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  submission: any
  fundingRequest: { id: string; amount: number; status: string } | null
  hasActualPayroll: boolean
  hasCtc: boolean
  liveTotals: SubmissionTotals | null
  gapSettings: GapSettings
  gapDirectors: GapDirector[]
  payrollRows: DirectorPayrollRowData[]
  liveByCompany: ByCompanyRow[]
}) {
  const submitted = !!submission

  // Per-director payroll detail comes from the live InfoTech table (the
  // snapshot itself is aggregate-only — Finance never sees per-director
  // figures). If the live rows drift from the submitted totals, flag it.
  const livePayrollTotals = payrollRows.reduce(
    (acc, r) => ({
      gross: acc.gross + r.gross,
      net: acc.net + r.net,
      er: acc.er + r.epf_er + r.socso_er + r.eis_er,
      pcb: acc.pcb + r.pcb,
    }),
    { gross: 0, net: 0, er: 0, pcb: 0 },
  )

  // Submitted → render the snapshot; not yet → live preview of what would be
  // submitted right now.
  const byCompany: ByCompanyRow[] = submitted
    ? ((submission.by_company as ByCompanyRow[] | null) ?? []).map(r => ({
        ...r,
        basic: r.basic == null ? null : Number(r.basic),
        kpi: r.kpi == null ? null : Number(r.kpi),
        allowance: r.allowance == null ? null : Number(r.allowance),
        epf_er: r.epf_er == null ? null : Number(r.epf_er),
        socso_er: r.socso_er == null ? null : Number(r.socso_er),
        eis_er: r.eis_er == null ? null : Number(r.eis_er),
        total_ctc: Number(r.total_ctc),
      }))
    : liveByCompany
  const byCompanyTotal = byCompany.reduce((s, r) => s + r.total_ctc, 0)

  const totals: SubmissionTotals | null = submitted
    ? {
        gross: Number(submission.total_gross),
        payrollGross: Number(submission.total_payroll_gross),
        payrollNet: Number(submission.total_payroll_net),
        statutoryEr: Number(submission.total_statutory_er),
        invoice: Number(submission.total_invoice),
        saving: Number(submission.total_saving),
        directors: Number(submission.director_count),
      }
    : liveTotals

  // Where the billing-vs-payroll difference went. Derived on the fly from the
  // figures already on this tab — nothing is written to the database.
  const gap =
    totals && byCompany.length > 0
      ? calculateDirectorGap({
          poolBasic: byCompany.reduce((s, r) => s + (r.basic ?? 0), 0),
          poolKpi: byCompany.reduce((s, r) => s + (r.kpi ?? 0), 0),
          poolAllowance: byCompany.reduce((s, r) => s + (r.allowance ?? 0), 0),
          ctcEmployerStat: byCompany.reduce(
            (s, r) => s + (r.epf_er ?? 0) + (r.socso_er ?? 0) + (r.eis_er ?? 0),
            0,
          ),
          payrollGross: totals.payrollGross,
          payrollEmployerStat: totals.statutoryEr,
          settings: gapSettings,
          directors: gapDirectors,
        })
      : null

  const missing: string[] = []
  if (!hasActualPayroll) missing.push('Import the InfoTech director payroll')
  if (!hasCtc) missing.push('Save the Pool Breakdown (Billing)')

  return (
    <div>
      {/* Status + CTA strip. The month is in the page eyebrow above. */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="min-w-0">
          {submitted ? (
            <>
              <h2 className="sheet-heading">Submitted to Finance</h2>
              <p className="sheet-subtitle">
                {dayjs(submission.submitted_at).format('D MMM YYYY HH:mm')} ·{' '}
                {totals?.directors} director{totals?.directors === 1 ? '' : 's'} · Finance sees
                these totals + the per-subsidiary split on Billing
              </p>
              {fundingRequest ? (
                <p className="sheet-subtitle flex flex-wrap items-center gap-2">
                  <span>Funding request {formatMoney(Number(fundingRequest.amount))}</span>
                  <FundingRequestStatus status={fundingRequest.status} />
                </p>
              ) : null}
            </>
          ) : (
            <>
              <h2 className="sheet-heading">Not submitted yet</h2>
              <p className="sheet-subtitle">
                {missing.length === 0
                  ? 'Preview below — submitting sends the InfoTech payroll totals + per-subsidiary CTC split to Finance immediately'
                  : `To submit: ${missing.join(' · ')}`}
              </p>
            </>
          )}
        </div>
        <div className="shrink-0">
          {submitted ? (
            <ReopenDirectorSalaryButton period={period} />
          ) : (
            <SubmitDirectorSalaryButton
              period={period}
              totalGross={totals?.gross ?? 0}
              disabled={missing.length > 0}
              disabledHint={missing.length > 0 ? missing.join(' · ') : undefined}
            />
          )}
        </div>
      </div>

      {/* Totals — payroll side (InfoTech actuals). Total gross is what
          Submit sends, so it is the row's one walnut card. */}
      {totals && (
        <StatCards label={`Director payroll totals for ${periodLabel}`}>
          <StatCard
            label="Total gross (InfoTech)"
            value={formatMoney(totals.gross)}
            icon="coin"
            tone="primary"
            note={submitted ? 'As submitted to Finance' : 'Live preview'}
          />
          <StatCard label="Net to directors" value={formatMoney(totals.payrollNet)} icon="bank" />
          <StatCard label="Employer statutory" value={formatMoney(totals.statutoryEr)} icon="shield" note="EPF + SOCSO + EIS" />
          <StatCard label="Directors" value={String(totals.directors)} icon="people" />
        </StatCards>
      )}

      {/* Billing vs Payroll reconciliation — the two lines never tally, and
          this is where the difference goes. Derived live from the figures
          above (rates from dp_settings); nothing is persisted. */}
      {gap && (
        <section className="mb-12">
          <div className="sect-head">
            <h2>Billing vs Payroll — Where the Difference Went</h2>
            <span className="rule" aria-hidden />
            <span className="count">NOT STORED</span>
          </div>

          {/* The difference is what this section explains, so it is the
              row's walnut card. */}
          <StatCards label="Billing against payroll">
            <StatCard
              label="Billed to subsidiaries"
              value={formatMoney(gap.ctcTotal)}
              icon="receipt"
              note={`Gross ${formatMoney(gap.ctcGross)} + ER stat`}
            />
            <StatCard label="Actually paid out" value={formatMoney(gap.cashOut)} icon="wallet" note="InfoTech gross + ER stat" />
            <StatCard label="Difference" value={formatMoney(gap.gap)} icon="swap" tone="primary" note="Stays in the HV account" />
          </StatCards>

          <div className="overflow-x-auto">
            <table className="ledger-table [&_td.num]:whitespace-nowrap">
              <thead>
                <tr>
                  <th>Bucket</th>
                  <th>What it is</th>
                  <th className="right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-medium">
                    {gap.saving > 0 ? `${gapSettings.savingPct}% Saving` : 'Saving'}
                  </td>
                  <td>Held back on the directors&rsquo; behalf — never left HV</td>
                  <td className="num">{formatMoney(gap.saving)}</td>
                </tr>
                <tr>
                  <td className="font-medium">{100 - gapSettings.gbPct}% Billing Invoice</td>
                  <td>Accrues on the outsource side — not part of this payroll</td>
                  <td className="num">{formatMoney(gap.billing25)}</td>
                </tr>
                <tr>
                  <td className="font-medium">Advance fronted by HV</td>
                  <td>
                    Payroll ran above the pool&rsquo;s {gapSettings.gbPct}% share (
                    {formatMoney(gap.totalPay75)}) — HV covered the shortfall
                  </td>
                  <td className="num">
                    <span className="neg">({formatMoney(gap.advanceCash)})</span>
                  </td>
                </tr>
                <tr>
                  <td className="font-medium">Employer Statutory Surplus</td>
                  <td>ER statutory billed to subsidiaries exceeded what payroll actually paid</td>
                  <td className="num">{formatMoney(gap.statutorySurplus)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td className="font-bold">Accounted for</td>
                  <td />
                  <td className="num font-bold">
                    {formatMoney(
                      gap.saving + gap.billing25 - gap.advanceCash + gap.statutorySurplus,
                    )}
                  </td>
                </tr>
                {/* The residual between the buckets and the difference — a
                    quiet line under the total, not a second total. */}
                {Math.abs(gap.residual) >= 0.01 && (
                  <tr>
                    <td><span className="font-normal">Rounding</span></td>
                    <td />
                    <td className="num"><span className="font-normal">{formatMoney(gap.residual)}</span></td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>

          {/* Per-director view of the advance — the ledger figure differs from
              the cash figure whenever someone's share clears their fixed pay. */}
          <div className="overflow-x-auto mt-8">
            <table className="ledger-table [&_td.num]:whitespace-nowrap">
              <thead>
                <tr>
                  <th>Director</th>
                  <th className="right">Pool share ({gapSettings.gbPct}%)</th>
                  <th className="right m-hide">Fixed salary</th>
                  <th className="right m-hide">Vr KPI</th>
                  <th className="right m-hide">{100 - gapSettings.gbPct}% Billing</th>
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {gap.perDirector.map(d => (
                  <LedgerRow key={d.code}>
                    <td className="font-medium">{d.code}</td>
                    <td className="num">{formatMoney(d.totalPay)}</td>
                    <td className="num m-hide" data-label="Fixed salary">{formatMoney(d.fixed)}</td>
                    <td className="num m-hide" data-label="Vr KPI">
                      {d.vrKpi < 0 ? (
                        <span className="neg">({formatMoney(Math.abs(d.vrKpi))})</span>
                      ) : (
                        <span className="text-ledger">{formatMoney(d.vrKpi)}</span>
                      )}
                    </td>
                    <td className="num m-hide" data-label={`${100 - gapSettings.gbPct}% Billing`}>{formatMoney(d.billing25)}</td>
                  </LedgerRow>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="font-bold">Total</td>
                  <td className="num font-bold">{formatMoney(gap.totalPay75)}</td>
                  <td className="num m-hide">
                    {formatMoney(gap.perDirector.reduce((s, d) => s + d.fixed, 0))}
                  </td>
                  <td className="num m-hide">
                    <span className="neg">({formatMoney(gap.advanceLedger)})</span>
                  </td>
                  <td className="num m-hide">{formatMoney(gap.billing25)}</td>
                  <td className="lt-toggle" aria-hidden />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="sheet-notice">
            <p>
              Two advance views: <strong>{formatMoney(gap.advanceLedger)}</strong> is the ledger
              figure — debt booked against only the directors who fell short.{' '}
              <strong>{formatMoney(gap.advanceCash)}</strong> is the cash figure used in the table
              above, which nets off directors whose share ran above their fixed salary, so the
              buckets tally against the difference.
            </p>
            <p className="mt-2">
              Computed on the fly from this period&rsquo;s figures at the rates in Director Pool
              settings ({gapSettings.savingPct}% saving · {gapSettings.gbPct}/
              {100 - gapSettings.gbPct} split). <strong>Nothing here is written to the database</strong> —
              these buckets have no ledger of their own yet, so the difference simply sits in the HV
              bank account.
            </p>
          </div>
        </section>
      )}

      {/* Director Payroll (InfoTech) — per-director detail. Shown here for
          HR/Principal; the snapshot Finance receives stays aggregate-only. */}
      <section className="mb-12">
        <div className="sect-head">
          <h2>Director Payroll (InfoTech)</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {payrollRows.length} DIRECTOR{payrollRows.length === 1 ? '' : 'S'}
          </span>
        </div>
        {payrollRows.length === 0 ? (
          <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
            <p className="text-sm">
              No InfoTech payroll imported for this period yet — import on the Calculation tab.
            </p>
          </div>
        ) : (
          <>
            {submitted && totals &&
              (Math.abs(livePayrollTotals.gross - totals.gross) > 0.01 ||
                Math.abs(livePayrollTotals.net - totals.payrollNet) > 0.01) && (
                <div className="sheet-warning">
                  ⚠ The InfoTech figures changed after this submission — Reopen for edits and
                  submit again so Finance sees the current numbers.
                </div>
              )}
            <div className="table-frame">
              <div className="table-frame-scroll">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Director</th>
                      <th className="right m-hide">Gross</th>
                      <th className="right m-hide">EPF ER</th>
                      <th className="right m-hide">SOCSO+EIS ER</th>
                      <th className="right m-hide">PCB</th>
                      <th className="right">Net</th>
                      <th className="lt-toggle" aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {payrollRows.map(r => (
                      <LedgerRow key={r.id}>
                        <td>
                          <div className="font-medium">{r.director_code ?? r.employee_name}</div>
                          <div className="text-[11px] mt-0.5">{r.employee_name}</div>
                        </td>
                        <td className="num m-hide" data-label="Gross">{formatMoney(r.gross)}</td>
                        <td className="num m-hide" data-label="EPF ER">{formatMoney(r.epf_er)}</td>
                        <td className="num m-hide" data-label="SOCSO+EIS ER">{formatMoney(r.socso_er + r.eis_er)}</td>
                        <td className="num m-hide" data-label="PCB">{formatMoney(r.pcb)}</td>
                        <td className="num font-bold">{formatMoney(r.net)}</td>
                      </LedgerRow>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="font-bold">Total</td>
                      <td className="num m-hide">{formatMoney(livePayrollTotals.gross)}</td>
                      <td className="num m-hide">
                        {formatMoney(payrollRows.reduce((s, r) => s + r.epf_er, 0))}
                      </td>
                      <td className="num m-hide">
                        {formatMoney(payrollRows.reduce((s, r) => s + r.socso_er + r.eis_er, 0))}
                      </td>
                      <td className="num m-hide">{formatMoney(livePayrollTotals.pcb)}</td>
                      <td className="num font-bold">{formatMoney(livePayrollTotals.net)}</td>
                      <td className="lt-toggle" aria-hidden />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="table-frame-foot">
                <span>
                  Per-director detail is visible to HR and Principal only — Finance receives the
                  aggregate totals above, never individual salaries.
                </span>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Per-subsidiary contribution — what Finance bills each company */}
      <section>
        <div className="sect-head">
          <h2>Per-Subsidiary Contribution</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {byCompany.length} COMPAN{byCompany.length === 1 ? 'Y' : 'IES'}
          </span>
        </div>
        {byCompany.length === 0 ? (
          <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
            <p className="text-sm">
              No CTC entered for this period yet — fill the Pool Breakdown grid on the Calculation tab.
            </p>
            <p className="text-xs mt-2">{BILLING_NOTE}</p>
          </div>
        ) : (
          <div className="table-frame">
            <div className="table-frame-scroll">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Subsidiary</th>
                    <th className="right m-hide">Basic</th>
                    <th className="right m-hide">KPI</th>
                    <th className="right m-hide">Allowance</th>
                    <th className="right m-hide">EPF ER</th>
                    <th className="right m-hide">SOCSO ER</th>
                    <th className="right m-hide">EIS ER</th>
                    <th className="right">Total</th>
                    <th className="lt-toggle" aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {byCompany.map(r => (
                    <LedgerRow key={r.company_id}>
                      <td>
                        <div className="font-medium">{r.company_short_code}</div>
                        <div className="text-[11px] mt-0.5">{r.company_name}</div>
                      </td>
                      <td className="num m-hide" data-label="Basic">{r.basic == null ? '—' : formatMoney(r.basic)}</td>
                      <td className="num m-hide" data-label="KPI">{r.kpi == null ? '—' : formatMoney(r.kpi)}</td>
                      <td className="num m-hide" data-label="Allowance">{r.allowance == null ? '—' : formatMoney(r.allowance)}</td>
                      <td className="num m-hide" data-label="EPF ER">{r.epf_er == null ? '—' : formatMoney(r.epf_er)}</td>
                      <td className="num m-hide" data-label="SOCSO ER">{r.socso_er == null ? '—' : formatMoney(r.socso_er)}</td>
                      <td className="num m-hide" data-label="EIS ER">{r.eis_er == null ? '—' : formatMoney(r.eis_er)}</td>
                      <td className="num font-bold">{formatMoney(r.total_ctc)}</td>
                    </LedgerRow>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="font-bold">Total</td>
                    <td className="num m-hide">{sumOrDash(byCompany, r => r.basic)}</td>
                    <td className="num m-hide">{sumOrDash(byCompany, r => r.kpi)}</td>
                    <td className="num m-hide">{sumOrDash(byCompany, r => r.allowance)}</td>
                    <td className="num m-hide">{sumOrDash(byCompany, r => r.epf_er)}</td>
                    <td className="num m-hide">{sumOrDash(byCompany, r => r.socso_er)}</td>
                    <td className="num m-hide">{sumOrDash(byCompany, r => r.eis_er)}</td>
                    <td className="num font-bold">{formatMoney(byCompanyTotal)}</td>
                    <td className="lt-toggle" aria-hidden />
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="table-frame-foot">
              <span>{BILLING_NOTE}</span>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

const BILLING_NOTE =
  'Finance bills each subsidiary via Create Invoice → Director attribution; the modal auto-fills from these amounts.'

// A funding request's state is a word on a wash, in the colour its words
// always carried: amber while Finance has it, neutral while the PV waits on
// Principal, green once the funds are staged.
function FundingRequestStatus({ status }: { status: string }) {
  if (status === 'submitted')
    return <span className="chip alert"><span className="dot" />awaiting Finance</span>
  if (status === 'pv_generated')
    return <span className="chip info"><span className="dot" />PV generated — awaiting Principal</span>
  return <span className="chip ledger"><span className="dot" />completed — funds staged</span>
}
