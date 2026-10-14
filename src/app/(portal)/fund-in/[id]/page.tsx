import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { officeMonth, officeTime, officeToday } from '@/lib/office-time'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { expectedFullRepaymentDate } from '@/lib/fund-source-dates'
import { buildRepaymentPlan } from '@/lib/repayment-plan'
import { fundSourceStart } from '@/lib/repayment-start'
import { dealChangeLine, type DealChange } from '@/lib/deal-audit'
import { SOURCE_TYPE_LABELS, fundStatus, withCode, type FundStatus } from '@/lib/fund-hub'
import { requestFundSourceCancel, withdrawFundSource } from '../actions'
import RepaymentStartEditor from './_components/RepaymentStartEditor'
import MinPayInterestToggle from './_components/MinPayInterestToggle'
import NotesEditor from './_components/NotesEditor'
import RecordRepaymentForm from './_components/RecordRepaymentForm'
import { fetchDeptRegistry } from '@/lib/dept-registry'
import { paymentPoolOptions, registryPoolOptions } from '@/lib/payment-pools'
import { INTEREST_EXPENSE_ACCOUNT, PENALTY_EXPENSE_ACCOUNT } from '@/lib/repayment-source-rows'
import TermsTimeline from '@/components/treasury/TermsTimeline'
import RepaymentScheduleSection, { scheduleCount } from '@/components/treasury/RepaymentScheduleSection'
import PrintSchedule from '@/components/treasury/PrintSchedule'
import DealPageSteps from '@/components/treasury/DealPageSteps'
import { FullAudit, FullCard, FullFact, FullPanelRow, FullRow, FullTrail, fullDay, fullStyles as s, type FullStep } from '@/components/finv/FullParts'
import ReturnLink from '@/components/layout/ReturnLink'
import { dealReturn } from '@/lib/deal-return'
import { allTermsChanges, buildTermsSegments, currentSegment, termsChanged } from '@/lib/treasury-terms'
import { fetchTermsHistory, isFundSourcePrincipal, paidByMonthByType, principalPaidByMonth, termsForFundSource } from '@/lib/treasury-terms-data'

// A fund source's full page (2026-10-15, the Finance revamp v2 — D06 of
// `.design/fin-r2/handoff`, the drawer's *View full page ↗*; the prototype
// draws every record's full page one way): *← Fund IN* and the crumb;
// *Fund in · {type}*, the lender with its status, four facts, Print (its
// schedule); then the numbered cards — Received from, the Repayment schedule
// (the payments as recorded fold under it), Terms over time, Repayment
// settings, Notes, Record repayment, the Trail and the Audit log — beside the
// sticky dark panel: the amount, when and where, the booking, and the steps
// this reader may take. Everything the fund source's page did, it still does.

interface Props {
  params: Promise<{ id: string }>
  /** print=1 — the list's Print schedule: the sheet opens straight away. */
  searchParams?: Promise<{ print?: string; from?: string; month?: string }>
}

