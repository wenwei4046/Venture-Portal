import Link from 'next/link'
import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import GenerateDeptPvForm from './_components/GenerateDeptPvForm'

export default async function DeptRequestsPage() {
  await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  const [{ data: requests }, { data: banks }] = await Promise.all([
    supabase
      .from('dept_payment_requests')
      .select(
        `id, amount, payee_name, description, status, requested_at, pv_id, department_id,
         departments (name),
         users:requested_by (name),
         payment_vouchers:pv_id (voucher_no, status)`,
      )
      .in('status', ['pending_finance_pv', 'pending_principal_pv'])
      .order('requested_at', { ascending: false }),
    supabase
      .from('bank_accounts')
      .select('id, bank_name, current_balance')
      .eq('status', 'active')
      .order('is_primary', { ascending: false }),
  ])

  const bankOptions = (banks ?? []).map((b) => ({
    id: b.id,
    bank_name: b.bank_name,
    current_balance: Number(b.current_balance ?? 0),
  }))

  const pendingFinance = (requests ?? []).filter((r) => r.status === 'pending_finance_pv')
  const pendingPrincipal = (requests ?? []).filter((r) => r.status === 'pending_principal_pv')

  return (
    <div>
      <div className="mb-8">
        <Link href="/payments" className="text-sm text-muted hover:text-accent font-sans transition-colors">
          ← Back to Payments
        </Link>
        <h1 className="font-serif text-3xl text-ink mt-3">Dept Payment Requests</h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          Department managers requesting vendor payment from their pool. Approved by Principal,
          ready for you to generate a PV.
        </p>
      </div>

      {/* ── Awaiting Finance ────────────────────────────────────────────── */}
      <section className="mb-12">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif text-2xl text-ink">Awaiting your action</h2>
          <span className="font-mono text-xs text-muted">
            {pendingFinance.length} {pendingFinance.length === 1 ? 'request' : 'requests'}
          </span>
        </div>
        {pendingFinance.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-8 text-center">
            <p className="font-serif italic text-ledger text-base">All caught up.</p>
            <p className="font-mono text-xs text-muted mt-1">
              No pending dept payment requests.
            </p>
          </div>
        ) : (
          <div className="border border-hairline rounded-md bg-surface divide-y divide-hairline">
            {pendingFinance.map((r) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const dept = (r.departments as any)?.name ?? '—'
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const submitter = (r.users as any)?.name ?? '—'
              return (
                <div key={r.id} className="px-5 py-5">
                  <div className="flex items-baseline justify-between mb-3 gap-4">
                    <div>
                      <div className="font-serif text-lg text-ink">
                        {dept} → {r.payee_name}
                      </div>
                      <div className="font-serif italic text-graphite text-sm mt-0.5">
                        {r.description}
                      </div>
                      <div className="font-mono text-xs text-muted mt-0.5">
                        Requested by {submitter} · {dayjs(r.requested_at).format('D MMM HH:mm')}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono tabular font-semibold text-ink text-lg">
                        {formatMoney(Number(r.amount))}
                      </div>
                      <div className="font-mono text-xs text-muted mt-0.5">
                        Pool already debited
                      </div>
                    </div>
                  </div>
                  <GenerateDeptPvForm requestId={r.id} banks={bankOptions} />
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Awaiting Principal PV ───────────────────────────────────────── */}
      {pendingPrincipal.length > 0 ? (
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-serif text-2xl text-ink">Awaiting Principal</h2>
            <span className="font-mono text-xs text-muted">
              {pendingPrincipal.length} {pendingPrincipal.length === 1 ? 'request' : 'requests'}
            </span>
          </div>
          <div className="border border-hairline rounded-md bg-surface divide-y divide-hairline">
            {pendingPrincipal.map((r) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const dept = (r.departments as any)?.name ?? '—'
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const pv = (r.payment_vouchers as any) ?? null
              return (
                <div key={r.id} className="flex items-baseline justify-between px-5 py-4 gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-serif text-md text-ink truncate">
                      {dept} → {r.payee_name}
                      {' · '}
                      <span className="font-mono text-xs text-muted">
                        {pv?.voucher_no ?? 'PV pending'}
                      </span>
                    </div>
                    <div className="font-serif italic text-graphite text-sm truncate">
                      {r.description} — awaiting Principal PV approval
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono tabular font-medium text-ink text-sm">
                      {formatMoney(Number(r.amount))}
                    </div>
                    {r.pv_id ? (
                      <Link
                        href={`/payments/${r.pv_id}`}
                        className="font-serif italic text-xs text-accent hover:text-accent-hover"
                      >
                        View voucher →
                      </Link>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}
    </div>
  )
}
