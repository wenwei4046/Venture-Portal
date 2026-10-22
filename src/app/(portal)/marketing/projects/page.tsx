import { requirePage } from '@/lib/auth'
import { projectRows } from '@/lib/marketing/projects'
import { readBoard } from '@/lib/marketing/server'
import ProjectsList from '@/components/mkt/projects/ProjectsList'

export const dynamic = 'force-dynamic'

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')

/** Projects — every project, Quick Task and recurring run (2026-10-23; the handoff leaves the list undrawn). */
export default async function MarketingProjectsPage({ searchParams }: { searchParams: Promise<{ sub?: string | string[]; q?: string | string[] }> }) {
  await requirePage('/marketing/projects')
  const [query, board] = await Promise.all([searchParams, readBoard()])
  const sub = one(query.sub).toUpperCase()
  return (
    <ProjectsList
      key={`${sub}|${one(query.q)}`}
      rows={projectRows(board)}
      subs={board.subs}
      sub={board.subs.some(s => s.code === sub) ? sub : null}
      q={one(query.q).slice(0, 60)}
    />
  )
}
