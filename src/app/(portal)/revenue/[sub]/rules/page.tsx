import { requirePermission } from '@/lib/auth'
import { PageHead } from '@/components/hrv/kit'
import CommissionSection from '../../_components/config/CommissionSection'
import { loadCommissionSettings } from '../../_components/config/load'
import { requireSubDepartment } from '../../_lib/sub-departments'
import { loadSwitcherData } from '../../_lib/switcher'
import SubDeptSwitcher from '../../_components/SubDeptSwitcher'

interface PageProps {
  params: Promise<{ sub: string }>
}

/**
 * Every rule the commission engine reads for ONE sub-department: its scheme
 * switches, the title ladder, the rank catalogue, and — only while the switch
 * that reads each is on — item groups, Open Bill rates, brands and their
 * margin bands, plus the recorded promotion criteria, the directors' pay and,
 * last, KPI items with their threshold ladder (set here, not on the Product
 * List, since 2026-10-08): up to nine tabs on one URL (`?tab=`). The
 * salespeople themselves live on Sales Groups' Members tab.
 *
 * Scoped by the route: the switcher on the head (2026-10-10, the HR revamp)
 * opens the same page for another sub-department, so one sub-department's
 * ladder is never edited while another's name is on screen.
 */
export default async function RevenueRulesPage({ params }: PageProps) {
  const user = await requirePermission('revenue')
  const { sub } = await params
  const subDept = await requireSubDepartment(sub)
  const [data, switcher] = await Promise.all([loadCommissionSettings(subDept.schemeId), loadSwitcherData(user, subDept)])

  return (
    <CommissionSection
      data={data}
      subDept={subDept}
      head={
        <PageHead
          eyebrow={`Revenue · ${subDept.name}`}
          title="Rules"
          subtitle={`What ${subDept.name} pays, and to whom. Every figure a run produces comes from here.`}
          right={<SubDeptSwitcher data={switcher} view="rules" />}
        />
      }
    />
  )
}
