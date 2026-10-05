import Link from 'next/link'
import { notFound } from 'next/navigation'
import dayjs from 'dayjs'
import { requirePermission } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { canSeePayrollPayouts } from '@/lib/roles'
import { isPayrollReference } from '@/lib/payroll-vouchers'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { submitForApproval, approveVoucher, voidVoucher, voidPaidReceipt, reversePaidPayment, returnVoucherToDraft } from '../actions'
import VoucherActions from './_components/VoucherActions'
import CopyVoucherButton from './_components/CopyVoucherButton'
import ReassignGlAccountButton from './_components/ReassignGlAccountButton'
import AttachmentUploader from './_components/AttachmentUploader'
import AmendDateButton from '../_components/AmendDateButton'
import AttachmentList from '@/components/voucher/AttachmentList'
import LedgerRow from '@/components/LedgerRow'
import { recipientAccountLabel, salaryPaymentLabel } from '@/lib/payroll-voucher-display'
import { AR_PARENT, accountFamily } from '@/lib/ar-accounts'
import { bankShort } from '@/lib/deal-preview'
import { DealMore } from '@/components/treasury/DealFormShell'
import { officeStamp } from '@/lib/office-clock'
import type { ReactNode } from 'react'

const POOL_LABELS: Record<string, string> = {
  venture_pool: 'Venture Pool',
  dept_pool_director: 'Director Pool',
  dept_pool_marketing: 'Marketing Dept Pool',
  dept_pool_finance: 'Finance Dept Pool',
  dept_pool_director_office: 'Director Office Pool',
  dept_pool_hr: 'HR Dept Pool',
  invoice_payout_pool: 'Invoice Payout Pool',
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function PaymentDetailPage({ params }: Props) {
  const user = await requirePermission('treasury', 'hr_costing')
  const canReadTreasury = can(user, 'treasury')
  const { id } = await params
  const supabase = await createClient()

  let voucherQuery = supabase
    .from('payment_vouchers')
    .select('*')
    .eq('id', id)
  if (!canReadTreasury) voucherQuery = voucherQuery.in('reference_type', ['payroll_disbursement', 'payroll_statutory', 'payroll_payment_request'])
  const { data: voucher, error } = await voucherQuery.single()

  if (error || !voucher) notFound()
  // A payroll voucher says what one named person is paid. Without Payroll
  // payouts it does not open (2026-10-02) — Payments shows such an account the
  // batch's total instead, and offers no way here.
  if (isPayrollReference(voucher.reference_type) && !canSeePayrollPayouts(user)) notFound()

  // Resolve names
  let payeeCompanyName: string | null = null
  if (voucher.payee_company_id) {
    const { data: c } = await supabase.from('companies').select('name, short_code').eq('id', voucher.payee_company_id).single()
    if (c) payeeCompanyName = `${c.name} (${c.short_code})`
  }

  let bankName: string | null = null
  // The same account as the panel prints it: "Hong Leong Bank ···7890".
  let bankLabel: string | null = null
  if (voucher.bank_account_id) {
    const { data: b } = await supabase.from('bank_accounts').select('bank_name, account_number').eq('id', voucher.bank_account_id).single()
    if (b) {
      bankName = `${b.bank_name} — ${b.account_number}`
      bankLabel = bankShort(b.bank_name, b.account_number ?? '')
    }
  }

  let approvedByName: string | null = null
  if (voucher.approved_by) {
    const { data: u } = await supabase.from('users').select('name').eq('id', voucher.approved_by).single()
    if (u) approvedByName = u.name
  }

  let createdByName: string | null = null
  {
    const { data: u } = await supabase.from('users').select('name').eq('id', voucher.created_by).single()
    if (u) createdByName = u.name
  }

  // Attachments
  const { data: attachments } = canReadTreasury ? await supabase
    .from('payment_attachments')
    .select('*')
    .eq('voucher_id', id)
    .order('uploaded_at', { ascending: false })
    : { data: [] }

  // Bank balance for approval check display
  let bankBalance: number | null = null
  if (canReadTreasury && bankName && voucher.bank_account_id) {
    const { data: bankData } = await supabase
      .from('bank_accounts')
      .select('current_balance')
      .eq('id', voucher.bank_account_id)
      .single()
    if (bankData) bankBalance = Number(bankData.current_balance)
  }

  // Attachments come and go freely only while the voucher is still being made.
  const attachmentsOpen = voucher.status === 'draft' || voucher.status === 'pending_approval'

  const isPrincipal = canReadTreasury && user.role === 'principal'
  // Unified portal (2026-07-16): Principal gets the Finance-side voucher
  // actions too (copy / mark paid / void).
  const isFinance = canReadTreasury && (user.role === 'finance' || isPrincipal)

  // Post-mig 238: PVS rows reference chart_of_accounts directly via account_code
  // (the COA `code` IS the GL). Pool + account name both come from the sources
  // subtable for debit AND credit (mig 205 backfilled one synthetic row for
  // every credit voucher).
  const { data: pvsRows } = await supabase
    .from('payment_voucher_sources')
    .select('pool, amount, account_code, chart_of_accounts!pvs_account_code_fk(name)')
    .eq('voucher_id', id)
    .order('amount', { ascending: false })

  const sourceRows = (pvsRows ?? []) as Array<{
    pool: string
    amount: string | number
    account_code: string | null
    chart_of_accounts: { name: string } | null
  }>

  const categoryLabels = Array.from(
    new Set(
      sourceRows
        .map((r) => r.chart_of_accounts?.name ?? (r.account_code ? r.account_code.replace(/_/g, ' ') : null))
        .filter((l): l is string => !!l)
    )
  )
  const categoryLabel = categoryLabels.length > 0 ? categoryLabels.join(' + ') : null

  // Mig 20260910150000: a payroll disbursement voucher knows who it pays —
  // one line for a per-person PV, N lines for a department PV.
  // database.types.ts not regenerated for the new table (same escape hatch as
  // the payroll RPCs).
  const { data: payrollLines, error: payrollLinesError } =
    voucher.reference_type === 'payroll_disbursement'
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('payroll_voucher_lines')
          .select('id, scope, payroll_row_id, employee_name, employee_code, department_name, net, salary_component, recipient_account, bank_name, bank_account_no')
          .eq('voucher_id', id)
          .order('employee_name')
          .order('salary_component')
      : { data: null, error: null }
  if (payrollLinesError) throw new Error('Unable to load the recorded salary payment details. Please try again.')
  const peopleOnVoucher = ((payrollLines ?? []) as unknown) as Array<{
    id: string
    scope: string
    payroll_row_id: string
    employee_name: string
    employee_code: string | null
    department_name: string | null
    net: string | number
    salary_component: string | null
    recipient_account: string | null
    bank_name: string | null
    bank_account_no: string | null
  }>
  const salaryPeople = new Set(peopleOnVoucher.map(line => `${line.scope}:${line.payroll_row_id}`)).size

  // Read the contribution snapshots written with this PV. Current payroll or
  // department membership must never change the people an existing PV covers.
  const { data: statutoryLines, error: statutoryLinesError } =
    voucher.reference_type === 'payroll_statutory'
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('payroll_statutory_voucher_lines')
          .select('id, scope, payroll_row_id, employee_name, employee_code, department_name, period_month, scheme, amount')
          .eq('voucher_id', id)
          .order('department_name')
          .order('employee_name')
          .order('scheme')
      : { data: null, error: null }
  if (statutoryLinesError) throw new Error('Unable to load the recorded statutory contribution details. Please try again.')
  const statutoryCoverage = (statutoryLines ?? []) as Array<{
    id: string
    scope: string
    payroll_row_id: string
    employee_name: string
    employee_code: string | null
    department_name: string
    period_month: string
    scheme: string
    amount: string | number
  }>
  const statutoryPeople = new Set(statutoryCoverage.map((line) => `${line.scope}:${line.payroll_row_id}`)).size
  const statutoryPeriods = Array.from(new Set(statutoryCoverage.map((line) => dayjs(line.period_month).format('MMMM YYYY')))).join(' · ')

  // Reassign-GL data (user 2026-08-24: "gl account 放错,我希望approve 了我还
  // 能改"): offer the voucher's actually-POSTED non-bank GL accounts as the
  // from-side, and every active non-bank account as the to-side. 3030 is
  // excluded — that leg belongs to invoice settlement.
  let reassignFrom: Array<{ code: string; name: string; total: number }> = []
  let accountOptions: Array<{ code: string; name: string }> = []
  if (isFinance && (voucher.status === 'approved' || voucher.status === 'paid')) {
    const [{ data: jlRows }, { data: coaRows }, { data: bankCodesData }] = await Promise.all([
      supabase
        .from('journal_lines')
        .select('account_code, debit, credit, journal_entries!inner(reference_type, reference_id, is_reversed)')
        .eq('journal_entries.reference_type', 'payment_voucher')
        .eq('journal_entries.reference_id', id)
        .eq('journal_entries.is_reversed', false),
      supabase.from('chart_of_accounts').select('code, name').eq('is_active', true).order('code'),
      supabase.rpc('bank_gl_codes' as never),
    ])
    const bankSet = new Set(((bankCodesData ?? []) as unknown as string[]))
    // AR is per customer since 2026-09-29, so the leg to hide is the whole
    // 3030 family, not just the old pooled code.
    const arFamily = new Set(await accountFamily(supabase, AR_PARENT))
    const nameByCode = new Map(
      ((coaRows ?? []) as Array<{ code: string; name: string }>).map((c) => [c.code, c.name]),
    )
    const totals = new Map<string, number>()
    for (const l of (jlRows ?? []) as Array<{ account_code: string; debit: number | null; credit: number | null }>) {
      if (bankSet.has(l.account_code) || l.account_code === '3000' || arFamily.has(l.account_code)) continue
      totals.set(l.account_code, (totals.get(l.account_code) ?? 0) + Number(l.debit ?? 0) + Number(l.credit ?? 0))
    }
    reassignFrom = [...totals.entries()].map(([code, total]) => ({
      code,
      name: nameByCode.get(code) ?? code,
      total: Math.round(total * 100) / 100,
    }))
    accountOptions = ((coaRows ?? []) as Array<{ code: string; name: string }>).filter(
      (c) => !bankSet.has(c.code) && c.code !== '3000',
    )
  }

  let poolLabel: string | null = null
  if (voucher.direction === 'credit') {
    // Credit: target_pool is still authoritative on payment_vouchers; the
    // synthetic source row mirrors it but source_pool on the voucher stays NULL.
    poolLabel = voucher.target_pool
      ? (POOL_LABELS[voucher.target_pool] ?? voucher.target_pool.replace(/_/g, ' '))
      : null
  } else if (sourceRows.length > 0) {
    poolLabel = sourceRows
      .map((r) => POOL_LABELS[r.pool] ?? r.pool.replace(/_/g, ' '))
      .join(' + ')
  } else if (voucher.source_pool) {
    // Legacy fallback for any row that somehow missed mig 103/205 backfill
    poolLabel = POOL_LABELS[voucher.source_pool] ?? voucher.source_pool.replace(/_/g, ' ')
  }

  const isCredit = voucher.direction === 'credit'
  const isPayrollVoucher = ['payroll_disbursement', 'payroll_statutory', 'payroll_payment_request'].includes(voucher.reference_type ?? '')
  const amount = Number(voucher.amount)
  const status = voucher.status as string

  // The invoices a receipt settled — one through invoice_id, several when the
  // receipt was a consolidated one (they point back at it).
  let settledInvoices: string[] = []
  if (canReadTreasury && isCredit) {
    const [{ data: batch }, { data: single }] = await Promise.all([
      supabase.from('invoices').select('invoice_no').eq('settlement_voucher_id', id).order('invoice_no'),
      voucher.invoice_id
        ? supabase.from('invoices').select('invoice_no').eq('id', voucher.invoice_id)
        : Promise.resolve({ data: [] as Array<{ invoice_no: string | null }> }),
    ])
    settledInvoices = Array.from(
      new Set([...(single ?? []), ...(batch ?? [])].map((i) => i.invoice_no).filter((n): n is string => !!n)),
    )
  }

  const chip = STATUS_CHIP[status] ?? { tone: '', side: '', zh: status }
  const statusZh = status === 'paid' ? (isCredit ? '已收' : '已付') : chip.zh

  // ── What happened to it, in order. Money received is booked on the spot, so a
  // receipt has no approval to show; a payment goes 建立 → 送批 → 批准 → 付款.
  // No column records WHEN a voucher was submitted or voided: updated_at is the
  // submit time only while it is still pending, and the void time once voided.
  const steps: TrailStep[] = [{ label: '建立', by: createdByName, at: voucher.created_at, state: 'done' }]
  if (status === 'voided') {
    if (!isCredit && voucher.approved_at) steps.push({ label: '批准', by: approvedByName, at: voucher.approved_at, state: 'done' })
    if (voucher.executed_at) steps.push({ label: isCredit ? '已入账' : '付款', at: voucher.executed_at, state: 'done' })
    steps.push({ label: '作废', at: voucher.updated_at, state: 'bad' })
  } else if (isCredit) {
    steps.push(
      voucher.executed_at
        ? { label: '已入账', at: voucher.executed_at, note: '收到的钱即时入账，不用批准', state: 'done' }
        : { label: '入账', note: '还没入账', state: 'todo' },
    )
  } else {
    const submitted = status !== 'draft'
    steps.push({ label: '送批', at: status === 'pending_approval' ? voucher.updated_at : null, state: submitted ? 'done' : 'todo' })
    steps.push(
      voucher.approved_at
        ? { label: '批准', by: approvedByName, at: voucher.approved_at, state: 'done' }
        : { label: '批准', note: submitted ? '等 Principal' : undefined, state: 'todo' },
    )
    steps.push(
      voucher.executed_at
        ? { label: '付款', at: voucher.executed_at, note: voucher.payment_reference ? `Ref: ${voucher.payment_reference}` : undefined, state: 'done' }
        : { label: '付款', state: 'todo' },
    )
  }

  const methodLabel = voucher.payment_method ? voucher.payment_method.replace(/_/g, ' ') : null
  let cardNo = 0

  return (
    <div className="max-w-[1180px]">
      <Link href={canReadTreasury ? '/payments' : '/hr-costing/payment'} className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to {canReadTreasury ? 'Payments' : 'HR Payment'}
      </Link>

      {/* ── Header: the number, its status, who made it ── */}
      <div className="mt-2 mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="font-sans text-[11px] uppercase tracking-[0.14em] text-muted mb-1">
            {isCredit ? 'Official receipt' : 'Payment voucher'}
            {categoryLabel ? ` · ${categoryLabel}` : ''}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="title-number">{voucher.voucher_no ?? 'Draft'}</h1>
            <span className={`chip lg status-morph ${chip.tone}`}>
              <span className="dot" />
              {statusZh} · {status.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="font-sans text-[12.5px] text-muted mt-1">
            {createdByName ?? 'Unknown'} 建立 · {officeStamp(voucher.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <Link
            href={`/payments/voucher-doc?id=${voucher.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            Print
          </Link>
          {isFinance ? <CopyVoucherButton voucherId={voucher.id} voucherNo={voucher.voucher_no} /> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_316px] gap-4 lg:gap-5 items-start">
        {/* ── The cards ── */}
        <div className="order-2 lg:order-1 grid gap-3.5 min-w-0">
          <Card n={++cardNo} title={isCredit ? '收自谁' : '付给谁'} en={isCredit ? 'Received from' : 'Pay to'}>
            <div className="font-sans text-[19px] font-semibold leading-snug text-ink">{voucher.payee_name}</div>
            {payeeCompanyName ? <div className="font-mono text-xs text-muted mt-0.5">{payeeCompanyName}</div> : null}
            <dl className="mt-3 grid grid-cols-[76px_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="font-sans text-[12.5px] text-muted pt-px">说明</dt>
              <dd className="m-0 font-sans text-ink whitespace-pre-wrap break-words">{voucher.description || '—'}</dd>
              {methodLabel ? (
                <>
                  <dt className="font-sans text-[12.5px] text-muted pt-px">方式</dt>
                  <dd className="m-0 font-sans text-ink capitalize">{methodLabel}</dd>
                </>
              ) : null}
              {voucher.notes ? (
                <>
                  <dt className="font-sans text-[12.5px] text-muted pt-px">备注</dt>
                  <dd className="m-0 font-sans text-graphite whitespace-pre-wrap break-words">{voucher.notes}</dd>
                </>
              ) : null}
            </dl>
          </Card>

          {/* ── Payment sources (per-pool / per-department breakdown) ── */}
          {sourceRows.length > 0 ? (
            <Card
              n={++cardNo}
              title={isCredit ? '进哪个池' : '从哪个池出'}
              en={isCredit ? 'Credited to' : 'Deducted from'}
              aside={
                reassignFrom.length > 0 ? (
                  <ReassignGlAccountButton voucherId={voucher.id} fromOptions={reassignFrom} accountOptions={accountOptions} />
                ) : null
              }
            >
              <div className="overflow-x-auto">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Pool / Department</th>
                      <th>Account</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sourceRows.map((r, i) => (
                      <tr key={i}>
                        <td className="font-sans text-ink">{POOL_LABELS[r.pool] ?? r.pool.replace(/_/g, ' ')}</td>
                        <td className="font-sans text-graphite">{r.chart_of_accounts?.name ?? (r.account_code ? r.account_code.replace(/_/g, ' ') : '—')}</td>
                        <td className="num">{formatMoney(Number(r.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-hairline">
                      <td className="font-sans text-ink font-medium" colSpan={2}>Total</td>
                      <td className="num font-semibold">{formatMoney(sourceRows.reduce((sum, r) => sum + Number(r.amount), 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          ) : null}

          {/* ── People on a payroll voucher (mig 20260910150000) ── */}
          {peopleOnVoucher.length > 0 ? (
            <Card
              n={++cardNo}
              title="这张单付给谁"
              en="People on this voucher"
              aside={
                <span className="font-mono text-[11px] text-muted">
                  {salaryPeople} {salaryPeople === 1 ? 'PERSON' : 'PEOPLE'} · {peopleOnVoucher.length} {peopleOnVoucher.length === 1 ? 'PAYMENT' : 'PAYMENTS'}
                </span>
              }
            >
              <p className="text-sm text-muted mb-3">Payment amounts and receiving accounts recorded when this PV was generated.</p>
              <div className="overflow-x-auto">
                <table className="ledger-table" aria-label="Salary payments on this voucher">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th className="m-hide">Department</th>
                      <th className="m-hide">Payment</th>
                      <th className="m-hide">Receiving account</th>
                      <th className="num">Amount</th>
                      <th className="lt-toggle" aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {peopleOnVoucher.map((p, i) => (
                      <LedgerRow key={p.id ?? i}>
                        <td>
                          <span className="font-serif text-md text-ink">{p.employee_name}</span>
                          {p.employee_code ? <span className="font-mono text-[11px] text-muted ml-2">{p.employee_code}</span> : null}
                        </td>
                        <td className="m-hide font-serif text-sm text-graphite" data-label="Department">{p.department_name ?? '—'}</td>
                        <td className="m-hide text-sm text-graphite" data-label="Payment">{salaryPaymentLabel(p.salary_component)}</td>
                        <td className="m-hide text-sm text-graphite" data-label="Receiving account">
                          {recipientAccountLabel(p.recipient_account) && <div className="text-xs text-muted">{recipientAccountLabel(p.recipient_account)}</div>}
                          {p.bank_name && p.bank_account_no ? (
                            <>
                              <div>{p.bank_name}</div>
                              <div className="font-mono text-xs">{p.bank_account_no}</div>
                            </>
                          ) : <span className="text-muted">Bank details not recorded</span>}
                        </td>
                        <td className="num">{formatMoney(Number(p.net))}</td>
                      </LedgerRow>
                    ))}
                  </tbody>
                  {peopleOnVoucher.length > 1 ? (
                    <tfoot>
                      <tr className="border-t-2 border-hairline">
                        <td className="font-serif italic text-ink font-medium">Total</td>
                        <td className="m-hide" colSpan={3} />
                        <td className="num font-semibold">{formatMoney(peopleOnVoucher.reduce((sum, p) => sum + Number(p.net), 0))}</td>
                        <td className="lt-toggle" />
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            </Card>
          ) : null}

          {statutoryCoverage.length > 0 ? (
            <Card
              n={++cardNo}
              title="这张单缴的法定供款"
              en="Statutory contributions on this voucher"
              titleId="statutory-coverage-title"
              aside={
                <span className="font-mono text-[11px] text-muted">
                  {statutoryPeople} {statutoryPeople === 1 ? 'PERSON' : 'PEOPLE'} · {statutoryPeriods}
                </span>
              }
            >
              <p className="text-sm text-muted mb-3">Employees, departments and amounts recorded when this PV was generated.</p>
              <div className="overflow-x-auto">
                <table className="ledger-table" aria-label="Statutory contributions covered by this voucher">
                  <thead>
                    <tr><th scope="col">Employee</th><th scope="col">Department</th><th scope="col">Scheme</th><th scope="col" className="num">Contribution</th></tr>
                  </thead>
                  <tbody>
                    {statutoryCoverage.map((line) => (
                      <tr key={line.id}>
                        <td>
                          <span className="font-serif text-md text-ink">{line.employee_name}</span>
                          {line.employee_code ? <span className="font-mono text-[11px] text-muted ml-2">{line.employee_code}</span> : null}
                        </td>
                        <td className="font-serif text-sm text-graphite">{line.department_name}</td>
                        <td className="font-mono text-xs text-graphite">{line.scheme}</td>
                        <td className="num">{formatMoney(Number(line.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-hairline">
                      <th scope="row" colSpan={3} className="font-serif italic text-ink font-medium">Total contribution</th>
                      <td className="num font-semibold">{formatMoney(statutoryCoverage.reduce((sum, line) => sum + Number(line.amount), 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          ) : null}

          {/* ── Attachments ── */}
          {canReadTreasury ? (
            <Card
              n={++cardNo}
              title="附件"
              en="Attachments"
              aside={
                <span className="font-mono text-[11px] text-muted">
                  {(attachments ?? []).length} FILE{(attachments ?? []).length === 1 ? '' : 'S'}
                </span>
              }
            >
              {/* Folded until it is wanted: the form to add one is four times the
                  height of the line that says there are none. A decided voucher
                  (approved, paid) still takes a file — a receipt that was
                  forgotten (2026-10-05) — but gives none back, and says so; only a
                  voided one is closed. */}
              {voucher.status === 'voided' ? (
                <AttachmentUploader voucherId={voucher.id} voucherStatus={voucher.status} canUpload={false} />
              ) : (
                <DealMore summary={attachmentsOpen ? '加附件 · Add attachments' : '补附件 · Add attachments'}>
                  <AttachmentUploader voucherId={voucher.id} voucherStatus={voucher.status} canUpload late={!attachmentsOpen} />
                </DealMore>
              )}
              {(attachments ?? []).length > 0 ? (
                <div className="mt-3"><AttachmentList
                  attachments={(attachments ?? []) as Parameters<typeof AttachmentList>[0]['attachments']}
                  canDelete={attachmentsOpen}
                  // A file that arrived after the Principal's decision is marked.
                  lateAfter={voucher.direction === 'credit' ? null : voucher.approved_at}
                /></div>
              ) : (
                <p className="font-sans text-sm text-muted mt-2">还没有附件。</p>
              )}
            </Card>
          ) : null}

          {/* ── What happened to it ── */}
          <Card n={++cardNo} title="记录" en="Trail">
            <ol className="trail-steps m-0 p-0 list-none">
              {steps.map((step, i) => (
                <li
                  key={i}
                  className={`trail-step ${step.state === 'todo' ? '' : step.state}${steps[i + 1] && steps[i + 1].state !== 'todo' ? ' joined' : ''}`}
                >
                  <div className={`font-sans ${step.state === 'todo' ? 'text-muted' : 'font-semibold text-ink'}`}>{step.label}</div>
                  <div className="font-sans text-xs text-muted leading-snug">
                    {step.by ? <div>{step.by}</div> : null}
                    {step.at ? <div>{officeStamp(step.at, { year: false })}</div> : null}
                    {step.note ? <div>{step.note}</div> : null}
                    {!step.by && !step.at && !step.note ? <div>—</div> : null}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {/* ── The panel: what this voucher is, and what can be done to it ── */}
        <aside className="order-1 lg:order-2 cf-scope deal-side lg:sticky lg:top-6 rounded-md p-4 sm:p-5 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="deal-side-muted font-sans text-[11px] uppercase tracking-[0.14em]">
              {isCredit ? '收据 · Receipt' : '付款凭单 · Payment'}
            </span>
            <span className={`deal-side-chip ${chip.side}`}>{statusZh}</span>
          </div>
          <div className={`font-sans text-[30px] font-semibold leading-tight tracking-[-0.02em] tabular-nums ${isCredit ? 'deal-side-in' : ''}`}>
            {isCredit ? '+' : ''}
            {formatMoney(amount)}
          </div>
          <p className="deal-side-muted font-sans text-sm mt-0.5 mb-3.5 break-words">
            {isCredit ? '收自' : '付给'} {voucher.payee_name}
          </p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-[7px] text-[13px] m-0">
            <PanelRow
              label={isCredit ? '收款日期' : '付款日期'}
              value={
                <>
                  {voucher.payment_date ? dayjs(voucher.payment_date).format('D MMM YYYY') : '还没定'}
                  {/* A paid voucher's date is corrected in place; a draft or pending
                      one with Edit; payroll's from HR Payment. */}
                  {isFinance && status === 'paid' && voucher.payment_date && !isPayrollVoucher ? (
                    <AmendDateButton
                      kind="voucher"
                      id={voucher.id}
                      currentDate={String(voucher.payment_date).slice(0, 10)}
                      label={voucher.voucher_no ?? 'voucher'}
                      triggerClassName="deal-side-link ml-2 font-sans text-[11.5px] underline underline-offset-2"
                    />
                  ) : null}
                </>
              }
            />
            {bankLabel ? <PanelRow label={isCredit ? '进银行' : '从银行'} value={bankLabel} title={bankName ?? undefined} /> : null}
            {poolLabel || categoryLabel ? <div role="separator" className="deal-side-sep col-span-2" /> : null}
            {poolLabel ? <PanelRow label={isCredit ? '进哪个池' : '扣哪个池'} value={poolLabel} /> : null}
            {categoryLabel ? <PanelRow label="科目" value={categoryLabel} /> : null}
            {settledInvoices.length > 0 || methodLabel ? <div role="separator" className="deal-side-sep col-span-2" /> : null}
            {settledInvoices.length > 0 ? (
              <PanelRow
                label="结哪张发票"
                value={settledInvoices.length === 1 ? settledInvoices[0] : `${settledInvoices[0]} 等 ${settledInvoices.length} 张`}
                title={settledInvoices.join('\n')}
              />
            ) : null}
            {methodLabel ? <PanelRow label="方式" value={<span className="capitalize">{methodLabel}</span>} /> : null}
          </dl>

          {/* ── Actions ── */}
          {canReadTreasury ? <VoucherActions
            voucherId={voucher.id}
            status={voucher.status}
            amount={Number(voucher.amount)}
            bankBalance={bankBalance}
            bankName={bankName}
            isPrincipal={isPrincipal}
            isFinance={isFinance}
            submitForApproval={submitForApproval}
            approveVoucher={approveVoucher}
            voidVoucher={voidVoucher}
            returnToDraft={returnVoucherToDraft}
            voidPaidReceipt={voidPaidReceipt}
            reversePaidPayment={voucher.reference_type === 'payroll_disbursement' ? undefined : reversePaidPayment}
            direction={voucher.direction}
            voucherType={voucher.voucher_type}
          /> : null}
        </aside>
      </div>
    </div>
  )
}

/** The status beside the number (house chip) and in the panel (its own chip). */
const STATUS_CHIP: Record<string, { tone: string; side: string; zh: string }> = {
  draft: { tone: '', side: '', zh: '草稿' },
  pending_approval: { tone: 'alert', side: 'wait', zh: '等批准' },
  approved: { tone: 'accent', side: '', zh: '已批准' },
  paid: { tone: 'ledger', side: 'ok', zh: '已付' },
  voided: { tone: 'danger', side: 'bad', zh: '已作废' },
}

interface TrailStep {
  label: string
  by?: string | null
  at?: string | null
  note?: string
  state: 'done' | 'todo' | 'bad'
}

/** One numbered card — the same header the deal forms' cards have, plus a slot
 *  on the right for a count or the one thing that card can do. */
function Card({
  n,
  title,
  en,
  titleId,
  aside,
  children,
}: {
  n: number
  title: string
  en?: string
  titleId?: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="bg-surface border border-hairline rounded-md p-4 sm:p-5" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mb-3">
        <h2 id={titleId} className="flex items-center gap-2.5 font-sans text-[11px] uppercase tracking-[0.14em] text-muted">
          <span className="inline-grid place-items-center h-5 w-5 rounded-full bg-accent-bg text-accent text-[11px] font-semibold tracking-normal">
            {n}
          </span>
          <span className="font-serif text-[15px] tracking-normal normal-case text-ink">{title}</span>
          {en ? <span>{en}</span> : null}
        </h2>
        {aside ? <div className="ml-auto">{aside}</div> : null}
      </div>
      {children}
    </section>
  )
}

function PanelRow({ label, value, title }: { label: string; value: ReactNode; title?: string }) {
  return (
    <>
      <dt className="deal-side-muted font-sans text-xs self-baseline whitespace-nowrap">{label}</dt>
      <dd className="m-0 text-right font-mono tabular break-words" title={title}>
        {value}
      </dd>
    </>
  )
}
