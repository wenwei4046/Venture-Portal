import { notFound } from 'next/navigation'
import { requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { readTask } from '@/lib/marketing/server'
import TaskPage from '@/components/mkt/task/TaskPage'

export const dynamic = 'force-dynamic'

/** A task — by its id or its Track ID: where it stands, its stages' work, what the viewer may do now, its trail. */
export default async function MarketingProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage('/marketing/projects/[id]')
  const { id } = await params
  const page = await readTask(decodeURIComponent(id))
  if (!page) notFound()
  const can = { edit: canDo(user, 'marketing', 'edit'), approve: canDo(user, 'marketing', 'approve'), manage: canDo(user, 'marketing', 'manage') }
  return <TaskPage key={page.project.id} initial={page} can={can} />
}
