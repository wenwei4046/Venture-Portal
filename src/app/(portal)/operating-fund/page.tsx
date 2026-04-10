import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'

export default async function OperatingFundPage() {
  const user = await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { data: transactions } = await supabase
    .from('hv_operating_fund')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  // Calculate running balance
  const { data: allTxns } = await supabase
    .from('hv_operating_fund')
    .select('transaction_type, amount')

  let balance = 0
  for (const t of allTxns ?? []) {
    const amt = Number(t.amount)
    if (t.transaction_type === 'saving_in' || t.transaction_type === 'surplus_in' || t.transaction_type === 'profit_in') {
      balance += amt
    } else {
      balance -= amt
    }
  }

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-serif text-3xl text-ink">HV Operating Fund</h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          5% director saving + statutory surplus. <em>Free capital for HV operations.</em>
        </p>
      </div>

      {/* Hero balance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7">
          <div className="font-serif italic text-accent text-base mb-1">Current Balance</div>
          <div className={`font-serif text-hero leading-none ${balance >= 0 ? 'text-ink' : 'text-danger'}`}>
            {balance >= 0 ? formatMoney(balance) : `(${formatMoney(Math.abs(balance)).replace('RM ', '')})`}
          </div>
          <div className="font-mono text-xs text-muted mt-2">
            {(transactions?.length ?? 0)} transactions
          </div>
        </div>
      </div>

      {/* Transaction table */}
      {(!transactions || transactions.length === 0) ? (
        <div className="py-16 text-center border border-hairline rounded-md bg-surface">
          <p className="font-serif italic text-graphite text-lg mb-1">
            无交易记录。
          </p>
          <p className="font-serif italic text-muted text-sm">
            Director Salary 确认后，5% saving 会自动入账。
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                <th className="text-left py-3 pr-4 font-medium">Date</th>
                <th className="text-left py-3 pr-4 font-medium">Type</th>
                <th className="text-left py-3 pr-4 font-medium">Description</th>
                <th className="text-right py-3 pr-4 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => {
                const isIn = t.transaction_type === 'saving_in' || t.transaction_type === 'surplus_in' || t.transaction_type === 'profit_in'
                return (
                  <tr key={t.id} className="border-b border-hairline last:border-0 hover:bg-surface-2/40 transition-colors">
                    <td className="py-4 pr-4 font-mono text-xs text-muted">
                      {new Date(t.created_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-4 pr-4">
                      <em className={`font-serif text-sm ${isIn ? 'text-ledger' : 'text-danger'}`}>
                        {t.transaction_type.replace('_', ' ')}
                      </em>
                    </td>
                    <td className="py-4 pr-4 font-sans text-sm text-graphite">{t.description}</td>
                    <td className={`py-4 pr-4 text-right font-mono tabular font-semibold ${isIn ? 'text-ledger' : 'text-danger'}`}>
                      {isIn ? '+' : '('}{formatMoney(t.amount).replace('RM ', '')}{isIn ? '' : ')'}
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
