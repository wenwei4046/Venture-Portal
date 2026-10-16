import Link from 'next/link'
import { requirePermission, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatIntlDate, formatMoney } from '@/lib/utils'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import { claimReference, splitClaimQueue } from '@/lib/claim-requests'
import RaiseClaimVoucherForm from './_components/RaiseClaimVoucherForm'
import { readClaimRequests } from './_lib/claim-read'

const day = (iso: string | null) =>
  iso ? formatIntlDate(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' }) : '—'

/**
 * Payments › Claim requests (2026-10-08).
 *
 * A Revenue member's claim is decided once, in People › Member services; when
 * HR chooses to pay it by a payment rather than with the payroll, it waits
 * here for Finance to raise the voucher (user: "Finance 那边会跳出来，然后他们就可以
 * 在那边 create payment voucher，接着直接由 principal approve，然后出钱"). A pool
 * claim whose voucher was voided comes back here too. Once raised, the voucher
 * is the Principal's in Approvals, and the claim turns paid with it.
 */
export default async function ClaimRequestsPage() {
  await requirePage('/payments/claim-requests')
  await requirePermission('treasury')
  const supabase = await createClient()

  // The queue and the banks, as the Finance phone app reads them (`_lib/claim-read`).
  const { rows, banks: bankOptions } = await readClaimRequests(supabase)
  const { toRaise, withPrincipal } = splitClaimQueue(rows)
  const sum = (list: typeof rows) => list.reduce((total, r) => total + r.amount, 0)
  const countOf = (n: number) => `${n} ${n === 1 ? 'claim' : 'claims'}`

  return (
    <div>
      <Link href="/payments" className="text-sm hover:text-accent transition-colors">
        ← Back to Payments
      </Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · CLAIM REQUESTS
          </div>
          <h1 className="page-title">Claim requests</h1>
        </div>
      </div>

      <StatCards label="Claim requests">
        <StatCard
          label="Waiting for a voucher"
          value={formatMoney(sum(toRaise))}
          icon="clock"
          tone="primary"
          note={countOf(toRaise.length)}
        />
        <StatCard
          label="With the Principal"
          value={formatMoney(sum(withPrincipal))}
          icon="check"
          note={countOf(withPrincipal.length)}
          href="/approvals"
        />
      </StatCards>

      <section className="mb-10">
        <div className="sect-head">
          <h2>Waiting for a voucher</h2>
          <span className="rule" aria-hidden />
          <span className="count">{countOf(toRaise.length).toUpperCase()}</span>
        </div>
        {toRaise.length === 0 ? (
          <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
            <p className="text-sm">Nothing waiting. A claim approved for payment appears here.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Claimant</th>
                  <th>Reference</th>
                  <th>Description</th>
                  <th>Approved</th>
                  <th className="num">Amount</th>
                  <th className="text-right">Voucher</th>
                </tr>
              </thead>
              <tbody>
                {toRaise.map(r => (
                  <tr key={r.claimId}>
                    <td>
                      <span className="font-medium">{r.claimantName}</span>
                      {r.department ? <span className="block text-xs">{r.department}</span> : null}
                    </td>
                    <td className="font-mono text-xs whitespace-nowrap">{claimReference(r)}</td>
                    <td>{r.description ?? '—'}</td>
                    <td className="whitespace-nowrap text-xs">
                      {r.approvedByName ?? '—'}
                      <span className="block">{day(r.approvedAt)}</span>
                    </td>
                    <td className="num">{formatMoney(r.amount)}</td>
                    <td className="text-right">
                      <RaiseClaimVoucherForm claimId={r.claimId} claimant={r.claimantName} banks={bankOptions} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Waiting for a voucher</td>
                  <td className="num">{formatMoney(sum(toRaise))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {withPrincipal.length > 0 ? (
        <section className="mb-10">
          <div className="sect-head">
            <h2>With the Principal</h2>
            <span className="rule" aria-hidden />
            <span className="count">{countOf(withPrincipal.length).toUpperCase()}</span>
          </div>
          <div className="table-scroll">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Claimant</th>
                  <th>Reference</th>
                  <th>Voucher</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {withPrincipal.map(r => (
                  <tr key={r.claimId}>
                    <td className="font-medium">{r.claimantName}</td>
                    <td className="font-mono text-xs whitespace-nowrap">{claimReference(r)}</td>
                    <td className="font-mono text-xs">
                      <Link href={`/payments/${r.voucherId}`} className="underline underline-offset-[3px]">
                        {r.voucherNo ?? 'Voucher'}
                      </Link>
                    </td>
                    <td className="num">{formatMoney(r.amount)}</td>
                    <td>
                      <span className="chip alert">
                        <span className="dot" aria-hidden />
                        {r.voucherStatus === 'pending_approval' ? 'Awaiting approval' : (r.voucherStatus ?? '—')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
