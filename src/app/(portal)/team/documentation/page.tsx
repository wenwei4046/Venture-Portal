import { requireActionOn, requirePage } from '@/lib/auth'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { canDo } from '@/lib/permission-actions'
import { loadDocumentation } from '@/lib/documentation/server'
import DocumentationView, { type DocTab } from './_components/DocumentationView'

export const dynamic = 'force-dynamic'

const TABS: readonly DocTab[] = ['documents', 'data-center', 'letters', 'publish']

/**
 * People › Documentation (2026-10-11, HR revamp round 2 — README §10): the
 * files HR shares by department, the letters on each person's record, and
 * the memos and letters HR publishes. Documentation · View opens it; Create
 * uploads, files and publishes; Edit deletes and sets the letter types.
 */
export default async function DocumentationPage({ searchParams }: { searchParams: Promise<{ tab?: string; person?: string }> }) {
  await requirePage('/team/documentation')
  const user = await requireActionOn('/team/documentation', 'documentation', 'view')
  const { tab, person } = await searchParams
  const read = await loadDocumentation()
  if (!read.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="People · Documentation" title="Documentation" />
        <div className="sheet-danger">{read.reason}</div>
      </HvPage>
    )
  }
  const initialTab = (TABS as readonly string[]).includes(tab ?? '') ? (tab as DocTab) : 'documents'
  return (
    <DocumentationView
      data={read.data}
      can={{ create: canDo(user, 'documentation', 'create'), edit: canDo(user, 'documentation', 'edit') }}
      initialTab={initialTab}
      initialPerson={person && read.data.people.some(p => p.id === person) ? person : null}
    />
  )
}
