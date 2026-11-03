import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { NOT_SET_UP, loadLibrary } from '@/lib/leads/server'
import LibraryView from '../_components/LibraryView'

export const dynamic = 'force-dynamic'

/**
 * Lead View › Step library (2026-10-23, redesign v2 step 4; mig 20261023100000). Lead View · View reads it; its Edit box
 * (Lead View · Manage) saves. ?i= opens an item. Before the migration is applied it is empty and cannot save.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ i?: string }> }) {
  await requirePage('/leads/library')
  const user = await requirePermission('leads')
  const { i } = await searchParams
  const library = await loadLibrary()
  if (!library.ok && library.reason !== NOT_SET_UP) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="Step library" />
        <div className="sheet-danger">{library.reason}</div>
      </HvPage>
    )
  }
  return <LibraryView items={library.ok ? library.data : []} ready={library.ok} initialId={i ?? null} canEdit={canDo(user, 'leads', 'manage')} />
}
