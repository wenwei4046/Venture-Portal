'use client'

import InterestLeftNotice from '@/components/treasury/InterestLeftNotice'
import { setFundSourceInterestWaived } from '../../actions'

// A repaid deal's interest left unpaid (2026-11-27): the strip over its schedule, saving through this side's action.
export default function InterestLeft({ dealId, owed, waived, canEdit }: { dealId: string; owed: number; waived: boolean; canEdit: boolean }) {
  return <InterestLeftNotice kind="fund_source" owed={owed} waived={waived} canEdit={canEdit} onSave={(value) => setFundSourceInterestWaived(dealId, value)} />
}
