import Link from 'next/link'
import { Suspense } from 'react'
import dayjs from 'dayjs'
import { requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { officeMonth, officeToday } from '@/lib/office-time'
import { fetchAllRows } from '@/lib/paginate'
import { buildRepaymentPlan } from '@/lib/repayment-plan'
import { overdueOf, type OverdueSummary } from '@/lib/repayment-calendar'
import { fetchTermsHistory, isFundSourcePrincipal, termsForFundSource } from '@/lib/treasury-terms-data'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import LedgerRow from '@/components/LedgerRow'
import { markOverduePaid } from './actions'
import DetectOverdueButton from './_components/DetectOverdueButton'
import EscalateButton from './_components/EscalateButton'
import OverdueTabs from './_components/OverdueTabs'

// Overdue & Netting on the sheet (2026-10-09, the user's Claude Design handoff
// — Phase 3 of the Finance revamp). Two tabs:
//   Fund OUT · they owe us — the overdue records Detect overdue writes, by
//     month, with their penalty, and the netting & penalty log;
//   Fund IN · we owe — a fund source's installments whose day has passed with
//     something unpaid on them, read off its repayment plan (lib/repayment-
//     plan, the same rows as its page's Repayment schedule).
// Four cards each: what is overdue, the penalty, the longest overdue, what was
// netted this month. 2026-10-10 (the handoff, more closely): the cards come
// before the tabs, every month's table closes on its total, a loan they owe
// us offers Net off (its Record repayment, where Netting is a type), the
// netting log always shows, and on a phone a row opens onto the rest of it.

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

type SourceRow = {
  id: string
  status: string
  amount: number
  cost_rate: number
  lock_in_months: number | null
  compound_interest: boolean | null
  effective_date: string | null
  repayment_start_month: string | null
  terms_effective_from: string | null
  from_company_id: string | null
  from_department_id: string | null
  from_freetext_name: string | null
}

interface Props {
  searchParams?: Promise<{ tab?: string }>
}

/** A record's stage as the sheet's chip: escalated red, grace grey, else overdue amber. */
function StageChip({ stage, status }: { stage: OverdueRow['overdue_stage']; status?: OverdueRow['status'] }) {
  const [tone, label] =
    status === 'paid'
      ? ['ledger', 'paid']
      : status === 'escalated' || stage === 'escalation'
        ? ['danger', 'escalated']
        : stage === 'grace'
          ? ['info', 'grace']
          : ['alert', 'overdue']
  return (
    <span className={`chip ${tone}`}>
      <i className="dot" />
      {label}
    </span>
  )
}

export default async function OverduePage({ searchParams }: Props) {
  const user = await requirePermission('treasury')
  const { tab: rawTab } = (await searchParams) ?? {}
  const tab = rawTab === 'in' ? 'in' : 'out'
  const supabase = await createClient()
  const today = officeToday()
  const month = officeMonth()

  const [{ data: overdueRows }, { data: loans }, { data: companies }, { data: outstandingRows }, { data: loanNetting }, { data: sources }, { data: departments }, sourceReps] =
    await Promise.all([
      supabase
        .from('overdue_records')
        .select('*')
        .order('period_month', { ascending: false })
        .order('overdue_days', { ascending: false }),
      supabase.from('loans').select('id, company_id, principal, effective_rate, status'),
      supabase.from('companies').select('id, name, short_code'),
      supabase.from('loan_outstanding').select('loan_id, outstanding'),
      // Netted this month: a loan's repayments knocked off by netting.
      supabase.from('repayments').select('loan_id, amount, payment_type, payment_date').eq('payment_type', 'netting').gte('payment_date', `${month}-01`),
      supabase
        .from('fund_sources')
        .select('id, status, amount, cost_rate, lock_in_months, compound_interest, effective_date, repayment_start_month, terms_effective_from, from_company_id, from_department_id, from_freetext_name')
        .in('status', ['active', 'matured']),
      supabase.from('departments').select('id, name'),
      fetchAllRows((lo, hi) =>
        supabase
          .from('fund_source_repayments')
          .select('fund_source_id, amount, payment_date, payment_type')
          .order('id', { ascending: true })
          .range(lo, hi),
      ).catch(() => [] as Array<{ fund_source_id: string; amount: number; payment_date: string; payment_type: string }>),
    ])

  const rows = (overdueRows ?? []) as OverdueRow[]
  const loanMap = new Map((loans ?? []).map((l) => [l.id, l]))
  const companyMap = new Map((companies ?? []).map((c) => [c.id, { name: c.name, code: c.short_code }]))
  const outstandingMap = new Map((outstandingRows ?? []).map((o) => [o.loan_id, Number(o.outstanding)]))
  const deptName = new Map(((departments ?? []) as Array<{ id: string; name: string }>).map((d) => [d.id, d.name]))

  // ── Fund OUT: the open records ──
  const active = rows.filter((r) => r.status === 'pending')
  const totalPenalty = active.reduce((sum, r) => sum + Number(r.penalty_amount ?? 0), 0)
  const loanIds = Array.from(new Set(active.map((r) => r.loan_id)))
  const outOutstanding = loanIds.reduce((s, id) => s + (outstandingMap.get(id) ?? Number(loanMap.get(id)?.principal ?? 0)), 0)
  const longestOut = [...active].sort((a, b) => b.overdue_days - a.overdue_days)[0] ?? null
  const companyOf = (loanId: string) => {
    const loan = loanMap.get(loanId)
    return loan ? companyMap.get(loan.company_id) : undefined
  }
  const netted = ((loanNetting ?? []) as Array<{ amount: number; payment_date: string }>).filter((r) => String(r.payment_date).slice(0, 7) === month)
  const nettedTotal = netted.reduce((s, r) => s + Number(r.amount), 0)

  // ── Fund IN: a fund source's installments passed unpaid ──
  const sourceList = (sources ?? []) as SourceRow[]
  const history = sourceList.length ? await fetchTermsHistory(supabase, 'fund_source', sourceList.map((s) => s.id)) : new Map()
  const repsBySource = new Map<string, Array<{ date: string; type: string; amount: number; ref: null }>>()
  for (const r of sourceReps as Array<{ fund_source_id: string; amount: number; payment_date: string; payment_type: string }>) {
    const list = repsBySource.get(r.fund_source_id) ?? []
    list.push({ date: String(r.payment_date).slice(0, 10), type: r.payment_type, amount: Number(r.amount), ref: null })
    repsBySource.set(r.fund_source_id, list)
  }
  const owed: Array<{ source: SourceRow; name: string; months: number | null; due: OverdueSummary }> = []
  for (const s of sourceList) {
    const plan = buildRepaymentPlan({
      terms: termsForFundSource(s, history.get(s.id) ?? []),
      payments: repsBySource.get(s.id) ?? [],
      isPrincipal: isFundSourcePrincipal,
      today,
      dueDay: s.effective_date ? dayjs(s.effective_date).date() : 1,
      status: s.status,
    })
    const due = overdueOf(plan, today)
    if (!due) continue
    const co = s.from_company_id ? companyMap.get(s.from_company_id) : undefined
    const name = (co?.name ?? s.from_freetext_name ?? (s.from_department_id ? deptName.get(s.from_department_id) : null) ?? 'Fund source') as string
    owed.push({ source: s, name, months: plan.months, due })
  }
  const inOutstanding = owed.reduce((s, o) => s + o.due.outstanding, 0)
  const longestIn = [...owed].sort((a, b) => b.due.daysPast - a.due.daysPast)[0] ?? null

  // Detecting and escalating raise records; Mark paid edits one (2026-10-08, PR2).
  const canFinanceAct = canDo(user, 'treasury', 'create')
  const canMarkPaid = canDo(user, 'treasury', 'edit')
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

  // The overdue by the month it fell due.
  const outByMonth = new Map<string, OverdueRow[]>()
  for (const r of active) outByMonth.set(r.period_month.slice(0, 7), [...(outByMonth.get(r.period_month.slice(0, 7)) ?? []), r])
  const inByMonth = new Map<string, typeof owed>()
  for (const o of owed) inByMonth.set(o.due.oldestDue.slice(0, 7), [...(inByMonth.get(o.due.oldestDue.slice(0, 7)) ?? []), o])
  const monthsOf = (m: Map<string, unknown[]>) => Array.from(m.keys()).sort().reverse()
  const monthTitle = (ym: string) => dayjs(`${ym}-01`).format('MMMM YYYY')
  const outOf = (loanId: string) => outstandingMap.get(loanId) ?? Number(loanMap.get(loanId)?.principal ?? 0)
  // The handoff labels a month's foot "Total" over two rows or more; a phone,
  // where the row's own label is all there is, always says it.
  const footLabel = (n: number) => (n > 1 ? 'Total' : <span className="md:hidden">Total</span>)
  const log = rows.filter((r) => r.status !== 'pending')

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

      {/* The cards, then the tabs (the handoff). */}
      {tab === 'out' ? (
        <StatCards label="Overdue · Fund OUT">
          <StatCard tone="primary" label="Overdue outstanding" value={formatMoney(outOutstanding)} icon="alert" note={plural(loanIds.length, 'company', 'companies')} />
          <StatCard tone={totalPenalty > 0 ? 'danger' : 'default'} label="Penalty accrued" value={formatMoney(totalPenalty)} icon="receipt" note="Since due date" />
          <StatCard
            tone={longestOut ? 'danger' : 'default'}
            label="Longest overdue"
            value={longestOut ? `${longestOut.overdue_days} days` : '—'}
            icon="clock"
            note={longestOut ? companyOf(longestOut.loan_id)?.name ?? '—' : 'Nothing overdue'}
          />
          <StatCard label="Netted this month" value={formatMoney(nettedTotal)} icon="swap" note={plural(netted.length, 'netting', 'nettings')} />
        </StatCards>
      ) : (
        <StatCards label="Overdue · Fund IN">
          <StatCard tone="primary" label="Overdue outstanding" value={formatMoney(inOutstanding)} icon="alert" note={`${plural(owed.length, 'fund source', 'fund sources')} · we owe`} />
          <StatCard label="Penalty accrued" value={formatMoney(0)} icon="receipt" note="No penalty on fund sources" />
          <StatCard
            tone={longestIn ? 'danger' : 'default'}
            label="Longest overdue"
            value={longestIn ? `${longestIn.due.daysPast} days` : '—'}
            icon="clock"
            note={longestIn ? longestIn.name : 'Nothing overdue'}
          />
          <StatCard label="Netted this month" value={formatMoney(0)} icon="swap" note="Netting is on loans" />
        </StatCards>
      )}

      <Suspense fallback={null}>
        <OverdueTabs counts={{ out: loanIds.length, in: owed.length }} />
      </Suspense>

      {tab === 'out' ? (
        <>
          {active.length === 0 ? (
            <AllClearState canFinanceAct={canFinanceAct} />
          ) : (
            monthsOf(outByMonth).map((ym) => {
              const list = outByMonth.get(ym)!
              const penalty = list.reduce((s, r) => s + Number(r.penalty_amount ?? 0), 0)
              return (
                <section key={ym} className="mb-9">
                  <div className="sect-head">
                    <h2>{monthTitle(ym)}</h2>
                    <span className="rule" aria-hidden />
                    <span className="count">
                      {plural(list.length, 'LOAN', 'LOANS')} · UNPAID INTEREST
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="ledger-table w-full">
                      <thead>
                        <tr>
                          <th>Company</th>
                          <th className="text-right right">Outstanding</th>
                          <th className="text-right right">Days past</th>
                          <th className="m-hide">Status</th>
                          <th className="text-right right m-hide">Penalty</th>
                          <th className="m-hide" />
                          <th className="lt-toggle" aria-hidden />
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((row) => {
                          const company = companyOf(row.loan_id)
                          return (
                            <LedgerRow key={row.id}>
                              <td>
                                <Link href={`/fund-out/${row.loan_id}`} className="text-ink hover:text-accent">
                                  {company?.name ?? '—'}
                                </Link>
                                <div className="text-[11px] text-graphite mt-0.5">{company?.code ?? ''}</div>
                              </td>
                              <td className="num">{formatMoney(outOf(row.loan_id))}</td>
                              <td className="num">{row.overdue_days}</td>
                              <td className="m-hide" data-label="Status">
                                <StageChip stage={row.overdue_stage} />
                              </td>
                              <td className="num neg m-hide" data-label="Penalty">
                                {Number(row.penalty_amount ?? 0) ? formatMoney(-Number(row.penalty_amount)) : '—'}
                              </td>
                              <td className="m-hide text-right">
                                {canFinanceAct || canMarkPaid ? (
                                  <div className="sch-row-acts">
                                    {canFinanceAct && row.overdue_stage === 'escalation' ? <EscalateButton overdueId={row.id} /> : null}
                                    {canMarkPaid ? (
                                      <form action={markOverduePaid}>
                                        <input type="hidden" name="id" value={row.id} />
                                        <button type="submit" className="sch-row-btn">
                                          Mark paid
                                        </button>
                                      </form>
                                    ) : null}
                                    {/* Net off (the handoff): the loan's Record repayment, where Netting is a type. */}
                                    {canFinanceAct ? (
                                      <Link href={`/fund-out/${row.loan_id}#repayment-form`} className="sch-row-btn border-0">
                                        Net off
                                      </Link>
                                    ) : null}
                                  </div>
                                ) : null}
                              </td>
                            </LedgerRow>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td>{footLabel(list.length)}</td>
                          <td className="num">{formatMoney(list.reduce((s, r) => s + outOf(r.loan_id), 0))}</td>
                          <td />
                          <td className="m-hide" />
                          <td className={`num m-hide${penalty ? ' neg' : ''}`}>{penalty ? formatMoney(-penalty) : '—'}</td>
                          <td className="m-hide" />
                          <td className="lt-toggle" aria-hidden />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </section>
              )
            })
          )}

          {/* ───────── The netting & penalty log — always on show. The
              handoff counts the last 30 days, but a record carries no day it
              was netted or settled, so the log keeps every one and says so. ───────── */}
          <section className="mb-6">
            <div className="sect-head">
              <h2>Netting &amp; penalty log</h2>
              <span className="rule" aria-hidden />
              <span className="count">{plural(log.length, 'RECORD', 'RECORDS')} · ALL TIME</span>
            </div>
            {log.length === 0 ? (
              <p className="text-sm text-graphite">Nothing netted or settled yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="ledger-table w-full">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th className="text-right right">Penalty</th>
                      <th className="text-right right m-hide">Days</th>
                      <th>Status</th>
                      <th className="lt-toggle" aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {log.map((row) => (
                      <LedgerRow key={row.id}>
                        <td>{companyOf(row.loan_id)?.name ?? '—'}</td>
                        <td className="num">{formatMoney(Number(row.penalty_amount ?? 0))}</td>
                        <td className="num m-hide" data-label="Days">
                          {row.overdue_days}
                        </td>
                        <td>
                          <StageChip stage={row.overdue_stage} status={row.status} />
                        </td>
                      </LedgerRow>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          {owed.length === 0 ? (
            <div className="py-16 text-center border border-hairline rounded-md bg-surface">
              <p className="font-sans text-ledger text-lg mb-2">Every fund source is current.</p>
              <p className="font-sans text-muted text-sm">No installment of ours has passed its day unpaid.</p>
            </div>
          ) : (
            monthsOf(inByMonth).map((ym) => {
              const list = inByMonth.get(ym)!
              return (
                <section key={ym} className="mb-9">
                  <div className="sect-head">
                    <h2>{monthTitle(ym)}</h2>
                    <span className="rule" aria-hidden />
                    <span className="count">{plural(list.length, 'SOURCE', 'SOURCES')} · WE OWE</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="ledger-table w-full">
                      <thead>
                        <tr>
                          <th>Fund source</th>
                          <th className="text-right right">Outstanding</th>
                          <th className="text-right right">Days past</th>
                          <th className="m-hide">Status</th>
                          <th className="m-hide">Note</th>
                          <th className="m-hide" />
                          <th className="lt-toggle" aria-hidden />
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((o) => (
                          <LedgerRow key={o.source.id}>
                            <td>
                              <Link href={`/fund-in/${o.source.id}`} className="text-ink hover:text-accent">
                                {o.name}
                              </Link>
                            </td>
                            <td className="num">{formatMoney(o.due.outstanding)}</td>
                            <td className="num">{o.due.daysPast}</td>
                            <td className="m-hide" data-label="Status">
                              <span className="chip alert">
                                <i className="dot" />
                                overdue
                              </span>
                            </td>
                            <td className="m-hide text-graphite" data-label="Note">
                              Instalment {o.due.oldestNo}
                              {o.months ? ` of ${o.months}` : ''}
                              {o.due.count > 1 ? ` · ${o.due.count} unpaid` : ''}
                            </td>
                            <td className="m-hide text-right">
                              <Link href={`/fund-in/${o.source.id}`} className="sch-row-btn border-0">
                                Record payment
                              </Link>
                            </td>
                          </LedgerRow>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td>{footLabel(list.length)}</td>
                          <td className="num">{formatMoney(list.reduce((s, o) => s + o.due.outstanding, 0))}</td>
                          <td />
                          <td className="m-hide" />
                          <td className="m-hide" />
                          <td className="m-hide" />
                          <td className="lt-toggle" aria-hidden />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </section>
              )
            })
          )}
        </>
      )}
    </div>
  )
}

function AllClearState({ canFinanceAct }: { canFinanceAct: boolean }) {
  return (
    <div className="py-16 text-center border border-hairline rounded-md bg-surface">
      <p className="font-sans text-ledger text-lg mb-2">All loans current.</p>
      <p className="font-sans text-muted text-sm">
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
