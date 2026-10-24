import { notFound } from 'next/navigation'
import { requireAuth, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { readBoard, readProductProject, readTask, readTaskFiles } from '@/lib/marketing/server'
import { builderPeople } from '@/lib/marketing/tasks'
import TaskPage from '@/components/mkt/task/TaskPage'
import ProductProject from '@/components/mkt/project/ProductProject'
import AssignmentPlan from '@/components/mkt/plan/AssignmentPlan'

export const dynamic = 'force-dynamic'

/** A product project's own Track ID (MKT-CAR-2610-007) — its deliverables add -Dnn and are tasks. */
const PRODUCT_TRACK = /^MKT-[A-Z0-9]{2,6}-\d{4}-\d{3}$/i

/** A project — by its id or its Track ID. A 📦 product project (MKT-…) on its own page: its minutes with the PIC, the
 * tracking link, the PIC's answer, its deliverables; a task (a deliverable among them): where it stands, its stages'
 * work, what the viewer may do now, its trail — and, for the manager, a deliverable's Assignment Plan (?plan=1). */
export default async function MarketingProjectPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ plan?: string }>
}) {
  await requirePage('/marketing/projects/[id]')
  const user = await requireAuth()
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const key = decodeURIComponent(id)
  const can = { edit: canDo(user, 'marketing', 'edit'), approve: canDo(user, 'marketing', 'approve'), manage: canDo(user, 'marketing', 'manage') }
  // A Track ID says which; an id is read as a task first, and a product project's read on its own page.
  const page = PRODUCT_TRACK.test(key) ? null : await readTask(key)
  if (page && page.project.kind !== 'product') {
    // A deliverable's Assignment Plan — the manager's; anybody else sees the task.
    if (sp.plan === '1' && can.manage && page.project.kind === 'deliverable' && (page.project.status === 'planning' || page.project.status === 'active')) {
      const { people, approvers } = builderPeople(await readBoard())
      return <AssignmentPlan key={page.project.id} initial={page} people={people} approvers={approvers} />
    }
    // A task's files from the Library (⑥-4) — a series is a pattern, never a task with files. The owner of a stage that
    // splits, working it, is offered the roster to split it to (②b-2c): somebody else with a login, with their plate.
    const cur = page.project.status === 'active' ? page.stages[page.project.cur] : undefined
    const splits = can.edit && !!cur?.split && !!page.me && cur.owner === page.me && (cur.status === 'accepted' || cur.status === 'changes')
    const [files, board] = await Promise.all([
      page.project.kind === 'recurring' && !page.project.series ? [] : readTaskFiles(page.project.id),
      splits ? readBoard() : null,
    ])
    const splitPeople = board
      ? builderPeople(board).people.filter(p => p.id !== page.me && board.team.some(t => t.id === p.id && !!t.user))
      : []
    return <TaskPage key={page.project.id} initial={page} can={can} files={files} splitPeople={splitPeople} />
  }
  const product = await readProductProject(page?.project.id ?? key)
  if (!product) notFound()
  return <ProductProject key={product.project.id} initial={product} can={{ edit: can.edit, manage: can.manage }} />
}
