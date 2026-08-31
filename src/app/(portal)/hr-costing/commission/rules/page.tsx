import { requireRole } from '@/lib/auth'
import CommissionTabs from '../_components/CommissionTabs'
import CommissionSection from '../_components/config/CommissionSection'
import { loadCommissionSettings } from '../_components/config/load'

/**
 * Every rule the commission engine reads: the sub-department and its scheme
 * switches, the tier ladder, item groups, KPI items and thresholds, Open Bill
 * rates, brands and their margin bands, the recorded promotion criteria, and
 * the salespeople with their upline, rank, rate mode and tax tick.
 *
 * Moved out of Settings (user 2026-08-31). It was the only Settings tab HR
 * could open, and the Settings sidebar group is principal + finance — so the
 * page that configures HR's own payroll had no link HR could follow. It sits
 * with the months it governs now.
 */
export default async function CommissionRulesPage() {
  const user = await requireRole(['principal', 'hr'])
  const data = await loadCommissionSettings()

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> HR · COMMISSION · RULES
          </div>
          <h1 className="page-title">Commission rules</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            What each sub-department pays, and to whom. <em>Every figure a run
            produces comes from here.</em>
          </p>
        </div>
      </div>

      <CommissionTabs active="rules" canSeeProducts={user.role === 'principal'} />

      <CommissionSection data={data} />
    </div>
  )
}
