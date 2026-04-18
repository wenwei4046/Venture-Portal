import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'

interface PageProps {
  params: Promise<{ id: string }>
}

function formatPeriodLabel(period: string): string {
  const d = new Date(period + 'T00:00:00Z')
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export default async function DirectorReportPage({ params }: PageProps) {
  // PDPA: only Principal + HR may see per-director calculation detail.
  // Finance gets lump-sum OPEX on the parent approval page.
  await requireRole(['principal', 'hr'])

  const { id } = await params
  const supabase = await createClient()

  const { data: run } = await supabase
    .from('payroll_runs')
    .select('id, period_month, director_salary_total')
    .eq('id', id)
    .maybeSingle()

  if (!run) notFound()

  const [{ data: ctcRows }, { data: payoutRows }] = await Promise.all([
    supabase
      .from('director_ctc')
      .select('basic, kpi, allowance, employer_epf, employer_socso, employer_eis, total_ctc, company_id, companies(name, short_code)')
      .eq('period_month', run.period_month),
    supabase
      .from('director_payouts')
      .select('id, gross_amount, saving_amount, advance_amount, advance_repaid, advance_balance, payroll_gross, payroll_epf_ee, payroll_socso_ee, payroll_eis_ee, payroll_pcb, payroll_net, invoice_total, statutory_surplus, calculation_snapshot, directors(name, code)')
      .eq('period_month', run.period_month)
      .order('created_at'),
  ])

  const ctc = ctcRows ?? []
  const payouts = payoutRows ?? []

  // Aggregate CTC by company
  const byCompany = new Map<
    string,
    { name: string; short_code: string; basic: number; kpi: number; allowance: number; er: number; total: number }
  >()
  for (const r of ctc) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = (r as any).companies
    const key = r.company_id as string
    const existing = byCompany.get(key) ?? {
      name: comp?.name ?? '—',
      short_code: comp?.short_code ?? '',
      basic: 0,
      kpi: 0,
      allowance: 0,
      er: 0,
      total: 0,
    }
    existing.basic += Number(r.basic ?? 0)
    existing.kpi += Number(r.kpi ?? 0)
    existing.allowance += Number(r.allowance ?? 0)
    existing.er +=
      Number(r.employer_epf ?? 0) + Number(r.employer_socso ?? 0) + Number(r.employer_eis ?? 0)
    existing.total += Number(r.total_ctc ?? 0)
    byCompany.set(key, existing)
  }
  const companies = Array.from(byCompany.values()).sort((a, b) => b.total - a.total)

  const totals = companies.reduce(
    (acc, c) => ({
      basic: acc.basic + c.basic,
      kpi: acc.kpi + c.kpi,
      allowance: acc.allowance + c.allowance,
      er: acc.er + c.er,
      total: acc.total + c.total,
    }),
    { basic: 0, kpi: 0, allowance: 0, er: 0, total: 0 },
  )

  // Per-director totals for the summary row
  const directorTotals = payouts.reduce(
    (acc, p) => ({
      gross: acc.gross + Number(p.gross_amount ?? 0),
      saving: acc.saving + Number(p.saving_amount ?? 0),
      advance: acc.advance + Number(p.advance_amount ?? 0),
      payrollNet: acc.payrollNet + Number(p.payroll_net ?? 0),
      invoiceTotal: acc.invoiceTotal + Number(p.invoice_total ?? 0),
    }),
    { gross: 0, saving: 0, advance: 0, payrollNet: 0, invoiceTotal: 0 },
  )

  return (
    <div>
      <Link
        href={`/approvals/payroll-run/${id}`}
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to payroll run
      </Link>

      <div className="mt-6 mb-10">
        <h1 className="font-serif text-3xl text-ink">
          Director Salary Breakdown · {formatPeriodLabel(run.period_month)}
        </h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          Per-company CTC, per-director payout, and calculation details attached to this payroll submission.
          <em> Restricted to Principal and HR.</em>
        </p>
      </div>

      {/* Per-company CTC */}
      <section className="mb-12">
        <h2 className="font-serif text-xl text-ink mb-1">By company</h2>
        <p className="font-serif italic text-graphite text-sm mb-4">
          CTC contributed by each subsidiary to the director pool.
        </p>
        {companies.length === 0 ? (
          <p className="font-serif italic text-muted">No CTC rows recorded for this period.</p>
        ) : (
          <div className="overflow-x-auto border border-hairline rounded-md bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 px-4 font-medium">Company</th>
                  <th className="text-right py-3 px-4 font-medium">Basic</th>
                  <th className="text-right py-3 px-4 font-medium">KPI</th>
                  <th className="text-right py-3 px-4 font-medium">Allowance</th>
                  <th className="text-right py-3 px-4 font-medium">ER Stat</th>
                  <th className="text-right py-3 px-4 font-medium">Total CTC</th>
                </tr>
              </thead>
              <tbody>
                {companies.map(c => (
                  <tr key={c.short_code} className="border-b border-hairline last:border-0">
                    <td className="py-3 px-4">
                      <div className="font-serif text-md text-ink">{c.name}</div>
                      <div className="font-mono text-xs text-muted">{c.short_code}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular text-ink">{formatMoney(c.basic)}</td>
                    <td className="py-3 px-4 text-right font-mono tabular text-ink">{formatMoney(c.kpi)}</td>
                    <td className="py-3 px-4 text-right font-mono tabular text-ink">{formatMoney(c.allowance)}</td>
                    <td className="py-3 px-4 text-right font-mono tabular text-graphite">{formatMoney(c.er)}</td>
                    <td className="py-3 px-4 text-right font-mono tabular font-medium text-ink">{formatMoney(c.total)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-hairline bg-surface-2/40">
                  <td className="py-3 px-4 font-serif italic text-accent">Director Pool Total</td>
                  <td className="py-3 px-4 text-right font-mono tabular font-semibold text-ink">{formatMoney(totals.basic)}</td>
                  <td className="py-3 px-4 text-right font-mono tabular font-semibold text-ink">{formatMoney(totals.kpi)}</td>
                  <td className="py-3 px-4 text-right font-mono tabular font-semibold text-ink">{formatMoney(totals.allowance)}</td>
                  <td className="py-3 px-4 text-right font-mono tabular font-semibold text-graphite">{formatMoney(totals.er)}</td>
                  <td className="py-3 px-4 text-right font-mono tabular font-semibold text-accent">{formatMoney(totals.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Per-director payout */}
      <section className="mb-12">
        <h2 className="font-serif text-xl text-ink mb-1">By director</h2>
        <p className="font-serif italic text-graphite text-sm mb-4">
          Gross, 5% saving (co-saving deducted), advance issued, and final payroll net per director.
        </p>
        {payouts.length === 0 ? (
          <p className="font-serif italic text-muted">No director payouts calculated for this period.</p>
        ) : (
          <div className="overflow-x-auto border border-hairline rounded-md bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 px-4 font-medium">Director</th>
                  <th className="text-right py-3 px-4 font-medium">Gross</th>
                  <th className="text-right py-3 px-4 font-medium">Co-saving (5%)</th>
                  <th className="text-right py-3 px-4 font-medium">Advance</th>
                  <th className="text-right py-3 px-4 font-medium">Payroll Net</th>
                  <th className="text-right py-3 px-4 font-medium">Invoice Portion</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map(p => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const director = (p as any).directors
                  return (
                    <tr key={p.id} className="border-b border-hairline last:border-0">
                      <td className="py-3 px-4">
                        <div className="font-serif text-md text-ink">{director?.name ?? '—'}</div>
                        <div className="font-mono text-xs text-muted">{director?.code}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular text-ink">{formatMoney(Number(p.gross_amount ?? 0))}</td>
                      <td className="py-3 px-4 text-right font-mono tabular text-graphite">{formatMoney(Number(p.saving_amount ?? 0))}</td>
                      <td className="py-3 px-4 text-right font-mono tabular text-graphite">{formatMoney(Number(p.advance_amount ?? 0))}</td>
                      <td className="py-3 px-4 text-right font-mono tabular font-medium text-ink">{formatMoney(Number(p.payroll_net ?? 0))}</td>
                      <td className="py-3 px-4 text-right font-mono tabular text-graphite">{formatMoney(Number(p.invoice_total ?? 0))}</td>
                    </tr>
                  )
                })}
                <tr className="border-t-2 border-hairline bg-surface-2/40">
                  <td className="py-3 px-4 font-serif italic text-accent">Total</td>
                  <td className="py-3 px-4 text-right font-mono tabular font-semibold text-ink">{formatMoney(directorTotals.gross)}</td>
                  <td className="py-3 px-4 text-right font-mono tabular font-semibold text-graphite">{formatMoney(directorTotals.saving)}</td>
                  <td className="py-3 px-4 text-right font-mono tabular font-semibold text-graphite">{formatMoney(directorTotals.advance)}</td>
                  <td className="py-3 px-4 text-right font-mono tabular font-semibold text-ink">{formatMoney(directorTotals.payrollNet)}</td>
                  <td className="py-3 px-4 text-right font-mono tabular font-semibold text-graphite">{formatMoney(directorTotals.invoiceTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Calculation details per director */}
      {payouts.length > 0 && (
        <section className="mb-12">
          <h2 className="font-serif text-xl text-ink mb-1">Calculation details</h2>
          <p className="font-serif italic text-graphite text-sm mb-4">
            Immutable snapshot of the inputs, rates, and weightage used for each director at calculation time.
          </p>
          <div className="space-y-3">
            {payouts.map(p => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const director = (p as any).directors
              return (
                <details key={p.id} className="border border-hairline rounded-md bg-surface">
                  <summary className="cursor-pointer px-4 py-3 font-serif text-md text-ink flex items-baseline justify-between">
                    <span>
                      {director?.name ?? '—'} <span className="font-mono text-xs text-muted ml-2">{director?.code}</span>
                    </span>
                    <span className="font-mono text-xs text-muted">gross {formatMoney(Number(p.gross_amount ?? 0))}</span>
                  </summary>
                  <div className="px-4 pb-4 pt-1 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-xs font-sans">
                    <CalcField label="Gross" value={p.gross_amount} />
                    <CalcField label="5% Saving" value={p.saving_amount} />
                    <CalcField label="Advance Issued" value={p.advance_amount} />
                    <CalcField label="Advance Repaid" value={p.advance_repaid} />
                    <CalcField label="Payroll Gross" value={p.payroll_gross} />
                    <CalcField label="EPF EE" value={p.payroll_epf_ee} />
                    <CalcField label="SOCSO EE" value={p.payroll_socso_ee} />
                    <CalcField label="EIS EE" value={p.payroll_eis_ee} />
                    <CalcField label="PCB" value={p.payroll_pcb} />
                    <CalcField label="Payroll Net" value={p.payroll_net} strong />
                    <CalcField label="Invoice Total" value={p.invoice_total} />
                    <CalcField label="Stat Surplus" value={p.statutory_surplus} />
                  </div>
                  {p.calculation_snapshot != null && (
                    <div className="border-t border-hairline px-4 py-3">
                      <div className="font-sans text-xs uppercase tracking-wide text-muted mb-1">Raw snapshot</div>
                      <pre className="font-mono text-[11px] text-graphite whitespace-pre-wrap break-words leading-relaxed bg-paper p-3 rounded">
                        {JSON.stringify(p.calculation_snapshot, null, 2)}
                      </pre>
                    </div>
                  )}
                </details>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

function CalcField({ label, value, strong }: { label: string; value: number | string | null; strong?: boolean }) {
  const n = Number(value ?? 0)
  return (
    <div className="flex justify-between border-b border-hairline/60 pb-1">
      <span className="text-muted">{label}</span>
      <span className={`font-mono tabular ${strong ? 'text-ink font-semibold' : 'text-graphite'}`}>
        {formatMoney(n)}
      </span>
    </div>
  )
}
