import Link from 'next/link'
import { Suspense } from 'react'
import dayjs from 'dayjs'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { officeMonth, officeToday } from '@/lib/office-time'
import { fetchAllRows, fetchByKeys } from '@/lib/paginate'
import { buildRepaymentPlan } from '@/lib/repayment-plan'
import { overdueOf, type OverdueSummary } from '@/lib/repayment-calendar'
import { fetchTermsHistory, isFundSourcePrincipal, termsForFundSource } from '@/lib/treasury-terms-data'
import { loadRepaymentBook, type BookDeal } from '@/lib/repayment-book'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import LedgerRow from '@/components/LedgerRow'
import OverdueTabs from './_components/OverdueTabs'

// Overdue & Netting on the sheet (2026-10-09, the user's Claude Design handoff
// — Phase 3 of the Finance revamp). Two tabs, each read off the deals'
// repayment plans (lib/repayment-plan, the same rows as a deal's page's
// Repayment schedule): the instalments whose day has passed with something
// unpaid on them, under the month of the oldest —
//   Fund OUT · they owe us — the active loans (2026-10-12, user: 我不想要自己按
//     detect over due, 就打开时就最新: no Detect overdue, no record to mark paid
//     or escalate — a payment recorded on the loan clears its row);
//   Fund IN · we owe — the active and matured fund sources.
// Four cards each: what is overdue, the penalty, the longest overdue, what was
// netted this month. 2026-10-10 (the handoff, more closely): the cards come
// before the tabs, every month's table closes on its total, a loan they owe
// us offers its Record repayment (where Netting is a type), the netting log
// always shows, and on a phone a row opens onto the rest of it.
// 2026-10-12 (user: 两个都改 … 对，照这个做): the netting & penalty log is what
// was netted or charged on the tab's side, each on its day, over the last 30
// days (the handoff's count) — on both tabs; a record marked paid or escalated
// is no longer in it (it is neither, and keeps no day). Fund IN's Netted this
// month counts the fund sources' nettings (it said "Netting is on loans").

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
  from_director_id?: string | null
  from_freetext_name: string | null
}

interface Props {
  searchParams?: Promise<{ tab?: string }>
}

/** One netting or penalty, as the log lists it. */
type LogEntry = { id: string; date: string; dealId: string; name: string; type: 'netting' | 'penalty'; amount: number }

// The handoff labels a table's foot "Total" over two rows or more; a phone,
// where the row's own label is all there is, always says it.
const footLabel = (n: number) => (n > 1 ? 'Total' : <span className="md:hidden">Total</span>)

/** "Instalment 3 of 6 · 3 unpaid" — the oldest unpaid, the plan's length, how many. */
const dueNote = (due: OverdueSummary, months: number | null) =>
  `Instalment ${due.oldestNo}${months ? ` of ${months}` : ''}${due.count > 1 ? ` · ${due.count} unpaid` : ''}`

