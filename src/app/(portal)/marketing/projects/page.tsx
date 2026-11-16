import { requireAuth, requirePage } from '@/lib/auth'
import { projectRows } from '@/lib/marketing/projects'
import { readBoard } from '@/lib/marketing/server'
import { canDo } from '@/lib/permission-actions'
import ProjectsList from '@/components/mkt/projects/ProjectsList'

export const dynamic = 'force-dynamic'

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')

/** Projects — a Drive of every project, Quick Task and recurring run (2026-11-17; docs/design_handoff_workflow_projects/):
 * subsidiaries, their product projects, their tasks; the path in `?sub=` / `?p=`, a search in `?q=` (the top bar's). */
export default async function MarketingProjectsPage({ searchParams }: {
  searchParams: Promise<{ sub?: string | string[]; p?: string | string[]; q?: string | string[] }>
}) {
  await requirePage('/marketing/projects')
  const user = await requireAuth()
  const [query, board] = await Promise.all([searchParams, readBoard()])
  return (
    <ProjectsList
      rows={projectRows(board)}
      subs={board.subs}
      sub={one(query.sub).toUpperCase() || null}
      project={one(query.p) || null}
      q={one(query.q).slice(0, 60)}
      canDelete={!user.viewingAs && canDo(user, 'marketing', 'manage')}
    />
  )
}
