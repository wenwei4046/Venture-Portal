import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import CSVUpload from './_components/CSVUpload'

export default async function ReconciliationPage() {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  // Bank accounts
  const { data: bankAccounts } = await supabase
    .from('bank_accounts')
    .select('id, bank_name, account_number, current_balance, gl_account_code, is_primary')
    .eq('status', 'active')
    .order('is_primary', { ascending: false })

  const banks = bankAccounts ?? []

  // GL balances for bank accounts (from trial_balance view)
  const bankGlCodes = banks.map((b) => b.gl_account_code).filter(Boolean) as string[]
  const { data: glBalances } = bankGlCodes.length > 0
    ? await supabase
        .from('trial_balance')
        .select('account_code, account_name, total_debit, total_credit, balance')
        .in('account_code', bankGlCodes)
    : { data: [] }

  const glMap = new Map(
    (glBalances ?? []).map((g) => [g.account_code, Number(g.balance)])
  )

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · BANK RECONCILIATION
          </div>
          <h1 className="page-title">Bank Reconciliation</h1>
        </div>
        <Link
          href="/reconciliation/journal"
          className="text-sm text-accent hover:text-accent-hover font-serif italic"
        >
          General Ledger →
        </Link>
      </div>

      {/* ── Bank vs GL comparison ── */}
      {banks.length > 0 ? (
        <section className="mb-12">
          <h2 className="font-serif text-2xl text-ink mb-1">Bank vs GL Balance</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Bank</th>
                  <th className="text-left py-3 pr-4 font-medium">Account</th>
                  <th className="text-left py-3 pr-4 font-medium">GL Code</th>
                  <th className="text-right py-3 pr-4 font-medium">Portal Balance</th>
                  <th className="text-right py-3 pr-4 font-medium">GL Balance</th>
                  <th className="text-right py-3 pr-4 font-medium">Variance</th>
                </tr>
              </thead>
              <tbody>
                {banks.map((b) => {
                  const portalBal = Number(b.current_balance)
                  const glBal = glMap.get(b.gl_account_code ?? '') ?? 0
                  const variance = portalBal - glBal
                  return (
                    <tr key={b.id} className="border-b border-hairline last:border-0">
                      <td className="py-4 pr-4 font-serif text-ink">
                        {b.bank_name}
                        {b.is_primary ? (
                          <span className="font-mono text-[9px] uppercase tracking-wider text-accent bg-accent-bg px-1.5 py-0.5 rounded ml-2">
                            Primary
                          </span>
                        ) : null}
                      </td>
                      <td className="py-4 pr-4 font-mono text-xs text-muted">{b.account_number}</td>
                      <td className="py-4 pr-4 font-mono text-xs text-muted">{b.gl_account_code ?? '—'}</td>
                      <td className="py-4 pr-4 text-right font-mono tabular font-medium text-ink">
                        {formatMoney(portalBal)}
                      </td>
                      <td className="py-4 pr-4 text-right font-mono tabular font-medium text-ink">
                        {formatMoney(glBal)}
                      </td>
                      <td className={`py-4 pr-4 text-right font-mono tabular font-medium ${Math.abs(variance) < 0.01 ? 'text-ledger' : 'text-danger'}`}>
                        {Math.abs(variance) < 0.01 ? 'Matched' : formatMoney(variance)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* ── CSV Upload (existing) ── */}
      <section>
        <h2 className="font-serif text-2xl text-ink mb-1">CSV Import</h2>
        <CSVUpload />
      </section>
    </div>
  )
}
