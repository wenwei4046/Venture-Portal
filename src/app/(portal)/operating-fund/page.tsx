import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney, formatMoneyBare } from '@/lib/utils'

export default async function OperatingFundPage() {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const [
    { data: transactions },
    { data: allTxns },
  ] = await Promise.all([
    supabase
      .from('venture_pool')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('venture_pool')
      .select('transaction_type, amount'),
  ])

  const IN_TYPES = ['fund_in', 'loan_repayment_in', 'profit_in']
  let balance = 0
  for (const t of allTxns ?? []) {
    const amt = Number(t.amount)
    if (IN_TYPES.includes(t.transaction_type)) {
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
            <em>I.</em> TREASURY · VENTURE POOL
          </div>
          <h1 className="page-title">Venture Pool</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            Fund deposits, loan disbursements, director savings, and statutory surplus.
          </p>
        </div>
      </div>

      {/* Hero balance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7">
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide mb-2">Current Balance</div>
          <div className={`font-serif text-[44px] md:text-hero leading-none tabular tracking-[-0.01em] ${balance >= 0 ? 'text-num-ink' : 'text-danger'}`}>
            {formatMoney(balance)}
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
        <>
          <div className="sect-head">
            <h2>Recent transactions</h2>
            <span className="rule" aria-hidden />
            <span className="count">{transactions.length} ENTR{transactions.length === 1 ? 'Y' : 'IES'} · LATEST 100</span>
          </div>
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th className="right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => {
                  const isIn = IN_TYPES.includes(t.transaction_type)
                  return (
                    <tr key={t.id}>
                      <td>
                        <div className="font-mono text-xs text-muted">
                          {new Date(t.created_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </td>
                      <td>
                        <em className={`font-serif text-sm ${isIn ? 'text-ledger' : 'text-danger'}`}>
                          {t.transaction_type.replace('_', ' ')}
                        </em>
                      </td>
                      <td>
                        <div className="font-sans text-sm text-graphite">{t.description}</div>
                      </td>
                      <td className={`num font-semibold ${isIn ? 'text-ledger' : 'neg'}`}>
                        {isIn ? '+' : '('}{formatMoneyBare(t.amount)}{isIn ? '' : ')'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
