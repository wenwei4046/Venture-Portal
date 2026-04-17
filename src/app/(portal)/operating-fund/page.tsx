import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney, formatMoneyBare } from '@/lib/utils'

const POOL_LABELS: Record<string, string> = {
  hr_opex: 'HR OPEX',
  finance_opex: 'Finance OPEX',
  director_opex: 'Director OPEX',
}

const POOL_ORDER = ['hr_opex', 'finance_opex', 'director_opex'] as const

export default async function OperatingFundPage() {
  const user = await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const [
    { data: transactions },
    { data: allTxns },
    { data: poolBalances },
  ] = await Promise.all([
    supabase
      .from('hv_operating_fund')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('hv_operating_fund')
      .select('transaction_type, amount'),
    supabase
      .from('operating_pool_balance')
      .select('pool_type, balance, txn_count, last_txn_at'),
  ])

  const IN_TYPES = ['saving_in', 'surplus_in', 'profit_in', 'fund_in', 'loan_repayment_in']
  let balance = 0
  for (const t of allTxns ?? []) {
    const amt = Number(t.amount)
    if (IN_TYPES.includes(t.transaction_type)) {
      balance += amt
    } else {
      balance -= amt
    }
  }

  const poolBalanceMap = new Map(
    (poolBalances ?? []).map(p => [p.pool_type, p])
  )

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-serif text-3xl text-ink">Venture Pool</h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          Fund deposits, loan disbursements, director savings, and statutory surplus.
        </p>
      </div>

      {/* Hero balance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7">
          <div className="font-serif italic text-accent text-base mb-1">Current Balance</div>
          <div className={`font-serif text-[44px] md:text-hero leading-none ${balance >= 0 ? 'text-ink' : 'text-danger'}`}>
            {formatMoney(balance)}
          </div>
          <div className="font-mono text-xs text-muted mt-2">
            {(transactions?.length ?? 0)} transactions
          </div>
        </div>
      </div>

      {/* Department Pools (Spec 3) */}
      <section className="mb-12">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="font-serif text-2xl text-ink">Department Pools</h2>
            <p className="font-serif italic text-graphite text-sm mt-1">
              OPEX balance per department. Invoices settled flow in; payroll (Spec 4) flows out.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {POOL_ORDER.map(poolType => {
            const pool = poolBalanceMap.get(poolType)
            const bal = pool ? Number(pool.balance) : 0
            const count = pool?.txn_count ?? 0
            return (
              <div key={poolType} className="border border-hairline rounded-md p-5 bg-surface">
                <div className="font-serif italic text-graphite text-xs uppercase tracking-wide mb-2">
                  {POOL_LABELS[poolType]}
                </div>
                <div className={`font-mono tabular text-2xl ${bal >= 0 ? 'text-ink' : 'text-danger'}`}>
                  {formatMoney(bal)}
                </div>
                <div className="font-sans text-xs text-muted mt-2">
                  {count} {count === 1 ? 'transaction' : 'transactions'}
                  {pool?.last_txn_at && (
                    <span className="ml-2">
                      · last {new Date(pool.last_txn_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

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
                const isIn = IN_TYPES.includes(t.transaction_type)
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
                      {isIn ? '+' : '('}{formatMoneyBare(t.amount)}{isIn ? '' : ')'}
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
