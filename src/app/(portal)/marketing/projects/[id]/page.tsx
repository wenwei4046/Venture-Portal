import { notFound } from 'next/navigation'
import { requireAuth, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { readProductProject, readTask, readTaskFiles } from '@/lib/marketing/server'
import TaskPage from '@/components/mkt/task/TaskPage'
import ProductProject from '@/components/mkt/project/ProductProject'

export const dynamic = 'force-dynamic'

/** A project — by its id or its Track ID. A 📦 product project (MKT-…) on its own page: its minutes with the PIC, the
 * tracking link, the PIC's answer; a task: where it stands, its stages' work, what the viewer may do now, its trail. */
export default async function MarketingProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('/marketing/projects/[id]')
  const user = await requireAuth()
  const { id } = await params
  const key = decodeURIComponent(id)
  const can = { edit: canDo(user, 'marketing', 'edit'), approve: canDo(user, 'marketing', 'approve'), manage: canDo(user, 'marketing', 'manage') }
  // A Track ID says which; an id is read as a task first, and a product project's read on its own page.
  const page = /^MKT-/i.test(key) ? null : await readTask(key)
  // A task's files from the Library (⑥-4) — a series is a pattern, never a task with files.
  if (page && page.project.kind !== 'product') {
    const files = page.project.kind === 'recurring' && !page.project.series ? [] : await readTaskFiles(page.project.id)
    return <TaskPage key={page.project.id} initial={page} can={can} files={files} />
  }
  const product = await readProductProject(page?.project.id ?? key)
  if (!product) notFound()
  return <ProductProject key={product.project.id} initial={product} can={{ edit: can.edit, manage: can.manage }} />
}
