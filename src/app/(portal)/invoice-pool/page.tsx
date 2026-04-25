import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import RequestReleaseButton from './_components/RequestReleaseButton'

export default async function InvoicePoolPage() {
  const user = await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { data: transactions } = await supabase
    .from('invoice_payout_pool')
    .select('*, directors(code, name)')
    .order('created_at', { ascending: false })
    .limit(100)

  // Calculate balance
  const { data: allTxns } = await supabase
    .from('invoice_payout_pool')
    .select('transaction_type, amount')

  let balance = 0
  for (const t of allTxns ?? []) {
    const amt = Number(t.amount)
    if (t.transaction_type === 'accumulate') {
      balance += amt
    } else {
      balance -= amt
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> DIRECTOR · INVOICE POOL
          </div>
          <h1 className="page-title">Invoice Payout Pool</h1>
        </div>
      </div>

      {/* Hero balance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7">
          <div className="font-serif italic text-accent text-base mb-1">Pool Balance</div>
          <div className="font-serif text-[44px] md:text-hero text-num-ink leading-none tabular tracking-[-0.01em]">
            {formatMoney(balance)}
          </div>
          <div className="font-mono text-[11.5px] text-graphite mt-3 tracking-[0.02em] font-medium">
            {(transactions?.length ?? 0)} TRANSACTIONS · NOT USED FOR LENDING
          </div>
        </div>
        <div className="lg:col-span-5 flex items-start justify-end">
          <RequestReleaseButton userRole={user.role} balance={balance} />
        </div>
      </div>

      {/* Transaction table */}
      {(!transactions || transactions.length === 0) ? (
        <div className="py-16 text-center border border-hairline rounded-md bg-surface">
          <p className="font-serif italic text-graphite text-lg mb-1">
            无累积。
          </p>
          <p className="font-serif italic text-muted text-sm">
            Director Salary 确认后，25% invoice 会自动累积。
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                <th className="text-left py-3 pr-4 font-medium">Date</th>
                <th className="text-left py-3 pr-4 font-medium">Type</th>
                <th className="text-left py-3 pr-4 font-medium">Director</th>
                <th className="text-left py-3 pr-4 font-medium">Description</th>
                <th className="text-right py-3 pr-4 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => {
                const isIn = t.transaction_type === 'accumulate'
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const dir = (t as any).directors
                return (
                  <tr key={t.id} className="border-b border-hairline last:border-0 hover:bg-surface-2/40 transition-colors">
                    <td className="py-4 pr-4 font-mono text-xs text-muted">
                      {new Date(t.created_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-4 pr-4">
                      <em className={`font-serif text-sm ${isIn ? 'text-ledger' : 'text-alert'}`}>
                        {t.transaction_type}
                      </em>
                    </td>
                    <td className="py-4 pr-4 font-serif text-md text-ink">{dir?.code ?? '—'}</td>
                    <td className="py-4 pr-4 font-sans text-sm text-graphite">{t.description}</td>
                    <td className={`py-4 pr-4 text-right font-mono tabular font-semibold ${isIn ? 'text-ledger' : 'text-danger'}`}>
                      {isIn ? '+' : '-'}{formatMoneyBare(t.amount)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
