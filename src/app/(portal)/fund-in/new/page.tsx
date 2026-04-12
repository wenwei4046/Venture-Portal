import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Company, Director } from '@/types'
import NewFundSourceForm from '../_components/NewFundSourceForm'

export default async function NewFundInPage() {
  await requireRole(['finance'])
  const supabase = await createClient()

  const [{ data: companyRows }, { data: directorRows }, { data: deptRows }] = await Promise.all([
    supabase
      .from('companies')
      .select('*')
      .eq('is_active', true)
      .order('short_code'),
    supabase.from('directors').select('*').eq('status', 'active').order('code'),
    supabase.from('departments').select('id, name').order('name'),
  ])

  const companies = (companyRows ?? []) as Company[]
  const directors = (directorRows ?? []) as Director[]
  const departments = (deptRows ?? []) as { id: string; name: string }[]

  return (
    <div>
      <div className="mb-10">
        <Link
          href="/fund-in"
          className="text-sm text-muted hover:text-accent font-sans transition-colors"
        >
          ← Back to Fund IN
        </Link>
        <h1 className="font-serif text-3xl text-ink mt-3">New fund source</h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          Record a new capital source — <em>subsidiary loan</em>,{' '}
          <em>director loan</em>, or <em>department pool transfer</em>.
          Interest rate is mandatory (enter 0 if interest-free). Rate locks at creation.
        </p>
      </div>

      <NewFundSourceForm companies={companies} directors={directors} departments={departments} />
    </div>
  )
}
