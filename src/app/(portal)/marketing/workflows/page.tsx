import { requireActionOn, requirePage } from '@/lib/auth'
import { readBoard, readOptionLists, readWorkflows } from '@/lib/marketing/server'
import { builderPeople } from '@/lib/marketing/tasks'
import { wfPeople } from '@/lib/marketing/workflows'
import WorkflowBuilder from '@/components/mkt/workflows/WorkflowBuilder'

export const dynamic = 'force-dynamic'

/** The Workflow Builder 2a — the stages each kind of work goes through, as templates under their categories
 * (2026-11-13, `docs/design_handoff_workflow_builder/`). */
export default async function MarketingWorkflowsPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  await requirePage('/marketing/workflows')
  // The manager's: Marketing · Manage.
  await requireActionOn('/marketing/workflows', 'marketing', 'manage')
  const [board, book, lists, sp] = await Promise.all([readBoard(), readWorkflows(), readOptionLists(), searchParams])
  // Marketing's roster with each one's load now — the shortlists' chips, the approvers (MM / AMM and a Director), the names.
  const { people } = builderPeople(board)
  return (
    <WorkflowBuilder
      initial={book}
      first={typeof sp.w === 'string' ? sp.w : null}
      people={wfPeople(people)}
      team={board.team.map(p => p.id)}
      lists={lists}
    />
  )
}
