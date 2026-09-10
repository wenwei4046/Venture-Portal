import Link from 'next/link'
import { notFound } from 'next/navigation'
import dayjs from 'dayjs'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { submitForApproval, approveVoucher, voidVoucher, voidPaidReceipt, reversePaidPayment, returnVoucherToDraft } from '../actions'
import VoucherActions from './_components/VoucherActions'
import CopyVoucherButton from './_components/CopyVoucherButton'
import ReassignGlAccountButton from './_components/ReassignGlAccountButton'
import AttachmentUploader from './_components/AttachmentUploader'
import AttachmentList from '@/components/voucher/AttachmentList'

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
  const user = await requirePermission('treasury')
  const { id } = await params
  const supabase = await createClient()

  const { data: voucher, error } = await supabase
    .from('payment_vouchers')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !voucher) notFound()

  // Resolve names
  let payeeCompanyName: string | null = null
  if (voucher.payee_company_id) {
    const { data: c } = await supabase.from('companies').select('name, short_code').eq('id', voucher.payee_company_id).single()
    if (c) payeeCompanyName = `${c.name} (${c.short_code})`
  }

  let bankName: string | null = null
  if (voucher.bank_account_id) {
    const { data: b } = await supabase.from('bank_accounts').select('bank_name, account_number').eq('id', voucher.bank_account_id).single()
    if (b) bankName = `${b.bank_name} — ${b.account_number}`
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
  const { data: attachments } = await supabase
    .from('payment_attachments')
    .select('*')
    .eq('voucher_id', id)
    .order('uploaded_at', { ascending: false })

  // Bank balance for approval check display
  let bankBalance: number | null = null
  if (bankName && voucher.bank_account_id) {
    const { data: bankData } = await supabase
      .from('bank_accounts')
      .select('current_balance')
      .eq('id', voucher.bank_account_id)
      .single()
    if (bankData) bankBalance = Number(bankData.current_balance)
  }

  const isPrincipal = user.role === 'principal'
  // Unified portal (2026-07-16): Principal gets the Finance-side voucher
  // actions too (copy / mark paid / void).
  const isFinance = user.role === 'finance' || isPrincipal

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
  const { data: payrollLines } =
    voucher.reference_type === 'payroll_disbursement'
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('payroll_voucher_lines')
          .select('employee_name, employee_code, department_name, net')
          .eq('voucher_id', id)
          .order('employee_name')
      : { data: null }
  const peopleOnVoucher = ((payrollLines ?? []) as unknown) as Array<{
    employee_name: string
    employee_code: string | null
    department_name: string | null
    net: string | number
  }>

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
    const nameByCode = new Map(
      ((coaRows ?? []) as Array<{ code: string; name: string }>).map((c) => [c.code, c.name]),
    )
    const totals = new Map<string, number>()
    for (const l of (jlRows ?? []) as Array<{ account_code: string; debit: number | null; credit: number | null }>) {
      if (bankSet.has(l.account_code) || l.account_code === '3000' || l.account_code === '3030') continue
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

  return (
    <div>
      <Link href="/payments" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Payments
      </Link>

      {/* ── Header ── */}
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · {voucher.direction === 'credit' ? 'OFFICIAL RECEIPT' : 'PAYMENT VOUCHER'}{categoryLabel ? ` · ${categoryLabel.toUpperCase()}` : ''}
          </div>
          <h1 className="page-title">{voucher.voucher_no ?? 'Draft'}</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            Created by <em>{createdByName ?? 'Unknown'}</em> on {dayjs(voucher.created_at).format('D MMMM YYYY HH:mm')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/payments/voucher-doc?id=${voucher.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            Print
          </Link>
          {isFinance ? <CopyVoucherButton voucherId={voucher.id} voucherNo={voucher.voucher_no} /> : null}
          <StatusBadge status={voucher.status} />
        </div>
      </div>

      {/* ── Details grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-5">
          <div className="font-serif italic text-accent text-base mb-1">Amount</div>
          <div className="font-serif text-[30px] sm:text-[44px] md:text-hero text-num-ink leading-none tabular tracking-[-0.01em]">
            {voucher.direction === 'credit' ? '+' : ''}{formatMoney(Number(voucher.amount))}
          </div>
          <div className="mt-3 space-y-1">
            {bankName ? (
              <div className="font-mono text-[11.5px] text-graphite tracking-[0.02em] font-medium">
                {voucher.direction === 'debit' ? 'PAY FROM:' : 'RECEIVE INTO:'} <span className="text-num-ink">{bankName}</span>
              </div>
            ) : null}
            {poolLabel ? (
              <div className="font-mono text-[11.5px] text-graphite tracking-[0.02em] font-medium">
                {voucher.direction === 'debit' ? 'DEDUCT FROM POOL:' : 'CREDIT TO POOL:'}{' '}
                <span className="text-num-ink">{poolLabel}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <div>
            <div className="font-serif italic text-accent text-base mb-1">
              {voucher.direction === 'debit' ? 'Pay to' : 'Received from'}
            </div>
            <div className="font-serif text-xl text-ink">{voucher.payee_name}</div>
            {payeeCompanyName ? (
              <div className="font-mono text-xs text-muted mt-1">{payeeCompanyName}</div>
            ) : null}
          </div>

          <div>
            <div className="font-serif italic text-accent text-base mb-1">Description</div>
            <p className="font-serif text-md text-ink whitespace-pre-wrap">{voucher.description}</p>
          </div>

          {voucher.payment_method ? (
            <div>
              <div className="font-serif italic text-accent text-base mb-1">Payment method</div>
              <div className="font-serif text-md text-ink">{voucher.payment_method.replace('_', ' ')}</div>
            </div>
          ) : null}

          {voucher.notes ? (
            <div>
              <div className="font-serif italic text-accent text-base mb-1">Notes</div>
              <p className="font-serif italic text-graphite text-sm">{voucher.notes}</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Payment sources (per-pool / per-department breakdown) ── */}
      {sourceRows.length > 0 ? (
        <section className="mb-12">
          <div className="sect-head">
            <h2>{voucher.direction === 'debit' ? 'Deducted from' : 'Credited to'}</h2>
            <span className="rule" aria-hidden />
            <span className="count">{sourceRows.length} SOURCE{sourceRows.length === 1 ? '' : 'S'} · PER DEPARTMENT</span>
            {reassignFrom.length > 0 ? (
              <ReassignGlAccountButton
                voucherId={voucher.id}
                fromOptions={reassignFrom}
                accountOptions={accountOptions}
              />
            ) : null}
          </div>
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
                    <td className="font-serif text-md text-ink">{POOL_LABELS[r.pool] ?? r.pool.replace(/_/g, ' ')}</td>
                    <td className="font-mono text-xs text-graphite">{r.chart_of_accounts?.name ?? (r.account_code ? r.account_code.replace(/_/g, ' ') : '—')}</td>
                    <td className="num">{formatMoney(Number(r.amount))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-hairline">
                  <td className="font-serif italic text-ink font-medium" colSpan={2}>Total</td>
                  <td className="num font-semibold">{formatMoney(sourceRows.reduce((s, r) => s + Number(r.amount), 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      ) : null}

      {/* ── People on a payroll voucher (mig 20260910150000) ── */}
      {peopleOnVoucher.length > 0 ? (
        <section className="mb-12">
          <div className="sect-head">
            <h2>People on this voucher</h2>
            <span className="rule" aria-hidden />
            <span className="count">
              {peopleOnVoucher.length} {peopleOnVoucher.length === 1 ? 'PERSON' : 'PEOPLE'} · NET
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th className="num">Net</th>
                </tr>
              </thead>
              <tbody>
                {peopleOnVoucher.map((p, i) => (
                  <tr key={i}>
                    <td>
                      <span className="font-serif text-md text-ink">{p.employee_name}</span>
                      {p.employee_code ? <span className="font-mono text-[11px] text-muted ml-2">{p.employee_code}</span> : null}
                    </td>
                    <td className="font-serif text-sm text-graphite">{p.department_name ?? '—'}</td>
                    <td className="num">{formatMoney(Number(p.net))}</td>
                  </tr>
                ))}
              </tbody>
              {peopleOnVoucher.length > 1 ? (
                <tfoot>
                  <tr className="border-t-2 border-hairline">
                    <td className="font-serif italic text-ink font-medium" colSpan={2}>Total</td>
                    <td className="num font-semibold">{formatMoney(peopleOnVoucher.reduce((s, p) => s + Number(p.net), 0))}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </section>
      ) : null}

      {/* ── Audit trail ── */}
      <section className="mb-12">
        <div className="sect-head">
          <h2>Audit trail</h2>
          <span className="rule" aria-hidden />
          <span className="count">CREATED → SUBMITTED → APPROVED → EXECUTED</span>
        </div>
        <div className="space-y-3 max-w-3xl">
          <TrailItem
            label="Created"
            by={createdByName}
            at={voucher.created_at}
          />
          {voucher.status !== 'draft' ? (
            <TrailItem
              label="Submitted for approval"
              at={voucher.updated_at}
            />
          ) : null}
          {voucher.approved_at ? (
            <TrailItem
              label={voucher.status === 'voided' ? 'Voided' : 'Approved'}
              by={approvedByName}
              at={voucher.approved_at}
            />
          ) : null}
          {voucher.executed_at ? (
            <TrailItem
              label="Executed (paid)"
              at={voucher.executed_at}
              extra={voucher.payment_reference ? `Ref: ${voucher.payment_reference}` : undefined}
            />
          ) : null}
        </div>
      </section>

      {/* ── Attachments ── */}
      <section className="mb-12">
        <div className="sect-head">
          <h2>Attachments</h2>
          <span className="rule" aria-hidden />
          <span className="count">{(attachments ?? []).length} FILE{(attachments ?? []).length === 1 ? '' : 'S'} · EVIDENCE FOR PRINCIPAL</span>
        </div>
        <AttachmentUploader
          voucherId={voucher.id}
          voucherStatus={voucher.status}
          canUpload={voucher.status === 'draft' || voucher.status === 'pending_approval'}
        />
        <AttachmentList attachments={(attachments ?? []) as Parameters<typeof AttachmentList>[0]['attachments']} />
      </section>

      {/* ── Actions ── */}
      <VoucherActions
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
        reversePaidPayment={reversePaidPayment}
        direction={voucher.direction}
        voucherType={voucher.voucher_type}
      />
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'text-muted',
    pending_approval: 'text-alert',
    approved: 'text-accent',
    paid: 'text-ledger',
    voided: 'text-danger',
  }
  return (
    <span className={`status-morph font-serif italic text-md ${styles[status] ?? 'text-muted'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function TrailItem({ label, by, at, extra }: { label: string; by?: string | null; at: string; extra?: string }) {
  return (
    <div className="flex items-baseline gap-3 text-sm">
      <div className="w-2 h-2 rounded-full bg-accent mt-1.5 shrink-0" />
      <div>
        <span className="font-serif text-ink">{label}</span>
        {by ? <span className="font-serif italic text-graphite"> by {by}</span> : null}
        <span className="font-mono text-xs text-muted ml-2">
          {dayjs(at).format('D MMM YYYY HH:mm')}
        </span>
        {extra ? <span className="font-mono text-xs text-muted ml-2">· {extra}</span> : null}
      </div>
    </div>
  )
}
