import dayjs from 'dayjs'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { getPeriodMonth } from '@/lib/utils'
import { DeptPoolAccrualSheet, DeptPoolCashSheet } from './_components/DeptPoolSheet'
import { DEPT_NAME_TO_SLUG, readPoolAccrual, readPoolCash } from './_lib/pool-read'

/**
 * Dept Pool — every department's pool, as Finance's view draws it (2026-10-09, the user's Claude Design handoff):
 * the sheet's cards and tables, Cash or Accrual P&L. The Dept Manager's own-department page (its redirect to the
 * department and the legacy list it kept) went with the kind (2026-10-17 — the user: "全删").
 */
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
  const period = getPeriodMonth()

  if (basis === 'accrual') {
    // Cumulative (to-date) accrual P&L — as the Finance phone app reads it (`_lib/pool-read`). Read-only: no New
    // project contract here.
    const { rows, ventureAccrual } = await readPoolAccrual(supabase, user, period)
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

  // The cash view's reads — as the Finance phone app reads them (`_lib/pool-read`).
  const { visible, balanceMap, inOutByDept, costingByDept, latestHr, ventureCash, perBankBreakdown, totalDeployed } = await readPoolCash(supabase, user)

  return (
    <DeptPoolCashSheet
      monthTitle={dayjs(period).format('MMMM YYYY').toUpperCase()}
      // New project contract asks what its page asks (Billing · Create) since My Billing went (2026-10-17).
      canNewContract={canDo(user, 'billing', 'create')}
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
