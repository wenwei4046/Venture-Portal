import Link from 'next/link'
import { notFound } from 'next/navigation'
import dayjs from 'dayjs'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import ApprovalActions from './_components/ApprovalActions'

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
    company_tier?: string
    principal?: number
    effective_rate?: number
    base_rate?: number
    risk_premium?: number
    loan_id: string
  } | null = null

  if (approval.request_type === 'new_loan' && approval.reference_id) {
    const { data: loan } = await supabase
      .from('loans')
      .select('*, companies(name, short_code, tier)')
      .eq('id', approval.reference_id)
      .single()

    if (loan) {
      loanContext = {
        company_name: loan.companies?.name,
        company_tier: loan.companies?.tier,
        principal: Number(loan.principal),
        effective_rate: Number(loan.effective_rate),
        base_rate: Number(loan.base_rate),
        risk_premium: Number(loan.risk_premium),
        loan_id: loan.id,
      }
    }
  }

  const isPending = approval.status === 'pending'
  const isSelfSubmitted = approval.submitted_by === user.id

  return (
    <div>
      <Link
        href={user.role === 'principal' ? '/approvals' : '/dashboard'}
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← {user.role === 'principal' ? 'Back to Approvals' : 'Back to Overview'}
      </Link>

      <div className="flex items-baseline justify-between mt-3 mb-10">
        <div>
          <p className="font-serif italic text-accent text-base mb-1">
            {formatRequestType(approval.request_type)}
          </p>
          <h1 className="font-serif text-3xl text-ink">
            {approval.description ?? 'Approval request'}
          </h1>
          <p className="font-mono text-xs text-muted mt-1">
            Submitted by{' '}
            <span className="text-ink font-serif italic">
              {submitter?.name ?? 'Unknown'}
            </span>{' '}
            on {dayjs(approval.created_at).format('D MMM YYYY HH:mm')}
          </p>
        </div>
        <ApprovalStatus status={approval.status} />
      </div>

      {/* ───────── Loan context (if new_loan) ───────── */}
      {loanContext ? (
        <div className="bg-surface border border-hairline rounded-md p-6 mb-10 max-w-3xl">
          <h2 className="font-serif text-xl text-ink mb-4">Loan details</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 text-sm">
            <div>
              <div className="text-xs text-muted uppercase tracking-wide font-sans mb-1">
                Borrower
              </div>
              <div className="font-serif text-lg text-ink">
                {loanContext.company_name}
              </div>
              <div className="font-mono text-xs text-muted">
                Tier {loanContext.company_tier}
              </div>
            </div>

            <div>
              <div className="text-xs text-muted uppercase tracking-wide font-sans mb-1">
                Principal
              </div>
              <div className="font-serif text-lg text-ink">
                {formatMoney(loanContext.principal ?? 0)}
              </div>
            </div>

            <div>
              <div className="text-xs text-muted uppercase tracking-wide font-sans mb-1">
                Effective rate
              </div>
              <div className="font-serif text-lg text-ink">
                {((loanContext.effective_rate ?? 0) * 100).toFixed(3)}
                <span className="text-graphite text-base"> % /mo</span>
              </div>
              <div className="font-mono text-xs text-muted">
                {((loanContext.base_rate ?? 0) * 100).toFixed(3)}% base +{' '}
                {((loanContext.risk_premium ?? 0) * 100).toFixed(3)}% tier
              </div>
            </div>

            <div>
              <div className="text-xs text-muted uppercase tracking-wide font-sans mb-1">
                Monthly interest (at full principal)
              </div>
              <div className="font-serif text-lg text-ink">
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

      {/* ───────── Approval notes (if resolved) ───────── */}
      {!isPending && approval.notes ? (
        <div className="mb-10 max-w-3xl">
          <h2 className="font-serif text-xl text-ink mb-2">Decision notes</h2>
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
        ) : isSelfSubmitted ? (
          <div className="bg-alert-bg border border-alert rounded-md p-4 max-w-3xl">
            <p className="font-serif italic text-alert text-sm">
              You submitted this request and cannot approve your own submission.
            </p>
          </div>
        ) : (
          <ApprovalActions
            approvalId={approval.id}
            requestType={approval.request_type}
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
  }
  return labels[type] ?? type
}
