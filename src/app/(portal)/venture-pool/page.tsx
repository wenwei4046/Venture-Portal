import dayjs from 'dayjs'
import { requirePermission, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import { canDo } from '@/lib/permission-actions'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import InOutCharts from './_components/InOutCharts'
import PoolLedgerTable from './_components/PoolLedgerTable'
import { readVenturePool } from './_lib/venture-read'
import { PoolSearchProvider } from './_components/PoolSearch'

// Post 2026-05-26 re-import: Venture Pool data is derived from journal_lines
// where segment IN ('corporate', 'treasury') on HV bank accounts, NOT the
// legacy venture_pool table. Matches /dept-pool's Venture row + dashboard
// hv_fund_balance (mig 273). Treasury inclusion captures fund_source /
// loan / repayment activity (HV central treasury operations); corporate
// captures generic HV expenses + historical OFFICE-tagged manual_jv.

export default async function VenturePoolPage() {
  await requirePage('/venture-pool')
  const user = await requirePermission('venture_pool')
  const supabase = await createClient()

  const period = getPeriodMonth()
  // The pool's lines, balance, month and trend — as the Finance phone app reads them (`_lib/venture-read`).
  const { balance, monthIn, monthOut, netChange, trend, lines } = await readVenturePool(supabase, period)

  // On the sheet (2026-10-09, the user's Claude Design handoff): Export in
  // the head, four cards, the search toolbar (2026-10-10), In vs Out (the
  // month's pie, twelve months of bars), then the pool ledger it searches.
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> DEPARTMENTS · VENTURE POOL · {dayjs(period).format('MMMM YYYY').toUpperCase()}
          </div>
          <h1 className="page-title">Venture Pool</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* The whole ledger as a spreadsheet, oldest first with the running balance. */}
          <a href="/venture-pool/export" className="btn-quiet-sheet" download>
            Export
          </a>
        </div>
      </div>

      <StatCards label="Venture Pool">
        <StatCard label="In this month" value={formatMoney(monthIn)} icon="inbox" tone="ledger" note="Cash in: debits on HL/Alliance" />
        <StatCard label="Out this month" value={formatMoney(-monthOut)} icon="send" tone="danger" note="Cash out: credits on HL/Alliance" />
        <StatCard label="Net change" value={formatMoney(netChange)} icon="swap" tone={netChange >= 0 ? 'ledger' : 'danger'} note="This month" />
        <StatCard
          label="Running balance"
          value={formatMoney(balance)}
          icon="bank"
          tone={balance < 0 ? 'danger' : 'primary'}
          note="All-time, see ledger below"
        />
      </StatCards>

      <PoolSearchProvider>
        <section className="mb-10">
          <div className="sect-head">
            <h2>In vs Out</h2>
            <span className="rule" aria-hidden />
            <span className="count">THIS MONTH · 12 MONTHS</span>
          </div>
          <InOutCharts monthIn={monthIn} monthOut={monthOut} trend={trend} />
        </section>

        <section className="mb-6">
          <div className="sect-head">
            <h2>Pool ledger</h2>
            <span className="rule" aria-hidden />
            <span className="count">{lines.length} ENTRIES</span>
          </div>
          {lines.length === 0 ? (
            <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
              <p className="text-sm">No movements yet.</p>
            </div>
          ) : (
            <PoolLedgerTable lines={lines} canSetDefault={canDo(user, 'treasury', 'create')} />
          )}
        </section>
      </PoolSearchProvider>
    </div>
  )
}
