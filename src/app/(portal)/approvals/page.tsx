import Link from 'next/link'
import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'

export default async function ApprovalsPage() {
  await requireRole(['principal'])
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

  const pending = pendingRows ?? []
  const recent = recentRows ?? []
  const submitterMap = new Map(
    (submitters ?? []).map((u) => [u.id, u.name])
  )

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-serif text-3xl text-ink">Approvals</h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          Pending decisions that require <em>your hand</em>. Principal only.
        </p>
      </div>

      {/* ───────── Pending queue ───────── */}
      <section className="mb-12">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif text-2xl text-ink">Pending</h2>
          <span className="font-mono text-xs text-muted">
            {pending.length} {pending.length === 1 ? 'item' : 'items'}
          </span>
        </div>

        {pending.length === 0 ? (
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
            {pending.map((req, i) => (
              <Link
                key={req.id}
                href={`/approvals/${req.id}`}
                style={{ '--i': i } as React.CSSProperties}
                className="block border border-hairline rounded-md bg-surface p-5 hover:bg-surface-2/40 transition-colors"
              >
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-xs font-sans font-semibold uppercase tracking-wider text-graphite">
                    {formatRequestType(req.request_type)}
                  </div>
                  <div className="font-mono text-xs text-muted">
                    {dayjs(req.created_at).format('D MMM HH:mm')}
                  </div>
                </div>
                <div className="font-serif text-lg text-ink mb-1">
                  {req.description ?? 'No description'}
                </div>
                <div className="flex items-baseline gap-4 mt-2">
                  {req.amount ? (
                    <div className="font-mono tabular text-md font-medium text-ink">
                      {formatMoney(Number(req.amount))}
                    </div>
                  ) : null}
                  <div className="text-xs text-muted font-sans">
                    Submitted by{' '}
                    <span className="font-serif italic text-graphite">
                      {submitterMap.get(req.submitted_by) ?? 'Unknown'}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ───────── Recent history ───────── */}
      {recent.length > 0 ? (
        <section>
          <h2 className="font-serif text-2xl text-ink mb-1">Recent decisions</h2>
          <p className="font-serif italic text-graphite text-sm mb-4">
            Last 10 resolved requests
          </p>
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
                  <div className="font-mono tabular text-sm font-medium text-graphite">
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
  }
  return labels[type] ?? type.toUpperCase()
}
