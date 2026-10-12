import Link from 'next/link'
import { notFound } from 'next/navigation'
import dayjs from 'dayjs'
import { officeMonth, officeTime, officeToday } from '@/lib/office-time'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, formatDate } from '@/lib/utils'
import { expectedFullRepaymentDate } from '@/lib/fund-source-dates'
import { buildRepaymentPlan } from '@/lib/repayment-plan'
import { defaultStart, fundSourceStart } from '@/lib/repayment-start'
import { cancelFundSource } from '../actions'
import { ConfirmButton } from './_components/ConfirmButton'
import WithdrawButton from './_components/WithdrawButton'
import RepaymentStartEditor from './_components/RepaymentStartEditor'
import MinPayInterestToggle from './_components/MinPayInterestToggle'
import NotesEditor from './_components/NotesEditor'
import RecordRepaymentForm from './_components/RecordRepaymentForm'
import { fetchDeptRegistry } from '@/lib/dept-registry'
import { paymentPoolOptions, registryPoolOptions } from '@/lib/payment-pools'
import { INTEREST_EXPENSE_ACCOUNT, PENALTY_EXPENSE_ACCOUNT } from '@/lib/repayment-source-rows'
import TermsTimeline from '@/components/treasury/TermsTimeline'
import RepaymentScheduleSection from '@/components/treasury/RepaymentScheduleSection'
import PrintSchedule from '@/components/treasury/PrintSchedule'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import DetailGroups from '@/components/sheet/DetailGroups'
import ReturnLink from '@/components/layout/ReturnLink'
import { dealReturn } from '@/lib/deal-return'
import { allTermsChanges, buildTermsSegments, currentSegment, termsChanged } from '@/lib/treasury-terms'
import { fetchTermsHistory, isFundSourcePrincipal, paidByMonthByType, principalPaidByMonth, termsForFundSource } from '@/lib/treasury-terms-data'

// A fund source's page (2026-10-09, the user's Claude Design handoff — Phase
// 3 of the Finance revamp): the lender as the title with its status chip,
// Print schedule and Amend terms at the head, the cards, the terms in groups,
// then in the handoff's order — Repayment settings, Notes, Terms over time,
// the Repayment schedule (it replaces the repayment history; the payments as
// recorded fold away under it), Record repayment, and the Actions.

const SOURCE_TYPE_LABELS: Record<string, string> = {
  subsidiary: 'Subsidiary',
  director_loan: 'Director loan',
  department_pool: 'Dept pool transfer',
  director_saving: 'Director saving',
  outsource: 'Outsource',
}

const STATUS_TONE: Record<string, string> = { active: 'ledger', pending_approval: 'wait', matured: 'accent', repaid: 'info', cancelled: '' }

interface Props {
  params: Promise<{ id: string }>
  /** print=1 — the list's Print schedule: the sheet opens straight away. */
  searchParams?: Promise<{ print?: string; from?: string; month?: string }>
}

