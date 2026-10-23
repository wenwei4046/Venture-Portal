import { requireAuth, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { readLibrary } from '@/lib/marketing/server'
import Library from '@/components/mkt/library/Library'

export const dynamic = 'force-dynamic'

/** The Library (⑥-1): each subsidiary's folders and files, by category; the Dustbin. ?co=CAR, ?folder=<id>, ?bin=1,
 * ?cat=Brand, ?q=… say where it opens. */
export default async function MarketingLibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage('/marketing/library')
  const user = await requireAuth()
  const sp = await searchParams
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : null)
  const lib = await readLibrary()
  // Viewing as somebody is read-only: nothing to write.
  const writes = !user.viewingAs
  const can = { edit: writes && canDo(user, 'marketing', 'edit'), manage: writes && canDo(user, 'marketing', 'manage') }
  return <Library initial={lib} can={can} at={{ co: one('co'), folder: one('folder'), bin: one('bin'), cat: one('cat'), q: one('q') }} />
}
