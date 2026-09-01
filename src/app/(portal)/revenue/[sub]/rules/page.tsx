import { requireRole } from '@/lib/auth'
import CommissionSection from '../../_components/config/CommissionSection'
import { loadCommissionSettings } from '../../_components/config/load'
import { requireSubDepartment } from '../../_lib/sub-departments'

interface PageProps {
  params: Promise<{ sub: string }>
}

/**
 * Every rule the commission engine reads for ONE sub-department: its scheme
 * switches, the tier ladder, item groups, KPI items and thresholds, Open Bill
 * rates, brands and their margin bands, the recorded promotion criteria, and
 * the salespeople with their upline, rank, rate mode and tax tick.
 *
 * Scoped by the route rather than by an in-page picker (2026-09-01): the
 * sidebar already asks which sub-department you are working on, and a second
 * answer to the same question on the page is how Fair's ladder gets edited
 * while IR is the one on screen.
 */
export default async function RevenueRulesPage({ params }: PageProps) {
  await requireRole(['principal', 'hr'])
  const { sub } = await params
  const subDept = await requireSubDepartment(sub)
  const data = await loadCommissionSettings(subDept.schemeId)

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REVENUE · {subDept.name.toUpperCase()}
          </div>
          <h1 className="page-title">Rules</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            What {subDept.name} pays, and to whom. <em>Every figure a run produces comes from
            here.</em>
          </p>
        </div>
      </div>

      <CommissionSection data={data} subDept={subDept} />
    </div>
  )
}