export default async function FundSourceDetailPage({ params, searchParams }: Props) {
  await requirePage('/fund-in/[id]')
  const user = await requirePermission('treasury')
  const { id } = await params
  const sp = (await searchParams) ?? {}

  const supabase = await createClient()

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

  // A filed-but-not-yet-approved cancellation (cancelFundSource files a
  // tier_change approval). Finance can't see /approvals (principal-only), so
  // surface "审批中" here so the click doesn't look like a no-op (2026-06-15).
  const { data: pendingCancel } = await supabase
    .from('approval_requests')
    .select('created_at, submitted_by, users:submitted_by(name)')
    .eq('reference_id', source.id)
    .eq('reference_table', 'fund_sources')
    .eq('request_type', 'tier_change')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .maybeSingle()

  // Resolve from-label
  let fromLabel = '—'
  let fromSubLabel = ''
  if (source.from_company_id) {
    const { data: c } = await supabase
      .from('companies')
      .select('name, short_code')
      .eq('id', source.from_company_id)
      .single()
    if (c) {
      fromLabel = c.name
      fromSubLabel = c.short_code
    }
  } else if (source.from_department_id) {
    const { data: d } = await supabase
      .from('departments')
      .select('name')
      .eq('id', source.from_department_id)
      .single()
    if (d) {
      fromLabel = d.name
      fromSubLabel = 'Department pool'
    }
  } else if (source.from_freetext_name) {
    // Item 4: director_loan + outsource use free text (no FK lookup).
    fromLabel = source.from_freetext_name
    fromSubLabel =
      source.source_type === 'director_loan' ? 'Director (free text)' : 'Outsource party'
  } else if (source.from_director_id) {
    const { data: d } = await supabase
      .from('directors')
      .select('name, code')
      .eq('id', source.from_director_id)
      .single()
    if (d) {
      fromLabel = d.name
      fromSubLabel = `Director ${d.code}`
    }
  }

  // Resolve repaid_by name
  let repaidByName: string | null = null
  if (source.status === 'repaid' && source.repaid_by) {
    const { data: u } = await supabase
      .from('users')
      .select('name, email')
      .eq('id', source.repaid_by)
      .single()
    if (u) repaidByName = u.name ?? u.email
  }

  // Receiving bank (mig 20260708100000). NULL = falls back to the primary bank
  // at approval, so say so rather than showing a blank.
  let bankLabel: string | null = null
  if (source.bank_account_id) {
    const { data: b } = await supabase
      .from('bank_accounts')
      .select('bank_name, account_number')
      .eq('id', source.bank_account_id)
      .maybeSingle()
    if (b) bankLabel = `${b.bank_name} — ${b.account_number}`
  }

  // Liability sub-account (mig 247). NULL falls back to the umbrella 4000.
  let accountLabel: string | null = null
  if (source.account_code) {
    const { data: a } = await supabase
      .from('chart_of_accounts')
      .select('code, name')
      .eq('code', source.account_code)
      .maybeSingle()
    accountLabel = a ? `${a.code} — ${a.name}` : source.account_code
  }

  // The voucher each repayment came in on — the schedule's "Paid … · PV".
  const voucherIds = Array.from(new Set((repayments ?? []).map((r) => r.payment_voucher_id).filter((v): v is string => !!v)))
  const { data: voucherRows } = voucherIds.length
    ? await supabase.from('payment_vouchers').select('id, voucher_no').in('id', voucherIds)
    : { data: [] as Array<{ id: string; voucher_no: string | null }> }
  const voucherNo = new Map(((voucherRows ?? []) as Array<{ id: string; voucher_no: string | null }>).map((v) => [v.id, v.voucher_no]))

  const isActive = source.status === 'active'
  const isMatured = source.status === 'matured'
  const isRepaid = source.status === 'repaid'
  const isPending = source.status === 'pending_approval'
  // Each button asks for the action its Server Action asks (2026-10-08, PR2):
  // recording a repayment raises a voucher, Edit edits, Withdraw and
  // cancellation void, and amending a booked fund source is Treasury · Approve.
  const canRaise = canDo(user, 'treasury', 'create')
  const canFinanceEdit = canDo(user, 'treasury', 'edit')
  const canVoid = canDo(user, 'treasury', 'void')
  const canAmend = canDo(user, 'treasury', 'approve')

  const today = officeToday()
  const maturityDays = source.maturity_date
    ? dayjs(source.maturity_date).diff(today, 'day')
    : null

  // Outstanding balance from view (falls back to original amount if no repayments)
  const outstanding = Number(outstandingRow?.outstanding ?? source.amount)
  const totalPrincipalPaid = Number(outstandingRow?.total_principal_paid ?? 0)
  const totalInterestDue = Number(outstandingRow?.total_interest_due ?? 0)
  const monthlyPayment = Number(outstandingRow?.monthly_payment ?? 0)

  // Monthly interest = fixed rate × original principal — or, once the terms
  // changed mid-life, the current segment's figure (rate × principal still
  // owed when it began).
  const monthlyInterest = termsChanged(termsSegments)
    ? currentSegment(termsSegments, officeMonth()).interestPerMonth
    : Number(source.amount) * Number(source.cost_rate)

  const repaymentsList = repayments ?? []

  // The repayment start (2026-10-12, user: expected repayment 和 repayment
  // start date 应该要一样): the date the first instalment falls due — the
  // Expected repayment — and every instalment's day.
  const start = fundSourceStart(source)
  const unsetStart = defaultStart(source.effective_date)

  // The Repayment schedule (2026-10-09): the plan by the terms, the money in
  // set against it oldest first.
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

  // Record repayment (2026-10-02): the form below files the same voucher
  // Create payment does in loan-repayment mode, so it needs the banks, the
  // pools and which of the three default accounts actually exist.
  const canRecordRepayment = canRaise && (isActive || isMatured) && outstanding > 0
  const repaymentAccounts = [source.account_code, INTEREST_EXPENSE_ACCOUNT, PENALTY_EXPENSE_ACCOUNT].filter(
    (c): c is string => Boolean(c),
  )
  const [{ data: repayBanks }, { data: repayAccounts }, repayRegistry] = canRecordRepayment
    ? await Promise.all([
        supabase
          .from('bank_accounts')
          .select('id, bank_name, account_number, current_balance')
          .eq('status', 'active')
          .order('is_primary', { ascending: false }),
        supabase.from('chart_of_accounts').select('code').eq('is_active', true).in('code', repaymentAccounts),
        fetchDeptRegistry(supabase).catch(() => []),
      ])
    : [{ data: null }, { data: null }, []]
  // This month's instalment to start from: what is due less its interest,
  // never more than what is still owed. An open-ended source (no lock-in) has
  // no instalment — the view prices it as ONE period, i.e. the whole balance —
  // so it starts at interest only and Finance types whatever principal is
  // actually going back.
  const monthlyPrincipal = source.lock_in_months
    ? Math.max(0, Math.min(outstanding, Math.round((monthlyPayment - monthlyInterest) * 100) / 100))
    : 0

  const typeLabel = SOURCE_TYPE_LABELS[source.source_type] ?? source.source_type
  const rate = `${(Number(source.cost_rate) * 100).toFixed(3)}% /mo`
  const fromWithCode = source.from_company_id && fromSubLabel ? `${fromLabel} (${fromSubLabel})` : fromLabel
  const tone = STATUS_TONE[source.status] ?? ''
  const monthsLeft = isActive && maturityDays !== null ? (maturityDays < 0 ? ` · past by ${Math.abs(maturityDays)}d` : ` · ${maturityDays}d remaining`) : ''
  const dateLong = (d: string) => dayjs(d).format('D MMM YYYY')
  // Opened from the Overview or the repayment calendar, it says so and goes back there.
  const back = dealReturn({ href: '/fund-in', label: 'Fund IN' }, sp)

  return (
    <div>
      <div className="mb-3">
        <ReturnLink href={back.href} className="text-[13px] text-graphite hover:text-ink font-sans transition-colors">
          ← Back to {back.label}
        </ReturnLink>
      </div>

      {/* ───────── Header ───────── */}
      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · {typeLabel.toUpperCase()}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="page-title">{fromLabel}</h1>
            <span className={`chip lg${tone ? ` ${tone}` : ''}`}>
              <i className="dot" />
              {String(source.status).replace('_', ' ')}
            </span>
          </div>
          <p className="font-sans text-xs text-graphite mt-2">
            {fromSubLabel}
            {fromSubLabel ? ' · ' : ''}Recorded {officeTime(source.created_at).format('D MMMM YYYY')}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {source.status !== 'cancelled' ? (
            <PrintSchedule
              autoOpen={sp.print === '1'}
              kicker={`FUND IN · ${typeLabel.toUpperCase()}`}
              name={fromLabel}
              plan={plan}
              printed={`Printed ${dateLong(today)} · ${(user as { name?: string | null }).name ?? 'Finance'}`}
              meta={[
                { label: 'Source', value: fromWithCode },
                { label: 'Principal', value: formatMoney(Number(source.amount)) },
                { label: 'Rate', value: rate },
                { label: 'Installments', value: plan.months ? String(plan.months) : 'No fixed term' },
                { label: 'First installment', value: plan.firstDue ? dateLong(plan.firstDue) : '—' },
                { label: 'Installment', value: formatMoney(plan.firstInstallment) },
                { label: 'Total interest', value: `${formatMoney(plan.totalInterest)}${plan.kind === 'open' ? ' (to date)' : ''}` },
                { label: 'Paid', value: formatMoney(plan.principalPaid + plan.interestPaid) },
                { label: 'Outstanding', value: formatMoney(plan.kind === 'open' ? plan.principalOwed : plan.outstandingDue) },
                { label: 'Principal owed', value: formatMoney(plan.principalOwed) },
              ]}
            />
          ) : null}
          {canAmend && isActive ? (
            <Link href={`/fund-in/${source.id}/edit`} className="btn-quiet-sheet">
              Amend terms
            </Link>
          ) : null}
        </div>
      </div>

      {/* ───────── Cards ───────── */}
      <StatCards label="Fund source">
        <StatCard tone="primary" label="Principal" value={formatMoney(Number(source.amount))} icon="coin" note={`Effective ${dateLong(source.effective_date)}`} />
        <StatCard
          tone={isRepaid ? 'ledger' : 'default'}
          label="Outstanding"
          value={formatMoney(outstanding)}
          icon="wallet"
          note={totalPrincipalPaid > 0 ? `Repaid ${formatMoney(totalPrincipalPaid)} of ${formatMoney(Number(source.amount))}` : 'No principal repaid yet'}
        />
        <StatCard label="Interest rate" value={rate} icon="percent" note={`Monthly ${formatMoney(monthlyInterest)} · total ${formatMoney(totalInterestDue)}`} />
        {source.lock_in_months ? (
          <StatCard
            // Maturing soon is waiting, not late: the blue wait tone (2026-10-10).
            tone={isActive && maturityDays !== null && maturityDays <= 30 ? 'wait' : 'default'}
            label="Monthly payment"
            value={formatMoney(monthlyPayment)}
            icon="calendar"
            note={`${source.lock_in_months}M · ${source.maturity_date ? `matures ${dateLong(source.maturity_date)}` : 'no maturity'}${monthsLeft}`}
          />
        ) : null}
        {start.date && source.status !== 'cancelled' ? (
          <StatCard
            label="Expected repayment (first installment)"
            value={dateLong(start.date)}
            icon="clock"
            note={source.lock_in_months ? `Full repayment: ${formatDate(expectedFullRepaymentDate(start.date, source.lock_in_months))}` : 'No fixed term'}
          />
        ) : null}
      </StatCards>

      {/* ───────── Details ───────── */}
      <DetailGroups
        title="Details"
        count="TERMS & ROUTING"
        groups={[
          {
            title: 'Terms',
            items: [
              { label: 'Source type', value: typeLabel, text: true },
              { label: 'From', value: fromWithCode, text: true },
              { label: 'Interest rate', value: `${rate} · ${source.compound_interest ? 'compound' : 'simple'}` },
              { label: 'Repayment period', value: source.lock_in_months ? `${source.lock_in_months} months` : 'No fixed term', text: true },
            ],
          },
          {
            title: 'Dates',
            items: [
              { label: 'Effective date', value: dateLong(source.effective_date) },
              { label: 'Expected repayment', value: start.date ? dateLong(start.date) : '—' },
              { label: 'Maturity date', value: source.maturity_date ? dateLong(source.maturity_date) : '—' },
            ],
          },
          {
            title: 'Routing',
            items: [
              { label: 'Receive into bank', value: bankLabel ?? 'Primary bank (not specified)', text: true },
              { label: 'Amount due to (BS account)', value: accountLabel ?? '4000 — Fund Sources Payable (default)', text: true },
            ],
          },
        ]}
      />

      {/* ───────── Fully repaid — under its own heading, the date as its
          count (2026-10-10, the handoff) ───────── */}
      {isRepaid && source.repaid_at ? (
        <section className="mb-9" aria-label="Fully repaid">
          <div className="sect-head">
            <h2>Fully repaid</h2>
            <span className="rule" aria-hidden />
            <span className="count">{officeTime(source.repaid_at).format('D MMM YYYY').toUpperCase()}</span>
          </div>
          <div className="fin-notice ledger">
            Repaid on {officeTime(source.repaid_at).format('D MMM YYYY')}
            {repaidByName ? ` by ${repaidByName}` : ''}.
          </div>
        </section>
      ) : null}

      {/* ───────── Repayment settings ───────── */}
      <section className="mb-9">
        <div className="sect-head">
          <h2>Repayment settings</h2>
          <span className="rule" aria-hidden />
          <span className="count">FINANCE · EDITABLE ANYTIME</span>
        </div>
        <div className="fin-form">
          <RepaymentStartEditor
            sourceId={source.id}
            current={start.set ? start.date : null}
            defaultHint={unsetStart ? dateLong(unsetStart) : 'the month after receipt'}
            min={source.effective_date ?? undefined}
          />
          <MinPayInterestToggle sourceId={source.id} current={(source as { min_pay_interest?: boolean }).min_pay_interest === true} />
        </div>
      </section>

      {/* ───────── Notes ───────── */}
      <section className="mb-9">
        <div className="sect-head">
          <h2>Notes</h2>
          <span className="rule" aria-hidden />
          <span className="count">FINANCE · SHOWS ON COMPANY STATEMENT</span>
        </div>
        <div className="fin-form">
          <NotesEditor sourceId={source.id} current={(source.notes as string | null) ?? null} />
        </div>
      </section>

      {/* ───────── Terms over time ───────── */}
      <TermsTimeline kind="fund_source" recordId={source.id} segments={termsSegments} changes={termsChanges} canRevert={canAmend && source.status === 'active'} />

      {/* ───────── Repayment schedule (the payments fold under it) ───────── */}
      <RepaymentScheduleSection
        plan={plan}
        cancelled={source.status === 'cancelled'}
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
                            <td className="whitespace-nowrap">{dateLong(r.payment_date)}</td>
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

      {/* ───────── Record repayment — the same entry a loan has on Fund out ───────── */}
      {canRecordRepayment ? (
        <section className="mb-9">
          <div className="sect-head">
            <h2>Record repayment</h2>
            <span className="rule" aria-hidden />
            <span className="count">FINANCE · PRINCIPAL + INTEREST + PENALTY</span>
          </div>
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
        </section>
      ) : null}

      {/* ───────── Actions (Finance only) ───────── */}
      {pendingCancel ? (
        // Cancellation already filed — show it (Finance can't open /approvals).
        <section className="mb-6">
          <div className="sect-head">
            <h2>Actions</h2>
            <span className="rule" aria-hidden />
            <span className="count">CANCELLATION PENDING</span>
          </div>
          <div className="fin-actions">
            <span className="note">
              ⏳ Cancellation pending Principal approval — requested by {((pendingCancel.users as { name?: string } | null)?.name) ?? 'Finance'} on{' '}
              {officeTime(pendingCancel.created_at).format('D MMM YYYY HH:mm')}. The Principal approves it in Approvals; the deposit
              reverses (bank, Venture Pool, GL) and is marked cancelled.
            </span>
          </div>
        </section>
      ) : (canFinanceEdit || canVoid) && isPending ? (
        <section className="mb-6">
          <div className="sect-head">
            <h2>Actions</h2>
            <span className="rule" aria-hidden />
            <span className="count">EDITABLE UNTIL PRINCIPAL APPROVES</span>
          </div>
          <div className="fin-actions">
            {canFinanceEdit ? (
              <Link href={`/fund-in/${source.id}/edit`} className="btn-sec">
                Edit fund source
              </Link>
            ) : null}
            {canVoid ? <WithdrawButton id={source.id} /> : null}
            <span className="note">
              Fix typos, wrong amount, wrong rate, or wrong dates while the request is still pending. Locks once the Principal approves.
              Submitted the whole thing by mistake? Withdraw it directly — no Principal needed.
            </span>
          </div>
        </section>
      ) : canVoid && isActive ? (
        <section className="mb-6">
          <div className="sect-head">
            <h2>Actions</h2>
            <span className="rule" aria-hidden />
            <span className="count">CANCELLATION NEEDS PRINCIPAL APPROVAL</span>
          </div>
          <div className="fin-actions">
            <ConfirmButton
              id={source.id}
              action={cancelFundSource}
              confirmMessage={`Cancel this fund source?\n\nThis will submit a cancellation request for Principal approval. The fund source remains active until approved.`}
              className="btn-danger"
            >
              Request cancellation
            </ConfirmButton>
            <span className="note">Submits a cancellation request for Principal approval. The fund source remains active until approved.</span>
          </div>
        </section>
      ) : null}
    </div>
  )
}
