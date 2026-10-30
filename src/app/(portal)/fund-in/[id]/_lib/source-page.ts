import type { SupabaseClient } from '@supabase/supabase-js'
import type { createClient } from '@/lib/supabase/server'
import type { User } from '@/types'
import { officeMonth, officeTime, officeToday } from '@/lib/office-time'
import { canDo } from '@/lib/permission-actions'
import { expectedFullRepaymentDate } from '@/lib/fund-source-dates'
import { buildRepaymentPlan, type RepaymentPlan } from '@/lib/repayment-plan'
import { fundSourceStart, type RepaymentStart } from '@/lib/repayment-start'
import { dealChangeLine, type DealChange } from '@/lib/deal-audit'
import { SOURCE_TYPE_LABELS, fundStatus, withCode, type FundStatus, type FundTone } from '@/lib/fund-hub'
import { fetchDeptRegistry } from '@/lib/dept-registry'
import { paymentPoolOptions, registryPoolOptions } from '@/lib/payment-pools'
import { INTEREST_EXPENSE_ACCOUNT, PENALTY_EXPENSE_ACCOUNT } from '@/lib/repayment-source-rows'
import { fullDay, type FullStep } from '@/components/finv/FullParts'
import { allTermsChanges, buildTermsSegments, currentSegment, installmentsInAll, segmentsGovern, type TermsChangeComparison, type TermsSegment } from '@/lib/treasury-terms'
import { fetchTermsHistory, isFundSourcePrincipal, paidByMonthByType, principalPaidByMonth, termsForFundSource } from '@/lib/treasury-terms-data'
import type { AmendTerms } from '@/lib/fund-amend'
import type { SourceEditFields } from '@/lib/fund-source-edit'
import { latestTermsRequest, termsRequestNote, type TermsRequestNote } from '@/lib/terms-change-request'

// A fund source's page, read (2026-10-15 — moved out of `/fund-in/[id]/page.tsx`
// word for word, so the Finance phone app's record reads the same): the source,
// who it came from, what is outstanding, its repayments and the vouchers they
// came in on, its terms over time and their changes, the repayment plan, a
// cancellation filed, the trail and the audit log (what the reader's
// permissions open), what this reader may do to it — and, where it may record
// a repayment, the banks, pools and accounts that voucher is made with.

type Client = Awaited<ReturnType<typeof createClient>>

const stamp = (at: string) => officeTime(at).format('DD MMM YYYY · HH:mm')

export interface SourceRepaymentRow {
  id: string
  date: string
  type: string
  amount: number
  /** The voucher it came in on. */
  voucherNo: string | null
  notes: string | null
}

/** Record repayment's voucher (2026-10-02): what Create payment files in loan-repayment mode, the source already known. */
export interface SourceRepaymentOptions {
  /** The lender, in full — the voucher's payee. */
  lender: string
  lenderCompanyId: string | null
  /** The account the source is owed on; the principal line's. */
  accountCode: string | null
  outstanding: number
  /** This month's instalment, to start from. */
  monthlyPrincipal: number
  monthlyInterest: number
  bankAccounts: { id: string; bank_name: string; account_number: string; current_balance: number }[]
  pools: { value: string; label: string }[]
  /** Active chart-of-accounts codes among the three defaults. */
  activeAccounts: string[]
}

export interface SourcePageModel {
  id: string
  status: FundStatus
  typeLabel: string
  /** "HOUZS Century" — the head's name. */
  fromLabel: string
  /** "HOUZS Century (HC)". */
  fromWithCode: string
  amount: number
  effectiveDate: string | null
  maturityDate: string | null
  createdBy: string | null
  /** `DD MMM YYYY · HH:mm`. */
  createdAt: string
  compound: boolean
  /** Months of the plan; null = no fixed term. */
  lockInMonths: number | null
  /** The day it is repaid in full, on its plan. */
  fullyRepaid: string | null
  /** "0.850% /mo". */
  rate: string
  plan: RepaymentPlan
  repayments: SourceRepaymentRow[]
  termsSegments: TermsSegment[]
  termsChanges: TermsChangeComparison[]
  start: RepaymentStart
  minPayInterest: boolean
  /** The month minimum pay interest is checked from (`YYYY-MM-DD`); none — the first instalment (2026-10-30). */
  minPayFrom: string | null
  notes: string | null
  monthlyInterest: number
  monthlyPayment: number
  outstanding: number
  totalPrincipalPaid: number
  /** The bank it came into (NULL = the primary bank at approval). */
  bank: { label: string; number: string | null } | null
  /** Its liability sub-account; NULL falls back to 4000. */
  account: { code: string; name: string } | null
  accountCode: string | null
  st: { text: string; tone: FundTone }
  trail: FullStep[]
  audit: Array<{ at: string; who: string; what: string }>
  /** A cancellation filed and waiting for the Principal. */
  pendingCancel: { by: string; at: string } | null
  /** Its latest terms change filed for the Principal — waiting, or decided within the month. */
  termsRequest: TermsRequestNote | null
  can: {
    /** Treasury · Edit — a pending source's Edit, the settings and notes. */
    financeEdit: boolean
    /** Treasury · Void — Withdraw, Request cancellation. */
    void: boolean
    /** Treasury · Approve — Amend terms (applied at once), revert a change. */
    amend: boolean
    /** Treasury · Edit without Approve, on an active source with none waiting — Amend terms files the change for the Principal. */
    fileTerms: boolean
    /** Treasury · Create, on a live source still owed. */
    recordRepayment: boolean
  }
  /** Record repayment's lists — only where it may be recorded. */
  repay: SourceRepaymentOptions | null
  /** Amend terms' starting values, as its edit page reads them — an active source, Treasury · Approve (or · Edit, to file it). */
  amend: AmendTerms | null
  /** Edit's starting values, as its edit page reads them — a source still pending, Treasury · Edit. */
  edit: SourceEditFields | null
}

