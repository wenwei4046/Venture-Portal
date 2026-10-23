import { requireAuth, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { calendarEvents } from '@/lib/marketing/calendar'
import { libSchedule, type SchedItem } from '@/lib/marketing/library'
import { readBoard, readLibrary } from '@/lib/marketing/server'
import { startRead } from '@/lib/start-read'
import Library from '@/components/mkt/library/Library'

export const dynamic = 'force-dynamic'

/** The Library (⑥-1): each subsidiary's folders and files, by category; the Dustbin; each subsidiary's brand profile and
 * its next dates (⑥-2). ?co=CAR, ?folder=<id>, ?bin=1, ?cat=Brand, ?q=… say where it opens. */
export default async function MarketingLibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage('/marketing/library')
  const user = await requireAuth()
  // Both reads at once: the Library, and the board its schedules come from (the Calendar's dates).
  const library = startRead(readLibrary())
  const board = startRead(readBoard())
  const sp = await searchParams
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : null)
  const lib = await library
  const b = await board
  const events = calendarEvents(b)
  const schedules: Record<string, SchedItem[]> = Object.fromEntries(lib.subs.map(s => [s.id, libSchedule(events, s.id, b.today)]))
  // Viewing as somebody is read-only: nothing to write.
  const writes = !user.viewingAs
  const can = { edit: writes && canDo(user, 'marketing', 'edit'), manage: writes && canDo(user, 'marketing', 'manage') }
  return <Library initial={lib} schedules={schedules} can={can} at={{ co: one('co'), folder: one('folder'), bin: one('bin'), cat: one('cat'), q: one('q') }} />
}
