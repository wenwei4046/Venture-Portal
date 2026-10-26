import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { NOT_SET_UP, loadAiMore, loadCorrections, loadLeadConfig } from '@/lib/leads/server'
import CorrectionsView from '../_components/CorrectionsView'

export const dynamic = 'force-dynamic'

/**
 * Lead View › AI corrections (2026-10-23, redesign v2 step 5; mig 20261023200000): a brand's drafts CS changed before
 * sending. ?b= the brand, ?d= 7 | 30 | 90 | all days (30 by default). Lead View · View reads it; Manage makes fixed answers.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ b?: string; d?: string }> }) {
  await requirePage('/leads/corrections')
  const user = await requirePermission('leads')
  const sp = await searchParams
  const config = await loadLeadConfig()
  if (!config.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="AI corrections" />
        <div className="sheet-danger">{config.reason}</div>
      </HvPage>
    )
  }
  const brands = config.data.brands.map(b => ({ id: b.id, name: b.name }))
  const brandId = brands.find(b => b.id === sp.b)?.id ?? brands[0]?.id ?? ''
  const days = sp.d === 'all' ? null : [7, 30, 90].includes(Number(sp.d)) ? Number(sp.d) : 30
  const [corrections, more] = await Promise.all([loadCorrections(brandId, days), loadAiMore(brandId)])
  if (!corrections.ok && corrections.reason !== NOT_SET_UP) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="AI corrections" />
        <div className="sheet-danger">{corrections.reason}</div>
      </HvPage>
    )
  }
  return (
    <CorrectionsView brands={brands} brandId={brandId} days={days} corrections={corrections.ok ? corrections.data : []}
      more={more.ok ? more.data : null} ready={corrections.ok} canManage={canDo(user, 'leads', 'manage')} />
  )
}
