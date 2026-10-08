import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import dayjs from 'dayjs'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import NewClaimForm from './_components/NewClaimForm'
import ClaimActions from './_components/ClaimActions'

// A status is a word on a wash (DESIGN.md › "Sheet theme"): amber waits on
// an approver, green is approved, red was refused, grey is paid and closed.
const STATUS_CHIP: Record<string, string> = {
  pending: 'chip alert',
  approved: 'chip ledger',
  rejected: 'chip danger',
  paid: 'chip info',
}

/**
 * Claims — POOL claims (2026-10-08).
 *
 * A Revenue member's claim (Outstation / Airbnb / plane ticket) is decided once,
 * in People › Member services, and paid with their payroll or by a voucher
 * Finance raises — so the Benefit tab that sent HR here for a second approval
 * is gone (user: "一个一个就好了，不要那么多个，很麻烦"). Other departments'
 * benefit claims move to Member services when they come.
 */
export default async function ClaimsPage() {
  const user = await requirePermission('claims')
  const supabase = await createClient()

  const [{ data: claims }, { count: total }] = await Promise.all([
    supabase
      .from('claims')
      .select('*')
      .eq('claim_type', 'project')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('claims').select('id', { count: 'exact', head: true }).eq('claim_type', 'project'),
  ])

  // The summary cards are read off the claims already on the page — the
  // latest 50 — and say so when there are more than that.
  const shown = claims ?? []
  const byStatus = (status: string) => {
    const rows = shown.filter(c => c.status === status)
    return { count: rows.length, amount: rows.reduce((sum, c) => sum + Number(c.amount), 0) }
  }
  const pending = byStatus('pending')
  const approved = byStatus('approved')
  const paid = byStatus('paid')
  const poolTotal = total ?? 0
  const countOf = (n: number) => `${n} ${n === 1 ? 'claim' : 'claims'}`

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> CLAIMS · POOL
          </div>
          <h1 className="page-title">Claims</h1>
          <p className="text-sm mt-3 max-w-2xl">
            Spending charged to a pool, approved by Finance. A Revenue member&apos;s
            own claim is decided in{' '}
            <Link
              href="/member-admin"
              className="underline underline-offset-[3px] decoration-ink/35 hover:decoration-ink"
            >
              People › Member services
            </Link>
            .
          </p>
        </div>
        <NewClaimForm />
      </div>

      {/* Claims table */}
      {(!claims || claims.length === 0) ? (
        <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
          <p className="text-md font-bold mb-1">
            大家都很自律。
          </p>
          <p className="text-sm">
            No pool claims pending.
          </p>
        </div>
      ) : (
        <>
          <StatCards
            label="Pool claims by status"
            note={shown.length < poolTotal ? `Latest ${shown.length} of ${poolTotal} pool claims` : undefined}
          >
            <StatCard label="Awaiting approval" value={formatMoney(pending.amount)} icon="clock" tone="primary" note={countOf(pending.count)} />
            <StatCard label="Approved, to pay" value={formatMoney(approved.amount)} icon="check" note={countOf(approved.count)} />
            <StatCard label="Paid" value={formatMoney(paid.amount)} icon="wallet" note={countOf(paid.count)} />
          </StatCards>

          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Claimant</th>
                  <th>Description</th>
                  <th className="right">Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th className="right"></th>
                </tr>
              </thead>
              <tbody>
                {claims.map(c => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.claimant_name}</td>
                    <td>{c.description ?? '—'}</td>
                    <td className="num">{formatMoney(c.amount)}</td>
                    <td>
                      <span className={STATUS_CHIP[c.status] ?? 'chip'}>
                        <span className="dot" />
                        {c.status}
                      </span>
                    </td>
                    <td className="font-mono text-xs">
                      {dayjs(c.created_at).format('D MMM YYYY')}
                    </td>
                    <td className="right">
                      {(c.status === 'pending' || c.status === 'approved') && (
                        <ClaimActions
                          claimId={c.id}
                          claimStatus={c.status}
                          userRole={user.role}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