/** The fund source's page, or null when the reader may not see it (or it is not there). */
export async function loadSourcePage(supabase: Client, user: User, id: string): Promise<SourcePageModel | null> {
  // audit_changes postdates database.types.ts — asked through the untyped client.
  const db = supabase as unknown as SupabaseClient

  const [
    { data: source, error },
    { data: outstandingRow },
    { data: repayments },
    termsRow,
  ] = await Promise.all([
    supabase.from('fund_sources').select('*').eq('id', id).single(),
    supabase.from('fund_source_outstanding').select('*').eq('fund_source_id', id).single(),
    supabase
      .from('fund_source_repayments')
      .select('*')
      .eq('fund_source_id', id)
      .order('payment_date', { ascending: false }),
    // A terms change filed for the Principal (2026-10-24) — Finance can't see /approvals, so the page says it.
    latestTermsRequest(db, 'fund_source', id),
  ])

  if (error || !source) return null

  // Terms over time (2026-09-21): segments + each 从某月起 change with its 差价.
  const termsHistory = await fetchTermsHistory(supabase, 'fund_source', [source.id])
  const repRows = (repayments ?? []).map((r) => ({ id: source.id, amount: Number(r.amount), payment_date: r.payment_date as string, payment_type: r.payment_type as string }))
  const terms = termsForFundSource(source, termsHistory.get(source.id) ?? [])
  const principalByMonth = principalPaidByMonth(repRows, isFundSourcePrincipal).get(source.id) ?? {}
  const termsSegments = buildTermsSegments(terms, principalByMonth)
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
    supabase.from('users').select('id, name, email').in('id', [source.created_by, source.repaid_by, termsRow?.created_by, termsRow?.decided_by].filter((x): x is string => !!x)),
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
  // Each step asks for the action its Server Action asks (2026-10-08, PR2).
  const canRaise = canDo(user, 'treasury', 'create')

  const today = officeToday()
  const amount = Number(source.amount)
  const outstanding = Number(outstandingRow?.outstanding ?? source.amount)
  const totalPrincipalPaid = Number(outstandingRow?.total_principal_paid ?? 0)
  // Monthly interest = the rate on the principal — or, once the terms changed mid-life, the current segment's figure.
  // So is the monthly payment: the view's reads the record's rate and months on the whole amount, which a change
  // re-bases (HC's Conts 60k from 2026-06: 10,000 + 1,800, not the view's 13,800 on 5 months) — and a fixed amount a
  // month (2026-10-27) splits the principal its own way.
  const nowSeg = segmentsGovern(termsSegments) ? currentSegment(termsSegments, officeMonth()) : null
  const monthlyInterest = nowSeg ? nowSeg.interestPerMonth : amount * Number(source.cost_rate)
  const monthlyPayment = nowSeg && nowSeg.months ? Math.round((nowSeg.principalPerMonth + nowSeg.interestPerMonth) * 100) / 100 : Number(outstandingRow?.monthly_payment ?? 0)
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
  const st = fundStatus({ status, overdue: null, side: 'in', maturity: (source.maturity_date as string | null) ?? null }, today)
  // The whole plan's installments: a 从某月起 change left the months from its month on the record.
  const termMonths = source.lock_in_months ? installmentsInAll(terms.firstDueYM, terms.current.effectiveFrom, Number(source.lock_in_months)) : null
  const fullyRepaid = start.date && termMonths ? expectedFullRepaymentDate(start.date, termMonths) : null

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

  // Amend terms: Treasury · Approve changes them at once; Treasury · Edit files the change for the Principal (2026-10-24) — one at a time.
  const approvesTerms = canDo(user, 'treasury', 'approve')
  const termsRequest = termsRequestNote({
    row: termsRow,
    kind: 'fund_source',
    terms,
    principalByMonth,
    nameOf: (uid) => (uid ? (userName.get(uid) ?? null) : null),
    stamp,
    readerId: user.id,
    readerApprovesAll: canDo(user, 'approvals', 'approve'),
  })
  const fileTerms = isActive && !approvesTerms && canDo(user, 'treasury', 'edit') && termsRequest?.status !== 'pending'

  return {
    id: source.id as string,
    status,
    typeLabel,
    fromLabel,
    fromWithCode,
    amount,
    effectiveDate: (source.effective_date as string | null) ?? null,
    maturityDate: (source.maturity_date as string | null) ?? null,
    createdBy: (source.created_by && userName.get(source.created_by)) || null,
    createdAt: stamp(source.created_at),
    compound: !!source.compound_interest,
    lockInMonths: termMonths,
    fullyRepaid,
    rate: `${(Number(source.cost_rate) * 100).toFixed(3)}% /mo`,
    plan,
    repayments: repaymentsList.map((r) => ({
      id: r.id as string,
      date: r.payment_date as string,
      type: r.payment_type as string,
      amount: Number(r.amount),
      voucherNo: (r.payment_voucher_id && voucherNo.get(r.payment_voucher_id)) || null,
      notes: (r.notes as string | null) ?? null,
    })),
    termsSegments,
    termsChanges,
    start,
    minPayInterest: (source as { min_pay_interest?: boolean }).min_pay_interest === true,
    minPayFrom: (source as { min_pay_interest_from?: string | null }).min_pay_interest_from ?? null,
    notes: (source.notes as string | null) ?? null,
    monthlyInterest,
    monthlyPayment,
    outstanding,
    totalPrincipalPaid,
    bank: bankLabel ? { label: bankLabel, number: bankNumber } : null,
    account: accountRow,
    accountCode: (source.account_code as string | null) ?? null,
    st,
    trail: steps,
    audit: changes,
    pendingCancel: pendingCancel ? { by: ((pendingCancel.users as { name?: string } | null)?.name) ?? 'Finance', at: stamp(pendingCancel.created_at) } : null,
    termsRequest,
    can: {
      financeEdit: canDo(user, 'treasury', 'edit'),
      void: canDo(user, 'treasury', 'void'),
      amend: approvesTerms,
      fileTerms,
      recordRepayment: canRecordRepayment,
    },
    repay: canRecordRepayment
      ? {
          lender: fromLabel,
          lenderCompanyId: (source.from_company_id as string | null) ?? null,
          accountCode: (source.account_code as string | null) ?? null,
          outstanding,
          monthlyPrincipal,
          monthlyInterest: Math.round(monthlyInterest * 100) / 100,
          bankAccounts: (repayBanks ?? []).map((b) => ({
            id: b.id as string,
            bank_name: b.bank_name as string,
            account_number: (b.account_number as string | null) ?? '',
            current_balance: Number(b.current_balance ?? 0),
          })),
          pools: paymentPoolOptions(registryPoolOptions(repayRegistry)),
          activeAccounts: (repayAccounts ?? []).map((a) => a.code as string),
        }
      : null,
    amend:
      isActive && (approvesTerms || fileTerms)
        ? {
            ratePct: (Number(source.cost_rate) * 100).toString(),
            months: (source.lock_in_months ?? '').toString(),
            start: (source.repayment_date as string | null) ?? (source.effective_date as string),
            compound: (source as { compound_interest?: boolean }).compound_interest === true,
            text: source.notes ?? '',
            termsFrom: ((source as { terms_effective_from?: string | null }).terms_effective_from ?? null)?.slice(0, 7) ?? null,
            nextMonth: officeTime().add(1, 'month').format('YYYY-MM'),
          }
        : null,
    edit:
      status === 'pending_approval' && canDo(user, 'treasury', 'edit')
        ? {
            amount: amount.toFixed(2),
            ratePct: (Number(source.cost_rate) * 100).toFixed(3),
            // Blank — no fixed term (the desktop's form starts it at 12).
            months: source.lock_in_months == null ? '' : String(source.lock_in_months),
            effectiveDate: source.effective_date as string,
            // The repayment start the schedule goes by — unset, the month after the effective date.
            repaymentDate: start.date ?? (source.effective_date as string),
            notes: source.notes ?? '',
            accountCode: (source.account_code as string | null) ?? '',
            bankId: (source.bank_account_id as string | null) ?? '',
          }
        : null,
  }
}