export default async function OverduePage({ searchParams }: Props) {
  await requirePage('/overdue')
  const user = await requirePermission('treasury')
  const { tab: rawTab } = (await searchParams) ?? {}
  const tab = rawTab === 'in' ? 'in' : 'out'
  const supabase = await createClient()
  const today = officeToday()
  const month = officeMonth()
  // The log's 30 days, today among them (2026-10-12, the handoff's LAST 30 DAYS).
  const logSince = dayjs(today).subtract(29, 'day').format('YYYY-MM-DD')
  const monthStart = `${month}-01`

  const [loanBook, { data: loans }, { data: companies }, { data: loanMoveRows }, { data: sources }, { data: departments }, sourceReps, { data: directors }] =
    await Promise.all([
      // Fund OUT (2026-10-12): every active loan's repayment plan.
      loadRepaymentBook(supabase, today, { only: 'collect' }),
      // Every loan's borrower, for the log's names (a loan repaid since too).
      supabase.from('loans').select('id, company_id'),
      supabase.from('companies').select('id, name, short_code'),
      // A loan's nettings and penalties (2026-10-12): this month's nettings
      // for the card, the last 30 days' nettings and penalties for the log.
      supabase
        .from('repayments')
        .select('id, loan_id, amount, payment_type, payment_date')
        .in('payment_type', ['netting', 'penalty'])
        .gte('payment_date', logSince < monthStart ? logSince : monthStart),
      supabase
        .from('fund_sources')
        .select('id, status, amount, cost_rate, lock_in_months, compound_interest, effective_date, repayment_start_month, terms_effective_from, from_company_id, from_department_id, from_director_id, from_freetext_name')
        .in('status', ['active', 'matured']),
      supabase.from('departments').select('id, name'),
      fetchAllRows((lo, hi) =>
        supabase
          .from('fund_source_repayments')
          .select('id, fund_source_id, amount, payment_date, payment_type')
          .order('id', { ascending: true })
          .range(lo, hi),
      ).catch(() => [] as Array<{ id: string; fund_source_id: string; amount: number; payment_date: string; payment_type: string }>),
      // A director's fund source goes by the director's name (2026-10-12).
      supabase.from('directors').select('id, name'),
    ])

  const loanMap = new Map((loans ?? []).map((l) => [l.id, l]))
  const companyMap = new Map((companies ?? []).map((c) => [c.id, { name: c.name, code: c.short_code }]))
  const deptName = new Map(((departments ?? []) as Array<{ id: string; name: string }>).map((d) => [d.id, d.name]))
  const directorName = new Map(((directors ?? []) as Array<{ id: string; name: string }>).map((d) => [d.id, d.name]))

  // ── Fund OUT: a loan's installments passed unpaid, longest first ──
  const outOwed = loanBook
    .map((deal) => ({ deal, due: overdueOf(deal.plan, today) }))
    .filter((o): o is { deal: BookDeal; due: OverdueSummary } => o.due !== null)
    .sort((a, b) => b.due.daysPast - a.due.daysPast || b.due.outstanding - a.due.outstanding)
  const outOutstanding = outOwed.reduce((s, o) => s + o.due.outstanding, 0)
  const longestOut = outOwed[0] ?? null
  const companyOf = (loanId: string) => {
    const loan = loanMap.get(loanId)
    return loan ? companyMap.get(loan.company_id) : undefined
  }
  // What was netted or charged (2026-10-12): a card counts the month's
  // nettings, a log lists the last 30 days' nettings and penalties.
  type Move = { id: string; amount: number; payment_type: string; payment_date: string }
  const inMonth = (r: Move) => String(r.payment_date).slice(0, 7) === month
  const loggable = (r: Move) => (r.payment_type === 'netting' || r.payment_type === 'penalty') && String(r.payment_date).slice(0, 10) >= logSince
  const newestFirst = (a: LogEntry, b: LogEntry) => b.date.localeCompare(a.date) || b.amount - a.amount
  const entry = (r: Move, dealId: string, name: string): LogEntry => ({
    id: r.id,
    date: String(r.payment_date).slice(0, 10),
    dealId,
    name,
    type: r.payment_type === 'penalty' ? 'penalty' : 'netting',
    amount: Number(r.amount),
  })
  const loanMoves = (loanMoveRows ?? []) as Array<Move & { loan_id: string }>
  const netted = loanMoves.filter((r) => r.payment_type === 'netting' && inMonth(r))
  const nettedTotal = netted.reduce((s, r) => s + Number(r.amount), 0)
  const penalties = loanMoves.filter((r) => r.payment_type === 'penalty' && inMonth(r))
  const penaltyTotal = penalties.reduce((s, r) => s + Number(r.amount), 0)
  const outLog = loanMoves
    .filter(loggable)
    .map((r) => entry(r, r.loan_id, companyOf(r.loan_id)?.name ?? '—'))
    .sort(newestFirst)

  // ── Fund IN: a fund source's installments passed unpaid ──
  const sourceList = (sources ?? []) as SourceRow[]
  type Named = Pick<SourceRow, 'id' | 'from_company_id' | 'from_freetext_name' | 'from_director_id' | 'from_department_id'>
  const sourceName = (s: Named) =>
    ((s.from_company_id ? companyMap.get(s.from_company_id)?.name : null) ??
      s.from_freetext_name ??
      (s.from_director_id ? directorName.get(s.from_director_id) : null) ??
      (s.from_department_id ? deptName.get(s.from_department_id) : null) ??
      'Fund source') as string
  const fsMoves = sourceReps as Array<Move & { fund_source_id: string }>
  const fsLogMoves = fsMoves.filter(loggable)
  // A fund source netted in the last 30 days and repaid since is not among the
  // live ones read above; its name is read beside the terms history.
  const named = new Map<string, Named>(sourceList.map((s) => [s.id, s]))
  const unnamed = Array.from(new Set(fsLogMoves.map((r) => r.fund_source_id).filter((id) => !named.has(id))))
  const [history, gone] = await Promise.all([
    sourceList.length ? fetchTermsHistory(supabase, 'fund_source', sourceList.map((s) => s.id)) : Promise.resolve(new Map()),
    fetchByKeys(unnamed, (chunk) => supabase.from('fund_sources').select('id, from_company_id, from_department_id, from_director_id, from_freetext_name').in('id', chunk)),
  ])
  for (const s of gone as Named[]) named.set(s.id, s)
  const fsNetted = fsMoves.filter((r) => r.payment_type === 'netting' && inMonth(r))
  const fsNettedTotal = fsNetted.reduce((s, r) => s + Number(r.amount), 0)
  const inLog = fsLogMoves
    .map((r) => {
      const s = named.get(r.fund_source_id)
      return entry(r, r.fund_source_id, s ? sourceName(s) : 'Fund source')
    })
    .sort(newestFirst)
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
    owed.push({ source: s, name: sourceName(s), months: plan.months, due })
  }
  const inOutstanding = owed.reduce((s, o) => s + o.due.outstanding, 0)
  const longestIn = [...owed].sort((a, b) => b.due.daysPast - a.due.daysPast)[0] ?? null

  // Recording a repayment is Treasury · Create (the loan's own form).
  const canFinanceAct = canDo(user, 'treasury', 'create')
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

  // The overdue by the month the oldest unpaid instalment fell due.
  const outByMonth = new Map<string, typeof outOwed>()
  for (const o of outOwed) outByMonth.set(o.due.oldestDue.slice(0, 7), [...(outByMonth.get(o.due.oldestDue.slice(0, 7)) ?? []), o])
  const inByMonth = new Map<string, typeof owed>()
  for (const o of owed) inByMonth.set(o.due.oldestDue.slice(0, 7), [...(inByMonth.get(o.due.oldestDue.slice(0, 7)) ?? []), o])
  const monthsOf = (m: Map<string, unknown[]>) => Array.from(m.keys()).sort().reverse()
  const monthTitle = (ym: string) => dayjs(`${ym}-01`).format('MMMM YYYY')

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
      </div>

      {/* The cards, then the tabs (the handoff). */}
      {tab === 'out' ? (
        <StatCards label="Overdue · Fund OUT">
          <StatCard tone="primary" label="Overdue outstanding" value={formatMoney(outOutstanding)} icon="alert" note={plural(outOwed.length, 'loan', 'loans')} />
          <StatCard tone={penaltyTotal > 0 ? 'danger' : 'default'} label="Penalty this month" value={formatMoney(penaltyTotal)} icon="receipt" note={plural(penalties.length, 'penalty', 'penalties')} />
          <StatCard
            tone={longestOut ? 'danger' : 'default'}
            label="Longest overdue"
            value={longestOut ? `${longestOut.due.daysPast} days` : '—'}
            icon="clock"
            note={longestOut ? longestOut.deal.name : 'Nothing overdue'}
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
          <StatCard label="Netted this month" value={formatMoney(fsNettedTotal)} icon="swap" note={plural(fsNetted.length, 'netting', 'nettings')} />
        </StatCards>
      )}

      <Suspense fallback={null}>
        <OverdueTabs counts={{ out: outOwed.length, in: owed.length }} />
      </Suspense>

      {tab === 'out' ? (
        <>
          {outOwed.length === 0 ? (
            <div className="py-16 text-center border border-hairline rounded-md bg-surface">
              <p className="font-sans text-ledger text-lg mb-2">All loans current.</p>
              <p className="font-sans text-muted text-sm">No installment of theirs has passed its day unpaid.</p>
            </div>
          ) : (
            monthsOf(outByMonth).map((ym) => {
              const list = outByMonth.get(ym)!
              return (
                <section key={ym} className="mb-9">
                  <div className="sect-head">
                    <h2>{monthTitle(ym)}</h2>
                    <span className="rule" aria-hidden />
                    <span className="count">{plural(list.length, 'LOAN', 'LOANS')} · THEY OWE US</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="ledger-table w-full">
                      <thead>
                        <tr>
                          <th>Company</th>
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
                          <LedgerRow key={o.deal.id}>
                            <td>
                              <Link href={o.deal.href} className="text-ink hover:text-accent">
                                {o.deal.name}
                              </Link>
                              <div className="text-[11px] text-graphite mt-0.5">{o.deal.companyId ? companyMap.get(o.deal.companyId)?.code ?? '' : ''}</div>
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
                              {dueNote(o.due, o.deal.plan.months)}
                            </td>
                            <td className="m-hide text-right">
                              {/* The loan's Record repayment, where Netting is a type. */}
                              {canFinanceAct ? (
                                <Link href={`${o.deal.href}#repayment-form`} className="sch-row-btn border-0">
                                  Record receipt
                                </Link>
                              ) : null}
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

          {/* ───────── The netting & penalty log — always on show. ───────── */}
          <NettingLog side="out" entries={outLog} />
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
                              {dueNote(o.due, o.months)}
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

          {/* ───────── The netting & penalty log — always on show. ───────── */}
          <NettingLog side="in" entries={inLog} />
        </>
      )}
    </div>
  )
}

/** The netting & penalty log (2026-10-12): what was netted or charged on one
 *  side, each on its day, over the last 30 days — a loan's on Fund OUT, a
 *  fund source's on Fund IN; each opens its deal. */
function NettingLog({ side, entries }: { side: 'out' | 'in'; entries: LogEntry[] }) {
  return (
    <section className="mb-6">
      <div className="sect-head">
        <h2>Netting &amp; penalty log</h2>
        <span className="rule" aria-hidden />
        <span className="count">
          {entries.length} {entries.length === 1 ? 'ENTRY' : 'ENTRIES'} · LAST 30 DAYS
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-graphite">No netting or penalty in the last 30 days.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="ledger-table w-full">
            <thead>
              <tr>
                <th>Date</th>
                <th>{side === 'out' ? 'Company' : 'Fund source'}</th>
                <th className="m-hide">Type</th>
                <th className="text-right right">Amount</th>
                <th className="lt-toggle" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <LedgerRow key={e.id}>
                  <td className="whitespace-nowrap">{dayjs(e.date).format('D MMM YYYY')}</td>
                  <td>
                    <Link href={`/fund-${side}/${e.dealId}`} className="text-ink hover:text-accent">
                      {e.name}
                    </Link>
                  </td>
                  <td className="m-hide" data-label="Type">
                    <span className={`chip ${e.type === 'penalty' ? 'danger' : 'ledger'}`}>
                      <i className="dot" />
                      {e.type}
                    </span>
                  </td>
                  <td className="num">{formatMoney(e.amount)}</td>
                </LedgerRow>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{footLabel(entries.length)}</td>
                <td />
                <td className="m-hide" />
                <td className="num">{formatMoney(entries.reduce((s, e) => s + e.amount, 0))}</td>
                <td className="lt-toggle" aria-hidden />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}
