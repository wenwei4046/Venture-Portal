import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { NOT_SET_UP, loadDataFiles, loadDataFolders, loadLeadConfig, loadQuickReplies } from '@/lib/leads/server'
import DataCenterView from '../_components/DataCenterView'

export const dynamic = 'force-dynamic'

/**
 * Lead View › Data Center (2026-10-16 text cards; files and links since 2026-10-23, redesign v2 step 5 — mig
 * 20261023200000; Quick replies, mig 20261023300000; v2 2026-11-02 — folders, web links' checks, versions, mig 20261102140000). Lead View · View reads it; Manage uploads and edits. Before a migration
 * its part is empty and cannot add.
 */
export default async function Page() {
  await requirePage('/leads/knowledge')
  const user = await requirePermission('leads')
  const [config, files, folders, quick] = await Promise.all([loadLeadConfig(), loadDataFiles(), loadDataFolders(), loadQuickReplies()])
  if (!config.ok || (!files.ok && files.reason !== NOT_SET_UP)) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="Data Center" />
        <div className="sheet-danger">{!config.ok ? config.reason : !files.ok ? files.reason : null}</div>
      </HvPage>
    )
  }
  return (
    <DataCenterView files={files.ok ? files.data : []} ready={files.ok} folders={folders.ok ? folders.data : []} foldersReady={folders.ok} quick={quick.ok ? quick.data : []} quickReady={quick.ok} today={config.data.today}
      brands={config.data.brands.map(b => ({ id: b.id, name: b.name }))} canManage={canDo(user, 'leads', 'manage')} />
  )
}
