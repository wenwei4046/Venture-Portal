import { requirePermission } from '@/lib/auth'
import CommissionSection from '../../_components/config/CommissionSection'
import { loadCommissionSettings } from '../../_components/config/load'
import { requireSubDepartment } from '../../_lib/sub-departments'

interface PageProps {
  params: Promise<{ sub: string }>
}

/**
 * Every rule the commission engine reads for ONE sub-department: its scheme
 * switches, the title ladder, item groups, KPI items and thresholds, Open Bill
 * rates, brands and their margin bands, and the recorded promotion criteria —
 * eight tabs on one URL (`?tab=`). The salespeople themselves live on Staff
 * Hierarchy's Team tab since 2026-09-05.
 *
 * Scoped by the route rather than by an in-page picker (2026-09-01): the
 * sidebar already asks which sub-department you are working on, and a second
 * answer to the same question on the page is how Fair's ladder gets edited
 * while IR is the one on screen.
 */
export default async function RevenueRulesPage({ params }: PageProps) {
  await requirePermission('revenue')
  const { sub } = await params
  const subDept = await requireSubDepartment(sub)
  const data = await loadCommissionSettings(subDept.schemeId)

  return <CommissionSection data={data} subDept={subDept} />
}
