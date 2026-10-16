import dayjs from 'dayjs'
import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeTime } from '@/lib/office-time'
import { getPeriodMonth } from '@/lib/utils'
import { opensPage } from '@/lib/page-tabs'
import { primedRegistryRows } from '@/lib/dept-registry'
import { statementDepts } from '@/lib/dept-statements'
import { readPoolAccrual, readPoolCash } from '@/app/(portal)/dept-pool/_lib/pool-read'
import { poolAccrualModel, poolCashModel } from '@/lib/fin-app/dept-pool-model'
import { finAppRows } from '@/lib/fin-app/server'
import { searchOf, type SearchParams } from '@/lib/fin-app/report-page'
import DeptPoolApp from '@/components/fin-app/DeptPoolApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/page/dp` — Department › Dept Pool in the Finance phone app
 * (2026-10-15, part E3): the page's own gates (its tabs, Dept Pool), the very
 * figures the desktop page reads (`readPoolCash` / `readPoolAccrual`, the
 * basis `?basis=accrual` names), the HR costing submissions for whoever opens
 * that page, and each department's own page in the app where the reader's
 * sidebar has it.
 */
export default async function FinAppDeptPool({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/dept-pool')
  const user = await requirePermission('dept_pool')
  const sp = await searchParams
  const supabase = await createClient()
  const rows = new Set(finAppRows(user))
  const depts = statementDepts(primedRegistryRows())
  const slugOf = (name: string) => {
    const d = depts.find((x) => x.label === name)
    return d && rows.has(`dp-${d.slug}`) ? d.slug : null
  }

  if (sp.basis === 'accrual') {
    const period = getPeriodMonth()
    const read = await readPoolAccrual(supabase, user, period)
    return <DeptPoolApp key="accrual" model={poolAccrualModel(read, slugOf, dayjs(period).endOf('month').format('YYYY-MM-DD'))} search={searchOf(sp)} canExecuteHr={false} />
  }
  const read = await readPoolCash(supabase, user)
  return (
    <DeptPoolApp
      key="cash"
      model={poolCashModel(read, slugOf, { seesSubmissions: opensPage(user.tabs, '/dept-pool/submissions'), when: (iso) => officeTime(iso).format('D MMM YYYY · HH:mm') })}
      search={searchOf(sp)}
      canExecuteHr={canDo(user, 'treasury', 'edit')}
    />
  )
}
