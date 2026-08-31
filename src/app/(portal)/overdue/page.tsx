import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { markOverduePaid } from './actions'
import DetectOverdueButton from './_components/DetectOverdueButton'
import EscalateButton from './_components/EscalateButton'
import { OverdueBadge } from '@/components/motion/OverdueBadge'

type OverdueRow = {
  id: string
  loan_id: string
  period_month: string
  overdue_days: number
  overdue_stage: 'grace' | 'late_1' | 'late_2' | 'escalation' | null
  is_overdue: boolean
  penalty_rate: number | null
  penalty_amount: number | null
  status: 'pending' | 'paid' | 'escalated'
  created_at: string
}

export default async function OverduePage() {
  const user = await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const [{ data: overdueRows }, { data: loans }, { data: companies }, { data: outstandingRows }] =
    await Promise.all([
      supabase
        .from('overdue_records')
        .select('*')
        .order('period_month', { ascending: false })
        .order('overdue_days', { ascending: false }),
      supabase.from('loans').select('id, company_id, principal, effective_rate, status'),
      supabase.from('companies').select('id, name, short_code'),
      supabase.from('loan_outstanding').select('loan_id, outstanding'),
    ])

  const rows = (overdueRows ?? []) as OverdueRow[]
  const loanMap = new Map((loans ?? []).map((l) => [l.id, l]))
  const companyMap = new Map(
    (companies ?? []).map((c) => [c.id, { name: c.name, code: c.short_code }])
  )
  const outstandingMap = new Map(
    (outstandingRows ?? []).map((o) => [o.loan_id, Number(o.outstanding)])
  )

  const active = rows.filter((r) => r.status === 'pending')
  const totalPenalty = active.reduce((sum, r) => sum + Number(r.penalty_amount ?? 0), 0)

  // Phase 7 Step 12: group active overdue by period_month for display
  const activeByPeriod = new Map<string, OverdueRow[]>()
  for (const r of active) {
    const list = activeByPeriod.get(r.period_month) ?? []
    list.push(r)
    activeByPeriod.set(r.period_month, list)
  }
  const activePeriods = Array.from(activeByPeriod.keys()).sort().reverse()

  const canFinanceAct = user.role === 'finance' || user.role === 'principal'

  return (
    <div>
      {/* ───────── Header ───────── */}
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · OVERDUE &amp; NETTING
          </div>
          <h1 className="page-title">Overdue &amp; Netting</h1>
        </div>
        {canFinanceAct ? <DetectOverdueButton /> : null}
      </div>

      {/* ───────── Hero: penalty outstanding ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7">
          <div className="font-serif italic text-accent text-base mb-1">
            Penalty outstanding
          </div>
          <div className="font-serif text-[30px] sm:text-[44px] md:text-hero text-num-ink leading-none tabular tracking-[-0.01em]">
            {totalPenalty > 0 ? (
              formatMoney(totalPenalty)
            ) : (
              <>
                RM <span className="text-muted">—</span>
              </>
            )}
          </div>
          <div className="font-mono text-[11.5px] text-graphite mt-3 tracking-[0.02em] font-medium">
            {active.length} PENDING {active.length === 1 ? 'RECORD' : 'RECORDS'}
          </div>
        </div>

        {active.length > 0 ? (
          <div className="lg:col-span-5 space-y-2">
            {activePeriods.slice(0, 3).map((period) => (
              <div
                key={period}
                className="flex items-baseline justify-between font-mono text-sm"
              >
                <em className="font-serif text-md text-graphite">
                  {dayjs(period).format('MMM YYYY')}
                </em>
                <span className="text-ink tabular">
                  {activeByPeriod.get(period)?.length ?? 0}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* ───────── Active overdue — grouped by calendar month ───────── */}
      {active.length === 0 ? (
        <AllClearState canFinanceAct={canFinanceAct} />
      ) : (
        activePeriods.map((period) => (
          <section key={period} className="mb-12">
            <div className="sect-head">
              <h2>{dayjs(period).format('MMMM YYYY')}</h2>
              <span className="rule" aria-hidden />
              <span className="count">{activeByPeriod.get(period)!.length} {activeByPeriod.get(period)!.length === 1 ? 'LOAN' : 'LOANS'} · UNPAID INTEREST</span>
            </div>

            <div className="overflow-x-auto">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th className="right">Outstanding</th>
                    <th className="right">Days past</th>
                    <th>Status</th>
                    <th className="right">Penalty</th>
                    <th className="right"></th>
                  </tr>
                </thead>
                <tbody className="row-stagger">
                  {activeByPeriod.get(period)!.map((row, i) => {
                    const loan = loanMap.get(row.loan_id)
                    const company = loan ? companyMap.get(loan.company_id) : undefined
                    const outstanding = outstandingMap.get(row.loan_id) ?? Number(loan?.principal ?? 0)
                    const hasLegacyStage = !!row.overdue_stage
                    return (
                      <tr
                        key={row.id}
                        style={{ '--i': i } as React.CSSProperties}
                      >
                        <td>
                          <div className="font-serif text-[15px] text-ink">
                            {company?.name ?? '—'}
                          </div>
                          <div className="font-mono text-[11px] text-graphite mt-0.5">
                            {company?.code ?? ''}
                          </div>
                        </td>
                        <td className="num">
                          {formatMoney(outstanding)}
                        </td>
                        <td className="num">
                          {row.overdue_days}d
                        </td>
                        <td>
                          <OverdueBadge
                            id={row.id}
                            label={hasLegacyStage ? stageLabel(row.overdue_stage!) : 'overdue'}
                            className={hasLegacyStage
                              ? stageLabelClass(row.overdue_stage!)
                              : 'text-danger text-sm'}
                          />
                        </td>
                        <td className="num neg">
                          {formatMoney(Number(row.penalty_amount ?? 0))}
                        </td>
                        <td className="right">
                          {canFinanceAct ? (
                            <div className="flex items-center justify-end gap-3">
                              {row.overdue_stage === 'escalation' ? (
                                <EscalateButton overdueId={row.id} />
                              ) : null}
                              <form action={markOverduePaid}>
                                <input type="hidden" name="id" value={row.id} />
                                <button
                                  type="submit"
                                  className="text-sm text-graphite hover:text-accent font-serif italic transition-colors"
                                >
                                  Mark paid
                                </button>
                              </form>
                            </div>
                          ) : (
                            <span className="text-xs font-mono text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      {/* ───────── Escalated + paid history ───────── */}
      {rows.length > active.length ? (
        <section className="mt-12 pt-8 border-t border-hairline">
          <h2 className="font-serif text-xl text-ink mb-1">History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Company</th>
                  <th className="text-right py-3 pr-4 font-medium">Penalty</th>
                  <th className="text-right py-3 pr-4 font-medium">Days</th>
                  <th className="text-left py-3 pr-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="row-stagger">
                {rows
                  .filter((r) => r.status !== 'pending')
                  .map((row, i) => {
                    const loan = loanMap.get(row.loan_id)
                    const company = loan ? companyMap.get(loan.company_id) : undefined
                    return (
                      <tr
                        key={row.id}
                        style={{ '--i': i } as React.CSSProperties}
                        className="border-b border-hairline last:border-0 text-muted"
                      >
                        <td className="py-3 pr-4 font-serif">{company?.name ?? '—'}</td>
                        <td className="py-3 pr-4 text-right font-mono tabular">
                          {formatMoney(Number(row.penalty_amount ?? 0))}
                        </td>
                        <td className="py-3 pr-4 text-right font-mono tabular">
                          {row.overdue_days}d
                        </td>
                        <td className="py-3 pr-4">
                          <em className="font-serif italic text-xs">
                            {row.status === 'escalated' ? 'escalated' : 'paid'}
                          </em>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}


function stageLabel(stage: string): string {
  if (stage === 'grace') return 'grace'
  if (stage === 'late_1') return 'late 1'
  if (stage === 'late_2') return 'late 2'
  if (stage === 'escalation') return 'escalation'
  return stage
}

function stageLabelClass(stage: string): string {
  if (stage === 'grace') return 'text-graphite text-sm'
  if (stage === 'late_1') return 'text-alert text-sm'
  if (stage === 'late_2') return 'text-alert text-sm'
  return 'text-danger text-sm'
}

function AllClearState({ canFinanceAct }: { canFinanceAct: boolean }) {
  return (
    <div className="py-16 text-center border border-hairline rounded-md bg-surface">
      <p className="font-serif italic text-ledger text-lg mb-2">All loans current.</p>
      <p className="font-serif italic text-muted text-sm">
        {canFinanceAct ? (
          <>
            No overdue records pending. Click <em>Detect overdue</em> to scan active loans.
          </>
        ) : (
          <>No overdue records pending.</>
        )}
      </p>
    </div>
  )
}
