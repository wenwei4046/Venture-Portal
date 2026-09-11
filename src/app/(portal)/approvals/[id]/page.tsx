import Link from 'next/link'
import { notFound } from 'next/navigation'
import dayjs from 'dayjs'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import {
  getVoucherDetailContext,
  formatSourcesLabel,
  formatPoolLabel,
  type VoucherDetailContext,
} from '@/lib/voucher-detail'
import {
  voucherUpstreamHref,
  voucherUpstreamLabel,
} from '@/lib/voucher-upstream-href'
import AttachmentList from '@/components/voucher/AttachmentList'
import ApprovalActions from './_components/ApprovalActions'

type ApprovalRequestTypeLocal =
  | 'new_loan'
  | 'base_rate'
  | 'tier_change'
  | 'escalation'
  | 'new_contract'
  | 'contract_change'
  | 'dept_expense'
  | 'advance'
  | 'invoice_pool_release'
  | 'profit_withdrawal'
  | 'payment_voucher'
  | 'hr_costing'
  | 'new_fund_source'
  | 'payroll_run'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ApprovalDetailPage({ params }: Props) {
  const user = await requireAuth()
  const { id } = await params
  const supabase = await createClient()

  const { data: approval, error } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !approval) notFound()

  const { data: submitter } = await supabase
    .from('users')
    .select('name')
    .eq('id', approval.submitted_by)
    .single()

  // Load reference object if new_loan
  let loanContext: {
    company_name?: string
    principal?: number
    effective_rate?: number
    base_rate?: number
    risk_premium?: number
    loan_id: string
  } | null = null

  if (approval.request_type === 'new_loan' && approval.reference_id) {
    const { data: loan } = await supabase
      .from('loans')
      .select('*, companies(name, short_code)')
      .eq('id', approval.reference_id)
      .single()

    if (loan) {
      loanContext = {
        company_name: loan.companies?.name,
        principal: Number(loan.principal),
        effective_rate: Number(loan.effective_rate),
        base_rate: Number(loan.base_rate),
        risk_premium: Number(loan.risk_premium),
        loan_id: loan.id,
      }
    }
  }

  // Load voucher detail if payment_voucher
  let voucherContext: VoucherDetailContext | null = null
  if (approval.request_type === 'payment_voucher' && approval.reference_id) {
    voucherContext = await getVoucherDetailContext(supabase, approval.reference_id)
  }

  // Issue #4 pre-check: Debit voucher with insufficient bank balance should not
  // be approvable — otherwise the approval action will throw mid-flight, and
  // for N-voucher batches the earlier vouchers already committed.
  const insufficientBalance =
    voucherContext !== null &&
    voucherContext.voucher.direction === 'debit' &&
    voucherContext.bank !== null &&
    voucherContext.bank.current_balance < Number(voucherContext.voucher.amount)

  const isPending = approval.status === 'pending'

  return (
    <div>
      <Link
        href={user.role === 'principal' ? '/approvals' : '/dashboard'}
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← {user.role === 'principal' ? 'Back to Approvals' : 'Back to Overview'}
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>IV.</em> APPROVALS · {formatRequestType(approval.request_type).toUpperCase()}
          </div>
          <h1 className="page-title">
            {approval.description ?? 'Approval request'}
          </h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            Submitted by <em>{submitter?.name ?? 'Unknown'}</em> on {dayjs(approval.created_at).format('D MMMM YYYY HH:mm')}
          </p>
        </div>
        <ApprovalStatus status={approval.status} />
      </div>

      {/* ───────── Loan context (if new_loan) ───────── */}
      {loanContext ? (
        <div className="bg-surface border border-hairline rounded-md p-6 mb-10 max-w-3xl">
          <div className="sect-head">
            <h2>Loan details</h2>
            <span className="rule" aria-hidden />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 text-sm">
            <div>
              <div className="text-xs text-muted uppercase tracking-wide font-sans mb-1">
                Borrower
              </div>
              <div className="font-serif text-lg text-ink">
                {loanContext.company_name}
              </div>
            </div>

            <div>
              <div className="text-xs text-muted uppercase tracking-wide font-sans mb-1">
                Principal
              </div>
              <div className="font-serif text-lg text-num-ink tabular tracking-[-0.01em]">
                {formatMoney(loanContext.principal ?? 0)}
              </div>
            </div>

            <div>
              <div className="text-xs text-muted uppercase tracking-wide font-sans mb-1">
                Effective rate
              </div>
              <div className="font-serif text-lg text-num-ink tabular">
                {((loanContext.effective_rate ?? 0) * 100).toFixed(3)}
                <span className="text-graphite text-base"> % /mo</span>
              </div>
              <div className="font-mono text-xs text-muted">
                {((loanContext.base_rate ?? 0) * 100).toFixed(3)}% base +{' '}
                {((loanContext.risk_premium ?? 0) * 100).toFixed(3)}% custom
              </div>
            </div>

            <div>
              <div className="text-xs text-muted uppercase tracking-wide font-sans mb-1">
                Monthly interest (at full principal)
              </div>
              <div className="font-serif text-lg text-num-ink tabular tracking-[-0.01em]">
                {formatMoney(
                  (loanContext.principal ?? 0) * (loanContext.effective_rate ?? 0)
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-hairline">
            <Link
              href={`/fund-out/${loanContext.loan_id}`}
              className="text-sm text-accent hover:text-accent-hover font-serif italic"
            >
              View full loan detail →
            </Link>
          </div>
        </div>
      ) : null}

      {/* ───────── Voucher context (if payment_voucher) ───────── */}
      {voucherContext ? (
        <div className="mb-10 max-w-3xl">
          <div className="bg-surface border border-hairline rounded-md p-6">
            <div className="sect-head">
              <h2>Voucher details</h2>
              <span className="rule" aria-hidden />
              <span className="count">{voucherContext.voucher.voucher_no ?? 'DRAFT'}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 text-sm mb-5">
              <div>
                <div className="text-xs text-muted uppercase tracking-wide font-sans mb-1">
                  Amount
                </div>
                <div className="statement-amount text-num-ink">
                  {voucherContext.voucher.direction === 'credit' ? '+' : ''}
                  {formatMoney(Number(voucherContext.voucher.amount))}
                </div>
              </div>

              <div>
                <div className="text-xs text-muted uppercase tracking-wide font-sans mb-1">
                  {voucherContext.voucher.direction === 'debit' ? 'Pay to' : 'Received from'}
                </div>
                <div className="font-serif text-md text-ink">
                  {voucherContext.voucher.payee_name}
                </div>
                {voucherContext.payeeCompany ? (
                  <div className="font-mono text-xs text-muted mt-1">
                    {voucherContext.payeeCompany.name} (
                    {voucherContext.payeeCompany.short_code})
                  </div>
                ) : null}
              </div>

              {voucherContext.bank ? (
                <div>
                  <div className="text-xs text-muted uppercase tracking-wide font-sans mb-1">
                    {voucherContext.voucher.direction === 'debit'
                      ? 'Pay from bank'
                      : 'Receive into bank'}
                  </div>
                  <div className="font-serif text-md text-ink">
                    {voucherContext.bank.bank_name}
                  </div>
                  <div className="font-mono text-xs text-muted">
                    Acct {voucherContext.bank.account_number} · Balance{' '}
                    <span className={`num ${insufficientBalance ? 'neg' : ''}`}>
                      {formatMoney(voucherContext.bank.current_balance)}
                    </span>
                  </div>
                </div>
              ) : null}

              {(() => {
                const poolLabel =
                  voucherContext.voucher.direction === 'credit'
                    ? formatPoolLabel(voucherContext.voucher.target_pool)
                    : formatSourcesLabel(
                        voucherContext.sources,
                        voucherContext.voucher.source_pool,
                      )
                return poolLabel ? (
                  <div>
                    <div className="text-xs text-muted uppercase tracking-wide font-sans mb-1">
                      {voucherContext.voucher.direction === 'credit'
                        ? 'Credit to pool'
                        : 'Deduct from pool'}
                    </div>
                    <div className="font-serif text-md text-ink">{poolLabel}</div>
                  </div>
                ) : null
              })()}
            </div>

            <div className="mb-5">
              <div className="text-xs text-muted uppercase tracking-wide font-sans mb-1">
                Description
              </div>
              <p className="font-serif text-md text-ink whitespace-pre-wrap">
                {voucherContext.voucher.description}
              </p>
            </div>

            {(() => {
              const href = voucherUpstreamHref(
                voucherContext.voucher.reference_type,
                voucherContext.voucher.reference_id,
              )
              const label = voucherUpstreamLabel(voucherContext.voucher.reference_type)
              return href ? (
                <div className="mb-5">
                  <Link
                    href={href}
                    className="text-sm text-accent hover:text-accent-hover font-serif italic"
                  >
                    View {label?.toLowerCase() ?? 'upstream record'} →
                  </Link>
                </div>
              ) : null
            })()}

            {insufficientBalance ? (
              <div className="border-t border-hairline pt-4 mt-4">
                <div className="bg-danger-bg border border-danger rounded-md p-4 text-sm">
                  <div className="font-serif text-danger mb-1">
                    ⚠ Insufficient bank balance
                  </div>
                  <div className="font-serif italic text-danger text-sm">
                    This voucher requires{' '}
                    {formatMoney(Number(voucherContext.voucher.amount))} but{' '}
                    {voucherContext.bank?.bank_name ?? 'the account'} holds only{' '}
                    {formatMoney(voucherContext.bank?.current_balance ?? 0)}. Top up
                    or void this voucher before approving.
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {voucherContext.sources.length > 0 ? (
            <div className="mt-4">
              <div className="sect-head">
                <h2>{voucherContext.voucher.direction === 'credit' ? 'Credited to' : 'Deducted from'}</h2>
                <span className="rule" aria-hidden />
                <span className="count">{voucherContext.sources.length} SOURCE{voucherContext.sources.length === 1 ? '' : 'S'} · PER DEPARTMENT</span>
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
                    {voucherContext.sources.map((s, i) => (
                      <tr key={i}>
                        <td className="font-serif text-md text-ink">{formatPoolLabel(s.pool) ?? s.pool}</td>
                        <td className="font-mono text-xs text-graphite">{s.account_label ?? '—'}</td>
                        <td className="num">{formatMoney(Number(s.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-hairline">
                      <td className="font-serif italic text-ink font-medium" colSpan={2}>Total</td>
                      <td className="num font-semibold">{formatMoney(voucherContext.sources.reduce((sum, s) => sum + Number(s.amount), 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <div className="sect-head">
              <h2>Attachments</h2>
              <span className="rule" aria-hidden />
              <span className="count">{voucherContext.attachments.length} FILE{voucherContext.attachments.length === 1 ? '' : 'S'}</span>
            </div>
            <AttachmentList
              attachments={voucherContext.attachments.map((a) => ({
                id: a.id,
                file_name: a.file_name,
                file_type: a.file_type,
                file_size: a.file_size,
                description: a.description,
                uploaded_at: a.uploaded_at,
              }))}
              emptyMessage="No attachments uploaded yet. Ask Finance to attach supporting docs before approving."
            />
          </div>
        </div>
      ) : null}

      {/* ───────── Approval notes (if resolved) ───────── */}
      {!isPending && approval.notes ? (
        <div className="mb-10 max-w-3xl">
          <div className="sect-head">
            <h2>Decision notes</h2>
            <span className="rule" aria-hidden />
          </div>
          <p className="font-serif italic text-graphite text-md whitespace-pre-wrap">
            {approval.notes}
          </p>
        </div>
      ) : null}

      {/* ───────── Action buttons / read-only status ───────── */}
      {isPending ? (
        user.role !== 'principal' ? (
          <div className="bg-surface border border-hairline rounded-md p-4 max-w-3xl">
            <p className="font-serif italic text-graphite text-sm">
              Awaiting Principal sign-off. <em>You can track the status here.</em>
            </p>
          </div>
        ) : (
          // Self-approval allowed (user 2026-08-06: "principal submit 要自己
          // 能approve") — no more own-submission banner.
          <ApprovalActions
            approvalId={approval.id}
            requestType={approval.request_type as ApprovalRequestTypeLocal}
            disableApprove={insufficientBalance}
            disableReason={
              insufficientBalance
                ? 'bank balance is below the voucher amount'
                : null
            }
          />
        )
      ) : (
        <div className="bg-surface border border-hairline rounded-md p-4 max-w-3xl">
          <p className="font-serif italic text-graphite text-sm">
            This request was{' '}
            <em className={approval.status === 'approved' ? 'text-ledger' : 'text-danger'}>
              {approval.status}
            </em>{' '}
            on {dayjs(approval.approved_at).format('D MMM YYYY HH:mm')}.
          </p>
        </div>
      )}
    </div>
  )
}

function ApprovalStatus({ status }: { status: string }) {
  if (status === 'pending') {
    return <span className="status-morph font-serif italic text-alert text-md">pending</span>
  }
  if (status === 'approved') {
    return <span className="status-morph font-serif italic text-ledger text-md">approved</span>
  }
  return <span className="status-morph font-serif italic text-danger text-md">rejected</span>
}

function formatRequestType(type: string): string {
  const labels: Record<string, string> = {
    new_loan: 'New loan',
    base_rate: 'Base rate',
    tier_change: 'Tier change',
    escalation: 'Escalation',
    new_contract: 'New contract',
    contract_change: 'Contract change',
    dept_expense: 'Dept expense',
    advance: 'Advance',
    invoice_pool_release: 'Invoice pool release',
    profit_withdrawal: 'Profit withdrawal',
    payment_voucher: 'Payment voucher',
    hr_costing: 'HR costing',
    new_fund_source: 'New fund source',
    payroll_run: 'Payroll run',
    dept_payment_request: 'Dept payment request',
    loan_cancel: 'Loan cancel',
  }
  return labels[type] ?? type
}
