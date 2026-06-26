import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import PendingApprovals from './_components/PendingApprovals'

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

  // Serialize for the client component that owns multi-select + bulk approve.
  // Groups stay one-card-one-action (CombinedApprovalCard); ungrouped singles
  // become individually checkbox-selectable rows.
  const serializedItems = items.map((item) =>
    item.kind === 'group'
      ? {
          kind: 'group' as const,
          groupId: item.groupId,
          items: item.items.map((r) => ({
            request_type: r.request_type,
            description: r.description,
            amount: r.amount === null ? null : Number(r.amount),
            reference_id: r.reference_id,
            reference_table: r.reference_table,
          })),
          submitterName:
            submitterMap.get(item.items[0].submitted_by) ?? 'Unknown',
          createdAt: item.createdAt,
          isSelfSubmitted: item.items.some((r) => r.submitted_by === user.id),
        }
      : {
          kind: 'single' as const,
          id: item.row.id,
          requestType: item.row.request_type,
          typeLabel: formatRequestType(item.row.request_type),
          description: item.row.description,
          amount: item.row.amount === null ? null : Number(item.row.amount),
          createdAt: item.row.created_at,
          submitterName:
            submitterMap.get(item.row.submitted_by) ?? 'Unknown',
          isSelf: item.row.submitted_by === user.id,
          href: approvalHref(item.row),
        }
  )

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> APPROVALS · PRINCIPAL QUEUE
          </div>
          <h1 className="page-title">Approvals</h1>
        </div>
      </div>

      {/* ───────── Pending queue (multi-select + bulk approve) ───────── */}
      <PendingApprovals items={serializedItems} />

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
    dept_payment_request: 'DEPT REQUEST PAYMENT',
    loan_cancel: 'LOAN CANCEL',
  }
  return labels[type] ?? type.toUpperCase()
}

function approvalHref(row: ApprovalRow): string {
  // Every type that enters this generic queue uses /approvals/[id]. payroll_run
  // no longer lands here (submit creates the run already-approved; disbursement
  // files payment_voucher rows instead) — so the old payroll_run special-case
  // is gone. The /approvals/payroll-run/[id] page + approve_payroll_run RPC
  // still exist as a read-only drill-down linked from the dashboard + voucher
  // upstream-href; they are intentionally kept, not retired.
  return `/approvals/${row.id}`
}
