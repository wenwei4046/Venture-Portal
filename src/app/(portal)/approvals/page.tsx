import Link from 'next/link'
import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import CombinedApprovalCard from './_components/CombinedApprovalCard'

interface ApprovalRow {
  id: string
  request_type: string
  description: string | null
  amount: number | null
  reference_id: string | null
  reference_table: string | null
  submitted_by: string
  group_id: string | null
  created_at: string
  approved_at: string | null
  status: string
}

export default async function ApprovalsPage() {
  const user = await requireRole(['principal'])
  const supabase = await createClient()

  const [
    { data: pendingRows },
    { data: recentRows },
    { data: submitters },
  ] = await Promise.all([
    supabase
      .from('approval_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    supabase
      .from('approval_requests')
      .select('*')
      .neq('status', 'pending')
      .order('approved_at', { ascending: false })
      .limit(10),
    supabase.from('users').select('id, name'),
  ])

  const pending = (pendingRows ?? []) as ApprovalRow[]
  const recent = (recentRows ?? []) as ApprovalRow[]
  const submitterMap = new Map(
    (submitters ?? []).map((u) => [u.id, u.name as string])
  )

  // ─── Group pending approvals by group_id (Phase 7 Step 9) ───
  // Each group_id surfaces as ONE combined card; ungrouped rows render solo.
  type PendingItem =
    | { kind: 'single'; row: ApprovalRow }
    | {
        kind: 'group'
        groupId: string
        items: ApprovalRow[]
        createdAt: string
      }

  const groupMap = new Map<string, ApprovalRow[]>()
  const items: PendingItem[] = []
  for (const row of pending) {
    if (row.group_id) {
      if (!groupMap.has(row.group_id)) {
        groupMap.set(row.group_id, [])
        items.push({
          kind: 'group',
          groupId: row.group_id,
          items: groupMap.get(row.group_id)!,
          createdAt: row.created_at,
        })
      }
      groupMap.get(row.group_id)!.push(row)
    } else {
      items.push({ kind: 'single', row })
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> APPROVALS · PRINCIPAL QUEUE
          </div>
          <h1 className="page-title">Approvals</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            Pending decisions that require <em>your hand</em>. Principal only.
          </p>
        </div>
      </div>

      {/* ───────── Pending queue ───────── */}
      <section className="mb-12">
        <div className="sect-head">
          <h2>Pending</h2>
          <span className="rule" aria-hidden />
          <span className="count">{items.length} {items.length === 1 ? 'ITEM' : 'ITEMS'}</span>
        </div>

        {items.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-10 text-center">
            <p className="font-serif italic text-ledger text-lg">
              All caught up.
            </p>
            <p className="font-serif italic text-muted text-sm mt-1">
              No approvals waiting.
            </p>
          </div>
        ) : (
          <div className="space-y-3 row-stagger">
            {items.map((item, i) =>
              item.kind === 'group' ? (
                <div
                  key={item.groupId}
                  style={{ '--i': i } as React.CSSProperties}
                >
                  <CombinedApprovalCard
                    groupId={item.groupId}
                    items={item.items.map((r) => ({
                      request_type: r.request_type,
                      description: r.description,
                      amount: r.amount,
                      reference_id: r.reference_id,
                      reference_table: r.reference_table,
                    }))}
                    submitterName={
                      submitterMap.get(item.items[0].submitted_by) ?? 'Unknown'
                    }
                    createdAt={item.createdAt}
                    isSelfSubmitted={item.items.some(
                      (r) => r.submitted_by === user.id
                    )}
                  />
                </div>
              ) : (
                <Link
                  key={item.row.id}
                  href={approvalHref(item.row)}
                  style={{ '--i': i } as React.CSSProperties}
                  className="block border border-hairline rounded-md bg-surface p-5 hover:bg-surface-2/40 transition-colors"
                >
                  <div className="flex items-baseline justify-between mb-2">
                    <div className="text-xs font-sans font-semibold uppercase tracking-wider text-graphite">
                      {formatRequestType(item.row.request_type)}
                    </div>
                    <div className="font-mono text-xs text-muted">
                      {dayjs(item.row.created_at).format('D MMM HH:mm')}
                    </div>
                  </div>
                  <div className="font-serif text-lg text-ink mb-1">
                    {item.row.description ?? 'No description'}
                  </div>
                  <div className="flex items-baseline gap-4 mt-2">
                    {item.row.amount ? (
                      <div className="font-mono tabular text-md font-semibold text-num-ink">
                        {formatMoney(Number(item.row.amount))}
                      </div>
                    ) : null}
                    <div className="text-xs text-muted font-sans">
                      Submitted by{' '}
                      <span className="font-serif italic text-graphite">
                        {submitterMap.get(item.row.submitted_by) ?? 'Unknown'}
                      </span>
                    </div>
                  </div>
                </Link>
              )
            )}
          </div>
        )}
      </section>

      {/* ───────── Recent history ───────── */}
      {recent.length > 0 ? (
        <section>
          <div className="sect-head">
            <h2>Recent decisions</h2>
            <span className="rule" aria-hidden />
            <span className="count">LAST {recent.length} RESOLVED</span>
          </div>
          <div className="border-t border-hairline row-stagger">
            {recent.map((req, i) => (
              <div
                key={req.id}
                style={{ '--i': i } as React.CSSProperties}
                className="py-3 border-b border-hairline last:border-0 flex items-baseline justify-between"
              >
                <div>
                  <div className="font-serif text-md text-ink">
                    {req.description ?? 'No description'}
                  </div>
                  <div className="text-xs text-muted font-sans">
                    {formatRequestType(req.request_type)} ·{' '}
                    <em className="font-serif">
                      {req.status === 'approved' ? (
                        <span className="text-ledger">approved</span>
                      ) : (
                        <span className="text-danger">rejected</span>
                      )}
                    </em>{' '}
                    · {req.approved_at ? dayjs(req.approved_at).format('D MMM') : ''}
                  </div>
                </div>
                {req.amount ? (
                  <div className="font-mono tabular text-sm font-medium text-ink">
                    {formatMoney(Number(req.amount))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function formatRequestType(type: string): string {
  const labels: Record<string, string> = {
    new_loan: 'NEW LOAN',
    base_rate: 'BASE RATE',
    tier_change: 'TIER CHANGE',
    escalation: 'ESCALATION',
    new_contract: 'NEW CONTRACT',
    contract_change: 'CONTRACT CHANGE',
    dept_expense: 'DEPT EXPENSE',
    advance: 'ADVANCE',
    invoice_pool_release: 'INVOICE POOL RELEASE',
    profit_withdrawal: 'PROFIT WITHDRAWAL',
    new_fund_source: 'NEW FUND SOURCE',
    payment_voucher: 'PAYMENT VOUCHER',
    hr_costing: 'HR COSTING',
    payroll_run: 'PAYROLL RUN',
    dept_payment_request: 'DEPT REQUEST PAYMENT',
  }
  return labels[type] ?? type.toUpperCase()
}

function approvalHref(row: ApprovalRow): string {
  // payroll_run approvals have their own detail page with 4-OPEX drill-down +
  // fan-out approval that runs through approve_payroll_run RPC. All other
  // types use the generic /approvals/[id] route.
  if (row.request_type === 'payroll_run' && row.reference_id) {
    return `/approvals/payroll-run/${row.reference_id}`
  }
  return `/approvals/${row.id}`
}
