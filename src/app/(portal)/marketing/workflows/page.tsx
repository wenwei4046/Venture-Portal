import { requireActionOn, requirePage } from '@/lib/auth'
import { readBoard, readOptionLists, readWorkflows } from '@/lib/marketing/server'
import { builderPeople } from '@/lib/marketing/tasks'
import WorkflowBuilder from '@/components/mkt/workflows/WorkflowBuilder'

export const dynamic = 'force-dynamic'

/** The Workflow Builder — the stages each kind of work goes through, as templates (2026-10-23, `Workflow Builder.dc.html`). */
export default async function MarketingWorkflowsPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  await requirePage('/marketing/workflows')
  // The manager's: Marketing · Manage.
  await requireActionOn('/marketing/workflows', 'marketing', 'manage')
  const [board, workflows, lists, sp] = await Promise.all([readBoard(), readWorkflows(), readOptionLists(), searchParams])
  const { people, approvers } = builderPeople(board)
  return (
    <WorkflowBuilder
      initial={workflows}
      first={typeof sp.w === 'string' ? sp.w : null}
      people={people}
      approvers={approvers}
      team={board.team.map(p => p.id)}
      lists={lists}
    />
  )
}
