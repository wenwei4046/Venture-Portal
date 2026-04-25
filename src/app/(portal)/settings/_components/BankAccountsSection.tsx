'use client'

import { formatMoney } from '@/lib/utils'

interface BankAccount {
  id: string
  bank_name: string
  account_number: string
  account_holder: string
  account_type: string
  is_primary: boolean
  current_balance: number
  opening_balance: number
  gl_account_code: string | null
  status: string
  notes: string | null
}

interface Props {
  accounts: BankAccount[]
}

export default function BankAccountsSection({ accounts }: Props) {
  return (
    <section>
      <h2 className="font-serif text-2xl text-ink mb-1">Bank Accounts</h2>

      {accounts.length === 0 ? (
        <div className="border border-hairline rounded-md bg-surface p-8 text-center">
          <p className="font-serif italic text-muted text-sm">
            No bank accounts configured. Run <code>node scripts/seed-bank-accounts.mjs</code> to seed.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="border border-hairline rounded-md bg-surface p-6"
            >
              <div className="flex items-baseline justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-serif text-lg text-ink">{acc.bank_name}</h3>
                    {acc.is_primary ? (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-accent bg-accent-bg px-2 py-0.5 rounded">
                        Primary
                      </span>
                    ) : null}
                  </div>
                  <p className="font-mono text-xs text-muted mt-0.5">
                    {acc.account_number} · {acc.account_holder}
                  </p>
                </div>
                <span className={`status-morph font-serif italic text-sm ${acc.status === 'active' ? 'text-ledger' : 'text-muted'}`}>
                  {acc.status}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="font-mono text-xs text-muted uppercase tracking-wide mb-1">Current balance</div>
                  <div className="font-mono tabular font-medium text-ink">
                    {formatMoney(Number(acc.current_balance))}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-xs text-muted uppercase tracking-wide mb-1">Opening balance</div>
                  <div className="font-mono tabular font-medium text-graphite">
                    {formatMoney(Number(acc.opening_balance))}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-xs text-muted uppercase tracking-wide mb-1">Account type</div>
                  <div className="font-serif italic text-graphite">{acc.account_type}</div>
                </div>
                <div>
                  <div className="font-mono text-xs text-muted uppercase tracking-wide mb-1">GL code</div>
                  <div className="font-mono text-graphite">{acc.gl_account_code ?? '—'}</div>
                </div>
              </div>

              {acc.notes ? (
                <p className="font-serif italic text-muted text-xs mt-3">{acc.notes}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