const f2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`
const stamp = (at: string) => officeTime(at).format('DD MMM YYYY · HH:mm')
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export default async function FundSourceDetailPage({ params, searchParams }: Props) {
  await requirePage('/fund-in/[id]')
  const user = await requirePermission('treasury')
  const { id } = await params
  const sp = (await searchParams) ?? {}

  const supabase = await createClient()
  // audit_changes postdates database.types.ts — asked through the untyped client.
  const db = supabase as unknown as SupabaseClient

  const [
    { data: source, error },
    { data: outstandingRow },
    { data: repayments },
  ] = await Promise.all([
    supabase.from('fund_sources').select('*').eq('id', id).single(),
    supabase.from('fund_source_outstanding').select('*').eq('fund_source_id', id).single(),
    supabase
      .from('fund_source_repayments')
      .select('*')
      .eq('fund_source_id', id)
      .order('payment_date', { ascending: false }),
  ])

  if (error || !source) notFound()

  // Terms over time (2026-09-21): segments + each 从某月起 change with its 差价.
  const termsHistory = await fetchTermsHistory(supabase, 'fund_source', [source.id])
  const repRows = (repayments ?? []).map((r) => ({ id: source.id, amount: Number(r.amount), payment_date: r.payment_date as string, payment_type: r.payment_type as string }))
  const terms = termsForFundSource(source, termsHistory.get(source.id) ?? [])
  const termsSegments = buildTermsSegments(terms, principalPaidByMonth(repRows, isFundSourcePrincipal).get(source.id) ?? {})
  const termsChanges = allTermsChanges(termsSegments, { currentYM: officeMonth(), paidByMonth: paidByMonthByType(repRows, isFundSourcePrincipal).get(source.id) ?? {} })

  const voucherIds = Array.from(new Set((repayments ?? []).map((r) => r.payment_voucher_id).filter((v): v is string => !!v)))
  const [
    { data: pendingCancel },
    { data: approved },
    { data: company },
    { data: department },
    { data: director },
    { data: bank },
    { data: account },
    { data: people },
    { data: voucherRows },
    audit,
  ] = await Promise.all([
    // A filed-but-not-yet-approved cancellation (cancelFundSource files a tier_change); Finance can't see /approvals, so the page says it.
    supabase
      .from('approval_requests')
      .select('created_at, submitted_by, users:submitted_by(name)')
      .eq('reference_id', source.id)
      .eq('reference_table', 'fund_sources')
      .eq('request_type', 'tier_change')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .maybeSingle(),
    // Who approved it — the trail's *Received* (where this reader may see it).
    supabase
      .from('approval_requests')
      .select('approved_at, users:approved_by(name)')
      .eq('reference_id', source.id)
      .eq('reference_table', 'fund_sources')
      .eq('request_type', 'new_fund_source')
      .eq('status', 'approved')
      .order('approved_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    source.from_company_id ? supabase.from('companies').select('name, short_code').eq('id', source.from_company_id).maybeSingle() : Promise.resolve({ data: null }),
    source.from_department_id ? supabase.from('departments').select('name').eq('id', source.from_department_id).maybeSingle() : Promise.resolve({ data: null }),
    !source.from_freetext_name && source.from_director_id ? supabase.from('directors').select('name, code').eq('id', source.from_director_id).maybeSingle() : Promise.resolve({ data: null }),
    // Receiving bank (mig 20260708100000). NULL = the primary bank at approval.
    source.bank_account_id ? supabase.from('bank_accounts').select('bank_name, account_number').eq('id', source.bank_account_id).maybeSingle() : Promise.resolve({ data: null }),
    // Liability sub-account (mig 247). NULL falls back to the umbrella 4000.
    source.account_code ? supabase.from('chart_of_accounts').select('code, name').eq('code', source.account_code).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('users').select('id, name, email').in('id', [source.created_by, source.repaid_by].filter((x): x is string => !!x)),
    // The voucher each repayment came in on — the schedule's "Paid … · PV".
    voucherIds.length ? supabase.from('payment_vouchers').select('id, voucher_no').in('id', voucherIds) : Promise.resolve({ data: [] as Array<{ id: string; voucher_no: string | null }> }),
    // The audit log: the fund source's own changes and its repayments' (what this reader's permissions open).
    Promise.all([
      db.rpc('audit_changes', { p_tables: ['fund_sources'], p_row: source.id, p_limit: 60 }).then((r) => r),
      ...(repayments ?? []).slice(0, 12).map((r) => db.rpc('audit_changes', { p_tables: ['fund_source_repayments'], p_row: r.id as string, p_limit: 5 }).then((x) => x)),
    ]),
  ])

  // Who it came from — the company, the department, the name typed (Item 4: before the director the row may also name).
  const c = company as { name: string; short_code: string | null } | null
  const d = director as { name: string; code: string | null } | null
  const fromLabel = c ? c.name : department ? (department as { name: string }).name : source.from_freetext_name ? (source.from_freetext_name as string) : d ? d.name : '—'
  const fromWithCode = c ? withCode(c.name, c.short_code) : !source.from_freetext_name && d ? withCode(d.name, d.code) : fromLabel
  const userName = new Map(((people ?? []) as Array<{ id: string; name: string | null; email: string | null }>).map((u) => [u.id, u.name ?? u.email ?? '—']))
  const voucherNo = new Map(((voucherRows ?? []) as Array<{ id: string; voucher_no: string | null }>).map((v) => [v.id, v.voucher_no]))
  const bankLabel = bank ? `${(bank as { bank_name: string }).bank_name}` : null
  const bankNumber = bank ? ((bank as { account_number: string | null }).account_number ?? null) : null
  const accountRow = account as { code: string; name: string } | null

  const status = source.status as FundStatus
  const isActive = status === 'active'
  const isMatured = status === 'matured'
  const isRepaid = status === 'repaid'
  const isPending = status === 'pending_approval'
  // Each step asks for the action its Server Action asks (2026-10-08, PR2).
  const canRaise = canDo(user, 'treasury', 'create')
  const canFinanceEdit = canDo(user, 'treasury', 'edit')
  const canVoid = canDo(user, 'treasury', 'void')
  const canAmend = canDo(user, 'treasury', 'approve')

  const today = officeToday()
  const amount = Number(source.amount)
  const outstanding = Number(outstandingRow?.outstanding ?? source.amount)
  const totalPrincipalPaid = Number(outstandingRow?.total_principal_paid ?? 0)
  const monthlyPayment = Number(outstandingRow?.monthly_payment ?? 0)
  // Monthly interest = the rate on the principal — or, once the terms changed mid-life, the current segment's figure.
  const monthlyInterest = termsChanged(termsSegments) ? currentSegment(termsSegments, officeMonth()).interestPerMonth : amount * Number(source.cost_rate)
  const repaymentsList = repayments ?? []

  // The repayment start (2026-10-12): the date the first instalment falls due — the Expected repayment — and every instalment's day.
  const start = fundSourceStart(source)
  const plan = buildRepaymentPlan({
    terms,
    payments: repaymentsList.map((r) => ({
      date: String(r.payment_date).slice(0, 10),
      type: r.payment_type as string,
      amount: Number(r.amount),
      ref: r.payment_voucher_id ? voucherNo.get(r.payment_voucher_id) ?? null : null,
    })),
    isPrincipal: isFundSourcePrincipal,
    today,
    dueDay: start.day,
    status: source.status,
  })

  // Record repayment (2026-10-02): the voucher Create payment files in loan-repayment mode — its banks, pools and accounts.
  const canRecordRepayment = canRaise && (isActive || isMatured) && outstanding > 0
  const repaymentAccounts = [source.account_code, INTEREST_EXPENSE_ACCOUNT, PENALTY_EXPENSE_ACCOUNT].filter((code): code is string => Boolean(code))
  const [{ data: repayBanks }, { data: repayAccounts }, repayRegistry] = canRecordRepayment
    ? await Promise.all([
        supabase.from('bank_accounts').select('id, bank_name, account_number, current_balance').eq('status', 'active').order('is_primary', { ascending: false }),
        supabase.from('chart_of_accounts').select('code').eq('is_active', true).in('code', repaymentAccounts),
        fetchDeptRegistry(supabase).catch(() => []),
      ])
    : [{ data: null }, { data: null }, []]
  // This month's instalment to start from: what is due less its interest, never more than what is still owed;
  // an open-ended source starts at interest only and Finance types the principal going back.
  const monthlyPrincipal = source.lock_in_months ? Math.max(0, Math.min(outstanding, Math.round((monthlyPayment - monthlyInterest) * 100) / 100)) : 0

  const typeLabel = SOURCE_TYPE_LABELS[source.source_type as string] ?? (source.source_type as string)
  const rate = `${(Number(source.cost_rate) * 100).toFixed(3)}% /mo`
  const st = fundStatus({ status, overdue: null, side: 'in', maturity: (source.maturity_date as string | null) ?? null }, today)
  const fullyRepaid = start.date && source.lock_in_months ? expectedFullRepaymentDate(start.date, source.lock_in_months) : null

  const approvedRow = approved as { approved_at: string | null; users: { name?: string } | null } | null
  const steps: FullStep[] = [{ label: 'Created', by: source.created_by ? (userName.get(source.created_by) ?? null) : null, when: stamp(source.created_at), state: 'done' }]
  if (approvedRow || isActive || isMatured || isRepaid) {
    steps.push({ label: 'Received', by: approvedRow?.users?.name ?? null, when: approvedRow?.approved_at ? stamp(approvedRow.approved_at) : fullDay(source.effective_date), state: 'done' })
  } else if (status !== 'cancelled') {
    steps.push({ label: 'Received', by: null, when: null, state: 'todo' })
  }
  if (isRepaid) steps.push({ label: 'Repaid', by: source.repaid_by ? (userName.get(source.repaid_by) ?? null) : null, when: source.repaid_at ? stamp(source.repaid_at) : null, state: 'done' })
  if (status === 'cancelled') steps.push({ label: 'Cancelled', by: null, when: null, state: 'bad' })

  const changes = audit
    .flatMap((r) => (r.error ? [] : ((r.data ?? []) as unknown as Array<DealChange & { id: number; occurred_at: string; actor_id: string | null; actor_name: string | null }>)))
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : b.id - a.id))
    .map((ch) => ({ at: stamp(ch.occurred_at), who: ch.actor_name ?? (ch.actor_id ? 'Removed account' : 'System'), what: dealChangeLine(ch) }))

  // Opened from the Overview or the repayment calendar, it says so and goes back there.
  const back = dealReturn({ href: '/fund-in', label: 'Fund IN' }, sp)
  const filed = pendingCancel
    ? { by: ((pendingCancel.users as { name?: string } | null)?.name) ?? 'Finance', at: stamp(pendingCancel.created_at) }
    : null
  let n = 0

  return (
    <div className={s.root} data-fin-kit="">
      <div className={s.crumbRow}>
        <ReturnLink href={back.href} className={s.back}>
          ← {back.label}
        </ReturnLink>
        <span className={s.crumb}>Fund · Fund IN · {fromLabel}</span>
      </div>

      <div className={s.head}>
        <div className={s.headText}>
          <div className={s.kicker}>Fund in · {typeLabel}</div>
          <div className={s.numberRow}>
            <h1 className={s.number}>{fromLabel}</h1>
            <span className={s.pill} data-tone={st.tone}>
              <span className={s.pillDot} />
              {st.text}
            </span>
          </div>
          <div className={s.facts}>
            <FullFact label="Amount" value={rm(amount)} mono />
            <FullFact label="From" value={fromWithCode} />
            <FullFact label="Date" value={fullDay(source.effective_date)} mono />
            <FullFact label="Created by" value={`${(source.created_by && userName.get(source.created_by)) || 'Unknown'} · ${stamp(source.created_at)}`} />
          </div>
        </div>
        <div className={s.topActs}>
          {status !== 'cancelled' ? (
            <PrintSchedule
              autoOpen={sp.print === '1'}
              triggerClassName={s.topBtn}
              triggerLabel="Print"
              kicker={`FUND IN · ${typeLabel.toUpperCase()}`}
              name={fromLabel}
              plan={plan}
              printed={`Printed ${fullDay(today)} · ${(user as { name?: string | null }).name ?? 'Finance'}`}
              meta={[
                { label: 'Source', value: fromWithCode },
                { label: 'Principal', value: formatMoney(amount) },
                { label: 'Rate', value: rate },
                { label: 'Installments', value: plan.months ? String(plan.months) : 'No fixed term' },
                { label: 'First installment', value: plan.firstDue ? fullDay(plan.firstDue) : '—' },
                { label: 'Installment', value: formatMoney(plan.firstInstallment) },
                { label: 'Total interest', value: `${formatMoney(plan.totalInterest)}${plan.kind === 'open' ? ' (to date)' : ''}` },
                { label: 'Paid', value: formatMoney(plan.principalPaid + plan.interestPaid) },
                { label: 'Outstanding', value: formatMoney(plan.kind === 'open' ? plan.principalOwed : plan.outstandingDue) },
                { label: 'Principal owed', value: formatMoney(plan.principalOwed) },
              ]}
            />
          ) : null}
        </div>
      </div>

      <div className={s.body}>
        <div className={s.cards}>
          <FullCard n={++n} title="Received from">
            <div className={s.lead}>{fromWithCode}</div>
            <dl className={s.dl}>
              <FullRow label="Type" value={typeLabel} />
              <FullRow label="Rate" value={rate} sub={source.compound_interest ? 'compound' : 'simple'} />
              <FullRow label="Term" value={source.lock_in_months ? plural(Number(source.lock_in_months), 'month', 'months') : 'No fixed term'} sub={fullyRepaid ? `repaid in full by ${fullDay(fullyRepaid)}` : null} />
            </dl>
          </FullCard>

          <FullCard n={++n} title="Repayment schedule" aside={scheduleCount(plan)}>
            <RepaymentScheduleSection
              bare
              plan={plan}
              cancelled={status === 'cancelled'}
              recorded={
                repaymentsList.length > 0
                  ? {
                      count: repaymentsList.length,
                      content: (
                        <div className="overflow-x-auto">
                          <table className="ledger-table w-full">
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th className="text-right right">Amount</th>
                                <th className="m-hide">Voucher</th>
                                <th className="m-hide">Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {repaymentsList.map((r) => (
                                <tr key={r.id}>
                                  <td className="whitespace-nowrap">{fullDay(r.payment_date as string)}</td>
                                  <td className="text-graphite">{r.payment_type}</td>
                                  <td className="num">{formatMoney(Number(r.amount))}</td>
                                  <td className="m-hide whitespace-nowrap">{(r.payment_voucher_id && voucherNo.get(r.payment_voucher_id)) || <span className="text-muted">—</span>}</td>
                                  <td className="m-hide text-muted">{r.notes ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ),
                    }
                  : undefined
              }
            />
          </FullCard>

          {termsSegments.some((seg) => seg.changed) ? (
            <FullCard n={++n} title="Terms over time" aside={plural(termsChanges.length, 'CHANGE', 'CHANGES')}>
              <TermsTimeline bare kind="fund_source" recordId={source.id} segments={termsSegments} changes={termsChanges} canRevert={canAmend && isActive} />
            </FullCard>
          ) : null}

          <FullCard n={++n} title="Repayment settings">
            <div className="fin-form">
              <RepaymentStartEditor sourceId={source.id} current={start.set ? start.date : null} min={source.effective_date ?? undefined} />
              <MinPayInterestToggle sourceId={source.id} current={(source as { min_pay_interest?: boolean }).min_pay_interest === true} />
            </div>
          </FullCard>

          <FullCard n={++n} title="Notes">
            <div className="fin-form">
              <NotesEditor sourceId={source.id} current={(source.notes as string | null) ?? null} />
            </div>
          </FullCard>

          {canRecordRepayment ? (
            <FullCard n={++n} title="Record repayment">
              <RecordRepaymentForm
                fundSourceId={source.id}
                lender={fromLabel}
                lenderCompanyId={source.from_company_id ?? null}
                accountCode={source.account_code ?? null}
                outstanding={outstanding}
                monthlyPrincipal={monthlyPrincipal}
                monthlyInterest={Math.round(monthlyInterest * 100) / 100}
                bankAccounts={(repayBanks ?? []).map((b) => ({
                  id: b.id as string,
                  bank_name: b.bank_name as string,
                  account_number: (b.account_number as string | null) ?? '',
                  current_balance: Number(b.current_balance ?? 0),
                }))}
                pools={paymentPoolOptions(registryPoolOptions(repayRegistry))}
                activeAccounts={(repayAccounts ?? []).map((a) => a.code as string)}
              />
            </FullCard>
          ) : null}

          <FullCard n={++n} title="Trail" aside={`${steps.filter((t) => t.state !== 'todo').length} / ${steps.length} steps`}>
            <FullTrail steps={steps} />
          </FullCard>

          <FullCard n={++n} title="Audit log" aside={plural(changes.length, 'EVENT', 'EVENTS')}>
            <FullAudit rows={changes} />
          </FullCard>
        </div>

        <aside className={s.panel} data-light={st.tone}>
          <div className={s.pTop}>
            <span className={s.pLabel}>Fund in</span>
            <span className={s.pChip}>
              <span className={s.pChipDot} />
              {st.text}
            </span>
          </div>
          <div className={s.pAmount}>+{rm(amount)}</div>
          <p className={s.pTo}>From {fromWithCode}</p>

          <div className={s.pGroup}>When &amp; where</div>
          <FullPanelRow label="Received" value={fullDay(source.effective_date)} mono />
          <FullPanelRow label="First repayment" value={start.date ? fullDay(start.date) : '—'} mono={!!start.date} />
          <FullPanelRow label="Maturity" value={source.maturity_date ? fullDay(source.maturity_date) : 'No fixed term'} mono={!!source.maturity_date} />
          <FullPanelRow label="Into bank" value={bankLabel ?? 'Primary bank'} sub={bankNumber ?? (bankLabel ? null : 'not specified')} />

          <div className={s.pGroup}>Booking</div>
          <FullPanelRow label="Account" value={accountRow ? accountRow.name : source.account_code ? String(source.account_code) : 'Fund Sources Payable'} sub={accountRow ? accountRow.code : source.account_code ? null : '4000 · the default'} />
          <FullPanelRow label="Rate" value={rate} sub={`${rm(monthlyInterest)} a month`} mono />
          {source.lock_in_months ? <FullPanelRow label="Monthly payment" value={rm(monthlyPayment)} mono /> : null}
          <FullPanelRow label="Outstanding" value={isActive || isMatured ? rm(outstanding) : '—'} sub={totalPrincipalPaid > 0 ? `${rm(totalPrincipalPaid)} repaid` : null} mono={isActive || isMatured} />

          <DealPageSteps
            side="in"
            id={source.id}
            party={fromLabel}
            amount={amount}
            status={status}
            amendHref={canAmend ? `/fund-in/${source.id}/edit` : null}
            editHref={canFinanceEdit ? `/fund-in/${source.id}/edit` : null}
            withdraw={canVoid ? withdrawFundSource : null}
            requestCancel={canVoid ? requestFundSourceCancel : null}
            pendingCancel={filed}
          />
        </aside>
      </div>
    </div>
  )
}
