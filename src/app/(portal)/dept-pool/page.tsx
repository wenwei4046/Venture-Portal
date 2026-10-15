import Link from 'next/link'
import dayjs from 'dayjs'
import { redirect } from 'next/navigation'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import { BalanceProvider, BalanceToggle, BalanceValue } from './_components/RevealAmount'
import { ownDepartmentOnly } from '@/lib/surfaces'
import { DeptPoolAccrualSheet, DeptPoolCashSheet } from './_components/DeptPoolSheet'
import { DEPT_NAME_TO_SLUG, readPoolAccrual, readPoolCash } from './_lib/pool-read'

export default async function DeptPoolPage({
  searchParams,
}: {
  searchParams: Promise<{ basis?: string }>
}) {
  await requirePage('/dept-pool')
  const user = await requirePermission('dept_pool')
  const supabase = await createClient()

  const { basis: basisParam } = await searchParams
  const basis = basisParam === 'accrual' ? 'accrual' : 'cash'

  // Fast-path: their own department only → its detail page. No reason to
  // show a 1-row list and make them click View.
  if (ownDepartmentOnly(user, 'dept_pool') && user.department_id) {
    const { data: ownDept } = await supabase
      .from('departments')
      .select('name')
      .eq('id', user.department_id)
      .single()
    const slug = ownDept?.name ? DEPT_NAME_TO_SLUG[ownDept.name] : null
    if (slug) redirect(`/dept-pool/${slug === 'marketing' ? 'marketing' : slug}`)
  }

  const period = getPeriodMonth()

  if (basis === 'accrual') {
    // Cumulative (to-date) accrual P&L — as the Finance phone app reads it (`_lib/pool-read`).
    const { visible, rows, ventureAccrual, totalNetMargin } = await readPoolAccrual(supabase, user, period)

    // Finance's view (2026-10-09, the user's Claude Design handoff): whoever
    // reads every department gets the sheet's cards and tables, drawn from the
    // same figures; somebody who reads only their own keeps the page below,
    // as it was. The accrual view stays read-only (no New project contract).
    if (!ownDepartmentOnly(user, 'dept_pool')) {
      return (
        <DeptPoolAccrualSheet
          monthTitle={dayjs(period).format('MMMM YYYY').toUpperCase()}
          asAt={dayjs(period).endOf('month').format('D MMM YYYY')}
          canNewContract={false}
          rows={rows.map(({ dept, a, href }) => ({
            id: dept.id,
            name: dept.name,
            href,
            pnlHref: dept.name === 'Marketing' && href ? `${href}?tab=pnl` : null,
            a,
          }))}
          venture={ventureAccrual}
          canSetDefault={canDo(user, 'treasury', 'create')}
        />
      )
    }

    return (
      <div>
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-10">
          <div>
            <div className="page-eyebrow">
              <em>I.</em> DEPARTMENTS · POOL OVERVIEW
            </div>
            <h1 className="page-title">Department Pools</h1>
          </div>
          {/* Accrual view is read-only — intentionally omits the dept_manager "New project contract" action. */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Cash / Accrual switching lives in the sidebar (Dept Pool > Cash / Accrual P&L). */}
            <Link
              href="/dept-pool/submissions"
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
            >
              HR Past Month Submission
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
          <div className="lg:col-span-7 hero-walnut px-6 py-6 md:px-8 md:py-7">
            <div className="font-serif italic text-accent text-base mb-1">
              Total net margin · P&amp;L (cumulative to-date)
            </div>
            <div className="statement-amount text-ink">
              {formatMoney(totalNetMargin)}
            </div>
            <div className="font-mono text-xs text-muted mt-2">
              {visible.length} department{visible.length === 1 ? '' : 's'}{ventureAccrual ? ' + Venture' : ''} visible · Cumulative to-date · as at{' '}
              {dayjs(period).endOf('month').format('D MMM YYYY')}
            </div>
          </div>
        </div>

        <section className="mb-12">
          <h2 className="font-serif text-xl text-ink mb-1">By department</h2>
          {visible.length === 0 ? (
            <div className="border border-hairline rounded-md bg-surface p-6 text-center">
              <p className="font-serif italic text-muted text-sm">
                No departments visible to your role.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                    <th className="text-left py-3 pr-4 font-medium">Department</th>
                    <th className="text-right py-3 pr-4 font-medium">Revenue (bill)</th>
                    <th className="text-right py-3 pr-4 font-medium">− Cost</th>
                    <th className="text-right py-3 pr-4 font-medium">− Expense</th>
                    <th className="text-right py-3 pr-4 font-medium">− Inter-billing</th>
                    <th className="text-right py-3 pr-4 font-medium">= Net margin</th>
                    <th className="py-3 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ dept, a, href }) => (
                    <tr key={dept.id} className="border-b border-hairline last:border-0">
                      <td className="py-3 pr-4 font-serif text-md text-ink">{dept.name}</td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-ledger">
                        {formatMoney(a.revenue)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                        {a.cost === 0 ? formatMoney(0) : <span className="neg">{formatMoney(-a.cost)}</span>}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                        {a.expense === 0 ? formatMoney(0) : <span className="neg">{formatMoney(-a.expense)}</span>}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                        {a.interBilling === 0 ? formatMoney(0) : <span className="neg">{formatMoney(-a.interBilling)}</span>}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular font-semibold">
                        <span className={a.netMargin >= 0 ? 'text-ink' : 'text-danger'}>
                          {formatMoney(a.netMargin)}
                        </span>
                      </td>
                      <td className="py-3 text-right space-x-4">
                        {href ? (
                          <Link href={href} className="text-sm text-accent hover:text-accent-hover font-serif italic">
                            View
                          </Link>
                        ) : null}
                        {dept.name === 'Marketing' && href ? (
                          <Link href={`${href}?tab=pnl`} className="text-sm text-accent hover:text-accent-hover font-serif italic">
                            P&amp;L
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {ventureAccrual ? (
                    <tr className="border-t-2 border-hairline">
                      <td className="py-3 pr-4 font-serif text-md text-ink">
                        Venture <span className="font-mono text-xs text-muted">(Office)</span>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-ledger">
                        {formatMoney(ventureAccrual.revenue)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                        {ventureAccrual.cost === 0 ? formatMoney(0) : <span className="neg">{formatMoney(-ventureAccrual.cost)}</span>}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                        {ventureAccrual.expense === 0 ? formatMoney(0) : <span className="neg">{formatMoney(-ventureAccrual.expense)}</span>}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                        {ventureAccrual.interBilling === 0 ? formatMoney(0) : <span className="neg">{formatMoney(-ventureAccrual.interBilling)}</span>}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular font-semibold">
                        <span className={ventureAccrual.netMargin >= 0 ? 'text-ink' : 'text-danger'}>
                          {formatMoney(ventureAccrual.netMargin)}
                        </span>
                      </td>
                      <td className="py-3"></td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    )
  }

  // The cash view's reads — as the Finance phone app reads them (`_lib/pool-read`).
  const { visible, balanceMap, inOutByDept, costingByDept, latestHr, ventureCash, perBankBreakdown, totalDeployed } = await readPoolCash(supabase, user)

  // Finance's view (2026-10-09, the handoff) — as the accrual branch above:
  // the same figures as cards, Balance by bank, then By department.
  if (!ownDepartmentOnly(user, 'dept_pool')) {
    return (
      <DeptPoolCashSheet
        monthTitle={dayjs(period).format('MMMM YYYY').toUpperCase()}
        canNewContract={canDo(user, 'my_billing', 'create', 'dept')}
        rows={visible.map((dept) => {
          const io = inOutByDept.get(dept.id) ?? { in_amt: 0, out_amt: 0 }
          const slug = DEPT_NAME_TO_SLUG[dept.name]
          const href = slug ? `/dept-pool/${slug}` : null
          return {
            id: dept.id,
            name: dept.name,
            href,
            pnlHref: dept.name === 'Marketing' && href ? `${href}?tab=pnl` : null,
            balance: balanceMap.get(dept.id) ?? 0,
            inAmt: io.in_amt,
            outAmt: io.out_amt,
            costing: costingByDept.get(dept.id) ?? 0,
            hr: latestHr.get(dept.id) ?? null,
          }
        })}
        canExecuteHr={canDo(user, 'treasury', 'edit')}
        canSetDefault={canDo(user, 'treasury', 'create')}
        venture={ventureCash}
        perBank={perBankBreakdown}
        total={totalDeployed}
      />
    )
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-10">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> DEPARTMENTS · POOL OVERVIEW
          </div>
          <h1 className="page-title">Department Pools</h1>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Cash / Accrual switching lives in the sidebar (Dept Pool > Cash / Accrual P&L). */}
          <Link
            href="/dept-pool/submissions"
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            HR Past Month Submission
          </Link>
          {canDo(user, 'my_billing', 'create', 'dept') ? (
            <Link
              href="/dept-pool/contracts/new"
              className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2.5 rounded-md transition-colors"
            >
              New project contract
            </Link>
          ) : null}
        </div>
      </div>

      {/* ───────── Hero totals ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7 hero-walnut px-6 py-6 md:px-8 md:py-7">
          <div className="font-serif italic text-accent text-base mb-1">
            Total cash available · all departments
          </div>
          <div className="statement-amount text-ink">
            {formatMoney(totalDeployed)}
          </div>
          <div className="font-mono text-xs text-muted mt-2">
            {visible.length} department{visible.length === 1 ? '' : 's'}{ventureCash ? ' + Venture' : ''} visible · Period{' '}
            {dayjs(period).format('MMMM YYYY')}
          </div>
        </div>
      </div>

      {/* ───────── By department ───────── */}
      <section className="mb-12">
        <h2 className="font-serif text-xl text-ink mb-1">By department</h2>

        {visible.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">
              No departments visible to your role.
            </p>
          </div>
        ) : (
          <BalanceProvider>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Department</th>
                  <th className="text-right py-3 pr-4 font-medium"><BalanceToggle label="Balance" /></th>
                  <th className="text-right py-3 pr-4 font-medium">In (to date)</th>
                  <th className="text-right py-3 pr-4 font-medium">Out (to date)</th>
                  <th className="text-right py-3 pr-4 font-medium">Net (to date)</th>
                  <th className="text-right py-3 pr-4 font-medium">HR Costing Submission</th>
                  <th className="py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((dept) => {
                  const balance = balanceMap.get(dept.id) ?? 0
                  const inOut = inOutByDept.get(dept.id) ?? { in_amt: 0, out_amt: 0 }
                  const net = inOut.in_amt - inOut.out_amt
                  // Director (the special director payout pool) has its own
                  // /director-pool view and does not get a generic detail page.
                  const slugByName: Record<string, string> = {
                    Marketing: 'marketing',
                    HR: 'hr',
                    Finance: 'finance',
                    'Director Office': 'director-office',
                  }
                  const slug = slugByName[dept.name]
                  const href = slug ? `/dept-pool/${slug}` : null
                  return (
                    <tr
                      key={dept.id}
                      className="border-b border-hairline last:border-0"
                    >
                      <td className="py-3 pr-4 font-serif text-md text-ink">
                        {dept.name}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink">
                        <BalanceValue text={formatMoney(balance)} />
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-ledger">
                        {formatMoney(inOut.in_amt)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                        {formatMoney(inOut.out_amt)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular font-semibold">
                        <span className={net >= 0 ? 'text-ink' : 'text-danger'}>
                          {formatMoney(net)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                        {formatMoney(costingByDept.get(dept.id) ?? 0)}
                      </td>
                      <td className="py-3 text-right space-x-4">
                        {href ? (
                          <Link
                            href={href}
                            className="text-sm text-accent hover:text-accent-hover font-serif italic"
                          >
                            View
                          </Link>
                        ) : null}
                        {dept.name === 'Marketing' && href ? (
                          <Link
                            href={`${href}?tab=pnl`}
                            className="text-sm text-accent hover:text-accent-hover font-serif italic"
                          >
                            P&amp;L
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
                {ventureCash ? (
                  <tr className="border-t-2 border-hairline">
                    <td className="py-3 pr-4 font-serif text-md text-ink">
                      Venture <span className="font-mono text-xs text-muted">(Office)</span>
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink">
                      <BalanceValue text={formatMoney(ventureCash.balance)} />
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular text-ledger">
                      {formatMoney(ventureCash.in_amt)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                      {formatMoney(ventureCash.out_amt)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular font-semibold">
                      <span className={ventureCash.in_amt - ventureCash.out_amt >= 0 ? 'text-ink' : 'text-danger'}>
                        {formatMoney(ventureCash.in_amt - ventureCash.out_amt)}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                      {formatMoney(0)}
                    </td>
                    <td className="py-3"></td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          </BalanceProvider>
        )}
      </section>

      {perBankBreakdown ? (
        <section className="mb-12">
          <h2 className="font-serif text-xl text-ink mb-4">Per-bank breakdown</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Department</th>
                  {perBankBreakdown.banks.map((b) => (
                    <th key={b.code} className="text-right py-3 pr-4 font-medium">
                      {b.name} <span className="font-mono text-muted">({b.code})</span>
                    </th>
                  ))}
                  <th className="text-right py-3 pr-4 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {perBankBreakdown.rows.map((r) => (
                  <tr key={r.segment} className="border-b border-hairline last:border-0">
                    <td className="py-3 pr-4 font-serif text-md text-ink">{r.label}</td>
                    {perBankBreakdown!.banks.map((b) => {
                      const v = r.perBank[b.code] ?? 0
                      return (
                        <td
                          key={b.code}
                          className={`py-3 pr-4 text-right font-mono tabular ${v < 0 ? 'text-danger' : 'text-ink'}`}
                        >
                          {v === 0 ? '—' : formatMoney(v)}
                        </td>
                      )
                    })}
                    <td className={`py-3 pr-4 text-right font-mono tabular font-semibold ${r.total < 0 ? 'text-danger' : 'text-ink'}`}>
                      {formatMoney(r.total)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-hairline">
                  <td className="py-3 pr-4 font-serif text-md text-ink font-semibold">Bank balance</td>
                  {perBankBreakdown.banks.map((b) => (
                    <td key={b.code} className="py-3 pr-4 text-right font-mono tabular font-semibold text-ink">
                      {formatMoney(perBankBreakdown!.totals.perBank[b.code] ?? 0)}
                    </td>
                  ))}
                  <td className="py-3 pr-4 text-right font-mono tabular font-semibold text-num-ink">
                    {formatMoney(perBankBreakdown.totals.grand)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
