import { requireActionOn, requirePage } from '@/lib/auth'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { canDo } from '@/lib/permission-actions'
import { loadDocumentation } from '@/lib/documentation/server'
import { loadDrive } from '@/lib/documentation/drive-server'
import { BIN, EMPTY_DRIVE, parsePlace, personAt } from '@/lib/documentation/drive'
import { startRead } from '@/lib/start-read'
import DocumentationView, { type DocTab } from './_components/DocumentationView'

export const dynamic = 'force-dynamic'

const TABS: readonly DocTab[] = ['documents', 'data-center', 'letters', 'publish']

/**
 * People › Documentation (2026-10-11, HR revamp round 2 — README §10): the
 * files HR shares by department, the letters on each person's record, and
 * the memos and letters HR publishes. Documentation · View opens it; Create
 * uploads, files and publishes; Edit deletes and sets the letter types.
 *
 * The Data center is a Drive (2026-10-12): its own folders and files are a
 * second read (`hr_drive()`), started with the first; `?in=` names the place
 * it opens on (`?person=` still opens a person's folder).
 */
export default async function DocumentationPage({ searchParams }: { searchParams: Promise<{ tab?: string; person?: string; in?: string }> }) {
  await requirePage('/team/documentation')
  const user = await requireActionOn('/team/documentation', 'documentation', 'view')
  const docsRead = startRead(loadDocumentation())
  const driveRead = startRead(loadDrive())
  const { tab, person, in: place } = await searchParams
  const read = await docsRead
  if (!read.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="People · Documentation" title="Documentation" />
        <div className="sheet-danger">{read.reason}</div>
      </HvPage>
    )
  }
  const drive = await driveRead
  const initialTab = (TABS as readonly string[]).includes(tab ?? '') ? (tab as DocTab) : 'documents'
  // A place of the tree, or the Bin (`?in=bin`, 2026-10-13).
  const initialAt = place === BIN || parsePlace(place) ? place! : person && read.data.people.some(p => p.id === person) ? personAt(person) : null
  return (
    <DocumentationView
      data={read.data}
      drive={drive.ok ? drive.data : EMPTY_DRIVE}
      driveError={drive.ok ? null : drive.reason}
      can={{ create: canDo(user, 'documentation', 'create'), edit: canDo(user, 'documentation', 'edit') }}
      initialTab={initialTab}
      initialAt={initialAt}
    />
  )
}
