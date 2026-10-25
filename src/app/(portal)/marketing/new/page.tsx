import { mayActOn, requireActionOn, requirePage } from '@/lib/auth'
import { readBoard, readMinutesPicks, readNewDraft, readNewDrafts, readProductPicks, readTask } from '@/lib/marketing/server'
import { newProjectKey, opensFrom } from '@/lib/marketing/task'
import { builderPeople } from '@/lib/marketing/tasks'
import NewProject from '@/components/mkt/newproject/NewProject'

export const dynamic = 'force-dynamic'

/** New Project — a quick task or a recurring one (Marketing · Create), or a 📦 product project (the manager's); the
 * manager adds Marketing's own clients here too (?add=1 opens the form — the sidebar's + Add subsidiary). Opened from
 * another project (?from=<Track ID> — ④-4c, the user's answer 23): it keeps that one as where it came from, for its
 * subsidiary unless another is picked. Kept as a draft while it is typed (mig 20261025211000): the viewer's drafts listed,
 * one opened by ?draft=<id>. A task may be written with meeting minutes (②a-3): the templates published offered. */
export default async function MarketingNewPage({ searchParams }: { searchParams: Promise<{ sub?: string; add?: string; from?: string; draft?: string }> }) {
  await requirePage('/marketing/new')
  await requireActionOn('/marketing/new', 'marketing', 'create')
  const sp = await searchParams
  const [board, manages, source, drafts, draft, minutesPicks] = await Promise.all([
    readBoard(),
    mayActOn('/marketing/new', 'marketing', 'manage'),
    sp.from ? readTask(sp.from) : null,
    readNewDrafts(),
    sp.draft ? readNewDraft(sp.draft) : null,
    // The meeting minutes a task may be written with (②a-3).
    readMinutesPicks(),
  ])
  // The products on sale, for whoever may start a product project.
  const products = manages ? await readProductPicks() : null
  const { people, approvers } = builderPeople(board)
  // Never from a series' pattern — its runs are the work.
  const from = source && opensFrom(source.project)
    ? { id: source.project.id, trackId: source.project.trackId, title: source.project.title, sub: source.project.sub }
    : null
  const firstSub = sp.sub ? board.subs.find(x => x.code === sp.sub?.toUpperCase())?.id ?? null
    : from && board.subs.some(x => x.id === from.sub) ? from.sub : null
  return (
    <NewProject
      key={newProjectKey(from?.id, sp.sub, sp.add)}
      today={board.today}
      me={board.me}
      subs={board.subs}
      people={people}
      approvers={approvers}
      holidays={board.holidays.map(h => h.day)}
      firstSub={firstSub}
      products={products}
      canAddSub={manages}
      addFirst={sp.add === '1'}
      from={from ? { id: from.id, trackId: from.trackId, title: from.title } : null}
      drafts={drafts}
      draft={draft}
      minutesPicks={minutesPicks}
      team={board.team}
    />
  )
}
