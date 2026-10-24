import { requireActionOn, requirePage } from '@/lib/auth'
import { replaceWho } from '@/lib/marketing/replace'
import { readBoard, readReplaceCounts, readReplacePlaces } from '@/lib/marketing/server'
import { builderPeople } from '@/lib/marketing/tasks'
import ReplacePerson from '@/components/mkt/replace/ReplacePerson'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Replace Person (④-5, `Replace Person.dc.html`; the user's answers 24–28): one person for another wherever they stand
 * — the person picked (`?p=`), where they appear, who takes over and why, then what changed. */
export default async function MarketingReplacePage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  await requirePage('/marketing/replace')
  // The manager's: Marketing · Manage.
  await requireActionOn('/marketing/replace', 'marketing', 'manage')
  const sp = await searchParams
  const from = typeof sp.p === 'string' && UUID.test(sp.p) ? sp.p.toLowerCase() : null
  const [board, counts, places] = await Promise.all([readBoard(), readReplaceCounts(), from ? readReplacePlaces(from) : Promise.resolve(null)])
  return (
    <ReplacePerson
      key={from ?? 'pick'}
      who={replaceWho(board.team, counts)}
      places={places}
      takers={builderPeople(board).people}
      names={Object.fromEntries(board.team.map(p => [p.id, p.first || p.full]))}
    />
  )
}
