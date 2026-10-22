import { requireActionOn, requirePage } from '@/lib/auth'
import { readBoard } from '@/lib/marketing/server'
import { builderPeople } from '@/lib/marketing/tasks'
import NewProject from '@/components/mkt/newproject/NewProject'

export const dynamic = 'force-dynamic'

/** New Project — a quick task or a recurring one (product projects come with the builders). Marketing · Create. */
export default async function MarketingNewPage({ searchParams }: { searchParams: Promise<{ sub?: string }> }) {
  await requirePage('/marketing/new')
  await requireActionOn('/marketing/new', 'marketing', 'create')
  const [board, sp] = await Promise.all([readBoard(), searchParams])
  const { people, approvers } = builderPeople(board)
  const firstSub = sp.sub ? board.subs.find(x => x.code === sp.sub?.toUpperCase())?.id ?? null : null
  return (
    <NewProject
      today={board.today}
      me={board.me}
      subs={board.subs}
      people={people}
      approvers={approvers}
      holidays={board.holidays.map(h => h.day)}
      firstSub={firstSub}
    />
  )
}
