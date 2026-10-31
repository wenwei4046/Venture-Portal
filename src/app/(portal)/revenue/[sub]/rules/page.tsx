import { requirePermission, requirePage } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { canDo } from '@/lib/permission-actions'
import { PageHead } from '@/components/hrv/kit'
import RulesView from '../../_components/rules/RulesView'
import { loadCommissionSettings, loadRankHolders } from '../../_components/config/load'
import { loadSubDepartmentCapacity } from '../../_lib/capacity'
import { requireSubDepartment } from '../../_lib/sub-departments'
import { loadSwitcherData } from '../../_lib/switcher'
import SubDeptSwitcher from '../../_components/SubDeptSwitcher'

interface PageProps {
  params: Promise<{ sub: string }>
}

/**
 * Every rule the commission engine reads for ONE sub-department, in the HR
 * revamp's side list (2026-10-10): Pay structure (Scheme rules, Title ladder,
 * Ranks, Directors) · Item rules (Item groups, KPI items, Brands & margin
 * bands — each only while the switch that reads it is on) ·
 * Headcount (Capacity, moved here from Member services) · Policy (Promotion
 * criteria). One URL, the section in `?tab=`. The salespeople themselves live
 * on Sales Groups' Members tab.
 *
 * Scoped by the route: the switcher on the head opens the same page for
 * another sub-department, so one sub-department's ladder is never edited
 * while another's name is on screen.
 */
export default async function RevenueRulesPage({ params }: PageProps) {
  await requirePage('/revenue/[sub]/rules')
  const user = await requirePermission('revenue')
  const { sub } = await params
  const subDept = await requireSubDepartment(sub, 'rules')
  // Capacity is the member back office's to read: only for whoever manages
  // member requests, and then with the page, never after it.
  const [data, holders, switcher, capacity] = await Promise.all([
    loadCommissionSettings(subDept.schemeId),
    loadRankHolders(subDept.schemeId),
    loadSwitcherData(user, subDept, 'rules'),
    can(user, 'member_requests_manage') ? loadSubDepartmentCapacity(subDept.id) : Promise.resolve(null),
  ])

  return (
    <RulesView
      data={data}
      subDept={{ id: subDept.id, name: subDept.name, slug: subDept.slug }}
      holders={holders}
      canManage={canDo(user, 'revenue', 'manage')}
      capacity={capacity}
      head={
        <PageHead
          eyebrow={`Revenue · ${subDept.name}`}
          title="Rules"
          right={<SubDeptSwitcher data={switcher} view="rules" />}
        />
      }
    />
  )
}
